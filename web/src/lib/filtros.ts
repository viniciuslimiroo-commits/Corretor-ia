// FILTROS: uma função de cor, e as duas pontas usando a MESMA função.
//
// A versão anterior tinha dois motores: o ffmpeg fazia `eq` e `colorbalance`, e a prévia
// no navegador fazia `filter: sepia() saturate()` -- "a aproximação mais próxima que o
// navegador sabe fazer", dizia o comentário. Aproximação é outro jeito de dizer que a
// miniatura mentia um pouco, e a pessoa escolhia o filtro olhando a mentira.
//
// Aqui cada filtro é um conjunto de AJUSTES (exposição, contraste, temperatura...) e uma
// função pura `aplicarGrade` que leva um pixel de cor a outro. Essa função é a verdade:
//
//   - na tela, ela roda pixel a pixel sobre a foto da cena (canvas);
//   - no servidor, ela é amostrada numa LUT 3D (.cube) que o ffmpeg aplica com `lut3d`.
//
// A LUT de 33 pontos por canal com interpolação tetraédrica erra menos de um nível de cor
// numa função suave como esta. Então o que aparece no quadradinho é o que sai no vídeo --
// e isso é MEDIDO em scripts/testar-filtros-lut.ts, não prometido.
//
// Arquivo sem dependência de servidor: é importado pelo navegador.

export type Ajustes = {
  /** -1 a 1. Multiplica a luz: +1 ≈ um ponto e meio de câmera. */
  exposicao: number;
  /** -1 a 1. Curva em S: afasta sombra de luz sem estourar as pontas. */
  contraste: number;
  /** -1 a 1. -1 é preto e branco. */
  saturacao: number;
  /** -1 a 1. Positivo esquenta (tira o azul), negativo esfria (tira a lâmpada amarela). */
  temperatura: number;
  /** -1 a 1. Positivo puxa pro magenta, negativo pro verde. */
  matiz: number;
  /** -1 a 1. Abre (ou fecha) só as partes escuras: o canto do cômodo sem janela. */
  sombras: number;
  /** -1 a 1. Negativo recupera céu e janela estourados; positivo acende. */
  realces: number;
  /** 0 a 1. Levanta o preto e baixa o branco: o aspecto de foto revelada. */
  desbotar: number;
  /** 0 a 1. Escurece as bordas. É espacial, então fica fora da LUT (ver `vinheta`). */
  vinheta: number;
};

export const AJUSTES_NEUTROS: Ajustes = {
  exposicao: 0,
  contraste: 0,
  saturacao: 0,
  temperatura: 0,
  matiz: 0,
  sombras: 0,
  realces: 0,
  desbotar: 0,
  vinheta: 0,
};

/** Os controles da aba Ajustes, na ordem em que um fotógrafo mexe. */
export const CONTROLES_AJUSTE: { id: keyof Ajustes; rotulo: string; min: number; max: number; dica: string }[] = [
  { id: "exposicao", rotulo: "Exposição", min: -1, max: 1, dica: "O cômodo saiu escuro? Comece aqui." },
  { id: "contraste", rotulo: "Contraste", min: -1, max: 1, dica: "Separa o claro do escuro" },
  { id: "sombras", rotulo: "Sombras", min: -1, max: 1, dica: "Abre o canto escuro sem clarear a janela" },
  { id: "realces", rotulo: "Realces", min: -1, max: 1, dica: "Negativo recupera céu e janela estourados" },
  { id: "temperatura", rotulo: "Temperatura", min: -1, max: 1, dica: "Negativo tira o amarelo da lâmpada" },
  { id: "matiz", rotulo: "Matiz", min: -1, max: 1, dica: "Corrige verde de lâmpada fluorescente" },
  { id: "saturacao", rotulo: "Saturação", min: -1, max: 1, dica: "Força da cor" },
  { id: "desbotar", rotulo: "Desbotar", min: 0, max: 1, dica: "Aspecto de foto revelada" },
  { id: "vinheta", rotulo: "Vinheta", min: 0, max: 1, dica: "Escurece as bordas e leva o olho pro centro" },
];

export type CategoriaFiltro = "imovel" | "vivo" | "suave" | "cinema" | "retro" | "pb";

export const CATEGORIAS_FILTRO: { id: CategoriaFiltro; rotulo: string }[] = [
  { id: "imovel", rotulo: "Imóvel" },
  { id: "vivo", rotulo: "Vivo" },
  { id: "suave", rotulo: "Suave" },
  { id: "cinema", rotulo: "Cinema" },
  { id: "retro", rotulo: "Retrô" },
  { id: "pb", rotulo: "P&B" },
];

/** Cor somada nas sombras ou nas luzes, em fração (0,05 = 5% do canal). */
type Tom = [number, number, number];

export type ModeloFiltro = {
  id: string;
  rotulo: string;
  categoria: CategoriaFiltro;
  dica: string;
  ajustes: Partial<Ajustes>;
  /** Tira a cor antes de tonalizar: preto e branco, sépia, prata. */
  mono?: boolean;
  /** Tonalização dividida: uma cor entra nas sombras, outra nas luzes. */
  tomSombra?: Tom;
  tomLuz?: Tom;
};

// Os ids antigos (natural, claro, quente, sobrio, cinema, pb) CONTINUAM existindo: vídeo
// feito antes desta troca guarda esses nomes no espec, e reabrir um vídeo pronto não pode
// mudar a cor dele.
export const MODELOS_FILTRO: ModeloFiltro[] = [
  // ---------------------------------------------------------------- imóvel
  { id: "natural", rotulo: "Natural", categoria: "imovel", dica: "A foto como ela é.", ajustes: {} },
  {
    id: "claro",
    rotulo: "Claro e limpo",
    categoria: "imovel",
    dica: "O acabamento de anúncio: mais luz, sombra aberta, branco limpo.",
    ajustes: { exposicao: 0.22, sombras: 0.4, realces: -0.2, contraste: 0.14, saturacao: 0.08, temperatura: -0.06 },
  },
  {
    id: "branco",
    rotulo: "Branco neutro",
    categoria: "imovel",
    dica: "Tira o amarelo de lâmpada. Parede branca volta a ser branca.",
    ajustes: { temperatura: -0.42, matiz: 0.06, exposicao: 0.08, saturacao: -0.04 },
  },
  {
    id: "fachada",
    rotulo: "Fachada",
    categoria: "imovel",
    dica: "Céu mais azul e recuperado, verde mais vivo.",
    ajustes: { realces: -0.45, saturacao: 0.38, contraste: 0.22, temperatura: -0.16 },
    tomLuz: [-0.015, 0, 0.03],
  },
  {
    id: "quente",
    rotulo: "Aconchegante",
    categoria: "imovel",
    dica: "Puxa pro dourado: sala de estar, fim de tarde.",
    ajustes: { temperatura: 0.34, saturacao: 0.1, sombras: 0.12 },
    tomSombra: [0.025, 0.01, -0.015],
  },
  {
    id: "madeira",
    rotulo: "Madeira",
    categoria: "imovel",
    dica: "Realça marcenaria, piso de madeira e tijolo.",
    ajustes: { temperatura: 0.24, saturacao: 0.2, contraste: 0.14, matiz: -0.04 },
    tomLuz: [0.03, 0.015, -0.02],
  },

  // ---------------------------------------------------------------- vivo
  { id: "vibrante", rotulo: "Vibrante", categoria: "vivo", dica: "Cor e contraste pra rede social.", ajustes: { saturacao: 0.6, contraste: 0.28, exposicao: 0.06 } },
  { id: "tropical", rotulo: "Tropical", categoria: "vivo", dica: "Verde e azul de área externa e piscina.", ajustes: { saturacao: 0.32, temperatura: 0.06, matiz: -0.12, contraste: 0.1 } },
  { id: "verao", rotulo: "Verão", categoria: "vivo", dica: "Luz de praia, quente e aberta.", ajustes: { exposicao: 0.14, temperatura: 0.2, saturacao: 0.22, desbotar: 0.1 } },

  // ---------------------------------------------------------------- suave
  { id: "pastel", rotulo: "Pastel", categoria: "suave", dica: "Cor leve e ar claro. Decoração, quarto de criança.", ajustes: { saturacao: -0.28, exposicao: 0.14, desbotar: 0.38, contraste: -0.18 }, tomLuz: [0.008, 0.006, 0.018] },
  { id: "manha", rotulo: "Manhã", categoria: "suave", dica: "Luz de janela cedo, macia e morna.", ajustes: { exposicao: 0.12, temperatura: 0.12, desbotar: 0.18, sombras: 0.22, contraste: -0.08 } },
  { id: "sereno", rotulo: "Sereno", categoria: "suave", dica: "Frio e calmo. Alto padrão minimalista.", ajustes: { temperatura: -0.14, saturacao: -0.14, desbotar: 0.2, exposicao: 0.06 } },

  // ---------------------------------------------------------------- cinema
  { id: "sobrio", rotulo: "Sóbrio", categoria: "cinema", dica: "Puxa pro azul: comercial, moderno.", ajustes: { temperatura: -0.22, saturacao: -0.08, contraste: 0.14 }, tomSombra: [-0.015, 0, 0.035] },
  {
    id: "cinema",
    rotulo: "Cinema",
    categoria: "cinema",
    dica: "Sombra azul-petróleo, luz alaranjada. O visual de trailer.",
    ajustes: { contraste: 0.24, saturacao: -0.04 },
    tomSombra: [-0.03, 0.02, 0.055],
    tomLuz: [0.055, 0.02, -0.04],
  },
  { id: "noite", rotulo: "Noite", categoria: "cinema", dica: "Azulado e escuro, pra fachada iluminada.", ajustes: { exposicao: -0.4, temperatura: -0.55, contraste: 0.28, saturacao: -0.22, vinheta: 0.5 }, tomSombra: [-0.02, 0, 0.05] },
  { id: "drama", rotulo: "Drama", categoria: "cinema", dica: "Contraste forte e borda escura.", ajustes: { contraste: 0.4, saturacao: -0.22, sombras: -0.18, vinheta: 0.45 } },

  // ---------------------------------------------------------------- retrô
  { id: "retro", rotulo: "Retrô", categoria: "retro", dica: "Filme de revista dos anos 70.", ajustes: { desbotar: 0.32, temperatura: 0.16, saturacao: -0.16, contraste: -0.04 }, tomSombra: [0.035, 0.02, -0.015], tomLuz: [0.025, 0.025, -0.03] },
  { id: "filme", rotulo: "Filme", categoria: "retro", dica: "Negativo revelado, verde nas sombras.", ajustes: { desbotar: 0.24, saturacao: -0.26, matiz: -0.06, contraste: 0.08 }, tomSombra: [0, 0.03, 0.025] },
  { id: "sepia", rotulo: "Sépia", categoria: "retro", dica: "Foto antiga. Casarão, patrimônio.", ajustes: { desbotar: 0.12, contraste: 0.06 }, mono: true, tomSombra: [0.05, 0.02, -0.04], tomLuz: [0.07, 0.035, -0.04] },

  // ---------------------------------------------------------------- p&b
  { id: "pb", rotulo: "Preto e branco", categoria: "pb", dica: "Sem cor. Fachada e detalhe de arquitetura.", ajustes: { contraste: 0.16 }, mono: true },
  { id: "pb_forte", rotulo: "P&B forte", categoria: "pb", dica: "Preto fundo e borda escura.", ajustes: { contraste: 0.42, sombras: -0.12, vinheta: 0.3 }, mono: true },
  { id: "prata", rotulo: "Prata", categoria: "pb", dica: "Preto e branco frio e macio.", ajustes: { desbotar: 0.16, exposicao: 0.06 }, mono: true, tomSombra: [-0.015, 0, 0.025], tomLuz: [-0.01, 0, 0.02] },
];

export type FiltroId = (typeof MODELOS_FILTRO)[number]["id"];

export const FILTRO_POR_ID: Record<string, ModeloFiltro> = Object.fromEntries(MODELOS_FILTRO.map((f) => [f.id, f]));

export function ehFiltro(v: unknown): string {
  return typeof v === "string" && v in FILTRO_POR_ID ? v : "natural";
}

/** O que uma cena pede de cor, já resolvido (filtro do vídeo ou da cena, e ajustes). */
export type Grade = {
  filtro: string;
  /** 0 a 1: quanto do filtro entra. 1 = inteiro. */
  intensidade: number;
  ajustes: Ajustes;
};

export const GRADE_NEUTRA: Grade = { filtro: "natural", intensidade: 1, ajustes: AJUSTES_NEUTROS };

const lim = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Um conjunto de ajustes aplicado a um pixel (0 a 1 por canal).
 *
 * A ordem é a de um revelador de foto: luz, balanço de branco, sombra/realce, contraste,
 * cor e, por último, o desbotado -- que tem que vir depois do contraste, senão o
 * contraste desfaz o preto levantado.
 */
function ajustar(r: number, g: number, b: number, a: Ajustes, m?: ModeloFiltro): [number, number, number] {
  // 1. exposição: multiplica, e não soma -- somar lava o preto junto com o resto.
  if (a.exposicao) {
    const k = Math.pow(2, a.exposicao);
    r *= k;
    g *= k;
    b *= k;
  }
  // 2. balanço de branco
  // Os ganhos daqui foram CALIBRADOS olhando a folha de contato numa foto real, não
  // escolhidos no papel. Na primeira versão eles eram a metade, e oito dos vinte filtros
  // saíam indistinguíveis do Natural numa miniatura -- que é o tamanho em que se escolhe.
  if (a.temperatura) {
    r *= 1 + a.temperatura * 0.22;
    b *= 1 - a.temperatura * 0.26;
    g *= 1 + a.temperatura * 0.03;
  }
  if (a.matiz) g *= 1 - a.matiz * 0.16;
  // 3. sombras e realces: o peso cai rápido fora da faixa, então abrir a sombra não
  // acende a janela.
  if (a.sombras || a.realces) {
    const L = lim(luma(r, g, b));
    const ws = (1 - L) * (1 - L) * (1 - L);
    const wh = L * L * L;
    const d = a.sombras * 0.5 * ws + a.realces * 0.4 * wh;
    r += d;
    g += d;
    b += d;
  }
  r = lim(r);
  g = lim(g);
  b = lim(b);
  // 4. contraste: curva em S (smoothstep) pra cima, achatamento linear pra baixo.
  if (a.contraste) {
    const c = a.contraste;
    const curva = (v: number) => (c > 0 ? v + (v * v * (3 - 2 * v) - v) * c * 2 : 0.5 + (v - 0.5) * (1 + c * 0.6));
    r = curva(r);
    g = curva(g);
    b = curva(b);
  }
  // 5. saturação (e o preto e branco, que é saturação zero antes do tom)
  const sat = m?.mono ? -1 : a.saturacao;
  if (sat) {
    const L = luma(r, g, b);
    const k = Math.max(0, 1 + sat * 1.4);
    r = L + (r - L) * k;
    g = L + (g - L) * k;
    b = L + (b - L) * k;
  }
  // 6. tonalização dividida
  if (m?.tomSombra || m?.tomLuz) {
    const L = lim(luma(r, g, b));
    // ×2,5: os tons do catálogo são escritos na escala de "quanto de cor" (0,05 = 5%), e
    // o peso quadrático come mais da metade disso no meio-tom.
    const ws = (1 - L) * (1 - L) * 2.5;
    const wh = L * L * 2.5;
    if (m.tomSombra) {
      r += m.tomSombra[0] * ws;
      g += m.tomSombra[1] * ws;
      b += m.tomSombra[2] * ws;
    }
    if (m.tomLuz) {
      r += m.tomLuz[0] * wh;
      g += m.tomLuz[1] * wh;
      b += m.tomLuz[2] * wh;
    }
  }
  // 7. desbotar: por último, senão o contraste desfaz o preto levantado
  if (a.desbotar) {
    const piso = a.desbotar * 0.2;
    const teto = 1 - a.desbotar * 0.1;
    r = piso + lim(r) * (teto - piso);
    g = piso + lim(g) * (teto - piso);
    b = piso + lim(b) * (teto - piso);
  }
  return [lim(r), lim(g), lim(b)];
}

/**
 * A função de cor inteira de uma cena: o filtro (na intensidade escolhida) e, por cima,
 * os ajustes. Um pixel entra (0 a 1 por canal), um pixel sai.
 *
 * É ESTA função que a miniatura roda e que vira LUT no servidor.
 */
export function aplicarGrade(r: number, g: number, b: number, grade: Grade): [number, number, number] {
  return funcaoDaGrade(grade)(r, g, b);
}

/**
 * A função de cor de uma grade, montada UMA vez.
 *
 * `aplicarGrade` chamada pixel a pixel juntaria os ajustes do modelo a cada pixel -- um
 * objeto novo por pixel, meio milhão de objetos numa miniatura. Aqui a junção acontece
 * antes, e o que roda por pixel é só conta.
 */
export function funcaoDaGrade(grade: Grade): (r: number, g: number, b: number) => [number, number, number] {
  const modelo = FILTRO_POR_ID[grade.filtro];
  const comFiltro = !!modelo && modelo.id !== "natural" && grade.intensidade > 0;
  const doModelo: Ajustes = { ...AJUSTES_NEUTROS, ...(modelo?.ajustes ?? {}) };
  const k = lim(grade.intensidade);
  const comAjustes = !ajustesNeutros(grade.ajustes);
  const ajustes: Ajustes = { ...AJUSTES_NEUTROS, ...grade.ajustes };
  return (r, g, b) => {
    let R = r;
    let G = g;
    let B = b;
    if (comFiltro) {
      const [fr, fg, fb] = ajustar(r, g, b, doModelo, modelo);
      R = r + (fr - r) * k;
      G = g + (fg - g) * k;
      B = b + (fb - b) * k;
    }
    if (comAjustes) [R, G, B] = ajustar(R, G, B, ajustes);
    return [R, G, B];
  };
}

/**
 * A mesma grade como TABELA 3D (n³ pontos, RGB em 0-1), pra aplicar em imagem inteira.
 *
 * É exatamente o que o servidor faz com a LUT: amostrar a função numa grade e interpolar.
 * No navegador isso transforma "a função inteira por pixel" em "oito leituras e uma média
 * por pixel", e a miniatura sai na mesma conta do vídeo.
 */
export function tabelaDaGrade(grade: Grade, n = 33): Float32Array {
  const f = funcaoDaGrade(grade);
  const t = new Float32Array(n * n * n * 3);
  let p = 0;
  for (let bi = 0; bi < n; bi++) {
    for (let gi = 0; gi < n; gi++) {
      for (let ri = 0; ri < n; ri++) {
        const [r, g, b] = f(ri / (n - 1), gi / (n - 1), bi / (n - 1));
        t[p++] = r;
        t[p++] = g;
        t[p++] = b;
      }
    }
  }
  return t;
}

/** Lê a tabela num ponto (0-1 por canal), com interpolação trilinear. Escreve em `saida`. */
export function lerTabela(t: Float32Array, n: number, r: number, g: number, b: number, saida: Float32Array): void {
  const m = n - 1;
  const x = lim(r) * m;
  const y = lim(g) * m;
  const z = lim(b) * m;
  const x0 = Math.min(m - 1, Math.floor(x));
  const y0 = Math.min(m - 1, Math.floor(y));
  const z0 = Math.min(m - 1, Math.floor(z));
  const dx = x - x0;
  const dy = y - y0;
  const dz = z - z0;
  const base = (xi: number, yi: number, zi: number) => ((zi * n + yi) * n + xi) * 3;
  const c000 = base(x0, y0, z0);
  const c100 = base(x0 + 1, y0, z0);
  const c010 = base(x0, y0 + 1, z0);
  const c110 = base(x0 + 1, y0 + 1, z0);
  const c001 = base(x0, y0, z0 + 1);
  const c101 = base(x0 + 1, y0, z0 + 1);
  const c011 = base(x0, y0 + 1, z0 + 1);
  const c111 = base(x0 + 1, y0 + 1, z0 + 1);
  for (let c = 0; c < 3; c++) {
    const a = t[c000 + c] * (1 - dx) + t[c100 + c] * dx;
    const bb = t[c010 + c] * (1 - dx) + t[c110 + c] * dx;
    const cc = t[c001 + c] * (1 - dx) + t[c101 + c] * dx;
    const d = t[c011 + c] * (1 - dx) + t[c111 + c] * dx;
    saida[c] = (a * (1 - dy) + bb * dy) * (1 - dz) + (cc * (1 - dy) + d * dy) * dz;
  }
}

export function ajustesNeutros(a: Ajustes): boolean {
  return (Object.keys(AJUSTES_NEUTROS) as (keyof Ajustes)[]).every((k) => k === "vinheta" || !a[k]);
}

/** A vinheta que a cena vai ter: a do filtro (proporcional à intensidade) mais a dos ajustes. */
export function vinhetaDaGrade(grade: Grade): number {
  const doFiltro = (FILTRO_POR_ID[grade.filtro]?.ajustes.vinheta ?? 0) * lim(grade.intensidade);
  return lim(doFiltro + (grade.ajustes.vinheta ?? 0));
}

/** A grade não muda nada: o servidor nem gera LUT, e o ffmpeg não ganha filtro. */
export function gradeNeutra(grade: Grade): boolean {
  return (grade.filtro === "natural" || grade.intensidade <= 0) && ajustesNeutros(grade.ajustes) && vinhetaDaGrade(grade) === 0;
}

/**
 * O ângulo da vinheta, e o fator dela num ponto -- a MESMA conta do filtro `vignette` do
 * ffmpeg: fator = cos(ângulo × d)⁴, com d a distância ao centro dividida pela metade da
 * diagonal. Copiada daqui pra miniatura, a borda escura da tela é a borda do vídeo.
 */
export function anguloDaVinheta(forca: number): number {
  // Até 60°: no canto, cos(60°)⁴ ≈ 6% da luz. Com 45° de teto (a primeira versão), a
  // vinheta mais forte do catálogo deixava o canto em 78% -- não se via na miniatura.
  return lim(forca) * (Math.PI / 3);
}
export function fatorDaVinheta(x: number, y: number, W: number, H: number, angulo: number): number {
  if (angulo <= 0) return 1;
  const d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2);
  const c = Math.cos(angulo * Math.min(1, d));
  return c * c * c * c;
}

/**
 * Um canal (0 a 1) escurecido pelo fator da vinheta, DO JEITO que o ffmpeg escurece.
 *
 * O `vignette` roda no vídeo em YUV de faixa limitada: multiplica o Y, que vai de 16 a
 * 235, e não a luz de 0 a 1. Multiplicar 16 também puxa o preto pra baixo do preto, e
 * isso volta pro RGB como um escurecimento a mais de 16/219 × (1 − fator).
 *
 * Multiplicar o RGB direto -- o óbvio, e a primeira versão -- deixava a prévia 7 níveis
 * mais CLARA que o vídeo nos cantos. Medido em scripts/testar-filtros-lut.ts, onde o
 * miolo batia e só o canto não.
 */
export function escurecerComVinheta(v: number, fator: number): number {
  const r = v * fator - (16 / 219) * (1 - fator);
  return r < 0 ? 0 : r;
}

/**
 * Limpa ajustes vindos do navegador: número finito, dentro da faixa, zero some.
 *
 * Objeto que chega VAZIO continua objeto vazio, e não vira `undefined`. A diferença
 * importa: na cena, `undefined` quer dizer "segue os ajustes do vídeo" e `{}` quer dizer
 * "esta cena, sem ajuste nenhum". Colapsar os dois fazia a tela mostrar a cena neutra e o
 * vídeo sair com o ajuste do vídeo -- a prévia mentindo por causa de um saneador.
 */
export function limparAjustes(bruto: unknown): Partial<Ajustes> | undefined {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  const b = bruto as Record<string, unknown>;
  const saida: Partial<Ajustes> = {};
  for (const c of CONTROLES_AJUSTE) {
    const n = Number(b[c.id]);
    if (Number.isFinite(n) && Math.abs(n) > 0.005) saida[c.id] = Math.round(Math.min(c.max, Math.max(c.min, n)) * 100) / 100;
  }
  return saida;
}

/**
 * A LUT 3D em formato .cube, amostrada da função de cor.
 *
 * No .cube o VERMELHO varia mais rápido: laço de fora é azul, o de dentro é vermelho.
 * Inverter a ordem não dá erro nenhum -- dá um vídeo com o azul e o vermelho trocados.
 */
export function lutCube(grade: Grade, n = 33): string {
  // A LUT sai da MESMA tabela que a miniatura usa -- não de uma segunda amostragem.
  const t = tabelaDaGrade(grade, n);
  const linhas = [`TITLE "Encena ${grade.filtro}"`, `LUT_3D_SIZE ${n}`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"];
  for (let p = 0; p < t.length; p += 3) linhas.push(`${t[p].toFixed(5)} ${t[p + 1].toFixed(5)} ${t[p + 2].toFixed(5)}`);
  return linhas.join("\n") + "\n";
}
