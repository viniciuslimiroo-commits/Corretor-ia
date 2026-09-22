import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// A CAPA de um link público, pra prévia do WhatsApp.
//
// O link do material chegava na conversa como URL pelada: sem foto, sem título, sem nada.
// Quem recebe não sabe se é o imóvel, um vídeo ou spam. Com a capa, o link vira um cartão
// com a foto -- que é o mais perto de "anexo" que dá pra chegar sem a API oficial.
//
// Por que não usar a URL assinada que a página já gera: ela vale 1 hora. Prévia de link é
// buscada pelo robô do WhatsApp na hora do envio, mas também quando alguém REENCAMINHA a
// mensagem dias depois -- e aí a foto já teria expirado. Esta função devolve o CAMINHO no
// bucket, e a rota /c/[token]/capa serve os bytes por um endereço que não vence.
//
// Revogar o token continua cortando tudo: sem token, não se acha o caminho.

type Db = SupabaseClient;

/**
 * A origem pública desta requisição, pra montar o endereço ABSOLUTO da capa.
 *
 * og:image relativo não existe: o robô do WhatsApp não tem de onde resolver. E a origem não
 * pode ser fixa no código -- o mesmo build roda em produção e em prévia, com domínios
 * diferentes, e a prévia apontaria pra foto do outro.
 */
export async function origemPublica(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

/** O caminho, no bucket, da imagem que representa este link. `null` se não houver. */
export async function caminhoDaCapa(db: Db, token: string): Promise<string | null> {
  // Vídeo: a miniatura (o mp4 não serve de prévia).
  const { data: video } = await db.from("videos").select("thumb_path").eq("share_token", token).eq("status", "concluido").maybeSingle();
  if (video) return (video as { thumb_path: string | null }).thumb_path;

  // Foto solta: o resultado.
  const { data: job } = await db.from("jobs").select("output_path").eq("share_token", token).eq("status", "concluido").maybeSingle();
  if (job) return (job as { output_path: string | null }).output_path;

  // Imóvel: a capa escolhida; sem ela, a foto pronta mais recente -- a mesma ordem da galeria.
  const { data: imovel } = await db.from("properties").select("id, capa_job_id").eq("share_token", token).maybeSingle();
  if (!imovel) return null;
  const im = imovel as { id: string; capa_job_id: string | null };
  if (im.capa_job_id) {
    const { data: capa } = await db.from("jobs").select("output_path").eq("id", im.capa_job_id).eq("status", "concluido").maybeSingle();
    const p = (capa as { output_path: string | null } | null)?.output_path;
    if (p) return p;
  }
  const { data: recente } = await db
    .from("jobs")
    .select("output_path")
    .eq("property_id", im.id)
    .eq("status", "concluido")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (recente as { output_path: string | null } | null)?.output_path ?? null;
}

/**
 * A capa de um BOOK (/b/[token]): a imagem da página de capa do documento.
 *
 * O documento guarda id de job, não caminho -- por isso a segunda consulta. Sem página de
 * capa (catálogo, por exemplo), vale a primeira imagem que aparecer: qualquer foto do
 * material é melhor prévia do que nenhuma.
 */
export async function caminhoDaCapaDoBook(db: Db, token: string): Promise<string | null> {
  const { data } = await db.from("books").select("user_id, documento").eq("share_token", token).maybeSingle();
  if (!data) return null;
  const doc = (data as { documento: unknown }).documento as { paginas?: { tipo?: string; imagens?: unknown[] }[] } | null;
  const paginas = doc?.paginas ?? [];
  const idDaImagem = (p: { imagens?: unknown[] } | undefined) => (typeof p?.imagens?.[0] === "string" ? (p.imagens[0] as string) : null);
  const jobId = idDaImagem(paginas.find((p) => p.tipo === "capa")) ?? idDaImagem(paginas.find((p) => idDaImagem(p)));
  if (!jobId) return null;
  const { data: job } = await db
    .from("jobs")
    .select("output_path")
    .eq("id", jobId)
    .eq("user_id", (data as { user_id: string }).user_id)
    .maybeSingle();
  return (job as { output_path: string | null } | null)?.output_path ?? null;
}

/** O tipo do arquivo pelo fim do nome. O bucket só guarda imagem nestes caminhos. */
export function tipoDaImagem(caminho: string): string {
  const ext = caminho.slice(caminho.lastIndexOf(".") + 1).toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}
