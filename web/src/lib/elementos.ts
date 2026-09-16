import { FONTE_ARTE, escaparSvg } from "./texto-arte";

// ELEMENTOS: as peças gráficas que entram por cima da cena.
//
// O CapCut tem milhares de adesivos, e quase nenhum serve pra vender imóvel. A ideia
// aqui não é copiar a prateleira: é que o elemento CARREGUE O QUE O ANÚNCIO PRECISA
// DIZER. Por isso a categoria mais importante é "Ficha" -- a barra de ícones com
// quartos, banheiros, vagas e metragem, preenchida com os dados que já estão no imóvel.
// Um adesivo de coração qualquer editor tem; "3 quartos · 2 vagas · 120 m²" desenhado e
// certo é o que um corretor não consegue montar sozinho no celular.
//
// Mesmo caminho dos modelos de texto, e pelo mesmo motivo: o SVG é desenhado UMA vez e
// serve os dois lados. A galeria põe o SVG na tela; o servidor rasteriza o mesmo SVG com
// sharp e sobrepõe no vídeo. O cartão não imita o resultado -- é o resultado.

export type CategoriaElemento = "ficha" | "selo" | "apontar" | "moldura" | "contato";

/**
 * Onde a peça encosta no quadro.
 *
 * Nove âncoras, e não uma posição livre em pixel: no celular ninguém arrasta uma peça
 * pra um lugar exato, e "meio à esquerda" é o que a pessoa quer dizer quando arrasta.
 * Também é o que faz a peça continuar certa quando o vídeo muda de 9:16 pra 1:1.
 */
export type AncoraElemento =
  | "topo_esq" | "topo" | "topo_dir"
  | "meio_esq" | "centro" | "meio_dir"
  | "base_esq" | "base" | "base_dir";

export const ANCORAS: { id: AncoraElemento; rotulo: string }[] = [
  { id: "topo_esq", rotulo: "Canto de cima, à esquerda" },
  { id: "topo", rotulo: "Em cima" },
  { id: "topo_dir", rotulo: "Canto de cima, à direita" },
  { id: "meio_esq", rotulo: "No meio, à esquerda" },
  { id: "centro", rotulo: "No meio" },
  { id: "meio_dir", rotulo: "No meio, à direita" },
  { id: "base_esq", rotulo: "Canto de baixo, à esquerda" },
  { id: "base", rotulo: "Embaixo" },
  { id: "base_dir", rotulo: "Canto de baixo, à direita" },
];

export const CATEGORIAS_ELEMENTO: { id: CategoriaElemento; rotulo: string; para: string }[] = [
  { id: "ficha", rotulo: "Ficha do imóvel", para: "Quartos, vagas e metragem, já preenchidos" },
  { id: "selo", rotulo: "Selos", para: "À venda, vendido, exclusivo, preço" },
  { id: "apontar", rotulo: "Apontar", para: "Seta, círculo e balão pra mostrar um detalhe" },
  { id: "moldura", rotulo: "Molduras", para: "Borda e cantos, pra dar acabamento" },
  { id: "contato", rotulo: "Contato", para: "WhatsApp e bairro" },
];

/** Os ícones que a barra da ficha sabe desenhar. */
export type IconeFicha = "quarto" | "suite" | "banheiro" | "vaga" | "area" | "preco" | "local";

/**
 * Cada ícone como um traço de 24x24.
 *
 * Desenhados aqui, e não importados de uma biblioteca, porque este SVG vai ser
 * rasterizado pelo librsvg no servidor: uma fonte de ícone não existe lá, e o glifo
 * sairia como quadrado vazio -- sem erro nenhum.
 */
const TRACO_ICONE: Record<IconeFicha, string> = {
  quarto: "M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18h18M4 18v2M20 18v2M7 11V8.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V11M13.5 11V8.5a1 1 0 0 1 1-1H17a1 1 0 0 1 1 1V11",
  suite: "M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18h18M4 18v2M20 18v2M12 4l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z",
  banheiro: "M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM7 12V6.5a2.5 2.5 0 0 1 5 0M6 19l-1 2M18 19l1 2",
  vaga: "M5 16h14M6.5 16v2.5M17.5 16v2.5M4 16l1.6-4.8A2 2 0 0 1 7.5 9.8h9a2 2 0 0 1 1.9 1.4L20 16zM7.5 13.2h.5M16 13.2h.5",
  area: "M4 9V4h5M20 15v5h-5M4.5 4.5l5 5M19.5 19.5l-5-5M4 20h5M20 4v5",
  preco: "M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-8 8zM7.5 7.5h.01",
  local: "M12 21.5s6.8-6.2 6.8-11.2a6.8 6.8 0 1 0-13.6 0C5.2 15.3 12 21.5 12 21.5zM12 12.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
};

/** O que o elemento recebe pra se desenhar. */
export type DadosElemento = {
  /** Texto livre (ou o exemplo do modelo, quando ainda não digitaram nada). */
  texto: string;
  /** Os dados da ficha do imóvel, já em palavra: [{ icone, texto }]. */
  itens: { icone: IconeFicha; texto: string }[];
  /** A cor da marca. Entra nos modelos que vestem a casa. */
  cor: string;
};

/** O quadro em que a peça vai entrar. `alt` é o tamanho pedido pra ela. */
export type MedidaElemento = { alt: number; W: number; H: number };

export type ModeloElemento = {
  id: string;
  rotulo: string;
  categoria: CategoriaElemento;
  /** O que ele consome. "ficha" some quando o imóvel não tem os dados. */
  usa: "texto" | "ficha" | "nada";
  /** Texto de exemplo, pro cartão da galeria e pro primeiro clique. */
  exemplo?: string;
  /** Fração da ALTURA do vídeo que a peça ocupa. */
  corpo: number;
  ancora: AncoraElemento;
  /** Peça que vale pelo quadro inteiro (moldura). A âncora não se aplica. */
  quadroInteiro?: boolean;
  desenhar: (d: DadosElemento, m: MedidaElemento) => { svg: string; largura: number; altura: number };
};

const CORAL = "#f06b4f";
const INDIGO = "#0f2d5b";
const ESCURO = "#0b1a2e";

function abrir(l: number, a: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(l)}" height="${Math.ceil(a)}" viewBox="0 0 ${Math.ceil(l)} ${Math.ceil(a)}">`;
}

/** Largura aproximada de um texto nesta família, em fração do corpo da letra. */
function larguraDe(texto: string, corpo: number, peso = 0.56): number {
  return Math.max(corpo * 1.5, Math.round(texto.length * corpo * peso));
}

/** Um ícone do traço acima, desenhado num quadrado de lado `lado` na posição (x, y). */
function icone(nome: IconeFicha, x: number, y: number, lado: number, cor: string): string {
  const e = lado / 24;
  return (
    `<g transform="translate(${x} ${y}) scale(${e})" fill="none" stroke="${cor}" ` +
    `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${TRACO_ICONE[nome]}"/></g>`
  );
}

function letra(texto: string, x: number, y: number, corpo: number, cor: string, extra = ""): string {
  return (
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="700" fill="${cor}" ${extra}>${escaparSvg(texto)}</text>`
  );
}

/** Quando o imóvel não tem ficha nenhuma, o cartão ainda precisa mostrar alguma coisa. */
export const FICHA_EXEMPLO: { icone: IconeFicha; texto: string }[] = [
  { icone: "quarto", texto: "3" },
  { icone: "banheiro", texto: "2" },
  { icone: "vaga", texto: "2" },
  { icone: "area", texto: "120 m²" },
];

export const MODELOS_ELEMENTO: ModeloElemento[] = [
  // ---------------------------------------------------------------- ficha
  {
    id: "ficha_barra",
    rotulo: "Barra da ficha",
    categoria: "ficha",
    usa: "ficha",
    corpo: 0.055,
    ancora: "base",
    // A peça mais útil do catálogo: uma faixa com ícone e número por dado. Responde as
    // quatro perguntas que todo interessado faz, sem ninguém digitar nada.
    desenhar: (d, m) => {
      const h = m.alt;
      const itens = d.itens.length ? d.itens : FICHA_EXEMPLO;
      const corpo = h * 0.42;
      const ico = h * 0.5;
      const folga = h * 0.36;
      const larguras = itens.map((i) => ico + h * 0.16 + larguraDe(i.texto, corpo));
      const l = larguras.reduce((s, x) => s + x, 0) + folga * (itens.length + 1) + folga * (itens.length - 1) * 0.5;
      let x = folga;
      const pecas = itens.map((i, k) => {
        const larguraTexto = larguraDe(i.texto, corpo);
        const g =
          icone(i.icone, x, (h - ico) / 2, ico, "#ffffff") +
          letra(i.texto, x + ico + h * 0.16 + larguraTexto / 2, h / 2, corpo, "#ffffff") +
          (k < itens.length - 1
            ? `<line x1="${x + larguras[k] + folga * 0.75}" y1="${h * 0.28}" x2="${x + larguras[k] + folga * 0.75}" y2="${h * 0.72}" stroke="#ffffff" stroke-opacity="0.32" stroke-width="${h * 0.03}"/>`
            : "");
        x += larguras[k] + folga * 1.5;
        return g;
      });
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(h),
        svg: abrir(l, h) + `<rect width="${Math.ceil(l)}" height="${Math.ceil(h)}" rx="${h / 2}" fill="${ESCURO}" fill-opacity="0.82"/>` + pecas.join("") + `</svg>`,
      };
    },
  },
  {
    id: "ficha_cartao",
    rotulo: "Cartão da ficha",
    categoria: "ficha",
    usa: "ficha",
    corpo: 0.26,
    ancora: "base_esq",
    // Em pé, uma linha por dado. Cabe no canto de um 9:16 sem cobrir o imóvel, e é o
    // formato que sobra quando são cinco ou seis dados e a barra ficaria mais larga que
    // a tela.
    desenhar: (d, m) => {
      const itens = (d.itens.length ? d.itens : FICHA_EXEMPLO).slice(0, 5);
      const linha = m.alt / Math.max(3, itens.length);
      const corpo = linha * 0.4;
      const ico = linha * 0.5;
      const pad = linha * 0.42;
      const maiorTexto = Math.max(...itens.map((i) => larguraDe(i.texto, corpo)));
      const l = pad * 2 + ico + linha * 0.3 + maiorTexto;
      const a = pad * 1.2 + linha * itens.length;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(l, a) +
          `<rect width="${Math.ceil(l)}" height="${Math.ceil(a)}" rx="${linha * 0.3}" fill="${ESCURO}" fill-opacity="0.82"/>` +
          itens
            .map((i, k) => {
              const y = pad * 0.6 + linha * k;
              return (
                icone(i.icone, pad, y + (linha - ico) / 2, ico, d.cor) +
                `<text x="${pad + ico + linha * 0.3}" y="${y + linha / 2}" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="600" fill="#ffffff">${escaparSvg(i.texto)}</text>`
              );
            })
            .join("") +
          `</svg>`,
      };
    },
  },
  {
    id: "metragem",
    rotulo: "Selo de metragem",
    categoria: "ficha",
    usa: "texto",
    exemplo: "120 m²",
    corpo: 0.1,
    ancora: "topo_dir",
    desenhar: (d, m) => {
      const lado = m.alt;
      const corpo = lado * 0.3;
      return {
        largura: Math.ceil(lado),
        altura: Math.ceil(lado),
        svg:
          abrir(lado, lado) +
          `<rect x="${lado * 0.04}" y="${lado * 0.04}" width="${lado * 0.92}" height="${lado * 0.92}" rx="${lado * 0.2}" fill="#ffffff" fill-opacity="0.95"/>` +
          `<rect x="${lado * 0.04}" y="${lado * 0.04}" width="${lado * 0.92}" height="${lado * 0.92}" rx="${lado * 0.2}" fill="none" stroke="${d.cor}" stroke-width="${lado * 0.055}"/>` +
          icone("area", lado * 0.34, lado * 0.16, lado * 0.32, d.cor) +
          letra(d.texto, lado / 2, lado * 0.68, corpo, INDIGO) +
          `</svg>`,
      };
    },
  },

  // ---------------------------------------------------------------- selo
  {
    id: "selo_redondo",
    rotulo: "Selo redondo",
    categoria: "selo",
    usa: "texto",
    exemplo: "À VENDA",
    corpo: 0.13,
    ancora: "topo_dir",
    // Girado sete graus de propósito: selo perfeitamente reto lê como marca d'água de
    // sistema; torto lê como carimbo que alguém pôs.
    desenhar: (d, m) => {
      const lado = m.alt;
      const r = lado * 0.44;
      // A palavra tem que CABER dentro do círculo, e a corda disponível é menor que o
      // diâmetro: o texto fica na altura do centro mas as letras têm altura, então o
      // limite útil é ~1.5r, não 2r. Com o giro de sete graus, menos ainda. "À VENDA"
      // saía cortado na borda -- e cortado não é erro nenhum, é só um selo feio.
      const corda = r * 1.5;
      const porLetra = corda / Math.max(5, d.texto.length + 1);
      const corpo = Math.min(lado * 0.15, porLetra / 0.58);
      return {
        largura: Math.ceil(lado),
        altura: Math.ceil(lado),
        svg:
          abrir(lado, lado) +
          `<g transform="rotate(-7 ${lado / 2} ${lado / 2})">` +
          `<circle cx="${lado / 2}" cy="${lado / 2}" r="${r}" fill="${d.cor}"/>` +
          `<circle cx="${lado / 2}" cy="${lado / 2}" r="${r * 0.86}" fill="none" stroke="#ffffff" stroke-width="${lado * 0.022}" stroke-opacity="0.9"/>` +
          letra(d.texto, lado / 2, lado / 2, corpo, "#ffffff", `letter-spacing="${corpo * 0.03}"`) +
          `</g></svg>`,
      };
    },
  },
  {
    id: "fita_canto",
    rotulo: "Fita de canto",
    categoria: "selo",
    usa: "texto",
    exemplo: "EXCLUSIVO",
    corpo: 0.18,
    ancora: "topo_dir",
    desenhar: (d, m) => {
      const lado = m.alt;
      const faixa = lado * 0.28;
      const corpo = faixa * 0.44;
      return {
        largura: Math.ceil(lado),
        altura: Math.ceil(lado),
        svg:
          abrir(lado, lado) +
          `<g transform="rotate(45 ${lado * 0.72} ${lado * 0.28})">` +
          `<rect x="${lado * 0.72 - lado * 0.62}" y="${lado * 0.28 - faixa / 2}" width="${lado * 1.24}" height="${faixa}" fill="${d.cor}"/>` +
          letra(d.texto, lado * 0.72, lado * 0.28, corpo, "#ffffff", `letter-spacing="${corpo * 0.12}"`) +
          `</g></svg>`,
      };
    },
  },
  {
    id: "etiqueta_preco",
    rotulo: "Etiqueta de preço",
    categoria: "selo",
    usa: "texto",
    exemplo: "R$ 890.000",
    corpo: 0.075,
    ancora: "base_dir",
    // Formato de etiqueta pendurada, com o furo: é a forma que já quer dizer "preço"
    // antes de alguém ler o número.
    desenhar: (d, m) => {
      const h = m.alt;
      const corpo = h * 0.44;
      const bico = h * 0.42;
      const l = bico + larguraDe(d.texto, corpo) + h * 0.9;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(h),
        svg:
          abrir(l, h) +
          `<path d="M${bico} 0 H${l - h * 0.18} a${h * 0.18} ${h * 0.18} 0 0 1 ${h * 0.18} ${h * 0.18} V${h - h * 0.18} a${h * 0.18} ${h * 0.18} 0 0 1 ${-h * 0.18} ${h * 0.18} H${bico} L0 ${h / 2} Z" fill="${d.cor}"/>` +
          `<circle cx="${bico * 0.72}" cy="${h / 2}" r="${h * 0.09}" fill="#ffffff"/>` +
          `<text x="${(l + bico) / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="800" fill="#ffffff">${escaparSvg(d.texto)}</text>` +
          `</svg>`,
      };
    },
  },

  // ---------------------------------------------------------------- apontar
  {
    id: "seta",
    rotulo: "Seta",
    categoria: "apontar",
    usa: "nada",
    corpo: 0.16,
    ancora: "meio_dir",
    // Curva, e não reta: seta reta some na foto de sala: parece parte da moldura de um
    // quadro. A curva não existe em arquitetura, então o olho lê como anotação.
    desenhar: (d, m) => {
      const lado = m.alt;
      const t = lado * 0.11;
      return {
        largura: Math.ceil(lado),
        altura: Math.ceil(lado),
        svg:
          abrir(lado, lado) +
          `<path d="M${lado * 0.86} ${lado * 0.14} Q${lado * 0.62} ${lado * 0.34} ${lado * 0.3} ${lado * 0.72}" fill="none" stroke="${d.cor}" stroke-width="${t}" stroke-linecap="round"/>` +
          `<path d="M${lado * 0.18} ${lado * 0.86} L${lado * 0.26} ${lado * 0.52} L${lado * 0.52} ${lado * 0.74} Z" fill="${d.cor}"/>` +
          `</svg>`,
      };
    },
  },
  {
    id: "circulo_destaque",
    rotulo: "Círculo de destaque",
    categoria: "apontar",
    usa: "nada",
    corpo: 0.3,
    ancora: "centro",
    // Duas voltas ligeiramente diferentes: é o traço de caneta, e é o que faz o círculo
    // parecer marcado à mão em vez de gerado.
    desenhar: (d, m) => {
      const lado = m.alt;
      const t = lado * 0.035;
      const rx = lado * 0.44;
      const ry = lado * 0.3;
      const cx = lado / 2;
      const cy = lado / 2;
      return {
        largura: Math.ceil(lado),
        altura: Math.ceil(lado * 0.72),
        svg:
          abrir(lado, lado * 0.72) +
          `<g transform="translate(0 ${lado * 0.72 / 2 - cy}) rotate(-6 ${cx} ${cy})" fill="none" stroke="${d.cor}" stroke-width="${t}" stroke-linecap="round">` +
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>` +
          `<path d="M${cx - rx * 0.96} ${cy + ry * 0.2} a${rx} ${ry} 0 1 1 ${rx * 1.5} ${-ry * 0.82}" stroke-opacity="0.75"/>` +
          `</g></svg>`,
      };
    },
  },
  {
    id: "balao",
    rotulo: "Balão",
    categoria: "apontar",
    usa: "texto",
    exemplo: "Olha a vista",
    corpo: 0.07,
    ancora: "meio_esq",
    desenhar: (d, m) => {
      const h = m.alt;
      const corpo = h * 0.44;
      const l = larguraDe(d.texto, corpo) + h * 1.1;
      const rabo = h * 0.3;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(h + rabo),
        svg:
          abrir(l, h + rabo) +
          `<rect width="${Math.ceil(l)}" height="${Math.ceil(h)}" rx="${h * 0.36}" fill="#ffffff" fill-opacity="0.96"/>` +
          `<path d="M${h * 0.5} ${h - 1} L${h * 0.5} ${h + rabo} L${h * 1.1} ${h - 1} Z" fill="#ffffff" fill-opacity="0.96"/>` +
          `<text x="${l / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="600" fill="${INDIGO}">${escaparSvg(d.texto)}</text>` +
          `</svg>`,
      };
    },
  },

  // ---------------------------------------------------------------- moldura
  {
    id: "moldura_fina",
    rotulo: "Moldura fina",
    categoria: "moldura",
    usa: "nada",
    corpo: 1,
    ancora: "centro",
    quadroInteiro: true,
    // Vale o quadro inteiro, então ignora `alt` e usa a medida do vídeo. Uma moldura
    // dimensionada por fração de altura sairia retangular num formato e quadrada noutro.
    desenhar: (d, m) => {
      const folga = Math.round(m.H * 0.022);
      const t = Math.max(2, Math.round(m.H * 0.006));
      return {
        largura: m.W,
        altura: m.H,
        svg:
          abrir(m.W, m.H) +
          `<rect x="${folga}" y="${folga}" width="${m.W - folga * 2}" height="${m.H - folga * 2}" rx="${t * 2}" fill="none" stroke="#ffffff" stroke-width="${t}" stroke-opacity="0.85"/>` +
          `</svg>`,
      };
    },
  },
  {
    id: "cantos",
    rotulo: "Cantos",
    categoria: "moldura",
    usa: "nada",
    corpo: 1,
    ancora: "centro",
    quadroInteiro: true,
    desenhar: (d, m) => {
      const folga = Math.round(m.H * 0.028);
      const t = Math.max(3, Math.round(m.H * 0.008));
      const braco = Math.round(m.H * 0.05);
      const x0 = folga;
      const y0 = folga;
      const x1 = m.W - folga;
      const y1 = m.H - folga;
      const c = (a: string) => `<path d="${a}" fill="none" stroke="${d.cor}" stroke-width="${t}" stroke-linecap="round"/>`;
      return {
        largura: m.W,
        altura: m.H,
        svg:
          abrir(m.W, m.H) +
          c(`M${x0} ${y0 + braco} V${y0} H${x0 + braco}`) +
          c(`M${x1 - braco} ${y0} H${x1} V${y0 + braco}`) +
          c(`M${x1} ${y1 - braco} V${y1} H${x1 - braco}`) +
          c(`M${x0 + braco} ${y1} H${x0} V${y1 - braco}`) +
          `</svg>`,
      };
    },
  },

  // ---------------------------------------------------------------- contato
  {
    id: "whatsapp",
    rotulo: "WhatsApp",
    categoria: "contato",
    usa: "texto",
    exemplo: "(11) 99999-9999",
    corpo: 0.058,
    ancora: "base_dir",
    desenhar: (d, m) => {
      const h = m.alt;
      const corpo = h * 0.42;
      const ico = h * 0.52;
      const pad = h * 0.34;
      const l = pad * 2 + ico + h * 0.22 + larguraDe(d.texto, corpo);
      // O verde é o do WhatsApp porque é o que a pessoa reconhece sem ler. O ícone é
      // desenhado aqui (balão com o fone), não o logotipo da empresa.
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(h),
        svg:
          abrir(l, h) +
          `<rect width="${Math.ceil(l)}" height="${Math.ceil(h)}" rx="${h / 2}" fill="#25d366"/>` +
          `<g transform="translate(${pad} ${(h - ico) / 2}) scale(${ico / 24})" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          `<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3.5 20.5l1.6-5A8.5 8.5 0 1 1 21 11.5z"/>` +
          `<path d="M8.8 8.4c.3-.7.6-.7.9-.7h.7c.2 0 .5 0 .7.6l.8 1.9c.1.3 0 .5-.1.7l-.5.6c-.1.2-.2.3 0 .6a7 7 0 0 0 3 2.6c.3.1.5.1.7-.1l.7-.8c.2-.2.4-.2.6-.1l1.8 1c.3.1.4.3.4.5 0 .6-.4 1.6-1.4 1.9-1 .3-2.4.2-4.5-1.1a11 11 0 0 1-3.7-4c-.6-1.1-.7-2.2-.1-3.6z"/>` +
          `</g>` +
          `<text x="${pad + ico + h * 0.22}" y="${h / 2}" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="700" fill="#ffffff">${escaparSvg(d.texto)}</text>` +
          `</svg>`,
      };
    },
  },
  {
    id: "local",
    rotulo: "Bairro",
    categoria: "contato",
    usa: "texto",
    exemplo: "Jardins · São Paulo",
    corpo: 0.052,
    ancora: "topo_esq",
    desenhar: (d, m) => {
      const h = m.alt;
      const corpo = h * 0.44;
      const ico = h * 0.56;
      const pad = h * 0.3;
      const l = pad * 2 + ico + h * 0.18 + larguraDe(d.texto, corpo);
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(h),
        svg:
          abrir(l, h) +
          `<rect width="${Math.ceil(l)}" height="${Math.ceil(h)}" rx="${h * 0.26}" fill="${ESCURO}" fill-opacity="0.8"/>` +
          icone("local", pad, (h - ico) / 2, ico, d.cor) +
          `<text x="${pad + ico + h * 0.18}" y="${h / 2}" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="600" fill="#ffffff">${escaparSvg(d.texto)}</text>` +
          `</svg>`,
      };
    },
  },
];

export const ELEMENTO_POR_ID: Record<string, ModeloElemento> = Object.fromEntries(MODELOS_ELEMENTO.map((e) => [e.id, e]));

/** A cor de marca padrão, quando a pessoa ainda não escolheu uma. */
export const COR_ELEMENTO_PADRAO = CORAL;

/**
 * Onde a peça encosta, em pixels.
 *
 * `topoOcupado` empurra as âncoras de cima pra baixo da faixa de título/preço, que é
 * carimbada depois, na montagem. Sem isso o selo sai por baixo do título -- e isso só
 * aparece no arquivo final, nunca num teste de string.
 */
export function lugarDoElemento(
  ancora: AncoraElemento,
  W: number,
  H: number,
  largura: number,
  altura: number,
  topoOcupado = false
): { x: number; y: number } {
  const m = Math.round(H * 0.04);
  const alto = topoOcupado ? Math.round(H * 0.17) : m;
  const x = ancora.endsWith("_esq") ? m : ancora.endsWith("_dir") ? Math.max(0, W - largura - m) : Math.round((W - largura) / 2);
  const y = ancora.startsWith("topo") ? alto : ancora.startsWith("base") ? Math.max(0, H - altura - m) : Math.round((H - altura) / 2);
  return { x: Math.max(0, x), y: Math.max(0, y) };
}
