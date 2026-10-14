import { CORES_COMODO, LARGURA_JANELA, LARGURA_PORTA, PASSO_PADRAO, encaixarAbertura, type Abertura, type Comodo, type Planta, type Ponto } from "./planta";

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

/**
 * Uma porta ou janela como o modelo devolve: o CENTRO do vão, em metros, no mesmo sistema
 * de coordenadas dos cômodos.
 *
 * Centro e não "parede tal, a tantos metros do canto": a segunda forma exige que o modelo
 * acerte qual parede é qual, e ele erra. O centro é um ponto solto, e quem encosta ele na
 * parede é `encaixarAbertura` -- código, com a geometria que a tela já usa.
 */
export type AberturaLida = { tipo: "porta" | "janela"; x: number; y: number; largura: number };

export type LeituraDaPlanta = {
  comodos: ComodoLido[];
  /** Portas e janelas desenhadas. Vazio quando a planta não mostra nenhuma. */
  aberturas: AberturaLida[];
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
  '{"comodos":[{"nome":"Sala","x":0,"y":0,"largura":4.2,"altura":3.5,"medida_lida":true}],"aberturas":[{"tipo":"porta","x":2.1,"y":0,"largura":0.8}],"tem_cotas":true,"escala":"1:50","observacao":null}',
  "",
  "Rules:",
  "- Every room is an axis-aligned RECTANGLE in METRES. x,y is its top-left corner, with the plan's top-left as origin (0,0).",
  "- Rooms must not overlap. Lay them out as they appear in the drawing, side by side, sharing walls.",
  "- PREFER THE WRITTEN DIMENSIONS. If the plan prints a room's size (e.g. \"3.20 x 2.80\" or a dimension line), use those numbers and set medida_lida=true for that room.",
  // O RÓTULO DE ÁREA É MEDIDA ESCRITA, e esta é a convenção brasileira.
  //
  // Medido em 13/10/2026 numa bancada de 5 plantas (scripts/bancada-area-escrita.ts): o modelo
  // LIA as áreas certas -- escreveu "as dimensões foram estimadas a partir das áreas
  // fornecidas" -- e mesmo assim devolvia `medida_lida=false` e `tem_cotas=false` nos 27
  // cômodos. A planta técnica que ele mandou traz as seis áreas (`a=4.50 m²`), e o produto
  // respondia "esta planta não tem medidas escritas". Dizer que a planta é incompleta quando
  // ela não é é pior do que não ler: o corretor desconfia e redigita tudo na mão.
  //
  // A causa estava nas duas regras acima: elas falam em DIMENSION e dimension line -- o
  // "3.20 x 2.80" e a linha de cota do desenho técnico. Área escrita não entrava nessa
  // definição, e o modelo obedeceu ao pé da letra.
  "- AN AREA LABEL IS ALSO A WRITTEN MEASUREMENT. Brazilian plans normally print each room's AREA under its name (\"a=4.50 m²\", \"A=16,54 m2\", \"12.76m²\") instead of side dimensions.",
  "- When a room prints its area, pick largura and altura so that largura*altura equals that printed area to two decimals, keeping the proportions you see in the drawing, and set medida_lida=true for that room.",
  "- tem_cotas=true when the plan prints side dimensions OR room areas. Only set tem_cotas=false when the drawing shows no measurement of any kind.",
  "- Only if a room has neither a written dimension nor a written area, estimate it from the drawing's proportions and set medida_lida=false.",
  "- If the plan has no written dimensions, no written areas and no scale, set tem_cotas=false and still return the layout with medida_lida=false everywhere.",
  '- nome: the room label in Portuguese, short ("Sala", "Cozinha", "Quarto 1", "Banheiro", "Varanda"). If the room is unlabelled, use "Cômodo".',
  "- Ignore furniture, hatching, north arrows, title blocks, logos and text that is not a room name or a dimension.",
  // Medido numa planta de lançamento de verdade: o balão "Laje técnica", que aponta pra
  // dentro do desenho a partir da margem, virou um cômodo de 4 m².
  "- A label is a ROOM only if it sits INSIDE a closed outline of walls. Marketing call-outs that sit in the margin and point into the drawing with a leader line (e.g. \"Laje técnica\", \"Ponto de ar condicionado\", \"Infra para persiana\") are NOT rooms: skip them.",
  // Mesma planta: a cozinha herdou o 2,85 da lavanderia e o banho herdou o 3,15 do
  // dormitório. Ler o número certo e pendurar no cômodo errado é o erro mais comum aqui --
  // e o mais perigoso, porque o número parece certo.
  "- NEVER borrow a dimension from a neighbouring room. A dimension belongs to a room only if its dimension line runs along that room's own wall. If a room's side has no dimension of its own, estimate that side and set medida_lida=false for the room.",
  // TENTEI E REVERTI (21/09/2026). Duas plantas técnicas mostraram o salão levando o 7,00 que
  // é a largura TOTAL da casa, e a varanda levando 7,30 x 7,50. A regra óbvia -- "dimensão
  // geral não é dimensão de cômodo, use só pra conferir a soma" -- melhorou essas duas e
  // DERRUBOU a planta de lançamento de 97% pra 64% da área declarada, three de três rodadas.
  //
  // Fica registrado porque a lição não é sobre esta regra: cada ajuste de prompt move o erro
  // de lugar, e sem uma bancada que pontue VÁRIAS plantas de uma vez, afinar aqui é trocar um
  // acerto conhecido por outro desconhecido. A próxima pessoa que sentir vontade de melhorar
  // isto precisa primeiro da bancada, não de uma frase melhor.
  "- If the sheet prints a TOTAL area (e.g. \"98 M²\"), use it as a sanity check: the sum of your rooms should land near it, a bit below. If your sum is far off, your dimensions are wrong -- re-read them.",
  // PORTA E JANELA, que o desenho mostra e a leitura ignorava.
  //
  // Pedido dele em 13/10/2026: "ao ler a planta, ele não consegue diferenciar onde acaba a
  // parede, tem portas janelas". O rascunho voltava com os cômodos e NENHUMA abertura, e a
  // pessoa tinha que repor uma por uma -- numa planta de 6 cômodos são umas dez.
  //
  // Pede-se o CENTRO do vão, e não "na parede norte a 1,2 m do canto": a segunda forma exige
  // que o modelo acerte qual parede é qual, e ele erra. O centro é um ponto solto, e quem
  // encosta na parede certa, com o ângulo certo, é o código (`encaixarAbertura`).
  "- Also return the DOORS and WINDOWS drawn on the walls, in an \"aberturas\" array: {\"tipo\":\"porta\"|\"janela\",\"x\":..,\"y\":..,\"largura\":..}.",
  "- x,y is the CENTRE of the opening in metres, in the same coordinate system as the rooms. largura is how wide the opening is, in metres (a door is usually 0.7-1.0, a window 0.8-2.0).",
  "- A DOOR is drawn as a gap in the wall plus a quarter-circle swing arc. A WINDOW is a gap crossed by thin parallel lines, or a double line. Judge by the symbol, not by which room it serves.",
  "- Return only openings that are DRAWN. Never add an opening because a room ought to have one: an invented door becomes a door in the advert. If none are drawn, return \"aberturas\":[].",
  "- If the image is not a floor plan, or is unreadable, return {\"comodos\":[],\"aberturas\":[],\"tem_cotas\":false,\"escala\":null,\"observacao\":\"<why, in Portuguese>\"}.",
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

/**
 * O que PARECE balão técnico e é cômodo de verdade.
 *
 * A lista de cima começa em "área", "espaço" e "churrasqueira" pra barrar "Laje técnica" e
 * "Ponto de ar condicionado" -- e levava junto **Área de serviço**, que está em quase todo
 * apartamento brasileiro, além de Área gourmet, Área de lazer e Churrasqueira. Achado em
 * 13/10/2026 pela bancada de leitura: numa planta de 7 cômodos, a Área de serviço
 * simplesmente não voltava, e o descarte é silencioso -- some um cômodo e ninguém sabe por quê.
 *
 * Vem ANTES do bloqueio porque exceção que vem depois não é exceção.
 */
const E_COMODO_MESMO = /^([aá]rea (de )?(servi[çc]o|gourmet|lazer|festas?|externa|comum|de luz)|espa[çc]o (gourmet|lazer)|churrasqueira)\b/i;

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
    if (!E_COMODO_MESMO.test(nome) && NAO_E_COMODO.test(nome)) continue;
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

  // ---- as aberturas ----
  //
  // Mesmo rigor dos cômodos: o que não dá pra usar sai aqui, calado, em vez de virar uma
  // porta de 12 metros no rascunho. `largura` fora da faixa humana é erro de leitura, não
  // porta exótica -- o saneador da planta (limparPlanta) corta em 0,4-4 m, e aqui é o mesmo.
  const aberturas: AberturaLida[] = [];
  for (const item of (Array.isArray(o.aberturas) ? o.aberturas : []).slice(0, 80)) {
    const a = (item ?? {}) as Record<string, unknown>;
    const x = numero(a.x);
    const y = numero(a.y);
    const largura = numero(a.largura);
    if (x === null || y === null) continue;
    if (Math.abs(x) > LIMITES_LEITURA.ladoMax * 2 || Math.abs(y) > LIMITES_LEITURA.ladoMax * 2) continue;
    aberturas.push({
      tipo: a.tipo === "janela" ? "janela" : "porta",
      x,
      y,
      largura: largura !== null && largura >= 0.4 && largura <= 4 ? largura : a.tipo === "janela" ? LARGURA_JANELA : LARGURA_PORTA,
    });
  }

  const descartados = cru.length - comodos.length;
  const observacao =
    [limpar(o.observacao, 200), avisoUnidade, descartados > 0 ? `${descartados} ${descartados === 1 ? "cômodo saiu" : "cômodos saíram"} por medida fora do possível.` : ""]
      .filter(Boolean)
      .join(" ") || null;

  return {
    comodos,
    aberturas,
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
  // AS ABERTURAS ENCOSTAM NA PAREDE, e é o código que faz isso -- não o modelo.
  //
  // Ele devolve um ponto aproximado; aqui esse ponto é projetado na parede mais próxima e
  // ganha o ângulo dela, pela mesma função que a tela usa quando a pessoa põe uma porta com
  // o dedo (lib/planta.ts). Assim um erro de 20 cm na leitura vira zero, e a porta nasce
  // alinhada em vez de atravessada.
  //
  // Abertura que não acha parede nenhuma por perto é DESCARTADA: porta boiando no meio do
  // cômodo é pior que porta faltando -- a pessoa tem que achar e apagar antes de usar.
  const aberturas: Abertura[] = [];
  for (const a of l.aberturas ?? []) {
    const e = encaixarAbertura({ x: a.x - x0, y: a.y - y0 }, comodos, 1.0);
    if (!e) continue;
    aberturas.push({ id: novoId(), tipo: a.tipo, p: e.p, angulo: e.angulo, largura: a.largura, lado: 1, giro: 1 });
  }
  return { nome, passo: PASSO_PADRAO, comodos, aberturas, moveis: [], cotas: true };
}

/** O aviso que a tela mostra enquanto a pessoa não conferiu. Null quando não há o que ler. */
export function avisoDaLeitura(l: LeituraDaPlanta): string | null {
  if (!l.comodos.length) return l.observacao ?? "Não consegui ler esta planta. Tente uma imagem mais nítida, ou desenhe à mão.";
  const lidas = quantasMedidasLidas(l);

  // AS ABERTURAS SÃO PALPITE, E O AVISO DIZ ISSO.
  //
  // Medido em 13/10/2026 na bancada (scripts/bancada-area-escrita.ts): das 21 portas e janelas
  // desenhadas, 10 chegaram a menos de 80 cm do lugar certo. As outras caem numa parede -- o
  // código encosta elas --, mas às vezes na parede errada. É muito melhor que o que havia
  // antes, que era NENHUMA abertura e dez pra pôr na mão, e está longe de exato.
  //
  // Prometer menos do que se entrega é barato; prometer mais custa a confiança no produto
  // inteiro, porque quem descobre o erro sozinho passa a conferir tudo.
  const vaos = l.aberturas?.length ?? 0;
  const sobreVaos = vaos ? ` As ${vaos} portas e janelas são um palpite pelo desenho: confira o lugar de cada uma e arraste o que estiver fora.` : "";

  if (!l.tem_cotas) {
    return `Esta planta não tem medidas escritas: o que veio é o LAYOUT, com tamanhos aproximados pela proporção. Ajuste as medidas antes de usar.${sobreVaos}`;
  }
  if (lidas < l.comodos.length) {
    return `${lidas} de ${l.comodos.length} cômodos vieram com a medida escrita na planta; o resto é aproximado. Confira antes de usar.${sobreVaos}`;
  }
  return `Medidas lidas das cotas da planta. Confira cômodo a cômodo antes de usar: quem responde pelo anúncio é você.${sobreVaos}`;
}
