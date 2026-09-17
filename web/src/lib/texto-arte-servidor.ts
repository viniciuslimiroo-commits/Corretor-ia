import type { ArteNaCena } from "./video-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ARTE_POR_ID } from "./texto-arte";
import { EFEITO_TEXTO_POR_ID, desenharEfeitoNoVideo } from "./efeitos-texto/catalogo";
import { lugaresDoTexto } from "./video-ffmpeg";
import type { TextoCena } from "./video";

// Rasteriza as ARTES de texto de uma cena: SVG -> PNG, pra entrarem como sobreposição.
//
// Só servidor. O SVG sai do MESMO catálogo que a galeria usa pra desenhar o cartão, então
// o que a pessoa escolheu vendo é literalmente o que vai pro vídeo -- não uma imitação.
//
// O `librsvg` que o sharp usa entende degradê, filtro de desfoque e traçado duplo, que é
// justamente o que o drawtext não faz e o que separa "modelo de texto" de "cor trocada".

/** O mesmo formato que a montagem sobrepõe (inclui `movimento`, que vira `sequencia` depois). */
export type ArteRasterizada = ArteNaCena;

/**
 * Desenha cada texto que tem `arte` e devolve o que a montagem precisa pra sobrepor.
 *
 * Texto sem `arte` é ignorado aqui: ele continua indo pelo drawtext, que é mais barato e
 * resolve bem o caso simples.
 */
export async function rasterizarArtes(
  textos: TextoCena[],
  H: number,
  pasta: string,
  prefixo: string,
  topoOcupado = false,
  W = Math.round((H * 9) / 16)
): Promise<ArteRasterizada[]> {
  const comArte = textos.map((t, i) => ({ t, i })).filter(({ t }) => t.arte && (EFEITO_TEXTO_POR_ID[t.arte] || ARTE_POR_ID[t.arte]));
  if (!comArte.length) return [];

  // Primeiro desenha tudo, pra saber a altura de cada peça; só então se calcula ONDE cada
  // uma fica -- é a altura que decide o empilhamento quando duas ficam na mesma posição.
  //
  // Os EFEITOS novos (fonte de verdade em contorno) vêm primeiro; os modelos antigos em
  // SVG com <text> continuam atendendo vídeo feito antes deles, pra reabrir igual.
  const desenhos = comArte.map(({ t }) => {
    const efeito = EFEITO_TEXTO_POR_ID[t.arte as string];
    if (efeito) {
      const d = desenharEfeitoNoVideo(efeito, t.texto || efeito.amostra, W, H, { fracao: t.visual?.tamanho, prefixo });
      return { svg: d.svg, largura: d.largura, altura: d.altura, texto: t };
    }
    const modelo = ARTE_POR_ID[t.arte as string];
    const corpo = Math.max(16, Math.round(H * (t.visual?.tamanho ?? modelo.corpo)));
    return { ...modelo.desenhar(t.texto, corpo), texto: t };
  });

  const alturas = textos.map((t) => {
    const k = comArte.findIndex(({ t: x }) => x === t);
    return k >= 0 ? desenhos[k].altura : Math.round(H * 0.08);
  });
  const lugares = lugaresDoTexto(textos, H, topoOcupado, alturas);

  const saida: ArteRasterizada[] = [];
  for (let k = 0; k < comArte.length; k++) {
    const { i, t } = comArte[k];
    const d = desenhos[k];
    const arquivo = path.join(pasta, `${prefixo}-arte-${k}.png`);
    await sharp(Buffer.from(d.svg)).png().toFile(arquivo);
    if (!fs.existsSync(arquivo)) continue;
    saida.push({ arquivo, y: lugares[i].y, largura: d.largura, altura: d.altura, animacao: t.animacao, movimento: t.movimento });
  }
  return saida;
}
