import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { caminhoEntrada, guardarEAssinar } from "@/lib/armazenamento";
import { contaDe } from "@/lib/cobranca";
import { chamarSincrono } from "@/lib/fal";
import { SISTEMA_LEITURA, avisoDaLeitura, limparLeitura, plantaDaLeitura, quantasMedidasLidas } from "@/lib/planta-lida";

// LER UMA PLANTA PRONTA e devolver o rascunho editável.
//
// Pedido do dono (21/09/2026): além de desenhar, mandar o arquivo da planta e ganhar o
// rascunho. Regras e limites em `lib/planta-lida.ts`, puros e testados no Node.
//
// NÃO é modelo de imagem: é o de VISÃO, o mesmo que o avaliador já usa
// (`fal-ai/any-llm/vision` + gemini flash lite, centavos por chamada). Modelo de imagem
// repinta a planta e erra os números -- é o caminho do "humanizar", e ali o resultado é
// ilustração. Aqui o resultado é GEOMETRIA, e por isso precisa de quem lê, não de quem pinta.
//
// NÃO COBRA CRÉDITO, pela mesma razão que desenhar não cobra: não sai imagem de IA daqui,
// sai um rascunho que a pessoa ainda vai conferir e corrigir. O custo real é de centavos e
// fica no job, com `creditos_cobrados: 0`, pra dar pra medir depois se virar peso.

export const maxDuration = 60;
export const TIPO = "planta_lida";

/** Teto de leituras por dia por conta: a chamada é barata, mas não é de graça. */
const POR_DIA = 30;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "Serviço de leitura não configurado." }, { status: 500 });

  const form = await req.formData();
  const arquivo = form.get("planta") as File | null;
  if (!arquivo) return NextResponse.json({ error: "Envie a imagem da planta." }, { status: 400 });
  if (/pdf/i.test(arquivo.type) || /\.pdf$/i.test(arquivo.name)) {
    return NextResponse.json({ error: "PDF ainda não: exporte a página como JPG ou PNG (ou tire um print) e mande a imagem." }, { status: 400 });
  }

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("tipo", TIPO).gte("criado_em", desde);
  if ((count ?? 0) >= POR_DIA) {
    return NextResponse.json({ error: `Você já leu ${POR_DIA} plantas nas últimas 24 horas. Tente de novo amanhã.` }, { status: 429 });
  }

  let bytes: Buffer;
  try {
    // Planta é desenho de linha fina: 2000px do lado maior mantém a cota legível pro modelo
    // sem mandar um arquivo gigante. `.rotate()` queima o EXIF -- foto de planta vem torta.
    bytes = await sharp(Buffer.from(await arquivo.arrayBuffer()))
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Não consegui ler essa imagem." }, { status: 400 });
  }

  const conta = await contaDe(db, userId);
  const { data: job, error: erroJob } = await db
    .from("jobs")
    .insert({ user_id: userId, org_id: conta.tipo === "org" ? conta.id : null, tipo: TIPO, status: "gerando", parametros: {}, creditos_cobrados: 0 })
    .select("id")
    .single();
  if (erroJob || !job) return NextResponse.json({ error: `Erro criando job: ${erroJob?.message}` }, { status: 500 });

  try {
    const url = await guardarEAssinar(db, caminhoEntrada(userId, job.id, "foto"), bytes, "image/jpeg");
    const saida = (await chamarSincrono(
      "fal-ai/any-llm/vision",
      {
        // MEDIDO, não escolhido (docs/experimento-ler-planta.md).
        //
        // O `flash-lite` é o que o avaliador usa e seria a escolha óbvia por custo. Contra um
        // gabarito conhecido ele errou feio: trocou largura por altura de um cômodo e leu
        // 3,40 onde estava 3,00 -- e as duas falhas saem parecendo número certo, que é a
        // classe de erro que vira medida errada no anúncio.
        //
        // O `flash` acertou 5 de 5 cômodos e 5 de 5 cotas, com 0% de erro, em três rodadas e
        // nas três qualidades de imagem (PNG limpo, print de 20KB e foto torta sem
        // contraste). Custa mais por leitura e continua sendo centavos.
        model: "google/gemini-2.5-flash",
        system_prompt: SISTEMA_LEITURA,
        prompt: "Read this floor plan and return the JSON described in the system prompt.",
        image_urls: [url],
        temperature: 0,
        max_tokens: 2000,
      },
      falKey,
      50_000
    )) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(String(saida.error));

    const texto = (saida.output ?? "").trim();
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error(`o modelo não devolveu JSON: ${texto.slice(0, 120)}`);

    const leitura = limparLeitura(JSON.parse(json));
    const planta = plantaDaLeitura(leitura, "");
    await db
      .from("jobs")
      .update({ status: "concluido", parametros: { comodos: leitura.comodos.length, com_cota: quantasMedidasLidas(leitura), tem_cotas: leitura.tem_cotas } })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      planta,
      // A tela precisa dos dois: o que mostrar e o quanto duvidar.
      aviso: avisoDaLeitura(leitura),
      temCotas: leitura.tem_cotas,
      comCota: quantasMedidasLidas(leitura),
      comodos: leitura.comodos.length,
      escala: leitura.escala,
    });
  } catch (e) {
    await db.from("jobs").update({ status: "falhou", erro: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq("id", job.id);
    return NextResponse.json({ error: `Não consegui ler a planta (${e instanceof Error ? e.message.slice(0, 120) : "erro"}). Tente uma imagem mais nítida.` }, { status: 502 });
  }
}
