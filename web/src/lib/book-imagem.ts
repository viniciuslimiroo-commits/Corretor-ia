import sharp, { type OverlayOptions } from "sharp";
import type { PaginaLayout } from "./book-layout";
import { ALTURA_ACIMA_DA_BASE } from "./book-constantes";
import { FONTE_SVG_SERVIDOR } from "./fonte-svg";

// O TERCEIRO DESENHISTA: a mesma página, em JPG.
//
// Post, Story e carrossel não são arquivo pra mandar -- são imagem pra PUBLICAR, e
// ninguém publica PDF no Instagram. Este módulo recebe as MESMAS caixas que a tela e o
// pdf-lib recebem e pinta com o sharp.
//
// A regra dos outros dois vale aqui: ele não calcula layout, não quebra linha, não decide
// nada. Se a imagem sair diferente da tela, o defeito está neste arquivo ou no do PDF --
// nunca no motor de layout.
//
// Uma diferença honesta em relação ao PDF: o texto é rasterizado pelo librsvg com FONTE
// DO SISTEMA, não com a Helvetica embutida do PDF. As larguras não batem no milímetro, e
// por isso o corpo sai 4% menor -- a quebra de linha veio pronta com as métricas da
// Helvetica, e uma fonte um pouco mais larga estouraria a caixa. É o mesmo cuidado (e a
// mesma família de fontes) do selo de imagem ilustrativa.
const FONTE_SVG = FONTE_SVG_SERVIDOR;
const AJUSTE_FONTE = 0.96;

/** 1080px de largura é o que o Instagram pede em qualquer um dos formatos. */
export const LARGURA_PADRAO = 1080;

export type EntradaImagem = {
  /** bytes de cada imagem, por jobId. */
  imagens: Record<string, Buffer>;
  logo: Buffer | null;
  /** Largura final em pixels. A altura sai da proporção da página. */
  largura?: number;
  qualidade?: number;
};

function escaparXml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function corDoHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** O foco (-0,5 a 0,5) vira a posição do corte, como no PDF e no object-position da tela. */
function posicaoDoFoco(foco?: { x: number; y: number }): string {
  if (!foco) return "centre";
  const v = foco.y < -0.17 ? "top" : foco.y > 0.17 ? "bottom" : "";
  const h = foco.x < -0.17 ? "left" : foco.x > 0.17 ? "right" : "";
  if (v && h) return `${h} ${v}`;
  return v || h || "centre";
}

/**
 * A página virada em JPEG, do tamanho que a rede pede.
 *
 * As caixas são pintadas NA ORDEM em que vêm: é ela que põe o texto por cima da foto e a
 * faixa escura por cima da imagem da capa. Mexer na ordem aqui é mexer na aparência sem
 * mexer no layout, e foi por isso que ela não é reordenada.
 */
export async function montarImagemDaPagina(p: PaginaLayout, e: EntradaImagem): Promise<Buffer> {
  const larguraAlvo = e.largura ?? LARGURA_PADRAO;
  const escala = larguraAlvo / p.largura;
  const L = Math.round(larguraAlvo);
  const A = Math.round(p.altura * escala);

  const camadas: OverlayOptions[] = [];
  // O texto vai todo num SVG só, desenhado por último: são dezenas de caixas pequenas, e
  // uma composição por linha de texto multiplicaria o tempo por nada.
  const svgTexto: string[] = [];

  for (const c of p.caixas) {
    const x = Math.round(c.x * escala);
    const y = Math.round(c.y * escala);

    if (c.tipo === "retangulo") {
      const l = Math.max(1, Math.round(c.l * escala));
      const a = Math.max(1, Math.round(c.a * escala));
      const { r, g, b } = corDoHex(c.cor);
      const alpha = c.opacidade ?? 1;
      const bloco = await sharp({ create: { width: l, height: a, channels: 4, background: { r, g, b, alpha } } })
        .png()
        .toBuffer();
      camadas.push({ input: bloco, left: x, top: y });
      continue;
    }

    if (c.tipo === "imagem") {
      const bytes = e.imagens[c.jobId];
      if (!bytes) continue;
      const l = Math.max(1, Math.round(c.l * escala));
      const a = Math.max(1, Math.round(c.a * escala));
      try {
        const pronta = await sharp(bytes)
          .rotate()
          .resize(l, a, c.modo === "conter" ? { fit: "inside", withoutEnlargement: true } : { fit: "cover", position: posicaoDoFoco(c.foco) })
          .toBuffer();
        camadas.push({ input: pronta, left: x, top: y });
      } catch {
        // Foto ilegível não derruba o material inteiro: some só ela, como no PDF.
      }
      continue;
    }

    if (c.tipo === "logo") {
      if (!e.logo) continue;
      const l = Math.max(1, Math.round(c.l * escala));
      const a = Math.max(1, Math.round(c.a * escala));
      try {
        if (c.placa) {
          const placa = await sharp({ create: { width: l, height: a, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
          camadas.push({ input: placa, left: x, top: y });
        }
        const margem = c.placa ? Math.round(l * 0.06) : 0;
        const logo = await sharp(e.logo)
          .resize(Math.max(1, l - margem * 2), Math.max(1, a - margem * 2), { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        const meta = await sharp(logo).metadata();
        camadas.push({ input: logo, left: x + Math.round((l - (meta.width ?? l)) / 2), top: y + Math.round((a - (meta.height ?? a)) / 2) });
      } catch {
        /* logo ilegível não derruba a imagem */
      }
      continue;
    }

    if (c.tipo === "qr" && c.png) {
      const l = Math.max(1, Math.round(c.l * escala));
      try {
        const bytes = Buffer.from(c.png.replace(/^data:image\/\w+;base64,/, ""), "base64");
        const qr = await sharp(bytes).resize(l, l, { fit: "inside" }).png().toBuffer();
        camadas.push({ input: qr, left: x, top: y });
      } catch {
        /* idem */
      }
      continue;
    }

    if (c.tipo === "texto") {
      const tamanho = c.tamanho * escala * AJUSTE_FONTE;
      const entrelinha = c.entrelinha * escala;
      const base = y + ALTURA_ACIMA_DA_BASE * (c.tamanho * escala);
      const ancora = c.alinhamento === "direita" ? "end" : c.alinhamento === "centro" ? "middle" : "start";
      const xTexto = c.alinhamento === "direita" ? Math.round((c.x + c.l) * escala) : c.alinhamento === "centro" ? Math.round((c.x + c.l / 2) * escala) : x;
      c.linhas.forEach((linha, i) => {
        if (!linha) return;
        svgTexto.push(
          `<text x="${xTexto}" y="${Math.round(base + i * entrelinha)}" font-family="${FONTE_SVG}" font-size="${tamanho.toFixed(1)}" ` +
            `font-weight="${c.negrito ? 700 : 400}" fill="${c.cor}" text-anchor="${ancora}" xml:space="preserve">${escaparXml(linha)}</text>`
        );
      });
    }
  }

  if (svgTexto.length) {
    const svg = Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">${svgTexto.join("")}</svg>`);
    camadas.push({ input: svg, left: 0, top: 0 });
  }

  return sharp({ create: { width: L, height: A, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(camadas)
    .jpeg({ quality: e.qualidade ?? 92 })
    .toBuffer();
}

/** Todas as páginas, na ordem. É o carrossel: uma imagem por página. */
export async function montarImagensDoBook(paginas: PaginaLayout[], e: EntradaImagem): Promise<Buffer[]> {
  const saida: Buffer[] = [];
  for (const p of paginas) saida.push(await montarImagemDaPagina(p, e));
  return saida;
}

