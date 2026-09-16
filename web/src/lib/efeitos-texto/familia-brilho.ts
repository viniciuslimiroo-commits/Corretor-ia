import { abrirSvg, fonte, type Contorno, type EfeitoTexto, type FonteId } from "./nucleo";

// FAMÍLIA BRILHO: neon, luz e metal.
//
// O que separa isto de "mesma letra com outra cor" é que cada peça é montada em CAMADAS
// com um papel cada: um véu ou placa que dá contraste na parede branca, o brilho largo que
// espalha a cor, a borda acesa, o corpo da letra e o miolo quente.
// Todo tamanho sai de `c.corpo`, então a receita vale igual pra corpo 40 e corpo 200.
//
// Duas regras de custo, medidas no librsvg (sharp):
// - cada feGaussianBlur custa pela ÁREA do SVG, não pelo raio (~150 ms a cada 800 mil px).
//   Então no máximo DOIS desfoques por peça; o brilho curto é feito com traços
//   semitransparentes empilhados, que custam quase nada.
// - feTurbulence custa ~450 ms por oitava na mesma área. O raio do "Elétrico" é geometria
//   gerada aqui em JS, não ruído de filtro.
//
// Filtros usam `filterUnits="userSpaceOnUse"` cobrindo o SVG inteiro: a região em
// porcentagem é relativa à caixa do texto, e numa frase larga e baixa ("Aceita
// financiamento") -50% da altura não cabe o brilho -- ele sai cortado reto em cima e embaixo.
//
// Gradiente vertical da letra vai em `userSpaceOnUse`, do topo da MAIÚSCULA até a linha de
// base. Em `objectBoundingBox` a caixa muda com acento e cedilha, e a mesma faixa de cor
// cai em alturas diferentes em "VENDA" e em "À VENDA".

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Altura da maiúscula em px, lida da tabela OS/2 da própria fonte (varia de 0,69 a 0,86 do corpo). */
function alturaMaiuscula(id: FonteId, corpo: number): number {
  const f = fonte(id);
  const cap = Number(f.tables.os2?.sCapHeight);
  return corpo * (cap > 0 ? cap / f.unitsPerEm : 0.7);
}

/** Margens (esquerda/topo) e tamanho final do SVG. */
type Caixa = { mx: number; my: number; l: number; a: number };

/**
 * Caixa que cobre de (x0,y0) a (x1,y1), em coordenadas do texto (o texto vai de 0,0 a
 * largura,altura). Os 2 px a mais não são desenho: são a franja do antisserrilhado, que em
 * corpo 40 é uma fração grande da margem e cortava a ponta da estrela rente à borda.
 */
function envolver(x0: number, y0: number, x1: number, y1: number): Caixa {
  const mx = Math.ceil(Math.max(0, -x0)) + 2;
  const my = Math.ceil(Math.max(0, -y0)) + 2;
  return { mx, my, l: Math.ceil(x1 + mx) + 2, a: Math.ceil(y1 + my) + 2 };
}

const caixa = (c: Contorno, m: number) => envolver(-m, -m, c.largura + m, c.altura + m);

/** Região do filtro = o SVG todo, no espaço do grupo já deslocado pela margem. */
const regiao = (k: Caixa) =>
  `filterUnits="userSpaceOnUse" x="${-k.mx}" y="${-k.my}" width="${k.l}" height="${k.a}" color-interpolation-filters="sRGB"`;

const desfoque = (id: string, k: Caixa, s: number) =>
  `<filter id="${id}" ${regiao(k)}><feGaussianBlur stdDeviation="${n(s)}"/></filter>`;

/** Gradiente vertical em px, de y0 a y1 (ver cabeçalho: acento não pode mexer na faixa). */
const vertical = (id: string, y0: number, y1: number, stops: [number, string, number?][]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="0" y2="${n(y1)}">` +
  stops.map(([o, cor, op]) => `<stop offset="${o}" stop-color="${cor}"${op === undefined ? "" : ` stop-opacity="${op}"`}/>`).join("") +
  `</linearGradient>`;

/**
 * Monta a peça. O texto entra UMA vez em <defs> e as camadas o reusam com <use>: a frase
 * longa tem dezenas de KB de caminho, e repetir o `d` seis vezes só engorda o SVG.
 */
function montar(c: Contorno, p: string, k: Caixa, defs: string, camadas: string) {
  return {
    largura: k.l,
    altura: k.a,
    svg:
      abrirSvg(k.l, k.a) +
      `<defs><path id="${p}-t" d="${c.d}"/>${defs}</defs>` +
      `<g transform="translate(${k.mx} ${k.my})">${camadas}</g></svg>`,
  };
}

const usar = (p: string, attrs: string) => `<use href="#${p}-t" ${attrs}/>`;

/** Estrela de quatro pontas (brilho de reflexo), centrada em (x,y). */
function estrela(x: number, y: number, r: number, attrs: string) {
  const q = r * 0.13;
  return (
    `<path transform="translate(${n(x)} ${n(y)})" ${attrs} d="` +
    `M0 ${n(-r)}C${n(q)} ${n(-q)} ${n(q)} ${n(-q)} ${n(r)} 0` +
    `C${n(q)} ${n(q)} ${n(q)} ${n(q)} 0 ${n(r)}` +
    `C${n(-q)} ${n(q)} ${n(-q)} ${n(q)} ${n(-r)} 0` +
    `C${n(-q)} ${n(-q)} ${n(-q)} ${n(-q)} 0 ${n(-r)}Z"/>`
  );
}

// ---------------------------------------------------------------------------------------
// GEOMETRIA DA BORDA (lâmpadas e Elétrico)
// ---------------------------------------------------------------------------------------

type Pt = { x: number; y: number };

/** Sorteio com semente: o mesmo texto sai sempre com os mesmos raios (prévia = exportação). */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lê o `d` do núcleo (M, L, Q, C, Z absolutos) e devolve cada contorno fechado como uma
 * lista de pontos a cada `passo` px, seguindo as curvas.
 */
function amostrar(d: string, passo: number): Pt[][] {
  const contornos: Pt[][] = [];
  let atual: Pt[] = [];
  let x = 0;
  let y = 0;
  let x0 = 0;
  let y0 = 0;
  const seguir = (pontoEm: (t: number) => Pt, comprimento: number) => {
    const k = Math.max(1, Math.ceil(comprimento / passo));
    for (let i = 1; i <= k; i++) atual.push(pontoEm(i / k));
  };
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const v = (m[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (m[1] === "M") {
      if (atual.length > 2) contornos.push(atual);
      x = x0 = v[0];
      y = y0 = v[1];
      atual = [{ x, y }];
    } else if (m[1] === "L") {
      const [ax, ay] = [x, y];
      seguir((t) => ({ x: ax + (v[0] - ax) * t, y: ay + (v[1] - ay) * t }), Math.hypot(v[0] - ax, v[1] - ay));
      [x, y] = [v[0], v[1]];
    } else if (m[1] === "Q") {
      const [ax, ay] = [x, y];
      const comp = Math.hypot(v[0] - ax, v[1] - ay) + Math.hypot(v[2] - v[0], v[3] - v[1]);
      seguir((t) => {
        const u = 1 - t;
        return { x: u * u * ax + 2 * u * t * v[0] + t * t * v[2], y: u * u * ay + 2 * u * t * v[1] + t * t * v[3] };
      }, comp);
      [x, y] = [v[2], v[3]];
    } else if (m[1] === "C") {
      const [ax, ay] = [x, y];
      const comp = Math.hypot(v[0] - ax, v[1] - ay) + Math.hypot(v[2] - v[0], v[3] - v[1]) + Math.hypot(v[4] - v[2], v[5] - v[3]);
      seguir((t) => {
        const u = 1 - t;
        return {
          x: u * u * u * ax + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4],
          y: u * u * u * ay + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5],
        };
      }, comp);
      [x, y] = [v[4], v[5]];
    } else {
      if (Math.hypot(x0 - x, y0 - y) > 0.01) atual.push({ x: x0, y: y0 });
      if (atual.length > 2) contornos.push(atual);
      atual = [];
      [x, y] = [x0, y0];
    }
  }
  if (atual.length > 2) contornos.push(atual);
  return contornos;
}

/** Ponto dentro da letra? Regra nonzero (a mesma do preenchimento do SVG). */
function dentro(p: Pt, contornos: Pt[][]): boolean {
  let voltas = 0;
  for (const cont of contornos) {
    for (let i = 0; i < cont.length; i++) {
      const a = cont[i];
      const b = cont[(i + 1) % cont.length];
      if (a.y <= p.y) {
        if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) voltas++;
      } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) voltas--;
    }
  }
  return voltas !== 0;
}

/**
 * Só os contornos de FORA, sem os miolos (o furo do "O", do "8", do "A"), já amostrados.
 * Um contorno é miolo quando um ponto dele cai dentro de outro contorno.
 */
function bordasDeFora(todos: Pt[][]): Pt[][] {
  return todos.filter((cont, i) => !dentro(cont[0], todos.filter((_, j) => j !== i)));
}

/** Comprimento acumulado de um contorno fechado (o último item é o perímetro inteiro). */
function acumulado(cont: Pt[]): number[] {
  const acum = [0];
  for (let i = 1; i <= cont.length; i++) {
    const a = cont[i - 1];
    const b = cont[i % cont.length];
    acum.push(acum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return acum;
}

/** Ponto a `s` px do começo do contorno, e a direção da borda ali. */
function pontoNoContorno(cont: Pt[], acum: number[], s: number): { p: Pt; t: Pt } {
  let j = 0;
  while (j < cont.length - 1 && acum[j + 1] < s) j++;
  const a = cont[j];
  const b = cont[(j + 1) % cont.length];
  const seg = acum[j + 1] - acum[j] || 1;
  const f = (s - acum[j]) / seg;
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, t: { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg } };
}

/**
 * As lâmpadas: um ponto `M x yh0` por lâmpada (traço de comprimento zero com ponta redonda
 * vira um círculo do tamanho do traço). Posição calculada aqui, e não por stroke-dasharray:
 * o tracejado recomeça no M de cada contorno e deixava duas lâmpadas encostadas onde o
 * contorno fecha (fundo do "0" e do "8"). Aqui cada contorno tem N lâmpadas exatas.
 * Contorno curto (ponto final, acento, cedilha, haste do "$") fica sem lâmpada: 2 ou 3
 * pontos juntos viravam um grumo que apagava o sinal.
 */
function lampadasNaBorda(c: Contorno, passo: number, minimo: number, folga: number): string {
  const postas: Pt[] = [];
  for (const cont of bordasDeFora(amostrar(c.d, c.corpo * 0.02))) {
    const acum = acumulado(cont);
    const total = acum[acum.length - 1];
    if (total < minimo) continue;
    const qtd = Math.max(3, Math.round(total / passo));
    for (let q = 0; q < qtd; q++) {
      const { p } = pontoNoContorno(cont, acum, (q * total) / qtd);
      // Lâmpada colada em outra (canto de dentro do "E", braços do "M", letra vizinha) é
      // pulada: pela borda estão a um passo, mas no desenho se encostam e viram grumo.
      if (postas.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < folga)) continue;
      postas.push(p);
    }
  }
  return postas.map((p) => `M${n(p.x)} ${n(p.y)}h0`).join("");
}

/**
 * Abre o espaço entre PALAVRAS sem mexer no espaço entre letras.
 *
 * O espaço da Monoton tem 0,11 do corpo, quase o vão entre duas letras: "VISTA MAR" lia
 * "VISTAMAR", e `espacamento` não resolve (abre letra e palavra por igual). O efeito não
 * recebe o texto, só o desenho; então os vãos são achados na geometria: cada contorno vira
 * uma faixa horizontal, faixas que se sobrepõem são a mesma letra (acento incluso), e um
 * vão maior que `limiar` é um espaço. Tudo à direita dele anda `extra` px.
 */
function alargarEspacos(c: Contorno, extra: number, limiar: number): Contorno {
  const pedacos = c.d.split(/(?=M)/).filter(Boolean);
  const xs = (s: string) => {
    const r: number[] = [];
    for (const m of s.matchAll(/([MLQC])([^MLQCZ]*)/g)) {
      m[2].trim().split(/\s+/).forEach((v, i) => i % 2 === 0 && v && r.push(Number(v)));
    }
    return r;
  };
  const faixas = pedacos.map((s) => {
    const v = xs(s);
    return { x0: Math.min(...v), x1: Math.max(...v) };
  });
  const ordem = faixas.map((_, i) => i).sort((a, b) => faixas[a].x0 - faixas[b].x0);
  const colunas: { x0: number; x1: number; idx: number[] }[] = [];
  for (const i of ordem) {
    const ult = colunas[colunas.length - 1];
    if (ult && faixas[i].x0 <= ult.x1) {
      ult.x1 = Math.max(ult.x1, faixas[i].x1);
      ult.idx.push(i);
    } else colunas.push({ x0: faixas[i].x0, x1: faixas[i].x1, idx: [i] });
  }
  const desloc = new Array<number>(pedacos.length).fill(0);
  let andou = 0;
  colunas.forEach((col, k) => {
    if (k > 0 && col.x0 - colunas[k - 1].x1 > limiar) andou += extra;
    for (const i of col.idx) desloc[i] = andou;
  });
  if (!andou) return c;
  const d = pedacos
    .map((s, i) =>
      desloc[i]
        ? s.replace(/([MLQC])([^MLQCZ]*)/g, (_, cmd: string, args: string) =>
            cmd + args.trim().split(/\s+/).map((v, j) => (j % 2 === 0 ? n(Number(v) + desloc[i]) : v)).join(" ")
          )
        : s
    )
    .join("");
  return { ...c, d, largura: c.largura + andou };
}

/**
 * Separa os ACENTOS (contorno inteiro acima da altura da maiúscula) do resto, sobe cada um
 * `sobe` px e ACENTUA a inclinação dele. Medido na Bungee: acento vai de 0,26 a 0,03 do
 * corpo acima da maiúscula, e o "$", os dois-pontos e a cedilha nunca ficam inteiros acima
 * dela. Na Bungee o grave e o agudo são a mesma barrinha com ~5 graus pra cada lado: o eixo
 * da barra é medido (covariância dos pontos) e girado mais `giro` radianos pro mesmo lado.
 * O til e o circunflexo, sem eixo inclinado, não giram.
 */
function separarAcentos(d: string, topo: number, sobe: number, giro: number): { letras: string; acentos: string } {
  const letras: string[] = [];
  const acentos: string[] = [];
  for (const s of d.split(/(?=M)/).filter(Boolean)) {
    const nums = (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    if (!ys.length || Math.max(...ys) >= topo) {
      letras.push(s);
      continue;
    }
    // pontos a passo fixo pela borda: os pontos de controle da fonte se amontoam nos cantos
    // arredondados e entortavam a medida (o agudo saía com -1 grau em vez de -7)
    const pts = amostrar(s, Math.max(0.5, (Math.max(...xs) - Math.min(...xs)) / 60)).flat();
    const mx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const my = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const q of pts) {
      sxx += (q.x - mx) ** 2;
      syy += (q.y - my) ** 2;
      sxy += (q.x - mx) * (q.y - my);
    }
    const eixo = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    // só barra comprida e inclinada (grave, agudo); til e circunflexo têm eixo ~0
    const a = sxx > syy * 2 && Math.abs(eixo) > 0.05 ? Math.sign(eixo) * giro : 0;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    acentos.push(
      s.replace(/([MLQC])([^MLQCZ]*)/g, (_, cmd: string, args: string) => {
        const v = args.trim().split(/\s+/).map(Number);
        const out: string[] = [];
        for (let i = 0; i + 1 < v.length; i += 2) {
          const dx = v[i] - mx;
          const dy = v[i + 1] - my;
          out.push(n(mx + dx * cos - dy * sin), n(my + dx * sin + dy * cos - sobe));
        }
        return cmd + out.join(" ");
      })
    );
  }
  return { letras: letras.join(""), acentos: acentos.join("") };
}

/** Linha quebrada em "d". */
const poli = (pts: Pt[], fechar = false) =>
  pts.map((q, i) => `${i ? "L" : "M"}${n(q.x)} ${n(q.y)}`).join("") + (fechar ? "Z" : "");

/**
 * Energia que CONTORNA a palavra por fora: anda pela borda de fora em saltos irregulares e
 * empurra cada vértice PRA FORA da letra (afastamento base + tremida). Vai por baixo da
 * letra, então nunca a risca -- o fio que cruzava a borda deixava a letra "rachada".
 */
function fioEletrico(fora: Pt[][], todos: Pt[][], corpo: number, rnd: () => number): string {
  const partes: string[] = [];
  const base = corpo * 0.055;
  const amp = corpo * 0.03;
  for (const cont of fora) {
    const acum = acumulado(cont);
    const total = acum[acum.length - 1];
    if (total < corpo * 0.5) continue;
    // qual lado é "fora" neste contorno: um teste só, no meio dele
    const meio = pontoNoContorno(cont, acum, total / 2);
    const eps = corpo * 0.02;
    const sinal = dentro({ x: meio.p.x - meio.t.y * eps, y: meio.p.y + meio.t.x * eps }, todos) ? -1 : 1;
    const pts: Pt[] = [];
    for (let s = 0; s < total; s += corpo * (0.04 + rnd() * 0.06)) {
      const { p, t } = pontoNoContorno(cont, acum, s);
      const desloca = sinal * (base + (rnd() * 2 - 1) * amp);
      pts.push({ x: p.x - t.y * desloca, y: p.y + t.x * desloca });
    }
    if (pts.length > 2) partes.push(poli(pts, true));
  }
  return partes.join("");
}

/**
 * Raio que sai de UMA PONTA da frase (lado -1 = esquerda, 1 = direita), do ponto mais
 * extremo da borda, quase na horizontal (até 30 graus) e inclinado pro meio da maiúscula.
 * Raio em cima ou embaixo de letra do meio lia como acento: "Ǹ", "Á", "Ç" falsos, e
 * "VISTA MÀR". Na ponta não há letra pra imitar.
 */
function raioDaPonta(todos: Pt[][], c: Contorno, lado: -1 | 1, meioY: number, rnd: () => number): { tronco: Pt[]; galho: Pt[] } {
  let extremo = lado < 0 ? Infinity : -Infinity;
  for (const cont of todos) for (const q of cont) extremo = lado < 0 ? Math.min(extremo, q.x) : Math.max(extremo, q.x);
  // entre os pontos rentes à ponta (haste vertical tem vários), o mais perto do meio
  let p: Pt = { x: extremo, y: meioY };
  let melhor = Infinity;
  for (const cont of todos)
    for (const q of cont)
      if (Math.abs(q.x - extremo) < c.corpo * 0.03 && Math.abs(q.y - meioY) < melhor) {
        melhor = Math.abs(q.y - meioY);
        p = q;
      }
  const limite = Math.PI / 6;
  const puxa = Math.max(-1, Math.min(1, (meioY - p.y) / (c.corpo * 0.3)));
  const ang = Math.max(-limite, Math.min(limite, puxa * limite * 0.7 + (rnd() * 2 - 1) * limite * 0.35));
  const dir = { x: lado * Math.cos(ang), y: Math.sin(ang) };
  const perp = { x: -dir.y, y: dir.x };
  // 0,55 a 0,7 do corpo: com 0,9 os dois raios somavam 1,8 corpo de largura e a frase longa
  // encolhia pra 0,69 no vídeo
  const comp = c.corpo * (0.55 + rnd() * 0.15);
  const segs = 6;
  const tronco: Pt[] = [p];
  for (let s = 1; s <= segs; s++) {
    const lado2 = (s % 2 ? 1 : -1) * (0.4 + rnd() * 0.6) * comp * 0.11 * (s === segs ? 0.3 : 1);
    tronco.push({ x: p.x + (dir.x * comp * s) / segs + perp.x * lado2, y: p.y + (dir.y * comp * s) / segs + perp.y * lado2 });
  }
  // galho: sai do terceiro vértice, abre ~35 graus pro lado oposto ao que o tronco inclina
  const giro = (ang > 0 ? -1 : 1) * lado * 0.6;
  const gd = { x: dir.x * Math.cos(giro) - dir.y * Math.sin(giro), y: dir.x * Math.sin(giro) + dir.y * Math.cos(giro) };
  const b = tronco[3];
  const gc = comp * 0.42;
  const galho: Pt[] = [b];
  for (let s = 1; s <= 3; s++) {
    const l2 = (s % 2 ? -1 : 1) * gc * 0.12;
    galho.push({ x: b.x + (gd.x * gc * s) / 3 - gd.y * l2, y: b.y + (gd.y * gc * s) / 3 + gd.x * l2 });
  }
  return { tronco, galho };
}

/** Vãos entre PALAVRAS, achados na geometria: faixas x dos contornos que não se sobrepõem. */
function vaosDePalavra(todos: Pt[][], limiar: number): [number, number][] {
  const faixas = todos
    .map((cont) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const q of cont) {
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
      }
      return { x0, x1 };
    })
    .sort((a, b) => a.x0 - b.x0);
  const vaos: [number, number][] = [];
  let fim = -Infinity;
  for (const f of faixas) {
    if (fim > -Infinity && f.x0 - fim > limiar) vaos.push([fim, f.x0]);
    fim = Math.max(fim, f.x1);
  }
  return vaos;
}

/**
 * Corrente que atravessa a palavra na meia altura da maiúscula, em zigue-zague, desenhada
 * ATRÁS da letra: aparece só nos vãos ENTRE LETRAS, como faísca pulando de uma pra outra.
 * Nunca passa da altura da maiúscula nem desce da linha de base (não imita acento nem
 * cedilha), e é CORTADA nos espaços entre palavras: ali um risco horizontal lia como hífen
 * ("PRONTO-PRA-MORAR"). As pontas ficam por conta dos raios.
 */
function arcoDeCorrente(c: Contorno, cap: number, vaos: [number, number][], rnd: () => number): string {
  const k = c.corpo;
  const meio = c.linhaDeBase - cap * (0.45 + rnd() * 0.15);
  const topo = c.linhaDeBase - cap * 0.8;
  const pe = c.linhaDeBase - cap * 0.22;
  const trechos: Pt[][] = [[]];
  let lado = rnd() < 0.5 ? 1 : -1;
  for (let x = k * 0.05; x < c.largura - k * 0.05; x += k * (0.07 + rnd() * 0.05)) {
    const noVao = vaos.some(([a, b]) => x > a - k * 0.04 && x < b + k * 0.04);
    if (noVao) {
      if (trechos[trechos.length - 1].length) trechos.push([]);
      continue;
    }
    const y = meio + lado * (0.3 + rnd() * 0.7) * k * 0.1;
    trechos[trechos.length - 1].push({ x, y: Math.max(topo, Math.min(pe, y)) });
    lado = -lado;
  }
  return trechos
    .filter((t) => t.length > 1)
    .map((t) => poli(t))
    .join("");
}

// ---------------------------------------------------------------------------------------

export const EFEITOS: EfeitoTexto[] = [
  // 1. NEON ROSA -- tubo de vidro contornando a letra, como letreiro de bar.
  // A letra é OCA: só o contorno acende. O véu escuro por baixo é o que salva a parede
  // branca (neon sobre branco some); no fundo escuro ele nem aparece.
  {
    id: "neon_rosa",
    rotulo: "Neon rosa",
    categoria: "brilho",
    fonte: "righteous",
    amostra: "Vendido",
    desenhar: (c, p) => {
      const tubo = c.corpo * 0.05;
      // brilho largo com desvio de 0,15 do corpo: com 0,1 o cartão escuro lia "contorno rosa
      // aceso", não letreiro que ilumina a parede
      const largo = c.corpo * 0.15;
      const k = caixa(c, largo * 3 + tubo);
      const defs = desfoque(`${p}-veu`, k, c.corpo * 0.09) + desfoque(`${p}-largo`, k, largo);
      const traco = (cor: string, w: number, extra = "") =>
        usar(p, `fill="none" stroke="${cor}" stroke-width="${n(w)}" stroke-linejoin="round" ${extra}`);
      return montar(
        c,
        p,
        k,
        defs,
        // véu: a letra cheia e engrossada, escura e desfocada. Vinho quase preto a 0,5:
        // o magenta-escuro a 0,62 fazia uma nuvem suja na parede
        usar(p, `fill="#24001a" stroke="#24001a" stroke-width="${n(tubo * 5)}" stroke-linejoin="round" opacity="0.5" filter="url(#${p}-veu)"`) +
          // brilho largo: a cor que "vaza" pra parede
          traco("#ff1f8f", tubo * 3.5, `filter="url(#${p}-largo)"`) +
          // borda acesa: três traços rosados cada vez mais finos e fortes (brilho curto barato)
          traco("#ff3d9e", tubo * 3.2, `opacity="0.18"`) +
          traco("#ff4aa6", tubo * 2.2, `opacity="0.35"`) +
          traco("#ff5cb3", tubo * 1.5, `opacity="0.7"`) +
          // o tubo em si e o miolo quase branco: é o que faz parecer luz e não tinta rosa
          traco("#ff6fbd", tubo) +
          traco("#fff2f9", tubo * 0.38)
      );
    },
  },

  // 2. LETREIRO NEON -- placa de acrílico escuro presa na parede por quatro parafusos, com
  // tubo âmbar de moldura e as letras da Monoton (que já são linhas paralelas, como tubo
  // dobrado) acesas em ciano. A PLACA é o que separa do Neon rosa: lá o neon está solto na
  // parede; aqui é um objeto. Ela também garante a leitura na parede branca sem desfoque.
  {
    id: "neon_letreiro",
    rotulo: "Letreiro neon",
    categoria: "brilho",
    fonte: "monoton",
    maiusculas: true,
    // sem espaçamento extra: a Monoton é a fonte mais larga do catálogo, e a placa ainda soma
    // 0,64 do corpo na largura
    espacamento: 0,
    amostra: "Plantão",
    desenhar: (original, p) => {
      // Medido na Monoton sem espaçamento, corpo 100: vão entre letras vai até 0,09 do corpo
      // (inclusive "A:", "1." e "AG"), vão de espaço fica entre 0,14 e 0,18. Limiar no meio.
      const c = alargarEspacos(original, original.corpo * 0.22, original.corpo * 0.115);
      const k = c.corpo;
      const fx = k * 0.32;
      const fy = k * 0.26;
      const px = -fx;
      const py = -fy;
      const pw = c.largura + fx * 2;
      const ph = c.altura + fy * 2;
      const r = k * 0.22;
      const borda = k * 0.02;
      const sombraY = k * 0.05;
      const sombraD = k * 0.06;
      const cx = envolver(px - sombraD * 3, py - sombraD * 3, px + pw + sombraD * 3, py + ph + sombraY + sombraD * 3);
      const ret = (inset: number, attrs: string) =>
        `<rect x="${n(px + inset)}" y="${n(py + inset)}" width="${n(pw - inset * 2)}" height="${n(ph - inset * 2)}" rx="${n(Math.max(0, r - inset))}" ${attrs}/>`;
      const tubo = k * 0.08; // distância do tubo âmbar até a borda da placa
      const defs =
        `<linearGradient id="${p}-acrilico" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2129"/><stop offset="1" stop-color="#03090c"/></linearGradient>` +
        // reflexo do acrílico: um fio claro na borda de dentro que some até o meio da placa
        vertical(`${p}-reflexo`, py, py + ph * 0.55, [
          [0, "#7fe9ff", 0.3],
          [1, "#7fe9ff", 0],
        ]) +
        `<radialGradient id="${p}-parafuso" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#eef1f4"/><stop offset="1" stop-color="#6b7580"/></radialGradient>` +
        `<clipPath id="${p}-placa">${ret(0, "")}</clipPath>` +
        desfoque(`${p}-luz`, cx, k * 0.11);
      // parafusos por dentro do tubo, nos cantos, longe da primeira e da última letra
      const pr = k * 0.035;
      const pd = k * 0.19;
      const parafusos = [
        [px + pd, py + pd],
        [px + pw - pd, py + pd],
        [px + pd, py + ph - pd],
        [px + pw - pd, py + ph - pd],
      ]
        .map(
          ([x, y]) =>
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(pr)}" fill="url(#${p}-parafuso)" stroke="#1d2a30" stroke-width="${n(k * 0.008)}"/>` +
            `<path d="M${n(x - pr * 0.6)} ${n(y + pr * 0.6)}L${n(x + pr * 0.6)} ${n(y - pr * 0.6)}" stroke="#46505a" stroke-width="${n(k * 0.009)}"/>`
        )
        .join("");
      return montar(
        c,
        p,
        cx,
        defs,
        // sombra da placa na parede: é o que faz ela ser objeto e não retângulo pintado
        // Sem desfoque: quatro retângulos translúcidos cada vez maiores. A placa é a peça mais
        // larga do catálogo e um desfoque a mais nela custava ~40% do tempo da frase longa.
        [
          [2, 0.06],
          [1.3, 0.09],
          [0.7, 0.12],
          [0, 0.2],
        ]
          .map(([f, o]) => ret(-sombraD * f, `transform="translate(0 ${n(sombraY)})" fill="#000" opacity="${o}"`))
          .join("") +
          ret(0, `fill="url(#${p}-acrilico)" fill-opacity="0.92" stroke="#2b4a52" stroke-width="${n(borda)}"`) +
          ret(borda * 1.6, `fill="none" stroke="url(#${p}-reflexo)" stroke-width="${n(k * 0.012)}"`) +
          // a luz batendo no acrílico: letras e tubo engrossados e desfocados, RECORTADOS na
          // placa (luz não vaza pra parede). O traço dá massa: só o preenchimento das linhas
          // finas da Monoton quase não tinha o que espalhar
          `<g clip-path="url(#${p}-placa)"><g filter="url(#${p}-luz)" opacity="0.9">` +
          usar(p, `fill="#00d9ff" stroke="#00d9ff" stroke-width="${n(k * 0.06)}" stroke-linejoin="round"`) +
          ret(tubo, `fill="none" stroke="#ff9d1f" stroke-width="${n(k * 0.06)}"`) +
          `</g></g>` +
          // tubo âmbar da moldura: segunda cor, halo translúcido + tubo + miolo claro
          ret(tubo, `fill="none" stroke="#ffb13b" stroke-width="${n(k * 0.025 * 2.6)}" opacity="0.28"`) +
          ret(tubo, `fill="none" stroke="#ffb13b" stroke-width="${n(k * 0.025)}"`) +
          ret(tubo, `fill="none" stroke="#fff4dd" stroke-width="${n(k * 0.01)}"`) +
          parafusos +
          // brilho curto: o próprio desenho engrossado e translúcido, sem desfoque
          usar(p, `fill="#2ee8ff" stroke="#2ee8ff" stroke-width="${n(k * 0.028)}" stroke-linejoin="round" opacity="0.35"`) +
          usar(p, `fill="#e9fdff" stroke="#8ff5ff" stroke-width="${n(k * 0.007)}"`)
      );
    },
  },

  // 3. LETRAS DE LÂMPADAS -- letra de teatro/lançamento: corpo azul-royal laqueado, aro
  // dourado e lâmpadas quentes correndo pela borda. Azul e não vermelho: a "Placa de cinema"
  // do clássico já é vermelho e dourado com lâmpadas numa placa; aqui as lâmpadas estão NA
  // letra. Preto laqueado foi tentado e reprovado na folha: o miolo do "E" e do "N" tem a
  // mesma cor da moldura escura, a letra virava borrão ("FIHANCIAMEHTO" em corpo 48).
  // Só na borda de FORA: lâmpada no furo do "8" e do "0" entupia o número ("R$ 890.000").
  {
    id: "letras_lampadas",
    rotulo: "Letras de lâmpadas",
    categoria: "brilho",
    fonte: "lilita",
    maiusculas: true,
    // 0,08: com 0,04 o aro de uma letra invadia a vizinha e havia lâmpada em cima dela
    espacamento: 0.08,
    amostra: "Lançamento",
    desenhar: (c, p) => {
      // aro e moldura mais finos que na primeira versão (0,075 e 0,05): os dois juntos
      // entupiam o vão entre os braços do "E" e do "M"
      const aro = c.corpo * 0.06;
      const fora = c.corpo * 0.035;
      // poucas e grandes: com 0,058 a cada 0,145 do corpo, em corpo 48 viravam confete
      const lampada = c.corpo * 0.066;
      const pontos = lampadasNaBorda(c, c.corpo * 0.2, c.corpo * 0.9, c.corpo * 0.14);
      const cap = alturaMaiuscula("lilita", c.corpo);
      const topo = c.linhaDeBase - cap;
      const k = caixa(c, aro + fora + c.corpo * 0.2);
      const defs =
        // laca: claro no alto caindo pra azul fundo, é o que faz ler "pintado brilhante".
        // Médio o bastante pra não sumir contra a moldura quase preta
        vertical(`${p}-corpo`, topo, c.linhaDeBase, [
          [0, "#6f9bff"],
          [0.3, "#3a66e8"],
          [0.7, "#1d3a9e"],
          [1, "#142a73"],
        ]) +
        vertical(`${p}-ouro`, topo - aro, c.linhaDeBase + aro, [
          [0, "#fff1a8"],
          [0.45, "#f5b82e"],
          [1, "#b86b0c"],
        ]) +
        `<path id="${p}-lamp" d="${pontos}"/>` +
        desfoque(`${p}-sombra`, k, c.corpo * 0.05) +
        desfoque(`${p}-luz`, k, c.corpo * 0.035);
      const lampadas = (attrs: string) => `<use href="#${p}-lamp" fill="none" stroke-linecap="round" ${attrs}/>`;
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `transform="translate(0 ${n(c.corpo * 0.06)})" fill="#000" stroke="#000" stroke-width="${n((aro + fora) * 2)}" stroke-linejoin="round" opacity="0.55" filter="url(#${p}-sombra)"`) +
          // moldura escura por fora do aro: separa o dourado da parede branca
          usar(p, `fill="#140d05" stroke="#140d05" stroke-width="${n((aro + fora) * 2)}" stroke-linejoin="round"`) +
          usar(p, `fill="url(#${p}-corpo)" stroke="url(#${p}-ouro)" stroke-width="${n(aro * 2)}" stroke-linejoin="round" paint-order="stroke"`) +
          // halo quente, soquete escuro (a lâmpada não se funde no dourado), lâmpada e centro
          lampadas(`stroke="#ffb52e" stroke-width="${n(lampada * 2.2)}" filter="url(#${p}-luz)"`) +
          lampadas(`stroke="#4a2a06" stroke-width="${n(lampada * 1.55)}"`) +
          lampadas(`stroke="#ffe08a" stroke-width="${n(lampada * 1.35)}"`) +
          lampadas(`stroke="#fffdf2" stroke-width="${n(lampada * 0.8)}"`)
      );
    },
  },

  // 4. ELÉTRICO -- letra azul com energia correndo POR FORA da borda, uma corrente que salta
  // de letra em letra na meia altura e um raio saindo de cada ponta da frase. Tudo geometria
  // (ver acima): nítido em qualquer tamanho e barato.
  {
    id: "eletrico",
    rotulo: "Elétrico",
    categoria: "brilho",
    fonte: "archivo",
    maiusculas: true,
    espacamento: 0.03,
    amostra: "Imperdível",
    desenhar: (c, p) => {
      const kk = c.corpo;
      const largo = kk * 0.08;
      const cap = alturaMaiuscula("archivo", kk);
      const topo = c.linhaDeBase - cap;
      const meioY = c.linhaDeBase - cap * 0.5;
      const todos = amostrar(c.d, kk * 0.03);
      const fora = bordasDeFora(todos);
      const rnd = sorteio(Math.round(c.largura * 7 + c.altura * 13) ^ c.d.length);
      const fio = fioEletrico(fora, todos, kk, rnd);
      const vaos = vaosDePalavra(todos, kk * 0.15);
      const arco1 = arcoDeCorrente(c, cap, vaos, rnd);
      const arco2 = arcoDeCorrente(c, cap, vaos, rnd);
      const esq = raioDaPonta(todos, c, -1, meioY, rnd);
      const dir = raioDaPonta(todos, c, 1, meioY, rnd);
      const pontas = [...esq.tronco, ...esq.galho, ...dir.tronco, ...dir.galho];
      // margem: o véu (traço + 2,7 desvios) em volta do texto, e o brilho em volta dos raios
      const mv = kk * 0.36;
      const mr = kk * 0.14;
      const k = envolver(
        Math.min(-mv, ...pontas.map((q) => q.x - mr)),
        Math.min(-mv, ...pontas.map((q) => q.y - mr)),
        Math.max(c.largura + mv, ...pontas.map((q) => q.x + mr)),
        Math.max(c.altura + mv, ...pontas.map((q) => q.y + mr))
      );
      const f = kk * 0.022;
      const linha = (d: string, cor: string, w: number, extra = "") =>
        !d ? "" : `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${n(w)}" stroke-linejoin="miter" stroke-miterlimit="3" stroke-linecap="round" ${extra}/>`;
      const raiosD = poli(esq.tronco) + poli(dir.tronco);
      const galhosD = poli(esq.galho) + poli(dir.galho);
      const raios = (cor: string, w: number, extra = "") => linha(raiosD, cor, w, extra) + linha(galhosD, cor, w * 0.65, extra);
      const arcos = (cor: string, w: number, extra = "") =>
        (arco1 ? linha(arco1, cor, w, extra) : "") + (arco2 ? linha(arco2, cor, w * 0.6, extra) : "");
      const defs =
        // letra azul elétrica: quase branca no alto caindo pra azul forte. Sem o branco-gelo
        // no meio, que com o fio cruzando a borda lia "letra de gelo rachada"
        vertical(`${p}-letra`, topo, c.linhaDeBase, [
          [0, "#eaf6ff"],
          [0.45, "#58b4ff"],
          [1, "#1f5bff"],
        ]) +
        vertical(`${p}-energia`, topo, topo + cap * 0.55, [
          [0, "#bfe6ff", 1],
          [1, "#bfe6ff", 0],
        ]) +
        `<clipPath id="${p}-dentro">${usar(p, "")}</clipPath>` +
        desfoque(`${p}-veu`, k, kk * 0.1) +
        desfoque(`${p}-largo`, k, largo);
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `fill="#000a1f" stroke="#000a1f" stroke-width="${n(kk * 0.18)}" stroke-linejoin="round" opacity="0.62" filter="url(#${p}-veu)"`) +
          // brilho azul largo: letra + raios + corrente, pra luz sair de onde a energia está
          `<g filter="url(#${p}-largo)">` +
          usar(p, `fill="#1a6dff" stroke="#1a6dff" stroke-width="${n(kk * 0.08)}" stroke-linejoin="round"`) +
          raios("#3a95ff", f * 5) +
          arcos("#3a95ff", f * 4) +
          `</g>` +
          // energia contornando por fora, e a corrente -- as duas por BAIXO da letra
          linha(fio, "#2e8fff", f * 2.2, `opacity="0.5"`) +
          linha(fio, "#bfe6ff", f * 0.8) +
          arcos("#4db8ff", f * 4, `opacity="0.35"`) +
          arcos("#8ad6ff", f * 2) +
          arcos("#ffffff", f * 0.9) +
          // raios das pontas: halo translúcido, corpo azul-claro e miolo branco
          raios("#4db8ff", f * 4.6, `opacity="0.35"`) +
          raios("#8ad6ff", f * 2.5) +
          raios("#ffffff", f * 1.1) +
          usar(p, `fill="url(#${p}-letra)" stroke="#06206e" stroke-width="${n(kk * 0.065)}" stroke-linejoin="round" paint-order="stroke"`) +
          // fio de energia por DENTRO, no alto: a borda de cima deslocada pra baixo e recortada
          // na letra, sumindo até o meio. Brilho, não rachadura
          `<g clip-path="url(#${p}-dentro)">` +
          usar(p, `transform="translate(0 ${n(kk * 0.045)})" fill="none" stroke="url(#${p}-energia)" stroke-width="${n(kk * 0.012)}" stroke-linejoin="round" opacity="0.7"`) +
          `</g>`
      );
    },
  },

  // 5. CROMADO -- metal de anos 80: céu claro em cima, linha do horizonte escura no meio,
  // chão refletido embaixo. Contorno triplo (fio escuro, aro prata, moldura escura) e um
  // bisel: faixa de luz nas bordas de cima/esquerda e de sombra nas de baixo/direita.
  // (Bisel por feSpecularLighting ficava bonito e custava 3x mais.)
  {
    id: "cromado",
    rotulo: "Cromado",
    categoria: "brilho",
    fonte: "bungee",
    maiusculas: true,
    // sem folga as molduras das letras fundiam numa tira só na frase longa
    espacamento: 0.05,
    amostra: "Exclusivo",
    desenhar: (original, p) => {
      // Na Bungee o acento é uma barrinha a 0,03 do corpo da letra, e o grave, o agudo e o til
      // só diferem pela inclinação. Com a moldura tripla em volta, "À", "Ã" e "É" viravam o
      // mesmo chapéu colado ("Ā VENDA"). Então o acento sobe um pouco e ganha moldura FINA
      // (só o fio escuro e um filete de prata): a forma dele continua legível e o fio escuro
      // do acento passa por cima do aro da letra, separando os dois.
      const kk = original.corpo;
      const cap = alturaMaiuscula("bungee", kk);
      const topo = original.linhaDeBase - cap;
      const { letras, acentos } = separarAcentos(original.d, topo, kk * 0.06, 0.22);
      const c = { ...original, d: letras + acentos };
      const b1 = kk * 0.045; // fio escuro colado na letra
      const b2 = kk * 0.04; // aro prata
      const b3 = kk * 0.03; // moldura escura de fora
      const a2 = kk * 0.018; // filete de prata do acento
      const sombra = kk * 0.07;
      const bisel = kk * 0.022;
      const k = caixa(c, b1 + b2 + b3 + sombra + kk * 0.12);
      const t = (w: number) => n(w * 2);
      // cada camada de contorno: primeiro nas letras, depois no acento (por cima)
      const moldura = (w: number, wa: number, attrs: string) =>
        `<use href="#${p}-l" fill="#0b0e15" stroke-width="${t(w)}" stroke-linejoin="round" ${attrs}/>` +
        (acentos ? `<use href="#${p}-a" fill="#0b0e15" stroke-width="${t(wa)}" stroke-linejoin="round" ${attrs}/>` : "");
      const defs =
        // horizonte sempre no meio da MAIÚSCULA, com ou sem acento; acima dela (o acento) pega
        // o branco do céu e continua recortado pelo fio escuro.
        // Céu levemente azulado e chão morno: é o que faz o cinza ler "metal refletindo".
        vertical(`${p}-cromo`, topo, c.linhaDeBase, [
          [0, "#ffffff"],
          [0.25, "#e3eefa"],
          [0.49, "#8fa6c2"],
          [0.51, "#232a38"],
          [0.6, "#6d6f78"],
          [0.84, "#f0ece6"],
          [1, "#b3b8c2"],
        ]) +
        // aro mais escuro no alto, contra o topo branco da letra
        vertical(`${p}-aro`, topo - b1 - b2, c.linhaDeBase + b1 + b2, [
          [0, "#aeb9c9"],
          [0.5, "#eef2f7"],
          [1, "#8a95a7"],
        ]) +
        `<path id="${p}-l" d="${letras}"/>` +
        (acentos ? `<path id="${p}-a" d="${acentos}"/>` : "") +
        `<clipPath id="${p}-dentro">${usar(p, "")}</clipPath>` +
        desfoque(`${p}-sombra`, k, kk * 0.045);
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `transform="translate(${n(sombra * 0.4)} ${n(sombra)})" fill="#000" stroke="#000" stroke-width="${t(b1 + b2 + b3)}" stroke-linejoin="round" opacity="0.6" filter="url(#${p}-sombra)"`) +
          moldura(b1 + b2 + b3, b1 + a2 * 2, `stroke="#0b0e15"`) +
          moldura(b1 + b2, b1 + a2, `stroke="url(#${p}-aro)"`) +
          moldura(b1, b1, `stroke="#10141d"`) +
          `<g clip-path="url(#${p}-dentro)">` +
          usar(p, `fill="url(#${p}-cromo)"`) +
          // contorno deslocado pra baixo-direita: o traço cai só na faixa de cima-esquerda
          usar(p, `transform="translate(${n(bisel)} ${n(bisel)})" fill="none" stroke="#ffffff" stroke-width="${n(bisel * 2)}" stroke-linejoin="round" opacity="0.85"`) +
          usar(p, `transform="translate(${n(-bisel)} ${n(-bisel)})" fill="none" stroke="#1c2230" stroke-width="${n(bisel * 2)}" stroke-linejoin="round" opacity="0.55"`) +
          `</g>` +
          // reflexo: estrela no alto da primeira letra, abaixo de onde fica o acento
          estrela(c.corpo * 0.2, c.linhaDeBase - c.corpo * 0.6, c.corpo * 0.16, `fill="#ffffff" opacity="0.95"`)
      );
    },
  },

  // 6. HOLOGRÁFICO -- película furta-cor: gradiente saturado na diagonal, faixa de brilho por
  // cima, contorno branco e fio roxo-escuro por fora. A assinatura é o DESLOCAMENTO DE COR:
  // duas cópias do contorno, ciano pra cima-esquerda e magenta pra baixo-direita, como
  // holograma fora de registro. Sem estrelas (isso é o "Estrelinhas" do clássico), e as
  // franjas coloridas dão contraste na parede bege, onde o pastel sumia.
  {
    id: "holografico",
    rotulo: "Holográfico",
    categoria: "brilho",
    fonte: "poppins",
    amostra: "Novidade",
    desenhar: (c, p) => {
      const branco = c.corpo * 0.05;
      const escuro = c.corpo * 0.05;
      const grosso = (branco + escuro) * 2;
      const dx = c.corpo * 0.035;
      const dy = c.corpo * 0.02;
      const k = caixa(c, branco + escuro + dx + c.corpo * 0.2);
      const defs =
        `<linearGradient id="${p}-iris" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(c.largura)}" y2="${n(c.altura * 1.6)}">` +
        `<stop offset="0" stop-color="#ff7ccf"/><stop offset="0.2" stop-color="#9f7dff"/><stop offset="0.4" stop-color="#3fd4ff"/>` +
        `<stop offset="0.6" stop-color="#5cf0b0"/><stop offset="0.8" stop-color="#ffc93c"/><stop offset="1" stop-color="#ff7fb0"/></linearGradient>` +
        // faixa de brilho diagonal: é o que faz ler "película" e não "arco-íris"
        `<linearGradient id="${p}-reflexo" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="0.47" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        desfoque(`${p}-aura`, k, c.corpo * 0.06) +
        desfoque(`${p}-sombra`, k, c.corpo * 0.03);
      const silhueta = (cor: string, attrs: string) =>
        usar(p, `fill="${cor}" stroke="${cor}" stroke-width="${n(grosso)}" stroke-linejoin="round" ${attrs}`);
      return montar(
        c,
        p,
        k,
        defs,
        // aura lilás curta: na parede não aparecia nada da aura larga, era só custo
        silhueta("#b98bff", `opacity="0.6" filter="url(#${p}-aura)"`) +
          silhueta("#1c0d38", `transform="translate(0 ${n(c.corpo * 0.035)})" opacity="0.55" filter="url(#${p}-sombra)"`) +
          silhueta("#00e5ff", `transform="translate(${n(-dx)} ${n(-dy)})" opacity="0.8"`) +
          silhueta("#ff3fd0", `transform="translate(${n(dx)} ${n(dy)})" opacity="0.8"`) +
          silhueta("#2a1452", "") +
          usar(p, `fill="url(#${p}-iris)" stroke="#ffffff" stroke-width="${n(branco * 2)}" stroke-linejoin="round" paint-order="stroke"`) +
          usar(p, `fill="url(#${p}-reflexo)"`)
      );
    },
  },

  // 7. BRILHO BRANCO -- letra cursiva branca num halo de luz de sonho. O halo é de DUAS cores:
  // lavanda desfocada (a única que aparece na parede branca) e um fio branco translúcido
  // colado (o que brilha no escuro). Borda roxa NÍTIDA e sombra projetada leve: a sombra
  // curta desfocada de antes sujava a parede e lia "relevo sujo".
  {
    id: "brilho_branco",
    rotulo: "Brilho branco",
    categoria: "brilho",
    // Pacifico com texto digitado em CAIXA ALTA sai "à VENDA" (o A maiúsculo da fonte tem
    // forma de minúsculo). Fica mesmo assim: é a única cursiva gorda da família e o que
    // separa este do Brilho escuro. A amostra nunca é em caixa alta.
    fonte: "pacifico",
    amostra: "Seu novo lar",
    desenhar: (c, p) => {
      const halo = c.corpo * 0.14;
      const borda = c.corpo * 0.028;
      const k = caixa(c, halo * 2.8 + c.corpo * 0.08);
      const defs = desfoque(`${p}-halo`, k, halo) + desfoque(`${p}-sombra`, k, c.corpo * 0.04);
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `fill="#c7a6ff" stroke="#c7a6ff" stroke-width="${n(c.corpo * 0.16)}" stroke-linejoin="round" opacity="0.85" filter="url(#${p}-halo)"`) +
          usar(p, `fill="#ffffff" stroke="#ffffff" stroke-width="${n(c.corpo * 0.07)}" stroke-linejoin="round" opacity="0.55"`) +
          usar(p, `transform="translate(0 ${n(c.corpo * 0.03)})" fill="#1a0f33" stroke="#1a0f33" stroke-width="${n(borda * 2)}" stroke-linejoin="round" opacity="0.35" filter="url(#${p}-sombra)"`) +
          usar(p, `fill="#ffffff" stroke="#4b2f8f" stroke-width="${n(borda * 2)}" stroke-linejoin="round" paint-order="stroke"`)
      );
    },
  },

  // 8. BRILHO ESCURO -- letra branca condensada numa névoa preta difusa. É o efeito que
  // mais funciona em cima de parede branca e céu estourado: a névoa escurece só em volta
  // da palavra, sem caixa. Duas névoas (curta e densa + larga e rala) dão profundidade.
  {
    id: "brilho_escuro",
    rotulo: "Brilho escuro",
    categoria: "brilho",
    fonte: "anton",
    maiusculas: true,
    espacamento: 0.02,
    amostra: "À venda",
    desenhar: (c, p) => {
      const largo = c.corpo * 0.15;
      const k = caixa(c, largo * 2.7);
      const cap = alturaMaiuscula("anton", c.corpo);
      const defs =
        vertical(`${p}-letra`, c.linhaDeBase - cap, c.linhaDeBase, [
          [0, "#ffffff"],
          [0.6, "#f4f6f9"],
          [1, "#b4bfcf"],
        ]) +
        `<clipPath id="${p}-dentro">${usar(p, "")}</clipPath>` +
        desfoque(`${p}-largo`, k, largo) +
        desfoque(`${p}-curto`, k, c.corpo * 0.035);
      const v = c.corpo * 0.028;
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `fill="#000" stroke="#000" stroke-width="${n(c.corpo * 0.14)}" stroke-linejoin="round" opacity="0.72" filter="url(#${p}-largo)"`) +
          usar(p, `transform="translate(0 ${n(c.corpo * 0.02)})" fill="#000" stroke="#000" stroke-width="${n(c.corpo * 0.05)}" stroke-linejoin="round" opacity="0.85" filter="url(#${p}-curto)"`) +
          // letra com volume: sem ele, no cartão escuro (onde a névoa some) sobra só "texto
          // branco" chapado. Faixa cinza-azulada nas bordas de baixo/direita, dentro da letra.
          `<g clip-path="url(#${p}-dentro)">` +
          usar(p, `fill="url(#${p}-letra)"`) +
          usar(p, `transform="translate(${n(-v)} ${n(-v)})" fill="none" stroke="#6f7c92" stroke-width="${n(v * 2)}" stroke-linejoin="round" opacity="0.8"`) +
          `</g>`
      );
    },
  },

  // 9. PÔR DO SOL -- o brilho QUENTE da família (os outros são frios ou rosados). Letra em
  // degradê de fim de tarde, do amarelo-claro ao magenta, com três faixas escuras na metade
  // de baixo como o sol retrô dos anos 80, contorno vinho e brilho laranja que esquenta a
  // parede. Casa com "Vista mar", "Cobertura", "Varanda gourmet". Não é o ouro do luxo:
  // não tem metal, é luz com faixas.
  {
    id: "por_do_sol",
    rotulo: "Pôr do sol",
    categoria: "brilho",
    fonte: "anton",
    maiusculas: true,
    espacamento: 0.03,
    amostra: "Vista mar",
    desenhar: (c, p) => {
      const kk = c.corpo;
      const cap = alturaMaiuscula("anton", kk);
      const base = c.linhaDeBase;
      const contorno = kk * 0.05;
      const largo = kk * 0.12;
      const k = caixa(c, largo * 2.8 + contorno);
      // faixas do sol retrô: mais grossas e mais juntas quanto mais perto da base.
      // [centro medido da base, em fração da maiúscula; espessura em fração do corpo]
      const faixas: [number, number][] = [
        [0.43, 0.026],
        [0.28, 0.036],
        [0.14, 0.048],
      ];
      const retas = faixas
        .map(([f, e]) => `<rect x="${n(-kk)}" y="${n(base - cap * f - (kk * e) / 2)}" width="${n(c.largura + kk * 2)}" height="${n(kk * e)}"/>`)
        .join("");
      const defs =
        vertical(`${p}-sol`, base - cap, base, [
          [0, "#fff3c2"],
          [0.4, "#ffc04a"],
          [0.75, "#ff6a3d"],
          [1, "#d93a6b"],
        ]) +
        `<clipPath id="${p}-dentro">${usar(p, "")}</clipPath>` +
        desfoque(`${p}-largo`, k, largo) +
        desfoque(`${p}-sombra`, k, kk * 0.03);
      return montar(
        c,
        p,
        k,
        defs,
        usar(p, `fill="#ff8a3d" stroke="#ff8a3d" stroke-width="${n(contorno * 2)}" stroke-linejoin="round" opacity="0.8" filter="url(#${p}-largo)"`) +
          usar(p, `transform="translate(0 ${n(kk * 0.04)})" fill="#2a0820" stroke="#2a0820" stroke-width="${n(contorno * 2)}" stroke-linejoin="round" opacity="0.5" filter="url(#${p}-sombra)"`) +
          usar(p, `fill="url(#${p}-sol)" stroke="#3a0d2e" stroke-width="${n(contorno * 2)}" stroke-linejoin="round" paint-order="stroke"`) +
          // faixas na cor do contorno e não transparentes: a silhueta da letra continua
          // inteira e a parede branca não "entra" na letra
          `<g clip-path="url(#${p}-dentro)" fill="#3a0d2e">${retas}</g>`
      );
    },
  },
];
