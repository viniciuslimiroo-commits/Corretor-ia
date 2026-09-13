// Catálogo de móveis da planta baixa.
//
// Cada móvel é um SÍMBOLO desenhado em SVG, não uma figura de banco de imagens. Três
// motivos: planta de arquiteto usa símbolo (vista de cima, traço, sem textura); o mesmo
// desenho serve a tela e o PNG que o servidor exporta, sem divergir; e não depende de
// nenhum pacote nem de arquivo pra baixar.
//
// O símbolo é desenhado numa CAIXA UNITÁRIA de -0,5 a +0,5 nos dois eixos. Quem desenha
// escala pela largura e altura reais em metros, então o mesmo símbolo serve uma cama de
// solteiro e uma de casal.

export type TipoMovel =
  | "cama_casal" | "cama_solteiro" | "berco"
  | "sofa_2" | "sofa_3" | "sofa_l" | "poltrona"
  | "mesa_jantar_4" | "mesa_jantar_6" | "mesa_centro" | "mesa_lateral"
  | "fogao" | "geladeira" | "pia_cozinha" | "bancada" | "maquina_lavar"
  | "vaso" | "pia_banheiro" | "chuveiro" | "banheira"
  | "guarda_roupa" | "comoda" | "estante" | "escrivaninha" | "tv"
  | "tapete_retangular" | "tapete_redondo" | "planta" | "carro";

export type Movel = {
  id: string;
  tipo: TipoMovel;
  /** Centro do móvel, em metros. */
  p: { x: number; y: number };
  /** Tamanho em metros: largura no eixo do móvel, altura na profundidade. */
  largura: number;
  altura: number;
  /** Rotação em graus, no sentido horário. */
  angulo: number;
  /** Travado não se move nem se apaga por engano. */
  travado?: boolean;
};

export type DefMovel = {
  tipo: TipoMovel;
  rotulo: string;
  grupo: "quarto" | "sala" | "cozinha" | "banheiro" | "escritorio" | "fora";
  /** Medidas reais de mercado, em metros. É o que faz a planta ficar honesta. */
  largura: number;
  altura: number;
  /** Traço do símbolo dentro da caixa unitária (-0.5..0.5). */
  desenho: string;
  /** Preenchimento de fundo; sem isto o símbolo fica transparente. */
  fundo?: string;
  /** Redondo (tapete, mesa redonda): a caixa vira círculo na hora de arrastar. */
  redondo?: boolean;
};

// r = retângulo em fração da caixa; l = linha. Escritos assim pra caber legível.
const r = (x: number, y: number, w: number, h: number, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;
const l = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

export const MOVEIS: DefMovel[] = [
  // ---- quarto ----
  {
    tipo: "cama_casal", rotulo: "Cama de casal", grupo: "quarto", largura: 1.4, altura: 1.9, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.03"') + r(-0.5, -0.5, 1, 0.26, 'rx="0.03"') +
      r(-0.46, -0.47, 0.42, 0.2, 'rx="0.04"') + r(0.04, -0.47, 0.42, 0.2, 'rx="0.04"') + l(-0.5, 0.05, 0.5, 0.05),
  },
  {
    tipo: "cama_solteiro", rotulo: "Cama de solteiro", grupo: "quarto", largura: 0.9, altura: 1.9, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.04"') + r(-0.5, -0.5, 1, 0.26, 'rx="0.04"') +
      r(-0.34, -0.47, 0.68, 0.2, 'rx="0.05"') + l(-0.5, 0.05, 0.5, 0.05),
  },
  { tipo: "berco", rotulo: "Berço", grupo: "quarto", largura: 0.7, altura: 1.3, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.06"') + r(-0.36, -0.38, 0.72, 0.76, 'rx="0.05"') },
  { tipo: "guarda_roupa", rotulo: "Guarda-roupa", grupo: "quarto", largura: 2, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + l(0, -0.5, 0, 0.5) + l(-0.5, 0.28, 0.5, 0.28) },
  { tipo: "comoda", rotulo: "Cômoda", grupo: "quarto", largura: 1, altura: 0.45, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + l(-0.17, -0.5, -0.17, 0.5) + l(0.17, -0.5, 0.17, 0.5) },

  // ---- sala ----
  { tipo: "sofa_3", rotulo: "Sofá 3 lugares", grupo: "sala", largura: 2.1, altura: 0.9, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.08"') + r(-0.5, -0.5, 1, 0.3, 'rx="0.08"') +
      r(-0.5, -0.2, 0.14, 0.7, 'rx="0.06"') + r(0.36, -0.2, 0.14, 0.7, 'rx="0.06"') + l(-0.12, -0.2, -0.12, 0.5) + l(0.12, -0.2, 0.12, 0.5) },
  { tipo: "sofa_2", rotulo: "Sofá 2 lugares", grupo: "sala", largura: 1.5, altura: 0.9, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.1"') + r(-0.5, -0.5, 1, 0.32, 'rx="0.1"') +
      r(-0.5, -0.18, 0.16, 0.68, 'rx="0.07"') + r(0.34, -0.18, 0.16, 0.68, 'rx="0.07"') + l(0, -0.18, 0, 0.5) },
  { tipo: "sofa_l", rotulo: "Sofá em L", grupo: "sala", largura: 2.4, altura: 1.8, fundo: "#ffffff",
    // contorno em L, encosto nas duas costas e vinco entre os assentos
    desenho: `<path d="M-0.5 -0.5 H0.5 V0.5 H0.06 V-0.04 H-0.5 Z"/>` +
      `<path d="M-0.5 -0.5 H0.5 V-0.2 H-0.5 Z"/>` + `<path d="M0.5 -0.2 V0.5 H0.2 V-0.2 Z"/>` +
      l(-0.1, -0.2, -0.1, -0.04) + l(0.2, 0.16, 0.06, 0.16) },
  { tipo: "poltrona", rotulo: "Poltrona", grupo: "sala", largura: 0.8, altura: 0.8, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.14"') + r(-0.5, -0.5, 1, 0.3, 'rx="0.14"') },
  { tipo: "mesa_centro", rotulo: "Mesa de centro", grupo: "sala", largura: 1.1, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.1"') },
  { tipo: "mesa_lateral", rotulo: "Mesa lateral", grupo: "sala", largura: 0.5, altura: 0.5, fundo: "#ffffff", redondo: true,
    desenho: `<circle cx="0" cy="0" r="0.5"/>` },
  { tipo: "tv", rotulo: "TV / rack", grupo: "sala", largura: 1.6, altura: 0.4, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + r(-0.42, -0.2, 0.84, 0.12, 'rx="0.03"') },
  { tipo: "estante", rotulo: "Estante", grupo: "sala", largura: 1.6, altura: 0.35, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + l(-0.25, -0.5, -0.25, 0.5) + l(0, -0.5, 0, 0.5) + l(0.25, -0.5, 0.25, 0.5) },
  { tipo: "mesa_jantar_4", rotulo: "Mesa 4 lugares", grupo: "sala", largura: 1.2, altura: 0.9, fundo: "#ffffff",
    desenho: r(-0.34, -0.34, 0.68, 0.68, 'rx="0.05"') +
      r(-0.16, -0.5, 0.32, 0.11, 'rx="0.03"') + r(-0.16, 0.39, 0.32, 0.11, 'rx="0.03"') +
      r(-0.5, -0.16, 0.11, 0.32, 'rx="0.03"') + r(0.39, -0.16, 0.11, 0.32, 'rx="0.03"') },
  { tipo: "mesa_jantar_6", rotulo: "Mesa 6 lugares", grupo: "sala", largura: 1.8, altura: 0.95, fundo: "#ffffff",
    desenho: r(-0.4, -0.32, 0.8, 0.64, 'rx="0.04"') +
      r(-0.34, -0.5, 0.2, 0.11, 'rx="0.03"') + r(-0.1, -0.5, 0.2, 0.11, 'rx="0.03"') + r(0.14, -0.5, 0.2, 0.11, 'rx="0.03"') +
      r(-0.34, 0.39, 0.2, 0.11, 'rx="0.03"') + r(-0.1, 0.39, 0.2, 0.11, 'rx="0.03"') + r(0.14, 0.39, 0.2, 0.11, 'rx="0.03"') },

  // ---- cozinha ----
  { tipo: "fogao", rotulo: "Fogão", grupo: "cozinha", largura: 0.76, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + `<circle cx="-0.22" cy="-0.22" r="0.13"/><circle cx="0.22" cy="-0.22" r="0.13"/><circle cx="-0.22" cy="0.22" r="0.13"/><circle cx="0.22" cy="0.22" r="0.13"/>` },
  { tipo: "geladeira", rotulo: "Geladeira", grupo: "cozinha", largura: 0.75, altura: 0.7, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + l(-0.5, 0.12, 0.5, 0.12) + l(0.3, -0.36, 0.3, -0.02) },
  { tipo: "pia_cozinha", rotulo: "Pia", grupo: "cozinha", largura: 1.2, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + r(-0.42, -0.3, 0.46, 0.6, 'rx="0.05"') + `<circle cx="0.28" cy="-0.22" r="0.06"/>` },
  { tipo: "bancada", rotulo: "Bancada", grupo: "cozinha", largura: 2, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) },
  { tipo: "maquina_lavar", rotulo: "Máquina de lavar", grupo: "cozinha", largura: 0.6, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + `<circle cx="0" cy="0.05" r="0.3"/>` + l(-0.5, -0.26, 0.5, -0.26) },

  // ---- banheiro ----
  { tipo: "vaso", rotulo: "Vaso sanitário", grupo: "banheiro", largura: 0.4, altura: 0.7, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 0.26, 'rx="0.05"') + `<ellipse cx="0" cy="0.12" rx="0.4" ry="0.35"/>` },
  { tipo: "pia_banheiro", rotulo: "Pia do banheiro", grupo: "banheiro", largura: 0.6, altura: 0.45, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.06"') + `<ellipse cx="0" cy="0.08" rx="0.33" ry="0.3"/>` },
  { tipo: "chuveiro", rotulo: "Box / chuveiro", grupo: "banheiro", largura: 0.9, altura: 0.9, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + l(-0.5, -0.5, 0.5, 0.5) + l(0.5, -0.5, -0.5, 0.5) + `<circle cx="0" cy="0" r="0.12"/>` },
  { tipo: "banheira", rotulo: "Banheira", grupo: "banheiro", largura: 1.7, altura: 0.75, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.12"') + r(-0.42, -0.38, 0.84, 0.76, 'rx="0.1"') },

  // ---- escritório ----
  { tipo: "escrivaninha", rotulo: "Escrivaninha", grupo: "escritorio", largura: 1.2, altura: 0.6, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1) + r(0.12, -0.42, 0.34, 0.84) + l(0.12, 0, 0.46, 0) },

  // ---- fora e decoração ----
  { tipo: "tapete_retangular", rotulo: "Tapete", grupo: "sala", largura: 2, altura: 1.4,
    desenho: r(-0.5, -0.5, 1, 1, 'stroke-dasharray="0.06 0.04"') },
  { tipo: "tapete_redondo", rotulo: "Tapete redondo", grupo: "sala", largura: 1.6, altura: 1.6, redondo: true,
    desenho: `<circle cx="0" cy="0" r="0.5" stroke-dasharray="0.06 0.04"/>` },
  { tipo: "planta", rotulo: "Planta / vaso", grupo: "sala", largura: 0.5, altura: 0.5, fundo: "#ffffff", redondo: true,
    desenho: `<circle cx="0" cy="0" r="0.5"/><path d="M0 0.3 V-0.1 M0 -0.1 L-0.25 -0.32 M0 -0.1 L0.25 -0.32 M0 -0.1 L0 -0.42"/>` },
  { tipo: "carro", rotulo: "Carro", grupo: "fora", largura: 1.8, altura: 4.4, fundo: "#ffffff",
    desenho: r(-0.5, -0.5, 1, 1, 'rx="0.12"') + r(-0.38, -0.28, 0.76, 0.3, 'rx="0.06"') + r(-0.38, 0.06, 0.76, 0.26, 'rx="0.06"') },
];

export const MOVEL_POR_TIPO: Record<string, DefMovel> = Object.fromEntries(MOVEIS.map((m) => [m.tipo, m]));

export const GRUPOS_MOVEL: { id: DefMovel["grupo"]; rotulo: string }[] = [
  { id: "sala", rotulo: "Sala e jantar" },
  { id: "quarto", rotulo: "Quarto" },
  { id: "cozinha", rotulo: "Cozinha" },
  { id: "banheiro", rotulo: "Banheiro" },
  { id: "escritorio", rotulo: "Escritório" },
  { id: "fora", rotulo: "Área externa" },
];

/** Os quatro cantos do móvel já girados, em metros. Serve pra acertar o clique e alinhar. */
export function cantosDoMovel(m: Movel): { x: number; y: number }[] {
  const rad = (m.angulo * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sen = Math.sin(rad);
  const hx = m.largura / 2;
  const hy = m.altura / 2;
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => ({ x: m.p.x + x * cos - y * sen, y: m.p.y + x * sen + y * cos }));
}

/** O ponto está dentro do móvel? Leva o giro em conta (desgira o ponto em vez do móvel). */
export function dentroDoMovel(p: { x: number; y: number }, m: Movel): boolean {
  const rad = (-m.angulo * Math.PI) / 180;
  const dx = p.x - m.p.x;
  const dy = p.y - m.p.y;
  const x = dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(x) <= m.largura / 2 && Math.abs(y) <= m.altura / 2;
}

/**
 * Encaixa o móvel na parede mais próxima: encosta as costas nela e copia o ângulo dela.
 *
 * É o que faz mobiliar parecer profissional sem exigir precisão do mouse -- cama, sofá e
 * armário quase sempre vão contra a parede, e acertar isso no olho dá sempre 2 ou 3 graus
 * de torto. Só encaixa se a parede estiver perto o bastante; longe dela, o móvel fica
 * exatamente onde a pessoa soltou.
 */
export function encostarNaParede(
  m: Movel,
  paredes: { a: { x: number; y: number }; b: { x: number; y: number } }[],
  tolerancia = 0.45
): Movel {
  let melhor: { d: number; ang: number; q: { x: number; y: number } } | null = null;
  for (const { a, b } of paredes) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const comp2 = vx * vx + vy * vy;
    if (comp2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((m.p.x - a.x) * vx + (m.p.y - a.y) * vy) / comp2));
    const q = { x: a.x + vx * t, y: a.y + vy * t };
    const d = Math.hypot(m.p.x - q.x, m.p.y - q.y);
    if (d > tolerancia + m.altura / 2) continue;
    if (!melhor || d < melhor.d) melhor = { d, ang: (Math.atan2(vy, vx) * 180) / Math.PI, q };
  }
  if (!melhor) return m;

  // gira pro ângulo da parede (múltiplo de 180 mais próximo do atual, pra não virar de ré)
  const base = ((melhor.ang % 360) + 360) % 360;
  const opcoes = [base, (base + 180) % 360];
  const atual = ((m.angulo % 360) + 360) % 360;
  const angulo = opcoes.reduce((melhorA, o) => {
    const dif = (x: number) => Math.min(Math.abs(x - atual), 360 - Math.abs(x - atual));
    return dif(o) < dif(melhorA) ? o : melhorA;
  }, opcoes[0]);

  // empurra o centro pra que as costas encostem na parede
  const rad = (angulo * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const lado = (m.p.x - melhor.q.x) * nx + (m.p.y - melhor.q.y) * ny >= 0 ? 1 : -1;
  return { ...m, angulo, p: { x: melhor.q.x + nx * lado * (m.altura / 2), y: melhor.q.y + ny * lado * (m.altura / 2) } };
}

/**
 * Guias de alinhamento: devolve o móvel ajustado e as linhas a desenhar.
 *
 * Compara o centro com o centro dos outros móveis; quando está a menos de `tol`, cola e
 * devolve a guia. É o que existe em editor de verdade e o que impede a fileira de móveis
 * levemente desalinhada que denuncia planta feita no olho.
 */
export function alinharComOutros(
  m: Movel,
  outros: Movel[],
  tol = 0.12
): { movel: Movel; guias: { eixo: "x" | "y"; valor: number }[] } {
  const guias: { eixo: "x" | "y"; valor: number }[] = [];
  let { x, y } = m.p;
  let dx = tol;
  let dy = tol;
  for (const o of outros) {
    if (o.id === m.id) continue;
    if (Math.abs(o.p.x - m.p.x) < dx) {
      dx = Math.abs(o.p.x - m.p.x);
      x = o.p.x;
    }
    if (Math.abs(o.p.y - m.p.y) < dy) {
      dy = Math.abs(o.p.y - m.p.y);
      y = o.p.y;
    }
  }
  if (x !== m.p.x) guias.push({ eixo: "x", valor: x });
  if (y !== m.p.y) guias.push({ eixo: "y", valor: y });
  return { movel: { ...m, p: { x, y } }, guias };
}

/** Todas as paredes da planta como pares de pontos, pro encaixe. */
export function paredesDe(comodos: { pontos: { x: number; y: number }[] }[]) {
  const paredes: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (const c of comodos) {
    for (let i = 0; i < c.pontos.length; i++) {
      paredes.push({ a: c.pontos[i], b: c.pontos[(i + 1) % c.pontos.length] });
    }
  }
  return paredes;
}
