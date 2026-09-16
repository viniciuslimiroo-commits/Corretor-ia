// AS FERRAMENTAS da barra da linha do tempo, medidas no arquivo final.
//
// Girar, espelhar e velocidade são três filtros que o ffmpeg aceita em qualquer ordem
// sem reclamar -- e dão vídeos diferentes conforme a ordem. Girar DEPOIS do corte
// recorta o pedaço errado; `setpts` DEPOIS do `fps` sai aos trancos; acelerar sem
// aumentar quanto se lê do arquivo faz o clipe acabar no meio e congelar o resto.
//
// Nenhum desses três dá erro. Por isso aqui não se confere a string do comando: cada
// ferramenta é comparada com o que ela PROMETE, no quadro que saiu.
//
//   girar 180   -> o quadro é o controle de cabeça pra baixo, pixel a pixel
//   girar 90/270-> um é o outro de cabeça pra baixo
//   espelhar    -> o quadro é o controle virado no espelho
//   velocidade  -> o quadro a 1s do 2x é o quadro a 2s do 1x
//
// E, no fim, a passagem pelo SANEAMENTO -- que é onde a arte de texto se perdia: o
// comando saía certo porque o teste nunca passava pelo `limparEspec`, e pela API de
// verdade o campo era jogado fora antes de chegar no ffmpeg.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-ferramentas-linha.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp, { type Sharp } from "sharp";
import { argsCenaFoto, argsCenaClipe } from "../src/lib/video-ffmpeg.ts";
import { limparEspec } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTOS = path.join(RAIZ, "..", "docs", "testes-reais");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-barra-"));

const W = 480;
const H = 854;
const DUR = 4;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function rodar(args: string[]) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr ?? "").trim().slice(0, 500) || "ffmpeg falhou");
}

/** Um quadro do vídeo, como PNG em disco. */
function quadro(video: string, quando: number, nome: string): string {
  const png = path.join(tmp, `${nome}.png`);
  rodar(["-ss", quando.toFixed(2), "-i", video, "-frames:v", "1", png]);
  return png;
}

async function pixels(png: string, transformar?: (s: Sharp) => Sharp) {
  const base = sharp(png).removeAlpha();
  return (transformar ? transformar(base) : base).raw().toBuffer();
}

/** Diferença média (0-255) entre dois buffers RGB do mesmo tamanho. */
function distancia(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) return 255;
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += Math.abs(a[i] - b[i]);
  return soma / a.length;
}

const foto = path.join(FOTOS, "01-mobiliar-depois.jpg");
if (!fs.existsSync(foto)) {
  console.error(`foto real faltando: ${foto}`);
  process.exit(1);
}

console.log(`ferramentas da linha do tempo, medidas no arquivo · ${W}x${H}\n`);

// ---------- girar e espelhar, numa cena de foto ----------
//
// `parado` de propósito: com a câmera andando, dois renders nunca caem no mesmo quadro,
// e a diferença medida seria o movimento, não o giro.
function cenaFoto(nome: string, extra: { giro?: number; espelho?: boolean }) {
  const saida = path.join(tmp, `${nome}.mp4`);
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], ...extra }));
  return quadro(saida, 1.5, nome);
}

const controle = cenaFoto("controle", {});
const g180 = cenaFoto("g180", { giro: 180 });
const g90 = cenaFoto("g90", { giro: 90 });
const g270 = cenaFoto("g270", { giro: 270 });
const esp = cenaFoto("esp", { espelho: true });

// Meia volta não muda a proporção, então o corte cai no mesmo lugar: o quadro tem que
// ser o controle de cabeça pra baixo, com a folga de um recompressão de vídeo.
const dGiro180 = distancia(await pixels(controle, (s) => s.rotate(180)), await pixels(g180));
conferir(dGiro180 < 6, "girar meia volta = o controle de cabeça pra baixo", `distância ${dGiro180.toFixed(2)}`);

const dGiro90 = distancia(await pixels(g90, (s) => s.rotate(180)), await pixels(g270));
conferir(dGiro90 < 6, "um quarto de volta pra cada lado: um é o outro de cabeça pra baixo", `distância ${dGiro90.toFixed(2)}`);

// E o quarto de volta tem que MUDAR o quadro -- senão o teste acima passaria com o
// filtro desligado nos dois lados.
const dMudou = distancia(await pixels(controle), await pixels(g90));
conferir(dMudou > 20, "um quarto de volta muda mesmo o quadro", `distância ${dMudou.toFixed(2)}`);

const dEsp = distancia(await pixels(controle, (s) => s.flop()), await pixels(esp));
conferir(dEsp < 6, "espelhar = o controle virado no espelho", `distância ${dEsp.toFixed(2)}`);

// ---------- velocidade, numa cena de clipe ----------
//
// O clipe de teste PRECISA mudar ao longo do tempo: num clipe parado, 1x e 2x dão
// quadros idênticos e o teste passaria com a velocidade desligada.
const clipe = path.join(tmp, "andando.mp4");
rodar([
  "-loop", "1", "-framerate", "30", "-t", "12", "-i", foto,
  "-vf", `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='min(zoom+0.0015,1.6)':d=360:s=${W}x${H}:fps=30,format=yuv420p`,
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clipe,
]);

function cenaClipe(nome: string, velocidade: number) {
  const saida = path.join(tmp, `${nome}.mp4`);
  rodar(argsCenaClipe({ clipe, saida, W, H, duracao: 8, textos: [], velocidade }));
  return saida;
}

const umX = cenaClipe("v1", 1);
const doisX = cenaClipe("v2", 2);

// O quadro a 1s do dobro é o quadro a 2s do normal.
const dVel = distancia(await pixels(quadro(umX, 2, "v1-2s")), await pixels(quadro(doisX, 1, "v2-1s")));
conferir(dVel < 8, "2x: o quadro a 1s é o quadro a 2s do normal", `distância ${dVel.toFixed(2)}`);

// E, no mesmo instante, os dois têm que ser DIFERENTES -- senão o "acerto" acima seria
// só o clipe estando parado.
const dVelMesmo = distancia(await pixels(quadro(umX, 1, "v1-1s")), await pixels(quadro(doisX, 1, "v2-1s-b")));
conferir(dVelMesmo > 4, "2x e 1x não mostram a mesma coisa no mesmo instante", `distância ${dVelMesmo.toFixed(2)}`);

// O clipe acelerado não pode acabar antes e congelar: no fim ele ainda tem que estar
// adiante de onde o normal está.
const dFim = distancia(await pixels(quadro(doisX, 6.5, "v2-fim")), await pixels(quadro(umX, 6.5, "v1-fim")));
conferir(dFim > 4, "acelerado não trava no meio: no fim ainda está adiante", `distância ${dFim.toFixed(2)}`);

// ---------- o saneamento guarda o que a barra escolheu ----------
//
// Esta é a parte que faltava. A arte de texto funcionava no ffmpeg e sumia pela API
// porque `limparTextos` não copiava o campo: o teste media o comando, e o comando
// nunca tinha passado pelo saneamento.
const bruto = {
  formato: "9:16",
  cenas: [
    {
      tipo: "clipe",
      arquivo: "conta/clipe.mp4",
      duracao: 5,
      giro: 90,
      espelho: true,
      velocidade: 2,
      congelar: true,
      inicio: 1.5,
      textos: [{ texto: "À venda", arte: "adesivo", posicao: "centro", visual: { cor: "ffffff", caixa: "f06b4f" } }],
    },
    { tipo: "tour360", arquivo: "conta/pano.jpg", duracao: 8, giro: 90, espelho: true, velocidade: 2, congelar: true },
    { tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4, giro: 47, velocidade: 2, congelar: true },
  ],
};
const { espec, erro } = limparEspec(bruto);
if (!espec) {
  conferir(false, "o saneamento aceita o espec da barra", erro ?? "");
} else {
  const [c0, c360, cFoto] = espec.cenas;
  conferir(c0.giro === 90 && c0.espelho === true, "clipe: giro e espelho sobrevivem");
  conferir(c0.velocidade === 2 && c0.congelar === true, "clipe: velocidade e congelar sobrevivem");
  conferir(c0.textos?.[0]?.arte === "adesivo", "texto: a ARTE sobrevive ao saneamento", `arte=${c0.textos?.[0]?.arte ?? "sumiu"}`);
  conferir(c0.textos?.[0]?.visual?.caixa === "f06b4f", "texto: o ACABAMENTO sobrevive ao saneamento", `caixa=${c0.textos?.[0]?.visual?.caixa ?? "sumiu"}`);
  conferir(c360.giro === undefined && c360.espelho === undefined, "360: giro e espelho são recusados (deitariam o mundo)");
  conferir(cFoto.velocidade === undefined && cFoto.congelar === undefined, "foto: velocidade e congelar são recusados (não há vídeo correndo)");
  conferir(cFoto.giro === 90, "giro torto vira o quarto de volta mais próximo", `47° -> ${cFoto.giro}°`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
