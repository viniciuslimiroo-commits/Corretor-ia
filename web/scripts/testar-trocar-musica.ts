// TROCAR A MÚSICA DE UM VÍDEO PRONTO SEM MEXER NA IMAGEM.
//
// Pedido dele em 24/09/2026: "quero ter opção de trocar música ou áudio do vídeo mesmo depois
// que o vídeo for feito, até porque é algo simples".
//
// A promessa que a tela faz é forte -- "leva segundos, não gasta crédito, a imagem fica
// intacta" -- e este teste renderiza de verdade pra conferir cada parte dela. O que importa é
// a primeira: se o fluxo de vídeo for recodificado, cada troca de música degrada a imagem um
// pouco, e o corretor que testar três trilhas termina com um vídeo pior que o original.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-trocar-musica.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import ffmpegBin from "ffmpeg-static";
import { argsTrocarMusica } from "../src/lib/video-ffmpeg";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "encena-troca-"));
const FOTO = path.resolve(process.cwd(), "..", "docs", "fotos-origem", "casa.jpg");
const musica = (n: string) => path.resolve(process.cwd(), "public", "musica", n);
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const ff = (args: string[]) => execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 1 << 26 });
/**
 * A saída de diagnóstico do ffmpeg: é onde os fluxos são descritos.
 *
 * `spawnSync` e não `execFileSync` porque essa saída vai pro STDERR, e `execFileSync` devolve
 * só o stdout. Com ela, `sobre()` voltava string vazia e TRÊS conferências passavam sem
 * conferir nada -- a de 48 kHz acusou falha justamente por isso, com o arquivo correto.
 */
function sobre(f: string): string {
  const r = spawnSync(String(ffmpegBin), ["-hide_banner", "-i", f, "-f", "null", "-"], { maxBuffer: 1 << 26 });
  const texto = String(r.stderr ?? "");
  if (!texto.includes("Stream #")) throw new Error(`o ffmpeg não descreveu ${path.basename(f)} — a leitura está quebrada, não o arquivo`);
  return texto;
}

/** O conteúdo de um fluxo, isolado. Vídeo sai copiado; áudio sai como PCM, pra comparar som. */
function impressao(arquivo: string, fluxo: "v" | "a"): string {
  const saida = path.join(TMP, `f-${fluxo}-${path.basename(arquivo)}.bin`);
  ff(fluxo === "v" ? ["-i", arquivo, "-map", "0:v", "-c", "copy", "-f", "rawvideo", saida] : ["-i", arquivo, "-map", "0:a", "-f", "s16le", "-ar", "8000", "-ac", "1", saida]);
  return createHash("md5").update(fs.readFileSync(saida)).digest("hex");
}

function main() {
  const calma = musica("calma.m4a");
  const sereno = musica("sereno.m4a");
  for (const f of [FOTO, calma, sereno]) {
    if (!fs.existsSync(f)) {
      console.log(`não achei ${f}`);
      process.exit(1);
    }
  }

  // Um vídeo "pronto", montado como o produto monta: imagem codificada e trilha normalizada.
  const original = path.join(TMP, "pronto.mp4");
  ff([
    "-loop", "1", "-framerate", "24", "-t", "6", "-i", FOTO,
    "-stream_loop", "-1", "-i", calma,
    "-filter_complex", "[0:v]scale=540:960,format=yuv420p[v];[1:a]atrim=0:6,afade=t=in:d=1,volume=0.80,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-shortest", original,
  ]);

  const trocado = path.join(TMP, "trocado.mp4");
  ff(argsTrocarMusica({ video: original, musica: sereno, saida: trocado, duracao: 6 }));

  // ---- 1. a imagem não é tocada ----
  //
  // É o teste que sustenta a frase "a imagem fica intacta". Hash do fluxo de vídeo copiado:
  // se o ffmpeg recodificasse, o hash mudaria mesmo com a imagem parecendo igual.
  conferir(impressao(original, "v") === impressao(trocado, "v"), "a IMAGEM sai byte a byte igual — nada é recodificado");

  // ---- 2. o som muda ----
  conferir(impressao(original, "a") !== impressao(trocado, "a"), "e o SOM é outro");

  // ---- 3. o vídeo continua do mesmo tamanho ----
  const segundos = (f: string) => {
    const m = sobre(f).match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (!m) throw new Error(`não achei a duração de ${path.basename(f)}`);
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  };
  // Zero nos dois lados passaria neste teste sem testar nada: foi o que aconteceu enquanto a
  // leitura do ffmpeg estava quebrada.
  conferir(segundos(original) > 5, "e a leitura da duração funciona", `${segundos(original).toFixed(2)}s`);
  conferir(Math.abs(segundos(original) - segundos(trocado)) < 0.3, "e a duração não muda", `${segundos(original).toFixed(2)}s → ${segundos(trocado).toFixed(2)}s`);

  // ---- 4. "Sem música" deixa o vídeo mudo, e isso é uma escolha, não um erro ----
  const mudo = path.join(TMP, "mudo.mp4");
  ff(argsTrocarMusica({ video: original, saida: mudo, duracao: 6 }));
  conferir(!/Stream #\d+:\d+.*Audio:/.test(sobre(mudo)), "sem música escolhida, o vídeo sai mudo");
  conferir(impressao(original, "v") === impressao(mudo, "v"), "e a imagem continua intacta também no mudo");

  // ---- 5. a taxa de amostragem, que o loudnorm estraga se ninguém pedir ----
  //
  // O loudnorm trabalha a 192 kHz e entrega isso se ninguém mandar reamostrar. Já mordeu uma
  // vez na montagem; aqui a cadeia é nova e o mesmo cuidado tem que estar nela.
  conferir(/48000 Hz/.test(sobre(trocado)), "o áudio sai a 48 kHz, e não nos 192 kHz do loudnorm");

  // ---- 6. trocar duas vezes não degrada ----
  //
  // É o caso de uso de verdade: ouvir três trilhas até achar a certa. Se cada troca partisse
  // do arquivo já trocado e recodificasse, a terceira estaria visivelmente pior.
  const terceiro = path.join(TMP, "terceiro.mp4");
  ff(argsTrocarMusica({ video: trocado, musica: calma, saida: terceiro, duracao: 6 }));
  conferir(impressao(original, "v") === impressao(terceiro, "v"), "e depois de DUAS trocas a imagem ainda é a original");

  console.log(`\narquivos em ${TMP}`);
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
}

main();
