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
    descricao: "Coloca móveis e decoração num ambiente vazio.",
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
    prompt: (p) => {
      const espaco = en(TIPOS_ESPACO, p.tipo_espaco) || "room";
      const estilo = en(ESTILOS, p.estilo, "modern");
      const forca = en(CRIATIVIDADE, p.criatividade, CRIATIVIDADE[0].en);
      const ref = p.referencia === "1" ? " Use the furniture pieces, colors and style of the second image as the reference." : "";
      return `Furnish this empty ${espaco} in a ${estilo} style (${forca}). ${PRESERVAR} Add only photorealistic furniture and decor at correct scale for the space. Photorealistic result.${ref}`;
    },
  },
  {
    id: "renovar",
    rotulo: "Renovar",
    grupo: "decorar",
    descricao: "Reforma virtual: acabamentos, piso, paredes e luz novos.",
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
  },
  {
    id: "esvaziar",
    rotulo: "Esvaziar",
    grupo: "decorar",
    descricao: "Tira móveis e objetos, deixando o ambiente vazio.",
    parametros: [],
    mascara: "nao",
    provedores: ["fal-ai/flux-pro/kontext", "fal-ai/nano-banana/edit"],
    selo: "Imagem ilustrativa · mobília removida digitalmente",
    checarIgual: true,
    prompt: () =>
      "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  },
  {
    id: "remover_objeto",
    rotulo: "Remover objeto",
    grupo: "decorar",
    descricao: "Pinte por cima do que deve sair da foto.",
    parametros: [],
    mascara: "obrigatoria",
    provedores: ["fal-ai/object-removal/mask", "fal-ai/flux-pro/v1/erase"],
    selo: "Imagem ilustrativa · objeto removido digitalmente",
    checarIgual: false,
    prompt: () => "",
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
  },
];

export const ACOES_POR_ID: Record<string, DefAcao> = Object.fromEntries(ACOES.map((a) => [a.id, a]));

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
