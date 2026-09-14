import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { MODELOS_POR_ID, separarTopicos, type ModeloMaterial } from "./materiais";

// O gerador de material de Materiais: pega as fotos que a pessoa escolheu e devolve um
// PDF pronto pra mandar. Seis modelos, um motor só -- capa, grade, foto cheia e página de
// contato são as mesmas peças remontadas.
//
// NÃO gasta crédito. É diagramação determinística, como a planta e o terreno: não passa
// por IA. Cobrar por montar o que a pessoa já pagou pra gerar seria cobrar duas vezes.
//
// O texto é desenhado NATIVO no PDF, não como imagem: fica nítido em qualquer zoom, dá
// pra copiar o telefone e o arquivo pesa uma fração. A Helvetica padrão cobre acento
// português no encoding WinAnsi, então "Área do imóvel" sai certo sem embutir fonte.

export type FotoMaterial = { bytes: Buffer; legenda?: string };

/** Um imóvel dentro do material. Modelos de um imóvel só usam o primeiro bloco. */
export type BlocoMaterial = { titulo: string; subtitulo?: string; preco?: string; fotos: FotoMaterial[] };

export type MarcaMaterial = { nome?: string; creci?: string; whatsapp?: string; logo?: Buffer | null; cor?: string };

export type DadosMaterial = {
  modelo: ModeloMaterial;
  titulo: string;
  subtitulo?: string;
  descricao?: string;
  preco?: string;
  blocos: BlocoMaterial[];
  marca: MarcaMaterial;
  /** Link público (do imóvel ou do perfil): vira QR na última página. */
  link?: string;
};

const MARGEM = 40;
const INDIGO = rgb(0.059, 0.176, 0.357);
const CINZA = rgb(0.42, 0.45, 0.5);
const GRAFITE = rgb(0.1, 0.12, 0.15);
const AVISO = "Imagens ilustrativas · algumas editadas digitalmente";

function corDaMarca(hex?: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return INDIGO;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Escurece a cor da marca pra usar como fundo de capa sem estourar em tom claro. */
function fundoDaCapa(c: RGB): RGB {
  const luz = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  const f = luz > 0.6 ? 0.55 : luz > 0.35 ? 0.85 : 1;
  return rgb(c.red * f, c.green * f, c.blue * f);
}

/**
 * Recorta pro formato exato da caixa e converte pra JPEG (como object-fit: cover).
 *
 * O corte é feito AQUI, no sharp, e não desenhando a imagem maior que a caixa: o pdf-lib
 * não corta nada: o que passa do quadro fica visível e vaza por cima do texto. Foi o que
 * aconteceu com uma planta em pé na capa -- ela descia por cima do preço e da descrição.
 * De quebra, cortar antes joga fora pixel que não seria visto, e o arquivo encolhe.
 */
async function recortarParaJpeg(bytes: Buffer, alvoL: number, alvoA: number) {
  const base = sharp(bytes).rotate();
  const meta = await base.metadata().catch(() => null);
  // orientation >= 5 quer dizer que o .rotate() vai trocar largura por altura
  const deitada = (meta?.orientation ?? 1) >= 5;
  const larguraReal = (deitada ? meta?.height : meta?.width) ?? alvoL;
  const escala = Math.min(1, larguraReal / alvoL);
  const l = Math.max(1, Math.round(alvoL * escala));
  const a = Math.max(1, Math.round(alvoA * escala));
  return base.resize(l, a, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
}

type Caixa = { x: number; y: number; l: number; a: number };

export async function montarMaterial(d: DadosMaterial): Promise<Buffer> {
  const def = MODELOS_POR_ID[d.modelo];
  if (!def) throw new Error("Modelo desconhecido.");

  const pdf = await PDFDocument.create();
  pdf.setTitle(d.titulo || "Material");
  pdf.setCreator("Encena");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = corDaMarca(d.marca.cor);
  const escuro = fundoDaCapa(cor);

  const deitado = def.orientacao === "paisagem";
  const L = deitado ? 841.89 : 595.28;
  const A = deitado ? 595.28 : 841.89;
  const util = L - MARGEM * 2;

  const assinatura = [d.marca.nome, d.marca.creci ? `CRECI ${d.marca.creci}` : null, d.marca.whatsapp].filter(Boolean).join("  ·  ");

  // ---------- peças ----------

  /** Quebra o texto na largura dada, medindo de verdade em vez de chutar por caractere. */
  function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number, maxLinhas = 99) {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of texto.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tam) > largura && atual) {
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

  /** Desenha um parágrafo e devolve o y onde parou. */
  function paragrafo(pg: PDFPage, texto: string, x: number, y: number, largura: number, o: { tam?: number; cor?: RGB; maxLinhas?: number; fonte?: PDFFont } = {}) {
    const tam = o.tam ?? 11;
    const fonte = o.fonte ?? regular;
    for (const linha of quebrar(texto, fonte, tam, largura, o.maxLinhas ?? 99)) {
      pg.drawText(linha, { x, y, size: tam, font: fonte, color: o.cor ?? GRAFITE });
      y -= tam * 1.45;
    }
    return y;
  }

  /**
   * O aviso de imagem ilustrativa vai em TODA página, inclusive nas de foto sangrada e
   * nas capas -- é o que protege o anúncio de quem manda o material. Só muda de canto e
   * de cor conforme o fundo.
   */
  function avisoNoCanto(pg: PDFPage, claro: boolean) {
    const largura = regular.widthOfTextAtSize(AVISO, 6.5);
    pg.drawText(AVISO, { x: L - MARGEM - largura, y: 20, size: 6.5, font: regular, color: claro ? rgb(1, 1, 1) : rgb(0.65, 0.67, 0.7), opacity: claro ? 0.75 : 1 });
  }

  let numero = 0;
  /** "completo" = assinatura + número + aviso; "aviso" = só o aviso; "nenhum" = capa. */
  function novaPagina(rodape: "completo" | "aviso" | "nenhum" = "completo") {
    const pg = pdf.addPage([L, A]);
    numero += 1;
    if (rodape === "completo") {
      if (assinatura) pg.drawText(assinatura, { x: MARGEM, y: 22, size: 8, font: regular, color: CINZA });
      pg.drawText(String(numero), { x: L - MARGEM - 10, y: 22, size: 8, font: regular, color: CINZA });
      pg.drawText(AVISO, { x: MARGEM, y: 11, size: 6.5, font: regular, color: rgb(0.65, 0.67, 0.7) });
    } else if (rodape === "aviso") {
      pg.drawText(AVISO, { x: MARGEM, y: 11, size: 6.5, font: regular, color: rgb(0.65, 0.67, 0.7) });
    }
    return pg;
  }

  // A mesma foto pode aparecer em dois lugares (capa e grade do portfólio): guarda por
  // formato, porque o recorte muda com a caixa.
  const cache = new Map<Buffer, Map<string, PDFImage>>();

  async function desenharFoto(pg: PDFPage, foto: FotoMaterial, caixa: Caixa, px = 1200) {
    const alvoL = Math.round(px);
    const alvoA = Math.max(1, Math.round((px * caixa.a) / caixa.l));
    const chave = `${alvoL}x${alvoA}`;
    let porFormato = cache.get(foto.bytes);
    if (!porFormato) {
      porFormato = new Map();
      cache.set(foto.bytes, porFormato);
    }
    let img = porFormato.get(chave);
    if (!img) {
      img = await pdf.embedJpg(await recortarParaJpeg(foto.bytes, alvoL, alvoA));
      porFormato.set(chave, img);
    }
    pg.drawImage(img, { x: caixa.x, y: caixa.y, width: caixa.l, height: caixa.a });
  }

  /**
   * Desenha a logo. Em fundo colorido (`sobreCor`) vai numa placa branca em vez de ter a
   * cor invertida: inverter é o jeito rápido de fazer a logo aparecer e o jeito certo de
   * entregar a marca da pessoa com a cor errada -- azul vira laranja.
   */
  async function logoNa(pg: PDFPage, x: number, y: number, maxL: number, maxA: number, sobreCor = false) {
    if (!d.marca.logo) return 0;
    try {
      const png = await sharp(d.marca.logo)
        .resize(Math.round(maxL * 3), Math.round(maxA * 3), { fit: "inside" })
        .png()
        .toBuffer();
      const emb = await pdf.embedPng(png);
      const esc = Math.min(maxL / emb.width, maxA / emb.height);
      const l = emb.width * esc;
      const a = emb.height * esc;
      if (sobreCor) {
        const folga = 8;
        pg.drawRectangle({ x: x - folga, y: y - folga, width: l + folga * 2, height: a + folga * 2, color: rgb(1, 1, 1) });
      }
      pg.drawImage(emb, { x, y, width: l, height: a });
      return a;
    } catch {
      return 0; // logo ilegível não derruba o material inteiro
    }
  }

  async function qrEm(pg: PDFPage, x: number, y: number, lado: number) {
    if (!d.link) return;
    const png = Buffer.from(await QRCode.toBuffer(d.link, { margin: 1, width: Math.round(lado * 4), type: "png" }));
    const qr = await pdf.embedPng(png);
    pg.drawImage(qr, { x, y, width: lado, height: lado });
    pg.drawText("Aponte a câmera", { x, y: y - 12, size: 7.5, font: regular, color: CINZA });
  }

  /** Última página: "vamos visitar?", contato e QR. Fecha todo material. */
  async function paginaContato(chamada = "Vamos visitar?") {
    const pg = novaPagina();
    const alturaFaixa = deitado ? 150 : 200;
    pg.drawRectangle({ x: 0, y: A - alturaFaixa, width: L, height: alturaFaixa, color: escuro });
    pg.drawText(chamada, { x: MARGEM, y: A - alturaFaixa + 62, size: deitado ? 26 : 30, font: negrito, color: rgb(1, 1, 1) });
    if (d.marca.nome) pg.drawText(d.marca.nome.slice(0, 60), { x: MARGEM, y: A - alturaFaixa + 34, size: 13, font: regular, color: rgb(1, 1, 1) });
    await logoNa(pg, L - MARGEM - 120, A - alturaFaixa + 30, 120, 50, true);

    let y = A - alturaFaixa - 60;
    for (const [rot, val] of [
      ["WhatsApp", d.marca.whatsapp],
      ["CRECI", d.marca.creci],
    ] as [string, string | undefined][]) {
      if (!val) continue;
      pg.drawText(rot, { x: MARGEM, y, size: 9, font: regular, color: CINZA });
      pg.drawText(val, { x: MARGEM, y: y - 18, size: 16, font: negrito, color: GRAFITE });
      y -= 48;
    }
    if (d.preco && def.usaPreco) {
      pg.drawText("Valor", { x: MARGEM, y, size: 9, font: regular, color: CINZA });
      pg.drawText(d.preco, { x: MARGEM, y: y - 20, size: 20, font: negrito, color: cor });
    }
    await qrEm(pg, L - MARGEM - 150, A - alturaFaixa - 190, 150);
    return pg;
  }

  const bloco = d.blocos[0] ?? { titulo: d.titulo, fotos: [] };
  const todas = d.blocos.flatMap((b) => b.fotos);

  // ---------- modelos ----------

  if (d.modelo === "book") {
    const capa = novaPagina();
    const alturaFoto = 470;
    if (bloco.fotos[0]) {
      await desenharFoto(capa, bloco.fotos[0], { x: 0, y: A - alturaFoto, l: L, a: alturaFoto }, 1400);
      // faixa escura por baixo do texto: foto clara engolia o título
      capa.drawRectangle({ x: 0, y: A - alturaFoto, width: L, height: 120, color: rgb(0, 0, 0), opacity: 0.5 });
    }
    let y = A - alturaFoto + 78;
    for (const linha of quebrar(d.titulo, negrito, 26, util, 2)) {
      capa.drawText(linha, { x: MARGEM, y, size: 26, font: negrito, color: rgb(1, 1, 1) });
      y -= 30;
    }
    if (d.subtitulo) capa.drawText(d.subtitulo.slice(0, 90), { x: MARGEM, y: A - alturaFoto + 28, size: 11, font: regular, color: rgb(1, 1, 1) });

    y = A - alturaFoto - 50;
    if (d.preco) {
      capa.drawText(d.preco, { x: MARGEM, y, size: 30, font: negrito, color: cor });
      y -= 40;
    }
    if (d.descricao) y = paragrafo(capa, d.descricao, MARGEM, y, util, { maxLinhas: 8 });
    await logoNa(capa, MARGEM, 60, 110, 45);

    const restantes = bloco.fotos.slice(1);
    const alturaCada = (A - MARGEM * 2 - 60) / 2;
    for (let i = 0; i < restantes.length; i += 2) {
      const pg = novaPagina();
      for (let k = 0; k < 2; k++) {
        const foto = restantes[i + k];
        if (!foto) break;
        const caixa = { x: MARGEM, y: A - MARGEM - alturaCada - k * (alturaCada + 30), l: util, a: alturaCada };
        await desenharFoto(pg, foto, caixa);
        if (foto.legenda) pg.drawText(foto.legenda.slice(0, 90), { x: MARGEM, y: caixa.y - 14, size: 9, font: regular, color: CINZA });
      }
    }
    await paginaContato();
  }

  if (d.modelo === "whatsapp") {
    // Uma página só, de propósito: é o arquivo que se manda na conversa, tem que abrir
    // rápido no celular e caber numa olhada.
    //
    // Layout FIXO, não empilhado: a grade começa sempre na mesma altura. Quando ela vinha
    // logo abaixo do texto, uma descrição curta deixava meio dedo de página em branco no
    // meio -- o que numa página só é a diferença entre parecer material e parecer rascunho.
    const pg = novaPagina("aviso");
    const alturaCapa = 330;
    const topoGrade = 388;
    if (bloco.fotos[0]) {
      await desenharFoto(pg, bloco.fotos[0], { x: 0, y: A - alturaCapa, l: L, a: alturaCapa }, 1400);
      pg.drawRectangle({ x: 0, y: A - alturaCapa, width: L, height: 96, color: rgb(0, 0, 0), opacity: 0.5 });
    }
    let y = A - alturaCapa + 60;
    for (const linha of quebrar(d.titulo, negrito, 22, util, 2)) {
      pg.drawText(linha, { x: MARGEM, y, size: 22, font: negrito, color: rgb(1, 1, 1) });
      y -= 26;
    }
    if (d.subtitulo) pg.drawText(d.subtitulo.slice(0, 80), { x: MARGEM, y: A - alturaCapa + 22, size: 10, font: regular, color: rgb(1, 1, 1) });

    y = A - alturaCapa - 44;
    if (d.preco) {
      pg.drawText(d.preco, { x: MARGEM, y, size: 26, font: negrito, color: cor });
      y -= 34;
    }
    // três linhas no máximo: a quarta encostaria na grade
    if (d.descricao) paragrafo(pg, d.descricao, MARGEM, y, util, { maxLinhas: 3, tam: 10.5 });

    const gap = 12;
    const lado = (util - gap) / 2;
    const altura = 118;
    for (let i = 0; i < 4; i++) {
      const foto = bloco.fotos[i + 1];
      if (!foto) break;
      const col = i % 2;
      const lin = Math.floor(i / 2);
      await desenharFoto(pg, foto, { x: MARGEM + col * (lado + gap), y: topoGrade - altura - lin * (altura + gap), l: lado, a: altura }, 700);
    }

    if (assinatura) pg.drawText(assinatura, { x: MARGEM, y: 64, size: 11, font: negrito, color: GRAFITE });
    await qrEm(pg, L - MARGEM - 78, 52, 78);
    await logoNa(pg, MARGEM, 88, 100, 34);
  }

  if (d.modelo === "catalogo") {
    const capa = novaPagina("nenhum");
    capa.drawRectangle({ x: 0, y: 0, width: L, height: A, color: escuro });
    await logoNa(capa, MARGEM, A - 150, 150, 60, true);
    let y = A / 2 + 40;
    for (const linha of quebrar(d.titulo, negrito, 34, util, 3)) {
      capa.drawText(linha, { x: MARGEM, y, size: 34, font: negrito, color: rgb(1, 1, 1) });
      y -= 40;
    }
    if (d.subtitulo) capa.drawText(d.subtitulo.slice(0, 90), { x: MARGEM, y: y - 6, size: 13, font: regular, color: rgb(0.85, 0.88, 0.92) });
    if (d.descricao) paragrafo(capa, d.descricao, MARGEM, y - 44, util * 0.8, { maxLinhas: 5, tam: 11, cor: rgb(0.85, 0.88, 0.92) });
    capa.drawText(`${d.blocos.length} ${d.blocos.length === 1 ? "imóvel" : "imóveis"}`, { x: MARGEM, y: 70, size: 12, font: negrito, color: rgb(1, 1, 1) });
    if (assinatura) capa.drawText(assinatura, { x: MARGEM, y: 50, size: 9, font: regular, color: rgb(0.8, 0.83, 0.88) });
    avisoNoCanto(capa, true);

    const alturaItem = (A - MARGEM * 2 - 50) / 2;
    for (let i = 0; i < d.blocos.length; i += 2) {
      const pg = novaPagina();
      for (let k = 0; k < 2; k++) {
        const b = d.blocos[i + k];
        if (!b) break;
        const topo = A - MARGEM - k * (alturaItem + 34);
        const alturaFoto = alturaItem - 62;
        const larguraFoto = util * 0.58;
        if (b.fotos[0]) await desenharFoto(pg, b.fotos[0], { x: MARGEM, y: topo - alturaFoto, l: larguraFoto, a: alturaFoto }, 900);
        // duas miniaturas à direita, se houver
        const xDir = MARGEM + larguraFoto + 10;
        const larguraMini = util - larguraFoto - 10;
        for (let m = 0; m < 2; m++) {
          const foto = b.fotos[m + 1];
          if (!foto) break;
          const alturaMini = (alturaFoto - 10) / 2;
          await desenharFoto(pg, foto, { x: xDir, y: topo - alturaMini - m * (alturaMini + 10), l: larguraMini, a: alturaMini }, 500);
        }
        let yb = topo - alturaFoto - 20;
        pg.drawText(b.titulo.slice(0, 60), { x: MARGEM, y: yb, size: 15, font: negrito, color: GRAFITE });
        yb -= 16;
        if (b.subtitulo) pg.drawText(b.subtitulo.slice(0, 80), { x: MARGEM, y: yb, size: 10, font: regular, color: CINZA });
        if (b.preco) pg.drawText(b.preco.slice(0, 30), { x: L - MARGEM - negrito.widthOfTextAtSize(b.preco.slice(0, 30), 17), y: topo - alturaFoto - 20, size: 17, font: negrito, color: cor });
      }
    }
    await paginaContato("Quer ver algum de perto?");
  }

  if (d.modelo === "portfolio") {
    const capa = novaPagina("nenhum");
    capa.drawRectangle({ x: 0, y: 0, width: L, height: A, color: escuro });
    if (todas[0]) {
      await desenharFoto(capa, todas[0], { x: 0, y: A - 380, l: L, a: 380 }, 1400);
      capa.drawRectangle({ x: 0, y: A - 380, width: L, height: 380, color: escuro, opacity: 0.5 });
    }
    await logoNa(capa, MARGEM, A - 130, 160, 64, true);
    let y = A - 470;
    for (const linha of quebrar(d.titulo, negrito, 32, util, 3)) {
      capa.drawText(linha, { x: MARGEM, y, size: 32, font: negrito, color: rgb(1, 1, 1) });
      y -= 38;
    }
    if (d.subtitulo) capa.drawText(d.subtitulo.slice(0, 90), { x: MARGEM, y: y - 4, size: 13, font: regular, color: rgb(0.85, 0.88, 0.92) });
    if (d.descricao) paragrafo(capa, d.descricao, MARGEM, y - 40, util * 0.85, { maxLinhas: 8, tam: 11.5, cor: rgb(0.88, 0.9, 0.93) });
    if (assinatura) capa.drawText(assinatura, { x: MARGEM, y: 50, size: 9, font: regular, color: rgb(0.8, 0.83, 0.88) });
    avisoNoCanto(capa, true);

    // grade 2×3, com o nome do imóvel embaixo de cada foto
    const itens = d.blocos.flatMap((b) => b.fotos.map((f) => ({ foto: f, nome: b.titulo })));
    const gap = 14;
    const larguraCel = (util - gap) / 2;
    const alturaCel = 150;
    for (let i = 0; i < itens.length; i += 6) {
      const pg = novaPagina();
      for (let k = 0; k < 6; k++) {
        const item = itens[i + k];
        if (!item) break;
        const col = k % 2;
        const lin = Math.floor(k / 2);
        const topo = A - MARGEM - lin * (alturaCel + 34);
        await desenharFoto(pg, item.foto, { x: MARGEM + col * (larguraCel + gap), y: topo - alturaCel, l: larguraCel, a: alturaCel }, 700);
        pg.drawText(item.nome.slice(0, 40), { x: MARGEM + col * (larguraCel + gap), y: topo - alturaCel - 14, size: 9.5, font: negrito, color: GRAFITE });
      }
    }
    await paginaContato("Quer vender o seu com a gente?");
  }

  if (d.modelo === "lancamento") {
    const capa = novaPagina("nenhum");
    if (bloco.fotos[0]) {
      await desenharFoto(capa, bloco.fotos[0], { x: 0, y: 0, l: L, a: A }, 1800);
      capa.drawRectangle({ x: 0, y: 0, width: L, height: 240, color: rgb(0, 0, 0), opacity: 0.55 });
    } else {
      capa.drawRectangle({ x: 0, y: 0, width: L, height: A, color: escuro });
    }
    let y = 160;
    for (const linha of quebrar(d.titulo, negrito, 40, util, 2)) {
      capa.drawText(linha, { x: MARGEM, y, size: 40, font: negrito, color: rgb(1, 1, 1) });
      y -= 46;
    }
    if (d.subtitulo) capa.drawText(d.subtitulo.slice(0, 100), { x: MARGEM, y: 82, size: 14, font: regular, color: rgb(0.9, 0.92, 0.95) });
    if (d.preco) capa.drawText(d.preco, { x: MARGEM, y: 52, size: 20, font: negrito, color: rgb(1, 1, 1) });
    await logoNa(capa, L - MARGEM - 130, A - 90, 130, 54, true);
    avisoNoCanto(capa, true);

    if (d.descricao) {
      const pg = novaPagina();
      pg.drawRectangle({ x: 0, y: A - 8, width: L, height: 8, color: cor });
      pg.drawText(d.titulo.slice(0, 70), { x: MARGEM, y: A - 80, size: 24, font: negrito, color: GRAFITE });
      paragrafo(pg, d.descricao, MARGEM, A - 130, util * 0.72, { tam: 13, maxLinhas: 18 });
    }

    // A faixa embaixo sai SEMPRE, mesmo sem legenda: é ela que carrega o aviso de imagem
    // ilustrativa numa página que é só foto de ponta a ponta.
    for (const foto of bloco.fotos.slice(1)) {
      const pg = novaPagina("nenhum");
      await desenharFoto(pg, foto, { x: 0, y: 0, l: L, a: A }, 1800);
      pg.drawRectangle({ x: 0, y: 0, width: L, height: 46, color: rgb(0, 0, 0), opacity: 0.5 });
      if (foto.legenda) pg.drawText(foto.legenda.slice(0, 100), { x: MARGEM, y: 18, size: 12, font: regular, color: rgb(1, 1, 1) });
      avisoNoCanto(pg, true);
    }
    await paginaContato("Quer conhecer o lançamento?");
  }

  if (d.modelo === "investidores") {
    const capa = novaPagina("nenhum");
    capa.drawRectangle({ x: 0, y: 0, width: L, height: A, color: escuro });
    if (bloco.fotos[0]) await desenharFoto(capa, bloco.fotos[0], { x: L * 0.45, y: 0, l: L * 0.55, a: A }, 1400);
    capa.drawRectangle({ x: 0, y: 0, width: L * 0.45, height: A, color: escuro });
    await logoNa(capa, MARGEM, A - 110, 130, 52, true);
    let y = A / 2 + 30;
    for (const linha of quebrar(d.titulo, negrito, 28, L * 0.45 - MARGEM * 2, 3)) {
      capa.drawText(linha, { x: MARGEM, y, size: 28, font: negrito, color: rgb(1, 1, 1) });
      y -= 34;
    }
    if (d.subtitulo) paragrafo(capa, d.subtitulo, MARGEM, y - 8, L * 0.45 - MARGEM * 2, { tam: 12, maxLinhas: 4, cor: rgb(0.85, 0.88, 0.92) });
    if (assinatura) capa.drawText(assinatura, { x: MARGEM, y: 46, size: 9, font: regular, color: rgb(0.8, 0.83, 0.88) });
    avisoNoCanto(capa, true);

    // página de números: "Rótulo: valor" por linha vira card; o resto vira parágrafo
    const { numeros, paragrafos } = separarTopicos(d.descricao ?? "");
    const cards = d.preco ? [{ rotulo: "Valor", valor: d.preco.slice(0, 24) }, ...numeros] : numeros;
    if (cards.length || paragrafos.length) {
      const pg = novaPagina();
      pg.drawRectangle({ x: 0, y: A - 8, width: L, height: 8, color: cor });
      pg.drawText("Números", { x: MARGEM, y: A - 74, size: 24, font: negrito, color: GRAFITE });
      const gap = 14;
      const larguraCard = (util - gap * 2) / 3;
      cards.slice(0, 6).forEach((c, i) => {
        const col = i % 3;
        const lin = Math.floor(i / 3);
        const x = MARGEM + col * (larguraCard + gap);
        const yb = A - 110 - lin * 96;
        pg.drawRectangle({ x, y: yb - 78, width: larguraCard, height: 78, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.9, 0.91, 0.93), borderWidth: 1 });
        pg.drawText(c.rotulo.slice(0, 28), { x: x + 14, y: yb - 26, size: 9, font: regular, color: CINZA });
        pg.drawText(c.valor, { x: x + 14, y: yb - 54, size: 18, font: negrito, color: cor });
      });
      const abaixo = A - 110 - Math.ceil(Math.min(cards.length, 6) / 3) * 96 - 20;
      if (paragrafos.length) paragrafo(pg, paragrafos.join(" "), MARGEM, abaixo, util * 0.8, { tam: 12, maxLinhas: 10 });
    }

    // fotos duas por página, lado a lado
    const restantes = bloco.fotos.slice(1);
    const gap = 16;
    const larguraCada = (util - gap) / 2;
    const alturaCada = A - MARGEM * 2 - 40;
    for (let i = 0; i < restantes.length; i += 2) {
      const pg = novaPagina();
      for (let k = 0; k < 2; k++) {
        const foto = restantes[i + k];
        if (!foto) break;
        const x = MARGEM + k * (larguraCada + gap);
        await desenharFoto(pg, foto, { x, y: A - MARGEM - alturaCada, l: larguraCada, a: alturaCada }, 1000);
        if (foto.legenda) pg.drawText(foto.legenda.slice(0, 60), { x, y: A - MARGEM - alturaCada - 14, size: 9, font: regular, color: CINZA });
      }
    }
    await paginaContato("Vamos conversar?");
  }

  return Buffer.from(await pdf.save());
}
