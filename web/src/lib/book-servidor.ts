import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { assinar } from "./armazenamento";
import { marcaEfetiva } from "./cobranca";
import { fichaDoImovel, type ImagemDisponivel, type ImovelMontagem } from "./book-montagem";
import { montarLayout, type ContextoLayout, type PaginaLayout } from "./book-layout";
import { medirTexto } from "./book-metricas";
import { imagensDoDocumento, type DocumentoBook } from "./book-documento";

// A cola entre o núcleo puro do book e o mundo: banco, storage e QR. Só servidor.
//
// Existe pra que rota e gerador de PDF não repitam a mesma dança de ler imóvel, assinar
// imagem, montar contexto e resolver QR -- e principalmente pra que os dois montem o
// layout do MESMO jeito. Se o editor e o PDF chamassem contextos diferentes, a
// divergência voltaria pela porta dos fundos.

type Db = SupabaseClient;

/** A migração 11 ainda não rodou. Sem ela nada de book funciona, e o erro cru do
 *  PostgREST ("PGRST205") não ajuda ninguém. */
export function faltaMigracao(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "PGRST205" || erro.code === "42P01" || erro.code === "42703";
}

export const RECADO_MIGRACAO =
  "O Criador de Books precisa da migração 11 (web/supabase/migration-11-books.sql). Rode ela no SQL Editor do Supabase e recarregue.";

/** Colunas do imóvel que a ficha usa. `*` de propósito: antes da migração 11 os campos
 *  novos não existem, e listar nome por nome faria a consulta falhar inteira. */
export async function imovelDeMontagem(db: Db, userId: string, imovelId: string): Promise<{ imovel: ImovelMontagem; shareToken: string | null; registro: string | null } | null> {
  const { data } = await db.from("properties").select("*").eq("id", imovelId).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const p = data as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numero = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined || v === "" ? null : Number(v) || null);
  return {
    imovel: {
      id: String(p.id),
      titulo: texto(p.titulo) ?? "Imóvel",
      endereco: texto(p.endereco),
      preco: texto(p.preco),
      descricao: texto(p.descricao),
      area_total: numero(p.area_total),
      area_util: numero(p.area_util),
      dormitorios: numero(p.dormitorios),
      suites: numero(p.suites),
      banheiros: numero(p.banheiros),
      vagas: numero(p.vagas),
      ano_construcao: numero(p.ano_construcao),
      condominio: texto(p.condominio),
      iptu: texto(p.iptu),
      negocio: texto(p.negocio),
      capa_job_id: texto(p.capa_job_id),
    },
    shareToken: texto(p.share_token),
    registro: texto(p.registro_incorporacao),
  };
}

type LinhaJob = { id: string; tipo: string; parametros: Record<string, string> | null; criado_em: string; property_id: string | null };

export function jobsParaImagens(jobs: LinhaJob[]): ImagemDisponivel[] {
  return jobs.map((j) => ({
    jobId: j.id,
    tipo: j.tipo,
    tipoEspaco: j.parametros?.tipo_espaco ?? null,
    criadoEm: j.criado_em,
    imovelId: j.property_id,
  }));
}

/** Imagens prontas de um imóvel, na ordem em que foram feitas. */
export async function imagensDoImovel(db: Db, userId: string, imovelId: string): Promise<ImagemDisponivel[]> {
  const { data } = await db
    .from("jobs")
    .select("id, tipo, parametros, criado_em, property_id")
    .eq("user_id", userId)
    .eq("property_id", imovelId)
    .eq("status", "concluido")
    .not("output_path", "is", null)
    .order("criado_em", { ascending: true })
    .limit(60);
  return jobsParaImagens((data ?? []) as LinhaJob[]);
}

/**
 * URL assinada de cada imagem do documento.
 *
 * Prefere a miniatura: o editor abre vinte páginas de uma vez, e mandar o arquivo inteiro
 * são dezenas de megabytes antes do primeiro clique. Job antigo ainda não tem miniatura --
 * cai no original e continua funcionando.
 */
export async function urlsDoDocumento(db: Db, userId: string, doc: DocumentoBook, cheias = false): Promise<Record<string, string>> {
  const ids = imagensDoDocumento(doc);
  if (ids.length === 0) return {};
  const { data } = await db.from("jobs").select("*").eq("user_id", userId).in("id", ids);
  const urls: Record<string, string> = {};
  await Promise.all(
    ((data ?? []) as Record<string, unknown>[]).map(async (j) => {
      const thumb = typeof j.thumb_path === "string" ? j.thumb_path : null;
      const cheia = typeof j.output_path === "string" ? j.output_path : null;
      const caminho = cheias ? cheia : (thumb ?? cheia);
      if (!caminho) return;
      const url = await assinar(db, caminho).catch(() => null);
      if (url) urls[String(j.id)] = url;
    })
  );
  return urls;
}

export async function contextoDoBook(db: Db, userId: string, imovel: ImovelMontagem | null, shareToken: string | null, origem: string): Promise<ContextoLayout> {
  const marca = await marcaEfetiva(db, userId);
  return {
    marca: { nome: marca.nome, creci: marca.creci, whatsapp: marca.whatsapp, temLogo: !!marca.logo_path },
    ficha: imovel ? fichaDoImovel(imovel) : [],
    link: shareToken ? `${origem.replace(/\/$/, "")}/c/${shareToken}` : null,
  };
}

/** Gera o PNG de cada QR do layout. Os dois desenhistas recebem a MESMA imagem. */
/**
 * Alguma imagem deste material passou por IA?
 *
 * Decide o aviso do rodapé. Foto enviada pela pessoa e mapa não passam por modelo nenhum;
 * um material feito só delas não pode sair dizendo "editadas digitalmente".
 *
 * Na dúvida devolve `true`: erro de leitura não pode virar a remoção de um aviso legal.
 */
const SEM_IA = new Set(["original", "mapa"]);

export async function algumaEditada(db: Db, userId: string, doc: DocumentoBook): Promise<boolean> {
  const ids = imagensDoDocumento(doc);
  if (ids.length === 0) return false;
  const { data, error } = await db.from("jobs").select("id, tipo").eq("user_id", userId).in("id", ids);
  if (error || !data) return true;
  const linhas = data as { tipo: string }[];
  if (linhas.length < ids.length) return true; // alguma não foi lida: assume o lado seguro
  return linhas.some((j) => !SEM_IA.has(j.tipo));
}

export async function resolverQr(paginas: PaginaLayout[]): Promise<PaginaLayout[]> {
  const feitos = new Map<string, string>();
  for (const p of paginas) {
    for (const c of p.caixas) {
      if (c.tipo !== "qr" || feitos.has(c.conteudo)) continue;
      const png = await QRCode.toDataURL(c.conteudo, { margin: 1, width: 420 }).catch(() => null);
      if (png) feitos.set(c.conteudo, png);
    }
  }
  return paginas.map((p) => ({
    ...p,
    caixas: p.caixas.map((c) => (c.tipo === "qr" ? { ...c, png: feitos.get(c.conteudo) } : c)),
  }));
}

/**
 * O pacote que o editor recebe numa chamada só.
 *
 * Devolve também o CONTEXTO e os QR já gerados, não só o layout pronto: com eles o
 * navegador recalcula o layout sozinho a cada tecla, usando a mesma tabela de métricas do
 * servidor (book-metricas). Sem isso, cada letra digitada pediria uma ida ao servidor pra
 * saber onde a linha quebra -- e a prévia andaria atrás do texto.
 */
export async function prepararLeitura(
  db: Db,
  userId: string,
  doc: DocumentoBook,
  imovel: ImovelMontagem | null,
  shareToken: string | null,
  origem: string
): Promise<{ layout: PaginaLayout[]; urls: Record<string, string>; logo: string | null; ctx: ContextoLayout; qrs: Record<string, string> }> {
  const [marca, urls, temEditada] = await Promise.all([
    marcaEfetiva(db, userId),
    urlsDoDocumento(db, userId, doc),
    algumaEditada(db, userId, doc),
  ]);
  const ctx: ContextoLayout = {
    marca: { nome: marca.nome, creci: marca.creci, whatsapp: marca.whatsapp, temLogo: !!marca.logo_path },
    ficha: imovel ? fichaDoImovel(imovel) : [],
    link: shareToken ? `${origem.replace(/\/$/, "")}/c/${shareToken}` : null,
    temEditada,
  };
  const layout = await resolverQr(montarLayout(doc, ctx, medirTexto));
  const logo = marca.logo_path ? await assinar(db, marca.logo_path).catch(() => null) : null;
  const qrs: Record<string, string> = {};
  for (const p of layout) for (const c of p.caixas) if (c.tipo === "qr" && c.png) qrs[c.conteudo] = c.png;
  return { layout, urls, logo, ctx, qrs };
}
