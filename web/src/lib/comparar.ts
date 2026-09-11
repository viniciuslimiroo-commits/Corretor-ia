import sharp from "sharp";

// Detecta o caso "o modelo devolveu praticamente a mesma foto".
//
// É um item aberto do Sprint 2 do plano: "Fallback por resultado idêntico ao original
// (o caso que aconteceu com Nano Banana no Esvaziar) -- hoje só cobre erro de chamada,
// não resultado ruim silencioso". Esse é o pior tipo de falha do produto: a chamada dá
// 200, o crédito é debitado, e o corretor recebe de volta a foto que ele mesmo subiu.
//
// LIMIAR CALIBRADO, NÃO CHUTADO. Medido em 11/09/2026 sobre os 7 resultados do próprio
// teste de pipeline, comparando cada resultado com a foto de origem (diferença média por
// pixel, 0-255, depois de normalizar tamanho para 128x128 e contraste):
//
//    7,00  esvaziar via nano-banana   <- o defeito conhecido, devolveu quase igual
//   16,35  trocar piso                <- a MENOR mudança legítima medida
//   16,84  trocar céu
//   19,51  melhorar
//   29,59  esvaziar via flux kontext
//   36,52  mobiliar via flux kontext
//   44,97  mobiliar via nano-banana
//    0,00  controle: a mesma imagem contra ela mesma
//
// O defeito (7,00) e a menor mudança real (16,35) estão bem separados, então 11 cai no
// meio do vão e não em cima de nenhuma amostra. Base pequena (n=7, com um único caso de
// defeito): se aparecer falso positivo, é aqui que se mexe, e com dado novo.
export const LIMITE_IGUAL = 11;

// Em quais ações a checagem vale.
//
// Só as duas que transformam a CENA INTEIRA. A medida é global, então ela só faz sentido
// quando a mudança esperada também é global:
//
//   remover_objeto  fora: apagar um objeto pequeno muda pouquíssimo pixel numa foto
//                   grande. Uma remoção correta pode dar diferença abaixo de 11 e seria
//                   rejeitada. O jeito certo seria comparar só dentro da máscara, e isso
//                   não tem calibração ainda -- então fica de fora em vez de entrar
//                   com limiar inventado.
//   melhorar        fora: a exposição já foi corrigida deterministicamente ANTES do
//                   modelo, e o trabalho dele ali é só refinar ruído. Resultado parecido
//                   com a entrada é o comportamento CORRETO dessa ação, não defeito.
//   trocar_ceu      fora: numa fachada com pouco céu, a mudança legítima é pequena. A
//                   amostra (16,84) veio de uma foto com muito céu, então não sustenta
//                   o caso geral.
export const ACOES_COM_CHECAGEM_DE_IGUALDADE = new Set(["mobiliar", "esvaziar"]);

/**
 * Diferença média por pixel entre duas imagens, de 0 (idênticas) a 255.
 *
 * Normaliza tamanho e contraste antes de comparar: sem isso, uma simples recompressão
 * ou uma mudança de resolução já daria diferença, e a medida responderia sobre o
 * encanamento em vez de sobre o conteúdo.
 */
export async function diferencaMedia(a: Buffer, b: Buffer): Promise<number> {
  const preparar = (bytes: Buffer) =>
    sharp(bytes).resize(128, 128, { fit: "fill" }).greyscale().normalise().raw().toBuffer();

  const [x, y] = await Promise.all([preparar(a), preparar(b)]);
  let soma = 0;
  for (let i = 0; i < x.length; i++) soma += Math.abs(x[i] - y[i]);
  return soma / x.length;
}

/** true = o modelo devolveu essencialmente a foto de entrada. */
export async function pareceIgual(acao: string, entrada: Buffer, saida: Buffer): Promise<boolean> {
  if (!ACOES_COM_CHECAGEM_DE_IGUALDADE.has(acao)) return false;
  return (await diferencaMedia(entrada, saida)) < LIMITE_IGUAL;
}
