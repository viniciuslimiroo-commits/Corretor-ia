// A ESTRUTURA DO IMÓVEL É INTOCÁVEL.
//
// Regra fixada pelo dono em 20/09/2026, olhando um resultado de "mobiliar" em que a IA
// mexeu na parede e nas janelas do cômodo: "quero evitar completamente esse tipo de
// alteração. A IA não deve criar, remover ou modificar janelas, portas, paredes, cômodos,
// telhado, piscina, muros, terreno ou qualquer outro elemento estrutural que já exista na
// imagem. Esses elementos só devem ser alterados quando o próprio usuário pedir."
//
// Por que isso é regra do PRODUTO e não capricho de prompt: o corretor anuncia um imóvel
// que existe. Uma janela a mais no anúncio é informação falsa sobre a coisa vendida --
// risco no Código de Defesa do Consumidor pra ele, e perda de confiança no Encena no dia
// em que o comprador visitar. Mobília, piso, parede, luz e decoração são aparência e podem
// mudar (com o selo de imagem ilustrativa); janela, porta, parede, laje e lote são o imóvel.
//
// Por que fica AQUI e não dentro de cada ação: a regra tem que valer pra todas as
// ferramentas que geram imagem -- fotos (api/gerar), terreno (api/terreno/ia) e planta
// humanizada (api/planta/humanizar) -- e pra qualquer ação nova que entre depois. Cada
// rota passa o texto do prompt por uma função daqui; `scripts/testar-preservacao.ts`
// falha se alguma delas parar de fazer isso.
//
// O texto é em inglês porque é a língua dos modelos, e é ITEMIZADO de propósito: pedido
// genérico ("mantenha a arquitetura") o modelo interpreta como estilo; lista com nome de
// cada peça e a palavra "same number" ele obedece.

/** O contrato que vale pra foto de um ambiente ou de uma fachada. */
export const ESTRUTURA_FIXA =
  "STRUCTURE IS FIXED -- this is a photo of a real property being advertised, and the building must survive the edit untouched." +
  " Do NOT add, remove, move, resize, reshape or replace any window, door, doorway, arch, wall, partition, column, beam, staircase," +
  " ceiling, roof, floor level, built-in cabinetry, balcony, pool, gate, fence, wall of the lot or any other structural element." +
  " The result must keep exactly the same number of windows and doors, in the same positions, with the same shapes, sizes and frames," +
  " the same room outline and proportions, and the same camera angle, framing and perspective as the original photo." +
  " Nothing structural may be invented, and nothing that exists in the original may disappear.";

/** Quando a própria instrução da pessoa pede uma mudança (editar com texto, refinar). */
export const ESTRUTURA_FIXA_SALVO_PEDIDO =
  ESTRUTURA_FIXA + " The single exception is what this instruction explicitly asks to change; everything it does not name stays as it is.";

/** Terreno e lote: a IA pode acrescentar o que foi pedido, o chão continua sendo aquele. */
export const TERRENO_FIXO =
  "THE LOT IS FIXED -- keep the terrain exactly as photographed: the boundaries and their proportions, the slope and shape of the ground," +
  " existing trees and vegetation at the edges, walls, fences, posts, gates, kerbs, the road, neighbouring buildings, the horizon line," +
  " and the camera angle and framing. Any existing construction on the lot keeps its exact walls, windows, doors and roof." +
  " Only what this instruction asks for may be added to the lot; nothing that exists may be moved or removed.";

/** Planta humanizada: o desenho técnico manda na geometria. */
export const PLANTA_FIXA =
  "THE FLOOR PLAN IS FIXED -- reproduce exactly the same layout as the technical drawing: the same rooms, in the same positions," +
  " with the same wall lines, proportions and areas, and every door and window opening where the drawing puts it." +
  " Do not add, remove, merge, resize or move any room, wall, door or window, and do not change the orientation of the plan.";

/**
 * Cola o contrato no fim do pedido ao modelo.
 *
 * No fim, e não no começo, porque é a última instrução que o modelo lê antes de gerar --
 * e é a que precisa ganhar da vontade dele de "melhorar" o ambiente. Prompt vazio (o
 * upscale, que não usa modelo de IA) passa reto.
 */
export function comEstruturaPreservada(prompt: string, contrato: string = ESTRUTURA_FIXA): string {
  const texto = prompt.trim();
  if (!texto) return texto;
  if (texto.includes("STRUCTURE IS FIXED") || texto.includes("THE LOT IS FIXED") || texto.includes("THE FLOOR PLAN IS FIXED")) return texto;
  return `${texto} ${contrato}`;
}
