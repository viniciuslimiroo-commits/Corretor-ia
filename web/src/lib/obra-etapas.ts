import { ESTILOS_CASA, TIPOS_CASA, type AcaoTerreno } from "./terreno-ia";

// A obra do início ao fim: o lote como está, a fundação, a alvenaria, a cobertura e a
// casa pronta. Existe porque a imagem única já responde "como ficaria" -- e não responde
// "isso é de verdade?". Ver a construção subir na MESMA foto faz o cliente entender que
// aquilo é projeção, não uma casa que existe. É o oposto de enganar.
//
// DUAS DECISÕES QUE MANDAM NO ARQUIVO:
//
// 1. ENCADEADO, não paralelo. Cada etapa recebe a imagem da etapa ANTERIOR, não a foto
//    original. Gerar as cinco a partir do terreno vazio dá cinco casas diferentes -- outro
//    telhado, outra janela, outra cor -- e o vídeo vira piscada em vez de obra. Encadear
//    custa uma espera por etapa e devolve a mesma casa subindo.
//
// 2. A ÚLTIMA ETAPA NUNCA TEM GENTE. Pessoa em obra é canteiro; pessoa em casa pronta é
//    morador, e morador inventado num anúncio é personagem vendendo um imóvel que ele não
//    mora. Quem aparece nas etapas do meio é equipe trabalhando, de longe, sem rosto --
//    e mesmo isso é opcional e vem desligado.

/** O que não pode mudar entre uma etapa e outra. Sem isto o modelo troca o lugar. */
const MESMO_LUGAR =
  ` Keep the plot, the terrain shape and slope, the horizon line, the neighbouring buildings, streets, poles, fences, trees and distant landscape exactly as they are in the image.` +
  ` Keep the same camera position, the same framing, the same focal length, the same sky, the same weather, the same time of day and the same sunlight direction.` +
  ` Photorealistic, consistent shadows, natural colours, same photo grain and quality. No text, no labels, no watermark, no logo.`;

/** O que a casa É, repetido em toda etapa pra ela não mudar de projeto no meio da obra. */
function aCasa(p: Record<string, string>): string {
  const tipo = TIPOS_CASA.find((t) => t.valor === p.tipo)?.en ?? TIPOS_CASA[0].en;
  const estilo = ESTILOS_CASA.find((e) => e.valor === p.estilo)?.en ?? ESTILOS_CASA[0].en;
  return `a ${tipo}, ${estilo}`;
}

/**
 * Equipe na obra. Vem desligado.
 *
 * "Distant" e "no recognizable faces" não são delicadeza: rosto reconhecível em peça
 * publicitária é imagem de pessoa, e imagem de pessoa precisa de autorização de quem
 * existe -- de quem não existe, precisa não ser confundido com quem existe.
 */
const COM_EQUIPE =
  ` Include a few construction workers in safety helmets and vests working on the site, seen from a distance, small in the frame, with no recognizable faces.`;
const SEM_EQUIPE = ` Do not include any people, animals or vehicles in motion.`;

const equipe = (p: Record<string, string>, permitido: boolean) =>
  permitido && p.equipe === "1" ? COM_EQUIPE : SEM_EQUIPE;

// O projeto é escolhido uma vez e viaja em TODAS as etapas: é o que faz a etapa 3 saber
// que está cobrindo a mesma casa que a etapa 2 levantou. Os mesmos campos da ação
// "Construir a casa", de propósito -- quem já usou aquela tela não reaprende nada.
const CAMPOS_PROJETO = [
  { chave: "tipo", rotulo: "Tipo", opcoes: TIPOS_CASA, padrao: "terrea" },
  { chave: "estilo", rotulo: "Estilo", opcoes: ESTILOS_CASA, padrao: "moderna" },
];

export type EtapaObra = AcaoTerreno & {
  /** Ordem no encadeamento. A etapa N recebe a imagem gerada pela etapa N-1. */
  ordem: number;
  /** O que a pessoa lê enquanto espera. */
  espera: string;
};

export const ETAPAS_OBRA: EtapaObra[] = [
  {
    id: "obra_fundacao",
    ordem: 1,
    rotulo: "Fundação",
    espera: "Marcando o terreno e abrindo a fundação…",
    descricao: "O terreno limpo, com a fundação e o baldrame da casa marcados no chão.",
    selo: "Imagem ilustrativa · obra simulada, não existe no terreno",
    prompt: (p) =>
      `Show this same plot of land at the very beginning of a house construction: the ground cleared and levelled where the house will stand,` +
      ` the foundation footings and concrete ground beams already poured, forming the outline of ${aCasa(p)} on the ground,` +
      ` with a few stacks of building materials and a small pile of sand and gravel at the side of the plot.` +
      ` No walls yet, nothing standing above knee height.` +
      equipe(p, true) +
      MESMO_LUGAR,
  },
  {
    id: "obra_estrutura",
    ordem: 2,
    rotulo: "Estrutura",
    espera: "Subindo os pilares e a alvenaria…",
    descricao: "Os pilares e as paredes de tijolo subindo sobre a fundação da etapa anterior.",
    selo: "Imagem ilustrativa · obra simulada, não existe no terreno",
    prompt: (p) =>
      `Advance the construction shown in this image to the structural stage: concrete columns and beams raised on the existing foundation,` +
      ` and unfinished red brick walls built up to full height following exactly the same outline already marked on the ground,` +
      ` forming ${aCasa(p)}. Openings for doors and windows are left empty. No roof yet, no plaster, no paint, no glass.` +
      ` Keep the same footprint, the same position and the same proportions as the foundation in the image -- this is the same house, one stage later.` +
      equipe(p, true) +
      MESMO_LUGAR,
  },
  {
    id: "obra_cobertura",
    ordem: 3,
    rotulo: "Cobertura",
    espera: "Fechando o telhado…",
    descricao: "O telhado fechado e as esquadrias colocadas, ainda sem acabamento.",
    selo: "Imagem ilustrativa · obra simulada, não existe no terreno",
    prompt: (p) =>
      // O tipo e o estilo precisam estar AQUI, e não só nas outras etapas: o telhado é o
      // que denuncia o estilo, e sem esta linha o modelo cobria casa colonial com laje
      // plana de casa moderna. Foi o teste que pegou.
      `Advance the construction shown in this image to the roofing stage of ${aCasa(p)}:` +
      ` the roof structure built and fully covered, with the roof shape and roofing material that this architectural style calls for,` +
      ` window and door frames installed with glass, and the walls plastered but still unpainted, in raw grey render.` +
      ` Keep the same footprint, the same wall positions, the same openings and the same proportions as in the image -- this is the same house, one stage later.` +
      ` No painted finish, no landscaping, no paving yet.` +
      equipe(p, true) +
      MESMO_LUGAR,
  },
  {
    id: "obra_pronta",
    ordem: 4,
    rotulo: "Pronta",
    espera: "Pintando e entregando a casa…",
    descricao: "A casa acabada, pintada, com o jardim e a entrada prontos.",
    selo: "Imagem ilustrativa · casa sugerida, não incluída no terreno",
    prompt: (p) =>
      `Show the construction in this image finished and delivered: ${aCasa(p)}, fully painted and finished,` +
      ` with the façade materials, the paving of the driveway and entrance, cut grass and simple landscaping in the yard.` +
      ` Keep the same footprint, the same roof shape, the same window and door positions and the same proportions as in the image -- this is the same house, completed.` +
      ` Remove every trace of the construction site: no scaffolding, no building materials, no rubble, no sand, no site fencing.` +
      // Aqui não é opção: casa pronta com gente é morador inventado, e isso não é obra, é
      // personagem. Ver a nota do topo do arquivo.
      SEM_EQUIPE +
      MESMO_LUGAR,
  },
];

// Todas as etapas carregam os mesmos campos de projeto. Atribuído aqui, e não repetido em
// cada objeto, porque quatro cópias da mesma lista é a receita de uma delas ficar pra trás.
for (const etapa of ETAPAS_OBRA) etapa.campos = CAMPOS_PROJETO;

export const ETAPA_OBRA_POR_ID: Record<string, EtapaObra> = Object.fromEntries(ETAPAS_OBRA.map((e) => [e.id, e]));

/** Quantos créditos a sequência inteira custa: uma imagem de IA por etapa. */
export const CUSTO_OBRA = ETAPAS_OBRA.length;

/** A etapa seguinte, ou null quando a obra acabou. */
export function proximaEtapa(id: string | null): EtapaObra | null {
  if (!id) return ETAPAS_OBRA[0];
  const atual = ETAPA_OBRA_POR_ID[id];
  if (!atual) return null;
  return ETAPAS_OBRA.find((e) => e.ordem === atual.ordem + 1) ?? null;
}
