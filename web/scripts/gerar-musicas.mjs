// Gera a biblioteca de músicas do vídeo (uma vez) com stable-audio-25 no fal e guarda
// em assets/musica/*.m4a (AAC 128k, 45s, instrumental). Uso: node scripts/gerar-musicas.mjs [id...]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const FAIXAS = {
  calma: "Soft calm instrumental, gentle piano and warm strings, slow tempo, minimal, real estate showcase background music, no vocals, no drums",
  elegante: "Elegant lounge instrumental, smooth electric piano, soft brushed drums, upright bass, luxury apartment tour background music, no vocals",
  moderna: "Modern minimal electronic instrumental, soft synth pads, light percussion, clean and airy, tech product video background, no vocals",
  alegre: "Happy acoustic instrumental, bright acoustic guitar, hand claps, ukulele, cheerful family home video background, no vocals",
  cinematografica: "Cinematic orchestral instrumental, building strings, soft timpani, hopeful and grand, real estate launch trailer, no vocals",
};
const pedidos = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FAIXAS);
fs.mkdirSync("assets/musica", { recursive: true });
const saldo = async () => Number(await (await fetch("https://rest.alpha.fal.ai/billing/user_balance", { headers: { Authorization: "Key " + env.FAL_KEY } })).text());
for (const id of pedidos) {
  const antes = await saldo();
  const t0 = Date.now();
  const r = await fetch("https://fal.run/fal-ai/stable-audio-25/text-to-audio", {
    method: "POST",
    headers: { Authorization: "Key " + env.FAL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: FAIXAS[id], seconds_total: 45, num_inference_steps: 8, guidance_scale: 1 }),
  });
  const d = await r.json();
  const url = d.audio?.url ?? d.audio_file?.url;
  if (!r.ok || !url) { console.error(id, "falhou:", JSON.stringify(d).slice(0, 300)); continue; }
  const bruto = path.join("assets", "musica", id + ".bruto");
  fs.writeFileSync(bruto, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const out = path.join("assets", "musica", id + ".m4a");
  execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", bruto, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=0.5,afade=t=out:st=44:d=1", "-c:a", "aac", "-b:a", "128k", "-t", "45", out]);
  fs.unlinkSync(bruto);
  const depois = await saldo();
  console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${Math.round(fs.statSync(out).size / 1024)} KB, custo US$ ${(antes - depois).toFixed(4)}`);
}
