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

/**
 * O que está ESCONDIDO na foto é o único lugar onde o modelo necessariamente inventa.
 *
 * Achado em 21/09/2026, na própria casa do dono: a instrução mandava "limpar a calçada", o
 * modelo apagou a planta que cobria um pedaço da parede e desenhou ali uma janela gradeada
 * que ninguém sabe se existe. Não adianta proibir "inventar janela" sem dizer o que fazer
 * com o trecho que a planta tapava -- pedido de limpeza é justamente o que descobre a área
 * que ninguém pode conferir.
 */
export const OCLUSAO_PRESERVADA =
  " Anything that hides part of the building in the original photo -- a plant, a tree, a car, a pole, a person, furniture, clutter --" +
  " must stay exactly where it is, hiding exactly the same area, UNLESS this instruction explicitly asks for that thing to be taken out or replaced." +
  " Either way you do not know what is behind it and must not guess: wherever something is removed, or a surface is only partly visible," +
  " continue that surface as the plain material around it -- never place a window, door, opening, vent, niche or any other feature in an area you cannot see." +
  " A request to clean or tidy the scene means loose rubbish and dirt on the ground, never anything that covers a wall, an opening or the roof.";

/**
 * "Trocar a janela" não é "abrir a janela".
 *
 * As duas versões da casa geradas em 20/09 ampliaram TODAS as aberturas e criaram uma janela
 * de esquina, mesmo com a instrução dizendo "inside each existing window opening, keeping the
 * exact dimensions". Esquadria, vidro, cor e grade são acabamento; o buraco na parede é obra.
 */
export const ABERTURA_NAO_CRESCE =
  " A window or door may be re-glazed, re-framed, repainted or have its bars and shutters changed, but the OPENING in the wall keeps its exact" +
  " outline, width, height and sill level: never turn a window into a floor-to-ceiling, panoramic, corner or wrap-around window," +
  " never merge two openings into one, and never extend an opening onto another wall or around a corner.";

/** O contrato que vale pra foto de um ambiente ou de uma fachada. */
export const ESTRUTURA_FIXA =
  "STRUCTURE IS FIXED -- this is a photo of a real property being advertised, and the building must survive the edit untouched." +
  " Do NOT add, remove, move, resize, reshape or replace any window, door, doorway, arch, wall, partition, column, beam, staircase," +
  " ceiling, roof, floor level, built-in cabinetry, balcony, pool, gate, fence, wall of the lot or any other structural element." +
  " The result must keep exactly the same number of windows and doors, in the same positions, with the same shapes, sizes and frames," +
  " the same room outline and proportions, and the same camera angle, framing and perspective as the original photo." +
  " Nothing structural may be invented, and nothing that exists in the original may disappear." +
  ABERTURA_NAO_CRESCE +
  OCLUSAO_PRESERVADA;

/**
 * Quando a própria instrução da pessoa pede uma mudança (editar com texto, refinar).
 *
 * A exceção cobre acabamento e objetos -- nunca obra. "Janelas modernas" é esquadria nova no
 * mesmo buraco; pra mexer no buraco a pessoa tem que pedir o buraco ("ampliar a janela",
 * "abrir uma porta aqui"). Sem esse limite o modelo lê qualquer pedido de janela como licença
 * pra reconstruir a fachada, que foi o que aconteceu em 20/09.
 */
export const ESTRUTURA_FIXA_SALVO_PEDIDO =
  ESTRUTURA_FIXA +
  " The single exception is what this instruction explicitly asks to change; everything it does not name stays as it is." +
  " That exception covers finishes, materials, colours, lighting, furniture and objects." +
  " It does NOT cover the structure above unless the instruction names the structural change itself in so many words" +
  " (for example \"enlarge this window\", \"open a new door here\", \"remove this wall\")." +
  " Asking for new, modern or different windows, doors or gates means new frames, glass and finish in the existing openings, nothing more.";

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
