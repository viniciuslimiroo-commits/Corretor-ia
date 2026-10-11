// O MOVIMENTO DA CÂMERA SOBRE A FOTO — a conta, num lugar só.
//
// Ele em 10/10/2026: "ao passar o mouse em cima de 'Movimento na foto' e 'Tour pela casa',
// dar uma breve demonstração, abrir janelinha ao lado mostrando um exemplo de como ficaria".
//
// Uma demonstração que invente o próprio movimento ensina a coisa errada: a pessoa escolhe
// pelo que viu e recebe outra coisa. Então os números moram AQUI e são lidos pelos dois
// lados -- o `zoompan` do ffmpeg (video-ffmpeg.ts, que é de servidor e importa `node:fs`)
// e a janelinha no navegador. Mudar a velocidade do vídeo muda a demonstração junto, sem
// ninguém lembrar de mexer nos dois.
//
// `quadrosChaveDaFoto` devolve quadros-chave da Web Animations API -- o mesmo caminho que
// `com-movimento.tsx` já usa pro movimento do TEXTO no palco.

import type { EfeitoId } from "./video";

/** Quanto a câmera anda por segundo de movimento, em fração do quadro. */
export const ZOOM_POR_SEGUNDO = 0.2 / 3.55;
/** Teto e piso: cena de 10 s não vira um zoom que come metade da foto, nem a de 2 s fica parada. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 0.32;
/** O movimento termina um pouco antes do fim da cena: take que corta em movimento corta em falso. */
export const SEGUNDOS_DE_POUSO = 0.45;

/** A amplitude que faz ESTA cena andar na mesma velocidade de todas as outras. */
export function amplitudeDoZoom(segundosDeMovimento: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ZOOM_POR_SEGUNDO * segundosDeMovimento));
}

/** Quantos segundos de movimento a cena tem, já descontado o pouso. */
export function segundosDeMovimento(duracao: number): number {
  return Math.max(0.1, duracao - Math.min(SEGUNDOS_DE_POUSO, duracao * 0.25));
}

/**
 * O andamento do movimento: 0 a 1 numa curva em S -- começa devagar, acelera, desacelera.
 * Linear significa velocidade máxima no último quadro, e aí o movimento para de supetão.
 */
export function andamentoSuave(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/**
 * Onde a janela da câmera está, em fração da foto, no andamento `p`.
 *
 * `z` é o zoom e `inicio` é a borda esquerda (ou de cima) da janela, as mesmas duas
 * grandezas que as receitas do `zoompan` escrevem como `z=` e `x=`/`y=`.
 */
export function janelaDaFoto(efeito: EfeitoId, amplitude: number, p: number): { z: number; inicio: number; eixo: "x" | "y" | null } {
  const corrida = (z: number) => 1 - 1 / z;
  switch (efeito) {
    case "aproximar":
      return { z: 1 + amplitude * p, inicio: 0, eixo: null };
    case "afastar":
      return { z: 1 + amplitude - amplitude * p, inicio: 0, eixo: null };
    case "esquerda":
      return { z: 1 + amplitude, inicio: corrida(1 + amplitude) * (1 - p), eixo: "x" };
    case "direita":
      return { z: 1 + amplitude, inicio: corrida(1 + amplitude) * p, eixo: "x" };
    case "cima":
      return { z: 1 + amplitude, inicio: corrida(1 + amplitude) * (1 - p), eixo: "y" };
    case "baixo":
      return { z: 1 + amplitude, inicio: corrida(1 + amplitude) * p, eixo: "y" };
    default:
      return { z: 1, inicio: 0, eixo: null };
  }
}

/**
 * Os quadros-chave da Web Animations API que põem a mesma janela na tela.
 *
 * A conta do deslocamento: com a imagem preenchendo a caixa, `scale(z)` em torno do centro
 * e `translate(u)` em fração da largura da caixa, um ponto da foto na fração `f` cai em
 * `1/2 + (f - 1/2)·z + z·u`. Igualando a borda da janela a 0 sai `u = 1/2 − inicio − 1/(2z)`.
 */
export function quadrosChaveDaFoto(efeito: EfeitoId, duracao: number, passos = 24): Keyframe[] {
  const mov = segundosDeMovimento(duracao);
  const amplitude = amplitudeDoZoom(mov);
  const fatia = mov / duracao;
  const quadros: Keyframe[] = [];
  for (let i = 0; i <= passos; i++) {
    const tempo = i / passos;
    // Depois do pouso a imagem fica parada: `p` satura, como o `min(on/m,1)` do ffmpeg.
    const p = andamentoSuave(fatia > 0 ? tempo / fatia : 1);
    const { z, inicio, eixo } = janelaDaFoto(efeito, amplitude, p);
    const u = eixo ? 0.5 - inicio - 1 / (2 * z) : 0;
    const desloca = eixo === "x" ? `translateX(${(u * 100).toFixed(3)}%)` : eixo === "y" ? `translateY(${(u * 100).toFixed(3)}%)` : "";
    quadros.push({ offset: tempo, transform: `scale(${z.toFixed(4)})${desloca ? " " + desloca : ""}` });
  }
  return quadros;
}
