// Script de iteração local -- testa a correção de exposição fora do app, pra eu
// conseguir medir e ajustar sem depender de rodada de QA no navegador.
import sharp from "sharp";
import fs from "node:fs";

const ENTRADA = process.argv[2] || "../docs/pedra-teardown/fotos-teste/F_foto_escura.jpg";
const SAIDA = process.argv[3] || "../docs/pipeline-teste/resultados/teste-exposicao-v2.jpg";

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

async function medir(buffer, rotulo) {
  const stats = await sharp(buffer).stats();
  const [r, g, b] = stats.channels;
  const luminancia = 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
  const { data } = await sharp(buffer)
    .resize(200, 200, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const vals = Array.from(data).sort((a, b2) => a - b2);
  const mediana = vals[Math.floor(vals.length / 2)];
  const sombra = vals.filter((v) => v < 25).length / vals.length;
  const estourado = vals.filter((v) => v > 250).length / vals.length;
  console.log(
    `${rotulo}: luminancia=${luminancia.toFixed(1)} mediana=${mediana} R=${r.mean.toFixed(
      1
    )} G=${g.mean.toFixed(1)} B=${b.mean.toFixed(1)} R-B=${(r.mean - b.mean).toFixed(
      1
    )} sombra<25=${(sombra * 100).toFixed(1)}% estourado>250=${(estourado * 100).toFixed(
      1
    )}% desvio=${stats.channels[1].stdev.toFixed(1)}`
  );
  return { luminancia, mediana };
}

async function corrigirExposicaoV3(bytesOriginais) {
  // 1. Denoise leve ANTES de amplificar.
  const denoised = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).median(3).toBuffer();

  // 2. Balanço de branco gray-world (medido: neutraliza R-B corretamente).
  const stats1 = await sharp(denoised).stats();
  const [r1, g1, b1] = stats1.channels;
  const grayMedio1 = (r1.mean + g1.mean + b1.mean) / 3;
  const ganhoWb = [
    clamp(grayMedio1 / (r1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (g1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (b1.mean || 1), 0.6, 1.8),
  ];
  const balanceado = await sharp(denoised).linear(ganhoWb, [0, 0, 0]).jpeg({ quality: 95 }).toBuffer();

  // 3. Exposição via curva de POTÊNCIA aplicada manualmente num LUT (côncava: brilha
  //    sombra/meio-tom SEM nunca "estourar" o branco -- 255 sempre mapeia pra 255,
  //    ao contrário do ganho linear que multiplica reto e clipa o topo).
  //    (sharp.gamma() testado empiricamente e NÃO se comporta como esperado -- por
  //    isso o LUT é calculado à mão aqui.)
  const { data: mediaBuf } = await sharp(balanceado)
    .resize(200, 200, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const vals = Array.from(mediaBuf).sort((a, b2) => a - b2);
  const medianaAtual = Math.max(vals[Math.floor(vals.length / 2)], 3);

  const alvo = 115;
  let g = Math.log(medianaAtual / 255) / Math.log(alvo / 255);
  g = clamp(g, 1, 4.5);

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round(255 * Math.pow(v / 255, 1 / g));
  }

  const { data, info } = await sharp(balanceado).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
  const final = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return { final, g, ganhoWb, medianaAtual };
}

const original = fs.readFileSync(ENTRADA);
await medir(original, "ORIGINAL      ");

const { final, g, ganhoWb, medianaAtual } = await corrigirExposicaoV3(original);
fs.writeFileSync(SAIDA, final);
console.log(
  `gamma(v/255)^(1/g) usado: g=${g.toFixed(2)} | medianaAntes=${medianaAtual} | ganhoWb: ${ganhoWb
    .map((v) => v.toFixed(2))
    .join(", ")}`
);
await medir(final, "CORRIGIDO (v3)");
console.log(`Salvo em: ${SAIDA}`);
