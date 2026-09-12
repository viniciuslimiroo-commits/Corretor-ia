// Spike da Fase C: quanto tempo o ffmpeg leva pra montar um vídeo Ken Burns de 4 fotos,
// 9:16 (1080x1920) e 16:9 (1920x1080), 24 fps, com transição e título. Roda local
// (ffmpeg-static) e serve de base pra medir na Vercel depois.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import ffmpeg from "ffmpeg-static";

const fotos = ["A_sala_vazia_18041820", "B2_sala_mobiliada_6782353", "D3_cozinha_real_2635038", "E_fachada_nublada_7031595"].map((f) => path.resolve("../docs/pedra-teardown/fotos-teste", f + ".jpg"));
const saidaDir = process.argv[2] || ".";
const fonte = process.platform === "win32" ? "C\:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const DUR = 4, TRANS = 0.6, FPS = 24;

function montar(W, H, nome, preset = "veryfast", escala = 2) {
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  // Um quadro por foto: o zoompan gera os `frames` quadros a partir dele (com -loop 1
  // cada quadro de entrada viraria `frames` de saída e o render explodiria).
  for (const f of fotos) args.push("-i", f);
  const frames = DUR * FPS;
  const partes = fotos.map((_, i) => {
    const zoomIn = i % 2 === 0;
    const z = zoomIn ? `min(1+0.10*on/${frames},1.10)` : `max(1.10-0.10*on/${frames},1)`;
    return `[${i}:v]scale=${W * escala}:${H * escala}:force_original_aspect_ratio=increase,crop=${W * escala}:${H * escala},zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},format=yuv420p[v${i}]`;
  });
  let cadeia = "";
  let anterior = "v0";
  for (let i = 1; i < fotos.length; i++) {
    const offset = (DUR - TRANS) * i;
    const saida = i === fotos.length - 1 ? "vx" : `x${i}`;
    cadeia += `[${anterior}][v${i}]xfade=transition=fade:duration=${TRANS}:offset=${offset.toFixed(2)}[${saida}];`;
    anterior = saida;
  }
  const titulo = `[vx]drawtext=fontfile='${fonte}':text='Apto 302 · Setor Bueno':fontsize=${Math.round(H * 0.035)}:fontcolor=white:x=(w-text_w)/2:y=h-${Math.round(H * 0.12)}:box=1:boxcolor=0x0f2d5b@0.85:boxborderw=${Math.round(H * 0.012)}[vout]`;
  const filtro = partes.join(";") + ";" + cadeia + titulo;
  const total = DUR * fotos.length - TRANS * (fotos.length - 1);
  const out = path.join(saidaDir, nome);
  args.push("-filter_complex", filtro, "-map", "[vout]", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", preset, "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(FPS), out);
  const t0 = Date.now();
  execFileSync(ffmpeg, args, { stdio: "inherit" });
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${nome}: ${W}x${H} ${total.toFixed(1)}s de vídeo, escala ${escala}x, preset ${preset} -> ${s}s de render, ${kb} KB`);
}

montar(1080, 1920, "teste-9x16.mp4");
montar(1920, 1080, "teste-16x9.mp4");
montar(1080, 1920, "teste-9x16-1x.mp4", "veryfast", 1);
montar(720, 1280, "teste-9x16-720.mp4", "veryfast", 2);
