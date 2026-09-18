import { NextRequest, NextResponse } from "next/server";
import { origemDoApp, usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { chamarSincrono } from "@/lib/fal";
import { conferirFatos } from "@/lib/book-fatos";
import { fichaDoImovel, type ImovelMontagem } from "@/lib/book-montagem";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { ehToken, gerarToken, urlPublica } from "@/lib/compartilhar";
import { CHAVES_FICHA } from "@/lib/ficha-imovel";
import { ORIGEM_POR_ID, TONS, montarMensagem, pedeDadoSensivel, pedidoDaMensagem, semLinks, type EtapaId, type LinkDeMaterial, type OrigemId, type TomId } from "@/lib/crm";
import { CAMPOS_DO_LEAD, contaCrm, crmLiberado, doLeadsDaConta, registrar, situacaoDeEnvio } from "@/lib/crm-servidor";

// PREPARAR ENVIO: cliente -> imóvel -> materiais -> mensagem.
//
//   GET  ?imovel=ID   os materiais daquele imóvel que dá pra mandar (página de fotos,
//                     vídeos prontos, books/apresentações)
//   POST              { imovelId, materiais: ["imovel:ID" | "video:ID" | "book:ID"], tom }
//                     -> { texto, ia, aviso?, primeiroContato, links }
//
// Não envia nada: devolve o texto pra pessoa revisar, e o envio passa pela ação "enviar"
// (que confere tudo de novo). Os materiais vão como LINK público (o mesmo do botão
// "compartilhar" de cada um): a conversa só carrega texto, e link que vence em 1h não serve
// pra quem abre a mensagem amanhã.
//
// Regras (docs/planos/crm-whatsapp-regras.md): 1º contato vai sem link -- materiais só
// depois que a pessoa responde; a abertura e o SAIR do 1º contato são do Encena, a IA só
// escreve o miolo; a IA não inventa dado do imóvel (conferirFatos) nem pede documento.

const MODELO = "google/gemini-2.5-flash-lite";

type Material = { chave: string; tipo: "imovel" | "video" | "book"; id: string; rotulo: string; detalhe: string; miniatura: string | null; publico: boolean; aberturas?: number };

async function abrir(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await usuarioDaRota(req);
  if (s.erro) return { erro: s.erro } as const;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return { erro: NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 }) } as const;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erro: NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 }) } as const;
  const c = await contaCrm(db, userId);
  const { data: lead } = await doLeadsDaConta(db.from("leads").select(CAMPOS_DO_LEAD).eq("id", id), c).maybeSingle();
  if (!lead) return { erro: NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 }) } as const;
  return { db, userId, c, lead, erro: null } as const;
}

type Db = Extract<Awaited<ReturnType<typeof abrir>>, { erro: null }>["db"];

/** Os materiais mandáveis de um imóvel DESTA pessoa. `null` se o imóvel não é dela. */
async function materiaisDoImovel(db: Db, userId: string, imovelId: string): Promise<{ imovel: ImovelMontagem & { share_token: string | null }; materiais: Material[] } | null> {
  const { data: imovel } = await db
    .from("properties")
    .select(["id", "titulo", "endereco", "share_token", "capa_job_id", ...CHAVES_FICHA].join(", "))
    .eq("id", imovelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!imovel) return null;
  const im = imovel as unknown as ImovelMontagem & { share_token: string | null };
  const [{ data: fotos }, { data: videos }, { data: books }] = await Promise.all([
    db.from("jobs").select("id, output_path").eq("property_id", imovelId).eq("user_id", userId).eq("status", "concluido").order("criado_em", { ascending: false }).limit(40),
    db.from("videos").select("id, titulo, thumb_path, duracao_segundos, share_token").eq("property_id", imovelId).eq("user_id", userId).eq("status", "concluido").order("criado_em", { ascending: false }).limit(10),
    db.from("books").select("id, tipo, titulo, share_token, aberturas").eq("property_id", imovelId).eq("user_id", userId).order("atualizado_em", { ascending: false }).limit(10),
  ]);
  const capa = (fotos ?? []).find((f) => f.id === im.capa_job_id) ?? (fotos ?? [])[0];
  const materiais: Material[] = [];
  if ((fotos ?? []).length) {
    materiais.push({
      chave: `imovel:${im.id}`,
      tipo: "imovel",
      id: im.id as string,
      rotulo: "Fotos do imóvel",
      detalhe: `${fotos!.length} foto${fotos!.length === 1 ? "" : "s"} numa página só`,
      miniatura: capa?.output_path ? await assinar(db, capa.output_path).catch(() => null) : null,
      publico: ehToken(im.share_token),
    });
  }
  for (const v of videos ?? []) {
    materiais.push({
      chave: `video:${v.id}`,
      tipo: "video",
      id: v.id,
      rotulo: "Vídeo",
      detalhe: [v.titulo, v.duracao_segundos ? `${Math.round(Number(v.duracao_segundos))} s` : ""].filter(Boolean).join(" · "),
      miniatura: v.thumb_path ? await assinar(db, v.thumb_path).catch(() => null) : null,
      publico: ehToken(v.share_token),
    });
  }
  for (const b of books ?? []) {
    materiais.push({
      chave: `book:${b.id}`,
      tipo: "book",
      id: b.id,
      rotulo: TIPO_POR_ID[b.tipo]?.rotulo ?? "Material",
      detalhe: b.titulo ?? "",
      miniatura: capa?.output_path ? await assinar(db, capa.output_path).catch(() => null) : null,
      publico: ehToken(b.share_token),
      aberturas: b.aberturas ?? 0,
    });
  }
  return { imovel: im, materiais };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const imovelId = req.nextUrl.searchParams.get("imovel") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(imovelId)) return NextResponse.json({ materiais: [] });
  const r = await materiaisDoImovel(a.db, a.userId, imovelId);
  if (!r) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  return NextResponse.json({ materiais: r.materiais });
}

/** Liga o link público do material (reaproveita o que já existe) e devolve o endereço. */
async function linkPublico(db: Db, userId: string, origem: string, m: Material): Promise<LinkDeMaterial | null> {
  const tabela = m.tipo === "imovel" ? "properties" : m.tipo === "video" ? "videos" : "books";
  const { data } = await db.from(tabela).select("share_token").eq("id", m.id).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  let token = (data as { share_token: string | null }).share_token;
  if (!ehToken(token)) {
    token = gerarToken();
    const { error } = await db.from(tabela).update({ share_token: token }).eq("id", m.id).eq("user_id", userId);
    if (error) return null;
  }
  const url = m.tipo === "book" ? `${origem.replace(/\/$/, "")}/b/${token}` : urlPublica(origem, token);
  const rotulo = m.tipo === "imovel" ? "Fotos" : m.tipo === "video" ? "Vídeo" : m.rotulo;
  return { rotulo, url };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, userId, c, lead } = a;
  const corpo = (await req.json().catch(() => ({}))) as { imovelId?: unknown; materiais?: unknown; tom?: unknown };
  const tom: TomId = TONS.some((t) => t.id === corpo.tom) ? (corpo.tom as TomId) : "cordial";
  const agora = new Date();

  const situacao = await situacaoDeEnvio(db, c, lead, agora);
  if (!situacao.pode.ok) return NextResponse.json({ error: situacao.pode.texto, motivo: situacao.pode.motivo }, { status: 409 });
  const primeiroContato = situacao.pode.primeiroContato;

  const chaves = Array.isArray(corpo.materiais) ? corpo.materiais.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  if (primeiroContato && chaves.length) {
    return NextResponse.json({ error: "A primeira mensagem vai sem link. Os materiais liberam depois que a pessoa responder." }, { status: 409 });
  }

  const imovelId = typeof corpo.imovelId === "string" && /^[0-9a-f-]{36}$/.test(corpo.imovelId) ? corpo.imovelId : (lead.property_id as string | null);
  const doImovel = imovelId ? await materiaisDoImovel(db, userId, imovelId) : null;
  if (imovelId && !doImovel && corpo.imovelId) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const escolhidos = (doImovel?.materiais ?? []).filter((m) => chaves.includes(m.chave));
  if (escolhidos.length !== chaves.length) return NextResponse.json({ error: "Algum material não é deste imóvel ou não está pronto." }, { status: 400 });
  const origem = origemDoApp(req);
  const links = (await Promise.all(escolhidos.map((m) => linkPublico(db, userId, origem, m)))).filter((l): l is LinkDeMaterial => !!l);

  const im = doImovel?.imovel ?? null;
  const pedido = pedidoDaMensagem({
    primeiroContato,
    nomeLead: lead.nome as string,
    corretor: situacao.corretor,
    origem: lead.origem as OrigemId,
    etapa: lead.etapa as EtapaId,
    tom,
    imovel: im ? { titulo: im.titulo ?? "Imóvel", endereco: im.endereco, preco: im.preco, ficha: fichaDoImovel(im), descricao: im.descricao } : null,
    materiais: escolhidos.map((m) => (m.tipo === "imovel" ? "as fotos" : m.tipo === "video" ? "o vídeo" : `o ${m.rotulo.toLowerCase()}`)),
  });

  // Sem IA (chave faltando, fora do ar, ou ela insistiu em inventar): uma mensagem pronta
  // decente, pra pessoa ajustar. Preparar nunca trava por causa da IA.
  const origemFrase = ORIGEM_POR_ID[lead.origem as OrigemId]?.frase ?? "";
  const reserva = primeiroContato
    ? `Estou falando com você ${origemFrase}${im?.titulo ? `, sobre o imóvel "${im.titulo}"` : ""}. Posso te mandar as informações?`
    : `Olá, ${String(lead.nome).trim().split(/\s+/)[0]}! ${links.length ? "Separei o material do imóvel pra você, vai logo abaixo." : "Tudo bem?"} Quer marcar uma visita?`;

  let miolo = reserva;
  let ia = false;
  let aviso: string | undefined;
  const falKey = process.env.FAL_KEY;
  const pedir = async (p: string) => {
    const saida = (await chamarSincrono("fal-ai/any-llm", { model: MODELO, prompt: p, temperature: 0.7, max_tokens: 260 }, falKey as string, 30_000)) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(saida.error);
    return semLinks((saida.output ?? "").replace(/^["“]|["”]$/g, "").trim()).slice(0, 700);
  };
  if (falKey) {
    try {
      let t = await pedir(pedido);
      const fatos = im ? conferirFatos(t, im) : [];
      if (fatos.length) t = await pedir(`${pedido}\n\nA resposta anterior foi recusada porque afirmou o que eu não te dei: ${fatos.map((x) => `"${x.trecho.trim()}"`).join("; ")}. Escreva de novo sem isso.`);
      if (t.length >= 10 && !pedeDadoSensivel(t) && !(im && conferirFatos(t, im).length)) {
        miolo = t;
        ia = true;
      } else aviso = "A IA não escreveu uma mensagem que passasse nas regras. Deixei uma pronta pra você ajustar.";
    } catch {
      aviso = "A IA não respondeu agora. Deixei uma mensagem pronta pra você ajustar.";
    }
  } else aviso = "IA indisponível. Deixei uma mensagem pronta pra você ajustar.";

  const texto = montarMensagem({ primeiroContato, corretor: situacao.corretor, creci: situacao.creci ?? "", nomeLead: lead.nome as string, miolo, links });
  await registrar(db, c, lead.id, "preparou_mensagem", { ia, materiais: links.length, tom });
  return NextResponse.json({ texto, ia, aviso, primeiroContato, links });
}
