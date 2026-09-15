import sharp from "sharp";
import { coresDaLogo } from "./cores-da-logo";
import { LOGO_MAX_BYTES, LOGO_LADO_MIN, LOGO_LADO_MAX, LOGO_LADO_SAIDA } from "./logo-upload-limites";

// Um único lugar que valida e normaliza logo, usado pela marca da pessoa e pela marca da
// imobiliária. Estava duplicado nas duas rotas, e duplicado quer dizer que uma delas ia
// ficar pra trás -- foi o que aconteceu com o cap de imagem no book.
//
// O que o navegador diz não conta: `file.type` é escolhido por quem envia. A checagem que
// vale é o sharp abrir o arquivo e dizer o que ele É. Extensão e MIME ficam como primeira
// peneira, pra recusar barato antes de decodificar 5 MB.

const MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const EXTENSOES = /\.(png|jpe?g|webp)$/i;
/** Formatos que o sharp pode confirmar. `jpg` e `jpeg` chegam os dois. */
const FORMATOS = new Set(["png", "jpeg", "jpg", "webp"]);

export { LOGO_MAX_BYTES } from "./logo-upload-limites";
const LADO_MIN = LOGO_LADO_MIN;
const LADO_MAX = LOGO_LADO_MAX;
const LADO_SAIDA = LOGO_LADO_SAIDA;

export type LogoPronta = { png: Buffer; cores: string[] };

/**
 * Valida e normaliza o arquivo. Devolve `{ erro }` com uma frase pra mostrar na tela --
 * nunca a mensagem crua da biblioteca, que fala de "unsupported image format" pra quem só
 * quer saber que mandou um PDF.
 */
export async function prepararLogo(arquivo: File): Promise<LogoPronta | { erro: string }> {
  if (arquivo.size === 0) return { erro: "O arquivo chegou vazio. Tente enviar de novo." };
  if (arquivo.size > LOGO_MAX_BYTES) {
    return { erro: `A logo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB — normalmente é só salvar como PNG.` };
  }
  const tipo = (arquivo.type || "").toLowerCase();
  if (tipo && !MIMES.has(tipo)) return { erro: "Formato não aceito. Use PNG, JPG ou WebP." };
  if (arquivo.name && !EXTENSOES.test(arquivo.name)) return { erro: "Formato não aceito. Use PNG, JPG ou WebP." };

  const bruto = Buffer.from(await arquivo.arrayBuffer());

  // Tipo inferido: `sharp` entra como import default, então o namespace `sharp.Metadata`
  // não existe aqui.
  let meta;
  try {
    meta = await sharp(bruto).metadata();
  } catch {
    return { erro: "Não consegui ler esse arquivo como imagem." };
  }
  // O que o arquivo é de verdade, independente do que o nome e o MIME prometeram.
  if (!meta.format || !FORMATOS.has(meta.format)) return { erro: "Formato não aceito. Use PNG, JPG ou WebP." };
  const l = meta.width ?? 0;
  const a = meta.height ?? 0;
  if (l < LADO_MIN || a < LADO_MIN) return { erro: `A logo tem ${l}×${a}px, pequena demais pra sair nítida. Mande pelo menos ${LADO_MIN}×${LADO_MIN}px.` };
  if (l > LADO_MAX || a > LADO_MAX) return { erro: `A logo tem ${l}×${a}px, grande demais. O limite é ${LADO_MAX}px de lado.` };

  let png: Buffer;
  try {
    png = await sharp(bruto).resize(LADO_SAIDA, LADO_SAIDA, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return { erro: "Não consegui converter essa imagem. Tente salvar como PNG e enviar de novo." };
  }

  // As cores saem de uma versão pequena: 96px basta pra saber a paleta e evita varrer
  // 640 mil pixels por upload.
  let cores: string[] = [];
  try {
    const { data } = await sharp(png).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    cores = coresDaLogo(data);
  } catch {
    cores = []; // sem paleta é um recurso a menos, não um upload perdido
  }

  return { png, cores };
}
