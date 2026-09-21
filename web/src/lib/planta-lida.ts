import { CORES_COMODO, PASSO_PADRAO, type Comodo, type Planta, type Ponto } from "./planta";

// LER UMA PLANTA PRONTA: a imagem do arquiteto virando rascunho editável.
//
// Pedido do dono (21/09/2026): "queria ter as duas opções -- a pessoa desenhar e a pessoa
// mandar um arquivo e gerar o rascunho".
//
// A DIVISÃO QUE DEFINE ESTE ARQUIVO. Existem duas coisas diferentes chamadas de "IA a partir
// da planta": desenhar POR CIMA (o modelo de imagem repinta, e some com os números -- o
// próprio humanizar avisa que "12,50 m²" volta como "l2,SO n²") e LER a planta (transformar
// em cômodos e medidas editáveis). Isto aqui é a segunda, e ela não passa por modelo de
// imagem: passa por um modelo de VISÃO que devolve JSON.
//
// A REGRA QUE NÃO SE QUEBRA: o que sai daqui é RASCUNHO. O produto inteiro se apoia em "a
// medida é exata e de graça; a ilustração é que é IA" -- se a área do anúncio passar a vir de
// um palpite de visão computacional, o corretor perde justamente o que o diferencia, e é ele
// que responde pelo anúncio. Por isso nada do que é lido vai pra ficha, pro material ou pro
// book antes de a pessoa CONFERIR. Quem carrega esse aviso é `LeituraDaPlanta.confiar`.
//
// E o número que vale é o ESCRITO na planta: o prompt manda ler as cotas, não medir pixel.
// Planta sem cota e sem escala não dá medida -- dá layout, e o produto diz isso em vez de
// inventar.

/** Um cômodo como o modelo de visão devolve: retângulo, em metros, canto superior esquerdo. */
export type ComodoLido = {
  nome: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** A medida veio de uma cota ESCRITA na planta (true) ou foi estimada pela proporção. */
  medida_lida?: boolean;
};

export type LeituraDaPlanta = {
  comodos: ComodoLido[];
  /** A planta tinha cotas escritas? É o que separa "medida" de "layout aproximado". */
  tem_cotas: boolean;
  /** "1:50", "1:100"… quando aparece na prancha. */
  escala?: string | null;
  /** O que o modelo quer avisar: prancha ilegível, cômodo sem nome, dúvida de unidade. */
  observacao?: string | null;
};

/** Limites do que se aceita de volta. Planta de imóvel não tem cômodo de 200 m de lado. */
export const LIMITES_LEITURA = {
  comodosMax: 40,
  ladoMin: 0.6,
  ladoMax: 60,
  nomeMax: 24,
};

/**
 * O que o modelo tem que devolver, em inglês (é a língua dele) e sem espaço pra prosa.
 *
 * Retângulo, e não polígono, de propósito: pedir contorno livre multiplica o erro e devolve
 * parede torta que a pessoa teria que consertar canto a canto. Retângulo aproximado ela
 * arrasta em dois segundos com as ferramentas que já existem -- e o layout, que é o que ela
 * quer aproveitar, chega certo.
 */
export const SISTEMA_LEITURA = [
  "You read architectural floor plans and return ONLY JSON. No prose, no markdown fence.",
  "",
  "Return this exact shape:",
  '{"comodos":[{"nome":"Sala","x":0,"y":0,"largura":4.2,"altura":3.5,"medida_lida":true}],"tem_cotas":true,"escala":"1:50","observacao":null}',
  "",
  "Rules:",
  "- Every room is an axis-aligned RECTANGLE in METRES. x,y is its top-left corner, with the plan's top-left as origin (0,0).",
  "- Rooms must not overlap. Lay them out as they appear in the drawing, side by side, sharing walls.",
  "- PREFER THE WRITTEN DIMENSIONS. If the plan prints a room's size (e.g. \"3.20 x 2.80\" or a dimension line), use those numbers and set medida_lida=true for that room.",
  "- Only if a room has no written dimension, estimate it from the drawing's proportions and set medida_lida=false.",
  "- If the plan has no written dimensions anywhere and no scale, set tem_cotas=false and still return the layout with medida_lida=false everywhere.",
  '- nome: the room label in Portuguese, short ("Sala", "Cozinha", "Quarto 1", "Banheiro", "Varanda"). If the room is unlabelled, use "Cômodo".',
  "- Ignore furniture, hatching, north arrows, title blocks, logos and text that is not a room name or a dimension.",
  // Medido numa planta de lançamento de verdade: o balão "Laje técnica", que aponta pra
  // dentro do desenho a partir da margem, virou um cômodo de 4 m².
  "- A label is a ROOM only if it sits INSIDE a closed outline of walls. Marketing call-outs that sit in the margin and point into the drawing with a leader line (e.g. \"Laje técnica\", \"Ponto de ar condicionado\", \"Infra para persiana\") are NOT rooms: skip them.",
  // Mesma planta: a cozinha herdou o 2,85 da lavanderia e o banho herdou o 3,15 do
  // dormitório. Ler o número certo e pendurar no cômodo errado é o erro mais comum aqui --
  // e o mais perigoso, porque o número parece certo.
  "- NEVER borrow a dimension from a neighbouring room. A dimension belongs to a room only if its dimension line runs along that room's own wall. If a room's side has no dimension of its own, estimate that side and set medida_lida=false for the room.",
  "- If the sheet prints a TOTAL area (e.g. \"98 M²\"), use it as a sanity check: the sum of your rooms should land near it, a bit below. If your sum is far off, your dimensions are wrong -- re-read them.",
  "- If the image is not a floor plan, or is unreadable, return {\"comodos\":[],\"tem_cotas\":false,\"escala\":null,\"observacao\":\"<why, in Portuguese>\"}.",
  "- observacao: one short sentence IN PORTUGUESE when something is doubtful; null when everything is clear.",
].join("\n");

const limpar = (t: unknown, max: number) =>
  typeof t === "string" ? t.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "";

/**
 * Rótulos que NÃO são cômodo, barrados aqui e não no prompt.
 *
 * "Laje técnica" virou um cômodo de 4 m² numa planta de lançamento de verdade, e continuou
 * virando depois de eu mandar o modelo ignorar balões de marketing -- pedir duas vezes a
 * mesma coisa não faz o modelo obedecer. Lista no código é determinística, custa nada e
 * sobrevive a troca de modelo; a instrução no prompt fica como primeira barreira.
 */
const NAO_E_COMODO = /^(laje|[aá]rea|ponto|infra|espa[çc]o|shaft|duto|prumada|po[çc]o|proje[çc][ãa]o|acesso|entrada de|tomada|guarda|piso|churrasqueira)\b/i;

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * O JSON do modelo virando uma leitura confiável -- ou vazia.
 *
 * Tudo que não passa é DESCARTADO, nunca "consertado no chute": cômodo de 300 m vira nada, e
 * não um cômodo de 30 m. Consertar silenciosamente é o que transforma um erro visível num
 * número errado no anúncio.
 *
 * Centímetros entram pela porta dos fundos: modelo que lê "320" numa cota devolve 320. Se a
 * planta inteira vier em valores grandes demais pra metro e pequenos demais pra outra coisa,
 * a gente divide por 100 uma vez só e avisa.
 */
export function limparLeitura(bruto: unknown): LeituraDaPlanta {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(o.comodos) ? o.comodos : [];
  let avisoUnidade = "";

  let cru: ComodoLido[] = [];
  for (const item of lista.slice(0, LIMITES_LEITURA.comodosMax)) {
    const c = (item ?? {}) as Record<string, unknown>;
    const largura = numero(c.largura);
    const altura = numero(c.altura);
    const x = numero(c.x) ?? 0;
    const y = numero(c.y) ?? 0;
    if (largura === null || altura === null || largura <= 0 || altura <= 0) continue;
    const nome = limpar(c.nome, LIMITES_LEITURA.nomeMax) || "Cômodo";
    if (NAO_E_COMODO.test(nome)) continue;
    cru.push({ nome, x, y, largura, altura, medida_lida: c.medida_lida === true });
  }

  // Tudo em centímetros? Acontece quando o modelo copia a cota crua ("320"). Só converte se
  // TODOS os lados estiverem absurdos pra metro -- meia conversão é pior que nenhuma.
  if (cru.length && cru.every((c) => c.largura > LIMITES_LEITURA.ladoMax && c.altura > LIMITES_LEITURA.ladoMax)) {
    cru = cru.map((c) => ({ ...c, x: c.x / 100, y: c.y / 100, largura: c.largura / 100, altura: c.altura / 100 }));
    avisoUnidade = "As medidas vieram em centímetros e foram convertidas pra metros. Confira.";
  }

  const comodos = cru.filter(
    (c) =>
      c.largura >= LIMITES_LEITURA.ladoMin &&
      c.altura >= LIMITES_LEITURA.ladoMin &&
      c.largura <= LIMITES_LEITURA.ladoMax &&
      c.altura <= LIMITES_LEITURA.ladoMax &&
      Math.abs(c.x) <= LIMITES_LEITURA.ladoMax * 2 &&
      Math.abs(c.y) <= LIMITES_LEITURA.ladoMax * 2
  );

  const descartados = cru.length - comodos.length;
  const observacao =
    [limpar(o.observacao, 200), avisoUnidade, descartados > 0 ? `${descartados} ${descartados === 1 ? "cômodo saiu" : "cômodos saíram"} por medida fora do possível.` : ""]
      .filter(Boolean)
      .join(" ") || null;

  return {
    comodos,
    tem_cotas: o.tem_cotas === true && comodos.some((c) => c.medida_lida),
    escala: limpar(o.escala, 12) || null,
    observacao,
  };
}

/** Quantos cômodos têm medida vinda de cota escrita (o resto é proporção). */
export function quantasMedidasLidas(l: LeituraDaPlanta): number {
  return l.comodos.filter((c) => c.medida_lida).length;
}

let seq = 0;
const novoId = () => `lido${Date.now().toString(36)}${seq++}`;

const canto = (x: number, y: number): Ponto => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });

/**
 * A leitura virando a planta que o editor abre.
 *
 * Encosta o desenho na origem (o modelo às vezes devolve tudo deslocado) e dá a cada cômodo
 * a mesma cor do desenho à mão, pra a tela não ter dois "tipos" de cômodo.
 */
export function plantaDaLeitura(l: LeituraDaPlanta, nome = ""): Planta {
  const x0 = l.comodos.length ? Math.min(...l.comodos.map((c) => c.x)) : 0;
  const y0 = l.comodos.length ? Math.min(...l.comodos.map((c) => c.y)) : 0;
  const comodos: Comodo[] = l.comodos.map((c, i) => {
    const x = c.x - x0;
    const y = c.y - y0;
    return {
      id: novoId(),
      nome: c.nome,
      pontos: [canto(x, y), canto(x + c.largura, y), canto(x + c.largura, y + c.altura), canto(x, y + c.altura)],
      cor: CORES_COMODO[i % CORES_COMODO.length],
    };
  });
  return { nome, passo: PASSO_PADRAO, comodos, aberturas: [], moveis: [], cotas: true };
}

/** O aviso que a tela mostra enquanto a pessoa não conferiu. Null quando não há o que ler. */
export function avisoDaLeitura(l: LeituraDaPlanta): string | null {
  if (!l.comodos.length) return l.observacao ?? "Não consegui ler esta planta. Tente uma imagem mais nítida, ou desenhe à mão.";
  const lidas = quantasMedidasLidas(l);
  if (!l.tem_cotas) {
    return "Esta planta não tem medidas escritas: o que veio é o LAYOUT, com tamanhos aproximados pela proporção. Ajuste as medidas antes de usar.";
  }
  if (lidas < l.comodos.length) {
    return `${lidas} de ${l.comodos.length} cômodos vieram com a medida escrita na planta; o resto é aproximado. Confira antes de usar.`;
  }
  return "Medidas lidas das cotas da planta. Confira cômodo a cômodo antes de usar: quem responde pelo anúncio é você.";
}
