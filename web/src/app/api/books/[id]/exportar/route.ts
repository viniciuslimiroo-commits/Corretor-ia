import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota, origemDoApp } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { marcaEfetiva } from "@/lib/cobranca";
import { idiomaDaRequisicao } from "@/i18n/idiomas";
import { limparDocumento, imagensDoDocumento } from "@/lib/book-documento";
import { montarLayout, type ContextoLayout } from "@/lib/book-layout";
import { fichaDoImovel } from "@/lib/book-montagem";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { montarPdfDoBook, type Qualidade } from "@/lib/book-pdf";
import { LARGURA_PADRAO, montarImagemDaPagina } from "@/lib/book-imagem";
import { faltaMigracao, imovelDeMontagem, resolverQr, RECADO_MIGRACAO } from "@/lib/book-servidor";

// Exportar o book em PDF.
//
// NÃO gasta crédito: é diagramação, não IA. Mesmo critério da planta e do terreno.
//
// O PDF não é guardado. O book é a verdade e o arquivo é derivado -- assim "trocar o preço
// e reexportar" custa segundos, e nunca circula uma versão velha que ficou no storage.
//
// Duas qualidades, com nomes do mundo real:
//   leve  -> o que vai no WhatsApp: 144 dpi, JPEG 78, alvo de poucos MB
//   alta  -> 300 dpi, JPEG 92, pro estande e pra gráfica
//
// O layout é montado aqui pelo MESMO caminho do editor (montarLayout com a fonte do documento), então
// o arquivo sai com as linhas quebradas exatamente onde a tela mostrou.

export const maxDuration = 300;

/** Baixa em levas: trinta arquivos um a um passa do tempo da função. */
async function emLevas<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const qualidade: Qualidade = corpo?.qualidade === "alta" ? "alta" : "leve";

  const { data, error } = await db.from("books").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error && faltaMigracao(error)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  const documento = limparDocumento(data.documento);
  if (!documento) return NextResponse.json({ error: "Este book está corrompido. Crie outro a partir do imóvel." }, { status: 500 });

  const dados = data.property_id ? await imovelDeMontagem(db, userId, data.property_id) : null;

  // A trava legal mora AQUI, não no botão: bloqueio de interface se contorna, rota não.
  if (documento.tipo === "lancamento" && !dados?.registro) {
    return NextResponse.json(
      {
        error:
          "Falta o registro de incorporação deste imóvel. A lei exige o número, a matrícula e o cartório em qualquer peça de divulgação de imóvel vendido antes da conclusão.",
        faltaRegistro: true,
      },
      { status: 422 }
    );
  }

  const marca = await marcaEfetiva(db, userId);
  const contexto: ContextoLayout = {
    marca: { nome: marca.nome, creci: marca.creci, whatsapp: marca.whatsapp, temLogo: !!marca.logo_path },
    ficha: dados ? fichaDoImovel(dados.imovel, idiomaDaRequisicao(req)) : [],
    link: dados?.shareToken ? `${origemDoApp(req).replace(/\/$/, "")}/c/${dados.shareToken}` : null,
    idioma: idiomaDaRequisicao(req),
  };
  const paginas = await resolverQr(montarLayout(documento, contexto));

  // As imagens vão em tamanho CHEIO: a miniatura de 400px serve ao editor, não ao PDF.
  const ids = imagensDoDocumento(documento);
  const imagens: Record<string, Buffer> = {};
  if (ids.length) {
    const { data: jobs } = await db.from("jobs").select("id, output_path").eq("user_id", userId).in("id", ids);
    await emLevas((jobs ?? []) as { id: string; output_path: string | null }[], 6, async (j) => {
      if (!j.output_path) return;
      const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(j.output_path);
      if (arq) imagens[j.id] = Buffer.from(await arq.arrayBuffer());
    });
  }

  let logo: Buffer | null = null;
  if (marca.logo_path) {
    const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(marca.logo_path);
    if (arq) logo = Buffer.from(await arq.arrayBuffer());
  }

  const titulo = (data.titulo as string | null) ?? dados?.imovel.titulo ?? "Book";
  const nomeArquivo = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);

  // Post, Story e carrossel saem em JPG, uma imagem por página: é o que se publica. O
  // pedido traz `pagina` porque cada imagem é um arquivo -- o carrossel é baixado página
  // a página, e não um zip que o celular não sabe abrir.
  if (TIPO_POR_ID[String(data.tipo)]?.saida === "imagem") {
    const indice = Math.min(Math.max(0, Number(corpo?.pagina ?? 0) || 0), paginas.length - 1);
    try {
      const jpg = await montarImagemDaPagina(paginas[indice], { imagens, logo, largura: qualidade === "alta" ? 1440 : LARGURA_PADRAO });
      return new NextResponse(new Uint8Array(jpg), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Disposition": `attachment; filename="${nomeArquivo || "material"}${paginas.length > 1 ? `-${indice + 1}` : ""}.jpg"`,
          "Cache-Control": "no-store",
          "X-Encena-Bytes": String(jpg.length),
          "X-Encena-Paginas": String(paginas.length),
        },
      });
    } catch (e) {
      return NextResponse.json({ error: `Não consegui montar a imagem: ${e instanceof Error ? e.message : e}` }, { status: 500 });
    }
  }

  let pdf: Buffer;
  try {
    pdf = await montarPdfDoBook({ paginas, imagens, logo, qualidade, titulo });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui montar o PDF: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo || "book"}${qualidade === "alta" ? "-alta" : ""}.pdf"`,
      "Cache-Control": "no-store",
      // A tela mostra o peso final; sem isto ela teria que adivinhar.
      "X-Encena-Bytes": String(pdf.length),
    },
  });
}
