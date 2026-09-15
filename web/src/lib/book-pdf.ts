import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import type { Caixa, PaginaLayout } from "./book-layout";
import type { FonteBook } from "./book-documento";
import { ALTURA_ACIMA_DA_BASE } from "./book-constantes";

// O DESENHISTA DE PDF. O gêmeo do renderizador de tela: recebe as MESMAS caixas e só
// desenha. Não calcula layout, não quebra linha, não decide nada.
//
// Toda a diferença entre os dois está em duas conversões, e é por isso que elas moram
// aqui, num lugar só:
//
// 1. ORIGEM. O layout usa canto superior esquerdo (natural do HTML); o pdf-lib usa canto
//    inferior esquerdo. `paraPdf(y)` inverte.
// 2. LINHA DE BASE. No layout, `y` de um texto é o TOPO da primeira linha; no pdf-lib,
//    `drawText` recebe a linha de BASE. A conversão desce ALTURA_ACIMA_DA_BASE do tamanho
//    da fonte, a mesma constante que a tela usa.
//
// Se a tela e o arquivo saírem diferentes, o defeito está num dos dois desenhistas -- não
// no layout. É esse o ganho do motor compartilhado.

export type Qualidade = "leve" | "alta";

/** Alvo prático de cada qualidade. O leve é o que vai no WhatsApp e precisa abrir rápido. */
const AJUSTES: Record<Qualidade, { pixelsPorPonto: number; jpeg: number }> = {
  // 2 px por ponto ≈ 144 dpi: mais que suficiente numa tela, e mantém o arquivo pequeno.
  leve: { pixelsPorPonto: 2, jpeg: 78 },
  // 300 dpi no tamanho da página, que é o que gráfica pede.
  alta: { pixelsPorPonto: 300 / 72, jpeg: 92 },
};

function cor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Recorta pro formato exato da caixa: o pdf-lib não corta o que passa do quadro. */
async function recortar(bytes: Buffer, alvoL: number, alvoA: number, jpeg: number, foco?: { x: number; y: number }) {
  const base = sharp(bytes).rotate();
  const meta = await base.metadata().catch(() => null);
  const deitada = (meta?.orientation ?? 1) >= 5;
  const larguraReal = (deitada ? meta?.height : meta?.width) ?? alvoL;
  const escala = Math.min(1, larguraReal / alvoL);
  const l = Math.max(1, Math.round(alvoL * escala));
  const a = Math.max(1, Math.round(alvoA * escala));
  // O foco da tela (-0.5 a 0.5) vira a posição do corte no sharp. 'centre' é o padrão;
  // os extremos viram os cantos, que é como o object-position se comporta no navegador.
  const posicao = foco
    ? foco.y < -0.17
      ? foco.x < -0.17
        ? "left top"
        : foco.x > 0.17
          ? "right top"
          : "top"
      : foco.y > 0.17
        ? foco.x < -0.17
          ? "left bottom"
          : foco.x > 0.17
            ? "right bottom"
            : "bottom"
        : foco.x < -0.17
          ? "left"
          : foco.x > 0.17
            ? "right"
            : "centre"
    : "centre";
  return base.resize(l, a, { fit: "cover", position: posicao }).jpeg({ quality: jpeg }).toBuffer();
}

/** Encaixa inteira dentro da caixa, sem cortar. É o que a planta precisa. */
async function conter(bytes: Buffer, alvoL: number, alvoA: number, jpeg: number) {
  const img = sharp(bytes).rotate().resize(Math.round(alvoL), Math.round(alvoA), { fit: "inside", withoutEnlargement: true });
  const { data, info } = await img.jpeg({ quality: jpeg }).toBuffer({ resolveWithObject: true });
  return { bytes: data, largura: info.width, altura: info.height };
}

export type FontesPdf = { normal: PDFFont; negrito: PDFFont };

export type EntradaPdf = {
  paginas: PaginaLayout[];
  /** bytes de cada imagem, por jobId. */
  imagens: Record<string, Buffer>;
  logo: Buffer | null;
  qualidade: Qualidade;
  titulo: string;
};

export async function montarPdfDoBook(e: EntradaPdf): Promise<Buffer> {
  const ajuste = AJUSTES[e.qualidade];
  const pdf = await PDFDocument.create();
  pdf.setTitle(e.titulo || "Book");
  pdf.setCreator("Encena");
  // Uma família por documento na prática, mas cada página diz a sua (vem do layout), e a
  // fonte só é embutida quando alguma página a usa: PDF em Helvetica não carrega a Times.
  const NOMES: Record<FonteBook, [StandardFonts, StandardFonts]> = {
    moderna: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
    classica: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  };
  const embutidas = new Map<FonteBook, FontesPdf>();
  async function fontesDa(f: FonteBook): Promise<FontesPdf> {
    const pronta = embutidas.get(f);
    if (pronta) return pronta;
    const [normal, negrito] = NOMES[f] ?? NOMES.moderna;
    const par = { normal: await pdf.embedFont(normal), negrito: await pdf.embedFont(negrito) };
    embutidas.set(f, par);
    return par;
  }

  // A mesma foto pode aparecer em dois quadros de tamanhos diferentes; guarda por formato.
  const cache = new Map<string, PDFImage>();
  async function imagem(jobId: string, l: number, a: number, modo: "cobrir" | "conter", foco?: { x: number; y: number }) {
    const bytes = e.imagens[jobId];
    if (!bytes) return null;
    const px = Math.round(l * ajuste.pixelsPorPonto);
    const py = Math.round(a * ajuste.pixelsPorPonto);
    const chave = `${jobId}:${px}x${py}:${modo}:${foco ? `${foco.x.toFixed(2)},${foco.y.toFixed(2)}` : ""}`;
    const pronta = cache.get(chave);
    if (pronta) return pronta;
    let emb: PDFImage;
    if (modo === "conter") {
      const r = await conter(bytes, px, py, ajuste.jpeg);
      emb = await pdf.embedJpg(r.bytes);
    } else {
      emb = await pdf.embedJpg(await recortar(bytes, px, py, ajuste.jpeg, foco));
    }
    cache.set(chave, emb);
    return emb;
  }

  let logo: PDFImage | null = null;
  if (e.logo) {
    try {
      logo = await pdf.embedPng(await sharp(e.logo).resize(600, 260, { fit: "inside" }).png().toBuffer());
    } catch {
      logo = null; // logo ilegível não derruba o book inteiro
    }
  }

  for (const p of e.paginas) {
    const pg = pdf.addPage([p.largura, p.altura]);
    /** Converte o y do layout (topo) pro y do pdf-lib (base). */
    const paraPdf = (y: number, altura = 0) => p.altura - y - altura;
    const fontes = await fontesDa(p.fonte ?? "moderna");

    for (const c of p.caixas) {
      await desenhar(pg, c, { paraPdf, fontes, imagem, logo, altura: p.altura });
    }
  }

  return Buffer.from(await pdf.save());
}

type Ferramentas = {
  paraPdf: (y: number, altura?: number) => number;
  fontes: FontesPdf;
  imagem: (jobId: string, l: number, a: number, modo: "cobrir" | "conter", foco?: { x: number; y: number }) => Promise<PDFImage | null>;
  logo: PDFImage | null;
  altura: number;
};

async function desenhar(pg: PDFPage, c: Caixa, f: Ferramentas) {
  if (c.tipo === "retangulo") {
    pg.drawRectangle({ x: c.x, y: f.paraPdf(c.y, c.a), width: c.l, height: c.a, color: cor(c.cor), opacity: c.opacidade ?? 1 });
    return;
  }

  if (c.tipo === "imagem") {
    const img = await f.imagem(c.jobId, c.l, c.a, c.modo, c.foco);
    if (!img) return;
    if (c.modo === "conter") {
      // Centraliza o que sobrou: a imagem contida quase nunca tem o formato da caixa.
      const escala = Math.min(c.l / img.width, c.a / img.height);
      const l = img.width * escala;
      const a = img.height * escala;
      pg.drawImage(img, { x: c.x + (c.l - l) / 2, y: f.paraPdf(c.y + (c.a - a) / 2, a), width: l, height: a });
    } else {
      pg.drawImage(img, { x: c.x, y: f.paraPdf(c.y, c.a), width: c.l, height: c.a });
    }
    return;
  }

  if (c.tipo === "texto") {
    const fonte = c.negrito ? f.fontes.negrito : f.fontes.normal;
    c.linhas.forEach((linha, i) => {
      const topoDaLinha = c.y + i * c.entrelinha;
      const base = f.paraPdf(topoDaLinha + c.tamanho * ALTURA_ACIMA_DA_BASE);
      const sobra = c.l - larguraSegura(fonte, linha, c.tamanho);
      const x = c.alinhamento === "direita" ? c.x + sobra : c.alinhamento === "centro" ? c.x + sobra / 2 : c.x;
      try {
        pg.drawText(linha, { x, y: base, size: c.tamanho, font: fonte, color: cor(c.cor) });
      } catch {
        // Caractere fora do WinAnsi derruba o desenho da fonte padrão. Some a linha, não
        // o arquivo -- e o resto do book continua legível.
      }
    });
    return;
  }

  if (c.tipo === "logo") {
    if (!f.logo) return;
    if (c.placa) {
      const folga = 8;
      pg.drawRectangle({ x: c.x - folga, y: f.paraPdf(c.y + c.a + folga), width: c.l + folga * 2, height: c.a + folga * 2, color: rgb(1, 1, 1) });
    }
    const escala = Math.min(c.l / f.logo.width, c.a / f.logo.height);
    const l = f.logo.width * escala;
    const a = f.logo.height * escala;
    pg.drawImage(f.logo, { x: c.x, y: f.paraPdf(c.y, a), width: l, height: a });
    return;
  }

  if (c.tipo === "qr" && c.png) {
    const bytes = Buffer.from(c.png.split(",")[1] ?? "", "base64");
    if (bytes.length === 0) return;
    const img = await pg.doc.embedPng(bytes);
    pg.drawImage(img, { x: c.x, y: f.paraPdf(c.y, c.a), width: c.l, height: c.a });
  }
}

function larguraSegura(fonte: PDFFont, texto: string, tamanho: number): number {
  try {
    return fonte.widthOfTextAtSize(texto, tamanho);
  } catch {
    return texto.length * tamanho * 0.52;
  }
}
