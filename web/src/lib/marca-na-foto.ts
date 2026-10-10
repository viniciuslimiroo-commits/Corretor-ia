/**
 * ONDE O LOGO CAI NA FOTO EXPORTADA.
 *
 * POR QUE EXISTE (10/10/2026): no vídeo dava pra escolher o canto desde a marca d'água; na
 * foto o logo ia sempre no inferior esquerdo, cravado no código. Ele perguntou: "quando for
 * pôr marca d'água em fotos e vídeos, onde escolho a posição da imagem?". Na foto não
 * escolhia em lugar nenhum.
 *
 * O CANTO INFERIOR DIREITO NÃO É OFERECIDO, e isso é decisão, não esquecimento: ali mora o
 * selo "imagem ilustrativa", que já vem queimado no resultado antes da exportação. Pôr o
 * logo em cima dele esconderia justamente a marca que diz que a foto foi editada por IA --
 * e essa marca é a razão de o produto poder mobiliar um cômodo sem enganar ninguém. Um
 * recurso de personalização não pode ter como efeito apagar um aviso.
 *
 * O ALTO ESQUERDO é oferecido com ressalva: ali entra a legenda, quando há uma. Os dois
 * juntos se empilham e ficam feios, mas não é mentira nem perda -- então a tela avisa em vez
 * de proibir.
 */

export type PosicaoLogoFoto = "inferior_esquerdo" | "superior_esquerdo" | "superior_direito" | "centro";

export const POSICOES_LOGO_FOTO: { id: PosicaoLogoFoto; rotulo: string; dica: string }[] = [
  { id: "inferior_esquerdo", rotulo: "Baixo · esquerda", dica: "O de sempre. Fica ao lado do selo de imagem ilustrativa, sem cobrir." },
  { id: "superior_esquerdo", rotulo: "Alto · esquerda", dica: "Se você usa legenda na foto, os dois disputam este canto." },
  { id: "superior_direito", rotulo: "Alto · direita", dica: "Livre. Os portais às vezes cortam o topo na miniatura." },
  { id: "centro", rotulo: "No meio", dica: "Em cima do cômodo. Atrapalha a vista de propósito: protege a foto de ser reusada." },
];

export const POSICAO_LOGO_PADRAO: PosicaoLogoFoto = "inferior_esquerdo";

export function ehPosicaoLogo(v: unknown): v is PosicaoLogoFoto {
  return typeof v === "string" && POSICOES_LOGO_FOTO.some((p) => p.id === v);
}

/**
 * O canto de cima e o canto da esquerda, em pixels, pra sobrepor `logo` em `foto`.
 *
 * Uma função só, usada pela exportação de UMA foto e pelo ZIP do imóvel inteiro. Eram duas
 * contas copiadas, e cópia de conta é onde as duas telas passam a discordar sem ninguém
 * notar -- a foto avulsa sairia com o logo num canto e o lote no outro.
 */
export function ondePorOLogo(
  posicao: PosicaoLogoFoto,
  foto: { largura: number; altura: number },
  logo: { largura: number; altura: number }
): { left: number; top: number } {
  const margem = Math.max(10, Math.round(foto.largura * 0.015));
  const emCima = posicao.startsWith("superior");
  const naDireita = posicao.endsWith("direito");
  const cru =
    posicao === "centro"
      ? { left: Math.round((foto.largura - logo.largura) / 2), top: Math.round((foto.altura - logo.altura) / 2) }
      : {
          left: naDireita ? foto.largura - logo.largura - margem : margem,
          top: emCima ? margem : foto.altura - logo.altura - margem,
        };
  // NUNCA NEGATIVO. Com logo quase do tamanho da foto, a margem empurra a coordenada pra
  // fora do quadro e o `sharp` recusa o composite -- a exportação falharia inteira por causa
  // de uma margem. Hoje o logo é limitado a 18% da largura e isso não acontece, mas o limite
  // mora noutro arquivo: a conta não pode depender de alguém lá nunca mudar de ideia.
  return { left: Math.max(0, cru.left), top: Math.max(0, cru.top) };
}
