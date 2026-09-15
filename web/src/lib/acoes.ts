// Catálogo de ações do Encena. Uma fonte só para servidor e tela:
//   - a tela desenha os controles a partir de `parametros`
//   - /api/gerar valida os valores recebidos contra o catálogo e monta o prompt
//   - /api/job lê selo, checagem de igualdade e provedores daqui
//
// Fase A do gap com a Pedra (docs/gap-pedra.md): paridade em edição de foto. O que a
// Pedra tem e aqui não entra de propósito: "remover marca d'água" (risco jurídico).
//
// Sem segredo neste arquivo: ele é importado pelo navegador.

import type { Provedor } from "./fal";

export type Grupo = "decorar" | "melhorar" | "outro";

export type Opcao = { valor: string; rotulo: string; en: string };

export type Parametro = {
  chave: string;
  rotulo: string;
  tipo: "opcoes" | "texto";
  opcoes?: Opcao[];
  padrao?: string;
  /** Mostra um campo livre "Outro" além das opções. */
  permiteOutro?: boolean;
  placeholder?: string;
  max?: number;
  ajuda?: string;
};

export type DefAcao = {
  id: string;
  rotulo: string;
  grupo: Grupo;
  descricao: string;
  parametros: Parametro[];
  /** "nao": sem pincel. "opcional": pincel pode restringir a área. "obrigatoria": sem traço não gera. */
  mascara: "nao" | "opcional" | "obrigatoria";
  /** Aceita uma segunda foto como referência de mobília/estilo. */
  referencia?: boolean;
  /** null = não chama modelo de IA (só upscale). */
  provedores: [Provedor, Provedor] | null;
  /** Provedores quando há máscara (inpainting). */
  provedoresComMascara?: [Provedor, Provedor];
  selo: string | null;
  checarIgual: boolean;
  prompt: (p: Record<string, string>) => string;
  /** Como é um resultado CERTO, em inglês: vai pro modelo de visão que julga pedidos de estorno. */
  esperado?: (p: Record<string, string>) => string;
  /** Textos do pincel quando a máscara é opcional (o padrão serve pro "mobiliar"). */
  rotulosMascara?: { opcao: string; ajuda: string; titulo: string };
};

// ---------- listas de opções ----------

export const TIPOS_ESPACO: Opcao[] = [
  { valor: "auto", rotulo: "Detectar sozinho", en: "" },
  { valor: "sala", rotulo: "Sala de estar", en: "living room" },
  { valor: "quarto", rotulo: "Quarto", en: "bedroom" },
  { valor: "cozinha", rotulo: "Cozinha", en: "kitchen" },
  { valor: "jantar", rotulo: "Sala de jantar", en: "dining room" },
  { valor: "integrado", rotulo: "Cozinha e sala integradas", en: "open-plan kitchen and living room" },
  { valor: "escritorio", rotulo: "Home office", en: "home office" },
  { valor: "banheiro", rotulo: "Banheiro", en: "bathroom" },
  { valor: "varanda", rotulo: "Varanda ou sacada", en: "balcony" },
  { valor: "gourmet", rotulo: "Área gourmet", en: "outdoor gourmet area with barbecue" },
  { valor: "infantil", rotulo: "Quarto infantil", en: "kids bedroom" },
  { valor: "entrada", rotulo: "Hall de entrada", en: "entrance hall" },
];

// Os nove da Pedra têm equivalente aqui, menos "Pirenéus", que não diz nada pra
// brasileiro. No lugar entram Praiano e Tropical, que corretor de Goiânia, Rio ou
// Florianópolis pede de verdade.
export const ESTILOS: Opcao[] = [
  { valor: "moderno", rotulo: "Moderno", en: "modern" },
  { valor: "minimalista", rotulo: "Minimalista", en: "minimalist" },
  { valor: "escandinavo", rotulo: "Escandinavo", en: "Scandinavian, light woods and soft neutrals" },
  { valor: "contemporaneo", rotulo: "Contemporâneo", en: "contemporary" },
  { valor: "industrial", rotulo: "Industrial", en: "industrial, metal and raw textures" },
  { valor: "classico", rotulo: "Clássico", en: "classic elegant" },
  { valor: "boemio", rotulo: "Boêmio", en: "bohemian, layered textiles and plants" },
  { valor: "rustico", rotulo: "Rústico", en: "rustic wood and stone" },
  { valor: "praiano", rotulo: "Praiano", en: "Brazilian beach house, light woods, linen, natural fibers, white and sand tones" },
  { valor: "tropical", rotulo: "Tropical", en: "Brazilian tropical contemporary, lush plants, warm woods, rattan" },
];

export const CRIATIVIDADE: Opcao[] = [
  { valor: "alta", rotulo: "Alta", en: "strong, magazine-quality transformation" },
  { valor: "media", rotulo: "Média", en: "balanced, restrained changes" },
];

export const MOVEIS_RENOVAR: Opcao[] = [
  { valor: "auto", rotulo: "Decidir sozinho", en: "" },
  { valor: "com", rotulo: "Com móveis", en: "Furnish it with matching furniture." },
  { valor: "vazio", rotulo: "Sem móveis", en: "Leave the space unfurnished; show only the renovated finishes." },
];

export const MATERIAIS_PISO: Opcao[] = [
  { valor: "porcelanato", rotulo: "Porcelanato claro", en: "light large-format porcelain tiles" },
  { valor: "madeira_clara", rotulo: "Madeira clara", en: "light oak hardwood planks" },
  { valor: "madeira_escura", rotulo: "Madeira escura", en: "dark walnut hardwood planks" },
  { valor: "laminado", rotulo: "Laminado", en: "laminate wood-look flooring" },
  { valor: "cimento", rotulo: "Cimento queimado", en: "polished concrete (cimento queimado)" },
  { valor: "marmore", rotulo: "Mármore", en: "white marble with soft grey veins" },
  { valor: "vinilico", rotulo: "Vinílico", en: "vinyl plank flooring" },
  { valor: "ladrilho", rotulo: "Ladrilho hidráulico", en: "patterned hydraulic cement tiles" },
  { valor: "deck", rotulo: "Deck de madeira", en: "wooden deck boards" },
  { valor: "grama", rotulo: "Grama", en: "natural grass lawn" },
];

export const MATERIAIS_PAREDE: Opcao[] = [
  { valor: "branco", rotulo: "Branco", en: "smooth white paint" },
  { valor: "off_white", rotulo: "Off-white", en: "warm off-white paint" },
  { valor: "cinza", rotulo: "Cinza claro", en: "light grey paint" },
  { valor: "bege", rotulo: "Bege", en: "beige paint" },
  { valor: "verde", rotulo: "Verde suave", en: "soft sage green paint" },
  { valor: "azul", rotulo: "Azul petróleo", en: "deep teal-blue paint" },
  { valor: "terracota", rotulo: "Terracota", en: "terracotta paint" },
  { valor: "madeira", rotulo: "Painéis de madeira", en: "vertical wood slat panels" },
  { valor: "tijolo", rotulo: "Tijolo aparente", en: "exposed brick" },
  { valor: "azulejo", rotulo: "Azulejo branco", en: "white subway tiles" },
];

export const CEUS: Opcao[] = [
  { valor: "ensolarado", rotulo: "Ensolarado", en: "a clear bright blue sky with a few soft white clouds, midday light" },
  { valor: "azul_limpo", rotulo: "Azul limpo", en: "a clear deep blue sky with no clouds" },
  { valor: "amanhecer", rotulo: "Amanhecer", en: "a soft early-morning sky with pale golden light" },
  { valor: "entardecer", rotulo: "Entardecer", en: "a golden-hour sunset sky, gentle warm orange and pink gradient, not overly dark or saturated" },
  { valor: "noite", rotulo: "Noite", en: "a clear night sky, deep blue with stars; keep the building's lights warm and welcoming" },
];

// ---------- helpers ----------

function en(lista: Opcao[], valor: string | undefined, padrao = ""): string {
  if (!valor) return padrao;
  const achou = lista.find((o) => o.valor === valor);
  if (achou) return achou.en;
  // Valor livre ("Outro"): já veio limpo do servidor (só letras, números e espaços).
  return valor;
}

const PRESERVAR =
  "Keep the walls, windows, doors, ceiling and lighting EXACTLY as they are -- do not alter the architecture or the camera angle.";

// ---------- catálogo ----------

export const ACOES: DefAcao[] = [
  {
    id: "mobiliar",
    rotulo: "Mobiliar",
    grupo: "decorar",
    descricao: "Para ambiente VAZIO: coloca móveis e decoração. Se a foto já tem móveis, use Renovar — aqui eles seriam trocados.",
    parametros: [
      { chave: "tipo_espaco", rotulo: "Tipo de espaço", tipo: "opcoes", opcoes: TIPOS_ESPACO, padrao: "auto", permiteOutro: true },
      { chave: "estilo", rotulo: "Estilo", tipo: "opcoes", opcoes: ESTILOS, padrao: "moderno", permiteOutro: true },
      { chave: "criatividade", rotulo: "Intensidade", tipo: "opcoes", opcoes: CRIATIVIDADE, padrao: "alta", ajuda: "Alta transforma mais; Média muda menos." },
    ],
    mascara: "opcional",
    referencia: true,
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    provedoresComMascara: ["fal-ai/flux-pro/v1/fill", "fal-ai/nano-banana/edit"],
    selo: "Imagem ilustrativa · mobília virtual",
    checarIgual: true,
    rotulosMascara: { opcao: "Aplicar só onde eu pintar", ajuda: "Sem marcar, a IA decide a posição sozinha.", titulo: "Pinte onde aplicar" },
    prompt: (p) => {
      const espaco = en(TIPOS_ESPACO, p.tipo_espaco) || "room";
      const estilo = en(ESTILOS, p.estilo, "modern");
      const forca = en(CRIATIVIDADE, p.criatividade, CRIATIVIDADE[0].en);
      const ref = p.referencia === "1" ? " Use the furniture pieces, colors and style of the second image as the reference." : "";
      return `Furnish this empty ${espaco} in a ${estilo} style (${forca}). ${PRESERVAR} Add only photorealistic furniture and decor at correct scale for the space. Photorealistic result.${ref}`;
    },
    esperado: (p) =>
      `The room now contains photorealistic furniture and decor in a ${en(ESTILOS, p.estilo, "modern")} style${p.tipo_espaco && p.tipo_espaco !== "auto" ? `, appropriate for a ${en(TIPOS_ESPACO, p.tipo_espaco)}` : ""}, at correct scale, with walls, windows, doors and camera angle unchanged.`,
  },
  {
    id: "renovar",
    rotulo: "Renovar",
    grupo: "decorar",
    descricao: "Para ambiente JÁ MOBILIADO: reforma virtual com acabamento, piso, parede e luz novos.",
    parametros: [
      { chave: "tipo_espaco", rotulo: "Tipo de espaço", tipo: "opcoes", opcoes: TIPOS_ESPACO, padrao: "auto", permiteOutro: true },
      { chave: "estilo", rotulo: "Estilo", tipo: "opcoes", opcoes: ESTILOS, padrao: "moderno", permiteOutro: true },
      { chave: "criatividade", rotulo: "Intensidade", tipo: "opcoes", opcoes: CRIATIVIDADE, padrao: "alta" },
      { chave: "moveis", rotulo: "Móveis", tipo: "opcoes", opcoes: MOVEIS_RENOVAR, padrao: "auto" },
    ],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: "Imagem ilustrativa · reforma virtual",
    checarIgual: true,
    prompt: (p) => {
      const espaco = en(TIPOS_ESPACO, p.tipo_espaco) || "room";
      const estilo = en(ESTILOS, p.estilo, "modern");
      const forca = en(CRIATIVIDADE, p.criatividade, CRIATIVIDADE[0].en);
      const moveis = en(MOVEIS_RENOVAR, p.moveis);
      return `Renovate this ${espaco} in a ${estilo} style (${forca}): update the flooring, wall finishes, lighting fixtures and decor with photorealistic materials. Keep the room's architecture -- wall positions, windows, doors, ceiling -- and the camera angle exactly the same. ${moveis} Photorealistic result.`.replace(/\s+/g, " ");
    },
    esperado: (p) =>
      `The same room with visibly renovated finishes (floor, walls, lighting, decor) in a ${en(ESTILOS, p.estilo, "modern")} style; wall positions, windows, doors and camera angle unchanged.${p.moveis === "vazio" ? " No furniture." : p.moveis === "com" ? " Furnished with matching furniture." : ""}`,
  },
  {
    id: "esvaziar",
    rotulo: "Esvaziar",
    grupo: "decorar",
    descricao: "Tira os móveis e objetos e devolve o ambiente vazio. Bom antes de mobiliar de outro jeito.",
    parametros: [],
    mascara: "nao",
    provedores: ["fal-ai/flux-pro/kontext", "fal-ai/nano-banana/edit"],
    selo: "Imagem ilustrativa · mobília removida digitalmente",
    checarIgual: true,
    prompt: () =>
      "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
    esperado: () => "The room is empty: no furniture, rugs or decor remain; floor and walls are reconstructed naturally; architecture, windows, doors and lighting unchanged.",
  },
  {
    // Dois modos, como na Pedra: automático (descreve o que sair, ou deixa em branco pra
    // tirar bagunça) e pincel. Com pincel usa os modelos de apagar por máscara; sem
    // pincel é o modelo de edição com prompt, que acha o objeto sozinho.
    id: "remover_objeto",
    rotulo: "Remover objeto",
    grupo: "decorar",
    descricao: "Tira da foto o que atrapalha: descreva ou pinte por cima.",
    parametros: [
      {
        chave: "o_que",
        rotulo: "O que remover",
        tipo: "texto",
        placeholder: "Ex.: o carro na frente da casa · as caixas no canto · os fios na parede",
        max: 120,
        ajuda: "Em branco, a IA tira bagunça, objetos pequenos e itens pessoais, e deixa os móveis.",
      },
    ],
    mascara: "opcional",
    rotulosMascara: { opcao: "Pintar na foto o que remover", ajuda: "Mais preciso. Sem marcar, a IA acha pelo que você descreveu.", titulo: "Pinte o que remover" },
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    provedoresComMascara: ["fal-ai/object-removal/mask", "fal-ai/flux-pro/v1/erase"],
    selo: "Imagem ilustrativa · objeto removido digitalmente",
    // SEM checagem de igualdade: remover um objeto muda poucos pixels, e a medida
    // global lê "não mudou nada" mesmo quando o modelo acertou -- foi exatamente o que
    // aconteceu no primeiro teste do modo automático (12/09/2026), os dois modelos
    // descartados. Quem julga "não removeu" é o avaliador, comparando antes e depois.
    checarIgual: false,
    prompt: (p) =>
      p.o_que
        ? `Remove ${p.o_que} from this real-estate photo completely, including its shadow and reflections. Reconstruct what was behind it (floor, wall, landscaping) seamlessly and photorealistically, matching the surrounding materials and lighting. Change nothing else: keep every other object, the architecture, the framing and the camera angle exactly as they are.`
        : // Palavras como "toiletries" e "trash" fizeram o filtro de conteúdo do Nano Banana
          // recusar o prompt (422, 12/09/2026). Lista neutra de objetos, mesmo efeito.
          "Tidy up this real-estate photo: remove small loose objects from counters, tables, shelves and floors (papers, cables, bottles, dishes, bags, boxes, magnets, decorations that look cluttered) so the space looks clean and ready for a listing. Keep all furniture and appliances, the architecture, the framing and the camera angle exactly as they are. Reconstruct surfaces seamlessly where items were removed. Photorealistic result.",
    esperado: (p) =>
      p.o_que
        ? `"${p.o_que}" is no longer visible anywhere in the photo, and the area behind it looks natural; everything else is unchanged.`
        : "Small clutter and personal items are gone; furniture, architecture and framing are unchanged; surfaces look natural where items were removed.",
  },
  {
    id: "mudar_piso",
    rotulo: "Mudar piso",
    grupo: "decorar",
    descricao: "Troca só o piso, mantendo todo o resto.",
    parametros: [
      { chave: "material", rotulo: "Material", tipo: "opcoes", opcoes: MATERIAIS_PISO, padrao: "porcelanato", permiteOutro: true },
    ],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: "Imagem ilustrativa · piso alterado digitalmente",
    checarIgual: false,
    prompt: (p) =>
      `Change ONLY the flooring in this room to ${en(MATERIAIS_PISO, p.material, MATERIAIS_PISO[0].en)}. Keep every other element of the image -- walls, furniture, windows, lighting, ceiling, camera angle -- exactly, pixel-identical to the original. Do not change anything except the floor material.`,
    esperado: (p) => `The floor is now clearly ${en(MATERIAIS_PISO, p.material, MATERIAIS_PISO[0].en)}; walls, furniture, windows, lighting and camera angle are unchanged.`,
  },
  {
    id: "mudar_parede",
    rotulo: "Mudar parede",
    grupo: "decorar",
    descricao: "Troca a cor ou o revestimento das paredes.",
    parametros: [
      { chave: "material", rotulo: "Acabamento", tipo: "opcoes", opcoes: MATERIAIS_PAREDE, padrao: "branco", permiteOutro: true },
    ],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: "Imagem ilustrativa · parede alterada digitalmente",
    checarIgual: false,
    prompt: (p) =>
      `Change ONLY the wall surfaces in this room to ${en(MATERIAIS_PAREDE, p.material, MATERIAIS_PAREDE[0].en)}. Keep the floor, furniture, windows, doors, ceiling, lighting and camera angle exactly, pixel-identical to the original. Do not change anything except the walls.`,
    esperado: (p) => `The walls are now ${en(MATERIAIS_PAREDE, p.material, MATERIAIS_PAREDE[0].en)}; floor, furniture, windows, doors, ceiling and camera angle are unchanged.`,
  },
  {
    id: "melhorar",
    rotulo: "Melhorar foto",
    grupo: "melhorar",
    descricao: "Corrige luz, cor e ruído. Não inventa nada.",
    parametros: [],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: null,
    checarIgual: false,
    prompt: () =>
      "This real estate photo has already been color- and exposure-corrected. Refine it further: remove noise and grain, recover fine detail, make the lighting look natural and professional like a real estate listing photo, gently balance any remaining color cast. Keep the composition, furniture, walls, and all objects exactly the same -- do not change anything structural, only refine lighting quality and clarity.",
    esperado: () => "The same photo, better exposed, with natural colors, less noise and more clarity; composition, furniture, walls and objects unchanged. Nothing added or removed.",
  },
  {
    id: "converter_hd",
    rotulo: "Converter em HD",
    grupo: "melhorar",
    descricao: "Aumenta a resolução de uma foto pequena.",
    parametros: [],
    mascara: "nao",
    provedores: null,
    selo: null,
    checarIgual: false,
    prompt: () => "",
    esperado: () => "The same photo at higher resolution, sharper, without invented content or artifacts.",
  },
  {
    // Sem selo, como o "melhorar": nada da cena é inventado, só a geometria é
    // endireitada. Se o modelo precisar completar borda, é margem, não conteúdo.
    id: "corrigir_perspectiva",
    rotulo: "Corrigir perspectiva",
    grupo: "melhorar",
    descricao: "Endireita paredes tortas e linhas inclinadas.",
    parametros: [],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: null,
    checarIgual: false,
    prompt: () =>
      "Correct the perspective of this real-estate photo: make every vertical line (walls, door frames, window frames, cabinet edges) perfectly vertical and level the horizon, as a professional architectural photographer would with a tilt-shift lens. Keep the exact same room, furniture, objects, colors and lighting -- do not add, remove or restyle anything. Fill any edge left empty by the correction with a natural continuation of the scene. Photorealistic result.",
    esperado: () => "The same photo with vertical lines now truly vertical and the horizon level; room, furniture, colors and lighting unchanged; nothing added, removed or restyled.",
  },
  {
    id: "trocar_ceu",
    rotulo: "Trocar céu",
    grupo: "melhorar",
    descricao: "Substitui o céu de uma fachada ou área externa.",
    parametros: [
      { chave: "ceu", rotulo: "Céu", tipo: "opcoes", opcoes: CEUS, padrao: "ensolarado" },
    ],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: "Imagem ilustrativa · céu substituído digitalmente",
    checarIgual: false,
    prompt: (p) =>
      `Replace ONLY the sky in this photo with ${en(CEUS, p.ceu, CEUS[0].en)}. Keep the building, any neighboring buildings or structures, landscaping, and foreground EXACTLY the same -- do not extend the sky over any structure. Adjust lighting and reflections on the facade subtly to match the new sky naturally, without darkening the overall image.`,
    esperado: (p) => `The sky is now ${en(CEUS, p.ceu, CEUS[0].en)}; the building, structures, landscaping and foreground are unchanged and the sky does not cover any structure.`,
  },
  {
    id: "editar_prompt",
    rotulo: "Editar com texto",
    grupo: "outro",
    descricao: "Descreva com suas palavras o que mudar.",
    parametros: [
      {
        chave: "instrucao",
        rotulo: "O que mudar",
        tipo: "texto",
        placeholder: "Ex.: trocar o sofá por um cinza claro e tirar o tapete",
        max: 300,
        ajuda: "Funciona melhor com um pedido por vez.",
      },
    ],
    mascara: "nao",
    provedores: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
    selo: "Imagem ilustrativa · editada digitalmente",
    checarIgual: false,
    prompt: (p) =>
      `Edit this real-estate photo as follows: ${p.instrucao}. Keep the architecture, camera angle and framing unchanged unless the instruction says otherwise. Photorealistic result. Do not add people, text, logos or watermarks.`,
    esperado: (p) => `The instruction "${p.instrucao ?? ""}" was applied visibly and photorealistically; everything not mentioned in it is unchanged.`,
  },
];

export const ACOES_POR_ID: Record<string, DefAcao> = Object.fromEntries(ACOES.map((a) => [a.id, a]));

// Tipos de job que não passam pelo editor de ações (têm tela própria), mas aparecem no
// histórico, na galeria e no link como qualquer foto.
const ROTULOS_ESPECIAIS: Record<string, string> = {
  terreno: "Terreno com medidas",
  terreno_limpar: "Terreno limpo",
  terreno_construir: "Casa no terreno",
  terreno_livre: "Terreno editado",
  // A obra, etapa por etapa. Os rótulos dizem em que pé a construção está porque as
  // quatro imagens convivem na mesma galeria, e "Terreno obra estrutura" (o que a rede de
  // segurança lá embaixo produziria) não conta isso pra ninguém.
  terreno_obra_fundacao: "Obra · fundação",
  terreno_obra_estrutura: "Obra · estrutura",
  terreno_obra_cobertura: "Obra · cobertura",
  terreno_obra_pronta: "Obra · casa pronta",
  planta: "Planta baixa",
  planta_humanizada: "Planta humanizada",
  mapa: "Mapa do endereço",
  // Foto que a pessoa enviou pronta: não passou por IA, não leva selo, não custou crédito.
  original: "Foto enviada",
};

export function rotuloDoTipo(tipo: string): string {
  const conhecido = ACOES_POR_ID[tipo]?.rotulo ?? ROTULOS_ESPECIAIS[tipo];
  if (conhecido) return conhecido;
  // Rede de segurança: um tipo novo que ninguém cadastrou aqui aparecia cru na tela e no
  // PDF ("terreno_construir" na legenda do book). Melhor sair "Terreno construir" do que
  // parecer nome de variável vazando pro cliente do corretor.
  const legivel = tipo.replace(/_/g, " ").trim();
  return legivel ? legivel.charAt(0).toUpperCase() + legivel.slice(1) : tipo;
}

export const GRUPOS: { id: Grupo; rotulo: string }[] = [
  { id: "decorar", rotulo: "Decorar" },
  { id: "melhorar", rotulo: "Melhorar" },
  { id: "outro", rotulo: "Outro" },
];

/**
 * Valida e limpa os parâmetros recebidos do navegador contra a definição da ação.
 * Devolve só chaves conhecidas, com valor de opção válida ou texto livre saneado.
 * Nunca confia no que veio: o prompt vai direto pro modelo.
 */
export function limparParametros(acao: DefAcao, brutos: unknown): Record<string, string> {
  const entrada = (brutos && typeof brutos === "object" ? brutos : {}) as Record<string, unknown>;
  const saida: Record<string, string> = {};
  for (const p of acao.parametros) {
    const v = entrada[p.chave];
    const texto = typeof v === "string" ? v.trim() : "";
    if (p.tipo === "opcoes") {
      const valida = p.opcoes?.some((o) => o.valor === texto);
      if (valida) saida[p.chave] = texto;
      else if (p.permiteOutro && texto) saida[p.chave] = texto.replace(/[^\p{L}\p{N} ,.'-]/gu, "").slice(0, 40);
      else if (p.padrao) saida[p.chave] = p.padrao;
    } else {
      const max = p.max ?? 300;
      const limpo = texto.replace(/[<>{}[\]\\`]/g, "").slice(0, max);
      if (limpo) saida[p.chave] = limpo;
    }
  }
  return saida;
}

/** Texto curto dos parâmetros escolhidos, pra histórico e legenda. */
export function resumirParametros(acao: DefAcao, p: Record<string, string>): string {
  const partes: string[] = [];
  for (const def of acao.parametros) {
    const v = p[def.chave];
    if (!v || v === "auto") continue;
    const rot = def.opcoes?.find((o) => o.valor === v)?.rotulo ?? v;
    partes.push(rot);
  }
  return partes.join(" · ");
}
