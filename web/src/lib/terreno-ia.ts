// O que a IA faz com a foto de um terreno. Vender lote é vender o que ainda não existe:
// quem olha uma foto de mato alto não enxerga a casa, e é aí que o anúncio morre.
//
// Cada ação aqui é UMA imagem de IA e custa 1 crédito. As linhas e medidas do lote
// continuam sendo desenho exato, de graça, na mesma tela -- exato é exato, ilustração é
// ilustração, e cada uma sai com o selo que lhe cabe.

export type CampoTerreno = {
  chave: string;
  rotulo: string;
  opcoes: { valor: string; rotulo: string; en: string }[];
  padrao: string;
};

export type AcaoTerreno = {
  id: string;
  rotulo: string;
  descricao: string;
  /** Selo gravado na imagem. O da casa é o mais importante: ela NÃO vem com o terreno. */
  selo: string;
  campos?: CampoTerreno[];
  /** Só a construção aceita foto de referência (uma casa parecida com a que a pessoa quer). */
  aceitaReferencia?: boolean;
  prompt: (p: Record<string, string>, temReferencia: boolean) => string;
};

// Trecho repetido em toda ação: o que NÃO pode mudar. Sem isto o modelo troca o céu,
// move o horizonte e devolve outro lugar -- e aí a foto não é mais daquele terreno.
const MANTER =
  ` Keep the place itself unchanged: same terrain shape and slope,` +
  ` same sky, same weather, same time of day, same sunlight direction, same neighbouring buildings, streets, poles, fences and distant landscape.` +
  ` Photorealistic, consistent shadows and lighting, natural colors, same photo grain and quality. No text, no labels, no watermark.`;

export const TIPOS_CASA = [
  { valor: "terrea", rotulo: "Térrea", en: "single-storey house" },
  { valor: "sobrado", rotulo: "Sobrado", en: "two-storey house" },
  { valor: "alto_padrao", rotulo: "Alto padrão", en: "large high-end two-storey house" },
  { valor: "chacara", rotulo: "Casa de campo", en: "country house with a wide porch" },
];

export const ESTILOS_CASA = [
  { valor: "moderna", rotulo: "Moderna", en: "modern, clean straight lines, large glass panes, flat roof" },
  { valor: "contemporanea", rotulo: "Contemporânea", en: "Brazilian contemporary, wood cladding, exposed concrete and glass" },
  { valor: "colonial", rotulo: "Colonial", en: "Brazilian colonial, clay roof tiles, white walls, wooden shutters" },
  { valor: "rustica", rotulo: "Rústica", en: "rustic, stone and wood, sloped clay tile roof" },
  { valor: "praiana", rotulo: "Praiana", en: "Brazilian beach house, light woods, wide verandas, natural fibers" },
];

/**
 * De onde a casa é vista.
 *
 * Medido: com a foto tirada do chão, o modelo IGNORA "mantenha o ângulo" e devolve uma
 * vista aérea -- e ele tem razão, porque do chão não cabe casa, piscina e jardim no mesmo
 * quadro. Em vez de esconder isso, a escolha é da pessoa, e o padrão é o que ele faz bem.
 */
export const ENQUADRAMENTOS = [
  { valor: "aerea", rotulo: "Vista de cima", en: "" },
  { valor: "manter", rotulo: "Mesmo ângulo da foto", en: "" },
];

export const EXTRAS_CASA = [
  { valor: "piscina", rotulo: "Piscina", en: "a swimming pool in the yard" },
  { valor: "garagem", rotulo: "Garagem 2 vagas", en: "a carport for two cars" },
  { valor: "gourmet", rotulo: "Varanda gourmet", en: "a covered gourmet veranda with a barbecue" },
  { valor: "jardim", rotulo: "Jardim", en: "landscaped garden with grass and plants" },
  { valor: "muro", rotulo: "Muro e portão", en: "a perimeter wall with an entrance gate" },
];

const rot = (lista: { valor: string; en: string }[], v: string | undefined, padrao: string) =>
  lista.find((o) => o.valor === v)?.en ?? padrao;

export const ACOES_TERRENO: AcaoTerreno[] = [
  {
    id: "limpar",
    rotulo: "Limpar o terreno",
    descricao: "Tira mato alto, entulho e lixo. O relevo e as árvores grandes ficam.",
    selo: "Imagem ilustrativa · terreno limpo digitalmente",
    prompt: () =>
      `Show this same piece of land cleaned up and ready to be sold: remove the tall weeds, overgrown brush, dry scrub, litter, rubble and debris.` +
      ` Leave neatly cut low grass and bare earth where the vegetation was.` +
      ` Keep the shape and slope of the terrain exactly as it is, and keep the large established trees and the vegetation at the property edges.` +
      ` Do not add any building, wall, fence or structure.` +
      MANTER +
      ` Keep the exact same camera angle, horizon line, perspective and framing as the original photograph.`,
  },
  {
    id: "terraplanar",
    rotulo: "Terraplanagem",
    descricao: "Mostra o lote nivelado, terra batida, pronto pra obra.",
    selo: "Imagem ilustrativa · terraplanagem simulada",
    prompt: () =>
      `Show this same piece of land after earthmoving and grading: a flat, level, compacted bare-earth building pad, with clean graded soil and tidy edges.` +
      ` Remove the vegetation on the plot itself. Keep the surrounding landscape, the trees at the edges and the general terrain level.` +
      ` Do not add any building, machine, wall or fence.` +
      MANTER +
      ` Keep the exact same camera angle, horizon line, perspective and framing as the original photograph.`,
  },
  {
    id: "murar",
    rotulo: "Murar o terreno",
    descricao: "Fecha o lote com muro e portão.",
    selo: "Imagem ilustrativa · muro simulado",
    prompt: () =>
      `Add a realistic perimeter wall with an entrance gate around this plot of land, following the natural boundaries and the slope of the terrain.` +
      ` Plain rendered masonry wall, around 2 metres tall, in a neutral colour, with a simple metal gate facing the street.` +
      ` Keep the land inside tidy. Do not add a house or any other building.` +
      MANTER +
      ` Keep the exact same camera angle, horizon line, perspective and framing as the original photograph.`,
  },
  {
    id: "construir",
    rotulo: "Construir a casa",
    descricao: "Coloca no lote a casa que a pessoa descrever. Pode mandar a foto de uma casa parecida.",
    selo: "Imagem ilustrativa · casa sugerida, não incluída no terreno",
    aceitaReferencia: true,
    campos: [
      { chave: "tipo", rotulo: "Tipo", opcoes: TIPOS_CASA, padrao: "terrea" },
      { chave: "estilo", rotulo: "Estilo", opcoes: ESTILOS_CASA, padrao: "moderna" },
      { chave: "enquadramento", rotulo: "Enquadramento", opcoes: ENQUADRAMENTOS, padrao: "aerea" },
    ],
    prompt: (p, temReferencia) => {
      const extras = (p.extras ?? "")
        .split(",")
        .map((v) => EXTRAS_CASA.find((e) => e.valor === v.trim())?.en)
        .filter(Boolean);
      return (
        `Build a house standing on the empty land in the FIRST image: a ${rot(TIPOS_CASA, p.tipo, TIPOS_CASA[0].en)},` +
        ` ${rot(ESTILOS_CASA, p.estilo, ESTILOS_CASA[0].en)}.` +
        (extras.length ? ` Include ${extras.join(", ")}.` : "") +
        (temReferencia
          ? ` Use the SECOND image only as a style reference for the architecture, materials and colours -- do not copy its surroundings, its terrain or its background, and do not reproduce it identically.`
          : "") +
        ` The house must sit ON the ground, level with the terrain, at a believable size compared to the neighbouring buildings and the vegetation.` +
        (p.enquadramento === "manter"
          ? ` DO NOT move the camera. Keep the exact same viewpoint, eye level, framing and focal length as the original photograph, even if that means the house is seen from the street and is partly hidden by the terrain or the vegetation in the foreground. Never switch to an aerial or drone view.`
          : ` Show the result as an elevated three-quarter aerial view of the plot, high enough to see the whole house and yard, keeping the same location, the same horizon and the same neighbourhood visible behind it.`) +
        ` Cast the house shadow in the same direction as the existing shadows in the photo.` +
        ` Clear the plot where the house stands, and leave the rest of the land tidy.` +
        MANTER
      );
    },
  },
];

// Texto livre por último: é a saída pro que a gente não previu ("põe um galpão", "tira o
// poste", "deixa no fim de tarde"). O pedido da pessoa vai junto do MANTER, senão o modelo
// aproveita a liberdade e troca a foto inteira.
ACOES_TERRENO.push({
  id: "livre",
  rotulo: "Editar com texto",
  descricao: "Escreva o que quer ver no terreno. Ex.: “põe um galpão de 200 m² e cascalho na entrada”.",
  selo: "Imagem ilustrativa · editada digitalmente",
  aceitaReferencia: true,
  prompt: (p, temReferencia) =>
    `Edit the FIRST image, a photo of a plot of land, according to this request from the owner: "${p.texto ?? ""}".` +
    (temReferencia ? ` Use the SECOND image only as a style reference, never copying its surroundings or background.` : "") +
    ` Anything the request does not mention must stay exactly as it is in the photo.` +
    ` Whatever you add must sit on the ground with correct scale, perspective and shadow direction.` +
    MANTER +
    ` Keep the exact same camera angle, horizon line, perspective and framing as the original photograph.`,
});

export const LIMITE_TEXTO_LIVRE = 300;

export const ACAO_TERRENO_POR_ID: Record<string, AcaoTerreno> = Object.fromEntries(
  ACOES_TERRENO.map((a) => [a.id, a])
);
