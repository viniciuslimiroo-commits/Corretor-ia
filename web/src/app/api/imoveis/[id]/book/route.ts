import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { marcaEfetiva } from "@/lib/cobranca";
import { ACOES_POR_ID, resumirParametros } from "@/lib/acoes";
import { montarBook, type FotoBook } from "@/lib/book-pdf";

// Book do imóvel em PDF: capa com a foto principal, as fotos duas por página, e a última
// com contato e QR do link público.
//
// NÃO gasta crédito, pelo mesmo motivo da planta e do terreno: é composição, não IA.
// Cobrar por diagramar o que a pessoa já pagou pra gerar seria cobrar duas vezes.
//
// Aproveita o que já existe: as fotos prontas do imóvel, a marca efetiva (a da pessoa
// completada pela da equipe) e o share_token do imóvel pro QR.

export const maxDuration = 120;

const LIMITE_FOTOS = 24;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: imovel } = await db
    .from("properties")
    .select("id, titulo, endereco, share_token, capa_job_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  // Preço e descrição vêm da TELA, não do banco: properties ainda não tem essas colunas,
  // e na prática o texto muda por cliente. Guardar no imóvel fica pra uma migração depois.
  const preco = (req.nextUrl.searchParams.get("preco") ?? "").trim().slice(0, 40);
  const descricao = (req.nextUrl.searchParams.get("descricao") ?? "").replace(/\s+/g, " ").trim().slice(0, 600);

  const { data: jobs } = await db
    .from("jobs")
    .select("id, tipo, parametros, output_path, criado_em")
    .eq("property_id", id)
    .eq("user_id", userId)
    .eq("status", "concluido")
    .not("output_path", "is", null)
    .order("criado_em", { ascending: true })
    .limit(LIMITE_FOTOS);

  const lista = jobs ?? [];
  if (lista.length === 0) {
    return NextResponse.json({ error: "Este imóvel ainda não tem fotos prontas pra montar o book." }, { status: 404 });
  }

  // A capa escolhida na galeria vai pra frente; sem ela, a primeira foto.
  const ordenadas = [...lista].sort((a, b) => (a.id === imovel.capa_job_id ? -1 : b.id === imovel.capa_job_id ? 1 : 0));

  const fotos: FotoBook[] = [];
  for (const j of ordenadas) {
    const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(j.output_path!);
    if (!arq) continue;
    const def = ACOES_POR_ID[j.tipo];
    const detalhe = def ? resumirParametros(def, (j.parametros ?? {}) as Record<string, string>) : "";
    fotos.push({
      bytes: Buffer.from(await arq.arrayBuffer()),
      legenda: [def?.rotulo, detalhe].filter(Boolean).join(" · ") || undefined,
    });
  }
  if (fotos.length === 0) return NextResponse.json({ error: "Não consegui ler as fotos deste imóvel." }, { status: 500 });

  const marca = await marcaEfetiva(db, userId);
  let logo: Buffer | null = null;
  if (marca.logo_path) {
    const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(marca.logo_path);
    if (arq) logo = Buffer.from(await arq.arrayBuffer());
  }

  const base = req.nextUrl.origin;
  let pdf: Buffer;
  try {
    pdf = await montarBook({
      titulo: imovel.titulo ?? "Imóvel",
      endereco: imovel.endereco ?? undefined,
      preco: preco || undefined,
      descricao: descricao || undefined,
      fotos,
      autor: { nome: marca.nome ?? undefined, creci: marca.creci ?? undefined, whatsapp: marca.whatsapp ?? undefined, logo, cor: marca.cor_marca ?? undefined },
      link: imovel.share_token ? `${base}/c/${imovel.share_token}` : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui montar o book: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const nome = (imovel.titulo ?? "imovel")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="book-${nome || "imovel"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
