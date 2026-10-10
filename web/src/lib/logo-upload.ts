import sharp from "sharp";
import { valeTirarFundo, tirarFundo, tirarIlhasPequenas, contornoNecessario, contornar, type Veredito } from "./fundo-do-logo";
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

export type LogoPronta = {
  png: Buffer;
  cores: string[];
  /** Dá pra tirar o fundo deste logo? Vem junto do upload pra a tela poder oferecer -- ou
   *  não oferecer, com o motivo, em vez de prometer e entregar um buraco na letra. */
  fundo: Veredito;
};

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

  // DÁ PRA TIRAR O FUNDO DESTE LOGO? Responde aqui, no upload, pra tela poder oferecer --
  // e não oferecer quando não daria certo. Só a resposta: tirar de fato é outra chamada,
  // porque a decisão é da pessoa (o logo dela pode ser um selo escuro de propósito).
  let fundo: Veredito = { vale: false, motivo: "Não consegui analisar o fundo deste logo." };
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transp = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 40) transp++;
    fundo = valeTirarFundo(data, info.width, info.height, info.channels, transp / (info.width * info.height));
  } catch {
    // Fica o veredito negativo: a tela só não oferece o recurso, e o upload segue válido.
  }

  return { png, cores, fundo };
}

/**
 * Tira o fundo de um PNG já preparado. Devolve `null` quando não vale a pena -- quem chama
 * trata isso como "não mexi", não como erro.
 *
 * Separada de `prepararLogo` porque é ESCOLHA: o logo dele é dourado sobre fundo escuro, e
 * tirar o fundo de um selo que a pessoa desenhou como selo seria estragar o trabalho dela.
 */
/**
 * Da' pra tirar o fundo DESTE png? A mesma analise do upload, chamavel depois -- e' o que
 * permite a tela oferecer o botao pra quem ja' tinha logo guardado.
 */
export async function vereditoDoLogo(png: Buffer): Promise<Veredito> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transp = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 40) transp++;
    return valeTirarFundo(data, info.width, info.height, info.channels, transp / (info.width * info.height));
  } catch {
    return { vale: false, motivo: "Não consegui analisar o fundo deste logo." };
  }
}

export async function logoSemFundo(png: Buffer): Promise<Buffer | null> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transp = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 40) transp++;
    const v = valeTirarFundo(data, info.width, info.height, info.channels, transp / (info.width * info.height));
    if (!v.vale) return null;
    const cru = tirarFundo(data, info.channels, v.cor, v.tolerancia);
    // LIMPAR A SUJEIRA. Fundo texturizado nunca sai inteiro: no logo do dono sobravam 42
    // ilhas minúsculas somando 949 px, visíveis como pontinhos acima do telhado.
    const { saida: limpo } = tirarIlhasPequenas(cru, info.width, info.height, info.channels);
    // CONTORNO só pra logo CHAPADO, que é o que some no fundo da mesma tonalidade. Logo com
    // modelado próprio (o dourado dele, faixa interna 139) não leva nada -- medido: contorno
    // ali piora nos dois fundos.
    const cor = contornoNecessario(limpo, info.channels);
    const final = cor ? contornar(limpo, info.width, info.height, info.channels, cor, Math.max(2, Math.round(info.width * 0.006))) : limpo;
    return await sharp(final, { raw: { width: info.width, height: info.height, channels: info.channels as 4 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
