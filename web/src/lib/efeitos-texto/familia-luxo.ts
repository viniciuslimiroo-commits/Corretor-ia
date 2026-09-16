import { abrirSvg, fonte, type Contorno, type EfeitoTexto, type FonteId } from "./nucleo";

// FAMÍLIA "LUXO" (e peças de anúncio imobiliário).
//
// Cada efeito aqui é uma PEÇA GRÁFICA, não uma cor: metal com bisel, mármore com veio,
// carimbo gasto, placa com parafuso, fita com dobra, etiqueta com barbante, letra-caixa de
// fachada. A regra de todos: legível em parede branca E em ambiente escuro -- por isso toda
// peça tem ou um fundo próprio (placa, fita, etiqueta) ou um FIO escuro nítido + sombra.
// Fumaça/halo escuro difuso foi reprovado: em parede clara vira mancha cinza suja.
//
// Todas as medidas saem de `c.corpo`: a mesma receita roda no cartão (corpo 40) e no vídeo
// (corpo 200) sem a borda ficar grossa demais num e sumir no outro.

/** Número curto no SVG: duas casas bastam e o arquivo fica bem menor. */
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Sorteio com semente fixa: o mesmo texto sai SEMPRE igual (prévia = exportação). */
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

/** Altura da maiúscula da fonte, em fração do corpo (tabela OS/2). */
function alturaMaiuscula(id: FonteId, reserva: number): number {
  const f = fonte(id);
  const cap = Number(f.tables.os2?.sCapHeight);
  return cap > 0 ? cap / f.unitsPerEm : reserva;
}

/** Brilho de 4 pontas côncavo (o "cintilar" de joia). */
function cintilar(cx: number, cy: number, r: number): string {
  return (
    `M${n(cx)} ${n(cy - r)}Q${n(cx)} ${n(cy)} ${n(cx + r)} ${n(cy)}` +
    `Q${n(cx)} ${n(cy)} ${n(cx)} ${n(cy + r)}Q${n(cx)} ${n(cy)} ${n(cx - r)} ${n(cy)}` +
    `Q${n(cx)} ${n(cy)} ${n(cx)} ${n(cy - r)}Z`
  );
}

/** Estrela de 5 pontas centrada (carimbo). */
function estrela5(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 === 0 ? r : r * 0.42;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${n(cx + raio * Math.cos(ang))} ${n(cy + raio * Math.sin(ang))}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Linha que passa suave pelos pontos (curva pelos pontos médios): veio sem quina de polígono. */
function suave(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    d += `Q${n(pts[i][0])} ${n(pts[i][1])} ${n((pts[i][0] + pts[i + 1][0]) / 2)} ${n((pts[i][1] + pts[i + 1][1]) / 2)}`;
  }
  const u = pts[pts.length - 1];
  return d + `L${n(u[0])} ${n(u[1])}`;
}

/**
 * Envelope do SVG: margens nos quatro lados e o grupo transladado pra caixa do texto
 * começar em (0,0). Cada receita calcula a própria margem a partir do que desenha FORA
 * da letra (placa, fita, sombra) -- margem chutada é como a placa saiu cortada na 1ª folha.
 */
function envelope(c: Contorno, esq: number, cima: number, dir: number, baixo: number, corpo: string, defs: string) {
  const l = c.largura + esq + dir;
  const a = c.altura + cima + baixo;
  return {
    largura: Math.ceil(l),
    altura: Math.ceil(a),
    svg: abrirSvg(l, a) + `<defs>${defs}</defs><g transform="translate(${n(esq)} ${n(cima)})">${corpo}</g></svg>`,
  };
}

/** Meia-largura e meia-altura de um retângulo depois de girado (pra margem de peça inclinada). */
function caixaGirada(meiaL: number, meiaA: number, graus: number) {
  const r = (Math.abs(graus) * Math.PI) / 180;
  return { l: meiaL * Math.cos(r) + meiaA * Math.sin(r), a: meiaL * Math.sin(r) + meiaA * Math.cos(r) };
}

/**
 * Todo desfoque aqui borra UMA cor chapada (sombra, halo, névoa): fazer a conta em sRGB dá o
 * mesmo desenho e pula a conversão pra linearRGB pixel a pixel. Medido no librsvg, frase de
 * 26 letras em corpo 200: halo da fachada 1290 -> 670 ms, placa 1300 -> 600 ms.
 */
const SRGB = 'color-interpolation-filters="sRGB"';

/** Desfoque pra peça PEQUENA (um cintilar): região em fração da própria caixa. */
const blur = (id: string, desvio: number) =>
  `<filter id="${id}" ${SRGB} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(desvio)}"/></filter>`;

/**
 * Desfoque com região EXATA (caixa desenhada + 3 desvios), em coordenada do elemento.
 * Com a região em porcentagem (-50%/200%), uma frase longa ganha meia largura de sobra de
 * cada lado: 4x a área, e o librsvg desfoca pixel a pixel. Medido: frase de 26 letras em
 * corpo 200 passava de 2 s só por isso.
 */
function desfoque(id: string, desvio: number, x: number, y: number, w: number, h: number) {
  const f = desvio * 3;
  return `<filter id="${id}" ${SRGB} filterUnits="userSpaceOnUse" x="${n(x - f)}" y="${n(y - f)}" width="${n(w + f * 2)}" height="${n(h + f * 2)}"><feGaussianBlur stdDeviation="${n(desvio)}"/></filter>`;
}

export const EFEITOS: EfeitoTexto[] = [
  // 1. OURO FOLHEADO -- a letra romana (Cinzel, a "Trajan" de joalheria) em metal: faixa de
  // reflexo no meio da letra, bisel de luz, fio escuro, aro dourado e borda escura por fora.
  // O fio escuro é o que separa o ouro da parede clara; sem ele o dourado some no bege.
  {
    id: "ouro_folheado",
    rotulo: "Ouro folheado",
    categoria: "luxo",
    fonte: "cinzel",
    maiusculas: true,
    espacamento: 0.06,
    amostra: "Exclusivo",
    desenhar: (c, p) => {
      const k = c.corpo;
      const engrosso = k * 0.02; // a Cinzel é fina: o traço dourado engorda a haste
      const fio = k * 0.022;
      const aro = k * 0.03;
      const borda = k * 0.02;
      const ext = engrosso + fio + aro + borda;
      const sy = k * 0.09;
      const sb = k * 0.05;
      const brilhoR = k * 0.2;
      const m = ext + Math.max(sb * 3 + sy, brilhoR * 1.1 + k * 0.12) + 2;
      // O reflexo acompanha a altura da MAIÚSCULA (linha de base pra cima), não a caixa:
      // com "À" ou "É" a caixa cresce e o reflexo sairia do lugar.
      const topo = c.linhaDeBase - k * 0.7;
      const base = c.linhaDeBase + k * 0.02;
      const defs =
        `<linearGradient id="${p}-ouro" gradientUnits="userSpaceOnUse" x1="0" y1="${n(topo)}" x2="0" y2="${n(base)}">` +
        `<stop offset="0" stop-color="#fff7d6"/><stop offset=".2" stop-color="#f7d57e"/><stop offset=".44" stop-color="#c38a2a"/>` +
        `<stop offset=".5" stop-color="#8a5812"/><stop offset=".57" stop-color="#e2ae4c"/><stop offset=".8" stop-color="#ffeaa8"/>` +
        `<stop offset="1" stop-color="#b47b22"/></linearGradient>` +
        // Aro num ouro MAIS ESCURO que o miolo: no mesmo tom, a haste parecia inchada e a
        // serifa fina da Cinzel sumia dentro do aro.
        `<linearGradient id="${p}-aro" gradientUnits="userSpaceOnUse" x1="0" y1="${n(-ext)}" x2="0" y2="${n(c.altura + ext)}">` +
        `<stop offset="0" stop-color="#7a4c10"/><stop offset=".45" stop-color="#d9b064"/><stop offset=".55" stop-color="#8f6118"/>` +
        `<stop offset="1" stop-color="#4a2e06"/></linearGradient>` +
        desfoque(`${p}-sombra`, sb, -ext, -ext, c.largura + ext * 2, c.altura + ext * 2) +
        blur(`${p}-halo`, k * 0.04) +
        `<filter id="${p}-bisel" filterUnits="userSpaceOnUse" x="${n(-engrosso - 2)}" y="${n(-engrosso - 2)}" width="${n(c.largura + engrosso * 2 + 4)}" height="${n(c.altura + engrosso * 2 + 4)}">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(k * 0.022)}" result="b"/>` +
        `<feSpecularLighting in="b" surfaceScale="${n(k * 0.045)}" specularConstant="1" specularExponent="16" lighting-color="#fff4cf" result="s">` +
        `<feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>` +
        `<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>` +
        `<feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/></filter>`;
      const brilhos = [
        { x: c.largura - k * 0.04, y: k * 0.06, r: brilhoR },
        { x: k * 0.08, y: c.altura - k * 0.02, r: brilhoR * 0.6 },
      ];
      const corpo =
        // Sombra mais funda e mais baixa: com .55 a peça parecia colada na parede bege.
        `<path d="${c.d}" transform="translate(0 ${n(sy)})" fill="#140a00" stroke="#140a00" stroke-width="${n(ext * 2)}" stroke-linejoin="round" opacity=".7" filter="url(#${p}-sombra)"/>` +
        `<path d="${c.d}" fill="#24150a" stroke="#24150a" stroke-width="${n(ext * 2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="url(#${p}-aro)" stroke="url(#${p}-aro)" stroke-width="${n((ext - borda) * 2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="#2e1a05" stroke="#2e1a05" stroke-width="${n((engrosso + fio) * 2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="url(#${p}-ouro)" stroke="url(#${p}-ouro)" stroke-width="${n(engrosso * 2)}" stroke-linejoin="round" filter="url(#${p}-bisel)"/>` +
        // Dois cintilares: um grande na ponta de cima da última letra, um menor embaixo da
        // primeira. É o que faz o dourado parecer JOIA e não amarelo.
        // Halo em cada cintilar separado: num grupo só, a caixa do filtro seria a palavra inteira.
        brilhos.map((b) => `<path d="${cintilar(b.x, b.y, b.r * 1.1)}" fill="#ffd36b" opacity=".9" filter="url(#${p}-halo)"/>`).join("") +
        brilhos.map((b) => `<path d="${cintilar(b.x, b.y, b.r)}" fill="#fffdf2"/>`).join("");
      return envelope(c, m, m, m, m, corpo, defs);
    },
  },

  // 2. ASSINATURA -- manuscrito de convite (Great Vibes) em champanhe dourado, com traço de
  // pena embaixo terminando num cintilar. A legibilidade vem de um FIO chocolate nítido em
  // volta da letra e da pena, não de halo escuro: o halo difuso virava nuvem cinza suja
  // embaixo da palavra em parede clara. A letra é champanhe DOURADO (não branco) pra ter
  // valor próprio contra parede branca.
  {
    id: "assinatura_champanhe",
    rotulo: "Assinatura champanhe",
    categoria: "luxo",
    fonte: "great_vibes",
    amostra: "Vista mar",
    desenhar: (c, p) => {
      const k = c.corpo;
      const engrosso = k * 0.022; // a Great Vibes tem haste de fio de cabelo: some em frase longa
      const fio = k * 0.0225; // quanto o chocolate sobra pra fora da letra engrossada
      const fioPena = k * 0.02;
      const b = c.linhaDeBase;
      // Traço de pena: dois arcos com as mesmas pontas, afastados no meio (fino-grosso-fino).
      const x0 = c.largura * 0.06;
      const y0 = b + k * 0.24;
      const x1 = c.largura + k * 0.14;
      const y1 = b + k * 0.06;
      const cx = (x0 + x1) / 2;
      const cy = Math.max(y0, y1) + k * 0.08;
      const t = k * 0.07;
      const traco = `M${n(x0)} ${n(y0)}Q${n(cx)} ${n(cy - t)} ${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy + t)} ${n(x0)} ${n(y0)}Z`;
      const brilhoR = k * 0.11;
      const brilho = cintilar(x1, y1, brilhoR);
      // Sombra curta e quase nítida: dá relevo sem virar mancha.
      const sd = k * 0.012;
      const sx = k * 0.012;
      const sy = k * 0.022;
      const fundoY = Math.max(c.altura, cy + t);
      const m = engrosso + fio + sd * 3 + sy + 2;
      const dir = Math.max(m, x1 - c.largura + brilhoR * 2 + k * 0.035 * 3) + 2;
      const baixo = fundoY - c.altura + fioPena + sd * 3 + sy + 2;
      const defs =
        // Degradê preso na linha de base (e não na caixa): swash alto ou descendente longo
        // não empurra o dourado pra fora das letras.
        `<linearGradient id="${p}-champ" gradientUnits="userSpaceOnUse" x1="0" y1="${n(b - k * 0.72)}" x2="0" y2="${n(b + k * 0.08)}">` +
        `<stop offset="0" stop-color="#fffaf0"/><stop offset=".5" stop-color="#f6e3b0"/><stop offset="1" stop-color="#d9ae5f"/></linearGradient>` +
        `<linearGradient id="${p}-pena" gradientUnits="userSpaceOnUse" x1="${n(x0)}" y1="0" x2="${n(x1)}" y2="0">` +
        `<stop offset="0" stop-color="#b98434"/><stop offset=".35" stop-color="#e6b85c"/><stop offset=".8" stop-color="#ffe4a0"/><stop offset="1" stop-color="#d6a043"/></linearGradient>` +
        desfoque(`${p}-sombra`, sd, -k * 0.08, -k * 0.08, Math.max(c.largura, x1) + k * 0.16, fundoY + k * 0.16) +
        blur(`${p}-luz`, k * 0.035);
      const corpo =
        `<g transform="translate(${n(sx)} ${n(sy)})" opacity=".45" filter="url(#${p}-sombra)" fill="#2a1a08" stroke="#2a1a08" stroke-linejoin="round">` +
        `<path d="${traco}" stroke-width="${n(fioPena * 2)}"/><path d="${c.d}" stroke-width="${n((engrosso + fio) * 2)}"/></g>` +
        // Pena com o mesmo fio da letra por baixo: dourado puro some em parede branca.
        `<path d="${traco}" fill="#3b2610" stroke="#3b2610" stroke-width="${n(fioPena * 2)}" stroke-linejoin="round" opacity=".9"/>` +
        `<path d="${traco}" fill="url(#${p}-pena)"/>` +
        `<path d="${c.d}" fill="#3b2610" stroke="#3b2610" stroke-width="${n((engrosso + fio) * 2)}" stroke-linejoin="round" opacity=".9"/>` +
        `<path d="${c.d}" fill="url(#${p}-champ)" stroke="url(#${p}-champ)" stroke-width="${n(engrosso * 2)}" stroke-linejoin="round"/>` +
        `<path d="${brilho}" fill="#ffd77a" filter="url(#${p}-luz)"/>` +
        `<path d="${brilho}" fill="#fffaf0" stroke="#3b2610" stroke-width="${n(k * 0.012)}" stroke-linejoin="round" paint-order="stroke"/>`;
      return envelope(c, m, m, dir, baixo, corpo, defs);
    },
  },

  // 3. CAPA DE REVISTA -- Didone de capa (Abril Fatface) em marfim com fio preto e sombra
  // 3D em HACHURA rosé: a sombra de gravura de revista impressa. Nada de brilho difuso,
  // é linguagem de papel. O corpo da sombra é escuro e as listras são rosé de propósito:
  // em parede branca lê o escuro, em fundo escuro lê a listra -- listra preta sozinha
  // sumia por completo no cartão escuro da galeria.
  {
    id: "capa_revista",
    rotulo: "Capa de revista",
    categoria: "luxo",
    fonte: "abril",
    maiusculas: true,
    espacamento: 0.03,
    amostra: "Cobertura",
    desenhar: (c, p) => {
      const k = c.corpo;
      const fio = k * 0.028;
      const desloc = k * 0.08;
      const passo = k * 0.05; // distância entre listras da hachura
      // Abaixo de 3,5 px a listra fica com menos de 2 px, dá moiré e vira borrão marrom:
      // no tamanho pequeno a sombra sai chapada no tom médio da hachura.
      const hachura = passo >= 3.5;
      const m = fio * 1.6 + desloc + 3;
      const tr = `transform="translate(${n(desloc)} ${n(desloc)})"`;
      // Hachura como LINHAS de verdade recortadas na sombra, não <pattern>: o padrão girado
      // custou 830 ms numa frase longa em corpo 200 no librsvg; as linhas, 130 ms.
      const hx = -fio * 1.6;
      const hy = -fio * 1.6 + desloc;
      const hw = c.largura + fio * 3.2 + desloc;
      const hh = c.altura + fio * 3.2;
      let linhas = "";
      if (hachura) for (let x = hx - hh; x < hx + hw; x += passo) linhas += `M${n(x)} ${n(hy + hh)}L${n(x + hh)} ${n(hy)}`;
      const defs = hachura ? `<clipPath id="${p}-sombra"><path d="${c.d}" ${tr}/></clipPath>` : "";
      const corpo =
        `<path d="${c.d}" ${tr} fill="#111" stroke="#111" stroke-width="${n(fio * 3.2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" ${tr} fill="#1a1414" stroke="#1a1414" stroke-width="${n(fio * 2)}" stroke-linejoin="round"/>` +
        (hachura
          ? `<g clip-path="url(#${p}-sombra)"><path d="${linhas}" stroke="#d99a88" stroke-width="${n(passo * 0.354)}"/></g>`
          : `<path d="${c.d}" ${tr} fill="#a9685a"/>`) +
        `<path d="${c.d}" fill="#111" stroke="#111" stroke-width="${n(fio * 2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="#fbf6ea"/>`;
      return envelope(c, m, m, m, m, corpo, defs);
    },
  },

  // 4. MINIMALISTA ESPAÇADO -- a assinatura de empreendimento: caixa alta bem aberta entre
  // dois fios DOURADOS com losango. Sem caixa nem fumaça atrás (a fumaça virava retângulo
  // cinza de PowerPoint na parede branca, e deixava o efeito igual à placa). A leitura vem de
  // camadas nítidas: contorno escuro fino na letra, sombra curta, e cada fio dourado com um
  // fio escuro por baixo -- dourado sozinho some na parede clara, escuro sozinho no cartão.
  {
    id: "minimal_espacado",
    rotulo: "Minimalista espaçado",
    categoria: "luxo",
    fonte: "poppins",
    maiusculas: true,
    espacamento: 0.24,
    amostra: "Alto padrão",
    desenhar: (c, p) => {
      const k = c.corpo;
      const contorno = k * 0.05;
      const keyH = k * 0.034;
      const fioH = k * 0.014;
      const yCima = -k * 0.3;
      const yBaixo = c.altura + k * 0.3;
      const los = k * 0.06;
      const meio = c.largura / 2;
      const fx0 = -k * 0.3;
      const fx1 = c.largura + k * 0.3;
      const vao = los * 2.2;
      const barra = (y: number, h: number, grad: string) =>
        `<rect x="${n(fx0)}" y="${n(y - h / 2)}" width="${n(meio - vao - fx0)}" height="${n(h)}" fill="url(#${grad})"/>` +
        `<rect x="${n(meio + vao)}" y="${n(y - h / 2)}" width="${n(fx1 - meio - vao)}" height="${n(h)}" fill="url(#${grad})"/>`;
      const fioLinha = (y: number) =>
        barra(y, keyH, `${p}-sob`) +
        barra(y, fioH, `${p}-fio`) +
        `<path d="M${n(meio)} ${n(y - los)}L${n(meio + los)} ${n(y)}L${n(meio)} ${n(y + los)}L${n(meio - los)} ${n(y)}Z" fill="#d9b46a" stroke="#0c0e13" stroke-width="${n(k * 0.012)}" stroke-linejoin="round"/>`;
      // O fio esmaece numa distância fixa em corpo, não em fração da largura: com frase
      // longa a fração viraria meio metro de degradê.
      const esm = Math.min(0.4, (k * 0.8) / (fx1 - fx0));
      const grad = (id: string, cor: string, op: number) =>
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(fx0)}" y1="0" x2="${n(fx1)}" y2="0">` +
        `<stop offset="0" stop-color="${cor}" stop-opacity="0"/><stop offset="${n(esm)}" stop-color="${cor}" stop-opacity="${op}"/>` +
        `<stop offset="${n(1 - esm)}" stop-color="${cor}" stop-opacity="${op}"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient>`;
      const defs = grad(`${p}-fio`, "#d9b46a", 1) + grad(`${p}-sob`, "#0c0e13", 0.55);
      // Sombra macia SEM desfoque: três traços concêntricos bem transparentes somam um
      // degradê em degraus. O desfoque de verdade custava 700 ms numa frase longa em corpo
      // 200 (é por pixel); traço custa por contorno.
      const degraus = [3, 2, 1]
        .map((i) => `<path d="${c.d}" fill="#000" fill-opacity=".12" stroke="#000" stroke-opacity=".12" stroke-width="${n(contorno + k * 0.03 * i)}" stroke-linejoin="round"/>`)
        .join("");
      const corpo =
        `<g transform="translate(0 ${n(k * 0.04)})">${degraus}</g>` +
        fioLinha(yCima) +
        fioLinha(yBaixo) +
        `<path d="${c.d}" fill="#0c0e13" stroke="#0c0e13" stroke-width="${n(contorno)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="#fff"/>`;
      const lado = k * 0.3 + 2;
      const vert = k * 0.3 + los + k * 0.012 + 2;
      return envelope(c, lado, vert, lado, vert + k * 0.02, corpo, defs);
    },
  },

  // 5. MÁRMORE NEGRO -- letra pesada (Archivo Black) em mármore Nero Marquina com filete de
  // latão escuro. Mármore ESCURO de propósito: mármore branco sumiria na parede branca.
  // Os veios são VETOR sorteado com semente fixa, não feTurbulence: ruído + deslocamento
  // levou 1,1 s numa faixa de 1400 px no librsvg, e ainda saía com cara de mancha.
  //
  // O que separa mármore de "vidro trincado": veio ORGÂNICO (passeio aleatório com desvio
  // lateral, não curva lisa), espessura que varia ao longo do veio, névoa em volta, galhos
  // finos em outras direções, e nenhuma linha atravessando reta. A Archivo tem miolo largo:
  // na Anton condensada o veio não cabia e virava ruído.
  {
    id: "marmore_negro",
    rotulo: "Mármore negro",
    categoria: "luxo",
    fonte: "archivo",
    maiusculas: true,
    espacamento: 0.06,
    amostra: "Mansão",
    desenhar: (c, p) => {
      const k = c.corpo;
      const L = c.largura;
      const H = c.altura;
      // Piso de 1,1 px: no cartão (corpo 40) o filete proporcional dava 0,7 px e sumia.
      const filete = Math.max(1.1, k * 0.018);
      const borda = k * 0.014;
      const ext = filete + borda;
      const sb = k * 0.045;
      const sy = k * 0.05;
      const m = ext + sb * 3 + sy + 2;
      const r = sorteio(917);

      // Passeio aleatório: passo curto, desvio lateral pequeno e direção que DERIVA devagar.
      // Desvio grande a cada passo fazia zigue-zague de raio -- é o que lia como trinca.
      const passeio = (x: number, y: number, ang: number, passos: number, passo: number, desvio: number) => {
        const pts: [number, number][] = [[x, y]];
        let a = ang;
        for (let i = 0; i < passos; i++) {
          a = Math.max(ang - 0.26, Math.min(ang + 0.26, a + (r() - 0.5) * 0.22));
          const lat = (r() - 0.5) * 2 * desvio;
          x += Math.cos(a) * passo - Math.sin(a) * lat;
          y += Math.sin(a) * passo + Math.cos(a) * lat;
          pts.push([x, y]);
          if (y > H + k * 0.15 || y < -k * 0.3 || x > L + k * 0.3) break;
        }
        return pts;
      };
      // Todos os veios numa diagonal só (35°, ±15° por veio): é o que dá cara de chapa cortada.
      const diag = (35 * Math.PI) / 180;
      const var15 = (15 * Math.PI) / 180;
      // Cada veio com um PESO: poucos grossos, muitos finos. Todos iguais = risco de vidro.
      const veios: { d: string; w: number }[] = [];
      const finos: string[] = [];
      const passoV = k * 0.06;
      const inicio = -(H + k * 0.3) / Math.tan(diag - var15) - k * 0.2;
      for (let x = inicio; x < L + k * 0.1; x += k * (0.3 + r() * 0.65)) {
        const ang = diag + (r() - 0.5) * 2 * var15;
        const sorte = r();
        const w = sorte < 0.3 ? 1 : sorte < 0.7 ? 0.6 : 0.35;
        const pts = passeio(x, -k * 0.15, ang, Math.ceil((H + k * 0.4) / (Math.sin(diag - var15) * passoV)) + 2, passoV, k * 0.012);
        veios.push({ d: suave(pts), w });
        if (k < 60) continue; // no cartão o fio fino vira ruído
        // Fio companheiro: corre ao lado do veio por um trecho, como os feixes do mármore.
        if (r() < 0.6) {
          const i0 = Math.floor(r() * pts.length * 0.5);
          const off = k * (0.04 + r() * 0.07) * (r() < 0.5 ? 1 : -1);
          const [bx, by] = pts[i0];
          finos.push(suave(passeio(bx - Math.sin(ang) * off, by + Math.cos(ang) * off, ang, 8 + Math.floor(r() * 14), passoV, k * 0.01)));
        }
        // Galhos: 2 a 3 por veio, saindo do veio para outra direção e morrendo.
        const qtd = 2 + Math.floor(r() * 2);
        for (let g = 0; g < qtd; g++) {
          const base = pts[Math.floor(r() * pts.length)];
          const ag = ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6);
          finos.push(suave(passeio(base[0], base[1], ag, 5 + Math.floor(r() * 10), k * 0.045, k * 0.01)));
        }
      }
      const camada = (largura: number, extra = "") =>
        veios.map((v) => `<path d="${v.d}" stroke-width="${n(Math.max(0.6, largura * v.w))}"${extra}/>`).join("");
      // Trecho grosso tracejado com início sorteado por veio: a espessura varia ao longo do veio.
      const tracos = veios
        .filter((v) => v.w > 0.5)
        .map((v) => `<path d="${v.d}" stroke-width="${n(k * 0.022 * v.w)}" stroke-dashoffset="${n(r() * k * 0.45)}"/>`)
        .join("");
      // Nuvens da pedra: manchas cinza bem fracas ao longo da diagonal. Sem elas a pedra é um
      // preto chapado e o veio fica "desenhado em cima", não DENTRO da pedra.
      let nuvens = "";
      for (let x = r() * k * 0.6; x < L; x += k * (0.9 + r() * 0.9)) {
        nuvens += `<ellipse cx="${n(x)}" cy="${n(H * (0.2 + r() * 0.6))}" rx="${n(k * (0.5 + r() * 0.5))}" ry="${n(k * (0.18 + r() * 0.18))}" transform="rotate(35 ${n(x)} ${n(H / 2)})" fill="url(#${p}-nuvem)"/>`;
      }
      // Reflexo de pedra polida: faixa diagonal de borda DURA (degradê suave lia como vidro).
      let reflexo = "";
      const faixas = Math.max(1, Math.round(L / (k * 7)));
      for (let i = 0; i < faixas; i++) {
        const fx = (L * (i + 0.3)) / faixas;
        const w = k * 0.35;
        const inc = H * 0.45;
        reflexo += `M${n(fx + inc)} ${n(-ext)}L${n(fx + inc + w)} ${n(-ext)}L${n(fx - inc + w)} ${n(H + ext)}L${n(fx - inc)} ${n(H + ext)}Z`;
      }
      const bisel = k * 0.012;
      const defs =
        `<clipPath id="${p}-letra"><path d="${c.d}"/></clipPath>` +
        `<linearGradient id="${p}-pedra" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(k * 0.4)}" y2="${n(H)}"><stop offset="0" stop-color="#3a3c43"/><stop offset=".5" stop-color="#1e1f24"/><stop offset="1" stop-color="#0f0f12"/></linearGradient>` +
        `<radialGradient id="${p}-nuvem"><stop offset="0" stop-color="#7a7f88" stop-opacity=".22"/><stop offset="1" stop-color="#7a7f88" stop-opacity="0"/></radialGradient>` +
        // Latão escuro e filete fino: não repetir o aro de ouro do "Ouro folheado".
        `<linearGradient id="${p}-latao" gradientUnits="userSpaceOnUse" x1="0" y1="${n(-ext)}" x2="${n(k * 0.3)}" y2="${n(H + ext)}">` +
        `<stop offset="0" stop-color="#b8893a"/><stop offset=".55" stop-color="#a27631"/><stop offset="1" stop-color="#6e4a12"/></linearGradient>` +
        desfoque(`${p}-sombra`, sb, -ext, -ext, L + ext * 2, H + ext * 2) +
        // A névoa só existe dentro da letra (recorte): região = caixa do texto, sem sobra.
        `<filter id="${p}-nevoa" ${SRGB} filterUnits="userSpaceOnUse" x="0" y="0" width="${n(L)}" height="${n(H)}"><feGaussianBlur stdDeviation="${n(k * 0.02)}"/></filter>`;
      const corpo =
        `<path d="${c.d}" transform="translate(0 ${n(sy)})" fill="#000" stroke="#000" stroke-width="${n(ext * 2)}" stroke-linejoin="round" opacity=".55" filter="url(#${p}-sombra)"/>` +
        `<path d="${c.d}" fill="#0e0b06" stroke="#0e0b06" stroke-width="${n(ext * 2)}" stroke-linejoin="round"/>` +
        `<path d="${c.d}" fill="url(#${p}-latao)" stroke="url(#${p}-latao)" stroke-width="${n(filete * 2)}" stroke-linejoin="round"/>` +
        `<g clip-path="url(#${p}-letra)">` +
        `<rect x="${n(-ext)}" y="${n(-ext)}" width="${n(L + ext * 2)}" height="${n(H + ext * 2)}" fill="url(#${p}-pedra)"/>` +
        nuvens +
        `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
        `<g filter="url(#${p}-nevoa)" stroke="#8d939c" stroke-opacity=".3">${camada(k * 0.06)}</g>` +
        `<g stroke="#e9e6df" stroke-opacity=".8">${camada(k * 0.012)}</g>` +
        `<g stroke="#e9e6df" stroke-opacity=".5" stroke-dasharray="${n(k * 0.3)} ${n(k * 0.15)}">${tracos}</g>` +
        (finos.length
          ? `<g stroke="#dcd8d0" stroke-opacity=".45" stroke-width="${n(Math.max(0.7, k * 0.005))}">${finos.map((d) => `<path d="${d}"/>`).join("")}</g>`
          : "") +
        `</g>` +
        `<path d="${reflexo}" fill="#fff" fill-opacity=".08"/>` +
        // Bisel da chapa: aresta de luz em cima/esquerda e de sombra embaixo/direita. É o que
        // desenha a letra quando o fundo também é escuro.
        `<path d="${c.d}" transform="translate(${n(bisel)} ${n(bisel)})" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="${n(Math.max(1, bisel * 2))}"/>` +
        `<path d="${c.d}" transform="translate(${n(-bisel)} ${n(-bisel)})" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="${n(Math.max(1, bisel * 2.5))}"/></g>`;
      return envelope(c, m, m, m, m, corpo, defs);
    },
  },

  // 6. CARIMBO -- tinta vermelha, moldura dupla, estrelas e falha de tinta. Girado, como
  // carimbo batido à mão. Fonte Archivo Black: a Rubik Mono desenha o "À" com cara de "Ä",
  // e "À VENDA" é justamente o que o corretor escreve.
  //
  // A falha de tinta é VETOR sorteado (grão em cachos, manchas granuladas e riscos
  // interrompidos), não feTurbulence: o ruído do librsvg custa por pixel e o carimbo de
  // frase longa em corpo 200 levou 12 s. Vetor custa por grão, contado pela área em corpo².
  {
    id: "carimbo_vendido",
    rotulo: "Carimbo",
    categoria: "imovel",
    fonte: "archivo",
    maiusculas: true,
    espacamento: 0.04,
    amostra: "Vendido",
    desenhar: (c, p) => {
      const k = c.corpo;
      const tinta = "#d8233f";
      const grossa = k * 0.08;
      const fina = k * 0.028;
      const folga = k * 0.05;
      const estR = k * 0.13;
      const padX = k * 0.26 + estR * 2;
      const padY = k * 0.2;
      const ix = -padX;
      const iy = -padY;
      const iw = c.largura + padX * 2;
      const ih = c.altura + padY * 2;
      const o = fina / 2 + folga + grossa / 2;
      const ox = ix - o;
      const oy = iy - o;
      const ow = iw + o * 2;
      const oh = ih + o * 2;
      // Inclinação pelo tamanho: palavra curta a -7°, frase longa perto de -3°. Com -7° fixo
      // a frase virava uma tira diagonal alta demais no vídeo 9:16.
      const ang = -Math.max(2.5, 7 * Math.min(1, (k * 5.5) / c.largura));
      const cx = c.largura / 2;
      const cy = c.altura / 2;
      const g = caixaGirada(ow / 2 + grossa / 2, oh / 2 + grossa / 2, ang);
      const mx = g.l - c.largura / 2 + 3;
      const my = g.a - c.altura / 2 + 3;

      const r = sorteio(31);
      const area = ((ow + grossa) * (oh + grossa)) / (k * k);
      const bx = ox - grossa / 2;
      const by = oy - grossa / 2;
      const bw = ow + grossa;
      const bh = oh + grossa;
      let graos = "";
      const grao = (x: number, y: number, raio: number) => {
        // Grão irregular de 6 pontas: círculo perfeito denuncia que é desenho.
        const a0 = r() * Math.PI;
        for (let i = 0; i < 6; i++) {
          const a = a0 + (i * Math.PI) / 3 + (r() - 0.5) * 0.6;
          const rr = raio * (0.55 + r() * 0.6);
          graos += `${i ? "L" : "M"}${n(x + rr * Math.cos(a))} ${n(y + rr * Math.sin(a))}`;
        }
        graos += "Z";
      };
      // Cachos: falha de carimbo não é uniforme, junta onde a borracha pegou menos tinta.
      for (let i = 0; i < Math.ceil(area * 1.8); i++) {
        const qx = bx + r() * bw;
        const qy = by + r() * bh;
        const qtd = 8 + Math.floor(r() * 14);
        for (let j = 0; j < qtd; j++) {
          const d = k * 0.32 * (r() + r()) * 0.5;
          const a = r() * Math.PI * 2;
          grao(qx + d * Math.cos(a), qy + d * Math.sin(a) * 0.7, k * (0.008 + Math.pow(r(), 2.2) * 0.04));
        }
      }
      // Grão solto no resto.
      for (let i = 0; i < Math.ceil(area * 22); i++) grao(bx + r() * bw, by + r() * bh, k * (0.005 + Math.pow(r(), 3) * 0.03));
      // Manchas de pouca tinta: um cacho LARGO e ralo (1/3 da densidade dos cachos) em vez de
      // degradê radial -- o degradê deixava borrão de aerógrafo dentro da letra; o cacho ralo
      // tem borda granulada, que é como a borracha falha de verdade.
      for (let i = 0; i < Math.ceil(area * 0.18); i++) {
        const qx = bx + r() * bw;
        const qy = by + r() * bh;
        const rx = k * (0.35 + r() * 0.5);
        const ry = k * (0.2 + r() * 0.25);
        const qtd = Math.ceil(((Math.PI * rx * ry) / (k * k)) * 60);
        for (let j = 0; j < qtd; j++) {
          const d = r(); // raio uniforme = mais denso no centro, ralo na borda
          const a = r() * Math.PI * 2;
          grao(qx + d * rx * Math.cos(a), qy + d * ry * Math.sin(a), k * (0.007 + Math.pow(r(), 2) * 0.028));
        }
      }
      // Riscos de borracha gasta: cada risco em 3 trechos de espessura diferente e tracejado
      // sorteado. Risco contínuo e uniforme parecia arranhão de scanner.
      let riscos = "";
      for (let i = 0; i < Math.max(1, Math.round(bw / (k * 4))); i++) {
        const x = bx + r() * bw;
        const P = [
          [x, by],
          [x + k * 0.3, by + bh * 0.5],
          [x + k * (0.2 + r() * 0.5), by + bh],
        ];
        // Pedaço [a,b] de uma quadrática continua quadrática: ponto de controle pelo "blossom".
        const q = (t: number, u: number, j: 0 | 1) => P[0][j] * (1 - t) * (1 - u) + P[1][j] * ((1 - t) * u + t * (1 - u)) + P[2][j] * t * u;
        for (let s = 0; s < 3; s++) {
          const a = s / 3;
          const b = (s + 1) / 3;
          const tr1 = k * (0.1 + r() * 0.3);
          const bur1 = k * (0.05 + r() * 0.15);
          const tr2 = k * (0.1 + r() * 0.3);
          const bur2 = k * (0.05 + r() * 0.15);
          riscos +=
            `<path d="M${n(q(a, a, 0))} ${n(q(a, a, 1))}Q${n(q(a, b, 0))} ${n(q(a, b, 1))} ${n(q(b, b, 0))} ${n(q(b, b, 1))}" ` +
            `stroke-width="${n(k * (0.006 + r() * 0.014))}" stroke-dasharray="${n(tr1)} ${n(bur1)} ${n(tr2)} ${n(bur2)}" stroke-dashoffset="${n(r() * k * 0.5)}"/>`;
        }
      }
      const reg = `x="${n(bx - 1)}" y="${n(by - 1)}" width="${n(bw + 2)}" height="${n(bh + 2)}"`;
      const defs =
        `<mask id="${p}-gasto" maskUnits="userSpaceOnUse" ${reg}><rect ${reg} fill="#fff"/>` +
        `<path d="${graos}" fill="#000"/><g fill="none" stroke="#000" stroke-linecap="round">${riscos}</g></mask>`;
      const corpo =
        `<g transform="rotate(${n(ang)} ${n(cx)} ${n(cy)})"><g mask="url(#${p}-gasto)" fill="${tinta}">` +
        `<rect x="${n(ox)}" y="${n(oy)}" width="${n(ow)}" height="${n(oh)}" rx="${n(k * 0.08)}" fill="none" stroke="${tinta}" stroke-width="${n(grossa)}"/>` +
        `<rect x="${n(ix)}" y="${n(iy)}" width="${n(iw)}" height="${n(ih)}" rx="${n(k * 0.03)}" fill="none" stroke="${tinta}" stroke-width="${n(fina)}"/>` +
        `<path d="${estrela5(-padX / 2, cy, estR)}"/><path d="${estrela5(c.largura + padX / 2, cy, estR)}"/>` +
        `<path d="${c.d}"/></g></g>`;
      return envelope(c, mx, my, mx, my, corpo, defs);
    },
  },

  // 7. PLACA DE IMÓVEL -- placa esmaltada azul-marinho com aro de latão, bisel no esmalte,
  // filete interno, dois parafusos e brilho de esmalte em cima. A placa É o fundo: lê em
  // qualquer cena.
  {
    id: "placa_imovel",
    rotulo: "Placa de imóvel",
    categoria: "imovel",
    fonte: "poppins",
    maiusculas: true,
    espacamento: 0.04,
    amostra: "À venda",
    desenhar: (c, p) => {
      const k = c.corpo;
      // Parafuso grande o bastante pra ler como parafuso (com k*0.085 virava bolinha de enfeite).
      const parR = k * 0.11;
      const inset = k * 0.12;
      const padX = inset + k * 0.12 + parR * 2 + k * 0.2;
      const padY = k * 0.34;
      const x0 = -padX;
      const y0 = -padY;
      const w = c.largura + padX * 2;
      const h = c.altura + padY * 2;
      const aro = k * 0.05;
      const sb = k * 0.08;
      const sy = k * 0.08;
      const cy = c.altura / 2;
      const parafuso = (x: number, rot: number) =>
        `<circle cx="${n(x)}" cy="${n(cy + k * 0.015)}" r="${n(parR)}" fill="#000" opacity=".45"/>` +
        `<circle cx="${n(x)}" cy="${n(cy)}" r="${n(parR)}" fill="url(#${p}-latao)" stroke="#3a2a0c" stroke-width="${n(k * 0.01)}"/>` +
        `<rect x="${n(x - parR * 0.75)}" y="${n(cy - k * 0.015)}" width="${n(parR * 1.5)}" height="${n(k * 0.03)}" rx="${n(k * 0.008)}" fill="#4a3510" transform="rotate(${rot} ${n(x)} ${n(cy)})"/>`;
      // Bisel do esmalte: fio claro na metade de cima e escuro na de baixo, logo dentro do aro.
      const bi = aro / 2 + k * 0.03;
      const bisel = `x="${n(x0 + bi)}" y="${n(y0 + bi)}" width="${n(w - bi * 2)}" height="${n(h - bi * 2)}" rx="${n(k * 0.1)}" fill="none" stroke-width="${n(k * 0.012)}"`;
      const defs =
        `<linearGradient id="${p}-esmalte" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#23548a"/><stop offset="1" stop-color="#0c2440"/></linearGradient>` +
        `<linearGradient id="${p}-brilho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".48" stop-color="#fff" stop-opacity=".07"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="${p}-aro" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="0" y2="${n(y0 + h)}"><stop offset="0" stop-color="#f7e2a4"/><stop offset=".5" stop-color="#b8862f"/><stop offset=".52" stop-color="#e9c877"/><stop offset="1" stop-color="#7a5418"/></linearGradient>` +
        `<radialGradient id="${p}-latao" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3c6"/><stop offset=".5" stop-color="#c79a3e"/><stop offset="1" stop-color="#6d4c14"/></radialGradient>` +
        `<clipPath id="${p}-cima"><rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h / 2)}"/></clipPath>` +
        `<clipPath id="${p}-baixo"><rect x="${n(x0)}" y="${n(y0 + h / 2)}" width="${n(w)}" height="${n(h / 2)}"/></clipPath>` +
        desfoque(`${p}-sombra`, sb, x0, y0 + sy, w, h);
      const corpo =
        `<rect x="${n(x0)}" y="${n(y0 + sy)}" width="${n(w)}" height="${n(h)}" rx="${n(k * 0.14)}" fill="#000" opacity=".5" filter="url(#${p}-sombra)"/>` +
        `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" rx="${n(k * 0.14)}" fill="url(#${p}-esmalte)" stroke="url(#${p}-aro)" stroke-width="${n(aro)}"/>` +
        `<rect ${bisel} stroke="#fff" stroke-opacity=".35" clip-path="url(#${p}-cima)"/>` +
        `<rect ${bisel} stroke="#04101f" stroke-opacity=".5" clip-path="url(#${p}-baixo)"/>` +
        `<rect x="${n(x0 + inset)}" y="${n(y0 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2)}" rx="${n(k * 0.06)}" fill="none" stroke="#e9cf8a" stroke-opacity=".85" stroke-width="${n(k * 0.016)}"/>` +
        `<rect x="${n(x0 + aro / 2)}" y="${n(y0 + aro / 2)}" width="${n(w - aro)}" height="${n(h - aro)}" rx="${n(k * 0.12)}" fill="url(#${p}-brilho)"/>` +
        parafuso(x0 + inset + k * 0.12 + parR, 35) +
        parafuso(x0 + w - inset - k * 0.12 - parR, -20) +
        `<path d="${c.d}" fill="#061426" opacity=".75" transform="translate(0 ${n(k * 0.03)})"/>` +
        `<path d="${c.d}" fill="#fff"/>`;
      const lado = padX + aro / 2 + sb * 3 + 2;
      return envelope(c, lado, padY + aro / 2 + Math.max(0, sb * 3 - sy) + 2, lado, padY + aro / 2 + sb * 3 + sy + 2, corpo, defs);
    },
  },

  // 8. FAIXA DE LANÇAMENTO -- fita de cetim VINHO com pontas dobradas em V, costura dourada,
  // brilho de cetim e letra cursiva (Pacifico) branca. Levemente inclinada: fita "colada" no
  // vídeo. Vinho e ouro (não vermelho vivo): vermelho vivo lia como clipart e repetia a cor
  // do carimbo lado a lado na galeria.
  {
    id: "faixa_lancamento",
    rotulo: "Faixa de lançamento",
    categoria: "imovel",
    fonte: "pacifico",
    amostra: "Lançamento",
    desenhar: (c, p) => {
      const k = c.corpo;
      const padX = k * 0.4;
      const padY = k * 0.12;
      const x0 = -padX;
      const x1 = c.largura + padX;
      const y0 = -padY;
      const y1 = c.altura + padY;
      const H = y1 - y0;
      const queda = H * 0.3;
      const rabo = H * 0.7;
      const dentro = H * 0.45;
      const corte = H * 0.28;
      const ang = -4;
      const bordaW = k * 0.02;
      // Geometria separada da pintura: a sombra usa as MESMAS formas (sombra retangular
      // debaixo de fita recortada em V aparece como uma caixa cinza na parede).
      const formaRabo = (lado: 1 | -1) => {
        const xa = lado < 0 ? x0 : x1;
        const xi = xa - lado * dentro;
        const xe = xa + lado * rabo;
        const ya = y0 + queda;
        const yb = y1 + queda;
        return `M${n(xi)} ${n(ya)}L${n(xe)} ${n(ya)}L${n(xe - lado * corte)} ${n((ya + yb) / 2)}L${n(xe)} ${n(yb)}L${n(xi)} ${n(yb)}Z`;
      };
      const formaDobra = (lado: 1 | -1) => {
        const xa = lado < 0 ? x0 : x1;
        return `M${n(xa)} ${n(y1)}L${n(xa - lado * dentro * 0.55)} ${n(y1)}L${n(xa)} ${n(y1 + queda)}Z`;
      };
      const formaFaixa = `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;
      const g = caixaGirada((x1 - x0) / 2 + rabo, H / 2 + queda, ang);
      const sb = k * 0.05;
      const mx = g.l - c.largura / 2 + sb * 3 + bordaW + 2;
      const my = g.a - c.altura / 2 + sb * 3 + k * 0.06 + bordaW + 2;
      const costura = (y: number) =>
        `<line x1="${n(x0 + k * 0.08)}" y1="${n(y)}" x2="${n(x1 - k * 0.08)}" y2="${n(y)}" stroke="#e3bf6a" stroke-opacity=".85" stroke-width="${n(k * 0.016)}" stroke-dasharray="${n(k * 0.07)} ${n(k * 0.045)}"/>`;
      // Fio de borda: sem ele a fita se mistura com fundo vermelho ou madeira escura.
      const fioBorda = `fill="none" stroke="#2a030b" stroke-width="${n(bordaW)}" stroke-linejoin="round"`;
      const defs =
        `<linearGradient id="${p}-fita" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="0" y2="${n(y1)}"><stop offset="0" stop-color="#8c1a2e"/><stop offset=".5" stop-color="#6a0f22"/><stop offset="1" stop-color="#420816"/></linearGradient>` +
        `<linearGradient id="${p}-rabo" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0 + queda)}" x2="0" y2="${n(y1 + queda)}"><stop offset="0" stop-color="#5a0c1c"/><stop offset="1" stop-color="#2e040c"/></linearGradient>` +
        // Brilho de cetim: uma faixa clara horizontal no terço de cima, que acende e apaga.
        `<linearGradient id="${p}-cetim" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0 + H * 0.18)}" x2="0" y2="${n(y0 + H * 0.32)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
      // Sombra SEM desfoque: cinco contornos concêntricos bem transparentes. A fita é girada, e
      // o desfoque de peça girada é feito na caixa de tela dela inteira (3100x830 px numa frase
      // longa em corpo 200): passava de 2 s. Contorno custa por contorno, não por pixel. Um
      // path só com as três formas: a sobreposição rabo/fita não escurece em dobro.
      const silhueta = formaRabo(-1) + formaRabo(1) + formaFaixa;
      const sombra = [5, 4, 3, 2, 1]
        .map((i) => `<path d="${silhueta}" fill-opacity=".13" stroke-opacity=".13" stroke-width="${n(sb * 0.6 * i)}"/>`)
        .join("");
      const corpo =
        `<g transform="rotate(${ang} ${n(c.largura / 2)} ${n(c.altura / 2)})">` +
        `<g fill="#000" stroke="#000" stroke-linejoin="round" transform="translate(0 ${n(k * 0.06)})">${sombra}</g>` +
        `<path d="${formaRabo(-1)}" fill="url(#${p}-rabo)"/><path d="${formaRabo(1)}" fill="url(#${p}-rabo)"/>` +
        `<path d="${formaRabo(-1)}" ${fioBorda}/><path d="${formaRabo(1)}" ${fioBorda}/>` +
        `<path d="${formaDobra(-1)}" fill="#1f0309"/><path d="${formaDobra(1)}" fill="#1f0309"/>` +
        `<path d="${formaFaixa}" fill="url(#${p}-fita)"/>` +
        `<rect x="${n(x0)}" y="${n(y0 + H * 0.18)}" width="${n(x1 - x0)}" height="${n(H * 0.14)}" fill="url(#${p}-cetim)"/>` +
        `<path d="${formaFaixa}" ${fioBorda}/>` +
        costura(y0 + H * 0.1) +
        costura(y1 - H * 0.1) +
        `<path d="${c.d}" fill="#1e0208" transform="translate(${n(k * 0.02)} ${n(k * 0.04)})"/>` +
        `<path d="${c.d}" fill="#fff"/></g>`;
      return envelope(c, mx, my, mx, my, corpo, defs);
    },
  },

  // 9. ETIQUETA DE PREÇO -- etiqueta de papel kraft com ponta cortada, ilhós de latão com
  // furo de verdade (máscara), LAÇO de barbante passando pelo furo e perfuração pontilhada.
  // Letra condensada (Bebas) pra caber "R$ 1.250.000" sem a etiqueta virar faixa.
  {
    id: "etiqueta_preco",
    rotulo: "Etiqueta de preço",
    categoria: "imovel",
    fonte: "bebas",
    maiusculas: true,
    espacamento: 0.03,
    amostra: "R$ 890.000",
    desenhar: (c, p) => {
      const k = c.corpo;
      const padY = k * 0.2;
      const y0 = -padY;
      const y1 = c.altura + padY;
      const H = y1 - y0;
      const my0 = (y0 + y1) / 2;
      const pontaW = H * 0.42;
      const furoR = k * 0.06;
      const ilhosR = furoR * 1.75;
      const hx = -(k * 0.2 + ilhosR);
      const xl = hx - ilhosR - pontaW * 0.35 - pontaW;
      const xr = c.largura + k * 0.3;
      const raio = k * 0.035;
      const forma = `M${n(xl)} ${n(my0)}L${n(xl + pontaW)} ${n(y0)}L${n(xr)} ${n(y0)}L${n(xr)} ${n(y1)}L${n(xl + pontaW)} ${n(y1)}Z`;
      const d = k * 0.075;
      const perfur = `M${n(xl + d * 2.2)} ${n(my0)}L${n(xl + pontaW + d * 0.4)} ${n(y0 + d)}L${n(xr - d)} ${n(y0 + d)}L${n(xr - d)} ${n(y1 - d)}L${n(xl + pontaW + d * 0.4)} ${n(y1 - d)}Z`;
      // Barbante em LAÇO fechado: sai do furo, sobe até o topo do laço e volta ao furo por
      // outra curva. Ponta solta no ar parecia erro de recorte no vídeo. As duas curvas chegam
      // no topo com a mesma tangente, então o laço é redondo em cima e aperta no ilhós.
      const ax = xl - k * 0.35;
      const ay = y0 - k * 0.55;
      const vx = ax - hx;
      const vy = ay - my0;
      const vl = Math.hypot(vx, vy);
      const nx = (-vy / vl) * k * 0.18;
      const ny = (vx / vl) * k * 0.18;
      const c1 = [hx + vx * 0.35, my0 + vy * 0.35];
      const laco =
        `M${n(hx)} ${n(my0)}C${n(c1[0] + nx)} ${n(c1[1] + ny)} ${n(ax + nx)} ${n(ay + ny)} ${n(ax)} ${n(ay)}` +
        `C${n(ax - nx)} ${n(ay - ny)} ${n(c1[0] - nx)} ${n(c1[1] - ny)} ${n(hx)} ${n(my0)}`;
      const sb = k * 0.05;
      const sy = k * 0.06;
      const ang = -3;
      // Margem medida girando os pontos de verdade em volta do ilhós (o laço e a ponta
      // direita mudam de lugar com o giro; margem chutada cortava o laço).
      const th = (ang * Math.PI) / 180;
      let minX = 0;
      let minY = 0;
      let maxX = c.largura;
      let maxY = c.altura;
      const inclui = (x: number, y: number, folga: number, extraBaixo = 0) => {
        const gx = hx + (x - hx) * Math.cos(th) - (y - my0) * Math.sin(th);
        const gy = my0 + (x - hx) * Math.sin(th) + (y - my0) * Math.cos(th);
        minX = Math.min(minX, gx - folga);
        maxX = Math.max(maxX, gx + folga);
        minY = Math.min(minY, gy - folga);
        maxY = Math.max(maxY, gy + folga + extraBaixo);
      };
      const folgaEtiqueta = raio + sb * 3 + 2;
      for (const [x, y] of [[xl, my0], [xl + pontaW, y0], [xr, y0], [xr, y1], [xl + pontaW, y1]]) inclui(x, y, folgaEtiqueta, sy);
      for (const [x, y] of [[ax, ay], [ax + nx, ay + ny], [ax - nx, ay - ny], [c1[0] + nx, c1[1] + ny], [c1[0] - nx, c1[1] - ny]]) inclui(x, y, k * 0.03 + 2);
      const defs =
        `<linearGradient id="${p}-kraft" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="${n(k * 0.2)}" y2="${n(y1)}"><stop offset="0" stop-color="#f3e2c0"/><stop offset="1" stop-color="#d7b986"/></linearGradient>` +
        `<radialGradient id="${p}-latao" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff0c2"/><stop offset=".55" stop-color="#c29436"/><stop offset="1" stop-color="#6a4812"/></radialGradient>` +
        `<mask id="${p}-furo" maskUnits="userSpaceOnUse" x="${n(xl - k)}" y="${n(y0 - k)}" width="${n(xr - xl + k * 2)}" height="${n(H + k * 2)}">` +
        `<rect x="${n(xl - k)}" y="${n(y0 - k)}" width="${n(xr - xl + k * 2)}" height="${n(H + k * 2)}" fill="#fff"/><circle cx="${n(hx)}" cy="${n(my0)}" r="${n(furoR)}" fill="#000"/></mask>` +
        desfoque(`${p}-sombra`, sb, xl - raio, y0 - raio, xr - xl + raio * 2, H + raio * 2);
      const corpo =
        `<g transform="rotate(${ang} ${n(hx)} ${n(my0)})">` +
        `<path d="${forma}" transform="translate(0 ${n(sy)})" fill="#000" opacity=".45" stroke="#000" stroke-width="${n(raio * 2)}" stroke-linejoin="round" filter="url(#${p}-sombra)"/>` +
        `<g mask="url(#${p}-furo)">` +
        // Borda mais escura que o kraft: na parede bege o papel quase some sem ela.
        `<path d="${forma}" fill="url(#${p}-kraft)" stroke="#8a6636" stroke-width="${n(raio * 2)}" stroke-linejoin="round"/>` +
        `<path d="${forma}" fill="url(#${p}-kraft)"/>` +
        `<path d="${perfur}" fill="none" stroke="#8a6a3c" stroke-opacity=".7" stroke-width="${n(k * 0.014)}" stroke-dasharray="${n(k * 0.04)} ${n(k * 0.03)}"/>` +
        `<circle cx="${n(hx)}" cy="${n(my0)}" r="${n(ilhosR)}" fill="url(#${p}-latao)" stroke="#5a3d0e" stroke-width="${n(k * 0.008)}"/></g>` +
        // Barbante em três camadas: contorno quase preto (lê no claro), corpo de sisal e um
        // fio claro no meio (lê no escuro).
        `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="${laco}" stroke="#1a1208" stroke-width="${n(k * 0.04)}"/>` +
        `<path d="${laco}" stroke="#a8844f" stroke-width="${n(k * 0.026)}"/>` +
        `<path d="${laco}" stroke="#e8d2a8" stroke-width="${n(k * 0.012)}"/></g>` +
        `<path d="${c.d}" fill="#fff" fill-opacity=".45" transform="translate(0 ${n(k * 0.015)})"/>` +
        `<path d="${c.d}" fill="#3a2410"/></g>`;
      return envelope(c, -minX, -minY, maxX - c.largura, maxY - c.altura, corpo, defs);
    },
  },

  // 10. FACHADA ILUMINADA -- letra-caixa de fachada de empreendimento, com LED atrás: letra
  // em metal escovado grafite, halo quente na parede em volta e sombra fina. É o único luxo
  // que aguenta os dois extremos pelo motivo certo: na parede branca lê a letra ESCURA, no
  // ambiente escuro lê o HALO. E não repete ouro, vermelho nem placa.
  {
    id: "fachada_iluminada",
    rotulo: "Fachada iluminada",
    categoria: "luxo",
    fonte: "anton",
    maiusculas: true,
    espacamento: 0.1,
    amostra: "Residencial",
    desenhar: (c, p) => {
      const k = c.corpo;
      const L = c.largura;
      const H = c.altura;
      const haloD = k * 0.12; // halo largo, a luz batendo na parede
      const haloT = k * 0.09;
      const nucT = k * 0.022; // núcleo: a borda de LED logo atrás da letra
      const m = haloT / 2 + haloD * 3 + 2;
      // O metal é desenhado na altura da MAIÚSCULA: acento não empurra a faixa de brilho.
      const capH = alturaMaiuscula("anton", 0.86) * k;
      const topo = c.linhaDeBase - capH;
      const base = c.linhaDeBase;
      // Escovado: fios horizontais finos, claros e escuros alternados, recortados na letra.
      const r = sorteio(211);
      let claros = "";
      let escuros = "";
      for (let y = 0; y < H; y += k * 0.018) {
        const x = -k * 0.1 + r() * k * 0.5;
        const seg = `M${n(x)} ${n(y)}H${n(L + k * 0.1)}`;
        if (r() < 0.5) claros += seg;
        else escuros += seg;
      }
      const defs =
        `<clipPath id="${p}-letra"><path d="${c.d}"/></clipPath>` +
        `<linearGradient id="${p}-grafite" gradientUnits="userSpaceOnUse" x1="0" y1="${n(topo)}" x2="0" y2="${n(base)}">` +
        `<stop offset="0" stop-color="#5a5e66"/><stop offset=".36" stop-color="#3f434a"/><stop offset=".44" stop-color="#8e949d"/>` +
        `<stop offset=".5" stop-color="#474b52"/><stop offset=".78" stop-color="#26282d"/><stop offset="1" stop-color="#1c1e22"/></linearGradient>` +
        desfoque(`${p}-halo`, haloD, -haloT / 2, -haloT / 2, L + haloT, H + haloT);
      // Só o halo largo é desfoque de verdade. O núcleo e a sombra são traços concêntricos
      // transparentes: cada desfoque a mais custava uma passada na imagem inteira (frase de 26
      // letras em corpo 200 passava de 1,4 s) e, embaixo do halo, o degrau não aparece.
      const nucleo = [3, 2, 1]
        .map((i) => `<path d="${c.d}" stroke-width="${n(nucT * i)}"/>`)
        .join("");
      const corpo =
        `<path d="${c.d}" fill="#ffcf7a" stroke="#ffcf7a" stroke-width="${n(haloT)}" stroke-linejoin="round" filter="url(#${p}-halo)"/>` +
        `<g fill="#fff0c8" fill-opacity=".3" stroke="#fff0c8" stroke-opacity=".3" stroke-linejoin="round">${nucleo}</g>` +
        `<g transform="translate(${n(k * 0.02)} ${n(k * 0.035)})" fill="#000" fill-opacity=".2" stroke="#000" stroke-opacity=".2" stroke-linejoin="round">` +
        `<path d="${c.d}" stroke-width="${n(k * 0.024)}"/><path d="${c.d}" stroke-width="0"/></g>` +
        // Lateral da letra-caixa: lábio claro em cima e escuro embaixo, a espessura da chapa.
        `<path d="${c.d}" transform="translate(0 ${n(-k * 0.01)})" fill="#b4bac3"/>` +
        `<path d="${c.d}" transform="translate(0 ${n(k * 0.014)})" fill="#08090b"/>` +
        `<path d="${c.d}" fill="url(#${p}-grafite)"/>` +
        `<g clip-path="url(#${p}-letra)" stroke-width="${n(k * 0.006)}">` +
        `<path d="${claros}" stroke="#fff" stroke-opacity=".07"/><path d="${escuros}" stroke="#000" stroke-opacity=".14"/></g>`;
      return envelope(c, m, m, m, m + k * 0.035, corpo, defs);
    },
  },
];
