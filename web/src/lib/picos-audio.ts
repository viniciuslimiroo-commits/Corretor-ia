// A FORMA DE ONDA da linha do tempo (docs/planos/linha-do-tempo-spec.md, D3 e D8).
//
// Arrastar um trecho de música sem ver o som é arrastar no escuro: a pessoa não sabe onde
// a batida entra, e "corte 5s" é um número, não uma decisão. A onda é o que transforma o
// trecho em algo que dá pra escolher com o olho.
//
// Mas desenhar a onda lendo o arquivo no navegador custa 740 KB por faixa ANTES de a
// pessoa escolher a faixa. Então a medida é feita uma vez, no build
// (scripts/gerar-picos-audio.ts), e vira `public/musica/picos.json`: um pico por 50 ms,
// um byte por pico. As 15 faixas inteiras cabem em ~19 KB -- menos que uma miniatura.
//
// Duas decisões que parecem detalhe e não são:
//
//   - 20 PICOS POR SEGUNDO. Menos que isso e a batida some entre dois pontos; mais e o
//     arquivo cresce sem o olho ganhar nada num bloco de 40 px de altura.
//   - DECODIFICADO A 48 kHz. Numa medição a 8 kHz o sino e o brilho (som agudo, curto)
//     viram um risco baixo: o reamostrador tira justamente a energia de cima, e a onda
//     mente sobre o arquivo. 48 kHz é a taxa que o navegador usa pra tocar.
//
// O pico é `round(255 · min(1, max(|L|, |R|)))` na janela: o MAIOR dos dois canais, não a
// média. A média esconde som que só existe num lado, e som que só existe num lado é
// exatamente o que o corretor ouve no fone.

import type { MusicaId } from "./video";

/** Picos por segundo: uma janela de 50 ms. */
export const PICOS_POR_SEGUNDO = 20;

export type PicosDaFaixa = {
  porSeg: number;
  /** O maior pico da faixa inteira (0..255). Serve pra normalizar o desenho. */
  max: number;
  picos: Uint8Array;
  /** Duração exata do arquivo, pela contagem de amostras. */
  segundos: number;
};

/** O formato de `public/musica/picos.json`. */
export type ArquivoDePicos = {
  v: 1;
  porSeg: number;
  faixas: Record<string, { segundos: number; max: number; picos: string }>;
};

/**
 * Um pico por janela de `1/porSeg` segundo, a partir das amostras de cada canal.
 *
 * `canais` é uma lista de canais (mono = um; estéreo = dois), cada um em ponto flutuante
 * de −1 a 1 -- é o que `AudioBuffer.getChannelData` devolve e o que o script de build
 * monta do PCM do ffmpeg. A última janela pode ficar incompleta; entra assim mesmo, senão
 * o fim da faixa desaparece do desenho.
 */
export function picosDoBuffer(canais: ArrayLike<number>[], taxa: number, porSeg: number = PICOS_POR_SEGUNDO): Uint8Array {
  if (canais.length === 0 || !(taxa > 0) || !(porSeg > 0)) return new Uint8Array(0);
  const quadros = Math.min(...canais.map((c) => c.length));
  const janela = Math.max(1, Math.round(taxa / porSeg));
  const total = Math.ceil(quadros / janela);
  const picos = new Uint8Array(total);
  for (let j = 0; j < total; j++) {
    const de = j * janela;
    const ate = Math.min(quadros, de + janela);
    let maior = 0;
    for (const canal of canais) {
      for (let i = de; i < ate; i++) {
        const v = canal[i] < 0 ? -canal[i] : canal[i];
        if (v > maior) maior = v;
      }
    }
    picos[j] = Math.round(255 * Math.min(1, maior));
  }
  return picos;
}

/** Bytes de picos → base64 (o que vai no JSON). Vale no Node e no navegador. */
export function base64DePicos(picos: Uint8Array): string {
  let s = "";
  for (let i = 0; i < picos.length; i += 8192) s += String.fromCharCode(...picos.subarray(i, i + 8192));
  return btoa(s);
}

/** base64 → bytes de picos. */
export function picosDeBase64(texto: string): Uint8Array {
  const cru = atob(texto);
  const picos = new Uint8Array(cru.length);
  for (let i = 0; i < cru.length; i++) picos[i] = cru.charCodeAt(i);
  return picos;
}

/**
 * Lê `public/musica/picos.json` já baixado.
 *
 * Entrada torta não derruba a linha do tempo: a faixa ilegível some do mapa e o bloco
 * fica sem onda, que é o pior aceitável. Um `throw` aqui apagaria o editor inteiro por
 * causa de um enfeite.
 */
export function decodificarPicos(bruto: unknown): Partial<Record<MusicaId, PicosDaFaixa>> {
  const mapa: Partial<Record<MusicaId, PicosDaFaixa>> = {};
  if (!bruto || typeof bruto !== "object") return mapa;
  const arquivo = bruto as Partial<ArquivoDePicos>;
  if (arquivo.v !== 1 || !arquivo.faixas || typeof arquivo.faixas !== "object") return mapa;
  const porSeg = typeof arquivo.porSeg === "number" && arquivo.porSeg > 0 ? arquivo.porSeg : PICOS_POR_SEGUNDO;
  for (const [id, f] of Object.entries(arquivo.faixas)) {
    if (!f || typeof f !== "object" || typeof f.picos !== "string") continue;
    try {
      const picos = picosDeBase64(f.picos);
      if (picos.length === 0) continue;
      mapa[id as MusicaId] = {
        porSeg,
        max: typeof f.max === "number" ? f.max : Math.max(...picos),
        picos,
        segundos: typeof f.segundos === "number" ? f.segundos : picos.length / porSeg,
      };
    } catch {
      // base64 torto: a faixa fica sem onda, o editor continua.
    }
  }
  return mapa;
}

/**
 * O `d` do SVG da onda, no sistema de coordenadas do viewBox de D3:
 * x = índice do pico (1 unidade = 1/porSeg segundo), y = 0..255, silêncio no meio.
 *
 * `voltas` repete a faixa inteira: é a música em laço, que na linha do tempo continua
 * depois do fim do arquivo. Repetir o CAMINHO é o que deixa memoizar por (faixa, voltas)
 * em vez de redesenhar a cada arrasto.
 */
export function caminhoDaOnda(picos: Uint8Array, o?: { voltas?: number; altura?: number }): string {
  const voltas = Math.max(1, Math.floor(o?.voltas ?? 1));
  const altura = o?.altura ?? 255;
  const n = picos.length;
  if (n === 0) return "";
  const meio = altura / 2;
  const escala = altura / 255 / 2;
  const alto: string[] = [];
  const baixo: string[] = [];
  for (let v = 0; v < voltas; v++) {
    for (let i = 0; i < n; i++) {
      const x = v * n + i;
      const meia = Math.round(picos[i] * escala * 10) / 10;
      alto.push(`${x} ${Math.round((meio - meia) * 10) / 10}`);
      baixo.push(`${x} ${Math.round((meio + meia) * 10) / 10}`);
    }
  }
  baixo.reverse();
  return `M${alto.join("L")}L${baixo.join("L")}Z`;
}

/**
 * Correlação de Pearson entre duas séries de picos (0 a 1), pelo trecho comum.
 *
 * É o portão da cópia de prévia: a cópia a 48 kHz tem que ser o MESMO som do arquivo do
 * servidor. Comparar byte a byte não serve (o AAC recodifica), e comparar só a duração
 * deixa passar um arquivo com o áudio errado e o tamanho certo.
 */
export function correlacaoDePicos(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va <= 0 || vb <= 0) return 0;
  return num / Math.sqrt(va * vb);
}
