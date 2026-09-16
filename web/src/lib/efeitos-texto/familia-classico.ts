import { abrirSvg, type EfeitoTexto } from "./nucleo";

// FAMÍLIA CLÁSSICO: adesivo, cartum e cartaz.
//
// A régua é a aba "Efeitos de texto" do CapCut: cada cartão é uma PEÇA GRÁFICA com camadas
// (contorno duplo, volume, sombra dura, textura, enfeite), não a mesma letra com outra cor.
// Todos precisam ler em parede branca E em sala escura, então todo efeito tem pelo menos
// uma camada escura por fora (contorno, sombra ou placa) -- é ela que segura o branco.
//
// Tudo é medido em fração do corpo: a mesma receita roda com corpo 40 (legenda) e 200 (capa).
// Camadas repetidas usam <use> apontando pro contorno em <defs>: o `d` de uma frase longa
// passa de 10 KB, e copiar ele 20 vezes deixava o SVG pesado sem mudar nada no desenho.
//
// Pares que já se confundiram e o que separa cada um hoje (a galeria mostra tudo junto):
// - Tinta escorrendo x Estrelinhas: preto+branco com pingo  x  azul-marinho+dourado com estrela.
// - Doce de bolinhas x Adesivo recortado: biscoito de chocolate  x  papel branco girado.
// - Faixa de oferta x Placa de imóvel e Faixa de lançamento (luxo): paralelogramo inclinado
//   empilhado em amarelo e preto, letra em itálico  x  placa retangular  x  fita com corte em V.
// - Placa de cinema x Letras de lâmpadas (brilho): letra lisa numa placa com lâmpadas na
//   moldura  x  lâmpadas dentro da letra. Nome e fonte diferentes (Bebas x Lilita).
// - Remendo bordado x Adesivo recortado: pano marrom com trama e pesponto  x  papel branco liso.
// - 3D retrô x Placa de cinema: Bungee com bloco 3D fundo  x  Bebas com sombra curta.

type Peca = { svg: string; largura: number; altura: number };

/** Duas casas bastam pra qualquer corpo; mais que isso só engorda a string. */
const n = (v: number) => (Math.round(v * 100) / 100).toString();

function peca(largura: number, altura: number, miolo: string): Peca {
  const l = Math.ceil(largura);
  const a = Math.ceil(altura);
  return { svg: abrirSvg(l, a) + miolo + "</svg>", largura: l, altura: a };
}

/** "Acaso" que sai sempre igual pro mesmo número: o pingo não pode mudar de lugar a cada quadro do vídeo. */
function acaso(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Caixa de uma peça w×h depois de girada: a margem do SVG tem que caber os cantos. */
function giro(w: number, h: number, graus: number) {
  const t = (Math.abs(graus) * Math.PI) / 180;
  const largura = w * Math.cos(t) + h * Math.sin(t);
  const altura = w * Math.sin(t) + h * Math.cos(t);
  return {
    largura,
    altura,
    /** Transform que gira a peça em volta do centro e a encaixa na caixa nova. */
    transform: (ox: number, oy: number) =>
      `translate(${n(ox + largura / 2)} ${n(oy + altura / 2)}) rotate(${graus}) translate(${n(-w / 2)} ${n(-h / 2)})`,
  };
}

function hex(cor: string): [number, number, number] {
  const v = parseInt(cor.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mistura duas cores: o volume 3D escurece camada a camada em vez de ser um bloco chapado. */
function misturar(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Estrela de brilho de 4 pontas. Curva puxada pro centro: é o "cintilar" de desenho, não uma cruz. */
function estrela4(cx: number, cy: number, raio: number, cintura = 0.15): string {
  const k = raio * cintura;
  return (
    `M${n(cx)} ${n(cy - raio)}` +
    `Q${n(cx + k)} ${n(cy - k)} ${n(cx + raio)} ${n(cy)}` +
    `Q${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + raio)}` +
    `Q${n(cx - k)} ${n(cy + k)} ${n(cx - raio)} ${n(cy)}` +
    `Q${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - raio)}Z`
  );
}

type Segmento = [number, number, number, number];

/**
 * O contorno achatado em segmentos de reta, uma vez só.
 *
 * Os efeitos que leem a forma da letra (onde pinga, onde cabe bolinha) perguntam por dezenas
 * de alturas; reinterpretar o `d` de uma frase longa em cada pergunta custava mais que o desenho.
 */
function segmentos(d: string): Segmento[] {
  const s: Segmento[] = [];
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  let aberto = false;
  for (const m of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const v = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === "M") {
      if (aberto) s.push([px, py, sx, sy]);
      px = sx = v[0];
      py = sy = v[1];
      aberto = true;
    } else if (m[1] === "L") {
      s.push([px, py, v[0], v[1]]);
      px = v[0];
      py = v[1];
    } else if (m[1] === "Q") {
      let ax = px;
      let ay = py;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        const bx = u * u * px + 2 * u * t * v[0] + t * t * v[2];
        const by = u * u * py + 2 * u * t * v[1] + t * t * v[3];
        s.push([ax, ay, bx, by]);
        ax = bx;
        ay = by;
      }
      px = v[2];
      py = v[3];
    } else if (m[1] === "C") {
      let ax = px;
      let ay = py;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        const bx = u * u * u * px + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4];
        const by = u * u * u * py + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5];
        s.push([ax, ay, bx, by]);
        ax = bx;
        ay = by;
      }
      px = v[4];
      py = v[5];
    } else {
      s.push([px, py, sx, sy]);
      px = sx;
      py = sy;
      aberto = false;
    }
  }
  if (aberto) s.push([px, py, sx, sy]);
  return s;
}

/** Trechos em que uma linha horizontal atravessa a TINTA das letras (regra nonzero). */
function intervalos(segs: Segmento[], y: number): Array<[number, number]> {
  const cortes: Array<{ x: number; sentido: number }> = [];
  for (const [x0, y0, x1, y1] of segs) {
    if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
      cortes.push({ x: x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), sentido: y1 > y0 ? 1 : -1 });
    }
  }
  cortes.sort((a, b) => a.x - b.x);
  const trechos: Array<[number, number]> = [];
  let giroAtual = 0;
  let inicio = 0;
  for (const c of cortes) {
    const antes = giroAtual;
    giroAtual += c.sentido;
    if (antes === 0 && giroAtual !== 0) inicio = c.x;
    else if (antes !== 0 && giroAtual === 0) trechos.push([inicio, c.x]);
  }
  return trechos;
}

/** Algum trecho da linha cobre [a, b] inteiro? */
const cobre = (linha: Array<[number, number]>, a: number, b: number) => linha.some(([x0, x1]) => x0 <= a && x1 >= b);

/**
 * Hastes VERTICAIS RETAS das letras: onde um pingo de tinta pode nascer sem virar outra letra.
 *
 * A primeira regra ("tinta na mesma coluna em duas alturas") aceitava a parede do O e a perna
 * do A, e o pingo transformava O em Q, A em Ą, S em Ş. Aqui a haste é definida pela BORDA:
 * a borda esquerda tem que estar no mesmo x (tolerância 0,015 do corpo) em cinco alturas, e a
 * largura medida na mais baixa (mais acima, a barra do H e do E e a barriga do R escondem a
 * borda direita). Curva e diagonal mudam de x entre as alturas e caem fora.
 */
function hastes(segs: Segmento[], base: number, k: number): Array<[number, number]> {
  const tol = k * 0.015;
  const alturas = [0.2, 0.26, 0.33, 0.4, 0.47].map((a) => intervalos(segs, base - k * a));
  const saida: Array<[number, number]> = [];
  for (const [a, b] of alturas[0]) {
    const largura = b - a;
    if (largura < k * 0.1 || largura > k * 0.3) continue;
    const esquerdaReta = alturas.every((linha) => linha.some(([x0]) => Math.abs(x0 - a) < tol));
    if (esquerdaReta) saida.push([a, b]);
  }
  return saida;
}

/**
 * Um pingo de tinta como UM caminho só: menisco côncavo largo saindo da letra, pescoço fino
 * e gota redonda MAIS LARGA que o pescoço no fim.
 *
 * O retângulo + bola de antes parecia palito de fósforo. E um pingo quase da largura da haste
 * lia como a haste continuando pra baixo da linha: o D virava P ("VENPIPO"). O que diz
 * "líquido" é o contraste de larguras: menisco largo -> pescoço de um terço da haste -> gota.
 */
function pingo(cx: number, b: number, r: number, filete: number, topo: number, base: number, comp: number): string {
  const a = b * 1.55;
  const yc = base + comp - r;
  const yPescoco = Math.min(base + filete + (comp - filete) * 0.55, yc - r * 0.6);
  const q = 0.5523;
  const desce = yPescoco - (base + filete);
  const lado = (s: number) => cx + s;
  return (
    `M${n(lado(-a - filete))} ${n(topo)}L${n(lado(-a - filete))} ${n(base)}` +
    `Q${n(lado(-a))} ${n(base)} ${n(lado(-a))} ${n(base + filete)}` +
    `C${n(lado(-a))} ${n(base + filete + desce * 0.45)} ${n(lado(-b))} ${n(yPescoco - desce * 0.3)} ${n(lado(-b))} ${n(yPescoco)}` +
    `C${n(lado(-b))} ${n(yPescoco + (yc - yPescoco) * 0.45)} ${n(lado(-r))} ${n(yc - r * 0.75)} ${n(lado(-r))} ${n(yc)}` +
    `C${n(lado(-r))} ${n(yc + r * q)} ${n(lado(-r * q))} ${n(yc + r)} ${n(cx)} ${n(yc + r)}` +
    `C${n(lado(r * q))} ${n(yc + r)} ${n(lado(r))} ${n(yc + r * q)} ${n(lado(r))} ${n(yc)}` +
    `C${n(lado(r))} ${n(yc - r * 0.75)} ${n(lado(b))} ${n(yPescoco + (yc - yPescoco) * 0.45)} ${n(lado(b))} ${n(yPescoco)}` +
    `C${n(lado(b))} ${n(yPescoco - desce * 0.3)} ${n(lado(a))} ${n(base + filete + desce * 0.45)} ${n(lado(a))} ${n(base + filete)}` +
    `Q${n(lado(a))} ${n(base)} ${n(lado(a + filete))} ${n(base)}L${n(lado(a + filete))} ${n(topo)}Z`
  );
}

/** Pontos igualmente espaçados em volta de um retângulo arredondado (as lâmpadas da placa). */
function pontosNoRetangulo(x: number, y: number, w: number, h: number, raio: number, passo: number): Array<[number, number]> {
  const linha: Array<[number, number]> = [];
  const cantos: Array<[number, number, number]> = [
    [x + w - raio, y + raio, -90],
    [x + w - raio, y + h - raio, 0],
    [x + raio, y + h - raio, 90],
    [x + raio, y + raio, 180],
  ];
  for (const [cx, cy, a0] of cantos) {
    for (let s = 0; s <= 6; s++) {
      const a = ((a0 + (s * 90) / 6) * Math.PI) / 180;
      linha.push([cx + raio * Math.cos(a), cy + raio * Math.sin(a)]);
    }
  }
  linha.push(linha[0]);
  const acum = [0];
  for (let i = 1; i < linha.length; i++) acum.push(acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]));
  const total = acum[acum.length - 1];
  const quantos = Math.max(4, Math.round(total / passo));
  const saida: Array<[number, number]> = [];
  let j = 0;
  for (let i = 0; i < quantos; i++) {
    const s = (i / quantos) * total;
    while (j < acum.length - 2 && acum[j + 1] < s) j++;
    const f = (s - acum[j]) / (acum[j + 1] - acum[j] || 1);
    saida.push([linha[j][0] + (linha[j + 1][0] - linha[j][0]) * f, linha[j][1] + (linha[j + 1][1] - linha[j][1]) * f]);
  }
  return saida;
}

/**
 * Explosão de gibi em volta do texto.
 *
 * A base é uma superelipse (quase retângulo de cantos redondos), não uma elipse: numa elipse
 * os cantos de uma frase longa furam a explosão. As pontas são distribuídas pelo comprimento
 * do contorno e têm tamanho ABSOLUTO (fração do corpo) -- proporcionais ao raio, as pontas
 * de "Aceita financiamento" ficariam do tamanho de uma letra.
 *
 * O tamanho varia muito e a cada cinco pontas sai uma grande: pontas quase iguais, numa frase
 * longa, viravam a serrilha de um selo de correio e não uma explosão.
 */
function explosao(cx: number, cy: number, a: number, b: number, passo: number, fora: number, dentro: number): string {
  const N = 480;
  const amostra: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    amostra.push([cx + a * Math.sign(ct) * Math.sqrt(Math.abs(ct)), cy + b * Math.sign(st) * Math.sqrt(Math.abs(st))]);
  }
  const acum = [0];
  for (let i = 1; i <= N; i++) {
    const p0 = amostra[i - 1];
    const p1 = amostra[i % N];
    acum.push(acum[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
  }
  const total = acum[N];
  const vertices = Math.max(10, Math.round(total / passo)) * 2;
  const saida: string[] = [];
  let j = 0;
  for (let v = 0; v < vertices; v++) {
    const s = (v / vertices) * total;
    while (j < N - 1 && acum[j + 1] < s) j++;
    const p0 = amostra[j];
    const p1 = amostra[(j + 1) % N];
    const f = (s - acum[j]) / (acum[j + 1] - acum[j] || 1);
    const px = p0[0] + (p1[0] - p0[0]) * f;
    const py = p0[1] + (p1[1] - p0[1]) * f;
    let nx = p1[1] - p0[1];
    let ny = -(p1[0] - p0[0]);
    const tam = Math.hypot(nx, ny) || 1;
    nx /= tam;
    ny /= tam;
    if (nx * (px - cx) + ny * (py - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const ponta = v / 2;
    const desloca = v % 2 === 0 ? (ponta % 5 === 2 ? fora * 1.6 : fora * (0.45 + 1.0 * acaso(v * 3 + 1))) : -dentro;
    saida.push(`${n(px + nx * desloca)} ${n(py + ny * desloca)}`);
  }
  return `M${saida.join("L")}Z`;
}

/**
 * Riscas paralelas inclinadas cobrindo um retângulo, como UM caminho só (quem usa recorta).
 *
 * Não é <pattern>: o librsvg desenha o ladrilho do padrão um por um, e ladrilho de 10 px numa
 * faixa de 2800 px são dezenas de milhares de desenhos -- a sarja do remendo sozinha levava 2 s.
 */
function riscas(x: number, y: number, w: number, h: number, passo: number, graus: number): string {
  const t = (graus * Math.PI) / 180;
  const recuo = h / Math.tan(t);
  const sx = passo / Math.sin(t);
  const ini = Math.min(0, recuo);
  const fim = w + Math.max(0, recuo);
  const partes: string[] = [];
  for (let px = ini; px <= fim; px += sx) partes.push(`M${n(x + px)} ${n(y)}L${n(x + px - recuo)} ${n(y + h)}`);
  return partes.join("");
}

/**
 * Riscas a 45° que emendam sem costura num ladrilho quadrado de `lado` (x+y ou x-y constante,
 * com período que divide o lado). Dentro de <pattern> preenchem a forma sem clip-path: o
 * recorte por clip-path numa faixa de 2800 px custava mais que o próprio desenho.
 */
function riscasLadrilho(lado: number, passo: number, subindo: boolean): string {
  const m = Math.max(1, Math.round(lado / (passo * Math.SQRT2)));
  const q = lado / m;
  const partes: string[] = [];
  for (let j = subindo ? 0 : -m; j <= (subindo ? 2 * m : m); j++) {
    partes.push(subindo ? `M${n(j * q)} 0L${n(j * q - lado)} ${n(lado)}` : `M${n(j * q)} 0L${n(j * q + lado)} ${n(lado)}`);
  }
  return partes.join("");
}

/** Retângulo de cantos redondos como caminho (o `rect` não aceita corte em V nem tracejado contínuo igual). */
function retanguloRedondo(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${n(x + rr)} ${n(y)}L${n(x + w - rr)} ${n(y)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + rr)}` +
    `L${n(x + w)} ${n(y + h - rr)}Q${n(x + w)} ${n(y + h)} ${n(x + w - rr)} ${n(y + h)}` +
    `L${n(x + rr)} ${n(y + h)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - rr)}` +
    `L${n(x)} ${n(y + rr)}Q${n(x)} ${n(y)} ${n(x + rr)} ${n(y)}Z`
  );
}

export const EFEITOS: EfeitoTexto[] = [
  // ---------------------------------------------------------------- POPULARES
  {
    id: "pop_vermelho",
    rotulo: "Pop vermelho",
    categoria: "populares",
    // Archivo Black e não Rubik Mono: na Rubik o "À" com contorno virava "Ä" e o espaço
    // monoespaçado abria um buraco de três letras entre as palavras.
    fonte: "archivo",
    espacamento: 0.01,
    maiusculas: true,
    amostra: "Oferta",
    desenhar: (c, p) => {
      const k = c.corpo;
      // Fio amarelo-limão fino colado na letra: é ele que faz o vermelho "vibrar" (cor
      // complementar). Por fora, um fio vinho: sem ele o limão some na parede clara.
      const lima = k * 0.04;
      const vinho = k * 0.045;
      const fio = lima + vinho;
      const sx = k * 0.04;
      const sy = k * 0.07;
      const m = fio + Math.max(sx, sy) + k * 0.03;
      const w = c.largura;
      const h = c.altura;
      // Máscaras em espaço de usuário cobrindo a peça inteira: o padrão (caixa do objeto) corta
      // o realce das letras da ponta.
      const area = `maskUnits="userSpaceOnUse" x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}"`;
      return peca(
        w + m * 2,
        h + m * 2,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<linearGradient id="${p}-verm" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#ff5e62"/><stop offset="0.5" stop-color="#f0142a"/><stop offset="1" stop-color="#a8000e"/></linearGradient>` +
          // Realce em CRESCENTE: a letra menos ela mesma descida. Só a borda de cima de cada
          // letra acende, e o O ganha realce curvo -- é o que faz bala de gel. O retângulo
          // cortado reto de antes riscava todas as letras na mesma altura (WordArt).
          // Dois crescentes (fino forte + largo fraco): um só, de espessura e brilho iguais,
          // lia como uma cópia rosa desencontrada da letra, não como luz.
          `<mask id="${p}-realce" ${area}><use href="#${p}-l" fill="#fff"/><use href="#${p}-l" transform="translate(0 ${n(k * 0.028)})" fill="#000"/></mask>` +
          `<mask id="${p}-realce2" ${area}><use href="#${p}-l" fill="#fff"/><use href="#${p}-l" transform="translate(0 ${n(k * 0.085)})" fill="#000"/></mask>` +
          // O mesmo truque ao contrário embaixo: sombra interna na base, volume sem blur.
          `<mask id="${p}-fundo" ${area}><use href="#${p}-l" fill="#fff"/><use href="#${p}-l" transform="translate(0 ${n(-k * 0.05)})" fill="#000"/></mask>` +
          `</defs>` +
          `<g transform="translate(${n(m)} ${n(m)})" stroke-linejoin="round">` +
          // Sombra SÓLIDA: com transparência ela virava mancha marrom suja na parede bege.
          `<use href="#${p}-l" transform="translate(${n(sx)} ${n(sy)})" fill="#4a0610" stroke="#4a0610" stroke-width="${n(fio * 2)}"/>` +
          `<use href="#${p}-l" fill="#3d0309" stroke="#3d0309" stroke-width="${n(fio * 2)}"/>` +
          `<use href="#${p}-l" fill="#dcff3b" stroke="#dcff3b" stroke-width="${n(lima * 2)}"/>` +
          `<use href="#${p}-l" fill="url(#${p}-verm)"/>` +
          `<rect x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}" fill="#6e0010" opacity="0.45" mask="url(#${p}-fundo)"/>` +
          `<rect x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}" fill="#ffd9dc" opacity="0.2" mask="url(#${p}-realce2)"/>` +
          `<rect x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}" fill="#fff" opacity="0.6" mask="url(#${p}-realce)"/>` +
          `</g>`
      );
    },
  },
  {
    id: "adesivo_recortado",
    rotulo: "Adesivo recortado",
    categoria: "populares",
    fonte: "lilita",
    amostra: "Novidade",
    desenhar: (c, p) => {
      const k = c.corpo;
      // O papel branco é um traço GROSSO de ponta redonda em volta das letras: fecha os vãos
      // entre elas e dá o recorte ondulado de adesivo de verdade.
      const papel = k * 0.16;
      // Fio cinza por fora do papel: na parede branca é a única coisa que desenha a borda.
      const aro = k * 0.014;
      const tinta = k * 0.03;
      const desfoque = k * 0.035;
      const queda = k * 0.045;
      const ext = papel + aro;
      const w = c.largura + ext * 2;
      const h = c.altura + ext * 2;
      const g = giro(w, h, -4);
      const folga = desfoque * 3 + queda + k * 0.02;
      // Eco com piso em px: abaixo de ~2,5 px o deslocamento vira franja rosa de serrilhado,
      // que parece erro de render e não impressão fora de registro.
      const eco = Math.max(k * 0.05, 2.5);
      return peca(
        g.largura + folga * 2,
        g.altura + folga * 2,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<filter id="${p}-sombra" filterUnits="userSpaceOnUse" x="${n(-ext - desfoque * 3)}" y="${n(-ext - desfoque * 3)}" width="${n(c.largura + (ext + desfoque * 3) * 2)}" height="${n(c.altura + (ext + desfoque * 3) * 2 + queda)}">` +
          `<feGaussianBlur stdDeviation="${n(desfoque)}"/></filter>` +
          `<linearGradient id="${p}-tinta" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(c.altura)}">` +
          `<stop offset="0" stop-color="#4d7bff"/><stop offset="1" stop-color="#1e3bd6"/></linearGradient>` +
          `</defs>` +
          `<g transform="${g.transform(folga, folga)}"><g transform="translate(${n(ext)} ${n(ext)})" stroke-linejoin="round">` +
          `<use href="#${p}-l" transform="translate(0 ${n(queda)})" fill="#000" stroke="#000" stroke-width="${n(ext * 2)}" opacity="0.4" filter="url(#${p}-sombra)"/>` +
          `<use href="#${p}-l" fill="#c3c9d3" stroke="#c3c9d3" stroke-width="${n(ext * 2)}"/>` +
          `<use href="#${p}-l" fill="#fff" stroke="#fff" stroke-width="${n(papel * 2)}"/>` +
          // Eco rosa deslocado atrás da letra: o "erro de impressão" que dá cara de adesivo de loja.
          `<use href="#${p}-l" transform="translate(${n(eco)} ${n(eco)})" fill="#ff5fa8"/>` +
          `<use href="#${p}-l" fill="url(#${p}-tinta)" stroke="#0b1a66" stroke-width="${n(tinta * 2)}" paint-order="stroke"/>` +
          `</g></g>`
      );
    },
  },
  {
    id: "faixa_oferta",
    rotulo: "Faixa de oferta",
    categoria: "populares",
    fonte: "anton",
    maiusculas: true,
    espacamento: 0.02,
    amostra: "À venda",
    desenhar: (c, p) => {
      const k = c.corpo;
      const w = c.largura;
      const h = c.altura;
      // Tarja de cartaz de promoção: bloco INCLINADO (paralelogramo) com letra em itálico,
      // empilhado sobre um bloco amarelo e um preto. Opaco, então lê em qualquer fundo.
      // Não é bandeirola com corte em V (isso é a "Faixa de lançamento" do luxo) nem placa
      // retangular com filete (a "Placa de imóvel"): a silhueta é o paralelogramo.
      const inclina = Math.tan((12 * Math.PI) / 180);
      const px = k * 0.36;
      const py = k * 0.2;
      const bw = w + px * 2;
      const bh = h + py * 2;
      const sk = (inclina * bh) / 2;
      // Amarelo e preto deslocados em degraus: o preto segura a borda na parede branca, o
      // amarelo segura no escuro, e juntos dão o "impresso em camadas" de encarte de mercado.
      const amarelo = k * 0.065;
      const preto = k * 0.13;
      const folga = k * 0.03;
      const listra = k * 0.16;
      const sombraLetra = k * 0.05;
      const bloco = (x: number, y: number) =>
        `M${n(x + sk * 2)} ${n(y)}L${n(x + bw + sk * 2)} ${n(y)}L${n(x + bw)} ${n(y + bh)}L${n(x)} ${n(y + bh)}Z`;
      // Letra inclinada em volta da meia altura, que é a mesma meia altura do bloco.
      const italico = `translate(${n(sk + px)} ${n(py)}) translate(0 ${n(h / 2)}) skewX(-12) translate(0 ${n(-h / 2)})`;
      return peca(
        bw + sk * 2 + preto + folga * 2,
        bh + preto + folga * 2,
        `<defs>` +
          `<clipPath id="${p}-corte"><path d="${bloco(0, 0)}"/></clipPath>` +
          `<linearGradient id="${p}-bloco" x1="0" y1="0" x2="1" y2="1">` +
          `<stop offset="0" stop-color="#ff4a3d"/><stop offset="1" stop-color="#c8021c"/></linearGradient>` +
          `</defs>` +
          `<g transform="translate(${n(folga)} ${n(folga)})">` +
          `<path d="${bloco(preto, preto)}" fill="#111"/>` +
          `<path d="${bloco(amarelo, amarelo)}" fill="#ffd21f"/>` +
          `<g clip-path="url(#${p}-corte)">` +
          `<rect width="${n(bw + sk * 2)}" height="${n(bh)}" fill="url(#${p}-bloco)"/>` +
          // Listras diagonais de papel de cartaz, como riscas num caminho só (padrão de ladrilho
          // pequeno é lento no librsvg). A 12% existem no corpo 100 sem brigar com a letra.
          `<path d="${riscas(0, 0, bw + sk * 2, bh, listra, 45)}" fill="none" stroke="#000" stroke-width="${n(listra / 2)}" stroke-opacity="0.12"/>` +
          // Luz fina no topo e barra funda embaixo: o bloco ganha espessura de papel-cartão.
          `<rect width="${n(bw + sk * 2)}" height="${n(k * 0.035)}" fill="#fff" opacity="0.3"/>` +
          `<rect y="${n(bh - k * 0.06)}" width="${n(bw + sk * 2)}" height="${n(k * 0.06)}" fill="#7a0010" opacity="0.75"/>` +
          `</g>` +
          `<g transform="${italico}">` +
          `<path d="${c.d}" transform="translate(${n(sombraLetra)} ${n(sombraLetra)})" fill="#5a000c"/>` +
          `<path d="${c.d}" fill="#fff"/>` +
          `</g></g>`
      );
    },
  },

  // ---------------------------------------------------------------- CLÁSSICO
  {
    id: "tinta_escorrendo",
    rotulo: "Tinta escorrendo",
    categoria: "classico",
    fonte: "lilita",
    maiusculas: true,
    espacamento: 0.02,
    amostra: "Vendido",
    desenhar: (c, p) => {
      const k = c.corpo;
      const borda = k * 0.075;
      const sx = k * 0.05;
      const sy = k * 0.06;
      const base = c.linhaDeBase;
      const segs = segmentos(c.d);
      const topo = base - k * 0.04;
      const naBase = intervalos(segs, base - k * 0.035);
      // Tinta ABAIXO da linha de base (cedilha do Ç, rabo do Q, barra do $): pingo perto dela
      // se fundia num toco e mudava a letra. Fica longe.
      const embaixo = [...intervalos(segs, base + k * 0.06), ...intervalos(segs, base + k * 0.16)];
      // Vãos entre palavras: onde toda altura da letra está vazia por mais de 0,18 do corpo.
      const ocupado = [0.1, 0.25, 0.4, 0.55, 0.68].flatMap((a) => intervalos(segs, base - k * a)).sort((a, b) => a[0] - b[0]);
      const palavras: Array<[number, number]> = [];
      for (const [a, b] of ocupado) {
        const ult = palavras[palavras.length - 1];
        if (ult && a - ult[1] < k * 0.18) ult[1] = Math.max(ult[1], b);
        else palavras.push([a, b]);
      }
      // Pescoço e gota com piso em fração do corpo: proporcionais só à haste, na Lilita fina
      // de corpo 40 o pingo sumia dentro do contorno preto.
      const pescoco = k * 0.037;
      const gota = k * 0.062;
      const acima = intervalos(segs, base - k * 0.26);
      type Vaga = { cx: number; filete: number; trecho: number; palavra: number; ordem: number };
      const vagas: Vaga[] = [];
      for (const [h0, h1] of hastes(segs, base, k)) {
        const cx = (h0 + h1) / 2;
        const trecho = naBase.findIndex(([x0, x1]) => x0 <= h0 + k * 0.01 && x1 >= h1 - k * 0.01);
        if (trecho < 0) continue;
        if (embaixo.some(([x0, x1]) => x1 > cx - k * 0.3 && x0 < cx + k * 0.3)) continue;
        const [t0, t1] = naBase[trecho];
        // Haste de letra FECHADA embaixo (D, B): o pé continua até uma barriga que volta a ter
        // tinta mais acima. Pingo ali prolonga a haste e a letra vira P/β. Fica de fora.
        const fechaDireita = t1 > h1 + k * 0.1 && acima.some(([x0]) => x0 > h1 + k * 0.02 && x0 < t1);
        const fechaEsquerda = t0 < h0 - k * 0.1 && acima.some(([, x1]) => x1 < h0 - k * 0.02 && x1 > t0);
        if (fechaDireita || fechaEsquerda) continue;
        // O menisco só abre até onde há tinta na base pra ele entrar; na haste solta do I ele
        // sairia pro lado como um dente.
        const filete = Math.max(0, Math.min(k * 0.06, cx - pescoco * 1.55 - t0, t1 - cx - pescoco * 1.55));
        const palavra = Math.max(0, palavras.findIndex(([a0, b0]) => cx >= a0 && cx <= b0));
        vagas.push({ cx, filete, trecho, palavra, ordem: vagas.length });
      }
      // No máximo um pingo por pé de letra e um a cada duas letras: pingo em todas vira franja.
      const letras = Math.max(1, Math.round(c.largura / (k * 0.55)));
      const limite = Math.max(1, Math.floor(letras / 2));
      const escolhidos: Vaga[] = [];
      const usados = new Set<number>();
      const candidatos = [...vagas].sort((x, y) => acaso(x.ordem * 13 + 5) - acaso(y.ordem * 13 + 5));
      for (const v of candidatos) {
        if (escolhidos.length >= limite) break;
        if (usados.has(v.trecho)) continue;
        if (escolhidos.some((e) => Math.abs(e.cx - v.cx) < k * 0.7)) continue;
        usados.add(v.trecho);
        escolhidos.push(v);
      }
      const formas: string[] = [];
      let fundo = c.altura;
      const longos = new Set<number>();
      escolhidos.sort((x, y) => x.cx - y.cx);
      for (const v of escolhidos) {
        // Um pingo LONGO por palavra: é ele que diz "escorreu". Os outros são médios, nunca
        // curtos -- pingo curto no corpo 40 lia como cedilha embaixo da letra.
        const longo = !longos.has(v.palavra);
        longos.add(v.palavra);
        const comp = longo ? k * (0.42 + 0.14 * acaso(v.ordem + 11)) : k * (0.24 + 0.1 * acaso(v.ordem + 11));
        formas.push(`<path d="${pingo(v.cx, pescoco, gota, v.filete, topo, base, comp)}"/>`);
        fundo = Math.max(fundo, base + comp);
      }
      const m = borda + k * 0.03;
      return peca(
        c.largura + m * 2 + sx,
        fundo + m * 2 + sy,
        `<defs>` +
          `<g id="${p}-f"><path d="${c.d}"/>${formas.join("")}</g>` +
          // O degradê termina FIXO meio corpo abaixo da letra: amarrado ao pingo mais comprido,
          // a ponta do pingo ficava cinza e a gota parecia outra coisa colada.
          `<linearGradient id="${p}-tinta" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(c.altura + k * 0.5)}">` +
          `<stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#f7f7f7"/><stop offset="1" stop-color="#e2e6ec"/></linearGradient>` +
          `</defs>` +
          `<g transform="translate(${n(m)} ${n(m)})" stroke-linejoin="round">` +
          // Sombra dura e opaca: preta a 30% virava um fantasma cinza na parede.
          `<use href="#${p}-f" transform="translate(${n(sx)} ${n(sy)})" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="${n(borda * 2)}"/>` +
          `<use href="#${p}-f" fill="#0d0d0d" stroke="#0d0d0d" stroke-width="${n(borda * 2)}"/>` +
          `<use href="#${p}-f" fill="url(#${p}-tinta)"/>` +
          `</g>`
      );
    },
  },
  {
    id: "estrelinhas",
    rotulo: "Estrelinhas",
    categoria: "classico",
    fonte: "poppins",
    maiusculas: true,
    amostra: "Vista mar",
    desenhar: (c, p) => {
      const k = c.corpo;
      const borda = k * 0.07;
      const sx = k * 0.07;
      const sy = k * 0.09;
      const w = c.largura;
      const h = c.altura;
      // Nenhum enfeite encosta na caixa do texto engordada pelos dois contornos: a estrela em
      // cima do "À" engolia o acento, a de baixo mordia o pé da última letra, e bolinha na meia
      // altura ao lado da palavra lia como pontuação ("·R$ 890.000:").
      const E = borda * 2 + k * 0.06;
      const rg = k * 0.27;
      const rm = k * 0.2;
      const rp = k * 0.2;
      // Estrela de 4 pontas fora do CANTO, na diagonal: as pontas correm pelos eixos, então
      // passam por cima/do lado da caixa sem entrar nela.
      const grande = { x: -E - k * 0.05, y: -E - k * 0.05, r: rg };
      const media = { x: w + E + rm, y: h * 0.8, r: rm };
      const pequena = { x: w + E * 0.2, y: -E - rp - k * 0.04, r: rp };
      const brilhos = [grande, media, pequena];
      // Bolinhas só na diagonal de fora de uma estrela de cima, longe de qualquer letra.
      const pontos = [
        { x: grande.x - k * 0.28, y: grande.y - k * 0.24, r: k * 0.045 },
        { x: pequena.x + k * 0.28, y: pequena.y - k * 0.24, r: k * 0.038 },
      ];
      let x0 = 0;
      let y0 = 0;
      let x1 = w;
      let y1 = h;
      for (const b of [...brilhos, ...pontos]) {
        x0 = Math.min(x0, b.x - b.r);
        y0 = Math.min(y0, b.y - b.r);
        x1 = Math.max(x1, b.x + b.r);
        y1 = Math.max(y1, b.y + b.r);
      }
      const folga = borda + k * 0.03;
      const estrelas =
        brilhos.map((b) => `<path d="${estrela4(b.x, b.y, b.r)}"/>`).join("") +
        pontos.map((b) => `<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.r)}"/>`).join("");
      return peca(
        x1 - x0 + folga * 2 + sx,
        y1 - y0 + folga * 2 + sy,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<g id="${p}-e">${estrelas}</g>` +
          `<linearGradient id="${p}-branco" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6f7"/></linearGradient>` +
          `</defs>` +
          `<g transform="translate(${n(folga - x0)} ${n(folga - y0)})" stroke-linejoin="round">` +
          // Sombra dura dourada funda: combina com as estrelas e dá volume sem sujar a parede.
          `<g transform="translate(${n(sx)} ${n(sy)})" fill="#f5a000" stroke="#f5a000" stroke-width="${n(borda * 2)}">` +
          `<use href="#${p}-l"/><use href="#${p}-e"/></g>` +
          // Contorno azul-marinho, não preto: preto+branco+sombra era a "Tinta escorrendo" sem pingo.
          `<g fill="#14213d" stroke="#14213d" stroke-width="${n(borda * 2)}"><use href="#${p}-l"/><use href="#${p}-e"/></g>` +
          `<use href="#${p}-l" fill="url(#${p}-branco)"/>` +
          `<use href="#${p}-e" fill="#fff4c2"/>` +
          `</g>`
      );
    },
  },
  {
    id: "extrudado_3d",
    rotulo: "3D retrô",
    categoria: "classico",
    fonte: "bungee",
    maiusculas: true,
    amostra: "Casa",
    desenhar: (c, p) => {
      const k = c.corpo;
      const contorno = k * 0.045;
      // Volume por cópias deslocadas na diagonal, cada uma um tom mais escura: é o 3D de
      // letreiro dos anos 80. Fundo o bastante pra ler como BLOCO (raso parecia só sombra),
      // e mais para baixo que para o lado, pra não roubar largura.
      const passos = 14;
      const dx = (k * 0.14) / passos;
      const dy = (k * 0.2) / passos;
      const w = c.largura;
      const h = c.altura;
      const m = contorno + k * 0.03;
      let linha = "";
      for (let i = passos; i >= 0; i -= 2) linha += `<use href="#${p}-l" transform="translate(${n(i * dx)} ${n(i * dy)})"/>`;
      let volume = "";
      const emenda = Math.hypot(dx, dy) * 1.6;
      for (let i = passos; i >= 1; i--) {
        const cor = misturar("#b0379f", "#2a0a4a", (i - 1) / (passos - 1));
        volume += `<use href="#${p}-l" transform="translate(${n(i * dx)} ${n(i * dy)})" fill="${cor}" stroke="${cor}" stroke-width="${n(emenda)}"/>`;
      }
      return peca(
        w + m * 2 + dx * passos,
        h + m * 2 + dy * passos,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<linearGradient id="${p}-face" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#ffd1ea"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient>` +
          `</defs>` +
          `<g transform="translate(${n(m)} ${n(m)})" stroke-linejoin="round">` +
          `<g fill="#12021f" stroke="#12021f" stroke-width="${n(contorno * 2)}">${linha}</g>` +
          volume +
          `<use href="#${p}-l" fill="url(#${p}-face)" stroke="#12021f" stroke-width="${n(k * 0.024)}" paint-order="stroke"/>` +
          `</g>`
      );
    },
  },
  {
    id: "remendo_bordado",
    rotulo: "Remendo bordado",
    categoria: "classico",
    // Luckiest e não Lilita: a Lilita já está no adesivo e na tinta; a Luckiest tem o miolo
    // gordo e arredondado de letra bordada em jaqueta.
    fonte: "luckiest",
    maiusculas: true,
    espacamento: 0.02,
    amostra: "Exclusivo",
    desenhar: (c, p) => {
      const k = c.corpo;
      const w = c.largura;
      const h = c.altura;
      // Remendo de tecido costurado: opaco (lê em qualquer fundo) e com uma textura que nenhum
      // outro efeito do catálogo tem. Camadas: sombra, overlock escuro, feltro com trama,
      // pesponto tracejado bege, letra dourada com contorno e sombra dura.
      const px = k * 0.42;
      const py = k * 0.32;
      const rw = w + px * 2;
      const rh = h + py * 2;
      const raio = Math.min(k * 0.3, rh / 2);
      const overlock = k * 0.045;
      const ponto = overlock + k * 0.09;
      const queda = k * 0.05;
      const g = giro(rw + queda, rh + queda, -3);
      const folga = k * 0.03;
      const contorno = k * 0.04;
      const fio = k * 0.02;
      // Ladrilho da trama: ruído + sarja num quadrado de 1,2 corpo repetido por <pattern>, com
      // stitchTiles emendando as bordas do ruído. Com o ruído na caixa inteira do remendo, e a
      // sarja recortada por clip-path, frase de 26 letras em corpo 200 passava de 1,5 s.
      const ladrilho = k * 1.2;
      const ladrilhoSeda = k * 0.6;
      const freq = 1 / (k * 0.035);
      const miolo = retanguloRedondo(overlock, overlock, rw - overlock * 2, rh - overlock * 2, raio - overlock);
      // Riscas com piso em px: abaixo de ~3 px viram moiré cinza em vez de trama.
      const sarja = Math.max(k * 0.05, 3);
      const seda = Math.max(k * 0.05, 2.5);
      return peca(
        g.largura + folga * 2,
        g.altura + folga * 2,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          // Fibra de tecido: ruído só um pouco esticado (esticado demais lia veio de MADEIRA),
          // com fios escuros E claros -- só escuro, em contraste alto, virava casca de árvore.
          `<filter id="${p}-fibra" filterUnits="userSpaceOnUse" x="0" y="0" width="${n(ladrilho)}" height="${n(ladrilho)}" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency="${freq.toFixed(4)} ${(freq * 0.6).toFixed(4)}" numOctaves="2" seed="7" stitchTiles="stitch" result="ruido"/>` +
          `<feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0 0.02  1.5 0 0 0 -0.62" result="escuro"/>` +
          `<feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0.95  0 0 0 0 0.8  0 0 0 0 0.6  0 -1.2 0 0 0.46" result="claro"/>` +
          `<feMerge><feMergeNode in="escuro"/><feMergeNode in="claro"/></feMerge></filter>` +
          // Sarja: as diagonais finas do pano de jaqueta. É o que diz "tecido" e não "couro" de longe.
          `<pattern id="${p}-trama" patternUnits="userSpaceOnUse" width="${n(ladrilho)}" height="${n(ladrilho)}">` +
          `<path d="${riscasLadrilho(ladrilho, sarja, true)}" fill="none" stroke="#1c0e05" stroke-opacity="0.28" stroke-width="${n(sarja * 0.42)}"/>` +
          `<rect width="${n(ladrilho)}" height="${n(ladrilho)}" filter="url(#${p}-fibra)"/></pattern>` +
          // Ponto cheio do bordado: riscas finas dentro da letra, na diagonal oposta, como fio de seda.
          `<pattern id="${p}-seda" patternUnits="userSpaceOnUse" width="${n(ladrilhoSeda)}" height="${n(ladrilhoSeda)}">` +
          `<path d="${riscasLadrilho(ladrilhoSeda, seda, false)}" fill="none" stroke="#fff6d0" stroke-opacity="0.3" stroke-width="${n(seda * 0.32)}"/></pattern>` +
          `<radialGradient id="${p}-luz" cx="0.35" cy="0.25" r="0.9">` +
          `<stop offset="0" stop-color="#83562f"/><stop offset="1" stop-color="#5a3620"/></radialGradient>` +
          `<linearGradient id="${p}-ouro" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#f5a623"/><stop offset="1" stop-color="#d9731a"/></linearGradient>` +

          `</defs>` +
          `<g transform="${g.transform(folga, folga)}">` +
          `<path d="${retanguloRedondo(queda * 0.6, queda, rw, rh, raio)}" fill="#24140a"/>` +
          `<path d="${retanguloRedondo(0, 0, rw, rh, raio)}" fill="#3a2213"/>` +
          `<path d="${miolo}" fill="url(#${p}-luz)"/>` +
          `<path d="${miolo}" fill="url(#${p}-trama)"/>` +
          // Pesponto: um traço escuro um fio abaixo (o furo da agulha) e o fio bege por cima.
          `<g fill="none" stroke-width="${n(fio)}" stroke-dasharray="${n(k * 0.08)} ${n(k * 0.055)}" stroke-linecap="round">` +
          `<path d="${retanguloRedondo(ponto, ponto + fio * 0.7, rw - ponto * 2, rh - ponto * 2, raio - ponto)}" stroke="#20120a" opacity="0.7"/>` +
          `<path d="${retanguloRedondo(ponto, ponto, rw - ponto * 2, rh - ponto * 2, raio - ponto)}" stroke="#e8d3a8"/>` +
          `</g>` +
          `<g transform="translate(${n(px)} ${n(py)})" stroke-linejoin="round">` +
          `<use href="#${p}-l" transform="translate(${n(k * 0.03)} ${n(k * 0.04)})" fill="#2a170c" stroke="#2a170c" stroke-width="${n(contorno * 2)}"/>` +
          `<use href="#${p}-l" fill="#3a2213" stroke="#3a2213" stroke-width="${n(contorno * 2)}"/>` +
          `<use href="#${p}-l" fill="url(#${p}-ouro)"/>` +
          `<use href="#${p}-l" fill="url(#${p}-seda)"/>` +
          `</g></g>`
      );
    },
  },

  // ---------------------------------------------------------------- DIVERTIDO
  {
    id: "gibi_pop",
    rotulo: "Gibi pop",
    categoria: "divertido",
    fonte: "luckiest",
    maiusculas: true,
    amostra: "Uau!",
    desenhar: (c, p) => {
      const k = c.corpo;
      const w = c.largura;
      const h = c.altura;
      const contorno = k * 0.06;
      const sx = k * 0.07;
      const sy = k * 0.08;
      const folgaTexto = k * 0.3;
      const fora = k * 0.24;
      const dentro = k * 0.03;
      const linha = k * 0.045;
      const sombraExpl = k * 0.07;
      const a = w / 2 + folgaTexto;
      const b = h / 2 + folgaTexto;
      const ex = a + fora * 1.65 + linha;
      const ey = b + fora * 1.65 + linha;
      const iw = ex * 2 + sombraExpl;
      const ih = ey * 2 + sombraExpl;
      const g = giro(iw, ih, -4);
      const folga = k * 0.03;
      const d = explosao(ex, ey, a, b, k * 0.42, fora, dentro);
      const s = k * 0.13;
      // Retícula a 45° montada à mão num ladrilho reto (rede quadrada + pontos no centro de
      // cada casa), com vários pontos por ladrilho e fill-opacity. Com patternTransform e
      // opacity, frase longa em corpo 200 levava 0,6 s só nos pontinhos: o librsvg reamostra o
      // padrão girado e abre uma camada de transparência por ladrilho.
      const casa = s * Math.SQRT2;
      const L = casa * 5;
      const r = s * 0.22;
      const ponto = (x: number, y: number) => `M${n(x + r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0Z`;
      let reticula = "";
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) reticula += ponto(casa * (i + 0.25), casa * (j + 0.25)) + ponto(casa * (i + 0.75), casa * (j + 0.75));
      return peca(
        g.largura + folga * 2,
        g.altura + folga * 2,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<radialGradient id="${p}-expl" cx="0.5" cy="0.5" r="0.6">` +
          `<stop offset="0" stop-color="#d6f8ff"/><stop offset="1" stop-color="#29c4f0"/></radialGradient>` +
          // Retícula de pontinhos: a textura de impressão de gibi barato, o que diz "cartum" de longe.
          `<pattern id="${p}-pontos" patternUnits="userSpaceOnUse" width="${n(L)}" height="${n(L)}">` +
          `<path d="${reticula}" fill="#0077b8" fill-opacity="0.35"/></pattern>` +
          `<linearGradient id="${p}-amarelo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#fff480"/><stop offset="0.5" stop-color="#ffd400"/><stop offset="1" stop-color="#ff9d00"/></linearGradient>` +
          `</defs>` +
          `<g transform="${g.transform(folga, folga)}" stroke-linejoin="round">` +
          `<path d="${d}" transform="translate(${n(sombraExpl)} ${n(sombraExpl)})" fill="#000"/>` +
          `<path d="${d}" fill="url(#${p}-expl)" stroke="#000" stroke-width="${n(linha * 2)}" paint-order="stroke"/>` +
          `<path d="${d}" fill="url(#${p}-pontos)"/>` +
          `<g transform="translate(${n(ex - w / 2)} ${n(ey - h / 2)})">` +
          // Sombra magenta com contorno preto próprio: no gibi a sombra é um bloco de cor, não um borrão.
          `<use href="#${p}-l" transform="translate(${n(sx)} ${n(sy)})" fill="#000" stroke="#000" stroke-width="${n(contorno * 2)}"/>` +
          `<use href="#${p}-l" transform="translate(${n(sx)} ${n(sy)})" fill="#ff2e8a"/>` +
          `<use href="#${p}-l" fill="#000" stroke="#000" stroke-width="${n(contorno * 2)}"/>` +
          `<use href="#${p}-l" fill="url(#${p}-amarelo)"/>` +
          `</g></g>`
      );
    },
  },
  {
    id: "doce_bolinhas",
    rotulo: "Doce de bolinhas",
    categoria: "divertido",
    fonte: "poppins",
    // Letras um pouco abertas: com contorno grosso a Poppins colava "Agende" num bloco só.
    espacamento: 0.035,
    amostra: "Doce lar",
    desenhar: (c, p) => {
      const k = c.corpo;
      // Biscoito com glacê: o CHOCOLATE é a camada dominante (fio largo e uma queda sólida de
      // biscoito), o branco é só o glacê fino. Com branco grosso e fio marrom de 1 px era o
      // "Adesivo recortado" com outra cor, e a menta pastel sumia contra o próprio branco.
      const branco = k * 0.045;
      const choco = k * 0.06;
      const fio = branco + choco;
      const queda = k * 0.12;
      const w = c.largura;
      const h = c.altura;
      const m = fio + k * 0.03;
      // Bolinhas calculadas uma a uma e só onde o confete INTEIRO cabe dentro da letra com
      // folga: com padrão recortado sobrava meia bolinha na borda (parecia lasca) e bolinha
      // no fio do "e" e do "0" (lia "ʘ", "Θ").
      // As bolinhas saem do TRECHO de tinta de cada linha, não de uma grade: a haste da Poppins
      // tem 0,2 do corpo, e uma grade fixa quase nunca acertava o meio dela (sobravam duas
      // bolinhas na frase inteira).
      const segs = segmentos(c.d);
      const passo = k * 0.24;
      const folgaBorda = k * 0.035;
      const bolinhas: string[] = [];
      let linhaN = 0;
      for (let y = k * 0.1; y < h - k * 0.06; y += k * 0.15, linhaN++) {
        const r = linhaN % 2 === 0 ? k * 0.035 : k * 0.026;
        const alcance = r + folgaBorda;
        // Corda do círculo de folga a 80% do raio pra cima e pra baixo: o confete inteiro, com
        // folga, tem que estar dentro da letra -- senão vira meia bolinha na borda.
        const cima = intervalos(segs, y - alcance * 0.8);
        const baixo = intervalos(segs, y + alcance * 0.8);
        for (const [x0, x1] of intervalos(segs, y)) {
          const livre = x1 - x0 - alcance * 2;
          if (livre < 0) continue;
          const quantas = Math.floor(livre / passo) + 1;
          const sobra = livre - (quantas - 1) * passo;
          for (let i = 0; i < quantas; i++) {
            const s = Math.round(x0 * 7 + y * 13 + i);
            // Nem todo trecho recebe: confete em fila perfeita em toda haste vira colar de contas.
            if (acaso(s) < 0.35) continue;
            const x = x0 + alcance + sobra * (0.2 + 0.6 * acaso(s + 1)) + i * passo;
            if (!cobre(cima, x - alcance * 0.6, x + alcance * 0.6) || !cobre(baixo, x - alcance * 0.6, x + alcance * 0.6)) continue;
            const laranja = acaso(s + 2) < 0.55;
            bolinhas.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(laranja ? r : r * 0.8)}" fill="${laranja ? "#ff7a1a" : "#ffc300"}"/>`);
          }
        }
      }
      const area = `maskUnits="userSpaceOnUse" x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}"`;
      return peca(
        w + m * 2,
        h + m * 2 + queda,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<linearGradient id="${p}-menta" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(h)}">` +
          `<stop offset="0" stop-color="#c8fbe9"/><stop offset="1" stop-color="#3cc9a6"/></linearGradient>` +
          // Realce em crescente na borda de cima: luz de bala, e não uma faixa branca por dentro.
          `<mask id="${p}-realce" ${area}><use href="#${p}-l" fill="#fff"/><use href="#${p}-l" transform="translate(0 ${n(k * 0.05)})" fill="#000"/></mask>` +
          `</defs>` +
          `<g transform="translate(${n(m)} ${n(m)})" stroke-linejoin="round">` +
          `<use href="#${p}-l" transform="translate(0 ${n(queda)})" fill="#3e1c14" stroke="#3e1c14" stroke-width="${n(fio * 2)}"/>` +
          `<use href="#${p}-l" fill="#5a2a1f" stroke="#5a2a1f" stroke-width="${n(fio * 2)}"/>` +
          `<use href="#${p}-l" fill="#fff" stroke="#fff" stroke-width="${n(branco * 2)}"/>` +
          // Fio verde-petróleo entre a letra e o glacê: é ele que desenha a letra no branco.
          `<use href="#${p}-l" fill="#1f7f6d" stroke="#1f7f6d" stroke-width="${n(k * 0.05)}"/>` +
          `<use href="#${p}-l" fill="url(#${p}-menta)"/>` +
          bolinhas.join("") +
          `<rect x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}" fill="#fff" opacity="0.5" mask="url(#${p}-realce)"/>` +
          `</g>`
      );
    },
  },
  {
    id: "placa_cinema",
    rotulo: "Placa de cinema",
    categoria: "divertido",
    // Bebas e não Bungee Shade: na Shade os acentos são blocos vazados e "À", "É", "Ã" saíam
    // iguais ("Ā VENDA"), e a face oca virava ruído de linhas no corpo 40.
    fonte: "bebas",
    maiusculas: true,
    espacamento: 0.06,
    amostra: "Estreia",
    desenhar: (c, p) => {
      const k = c.corpo;
      // Placa escura de cinema com lâmpadas na MOLDURA (as lâmpadas nunca entram na letra --
      // isso é o "Letreiro de lâmpadas" da família brilho). A placa garante a leitura.
      const borda = k * 0.03;
      const moldura = k * 0.17;
      const px = k * 0.36 + moldura;
      const py = k * 0.28 + moldura;
      const bw = c.largura + px * 2;
      const bh = c.altura + py * 2;
      const raio = k * 0.24;
      const folga = k * 0.03;
      const meio = borda + moldura / 2;
      const lampadas = pontosNoRetangulo(meio, meio, bw - meio * 2, bh - meio * 2, Math.max(1, raio - meio), k * 0.3);
      const nucleo = k * 0.042;
      const halo = k * 0.1;
      const desfoque = k * 0.07;
      const luzes = lampadas
        .map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(halo)}" fill="url(#${p}-halo)"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(nucleo)}" fill="#fffbea"/>`)
        .join("");
      const ib = borda + moldura;
      // Sombra dura de letreiro pintado: cinco cópias descendo na diagonal, do cobre ao marrom,
      // com um contorno escuro em volta do bloco inteiro pra ele não borrar na placa.
      const passo = k * 0.012;
      let sombra = "";
      for (let i = 5; i >= 1; i--) {
        const cor = misturar("#9a3a06", "#5a1e02", (i - 1) / 4);
        sombra += `<use href="#${p}-l" transform="translate(${n(i * passo)} ${n(i * passo)})" fill="${cor}"/>`;
      }
      let silhueta = "";
      for (let i = 0; i <= 5; i++) silhueta += `<use href="#${p}-l" transform="translate(${n(i * passo)} ${n(i * passo)})"/>`;
      return peca(
        bw + folga * 2,
        bh + folga * 2,
        `<defs>` +
          `<path id="${p}-l" d="${c.d}"/>` +
          `<linearGradient id="${p}-moldura" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="#ff5a4e"/><stop offset="1" stop-color="#b3123f"/></linearGradient>` +
          `<linearGradient id="${p}-placa" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="#231454"/><stop offset="1" stop-color="#0d0826"/></linearGradient>` +
          `<linearGradient id="${p}-letra" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n(c.altura)}">` +
          `<stop offset="0" stop-color="#fff6c8"/><stop offset="0.5" stop-color="#ffcc3d"/><stop offset="1" stop-color="#ff8a2f"/></linearGradient>` +
          // Halo por gradiente radial em vez de blur: cem lâmpadas com blur ficavam lentas.
          `<radialGradient id="${p}-halo"><stop offset="0" stop-color="#fff3a8" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ffd84a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient>` +
          `<filter id="${p}-brilho" filterUnits="userSpaceOnUse" x="${n(-desfoque * 3)}" y="${n(-desfoque * 3)}" width="${n(c.largura + desfoque * 6)}" height="${n(c.altura + desfoque * 6)}">` +
          `<feGaussianBlur stdDeviation="${n(desfoque)}"/></filter>` +
          `</defs>` +
          `<g transform="translate(${n(folga)} ${n(folga)})">` +
          `<rect width="${n(bw)}" height="${n(bh)}" rx="${n(raio)}" fill="#12040c"/>` +
          `<rect x="${n(borda)}" y="${n(borda)}" width="${n(bw - borda * 2)}" height="${n(bh - borda * 2)}" rx="${n(raio - borda)}" fill="url(#${p}-moldura)"/>` +
          `<rect x="${n(ib)}" y="${n(ib)}" width="${n(bw - ib * 2)}" height="${n(bh - ib * 2)}" rx="${n(Math.max(1, raio - ib))}" fill="#12040c"/>` +
          `<rect x="${n(ib + borda)}" y="${n(ib + borda)}" width="${n(bw - (ib + borda) * 2)}" height="${n(bh - (ib + borda) * 2)}" rx="${n(Math.max(1, raio - ib - borda))}" fill="url(#${p}-placa)"/>` +
          luzes +
          `<g transform="translate(${n(px)} ${n(py)})" stroke-linejoin="round">` +
          `<use href="#${p}-l" fill="#ff9d2e" opacity="0.75" filter="url(#${p}-brilho)"/>` +
          `<g fill="#12040c" stroke="#12040c" stroke-width="${n(k * 0.04)}">${silhueta}</g>` +
          sombra +
          `<use href="#${p}-l" fill="url(#${p}-letra)"/>` +
          `</g></g>`
      );
    },
  },
];
