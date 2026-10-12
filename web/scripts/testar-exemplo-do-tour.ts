// O EXEMPLO DO TOUR ANDA O BASTANTE PRA PARECER UM TOUR?
//
// Ele em 11/10/2026, olhando a primeira versão: "tour pela casa está parado! tour não é
// assim não". Estava certo, e o defeito era meu: gerei o arquivo com `efeito: "parado"`,
// que desliga o movimento que o ffmpeg põe POR CIMA do clipe da IA. O produto soma os dois
// -- a IA dá a paralaxe, o ffmpeg dá a distância (video-ffmpeg.ts: a IA sozinha anda 8,1 e
// o alvo é 16,4). Sozinho, o clipe da IA satura e parece parado.
//
// "O vídeo toca" não detecta isso: um clipe quase imóvel toca perfeitamente. Então aqui se
// mede QUANTO a imagem muda ao longo do arquivo -- e exige que continue mudando até o fim,
// que é o que separa um tour de um empurrãozinho.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-exemplo-do-tour.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ARQUIVO = path.join(RAIZ, "public/exemplos/tour-camera.mp4");
const ff = ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Quanto, em média por pixel (0 a 255), o instante `t` difere do primeiro quadro. */
async function distancia(dir: string, t: number, base: Buffer): Promise<number> {
  const png = path.join(dir, `${t}.png`);
  spawnSync(ff, ["-ss", String(t), "-i", ARQUIVO, "-frames:v", "1", "-y", png, "-loglevel", "error"]);
  const a = await sharp(png).resize(144, 256).greyscale().raw().toBuffer();
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - base[i]);
  return s / a.length;
}

async function main() {
  conferir(fs.existsSync(ARQUIVO), "o exemplo do tour está no projeto", fs.existsSync(ARQUIVO) ? `${Math.round(fs.statSync(ARQUIVO).size / 1024)} kB` : "falta public/exemplos/tour-camera.mp4");
  if (!fs.existsSync(ARQUIVO)) return;

  // Leve: a janelinha tem 152px e o arquivo viaja em toda visita à página.
  conferir(fs.statSync(ARQUIVO).size < 400 * 1024, "e é leve o bastante pra carregar sem pesar", `${Math.round(fs.statSync(ARQUIVO).size / 1024)} kB`);

  const info = spawnSync(ff, ["-i", ARQUIVO], { encoding: "utf8" }).stderr ?? "";
  const dim = /, (\d+)x(\d+)/.exec(info);
  const dur = /Duration: 00:00:(\d+\.\d+)/.exec(info);
  conferir(!!dim && Number(dim[2]) > Number(dim[1]), "é em pé (9:16), como o vídeo que o Encena gera", dim ? `${dim[1]}x${dim[2]}` : "não li as dimensões");
  conferir(!!dur && Number(dur[1]) >= 3, "dura pelo menos 3 s", dur ? `${dur[1]}s` : "não li a duração");
  conferir(!/Audio:/.test(info), "sem faixa de áudio (a janelinha é muda)");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tour-"));
  const zero = path.join(dir, "0.png");
  spawnSync(ff, ["-ss", "0", "-i", ARQUIVO, "-frames:v", "1", "-y", zero, "-loglevel", "error"]);
  const base = await sharp(zero).resize(144, 256).greyscale().raw().toBuffer();

  const meio = await distancia(dir, 0.5, base);
  const dois = await distancia(dir, 2, base);
  const fim = await distancia(dir, 3.8, base);

  // O PISO. Medido: com `efeito: "parado"` (só o clipe da IA) o fim dava 9,9 e parecia
  // imóvel; com `direita` por cima dá 31,2. 20 fica no meio, longe dos dois.
  conferir(fim >= 20, "a câmera percorre o ambiente de verdade", `o fim difere ${fim.toFixed(1)} do começo (piso 20; só a IA dava 9,9)`);

  // E NÃO SATURA. O sintoma do clipe cru não era só andar pouco: era andar tudo no primeiro
  // meio segundo e estacionar. Tour que para no meio parece foto com susto.
  conferir(dois > meio * 1.6, "e continua andando depois do começo (não dá um pulo e para)", `0,5s=${meio.toFixed(1)} · 2s=${dois.toFixed(1)}`);
  conferir(fim > dois, "até o fim do clipe", `2s=${dois.toFixed(1)} · 3,8s=${fim.toFixed(1)}`);

  fs.rmSync(dir, { recursive: true, force: true });
}

main().then(
  () => {
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  },
  (e) => {
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
);
