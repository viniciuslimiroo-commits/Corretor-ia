import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { caminhoEntrada, caminhoOriginal, guardarEAssinar } from "@/lib/armazenamento";
import { contaDe, creditar, debitar } from "@/lib/cobranca";
import { corpoRequisicao, despachar } from "@/lib/fal";
import { ACAO_TERRENO_POR_ID, EXTRAS_CASA, LIMITE_TEXTO_LIVRE, type Referencia } from "@/lib/terreno-ia";
import { ETAPA_OBRA_POR_ID } from "@/lib/obra-etapas";
import { limparFaixaDoSelo } from "@/lib/selo";

// Terreno com IA: limpar o mato, terraplanar, murar, construir a casa que a pessoa quer,
// ou pedir por texto. Uma imagem de IA, 1 crédito -- as linhas e medidas do lote continuam
// de graça, porque aquilo é desenho exato e isto é ilustração.
//
// A foto de referência (uma casa parecida com a que a pessoa quer) entra como SEGUNDA
// imagem do nano-banana, que é o mesmo caminho do "usar os móveis daquela foto". O prompt
// diz pra usar só como referência de arquitetura: copiar o entorno da referência traria
// junto o terreno errado.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "Serviço de imagem não configurado." }, { status: 500 });

  const form = await req.formData();
  const foto = form.get("foto") as File | null;
  if (!foto) return NextResponse.json({ error: "Envie a foto do terreno." }, { status: 400 });

  // As etapas da obra entram pela mesma porta das outras ações: cada uma é uma imagem de
  // IA, 1 crédito, um job. O que as diferencia é de onde vem a FOTO -- na obra, a foto é
  // o resultado da etapa anterior, e quem encadeia é a tela.
  const idAcao = String(form.get("acao") ?? "");
  const acao = ACAO_TERRENO_POR_ID[idAcao] ?? ETAPA_OBRA_POR_ID[idAcao];
  if (!acao) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  const texto = String(form.get("texto") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, LIMITE_TEXTO_LIVRE);
  if (acao.id === "livre" && texto.length < 3) {
    return NextResponse.json({ error: "Escreva o que você quer ver no terreno." }, { status: 400 });
  }

  const extras = String(form.get("extras") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => EXTRAS_CASA.some((e) => e.valor === v))
    .join(",");

  // "1" ou nada: o prompt da etapa decide se a equipe cabe, e a etapa final ignora isto
  // de propósito (casa pronta com gente é morador inventado, não obra).
  const parametros: Record<string, string> = { texto, extras, equipe: form.get("equipe") === "1" ? "1" : "" };
  for (const campo of acao.campos ?? []) {
    const v = String(form.get(campo.chave) ?? "");
    parametros[campo.chave] = campo.opcoes.some((o) => o.valor === v) ? v : campo.padrao;
  }

  let imovelId: string | null = null;
  const imovelBruto = String(form.get("imovelId") ?? "");
  if (imovelBruto) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", imovelBruto).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
  }

  const referencia = acao.aceitaReferencia ? (form.get("referencia") as File | null) : null;
  // o que a segunda imagem é muda o prompt: casa parecida (copia o jeitão) x planta (constrói aquela casa)
  const tipoReferencia: Referencia = String(form.get("tipoReferencia") ?? "") === "planta" ? "planta" : "casa";

  let bytesFoto: Buffer;
  try {
    // .rotate() queima o EXIF no pixel: a IA não lê orientação, e sem isso a foto do
    // celular chega deitada.
    bytesFoto = await sharp(Buffer.from(await foto.arrayBuffer()))
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    // Da SEGUNDA etapa em diante, a foto que chega é o resultado da anterior, e resultado
    // sai carimbado. Sem limpar a faixa, o modelo redesenha o aviso e o app carimba outro
    // por cima -- aconteceu em duas rodadas de teste. A saída desta etapa é carimbada
    // normalmente; o que some é só a cópia que entra no modelo.
    //
    // Na PRIMEIRA não: ali a entrada é a foto da pessoa, que não tem selo nenhum. Limpar
    // assim mesmo deixou uma faixa espelhada no rodapé que o modelo leu como texto e
    // devolveu em rabisco ilegível. Limpeza sem sujeira pra limpar é só estrago.
    const etapaObra = ETAPA_OBRA_POR_ID[idAcao];
    if (etapaObra && etapaObra.ordem > 1) bytesFoto = await limparFaixaDoSelo(bytesFoto);
  } catch {
    return NextResponse.json({ error: "Não consegui ler essa imagem." }, { status: 400 });
  }

  const conta = await contaDe(db, userId);
  const orgId = conta.tipo === "org" ? conta.id : null;

  const { data: job, error: erroJob } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      org_id: orgId,
      property_id: imovelId,
      tipo: `terreno_${acao.id}`,
      status: "gerando",
      parametros: { acao: acao.id, ...parametros },
      selo: acao.selo,
    })
    .select("id")
    .single();
  if (erroJob || !job) return NextResponse.json({ error: `Erro criando job: ${erroJob?.message}` }, { status: 500 });

  let saldo: number | null;
  try {
    saldo = await debitar(db, conta, userId, 1, "consumo", job.id);
  } catch (e) {
    return NextResponse.json({ error: `Erro debitando crédito: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (saldo === null) {
    await db.from("jobs").update({ status: "sem_credito" }).eq("id", job.id);
    return NextResponse.json({ error: conta.tipo === "org" ? "A equipe está sem créditos." : "Sem créditos." }, { status: 402 });
  }

  const entradas: string[] = [];
  try {
    const caminhoOrig = caminhoOriginal(userId, job.id);
    const urlFoto = await guardarEAssinar(db, caminhoOrig, bytesFoto, "image/jpeg");

    let urlReferencia: string | undefined;
    if (referencia && referencia.size > 0) {
      const bytesRef = await sharp(Buffer.from(await referencia.arrayBuffer()))
        .rotate()
        .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      const caminhoRef = caminhoEntrada(userId, job.id, "referencia");
      entradas.push(caminhoRef);
      urlReferencia = await guardarEAssinar(db, caminhoRef, bytesRef, "image/jpeg");
    }

    const modelo = "fal-ai/nano-banana/edit" as const;
    const prompt = acao.prompt(parametros, urlReferencia ? tipoReferencia : "nenhuma");
    const despacho = await despachar(modelo, corpoRequisicao(modelo, { prompt, imagemUrl: urlFoto, referenciaUrl: urlReferencia }), falKey);

    await db
      .from("jobs")
      .update({
        input_path: caminhoOrig,
        pipeline: {
          etapa: "geracao",
          modelo,
          provedores: [modelo],
          // sem fallback: o outro modelo não aceita segunda imagem nem respeita a perspectiva
          tentouFallback: true,
          semUpscale: true,
          statusUrl: despacho.status_url,
          responseUrl: despacho.response_url,
          entradas,
          urlFoto,
          urlMascara: null,
          urlReferencia: urlReferencia ?? null,
          prompt,
          saldoAntes: saldo + 1,
        },
      })
      .eq("id", job.id);

    if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);
    return NextResponse.json({ jobId: job.id, status: "gerando", creditosRestantes: saldo });
  } catch (e) {
    await creditar(db, conta, userId, 1, "estorno_erro", job.id).catch(() => null);
    await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado." }, { status: 500 });
  }
}
