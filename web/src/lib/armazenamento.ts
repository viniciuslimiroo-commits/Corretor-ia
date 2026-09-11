import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_RESULTADOS, VALIDADE_URL_SEGUNDOS } from "./supabase-server";

// Guarda e assina arquivos no bucket privado. Duas famílias de arquivo, com destinos
// de vida diferentes:
//
//   entradas/{userId}/{jobId}-*   a foto que a pessoa subiu e a máscara que ela pintou.
//                                 Existem só enquanto o job roda, e são apagadas quando
//                                 ele termina.
//   {userId}/{jobId}.jpg          o resultado carimbado, que fica.
//
// Por que a entrada vai parar no storage em vez de ir embutida na chamada (era um data
// URI antes): com a fila, quem despacha e quem faz o fallback são requisições
// DIFERENTES. Sem os bytes guardados em algum lugar, tentar o segundo provedor exigiria
// pedir a foto de novo pro navegador, o que é impossível -- a pessoa já fechou a aba.
// De quebra, a chamada ao fal deixa de carregar megabytes de base64.

export const PREFIXO_ENTRADAS = "entradas";

type Db = SupabaseClient;

export function caminhoResultado(userId: string, jobId: string) {
  return `${userId}/${jobId}.jpg`;
}

export function caminhoEntrada(userId: string, jobId: string, qual: "foto" | "mascara") {
  const ext = qual === "foto" ? "jpg" : "png";
  return `${PREFIXO_ENTRADAS}/${userId}/${jobId}-${qual}.${ext}`;
}

/** Sobe bytes no bucket privado e devolve uma URL assinada pra quem precisa ler. */
export async function guardarEAssinar(
  db: Db,
  caminho: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const { error: erroUpload } = await db.storage
    .from(BUCKET_RESULTADOS)
    .upload(caminho, bytes, { contentType, upsert: true });
  if (erroUpload) {
    throw new Error(
      `Não consegui guardar "${caminho}": ${erroUpload.message}. ` +
        `Faltou rodar a migration 03 (bucket "${BUCKET_RESULTADOS}") no Supabase?`
    );
  }
  return assinar(db, caminho);
}

export async function assinar(db: Db, caminho: string): Promise<string> {
  const { data, error } = await db.storage
    .from(BUCKET_RESULTADOS)
    .createSignedUrl(caminho, VALIDADE_URL_SEGUNDOS);
  if (error || !data) {
    throw new Error(`Não consegui assinar a URL de "${caminho}": ${error?.message}`);
  }
  return data.signedUrl;
}

/**
 * Apaga os arquivos de entrada de um job.
 *
 * Nunca deixa a limpeza derrubar a requisição: se falhar, o usuário já tem o resultado
 * dele, e o custo do erro é alguns megabytes ocupados até alguém varrer. Falhar aqui e
 * devolver erro seria trocar um problema de faxina por um problema de produto.
 */
export async function apagarEntradas(db: Db, caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  try {
    await db.storage.from(BUCKET_RESULTADOS).remove(caminhos);
  } catch {
    // silêncio proposital, ver comentário acima
  }
}
