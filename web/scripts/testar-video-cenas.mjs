// Spike 2: render POR CENA (uma foto, 4s) e depois a montagem final (xfade entre clipes
// já renderizados + música). É o desenho que cabe em funções curtas: cada cena numa
// chamada, a montagem em outra.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import ffmpeg from "ffmpeg-static";

const S = process.argv[2];
const fotos = ["A_sala_vazia_18041820", "B2_sala_mobiliada_6782353", "D3_cozinha_real_2635038", "E_fachada_nublada_7031595"].map((f) => path.resolve("../docs/pedra-teardown/fotos-teste", f + ".jpg"));
const W = 1080, H = 1920, DUR = 4, TRANS = 0.6, FPS = 24;
const fonte = "C\:/Windows/Fonts/arial.ttf";
const cron = (nome, fn) => { const t0 = Date.now(); fn(); console.log(`${nome}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); };

// cenas
const clipes = [];
fotos.forEach((f, i) => {
  const out = path.join(S, `cena${i}.mp4`); clipes.push(out);
  const frames = DUR * FPS;
  const z = i % 2 === 0 ? `min(1+0.10*on/${frames},1.10)` : `max(1.10-0.10*on/${frames},1)`;
  const filtro = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},format=yuv420p,drawtext=fontfile='${fonte}':text='Sala ${i + 1}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=h-230:box=1:boxcolor=0x0f2d5b@0.85:boxborderw=14[v]`;
  // UM quadro de entrada (sem -loop): o zoompan gera os `frames` quadros a partir dele.
  // Com -loop 1 + d=frames, cada quadro de entrada virava `frames` de saída (96×96) e o
  // render "travava" -- foi o que aconteceu na primeira rodada deste spike.
  cron(`cena ${i} (1 foto, ${DUR}s)`, () => execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", f, "-filter_complex", filtro, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS), out]));
});

// música de mentira (20s de tom) só pra medir a mixagem
const musica = path.join(S, "musica.m4a");
execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=40", "-c:a", "aac", "-b:a", "128k", musica]);

// montagem: xfade entre clipes + música com fade out
const total = DUR * clipes.length - TRANS * (clipes.length - 1);
const args = ["-y", "-hide_banner", "-loglevel", "error"];
for (const c of clipes) args.push("-i", c);
args.push("-i", musica);
let cadeia = ""; let ant = "0:v";
for (let i = 1; i < clipes.length; i++) {
  const saida = i === clipes.length - 1 ? "vout" : `x${i}`;
  cadeia += `[${ant}][${i}:v]xfade=transition=fade:duration=${TRANS}:offset=${((DUR - TRANS) * i).toFixed(2)}[${saida}];`;
  ant = saida;
}
cadeia += `[${clipes.length}:a]atrim=0:${total.toFixed(2)},afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5,volume=0.8[aout]`;
const final = path.join(S, "final-cenas.mp4");
cron(`montagem (xfade de ${clipes.length} clipes + música, ${total.toFixed(1)}s)`, () => execFileSync(ffmpeg, [...args, "-filter_complex", cadeia, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", final]));

// alternativa sem xfade: concat por demuxer sem reencodar vídeo (só mixa áudio)
const lista = path.join(S, "lista.txt");
fs.writeFileSync(lista, clipes.map((c) => `file '${c.split(path.sep).join("/")}'`).join("\n"));
const final2 = path.join(S, "final-concat.mp4");
cron("montagem sem transição (concat -c copy + música)", () => execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista, "-i", musica, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", final2]));
console.log("tamanhos KB:", Math.round(fs.statSync(final).size / 1024), Math.round(fs.statSync(final2).size / 1024));
