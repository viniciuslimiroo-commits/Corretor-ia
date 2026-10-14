// Planta baixa. Modelo de dados e geometria, usados pela tela (desenho) e pelo servidor
// (export em PNG). Sem IA: planta é medida, não estética -- pedir pra um modelo desenhar
// parede dá número errado e canto torto.
//
// Tudo em METROS no modelo. A tela converte pra pixel na hora de desenhar; o servidor
// converte na hora de exportar. Assim a mesma planta sai igual em qualquer tamanho.
//
// Referência: a planta da Pedra (docs/pedra-varredura-12-09.md) tem Divisão, Parede,
// Porta, Janela e Mobiliário, com área automática. Aqui o essencial pro anúncio:
// cômodos com área automática, portas, janelas e cotas.

import type { Movel } from "./moveis";
import { MOVEL_POR_TIPO } from "./moveis";

export type Ponto = { x: number; y: number };

export type Comodo = {
  id: string;
  nome: string;
  /** Cantos em metros, na ordem em que foram marcados. */
  pontos: Ponto[];
  cor?: string;
};

export type Abertura = {
  id: string;
  tipo: "porta" | "janela";
  /** Centro da abertura, em metros. */
  p: Ponto;
  /** Rotação em graus: 0 = horizontal. */
  angulo: number;
  /** Largura em metros. */
  largura: number;
  /** Só porta: para que lado da parede a folha abre. 1 e -1 são os dois lados. */
  lado?: 1 | -1;
  /** Só porta: em qual batente fica a dobradiça. 1 = esquerda, -1 = direita. */
  giro?: 1 | -1;
};

/** As quatro formas de uma porta abrir, na ordem em que o toque alterna entre elas. */
export const GIROS_DE_PORTA: { lado: 1 | -1; giro: 1 | -1 }[] = [
  { lado: 1, giro: 1 },
  { lado: 1, giro: -1 },
  { lado: -1, giro: -1 },
  { lado: -1, giro: 1 },
];

/** Próxima combinação de abertura da porta (dá a volta). */
export function proximoGiro(a: Abertura): { lado: 1 | -1; giro: 1 | -1 } {
  const i = GIROS_DE_PORTA.findIndex((g) => g.lado === (a.lado ?? 1) && g.giro === (a.giro ?? 1));
  return GIROS_DE_PORTA[(i + 1) % GIROS_DE_PORTA.length];
}

export type Planta = {
  nome: string;
  /** Metro por unidade da grade (0,5 m é o passo padrão). */
  passo: number;
  comodos: Comodo[];
  aberturas: Abertura[];
  /** Móveis posicionados pela pessoa. Catálogo e símbolos em `moveis.ts`. */
  moveis: Movel[];
  /** Mostrar as medidas de cada parede. */
  cotas: boolean;
};

export const PASSO_PADRAO = 0.5;
export const LARGURA_PORTA = 0.8;
export const LARGURA_JANELA = 1.2;

// Cores suaves, pra planta continuar legível impressa em preto e branco.
export const CORES_COMODO = ["#dbeafe", "#dcfce7", "#fef3c7", "#fae8d7", "#ede9fe", "#fee2e2", "#e0f2fe", "#f1f5f9"];

export const NOMES_SUGERIDOS = [
  "Sala",
  "Cozinha",
  "Quarto",
  "Quarto 2",
  "Suíte",
  "Banheiro",
  "Lavabo",
  "Varanda",
  "Área de serviço",
  "Garagem",
  "Corredor",
  "Escritório",
  "Closet",
  "Despensa",
  "Hall",
  "Quintal",
];

/** Área do polígono em m², pela fórmula do laço (shoelace). Sempre positiva. */
export function area(pontos: Ponto[]): number {
  if (pontos.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Centro de massa do polígono: onde o nome e a área ficam bem. */
export function centro(pontos: Ponto[]): Ponto {
  if (pontos.length === 0) return { x: 0, y: 0 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const q = pontos[(i + 1) % pontos.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return { x: pontos.reduce((s, p) => s + p.x, 0) / pontos.length, y: pontos.reduce((s, p) => s + p.y, 0) / pontos.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Arredonda para a grade. Passo 0,5 m é o que faz a planta sair com canto reto. */
export function encaixar(p: Ponto, passo: number): Ponto {
  return { x: Math.round(p.x / passo) * passo, y: Math.round(p.y / passo) * passo };
}

/**
 * Prende o ponto no eixo quando está quase alinhado com o anterior. Sem isso ninguém
 * desenha uma parede reta com o dedo no celular.
 */
export function alinhar(anterior: Ponto | undefined, p: Ponto, tolerancia = 0.6): Ponto {
  if (!anterior) return p;
  const dx = Math.abs(p.x - anterior.x);
  const dy = Math.abs(p.y - anterior.y);
  if (dx < tolerancia && dx <= dy) return { x: anterior.x, y: p.y };
  if (dy < tolerancia && dy < dx) return { x: p.x, y: anterior.y };
  return p;
}

/**
 * Encaixa o ponto no desenho que já existe, e só depois na grade.
 *
 * É isto que faz o cômodo novo colar no que já está lá: num imóvel de verdade os cômodos
 * DIVIDEM parede, e grudar só na grade de 50 cm deixa fresta ou sobreposição sempre que a
 * pessoa erra meio metro. A ordem importa -- canto existente vence parede existente, que
 * vence a grade -- porque canto é a informação mais forte que a pessoa já deu.
 */
export function grudarNoDesenho(
  p: Ponto,
  planta: Planta,
  passo: number,
  extras: Ponto[] = []
): { p: Ponto; preso: "canto" | "parede" | "grade" } {
  const tol = Math.max(passo * 0.85, 0.3);

  let melhorCanto: { q: Ponto; d: number } | null = null;
  for (const q of [...planta.comodos.flatMap((c) => c.pontos), ...extras]) {
    const d = distancia(p, q);
    if (d <= tol && (!melhorCanto || d < melhorCanto.d)) melhorCanto = { q, d };
  }
  if (melhorCanto) return { p: { ...melhorCanto.q }, preso: "canto" };

  let melhorParede: { q: Ponto; d: number } | null = null;
  for (const c of planta.comodos) {
    for (let i = 0; i < c.pontos.length; i++) {
      const q = projetarNaParede(p, c.pontos[i], c.pontos[(i + 1) % c.pontos.length]);
      if (!q) continue;
      const d = distancia(p, q);
      if (d <= tol && (!melhorParede || d < melhorParede.d)) melhorParede = { q, d };
    }
  }
  // na parede, ainda arredonda ao longo dela pra medida não sair quebrada
  if (melhorParede) return { p: encaixar(melhorParede.q, passo / 2), preso: "parede" };

  return { p: encaixar(p, passo), preso: "grade" };
}

/** Ponto do segmento a-b mais próximo de p (null se o segmento for degenerado). */
export function projetarNaParede(p: Ponto, a: Ponto, b: Ponto): Ponto | null {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const comp2 = vx * vx + vy * vy;
  if (comp2 < 1e-6) return null;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / comp2));
  return { x: a.x + vx * t, y: a.y + vy * t };
}

/** Retângulo a partir de dois cantos opostos, no sentido horário. A maioria dos cômodos é assim. */
export function retangulo(a: Ponto, b: Ponto): Ponto[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}

export function areaTotal(planta: Planta): number {
  return planta.comodos.reduce((s, c) => s + area(c.pontos), 0);
}

/** Retângulo que cabe tudo, com folga em metros. */
export function limites(planta: Planta, folga = 1) {
  const todos = [...planta.comodos.flatMap((c) => c.pontos), ...planta.aberturas.map((a) => a.p)];
  if (todos.length === 0) return { x0: 0, y0: 0, x1: 10, y1: 8 };
  const xs = todos.map((p) => p.x);
  const ys = todos.map((p) => p.y);
  return { x0: Math.min(...xs) - folga, y0: Math.min(...ys) - folga, x1: Math.max(...xs) + folga, y1: Math.max(...ys) + folga };
}

export function metros(v: number): string {
  return `${v.toFixed(2).replace(".", ",")} m`;
}

export function metrosQuadrados(v: number): string {
  return `${v.toFixed(2).replace(".", ",")} m²`;
}

const ehPonto = (v: unknown): v is Ponto =>
  !!v && typeof v === "object" && Number.isFinite((v as Ponto).x) && Number.isFinite((v as Ponto).y) && Math.abs((v as Ponto).x) < 500 && Math.abs((v as Ponto).y) < 500;

/** Valida e limpa a planta recebida do navegador. O export desenha o que vier daqui. */
export function limparPlanta(bruto: unknown): { planta: Planta; erro: null } | { planta: null; erro: string } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const comodosBrutos = Array.isArray(b.comodos) ? b.comodos.slice(0, 40) : [];
  const comodos: Comodo[] = [];
  for (const cb of comodosBrutos) {
    const c = (cb && typeof cb === "object" ? cb : {}) as Record<string, unknown>;
    const pontos = (Array.isArray(c.pontos) ? c.pontos : []).filter(ehPonto).slice(0, 24) as Ponto[];
    if (pontos.length < 3) continue;
    comodos.push({
      id: typeof c.id === "string" ? c.id.slice(0, 40) : `c${comodos.length}`,
      nome: typeof c.nome === "string" ? c.nome.replace(/[\r\n]+/g, " ").trim().slice(0, 28) : "",
      pontos,
      cor: typeof c.cor === "string" && /^#[0-9a-fA-F]{6}$/.test(c.cor) ? c.cor : CORES_COMODO[comodos.length % CORES_COMODO.length],
    });
  }
  if (comodos.length === 0) return { planta: null, erro: "Desenhe pelo menos um cômodo." };

  const aberturasBrutas = Array.isArray(b.aberturas) ? b.aberturas.slice(0, 80) : [];
  const aberturas: Abertura[] = [];
  for (const ab of aberturasBrutas) {
    const a = (ab && typeof ab === "object" ? ab : {}) as Record<string, unknown>;
    if (!ehPonto(a.p)) continue;
    const largura = Number(a.largura);
    aberturas.push({
      id: typeof a.id === "string" ? a.id.slice(0, 40) : `a${aberturas.length}`,
      tipo: a.tipo === "janela" ? "janela" : "porta",
      p: a.p as Ponto,
      angulo: Number.isFinite(Number(a.angulo)) ? ((Number(a.angulo) % 360) + 360) % 360 : 0,
      largura: Number.isFinite(largura) ? Math.min(4, Math.max(0.4, largura)) : LARGURA_PORTA,
      lado: Number(a.lado) === -1 ? -1 : 1,
      giro: Number(a.giro) === -1 ? -1 : 1,
    });
  }

  const moveisBrutos = Array.isArray(b.moveis) ? b.moveis.slice(0, 200) : [];
  const moveis: Movel[] = [];
  for (const mb of moveisBrutos) {
    const m = (mb && typeof mb === "object" ? mb : {}) as Record<string, unknown>;
    const def = MOVEL_POR_TIPO[String(m.tipo)];
    if (!def || !ehPonto(m.p)) continue;
    const larg = Number(m.largura);
    const alt = Number(m.altura);
    moveis.push({
      id: typeof m.id === "string" ? m.id.slice(0, 40) : `m${moveis.length}`,
      tipo: def.tipo,
      p: m.p as Ponto,
      largura: Number.isFinite(larg) ? Math.min(30, Math.max(0.1, larg)) : def.largura,
      altura: Number.isFinite(alt) ? Math.min(30, Math.max(0.1, alt)) : def.altura,
      angulo: Number.isFinite(Number(m.angulo)) ? ((Number(m.angulo) % 360) + 360) % 360 : 0,
      travado: m.travado === true,
    });
  }

  return {
    planta: {
      nome: typeof b.nome === "string" ? b.nome.replace(/[\r\n]+/g, " ").trim().slice(0, 60) : "",
      passo: Number(b.passo) === 0.25 || Number(b.passo) === 1 ? Number(b.passo) : PASSO_PADRAO,
      comodos,
      aberturas,
      moveis,
      cotas: b.cotas !== false,
    },
    erro: null,
  };
}

// ---------------------------------------------------------------------------
// EDITAR O QUE JÁ ESTÁ DESENHADO
//
// Ele em 13/10/2026, depois de ler uma planta pela IA: "não é possível, caso erre na leitura
// automática, arrumar -- ter opção de editar paredes e etc", "quando escolho o lugar da porta
// não é possível pôr certinho a porta onde eu escolhi", "a movimentação é muito difícil".
//
// As três queixas têm a mesma raiz: até aqui o editor sabia CRIAR e APAGAR, não CORRIGIR. Dava
// pra desenhar um cômodo e apagá-lo inteiro, e nada no meio. Numa planta desenhada do zero isso
// passa; numa planta LIDA por IA, que chega quase certa e precisa de ajuste, é o que decide se
// a leitura serve pra alguma coisa.
// ---------------------------------------------------------------------------

/** Tolerância padrão pra dizer que dois cantos são "o mesmo canto", em metros. */
export const TOLERANCIA_CANTO = 0.08;

/**
 * Onde cada cômodo tem um canto neste lugar.
 *
 * O coração da edição: num imóvel de verdade os cômodos DIVIDEM parede, e a leitura da IA
 * entrega isso -- o canto da cozinha é o mesmo canto da sala. Mover só o do cômodo que a
 * pessoa tocou rasgaria a planta, abrindo um vão entre dois cômodos que eram colados.
 */
export function cantosJuntos(comodos: Comodo[], p: Ponto, tol = TOLERANCIA_CANTO): { comodo: number; canto: number }[] {
  const achados: { comodo: number; canto: number }[] = [];
  comodos.forEach((c, ci) =>
    c.pontos.forEach((q, qi) => {
      if (distancia(q, p) <= tol) achados.push({ comodo: ci, canto: qi });
    })
  );
  return achados;
}

/** O canto que está debaixo do dedo, ou null. Devolve a posição exata do canto, não a do dedo. */
export function cantoEm(comodos: Comodo[], p: Ponto, alcance: number): Ponto | null {
  let melhor: { q: Ponto; d: number } | null = null;
  for (const c of comodos) {
    for (const q of c.pontos) {
      const d = distancia(q, p);
      if (d <= alcance && (!melhor || d < melhor.d)) melhor = { q, d };
    }
  }
  return melhor ? { ...melhor.q } : null;
}

/** A parede que está debaixo do dedo, com as duas pontas. */
export function paredeEm(comodos: Comodo[], p: Ponto, alcance: number): { comodo: number; i: number; a: Ponto; b: Ponto } | null {
  let melhor: { r: { comodo: number; i: number; a: Ponto; b: Ponto }; d: number } | null = null;
  comodos.forEach((c, ci) => {
    for (let i = 0; i < c.pontos.length; i++) {
      const a = c.pontos[i];
      const b = c.pontos[(i + 1) % c.pontos.length];
      const q = projetarNaParede(p, a, b);
      if (!q) continue;
      const d = distancia(p, q);
      if (d <= alcance && (!melhor || d < melhor.d)) melhor = { r: { comodo: ci, i, a: { ...a }, b: { ...b } }, d };
    }
  });
  return melhor ? (melhor as { r: { comodo: number; i: number; a: Ponto; b: Ponto }; d: number }).r : null;
}

/**
 * Move um canto, levando junto TODOS os cantos colados nele.
 *
 * É o que mantém a planta inteira: mexer no canto da sala arrasta o canto da cozinha que
 * estava no mesmo lugar, e a parede dividida continua dividida.
 */
export function moverCanto(comodos: Comodo[], de: Ponto, para: Ponto, tol = TOLERANCIA_CANTO): Comodo[] {
  const juntos = cantosJuntos(comodos, de, tol);
  if (juntos.length === 0) return comodos;
  return comodos.map((c, ci) => {
    const meus = juntos.filter((j) => j.comodo === ci);
    if (meus.length === 0) return c;
    const pontos = c.pontos.map((q, qi) => (meus.some((m) => m.canto === qi) ? { ...para } : q));
    return { ...c, pontos };
  });
}

/**
 * Move uma parede inteira, pelas duas pontas, levando junto quem compartilha.
 *
 * Mover parede é mover os dois cantos dela com o mesmo deslocamento -- e, como cada canto
 * arrasta os colados, a parede vizinha estica em vez de descolar.
 */
export function moverParede(comodos: Comodo[], a: Ponto, b: Ponto, delta: Ponto, tol = TOLERANCIA_CANTO): Comodo[] {
  const destinoA = { x: a.x + delta.x, y: a.y + delta.y };
  const destinoB = { x: b.x + delta.x, y: b.y + delta.y };
  // As duas pontas de uma vez: mover a primeira e DEPOIS procurar a segunda acharia o canto
  // já deslocado quando a parede é curta (as duas pontas dentro da tolerância uma da outra).
  const juntosA = cantosJuntos(comodos, a, tol);
  const juntosB = cantosJuntos(comodos, b, tol);
  return comodos.map((c, ci) => {
    const meusA = juntosA.filter((j) => j.comodo === ci).map((j) => j.canto);
    const meusB = juntosB.filter((j) => j.comodo === ci).map((j) => j.canto);
    if (meusA.length === 0 && meusB.length === 0) return c;
    const pontos = c.pontos.map((q, qi) => (meusA.includes(qi) ? { ...destinoA } : meusB.includes(qi) ? { ...destinoB } : q));
    return { ...c, pontos };
  });
}

/**
 * Encaixa uma porta ou janela na parede mais próxima, COM precisão.
 *
 * O que estava errado: a abertura era posicionada pelo ponto de DESENHO, que gruda no canto
 * mais próximo (até 0,42 m) e depois arredonda de 25 em 25 cm ao longo da parede. Resultado:
 * a porta pulava pro canto do cômodo e não parava onde a pessoa tocou -- exatamente a queixa.
 *
 * Aqui não existe grude em canto nem passo grosso: projeta no segmento e arredonda em 1 cm,
 * que é mais fino do que qualquer dedo e mantém o número redondo na cota.
 */
export function encaixarAbertura(p: Ponto, comodos: Comodo[], alcance = 1.2): { p: Ponto; angulo: number } | null {
  const parede = paredeEm(comodos, p, alcance);
  if (!parede) return null;
  const q = projetarNaParede(p, parede.a, parede.b);
  if (!q) return null;
  return {
    p: { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 },
    angulo: (Math.atan2(parede.b.y - parede.a.y, parede.b.x - parede.a.x) * 180) / Math.PI,
  };
}

/**
 * Depois de mexer em parede, as aberturas voltam pra parede.
 *
 * Sem isto, corrigir uma parede deixa as portas dela flutuando no vazio -- e quem acabou de
 * consertar a planta vê o conserto estragar outra coisa, que é o jeito mais rápido de a
 * pessoa parar de confiar na ferramenta.
 *
 * `alcance` generoso de propósito: a parede andou, e a abertura precisa alcançá-la de volta.
 * Abertura que ficou longe de TUDO fica onde está, em vez de saltar pra uma parede alheia.
 */
export function recolarAberturas(aberturas: Abertura[], comodos: Comodo[], alcance = 1.5): Abertura[] {
  return aberturas.map((a) => {
    const e = encaixarAbertura(a.p, comodos, alcance);
    return e ? { ...a, p: e.p, angulo: e.angulo } : a;
  });
}
