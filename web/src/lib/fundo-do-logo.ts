/**
 * TIRAR O FUNDO DO LOGO, pra ele virar marca d'água de verdade.
 *
 * POR QUE EXISTE (10/10/2026): ele subiu o logo da imobiliária -- dourado sobre um fundo
 * escuro, quadrado, sem transparência -- e a marca d'água saiu como um SELO RETANGULAR por
 * cima do imóvel. Perguntou: "não pode ter opção de você transformar no SaaS a logo em
 * marca d'água?". Pode, e é aqui.
 *
 * COMO: a cor do fundo é lida dos QUATRO CANTOS, não escolhida por quem programou. Pixel
 * perto dessa cor vira transparente; pixel na faixa seguinte vira meio transparente, que é
 * o que evita a borra serrilhada em volta da letra. Tudo determinístico e local -- sem IA,
 * sem rede, sem crédito. O logo de um corretor é desenho chapado ou selo sobre fundo liso
 * em quase todo caso, e para esses a conta simples acerta.
 *
 * O QUE NÃO FAZ: fundo que é foto, ou logo cujo fundo tem a mesma cor de parte do desenho.
 * Nesses `valeTirarFundo` devolve `false` com o motivo, e a tela não oferece -- oferecer e
 * entregar um buraco no meio da letra é pior que não oferecer.
 */

export type Rgb = [number, number, number];

/** 1,0 = igual. Distância euclidiana em RGB, que basta pra fundo chapado. */
export function distancia(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A cor do fundo, lida dos quatro cantos, e o quanto eles discordam entre si.
 *
 * `desvio` é o que separa "fundo chapado" de "fundo que é um degradê ou uma foto". O logo
 * dele tem degradê (topo rgb(50,56,71), base rgb(11,12,14), desvio ~50) e MESMO ASSIM sai
 * limpo com tolerância alta -- por isso o desvio entra na conta da tolerância em vez de
 * reprovar sozinho.
 */
export function fundoDosCantos(
  dados: Uint8Array | Buffer,
  largura: number,
  altura: number,
  canais: number
): { cor: Rgb; desvio: number } {
  const em = (x: number, y: number): Rgb => {
    const i = (y * largura + x) * canais;
    return [dados[i], dados[i + 1], dados[i + 2]];
  };
  const m = 2;
  const cantos: Rgb[] = [em(m, m), em(largura - 1 - m, m), em(m, altura - 1 - m), em(largura - 1 - m, altura - 1 - m)];
  const cor: Rgb = [0, 1, 2].map((k) => Math.round(cantos.reduce((s, c) => s + c[k], 0) / 4)) as Rgb;
  const desvio = Math.max(...cantos.map((c) => distancia(c, cor)));
  return { cor, desvio };
}

/** Acima disto os cantos não descrevem um fundo: são partes diferentes de uma imagem. */
const DESVIO_MAX = 90;
/** Abaixo disto o "fundo" ocupa tão pouco que ou já há recorte, ou o logo preenche a arte. */
const FRACAO_MIN = 0.12;

export type Veredito = { vale: true; cor: Rgb; tolerancia: number; fracao: number } | { vale: false; motivo: string };

/**
 * Vale a pena oferecer? Responde ANTES de processar, pra tela não prometer o que não
 * entrega. `fracaoOpaca` é quanto do logo já é transparente: logo que já veio recortado
 * não precisa de nada.
 */
export function valeTirarFundo(
  dados: Uint8Array | Buffer,
  largura: number,
  altura: number,
  canais: number,
  jaTransparente: number
): Veredito {
  if (jaTransparente > 0.05) return { vale: false, motivo: "Este logo já tem fundo transparente." };
  const { cor, desvio } = fundoDosCantos(dados, largura, altura, canais);
  if (desvio > DESVIO_MAX) return { vale: false, motivo: "Os cantos do logo são muito diferentes entre si: não dá pra saber o que é fundo sem arriscar comer parte do desenho." };
  // Tolerância cresce com o desvio: fundo em degradê precisa de mais folga que fundo chapado.
  const tolerancia = Math.min(120, Math.max(50, Math.round(desvio * 1.6 + 45)));
  const total = largura * altura;
  let perto = 0;
  for (let i = 0; i < dados.length; i += canais) {
    if (distancia([dados[i], dados[i + 1], dados[i + 2]], cor) < tolerancia) perto++;
  }
  const fracao = perto / total;
  if (fracao < FRACAO_MIN) return { vale: false, motivo: "Quase não há fundo pra tirar: o desenho ocupa o quadro inteiro." };
  // Fundo quase total significa que o "desenho" é que foi confundido com fundo.
  if (fracao > 0.97) return { vale: false, motivo: "O logo inteiro tem a cor do fundo; tirar deixaria a imagem vazia." };
  return { vale: true, cor, tolerancia, fracao };
}

/**
 * Apaga o fundo, devolvendo os bytes RGBA.
 *
 * A FAIXA DE MEIO-TOM (de `tolerancia` a `tolerancia * 1.4`) não é refinamento: sem ela a
 * borda da letra fica serrilhada e o logo parece recortado com tesoura, que num vídeo de
 * imóvel chama mais atenção que o fundo que se queria tirar.
 */
export function tirarFundo(dados: Uint8Array | Buffer, canais: number, cor: Rgb, tolerancia: number): Buffer {
  const saida = Buffer.from(dados);
  const bordaAte = tolerancia * 1.4;
  for (let i = 0; i < saida.length; i += canais) {
    const d = distancia([saida[i], saida[i + 1], saida[i + 2]], cor);
    if (d < tolerancia) saida[i + 3] = 0;
    else if (d < bordaAte) saida[i + 3] = Math.round(255 * ((d - tolerancia) / (bordaAte - tolerancia)));
  }
  return saida;
}
