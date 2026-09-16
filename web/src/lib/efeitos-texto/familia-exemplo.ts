import { abrirSvg, type EfeitoTexto } from "./nucleo";

// Família de EXEMPLO: um efeito só, pra provar que o núcleo e a folha funcionam juntos.
// Não entra no catálogo do produto.

export const EFEITOS: EfeitoTexto[] = [
  {
    id: "exemplo_contorno",
    rotulo: "Exemplo · contorno",
    categoria: "classico",
    fonte: "luckiest",
    maiusculas: true,
    amostra: "Casa",
    desenhar: (c, p) => {
      const borda = c.corpo * 0.16;
      const sombra = c.corpo * 0.07;
      const m = borda + sombra + 4;
      const l = c.largura + m * 2;
      const a = c.altura + m * 2;
      return {
        largura: l,
        altura: a,
        svg:
          abrirSvg(l, a) +
          `<defs><linearGradient id="${p}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#ff9f1c"/></linearGradient></defs>` +
          `<g transform="translate(${m} ${m})">` +
          `<path d="${c.d}" transform="translate(${sombra} ${sombra})" fill="#000" stroke="#000" stroke-width="${borda * 2}" stroke-linejoin="round" opacity="0.55"/>` +
          `<path d="${c.d}" fill="#1b1b1b" stroke="#1b1b1b" stroke-width="${borda * 2}" stroke-linejoin="round"/>` +
          `<path d="${c.d}" fill="url(#${p}-g)" stroke="#fff" stroke-width="${borda * 0.7}" stroke-linejoin="round" paint-order="stroke"/>` +
          `</g></svg>`,
      };
    },
  },
];
