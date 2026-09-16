import type { CategoriaTexto } from "./video";

// MODELOS DE TEXTO como PEÇA GRÁFICA, não como cor trocada.
//
// Por que existe: o `drawtext` do ffmpeg desenha UMA camada de letra com, no máximo, uma
// caixa, um contorno e uma sombra. Com isso dá pra variar cor e acabamento -- e foi o que
// a primeira versão fez. O resultado foi honesto e inútil: vinte cartões que eram a mesma
// caixa em cores diferentes. Modelo de texto de verdade é contorno duplo, brilho, relevo,
// adesivo com borda, fita torta, colchete, degradê. Nada disso cabe num drawtext.
//
// A saída é DESENHAR EM SVG. E o ponto que faz a coisa valer: o MESMO gerador serve os
// dois lados -- a galeria põe o SVG na tela, o servidor rasteriza o mesmo SVG com sharp e
// sobrepõe no vídeo. O cartão não é uma imitação do resultado; é o resultado.
//
// A fonte do SVG é a mesma família que o resto do produto usa, com as substitutas do
// sistema atrás. Diferença de meio pixel na largura da letra não importa aqui: o texto é
// centrado e a caixa acompanha, então não existe quebra de linha pra divergir.

export const FONTE_ARTE = "Geist, 'Segoe UI', 'DejaVu Sans', Verdana, Arial, sans-serif";

/** Escapa o que o corretor digitou pra entrar no meio de um SVG sem quebrar nada. */
export function escaparSvg(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type ModeloArte = {
  id: string;
  /** O que aparece no cartão da galeria quando não há texto do imóvel. */
  exemplo: string;
  categoria: CategoriaTexto;
  /** Fração da altura do vídeo que o corpo da letra ocupa. */
  corpo: number;
  /**
   * Desenha o SVG inteiro, já dimensionado.
   *
   * `alt` é a altura em pixels que o desenho deve ter; a largura sai do texto. Devolve
   * `{ svg, largura, altura }` porque quem sobrepõe precisa saber o tamanho pra centrar.
   */
  desenhar: (texto: string, alt: number) => { svg: string; largura: number; altura: number };
};

/** Largura aproximada de um texto nesta família, em fração do corpo da letra. */
function larguraDe(texto: string, corpo: number, peso = 0.56): number {
  return Math.max(corpo * 2, Math.round(texto.length * corpo * peso));
}

/** O cabeçalho do SVG, com a caixa já no tamanho certo. */
function abrir(l: number, a: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}" viewBox="0 0 ${l} ${a}">`;
}

/** Um <text> centrado na caixa, com os atributos comuns. */
function letra(texto: string, l: number, a: number, corpo: number, extra: string): string {
  return (
    `<text x="${l / 2}" y="${a / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="800" ${extra}>${escaparSvg(texto)}</text>`
  );
}

export const MODELOS_ARTE: ModeloArte[] = [
  {
    id: "adesivo",
    exemplo: "À VENDA",
    categoria: "status",
    corpo: 0.042,
    // Adesivo: preenchimento sólido, borda branca grossa e sombra dura deslocada. É o
    // recorte de papel -- lê em qualquer foto porque a borda branca separa da cena.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 1.4;
      const a = corpo * 2;
      const r = corpo * 0.45;
      const d = corpo * 0.14;
      return {
        largura: Math.ceil(l + d),
        altura: Math.ceil(a + d),
        svg:
          abrir(Math.ceil(l + d), Math.ceil(a + d)) +
          `<rect x="${d}" y="${d}" width="${l}" height="${a}" rx="${r}" fill="#0b1a2e" opacity="0.45"/>` +
          `<rect x="0" y="0" width="${l}" height="${a}" rx="${r}" fill="#f06b4f" stroke="#ffffff" stroke-width="${corpo * 0.12}"/>` +
          letra(texto, l, a, corpo, `fill="#ffffff" letter-spacing="${corpo * 0.03}"`) +
          `</svg>`,
      };
    },
  },
  {
    id: "contorno_duplo",
    exemplo: "LANÇAMENTO",
    categoria: "status",
    corpo: 0.05,
    // Dois contornos: o de fora escuro e grosso, o de dentro branco. É o que faz letra
    // branca sobreviver em parede branca sem precisar de caixa tapando a foto.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo;
      const a = corpo * 1.9;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          letra(texto, l, a, corpo, `fill="none" stroke="#0b1a2e" stroke-width="${corpo * 0.3}" stroke-linejoin="round"`) +
          letra(texto, l, a, corpo, `fill="none" stroke="#ffffff" stroke-width="${corpo * 0.14}" stroke-linejoin="round"`) +
          letra(texto, l, a, corpo, `fill="#f5c451"`) +
          `</svg>`,
      };
    },
  },
  {
    id: "relevo",
    exemplo: "VENDIDO",
    categoria: "status",
    corpo: 0.06,
    // Relevo: seis cópias deslocadas em diagonal, escurecendo, e a letra por cima. É o
    // 3D barato -- e é exatamente como se faz extrusão sem motor 3D.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo;
      const a = corpo * 2;
      const camadas = Array.from({ length: 6 }, (_, i) => {
        const o = (i + 1) * corpo * 0.045;
        return `<g transform="translate(${o} ${o})">${letra(texto, l, a, corpo, `fill="#6e1c12"`)}</g>`;
      }).join("");
      return {
        largura: Math.ceil(l + corpo * 0.3),
        altura: Math.ceil(a + corpo * 0.3),
        svg: abrir(Math.ceil(l + corpo * 0.3), Math.ceil(a + corpo * 0.3)) + camadas + letra(texto, l, a, corpo, `fill="#f06b4f" stroke="#ffffff" stroke-width="${corpo * 0.05}"`) + `</svg>`,
      };
    },
  },
  {
    id: "brilho",
    exemplo: "EXCLUSIVO",
    categoria: "status",
    corpo: 0.045,
    // Brilho: a mesma letra borrada por baixo, duas vezes, na cor do brilho. Dá o halo
    // de néon sem filtro de imagem -- e o borrão é do próprio SVG, não do vídeo.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 1.5;
      const a = corpo * 2.2;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          `<defs><filter id="b1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${corpo * 0.18}"/></filter>` +
          `<filter id="b2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${corpo * 0.07}"/></filter></defs>` +
          `<g filter="url(#b1)">${letra(texto, l, a, corpo, `fill="#2cb1a3"`)}</g>` +
          `<g filter="url(#b2)">${letra(texto, l, a, corpo, `fill="#7ff0e2"`)}</g>` +
          letra(texto, l, a, corpo, `fill="#ffffff"`) +
          `</svg>`,
      };
    },
  },
  {
    id: "fita",
    exemplo: "ÚLTIMAS UNIDADES",
    categoria: "urgencia",
    corpo: 0.032,
    // Fita: faixa levemente torta com as pontas chanfradas, como selo de promoção. A
    // inclinação é de 3 graus -- mais que isso e o texto fica difícil de ler no celular.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 2.4;
      const a = corpo * 2;
      const c = corpo * 0.5;
      const margem = Math.ceil(l * 0.06);
      return {
        largura: Math.ceil(l + margem * 2),
        altura: Math.ceil(a + margem),
        svg:
          abrir(Math.ceil(l + margem * 2), Math.ceil(a + margem)) +
          `<g transform="rotate(-3 ${(l + margem * 2) / 2} ${(a + margem) / 2}) translate(${margem} ${margem / 2})">` +
          `<path d="M0 0 H${l} L${l - c} ${a / 2} L${l} ${a} H0 L${c} ${a / 2} Z" fill="#c0392b"/>` +
          letra(texto, l, a, corpo, `fill="#ffffff" letter-spacing="${corpo * 0.06}"`) +
          `</g></svg>`,
      };
    },
  },
  {
    id: "sublinhado",
    exemplo: "Aceita financiamento",
    categoria: "condicao",
    corpo: 0.034,
    // Uma barra grossa por baixo, na cor da marca. O mais discreto do conjunto: serve
    // onde a foto já é o assunto e o texto só confirma.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 0.6;
      const a = corpo * 2.1;
      const barra = corpo * 0.16;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          letra(texto, l, a * 0.86, corpo, `fill="#ffffff" stroke="#0b1a2e" stroke-width="${corpo * 0.08}" paint-order="stroke"`) +
          `<rect x="${l * 0.12}" y="${a - barra * 1.8}" width="${l * 0.76}" height="${barra}" rx="${barra / 2}" fill="#2cb1a3"/>` +
          `</svg>`,
      };
    },
  },
  {
    id: "colchetes",
    exemplo: "PRONTO PRA MORAR",
    categoria: "condicao",
    corpo: 0.034,
    // Colchetes grossos dos dois lados. Emoldura sem tapar, e dá ar de etiqueta técnica
    // -- combina com ficha, metragem, número.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 4;
      const a = corpo * 2;
      const t = corpo * 0.12;
      const g = corpo * 0.45;
      const y0 = a * 0.2;
      const y1 = a * 0.8;
      const col = (x: number, dir: 1 | -1) =>
        `<path d="M${x + dir * g} ${y0} H${x} V${y1} H${x + dir * g}" fill="none" stroke="#f5c451" stroke-width="${t}" stroke-linecap="square"/>`;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          col(corpo * 0.5, 1) +
          col(l - corpo * 0.5, -1) +
          letra(texto, l, a, corpo, `fill="#ffffff" letter-spacing="${corpo * 0.04}"`) +
          `</svg>`,
      };
    },
  },
  {
    id: "degrade",
    exemplo: "R$ 890.000",
    categoria: "chamada",
    corpo: 0.07,
    // Degradê no preenchimento, do coral ao índigo, com contorno branco fino. É o
    // acabamento pro PREÇO: o número é o que a pessoa procura, e ele pode gritar.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo, 0.6) + corpo;
      const a = corpo * 1.8;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          `<defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c451"/><stop offset="1" stop-color="#f06b4f"/></linearGradient></defs>` +
          letra(texto, l, a, corpo, `fill="none" stroke="#0b1a2e" stroke-width="${corpo * 0.22}" stroke-linejoin="round"`) +
          letra(texto, l, a, corpo, `fill="url(#dg)" stroke="#ffffff" stroke-width="${corpo * 0.045}"`) +
          `</svg>`,
      };
    },
  },
  {
    id: "placa",
    exemplo: "Chame no WhatsApp",
    categoria: "chamada",
    corpo: 0.03,
    // Placa: retângulo claro com uma tarja de cor à esquerda. É a cara de aviso, e é o
    // que funciona pra chamada -- destaca sem competir com a foto.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 2.2;
      const a = corpo * 2.1;
      const tarja = corpo * 0.36;
      const r = corpo * 0.22;
      return {
        largura: Math.ceil(l),
        altura: Math.ceil(a),
        svg:
          abrir(Math.ceil(l), Math.ceil(a)) +
          `<rect x="0" y="0" width="${l}" height="${a}" rx="${r}" fill="#ffffff"/>` +
          `<path d="M0 ${r} a${r} ${r} 0 0 1 ${r} -${r} h${tarja - r} v${a} h-${tarja - r} a${r} ${r} 0 0 1 -${r} -${r} Z" fill="#1f8f4e"/>` +
          `<text x="${tarja + corpo * 0.5}" y="${a / 2}" text-anchor="start" dominant-baseline="central" font-family="${FONTE_ARTE}" font-size="${corpo}" font-weight="700" fill="#0b1a2e">${escaparSvg(texto)}</text>` +
          `</svg>`,
      };
    },
  },
  {
    id: "carimbo",
    exemplo: "RESERVADO",
    categoria: "status",
    corpo: 0.038,
    // Carimbo: moldura dupla vazada e leve rotação, como aquele carimbo de borracha. É
    // o acabamento certo pra "Vendido" e "Reservado" -- e só pra eles.
    desenhar: (texto, alt) => {
      const corpo = alt;
      const l = larguraDe(texto, corpo) + corpo * 2;
      const a = corpo * 2.3;
      const margem = Math.ceil(l * 0.05);
      const t = corpo * 0.1;
      return {
        largura: Math.ceil(l + margem * 2),
        altura: Math.ceil(a + margem * 2),
        svg:
          abrir(Math.ceil(l + margem * 2), Math.ceil(a + margem * 2)) +
          `<g transform="rotate(-8 ${(l + margem * 2) / 2} ${(a + margem * 2) / 2}) translate(${margem} ${margem})" opacity="0.92">` +
          `<rect x="0" y="0" width="${l}" height="${a}" rx="${corpo * 0.18}" fill="none" stroke="#c0392b" stroke-width="${t * 1.6}"/>` +
          `<rect x="${t * 2}" y="${t * 2}" width="${l - t * 4}" height="${a - t * 4}" rx="${corpo * 0.12}" fill="none" stroke="#c0392b" stroke-width="${t * 0.6}"/>` +
          letra(texto, l, a, corpo, `fill="#c0392b" letter-spacing="${corpo * 0.1}"`) +
          `</g></svg>`,
      };
    },
  },
];

export const ARTE_POR_ID = Object.fromEntries(MODELOS_ARTE.map((m) => [m.id, m])) as Record<string, ModeloArte>;
