// O que a IA faz com a foto de um terreno. Vender lote é vender o que ainda não existe:
// quem olha uma foto de mato alto não enxerga a casa, e é aí que o anúncio morre.
//
// Cada ação aqui é UMA imagem de IA e custa 1 crédito. As linhas e medidas do lote
// continuam sendo desenho exato, de graça, na mesma tela -- exato é exato, ilustração é
// ilustração, e cada uma sai com o selo que lhe cabe.
//
// A LISTA É CURTA DE PROPÓSITO. Preset não é capacidade -- o texto livre já faz qualquer
// coisa. O que um preset entrega é um prompt testado (com as restrições que ninguém
// digita: manter o relevo, manter as árvores, não construir) mais o selo correto. Preset
// que não tem restrição sutil pra proteger é só um botão a mais cobrando um crédito.
// Foi por isso que "terraplanagem" e "murar" saíram: nicho, e o texto livre cobre.

/**
 * O que a segunda imagem É. Muda o prompt inteiro: com a FOTO de uma casa parecida a IA
 * copia o jeitão; com a PLANTA da casa ela constrói aquela casa, seguindo os cômodos e a
 * silhueta. Perguntar é mais barato e mais confiável que adivinhar com um modelo de visão.
 */
export type Referencia = "nenhuma" | "casa" | "planta";

export const TIPOS_REFERENCIA = [
  { valor: "casa", rotulo: "Foto de uma casa parecida" },
  { valor: "planta", rotulo: "Planta da casa" },
];

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
  prompt: (p: Record<string, string>, referencia: Referencia) => string;
};

// Trecho repetido em toda ação: o que NÃO pode mudar. Sem isto o modelo troca o céu,
// move o horizonte e devolve outro lugar -- e aí a foto não é mais daquele terreno.
const MANTER =
  ` Keep the place itself unchanged: same terrain shape and slope,` +
  ` same sky, same weather, same time of day, same sunlight direction, same neighbouring buildings, streets, poles, fences and distant landscape.` +
  ` Photorealistic, consistent shadows and lighting, natural colors, same photo grain and quality.` +
  // Era "No text, no labels, no watermark", que numa foto com a marca d'água de outra
  // imobiliária vira ordem de APAGAR a marca dos outros. A instrução sempre quis dizer
  // "não invente texto seu" -- agora diz.
  ` Do not add any text, labels, captions or watermark of your own, and do not remove or alter anything already printed on the photograph.`;

// PORTE e PADRÃO são coisas diferentes, e estavam na mesma lista ("Alto padrão" convivia
// com "Térrea" e "Sobrado"). Quem vende lote não escolhe entre térrea e alto padrão --
// escolhe térrea POPULAR ou térrea ALTO PADRÃO, e são casas completamente diferentes.
export const TIPOS_CASA = [
  { valor: "terrea", rotulo: "Térrea", en: "single-storey house" },
  { valor: "sobrado", rotulo: "Sobrado", en: "two-storey house" },
  { valor: "chacara", rotulo: "Casa de campo", en: "country house with a wide porch" },
];

/**
 * O padrão do imóvel, do jeito que o mercado brasileiro fala.
 *
 * É o eixo que mais muda a imagem e o que faltava: "moderna" não diz se é uma casa de
 * financiamento popular ou uma de mil metros. O texto de cada um descreve MATERIAL e
 * ACABAMENTO, não adjetivo -- "simples" não gera imagem, "telha de fibrocimento, janela
 * de alumínio pequena, portão de correr" gera.
 */
export const PADROES_CASA = [
  {
    valor: "popular",
    rotulo: "Popular",
    en:
      "a compact, simple Brazilian working-class house of the kind financed by Minha Casa Minha Vida:" +
      " plain rendered and painted masonry walls in a light colour, a simple low-pitched roof with fibre-cement or plain ceramic tiles," +
      " small white aluminium window frames, a plain front door, no porch or a very small one," +
      " an uncovered concrete parking slab instead of a garage, and a low rendered front wall with a simple sliding metal gate",
  },
  {
    valor: "medio",
    rotulo: "Médio",
    en:
      "a comfortable Brazilian middle-class house: rendered and painted masonry with a ceramic tile roof," +
      " a covered carport for one or two cars, a small front veranda, larger aluminium window frames," +
      " a tidy rendered perimeter wall with a metal gate and a small front garden",
  },
  {
    valor: "alto",
    rotulo: "Alto padrão",
    en:
      "a high-end Brazilian house: generous proportions and ceiling heights, large floor-to-ceiling glass panes with slim dark frames," +
      " a mix of exposed concrete, natural stone cladding and wood, a wide covered garage," +
      " designed outdoor lighting and professional landscaping",
  },
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
    id: "construir",
    rotulo: "Construir a casa",
    descricao: "Coloca no lote a casa que a pessoa descrever. Pode mandar a foto de uma casa parecida.",
    selo: "Imagem ilustrativa · casa sugerida, não incluída no terreno",
    aceitaReferencia: true,
    campos: [
      { chave: "tipo", rotulo: "Tipo", opcoes: TIPOS_CASA, padrao: "terrea" },
      { chave: "padrao", rotulo: "Padrão", opcoes: PADROES_CASA, padrao: "medio" },
      { chave: "estilo", rotulo: "Estilo", opcoes: ESTILOS_CASA, padrao: "moderna" },
      { chave: "enquadramento", rotulo: "Enquadramento", opcoes: ENQUADRAMENTOS, padrao: "aerea" },
    ],
    prompt: (p, referencia) => {
      const extras = (p.extras ?? "")
        .split(",")
        .map((v) => EXTRAS_CASA.find((e) => e.valor === v.trim())?.en)
        .filter(Boolean);
      return (
        `Build a house standing on the empty land in the FIRST image: a ${rot(TIPOS_CASA, p.tipo, TIPOS_CASA[0].en)},` +
        ` ${rot(ESTILOS_CASA, p.estilo, ESTILOS_CASA[0].en)}.` +
        // O padrão vem DEPOIS do estilo de propósito: quando os dois puxam pra lados
        // diferentes ("moderna" + "popular"), o que o corretor precisa que vença é o
        // padrão -- casa popular com cara de moderna existe; casa popular do tamanho de
        // uma alto padrão não vende lote nenhum, vende decepção.
        ` The finishing standard is what matters most here: it must read as ${rot(PADROES_CASA, p.padrao, PADROES_CASA[1].en)}.` +
        (extras.length ? ` Include ${extras.join(", ")}.` : "") +
        (referencia === "casa"
          ? ` Use the SECOND image as the reference for the architecture: same overall look, roof type, materials, proportions and colours. Do not copy its surroundings, its terrain, its neighbours or its background -- only the house itself.`
          : referencia === "planta"
            ? ` The SECOND image is the FLOOR PLAN of the house to be built. Follow it: the same footprint shape, the same number and arrangement of rooms, the same proportions and the same window and door positions, turned into a real three-dimensional house. Do not copy the drawing itself into the photo.`
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
  prompt: (p, referencia) =>
    `Edit the FIRST image, a photo of a plot of land, according to this request from the owner: "${p.texto ?? ""}".` +
    (referencia === "planta"
      ? ` The SECOND image is a floor plan: follow its footprint and room layout for anything you build.`
      : referencia === "casa"
        ? ` Use the SECOND image as the reference for the architecture only, never copying its surroundings or background.`
        : "") +
    ` Anything the request does not mention must stay exactly as it is in the photo.` +
    ` Whatever you add must sit on the ground with correct scale, perspective and shadow direction.` +
    MANTER +
    ` Keep the exact same camera angle, horizon line, perspective and framing as the original photograph.`,
});

export const LIMITE_TEXTO_LIVRE = 300;

export const ACAO_TERRENO_POR_ID: Record<string, AcaoTerreno> = Object.fromEntries(
  ACOES_TERRENO.map((a) => [a.id, a])
);
