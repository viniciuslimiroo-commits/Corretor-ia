// Os CONSERTOS da fase 1 da linha do tempo, medidos em vídeo de verdade (fotos reais).
//
// Roda o ffmpeg com os comandos que o servidor monta, sem banco e sem crédito:
//
//   1. Você que entra depois do começo: o clipe dele ANDA a partir de `entra` (antes saía
//      adiantado e congelava). SSIM da região dele contra o quadro certo da origem.
//   2. Efeito sonoro sem música e sem voz: som em CADA virada, e o áudio do tamanho do
//      vídeo (antes só a primeira virada tinha som).
//   3. "Só no fim" num clipe de 8s: o texto entra aos 4,96s (antes, aos 2,48s).
//   4. A duração do vídeo pronto é a do relógio.
//
// Cada conserto roda também com o comando de ANTES (o conserto desfeito no texto do
// comando) e tem que FALHAR -- é o que prova que a medida enxerga o defeito.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-consertos-montagem.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const FF = ffmpegStatic as unknown as string;
process.env.FFMPEG_PATH ??= FF;
const { LIMITES, TAMANHOS_APRESENTADOR, emendasDoVideo, relogioDoEspec } = await import("../src/lib/video.ts");
const { argsCenaClipe, argsCenaFoto, argsMontagem } = await import("../src/lib/video-ffmpeg.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTOS = path.join(RAIZ, "..", "docs", "testes-reais");
const PROVAS = path.join(FOTOS, "editor");
fs.mkdirSync(PROVAS, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-consertos-"));
const t = (nome: string) => path.join(tmp, nome);

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function ff(args: string[], oque: string): string {
  const r = spawnSync(FF, ["-y", "-hide_banner", "-nostdin", ...args], { encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${oque}: ${String(r.stderr).slice(-800)}`);
  return String(r.stderr);
}
function duracaoDe(arquivo: string): number {
  const s = spawnSync(FF, ["-hide_banner", "-i", arquivo], { encoding: "utf8" }).stderr;
  const m = String(s).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}
/** Um quadro do vídeo no segundo pedido, com um filtro de recorte, em PNG. */
function quadro(arquivo: string, segundo: number, vf: string, nome: string): string {
  const saida = t(`${nome}.png`);
  ff(["-ss", segundo.toFixed(3), "-i", arquivo, "-frames:v", "1", "-vf", vf, saida], `quadro ${nome}`);
  return saida;
}
function ssim(a: string, b: string): number {
  const s = ff(["-i", a, "-i", b, "-lavfi", "[0:v]format=gray[x];[1:v]format=gray[y];[x][y]ssim", "-f", "null", "-"], "ssim");
  const m = s.match(/All:([\d.]+)/);
  return m ? Number(m[1]) : NaN;
}
/** Diferença média (0–255) entre dois quadros do mesmo tamanho. */
function diferenca(a: string, b: string): number {
  const bruto = (x: string) => spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-i", x, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 * 1024 * 1024 }).stdout as Buffer;
  const da = bruto(a);
  const db = bruto(b);
  const n = Math.min(da.length, db.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(da[i] - db[i]);
  return s / Math.max(1, n);
}

const W = 540;
const H = 960;

// ---------- material: cenas de fotos reais e um "Você" feito de duas fotos reais ----------
const fotos = ["01-mobiliar-depois.jpg", "02-mobiliar-depois.jpg", "03-mobiliar-depois.jpg"].map((f) => path.join(FOTOS, f));
const espec = { formato: "9:16", transicao: "dissolver", telaFinal: false, cenas: fotos.map(() => ({ tipo: "foto", duracao: 4 })) } as never;
const relogio = relogioDoEspec(espec);
const emendas = emendasDoVideo(espec);
const clipes = fotos.map((foto, i) => {
  const saida = t(`cena${i}.mp4`);
  ff(argsCenaFoto({ foto, saida, W, H, duracao: 4, efeito: i % 2 ? "afastar" : "aproximar" }), `cena ${i}`);
  return saida;
});
// Duas fotos diferentes com corte seco aos 2,5s: o quadro certo e o errado não se parecem.
const apre = t("apre.mp4");
ff(
  [
    "-loop", "1", "-t", "2.5", "-i", path.join(FOTOS, "04-mobiliar-depois.jpg"),
    "-loop", "1", "-t", "4.5", "-i", path.join(FOTOS, "16-melhorar-depois.jpg"),
    "-filter_complex", "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setsar=1[a];[1:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setsar=1[b];[a][b]concat=n=2:v=1[v]",
    "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "12", apre,
  ],
  "clipe do Você"
);
console.log(`relógio: inícios ${relogio.clipes.map((c) => c.inicio.toFixed(3)).join(", ")} · total ${relogio.total}`);

const desfazerVoce = (args: string[]) => args.map((a) => a.replace(/setpts=PTS-STARTPTS\+[\d.]+\/TB/g, "setpts=PTS-STARTPTS").replace(/:eof_action=pass:/g, ":"));
const desfazerEfeito = (args: string[]) =>
  args.map((a) => a.replace(/;anullsrc=r=48000:cl=stereo,atrim=0:[\d.]+\[silencio\]/, "").replace("[silencio][ef0]", "[ef0]").replace(/amix=inputs=(\d+)/, (_, n) => `amix=inputs=${Number(n) - 1}`));

// ---------- 1. Você entrando na terceira cena ----------
console.log("\n--- 1. Você que entra depois do começo ---");
const entra = relogio.clipes[2].inicio;
for (const formato of ["rodape", "circulo"] as const) {
  const argsNovo = argsMontagem({
    clipes, duracoes: [4, 4, 4], saida: t(`voce-${formato}.mp4`), W, H, emendas,
    apresentador: { arquivo: "x", formato, canto: "inferior_direito", tamanho: "medio", entra, inicio: 1, volume: 1, arquivoLocal: apre, temAudio: false, duracaoClipe: Math.min(6, relogio.total - entra) },
  });
  // Onde ele fica e como a origem é recortada: a mesma conta do `argsMontagem`.
  let recorteSaida: string;
  let recorteOrigem: string;
  if (formato === "rodape") {
    const altura = Math.round(H * 0.3);
    recorteSaida = `crop=${W}:${altura}:0:${H - altura}`;
    recorteOrigem = `scale=${W}:${altura}:force_original_aspect_ratio=increase,crop=${W}:${altura}`;
  } else {
    const lado = Math.round(W * (TAMANHOS_APRESENTADOR.find((x) => x.id === "medio")?.fracao ?? 0.34));
    // O overlay num vídeo yuv420p cai na coordenada PAR (a cor é guardada a cada 2 pixels):
    // y 661 vira 660. Recortar em 661 dá SSIM 0,57 com o quadro certo; em 660, 0,99.
    const x = W - lado - Math.round(W * 0.04);
    const y = H - lado - Math.round(H * 0.12);
    const par = (v: number) => v - (v % 2);
    // Só o miolo do círculo: fora dele aparece a foto de trás.
    const m = Math.round(lado * 0.2);
    const miolo = lado - 2 * m;
    recorteSaida = `format=rgb24,crop=${miolo}:${miolo}:${par(x) + m}:${par(y) + m}`;
    recorteOrigem = `scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado},crop=${miolo}:${miolo}:${m}:${m}`;
  }
  const medir = (args: string[], rotulo: string) => {
    const saida = args[args.length - 1];
    ff(args, `montagem ${rotulo}`);
    const cedo = ssim(quadro(saida, entra + 0.5, recorteSaida, `${rotulo}-a`), quadro(apre, 1.5, recorteOrigem, `${rotulo}-ref-a`));
    const tarde = ssim(quadro(saida, entra + 2.5, recorteSaida, `${rotulo}-b`), quadro(apre, 3.5, recorteOrigem, `${rotulo}-ref-b`));
    return { cedo, tarde, saida };
  };
  const novo = medir(argsNovo, `novo-${formato}`);
  conferir(novo.cedo >= 0.9 && novo.tarde >= 0.9, `${formato}: o Você anda a partir de ${entra.toFixed(2)}s (SSIM ≥ 0,9 nos dois instantes)`, `${novo.cedo.toFixed(3)} / ${novo.tarde.toFixed(3)}`);
  conferir(Math.abs(duracaoDe(novo.saida) - relogio.total) <= 0.05, `${formato}: duração do vídeo = relógio`, `${duracaoDe(novo.saida).toFixed(3)} x ${relogio.total}`);
  const velho = medir(desfazerVoce(argsNovo).map((a) => (a === novo.saida ? t(`voce-${formato}-antes.mp4`) : a)), `antes-${formato}`);
  conferir(!(velho.cedo >= 0.9 && velho.tarde >= 0.9), `${formato}: o comando de ANTES falha na mesma medida`, `${velho.cedo.toFixed(3)} / ${velho.tarde.toFixed(3)}`);
  if (formato === "circulo") ff(["-ss", (entra + 2.5).toFixed(2), "-i", novo.saida, "-frames:v", "1", "-vf", "scale=360:-2", path.join(PROVAS, "voce-entra-tarde.jpg")], "prova");
}

// ---------- 2. efeito sonoro sem música e sem voz ----------
console.log("\n--- 2. som em cada virada, sem música nem voz ---");
{
  const clique = path.join(RAIZ, "public", "efeitos", "clique.m4a");
  const argsNovo = argsMontagem({ clipes, duracoes: [4, 4, 4], saida: t("efeito.mp4"), W, H, emendas, efeitoSonoro: clique });
  // A virada é o offset do xfade: soma das durações menos as emendas até ali.
  const viradas = emendas.map((_, k) => [4, 4, 4].slice(0, k + 1).reduce((s, d) => s + d, 0) - emendas.slice(0, k + 1).reduce((s, e) => s + e.segundos, 0));
  const medir = (args: string[], saida: string) => {
    ff(args.map((a) => (a === args[args.length - 1] ? saida : a)), "montagem com efeito");
    const pcm = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-i", saida, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], { maxBuffer: 256 * 1024 * 1024 }).stdout as Buffer;
    const amostras = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const energia = (de: number, ate: number) => {
      let s = 0;
      const a = Math.max(0, Math.floor(de * 48000));
      const b = Math.min(amostras.length, Math.floor(ate * 48000));
      for (let i = a; i < b; i++) s += amostras[i] * amostras[i];
      return Math.sqrt(s / Math.max(1, b - a));
    };
    /** Primeira amostra acima de 10% do pico da janela: onde o clique começa. */
    const ataque = (de: number, ate: number) => {
      const a = Math.max(0, Math.floor(de * 48000));
      const b = Math.min(amostras.length, Math.floor(ate * 48000));
      let pico = 0;
      for (let i = a; i < b; i++) pico = Math.max(pico, Math.abs(amostras[i]));
      for (let i = a; i < b; i++) if (Math.abs(amostras[i]) >= pico * 0.1 && pico > 200) return i / 48000;
      return NaN;
    };
    return { segundosDeAudio: amostras.length / 48000, energias: viradas.map((v) => energia(v - 0.02, v + 0.4)), ataques: viradas.map((v) => ataque(v - 0.2, v + 0.6)), silencio: energia(1, 2) };
  };
  const novo = medir(argsNovo, t("efeito-novo.mp4"));
  console.log(`     viradas ${viradas.map((v) => v.toFixed(2)).join(", ")} · energia ${novo.energias.map((e) => e.toFixed(0)).join(", ")} · silêncio ${novo.silencio.toFixed(0)}`);
  conferir(Math.abs(novo.segundosDeAudio - relogio.total) <= 0.05, "áudio do tamanho do vídeo", `${novo.segundosDeAudio.toFixed(3)} x ${relogio.total}`);
  conferir(novo.energias.every((e) => e > 300 && e > novo.silencio * 10), "som em CADA virada");
  const atraso = novo.ataques.map((a, i) => a - viradas[i]);
  conferir(atraso.every((d) => Number.isFinite(d) && Math.abs(d) <= 0.05 + Math.abs(atraso[0]) && Math.abs(d - atraso[0]) <= 0.02), "cada som começa na sua virada (±0,02 entre elas)", atraso.map((d) => d.toFixed(3)).join(", "));
  const velho = medir(desfazerEfeito(argsNovo), t("efeito-antes.mp4"));
  conferir(!(velho.energias.every((e) => e > 300) && Math.abs(velho.segundosDeAudio - relogio.total) <= 0.05), "o comando de ANTES falha na mesma medida", `áudio ${velho.segundosDeAudio.toFixed(2)}s · energia ${velho.energias.map((e) => e.toFixed(0)).join(", ")}`);
}

// ---------- 3. "só no fim" num clipe de 8s ----------
console.log("\n--- 3. texto \"só no fim\" num clipe de 8s ---");
{
  const textos = [{ texto: "R$ 690.000", posicao: "base", estilo: "gigante", animacao: "no_fim" }] as never;
  const com = t("clipe-texto.mp4");
  const sem = t("clipe-sem.mp4");
  ff(argsCenaClipe({ clipe: apre, saida: com, W, H, duracao: 8, textos }), "clipe com texto");
  ff(argsCenaClipe({ clipe: apre, saida: sem, W, H, duracao: 8 }), "clipe sem texto");
  const esperado = 8 * 0.62;
  const dif = (s: number) => diferenca(quadro(com, s, "null", `com-${s}`), quadro(sem, s, "null", `sem-${s}`));
  const antesDaHora = dif(3.0);
  const quaseLa = dif(esperado - 2 / 24);
  const entrou = dif(esperado + 2 / 24);
  console.log(`     diferença com x sem texto: 3,0s ${antesDaHora.toFixed(2)} · ${(esperado - 2 / 24).toFixed(2)}s ${quaseLa.toFixed(2)} · ${(esperado + 2 / 24).toFixed(2)}s ${entrou.toFixed(2)}`);
  conferir(antesDaHora < 0.5 && quaseLa < 0.5, "sem texto antes de 4,96s (antes entrava em 2,48s)");
  conferir(entrou > 1.5, "com texto logo depois de 4,96s");
  conferir(Math.abs(duracaoDe(com) - 8) <= 0.05, "o clipe tem 8s", duracaoDe(com).toFixed(3));
}

conferir(LIMITES.telaFinalSegundos > 0, "limites carregados");
if (!process.env.MANTER) fs.rmSync(tmp, { recursive: true, force: true });
else console.log("temporários em", tmp);
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
