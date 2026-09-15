// Áudio do vídeo (Fase 2 do editor): voz própria, volumes, início e a música abaixando
// sozinha durante a fala. Duas metades, as duas medidas:
//
//   1. O CONTRATO. O espec aceita voz de IA, gravada e enviada; a voz da pessoa NÃO custa
//      crédito; volume e início são limitados; caminho de arquivo com ".." é recusado. E o
//      filtro do ffmpeg sai com sidechaincompress, asplit, adelay e os volumes pedidos.
//
//   2. O SOM DE VERDADE. Renderiza com o ffmpeg real, com a música real do produto, e MEDE
//      quantos decibéis a música perde enquanto a voz fala. A voz aqui é um tom puro de
//      1 kHz de propósito: dá pra tirá-lo do resultado com um filtro rejeita-faixa e medir
//      só a música, o que com fala humana seria impossível de separar.
//
//   node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-video-audio.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { argsMontagem } from "../src/lib/video-ffmpeg.ts";
import { LIMITES, custoDoVideo, limparEspec, vozDeIA } from "../src/lib/video.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const MUSICA = path.join(RAIZ, "assets", "musica", "calma.m4a");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "encena-audio-"));

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const rodar = (args, timeout = 120_000) => execFileSync(ffmpeg, ["-y", "-hide_banner", "-nostdin", ...args], { timeout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const JOB = "11111111-2222-4333-8444-555555555555";
const base = { formato: "9:16", cenas: [{ tipo: "foto", jobId: JOB }, { tipo: "foto", jobId: JOB }], musica: "calma", telaFinal: false };

console.log("--- 1. o contrato ---");
{
  const { espec } = limparEspec({ ...base, narracao: { origem: "ia", roteiro: "Apartamento de três quartos no Setor Bueno.", voz: "daniel" } });
  conferir(espec.narracao?.origem === "ia" && espec.narracao.voz === "daniel", "voz de IA é guardada");
  conferir(custoDoVideo(espec) === 1, "voz de IA custa 1 crédito", String(custoDoVideo(espec)));
  conferir(vozDeIA(espec.narracao), "vozDeIA reconhece");
}
{
  const { espec } = limparEspec({ ...base, narracao: { origem: "gravada", arquivo: "uploads/u1/voz.webm" } });
  conferir(espec.narracao?.origem === "gravada" && espec.narracao.arquivo === "uploads/u1/voz.webm", "voz gravada é guardada");
  conferir(custoDoVideo(espec) === 0, "voz própria NÃO custa crédito", String(custoDoVideo(espec)));
  conferir(!vozDeIA(espec.narracao), "vozDeIA diz que não é IA");
}
{
  const { espec } = limparEspec({ ...base, narracao: { origem: "enviada", arquivo: "../../etc/senha" } });
  conferir(espec.narracao === null, "caminho com .. é recusado");
}
{
  const { espec } = limparEspec({ ...base, narracao: { origem: "gravada" } });
  conferir(espec.narracao === null, "voz própria sem arquivo não entra");
}
{
  const { espec } = limparEspec({ ...base, narracao: { roteiro: "Texto de um vídeo antigo, sem origem gravada.", voz: "laura" } });
  conferir(espec.narracao?.origem === "ia", "espec antigo (sem origem) continua sendo IA", String(espec.narracao?.origem));
  conferir(espec.narracao?.inicio === 0.7 && espec.narracao?.volume === 1, "e ganha os padrões de volume e início");
}
{
  const { espec } = limparEspec({ ...base, narracao: { origem: "gravada", arquivo: "uploads/u1/v.mp3", volume: 99, inicio: 999 } });
  conferir(espec.narracao?.volume === 2, "volume é limitado a 2", String(espec.narracao?.volume));
  conferir(espec.narracao?.inicio === LIMITES.vozInicioMax, `início é limitado a ${LIMITES.vozInicioMax}s`, String(espec.narracao?.inicio));
}
{
  const { espec } = limparEspec({ ...base, musicaVolume: 5 });
  conferir(espec.musicaVolume === 1, "volume da música é limitado a 1");
  const { espec: e2 } = limparEspec({ ...base });
  conferir(e2.musicaVolume === LIMITES.musicaVolumePadrao, "sem volume informado, o padrão");
}
{
  const a = argsMontagem({ clipes: ["a.mp4", "b.mp4"], duracoes: [4, 4], saida: "s.mp4", W: 1080, H: 1920, emendas: [{ xfade: "dissolve", segundos: 0.6 }], musica: "m.m4a", narracao: "v.mp3", musicaVolume: 0.6, vozVolume: 1.4, vozInicio: 2 });
  const f = a[a.indexOf("-filter_complex") + 1];
  conferir(f.includes("sidechaincompress"), "o filtro tem ducking");
  conferir(f.includes("asplit=2"), "a voz é dividida (ouvir + servir de gatilho)");
  conferir(f.includes("adelay=2000|2000"), "o início vira atraso em ms", "2s");
  conferir(f.includes("volume=1.40"), "volume da voz");
  conferir(f.includes("volume=0.60"), "volume da música");
  const semVoz = argsMontagem({ clipes: ["a.mp4"], duracoes: [4], saida: "s.mp4", W: 1080, H: 1920, emendas: [], musica: "m.m4a", musicaVolume: 0.5 });
  const f2 = semVoz[semVoz.indexOf("-filter_complex") + 1];
  conferir(!f2.includes("sidechaincompress"), "sem voz, sem ducking");
  conferir(f2.includes("volume=0.50"), "sem voz, a música fica no volume pedido");
}

// ---------------------------------------------------------------------------------
console.log("\n--- 2. o som de verdade (ffmpeg, música real) ---");
conferir(fs.existsSync(MUSICA), `música do produto existe (${path.basename(MUSICA)})`);

// Vídeo mudo de 14s, e uma "voz" que só existe entre 4s e 8s.
const clipe = path.join(dir, "clipe.mp4");
rodar(["-f", "lavfi", "-i", "color=c=0x0f2d5b:s=360x640:d=14:r=24", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", clipe]);
const voz = path.join(dir, "voz.wav");
rodar(["-f", "lavfi", "-i", "sine=frequency=1000:duration=4:sample_rate=44100", "-af", "volume=0.6", voz]);

const saida = path.join(dir, "com-ducking.mp4");
rodar(
  argsMontagem({
    clipes: [clipe],
    duracoes: [14],
    saida,
    W: 360,
    H: 640,
    emendas: [],
    musica: MUSICA,
    narracao: voz,
    musicaVolume: 0.8,
    vozVolume: 1,
    vozInicio: 4,
  }),
  180_000
);
conferir(fs.existsSync(saida) && fs.statSync(saida).size > 10_000, "renderizou com o filtro de ducking", `${Math.round(fs.statSync(saida).size / 1024)} KB`);

/**
 * Nível médio (dB) de um trecho, com o tom de 1 kHz removido pelo rejeita-faixa: o que
 * sobra é só a música. O `volumedetect` escreve no stderr, por isso spawnSync.
 */
function medir(arquivo, inicio, duracao) {
  const r = spawnSync(
    ffmpeg,
    ["-hide_banner", "-nostdin", "-ss", String(inicio), "-t", String(duracao), "-i", arquivo, "-af", "bandreject=f=1000:width_type=h:w=300,volumedetect", "-f", "null", "-"],
    { encoding: "utf8", timeout: 60_000 }
  );
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(r.stderr));
  return m ? Number(m[1]) : NaN;
}

const antes = medir(saida, 1.5, 2); // música sozinha
const durante = medir(saida, 5, 2.5); // voz falando
const depois = medir(saida, 10, 2); // voz acabou, música volta
console.log(`     música sozinha ${antes.toFixed(1)} dB · durante a voz ${durante.toFixed(1)} dB · depois ${depois.toFixed(1)} dB`);
conferir(Number.isFinite(antes) && Number.isFinite(durante) && Number.isFinite(depois), "consegui medir os três trechos");
conferir(durante < antes - 4, "a música ABAIXA durante a voz", `queda de ${(antes - durante).toFixed(1)} dB`);
conferir(depois > durante + 3, "e VOLTA quando a voz acaba", `sobe ${(depois - durante).toFixed(1)} dB`);

// Sem voz nenhuma, nada abaixa: é o controle do experimento.
const semVoz = path.join(dir, "sem-voz.mp4");
rodar(argsMontagem({ clipes: [clipe], duracoes: [14], saida: semVoz, W: 360, H: 640, emendas: [], musica: MUSICA, musicaVolume: 0.8 }), 180_000);
const c1 = medir(semVoz, 1.5, 2);
const c2 = medir(semVoz, 5, 2.5);
conferir(Math.abs(c1 - c2) < 3, "sem voz, a música fica estável o vídeo todo", `${c1.toFixed(1)} vs ${c2.toFixed(1)} dB`);

fs.rmSync(dir, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
