import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { caminhoResultado, guardarEAssinar } from "@/lib/armazenamento";
import { contaDe, marcaEfetiva } from "@/lib/cobranca";
import { areaTotal, limparPlanta } from "@/lib/planta";
import { plantaParaSvg } from "@/lib/planta-svg";
import { textoSvg } from "@/lib/texto-svg";

// Planta baixa: recebe os cômodos em METROS, desenha o mesmo SVG que a tela mostra e
// guarda como PNG. Não gasta crédito -- é desenho, não IA (a Pedra também cobra zero
// por "desenhar do zero"; ela só cobra 1 crédito quando a IA lê um esboço).
//
// Vira um job tipo "planta", então entra no histórico, na galeria do imóvel e no link
// compartilhado como qualquer outra imagem, e o espec fica em `parametros` pra poder
// reabrir e editar depois.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const { planta, erro } = limparPlanta(corpo?.planta);
  if (erro || !planta) return NextResponse.json({ error: erro ?? "Planta inválida." }, { status: 400 });

  let imovelId: string | null = null;
  if (typeof corpo?.imovelId === "string" && corpo.imovelId) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", corpo.imovelId).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
  }

  const conta = await contaDe(db, userId);
  const marca = await marcaEfetiva(db, userId);
  const autor = [marca.nome, marca.creci ? `CRECI ${marca.creci}` : null].filter(Boolean).join(" · ");

  // o texto vai como CONTORNO: no servidor não existe fonte pra um <text> usar
  const { svg } = plantaParaSvg(planta, {
    texto: textoSvg,
    escala: 70,
    grade: false,
    autor: autor || undefined,
    rodape: "Planta ilustrativa · medidas aproximadas",
  });
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(svg)).png().toBuffer();
  } catch (e) {
    return NextResponse.json({ error: `Não consegui desenhar: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const reaproveitar = typeof corpo?.jobId === "string" ? corpo.jobId : null;
  let jobId = reaproveitar;
  if (reaproveitar) {
    const { data: existente } = await db.from("jobs").select("id").eq("id", reaproveitar).eq("user_id", userId).eq("tipo", "planta").maybeSingle();
    if (!existente) jobId = null;
  }
  if (!jobId) {
    const { data: job, error: erroInsert } = await db
      .from("jobs")
      .insert({
        user_id: userId,
        org_id: conta.tipo === "org" ? conta.id : null,
        property_id: imovelId,
        tipo: "planta",
        status: "concluido",
        parametros: planta as unknown as Record<string, unknown>,
        creditos_cobrados: 0,
        selo: "Planta ilustrativa · medidas aproximadas",
      })
      .select("id")
      .single();
    if (erroInsert || !job) return NextResponse.json({ error: erroInsert?.message ?? "Erro guardando." }, { status: 500 });
    jobId = job.id;
  } else {
    await db.from("jobs").update({ parametros: planta as unknown as Record<string, unknown>, property_id: imovelId }).eq("id", jobId).eq("user_id", userId);
  }

  const caminho = caminhoResultado(userId, jobId!);
  const url = await guardarEAssinar(db, caminho, png, "image/png");
  await db.from("jobs").update({ output_path: caminho }).eq("id", jobId!);
  if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);

  return NextResponse.json({ jobId, url, areaTotal: Number(areaTotal(planta).toFixed(2)), comodos: planta.comodos.length });
}
