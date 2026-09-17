// Gera as MINIATURAS da aba Filtros: uma foto só, a mesma pra todos, já pronta.
//
// Antes cada cartão desenhava o filtro na foto da cena, no navegador: baixar a foto,
// calcular a tabela 3D e passar pixel por pixel -- vinte e um cartões pretos por um ou
// dois segundos, aparecendo aos poucos. Ele achou estranho ("esperar ficar todas as
// opções escuras"), e com razão: num cartão pra ESCOLHER, a foto genérica serve igual e
// abre na hora. A foto da cena continua no palco, que mostra o filtro escolhido de verdade.
//
// A cor sai da MESMA função que o vídeo usa (tabela 3D da grade + vinheta), então o cartão
// não é uma imitação do filtro. Rodar de novo quando um filtro mudar:
//
//   node --import ./scripts/ts-direto.mjs scripts/gerar-miniaturas-filtros.ts

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  AJUSTES_NEUTROS,
  MODELOS_FILTRO,
  anguloDaVinheta,
  escurecerComVinheta,
  fatorDaVinheta,
  gradeNeutra,
  lerTabela,
  tabelaDaGrade,
  vinhetaDaGrade,
  type Grade,
} from "../src/lib/filtros.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTA = path.join(RAIZ, "public", "filtros");
// Sala mobiliada clara, com planta verde, madeira, céu na janela e parede branca: tem as
// cores em que um filtro se nota. É a foto de exemplo do próprio site.
const FOTO = path.join(RAIZ, "public", "exemplos", "sala-depois.jpg");
const W = 216;
const H = 270; // 4:5, o cartão; 2x do tamanho na tela do celular
const PONTOS = 33; // o mesmo do servidor

fs.mkdirSync(PASTA, { recursive: true });

// O selo "Imagem ilustrativa" fica no pé da foto: corta antes do enquadramento 4:5.
const meta = await sharp(FOTO).metadata();
const semSelo = Math.round((meta.height ?? 0) * 0.86);
const { data: base } = await sharp(FOTO)
  .extract({ left: 0, top: 0, width: meta.width ?? 0, height: semSelo })
  .resize(W, H, { fit: "cover", position: "centre" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const ids = new Set<string>();
const saida = new Float32Array(3);
for (const f of MODELOS_FILTRO) {
  ids.add(f.id);
  const grade: Grade = { filtro: f.id, intensidade: 1, ajustes: AJUSTES_NEUTROS };
  const px = Buffer.from(base);
  if (!gradeNeutra(grade)) {
    const t = tabelaDaGrade(grade, PONTOS);
    const angulo = anguloDaVinheta(vinhetaDaGrade(grade));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        lerTabela(t, PONTOS, base[i] / 255, base[i + 1] / 255, base[i + 2] / 255, saida);
        const fv = angulo > 0 ? fatorDaVinheta(x, y, W, H, angulo) : 1;
        for (let c = 0; c < 3; c++) {
          const v = angulo > 0 ? escurecerComVinheta(saida[c], fv) : saida[c];
          px[i + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
        }
      }
    }
  }
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(PASTA, `${f.id}.jpg`));
}

// Miniatura de filtro que saiu do catálogo não fica servindo.
for (const arq of fs.readdirSync(PASTA)) {
  if (arq.endsWith(".jpg") && !ids.has(arq.replace(/\.jpg$/, ""))) fs.rmSync(path.join(PASTA, arq));
}
const bytes = [...ids].reduce((s, id) => s + fs.statSync(path.join(PASTA, `${id}.jpg`)).size, 0);
console.log(`${ids.size} miniaturas em public/filtros · ${(bytes / 1024).toFixed(0)} KB`);
