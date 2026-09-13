import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";

// Book do imóvel em PDF: o material que o corretor manda no WhatsApp e no e-mail.
//
// NÃO gasta crédito. É composição determinística, como a planta e o terreno -- não passa
// por IA, então não custa nada além de banda. Cobrar por isso seria cobrar por diagramação.
//
// O texto é desenhado NATIVO no PDF, não como imagem: fica nítido em qualquer zoom, dá pra
// copiar o telefone e o arquivo pesa uma fração. A fonte padrão (Helvetica) cobre acento
// português no encoding WinAnsi, então "Área do imóvel" sai certo sem embutir fonte.

export type FotoBook = { bytes: Buffer; legenda?: string };

export type DadosBook = {
  titulo: string;
  endereco?: string;
  preco?: string;
  descricao?: string;
  fotos: FotoBook[];
  /** Marca de quem envia. Sai na capa e no rodapé de toda página. */
  autor: { nome?: string; creci?: string; whatsapp?: string; logo?: Buffer | null; cor?: string };
  /** Link público do imóvel: vira QR na última página. */
  link?: string;
};

const A4 = { l: 595.28, a: 841.89 };
const MARGEM = 40;
const INDIGO = rgb(0.059, 0.176, 0.357);
const CINZA = rgb(0.42, 0.45, 0.5);

function corDaMarca(hex?: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return INDIGO;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Quebra o texto na largura dada, medindo de verdade em vez de chutar por caractere. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number, maxLinhas = 99) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas) return linhas;
    } else {
      atual = tentativa;
    }
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);
  return linhas;
}

/** Redimensiona e converte pra JPEG: PNG de 4000px estoura o tamanho do arquivo à toa. */
async function paraJpeg(bytes: Buffer, largura: number) {
  return sharp(bytes).rotate().resize(largura, undefined, { withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

/** Desenha a imagem preenchendo a caixa e cortando o excesso (como object-fit: cover). */
function encaixarCobrindo(caixa: { x: number; y: number; l: number; a: number }, img: { width: number; height: number }) {
  const escala = Math.max(caixa.l / img.width, caixa.a / img.height);
  const l = img.width * escala;
  const a = img.height * escala;
  return { x: caixa.x + (caixa.l - l) / 2, y: caixa.y + (caixa.a - a) / 2, width: l, height: a };
}

export async function montarBook(d: DadosBook): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.titulo);
  pdf.setCreator("Encena IA");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = corDaMarca(d.autor.cor);

  const rodapeDe = [d.autor.nome, d.autor.creci ? `CRECI ${d.autor.creci}` : null, d.autor.whatsapp]
    .filter(Boolean)
    .join("  ·  ");

  function rodape(pg: PDFPage, numero: number) {
    if (rodapeDe) pg.drawText(rodapeDe, { x: MARGEM, y: 22, size: 8, font: regular, color: CINZA });
    pg.drawText(String(numero), { x: A4.l - MARGEM - 8, y: 22, size: 8, font: regular, color: CINZA });
    pg.drawText("Imagens ilustrativas · algumas editadas digitalmente", {
      x: MARGEM,
      y: 11,
      size: 6.5,
      font: regular,
      color: rgb(0.65, 0.67, 0.7),
    });
  }

  // ---------- capa ----------
  const capa = pdf.addPage([A4.l, A4.a]);
  let numero = 1;
  if (d.fotos[0]) {
    const img = await pdf.embedJpg(await paraJpeg(d.fotos[0].bytes, 1400));
    const caixa = { x: 0, y: A4.a - 470, l: A4.l, a: 470 };
    capa.drawImage(img, encaixarCobrindo(caixa, img));
    // faixa escura por baixo do texto: foto clara engolia o título
    capa.drawRectangle({ x: 0, y: A4.a - 470, width: A4.l, height: 120, color: rgb(0, 0, 0), opacity: 0.45 });
  }
  let y = A4.a - 470 + 78;
  for (const linha of quebrar(d.titulo, negrito, 26, A4.l - MARGEM * 2, 2)) {
    capa.drawText(linha, { x: MARGEM, y, size: 26, font: negrito, color: rgb(1, 1, 1) });
    y -= 30;
  }
  if (d.endereco) capa.drawText(d.endereco, { x: MARGEM, y: A4.a - 470 + 28, size: 11, font: regular, color: rgb(1, 1, 1) });

  y = A4.a - 520;
  if (d.preco) {
    capa.drawText(d.preco, { x: MARGEM, y, size: 30, font: negrito, color: cor });
    y -= 40;
  }
  if (d.descricao) {
    for (const linha of quebrar(d.descricao, regular, 11, A4.l - MARGEM * 2, 8)) {
      capa.drawText(linha, { x: MARGEM, y, size: 11, font: regular, color: rgb(0.2, 0.23, 0.28) });
      y -= 16;
    }
  }
  if (d.autor.logo) {
    try {
      const png = await sharp(d.autor.logo).resize(220, 90, { fit: "inside" }).png().toBuffer();
      const logo = await pdf.embedPng(png);
      const esc = Math.min(110 / logo.width, 45 / logo.height);
      capa.drawImage(logo, { x: MARGEM, y: 60, width: logo.width * esc, height: logo.height * esc });
    } catch {
      // logo ilegível não derruba o book inteiro
    }
  }
  rodape(capa, numero++);

  // ---------- fotos, duas por página ----------
  const restantes = d.fotos.slice(1);
  for (let i = 0; i < restantes.length; i += 2) {
    const pg = pdf.addPage([A4.l, A4.a]);
    const alturaFoto = (A4.a - MARGEM * 2 - 60) / 2;
    for (let k = 0; k < 2; k++) {
      const foto = restantes[i + k];
      if (!foto) break;
      const img = await pdf.embedJpg(await paraJpeg(foto.bytes, 1200));
      const caixa = { x: MARGEM, y: A4.a - MARGEM - alturaFoto - k * (alturaFoto + 30), l: A4.l - MARGEM * 2, a: alturaFoto };
      pg.drawImage(img, encaixarCobrindo(caixa, img));
      if (foto.legenda) {
        pg.drawText(foto.legenda.slice(0, 90), { x: MARGEM, y: caixa.y - 14, size: 9, font: regular, color: CINZA });
      }
    }
    rodape(pg, numero++);
  }

  // ---------- contato ----------
  const fim = pdf.addPage([A4.l, A4.a]);
  fim.drawRectangle({ x: 0, y: A4.a - 200, width: A4.l, height: 200, color: cor });
  fim.drawText("Vamos visitar?", { x: MARGEM, y: A4.a - 110, size: 30, font: negrito, color: rgb(1, 1, 1) });
  if (d.autor.nome) fim.drawText(d.autor.nome, { x: MARGEM, y: A4.a - 145, size: 14, font: regular, color: rgb(1, 1, 1) });

  y = A4.a - 260;
  for (const [rot, val] of [
    ["WhatsApp", d.autor.whatsapp],
    ["CRECI", d.autor.creci],
  ] as [string, string | undefined][]) {
    if (!val) continue;
    fim.drawText(rot, { x: MARGEM, y, size: 9, font: regular, color: CINZA });
    fim.drawText(val, { x: MARGEM, y: y - 18, size: 16, font: negrito, color: rgb(0.1, 0.12, 0.15) });
    y -= 48;
  }
  if (d.link) {
    const png = Buffer.from(await QRCode.toBuffer(d.link, { margin: 1, width: 340, type: "png" }));
    const qr = await pdf.embedPng(png);
    fim.drawImage(qr, { x: A4.l - MARGEM - 150, y: y - 20, width: 150, height: 150 });
    fim.drawText("Aponte a câmera pra ver as fotos", { x: A4.l - MARGEM - 150, y: y - 34, size: 8, font: regular, color: CINZA });
  }
  rodape(fim, numero);

  return Buffer.from(await pdf.save());
}
