import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { marcaEfetiva, membroDe } from "@/lib/cobranca";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { montar, montarCatalogo, type ImovelDoCatalogo } from "@/lib/book-montagem";
import { montarAutomatico, comOlhar, verFotos, type Relatorio } from "@/lib/book-ia";
import { imagensDoDocumento, type DocumentoBook } from "@/lib/book-documento";
import { faltaMigracao, imagensDoImovel, imovelDeMontagem, jobsParaImagens, RECADO_MIGRACAO } from "@/lib/book-servidor";

// Books: criar e listar.
//
// Criar NÃO gasta crédito. É composição, como a planta e o terreno -- o crédito é da IA,
// e montar um book não passa por IA nenhuma.
//
// O POST já devolve o book montado e gravado: o caminho principal do produto é clicar uma
// vez e ver o book pronto, não preencher formulário.
//
// Com `auto: true` a IA entra: ela OLHA as fotos (que cômodo é, qual está melhor) e
// ESCREVE os textos. O que ela não faz, nunca, é criar fato -- metragem, quartos, vagas,
// endereço, condomínio e preço saem do cadastro, e `book-fatos` reprova qualquer número
// sem origem antes de entrar no documento. Se a IA falhar, o book sai pela montagem
// determinística mesmo assim.

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const imovel = req.nextUrl.searchParams.get("imovel");
  let consulta = db
    .from("books")
    .select("id, tipo, titulo, documento, property_id, share_token, aberturas, atualizado_em, properties!books_property_id_fkey(titulo)")
    .eq("user_id", userId)
    .order("atualizado_em", { ascending: false })
    .limit(60);
  if (imovel) consulta = consulta.eq("property_id", imovel);

  const { data, error } = await consulta;
  if (error) {
    if (faltaMigracao(error)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
    return NextResponse.json({ error: `Erro lendo seus books: ${error.message}` }, { status: 500 });
  }

  // A capa é a primeira imagem da primeira página. Uma consulta só para todas as capas.
  const linhas = (data ?? []) as Record<string, unknown>[];
  const capas = linhas.map((b) => (b.documento as DocumentoBook | null)?.paginas?.[0]?.imagens?.[0]).filter((x): x is string => !!x);
  const porJob = new Map<string, string>();
  if (capas.length) {
    const { data: jobs } = await db.from("jobs").select("*").eq("user_id", userId).in("id", [...new Set(capas)]);
    await Promise.all(
      ((jobs ?? []) as Record<string, unknown>[]).map(async (j) => {
        const caminho = (typeof j.thumb_path === "string" ? j.thumb_path : null) ?? (typeof j.output_path === "string" ? j.output_path : null);
        if (!caminho) return;
        const url = await assinar(db, caminho).catch(() => null);
        if (url) porJob.set(String(j.id), url);
      })
    );
  }

  const books = linhas.map((b) => {
    const doc = b.documento as DocumentoBook | null;
    const capa = doc?.paginas?.[0]?.imagens?.[0];
    const imovelDoBook = b.properties as { titulo: string | null } | null;
    return {
      id: String(b.id),
      tipo: String(b.tipo),
      rotuloTipo: TIPO_POR_ID[String(b.tipo)]?.rotulo ?? String(b.tipo),
      titulo: (b.titulo as string | null) ?? imovelDoBook?.titulo ?? "Book sem título",
      paginas: doc?.paginas?.length ?? 0,
      imovel: b.property_id ? { id: String(b.property_id), titulo: imovelDoBook?.titulo ?? "Imóvel" } : null,
      compartilhado: !!b.share_token,
      aberturas: Number(b.aberturas ?? 0),
      atualizadoEm: String(b.atualizado_em),
      capa: capa ? (porJob.get(capa) ?? null) : null,
    };
  });

  return NextResponse.json({ books });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const def = TIPO_POR_ID[typeof corpo?.tipo === "string" ? corpo.tipo : ""];
  if (!def) return NextResponse.json({ error: "Tipo de book desconhecido." }, { status: 400 });

  const imovelId = typeof corpo?.imovelId === "string" ? corpo.imovelId : null;
  const imovelIds: string[] = (Array.isArray(corpo?.imovelIds) ? corpo.imovelIds : []).filter((x: unknown): x is string => typeof x === "string").slice(0, 24);
  const jobIds: string[] = (Array.isArray(corpo?.jobIds) ? corpo.jobIds : []).filter((x: unknown): x is string => typeof x === "string").slice(0, 60);

  const [membroCedo, marcaCedo] = await Promise.all([membroDe(db, userId), marcaEfetiva(db, userId)]);
  const corDaMarca = /^#?[0-9a-f]{6}$/i.test(marcaCedo.cor_marca ?? "") ? (marcaCedo.cor_marca as string) : undefined;

  // ---- catálogo: vários imóveis, um por página ----
  if (def.variosImoveis) {
    const ids = imovelIds.length ? imovelIds : imovelId ? [imovelId] : [];
    if (ids.length === 0) return NextResponse.json({ error: "Escolha os imóveis do catálogo." }, { status: 400 });

    const itens: ImovelDoCatalogo[] = [];
    for (const pid of ids) {
      const d = await imovelDeMontagem(db, userId, pid);
      if (!d) continue;
      const imgs = await imagensDoImovel(db, userId, pid);
      if (imgs.length === 0) continue;
      itens.push({ imovel: d.imovel, imagens: imgs });
    }
    if (itens.length === 0) {
      return NextResponse.json({ error: "Nenhum dos imóveis escolhidos tem imagem pronta." }, { status: 400 });
    }

    // No automático a IA escolhe a foto de cada imóvel; sem ele, vale a regra de sempre.
    // Texto não muda: no catálogo tudo é dado do cadastro, e é assim que fica.
    let vistas = 0;
    if (corpo?.auto === true) {
      for (const item of itens) {
        const vistos = await verFotos(db, userId, item.imagens.map((i) => i.jobId), process.env.FAL_KEY, 8).catch(() => new Map());
        vistas += vistos.size;
        item.imagens = comOlhar(item.imagens, vistos).sort((a2, b2) => b2.qualidade - a2.qualidade);
      }
    }

    const documentoCat = montarCatalogo({ imoveis: itens, cor: corDaMarca, titulo: marcaCedo.nome ?? undefined });
    const { data: criadoCat, error: erroCat } = await db
      .from("books")
      .insert({
        user_id: userId,
        org_id: membroCedo?.orgId ?? null,
        property_id: null,
        tipo: def.id,
        titulo: `Catálogo · ${itens.length} ${itens.length === 1 ? "imóvel" : "imóveis"}`,
        documento: documentoCat,
      })
      .select("id, tipo, titulo, versao")
      .single();
    if (erroCat || !criadoCat) {
      if (faltaMigracao(erroCat)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
      return NextResponse.json({ error: erroCat?.message ?? "Não consegui criar o catálogo." }, { status: 500 });
    }
    return NextResponse.json({
      book: {
        id: String(criadoCat.id),
        tipo: criadoCat.tipo,
        titulo: criadoCat.titulo,
        versao: criadoCat.versao,
        paginas: documentoCat.paginas.length,
        imagens: imagensDoDocumento(documentoCat).length,
        deFora: 0,
      },
      relatorio: corpo?.auto === true ? { fotosVistas: vistas, fotosNoBook: itens.length, textosPorIA: false, reprovados: [] } : null,
    });
  }

  let dados: Awaited<ReturnType<typeof imovelDeMontagem>> = null;
  let imagens;

  // O imóvel, quando vem, serve pra ficha, capa marcada e QR -- mesmo que as imagens
  // tenham sido escolhidas a dedo.
  if (imovelId) {
    dados = await imovelDeMontagem(db, userId, imovelId);
    if (!dados) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  }

  if (jobIds.length) {
    const { data } = await db
      .from("jobs")
      .select("id, tipo, parametros, criado_em, property_id")
      .eq("user_id", userId)
      .eq("status", "concluido")
      .not("output_path", "is", null)
      .in("id", jobIds);
    // Respeita a ordem em que a pessoa marcou -- ela quis dizer alguma coisa.
    const porId = new Map(((data ?? []) as { id: string }[]).map((j) => [j.id, j]));
    imagens = jobsParaImagens(jobIds.map((x) => porId.get(x)).filter(Boolean) as never[]);
    if (!dados) {
      const comImovel = imagens.find((i) => i.imovelId);
      if (comImovel?.imovelId) dados = await imovelDeMontagem(db, userId, comImovel.imovelId);
    }
  } else if (imovelId) {
    imagens = await imagensDoImovel(db, userId, imovelId);
  } else {
    return NextResponse.json({ error: "Escolha um imóvel ou marque as imagens." }, { status: 400 });
  }

  if (!imagens || imagens.length === 0) {
    return NextResponse.json({ error: "Este imóvel ainda não tem imagens prontas. Edite a primeira foto e volte." }, { status: 400 });
  }

  const imovel = dados?.imovel ?? { id: null, titulo: "Meu material", endereco: null, capa_job_id: null };
  // A identidade visual entra AQUI, na criação: a cor da imobiliária vira a cor do book.
  // Antes ficava indefinida e o layout caía no azul padrão -- que por acaso é o da Encena,
  // então ninguém percebia até um corretor com marca vermelha exportar um book azul.
  const membro = membroCedo;
  const cor = corDaMarca;

  const automatico = corpo?.auto === true;
  let documento;
  let relatorio: Relatorio | null = null;
  if (automatico) {
    const feito = await montarAutomatico({ db, userId, tipo: def.id, imovel, imagens, cor, falKey: process.env.FAL_KEY });
    documento = feito.documento;
    relatorio = feito.relatorio;
  } else {
    documento = montar({ tipo: def.id, imovel, imagens, cor });
    // Sem IA a página de destaques nasce vazia; tirar é melhor do que entregar em branco.
    documento = { ...documento, paginas: documento.paginas.filter((p) => p.tipo !== "destaques") };
  }

  const { data: criado, error } = await db
    .from("books")
    .insert({
      user_id: userId,
      org_id: membro?.orgId ?? null,
      property_id: imovel.id,
      tipo: def.id,
      titulo: imovel.titulo,
      documento,
    })
    .select("id, tipo, titulo, versao, atualizado_em")
    .single();

  if (error || !criado) {
    if (faltaMigracao(error)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
    return NextResponse.json({ error: error?.message ?? "Não consegui criar o book." }, { status: 500 });
  }

  return NextResponse.json({
    book: {
      id: String(criado.id),
      tipo: criado.tipo,
      titulo: criado.titulo,
      versao: criado.versao,
      paginas: documento.paginas.length,
      imagens: imagensDoDocumento(documento).length,
      deFora: Math.max(0, imagens.length - imagensDoDocumento(documento).length),
    },
    relatorio,
  });
}
