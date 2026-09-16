import { desenharEfeito, type EfeitoTexto } from "./nucleo";
import { EFEITOS as CLASSICO } from "./familia-classico";
import { EFEITOS as BRILHO } from "./familia-brilho";
import { EFEITOS as LUXO } from "./familia-luxo";

// O CATÁLOGO dos efeitos de texto: as três famílias juntas, e as regras de tamanho.
//
// Só servidor (o núcleo lê as fontes do disco). A tela recebe: os cartões da galeria como
// PNG pronto (public/efeitos-texto/, gerado por scripts/gerar-cartoes-efeitos.ts), a lista
// de ids e nomes em `lista.ts` (gerada pelo mesmo script), e o SVG de um texto específico
// pela rota /api/editor/efeito-texto. As três saem daqui, então não há segunda versão do
// desenho pra divergir.

/**
 * Fora da galeria, com o motivo -- o desenho continua na família pra ser refeito:
 *   letras_lampadas: as lâmpadas em cima da letra embolam "LANÇAMENTO" já no corpo grande,
 *   e na frase longa não se lê (visto na folha em foto real).
 */
const FORA = new Set(["letras_lampadas"]);

export const EFEITOS_TEXTO: EfeitoTexto[] = [...CLASSICO, ...BRILHO, ...LUXO].filter((e) => !FORA.has(e.id));

export const EFEITO_TEXTO_POR_ID: Record<string, EfeitoTexto> = Object.fromEntries(EFEITOS_TEXTO.map((e) => [e.id, e]));

/**
 * O corpo da letra, em fração da ALTURA do vídeo. 5,2% de 1920 são 100px: título de Reels
 * que se lê no celular sem tapar o cômodo.
 */
export const CORPO_EFEITO = 0.052;

/** Quanto da largura do vídeo o efeito pode ocupar. Sobra margem pro corte do feed. */
export const LARGURA_MAXIMA = 0.9;

/**
 * Desenha um efeito num vídeo de W×H, reduzindo o corpo quando não cabe na largura.
 *
 * "Aceita financiamento" em Cinzel espaçado passa de 1080px num corpo que "3 quartos" usa
 * folgado. Sem esta conta a frase longa sai cortada nas duas pontas -- e a borda do vídeo
 * não dá erro nenhum. A redução é proporcional, mas o desenho NÃO escala linear com o
 * corpo (brilho e contorno têm piso em pixel): o "Neon rosa" em 4:5 passava 1% depois de
 * uma redução só. Então repete até caber, no máximo quatro vezes.
 */
export function desenharEfeitoNoVideo(
  e: EfeitoTexto,
  texto: string,
  W: number,
  H: number,
  opcoes: { fracao?: number; prefixo?: string } = {}
): { svg: string; largura: number; altura: number; corpo: number } {
  const corpo = Math.max(12, Math.round(H * (opcoes.fracao ?? CORPO_EFEITO)));
  const d = desenharEfeito(e, texto, corpo, opcoes.prefixo);
  const limite = W * LARGURA_MAXIMA;
  let atual = { ...d, corpo };
  for (let i = 0; i < 4 && atual.largura > limite && atual.corpo > 10; i++) {
    const menor = Math.max(10, Math.min(atual.corpo - 1, Math.floor(atual.corpo * (limite / atual.largura))));
    atual = { ...desenharEfeito(e, texto, menor, opcoes.prefixo), corpo: menor };
  }
  return atual;
}
