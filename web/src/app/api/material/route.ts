import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota, origemDoApp } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { marcaEfetiva } from "@/lib/cobranca";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";
import { MODELOS_POR_ID } from "@/lib/materiais";
import { montarMaterial, type BlocoMaterial, type FotoMaterial } from "@/lib/material-pdf";

// Monta o material escolhido na Biblioteca e devolve o PDF.
//
// NÃO gasta crédito: é diagramação, não IA. Mesmo critério da planta e do terreno.
//
// Não confia em nada do que chega: cada jobId é conferido contra o dono antes de virar
// página, e todo texto é aparado. O PDF sai do servidor porque as fotos moram num
// bucket privado -- o navegador não tem como lê-las sem uma URL assinada por foto.

export const maxDuration = 300;

/** Baixa em levas: 36 arquivos um a um passa do tempo da função. */
async function emLevas<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

// Caractere de controle vira espaço: a Helvetica do PDF não sabe desenhar e o pdf-lib
// joga erro no meio da montagem, o que viraria "não consegui montar" sem dizer por quê.
// Escrito por código de caractere, não por regex, pra não deixar byte de controle solto
// no meio do fonte -- ele desaparece em qualquer ferramenta que passe por aqui depois.
function semControle(t: string, mantendoQuebra: boolean) {
  let saida = "";
  for (const c of t) {
    const n = c.codePointAt(0) ?? 0;
    if (n === 10) saida += mantendoQuebra ? "\n" : " ";
    else if (n < 32 || n === 127) saida += " ";
    else saida += c;
  }
  return saida;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? semControle(v, false).trim().slice(0, max) : "");

/** A descrição pode ter quebra de linha (na de investidores, cada linha vira um card). */
const textoLongo = (v: unknown, max: number) => (typeof v === "string" ? semControle(v, true).trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const def = MODELOS_POR_ID[texto(corpo?.modelo, 20)];
  if (!def) return NextResponse.json({ error: "Modelo de material desconhecido." }, { status: 400 });

  const blocosBrutos: { imovelId?: unknown; titulo?: unknown; subtitulo?: unknown; preco?: unknown; jobIds?: unknown }[] = Array.isArray(corpo?.blocos)
    ? corpo.blocos.slice(0, 24)
    : [];
  const pedidos = blocosBrutos.map((b) => ({
    imovelId: typeof b.imovelId === "string" ? b.imovelId : null,
    titulo: texto(b.titulo, 80),
    subtitulo: texto(b.subtitulo, 120),
    preco: texto(b.preco, 40),
    jobIds: (Array.isArray(b.jobIds) ? b.jobIds : []).filter((x): x is string => typeof x === "string").slice(0, def.maxFotos),
  }));

  // Corta no limite do modelo contando o TOTAL, não por bloco: um catálogo de 12 imóveis
  // com 3 fotos cada já é um PDF de 40 páginas.
  let restam = def.maxFotos;
  for (const p of pedidos) {
    p.jobIds = p.jobIds.slice(0, Math.max(0, restam));
    restam -= p.jobIds.length;
  }
  const todosIds = pedidos.flatMap((p) => p.jobIds);
  if (todosIds.length === 0) return NextResponse.json({ error: "Escolha ao menos uma imagem." }, { status: 400 });

  const { data: jobs, error } = await db
    .from("jobs")
    .select("id, tipo, parametros, output_path")
    .eq("user_id", userId)
    .eq("status", "concluido")
    .in("id", todosIds);
  if (error) return NextResponse.json({ error: `Erro lendo as imagens: ${error.message}` }, { status: 500 });

  const porId = new Map((jobs ?? []).filter((j) => j.output_path).map((j) => [j.id, j]));
  if (porId.size === 0) return NextResponse.json({ error: "Não achei nenhuma dessas imagens na sua conta." }, { status: 404 });

  // Baixa cada arquivo uma vez só, mesmo que apareça em dois blocos.
  const caminhos = [...new Set([...porId.values()].map((j) => j.output_path!))];
  const bytesPorCaminho = new Map<string, Buffer>();
  await emLevas(caminhos, 6, async (c) => {
    const { data } = await db.storage.from(BUCKET_RESULTADOS).download(c);
    if (data) bytesPorCaminho.set(c, Buffer.from(await data.arrayBuffer()));
  });

  const blocos: BlocoMaterial[] = [];
  for (const p of pedidos) {
    const fotos: FotoMaterial[] = [];
    for (const id of p.jobIds) {
      const j = porId.get(id);
      const bytes = j?.output_path ? bytesPorCaminho.get(j.output_path) : undefined;
      if (!j || !bytes) continue;
      const acao = ACOES_POR_ID[j.tipo];
      const detalhe = acao ? resumirParametros(acao, (j.parametros ?? {}) as Record<string, string>) : "";
      fotos.push({ bytes, legenda: [rotuloDoTipo(j.tipo), detalhe].filter(Boolean).join(" · ") || undefined });
    }
    if (fotos.length) blocos.push({ titulo: p.titulo || "Imóvel", subtitulo: p.subtitulo || undefined, preco: p.preco || undefined, fotos });
  }
  if (blocos.length === 0) return NextResponse.json({ error: "Não consegui ler as imagens escolhidas." }, { status: 500 });

  // QR: o link público do primeiro imóvel dos blocos que estiver compartilhado. Sem
  // compartilhamento não inventa link -- um QR que cai em 404 é pior que nenhum QR.
  let link: string | undefined;
  const idsImoveis = pedidos.map((p) => p.imovelId).filter((x): x is string => !!x);
  if (idsImoveis.length) {
    const { data: props } = await db.from("properties").select("id, share_token").eq("user_id", userId).in("id", idsImoveis);
    const comLink = idsImoveis.map((id) => props?.find((p) => p.id === id)).find((p) => p?.share_token);
    if (comLink?.share_token) link = `${origemDoApp(req)}/c/${comLink.share_token}`;
  }

  const marca = await marcaEfetiva(db, userId);
  let logo: Buffer | null = null;
  if (marca.logo_path) {
    const { data } = await db.storage.from(BUCKET_RESULTADOS).download(marca.logo_path);
    if (data) logo = Buffer.from(await data.arrayBuffer());
  }

  const titulo = texto(corpo?.titulo, 90) || blocos[0].titulo;
  let pdf: Buffer;
  try {
    pdf = await montarMaterial({
      modelo: def.id,
      titulo,
      subtitulo: texto(corpo?.subtitulo, 120) || undefined,
      descricao: textoLongo(corpo?.descricao, 1200) || undefined,
      preco: def.usaPreco ? texto(corpo?.preco, 40) || undefined : undefined,
      blocos,
      marca: { nome: marca.nome ?? undefined, creci: marca.creci ?? undefined, whatsapp: marca.whatsapp ?? undefined, logo, cor: marca.cor_marca ?? undefined },
      link,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui montar o material: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const nome = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${def.id}-${nome || "material"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
