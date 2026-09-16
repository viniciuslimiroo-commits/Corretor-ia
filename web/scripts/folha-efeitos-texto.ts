// FOLHA DE CONTATO dos efeitos de texto -- pra OLHAR antes de dizer que ficou bom.
//
// A qualidade dos modelos de texto foi reprovada duas vezes por quem usa ("ta horrível",
// "qualidade ruim"). As duas vezes o defeito estava visível numa imagem e em nenhum teste
// de string. Então todo efeito passa por aqui: desenhado nas três situações em que vai
// aparecer de verdade, lado a lado:
//
//   - fundo escuro (como o cartão da galeria);
//   - por cima de FOTO REAL de imóvel, na parte clara (parede branca é o pior caso: texto
//     branco sem contorno some);
//   - com uma frase LONGA por cima da foto (o que o corretor escreve de verdade).
//
// E confere o que não se vê a olho: nenhum `<text>` (tem que ser contorno), todo `id` com
// o prefixo, tempo de desenho, e se sobrou tinta na imagem.
//
//   node --import ./scripts/ts-direto.mjs scripts/folha-efeitos-texto.ts <familia>
//   (lê src/lib/efeitos-texto/familia-<familia>.ts e grava docs/testes-reais/editor/efeitos-<familia>.jpg)

import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { desenharEfeito, type EfeitoTexto } from "../src/lib/efeitos-texto/nucleo.ts";

const familia = process.argv[2];
if (!familia) {
  console.error("uso: folha-efeitos-texto.ts <familia>");
  process.exit(1);
}

const RAIZ = path.resolve(import.meta.dirname, "..");
const modulo = await import(`../src/lib/efeitos-texto/familia-${familia}.ts`);
const EFEITOS: EfeitoTexto[] = modulo.EFEITOS;

const FOTO = path.join(RAIZ, "..", "docs", "testes-reais", "01-mobiliar-depois.jpg");
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "editor", `efeitos-${familia}.jpg`);
const FRASE_LONGA = "Aceita financiamento";

const COL = 460; // largura de cada coluna
const LIN = 190; // altura de cada linha
const ROTULO = 150;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  if (!ok) {
    console.log(`FALHA ${oque}${extra ? " · " + extra : ""}`);
    falhas++;
  }
};

/** Um pedaço CLARO da foto real (a parede), do tamanho de uma célula. */
const fundoFoto = await sharp(FOTO)
  .extract({ left: 0, top: 0, width: 1200, height: 500 })
  .resize(COL, LIN, { fit: "cover" })
  .png()
  .toBuffer();
const fundoEscuro = await sharp({ create: { width: COL, height: LIN, channels: 3, background: "#101318" } }).png().toBuffer();

/** Desenha, valida e encaixa uma peça numa célula (reduzindo se não couber). */
async function celula(e: EfeitoTexto, texto: string, corpo: number, fundo: Buffer, nome: string) {
  const t0 = performance.now();
  const d = desenharEfeito(e, texto, corpo, "folha");
  const ms = performance.now() - t0;

  conferir(!/<text[\s>]/.test(d.svg), `${e.id}: sem <text> (tem que ser contorno)`);
  const ids = [...d.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const semPrefixo = ids.filter((i) => !i.startsWith(`folha-${e.id}`));
  conferir(semPrefixo.length === 0, `${e.id}: todo id com o prefixo`, semPrefixo.join(", "));
  conferir(d.largura > 0 && d.altura > 0, `${e.id}: tamanho positivo`);

  let png: Buffer;
  const t1 = performance.now();
  try {
    png = await sharp(Buffer.from(d.svg)).png().toBuffer();
  } catch (err) {
    conferir(false, `${e.id}: o SVG rasteriza`, String(err).slice(0, 120));
    return { input: fundo, ms: 0 };
  }
  const msRaster = performance.now() - t1;
  conferir(ms + msRaster < 1500, `${e.id}: desenha em menos de 1,5s`, `${Math.round(ms + msRaster)}ms`);

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opacos = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opacos++;
  conferir(opacos / (info.width * info.height) > 0.05, `${e.id}: tem tinta`, `${nome} ${((opacos / (info.width * info.height)) * 100).toFixed(1)}%`);

  const escala = Math.min(1, (COL - 24) / info.width, (LIN - 20) / info.height);
  const peca = await sharp(png)
    .resize(Math.max(1, Math.round(info.width * escala)), Math.max(1, Math.round(info.height * escala)))
    .png()
    .toBuffer();
  const meta = await sharp(peca).metadata();
  const composto = await sharp(fundo)
    .composite([{ input: peca, left: Math.round((COL - (meta.width ?? 0)) / 2), top: Math.round((LIN - (meta.height ?? 0)) / 2) }])
    .png()
    .toBuffer();
  return { input: composto, ms: ms + msRaster };
}

const camadas: OverlayOptions[] = [];
for (let k = 0; k < EFEITOS.length; k++) {
  const e = EFEITOS[k];
  const y = k * LIN;
  const a = await celula(e, e.amostra, 110, fundoEscuro, "escuro");
  const b = await celula(e, e.amostra, 110, fundoFoto, "foto");
  const c = await celula(e, FRASE_LONGA, 72, fundoFoto, "frase");
  const rotulo = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ROTULO}" height="${LIN}"><rect width="${ROTULO}" height="${LIN}" fill="#1b1f26"/>` +
      `<text x="12" y="${LIN / 2 - 6}" font-family="Arial" font-size="16" fill="#fff">${e.rotulo.replace(/&/g, "&amp;")}</text>` +
      `<text x="12" y="${LIN / 2 + 16}" font-family="Arial" font-size="12" fill="#8a93a3">${e.fonte} · ${Math.round(a.ms)}ms</text></svg>`
  );
  camadas.push({ input: rotulo, left: 0, top: y }, { input: a.input, left: ROTULO, top: y }, { input: b.input, left: ROTULO + COL, top: y }, { input: c.input, left: ROTULO + COL * 2, top: y });
}

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
await sharp({ create: { width: ROTULO + COL * 3, height: Math.max(1, EFEITOS.length) * LIN, channels: 3, background: "#101318" } })
  .composite(camadas)
  .jpeg({ quality: 88 })
  .toFile(SAIDA);

console.log(`${EFEITOS.length} efeitos · folha: ${path.relative(path.join(RAIZ, ".."), SAIDA)}`);
console.log(falhas ? `${falhas} falha(s)` : "validações ok");
process.exit(falhas ? 1 : 0);
