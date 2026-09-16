// Gera a biblioteca de músicas do vídeo (uma vez) com stable-audio-25 no fal e guarda
// em assets/musica/*.m4a (AAC 128k, 45s, instrumental). Uso: node scripts/gerar-musicas.mjs [id...]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const FAIXAS = {
  calma: "Soft calm instrumental, gentle piano and warm strings, slow tempo, minimal, real estate showcase background music, no vocals, no drums",
  sereno: "Very slow solo piano instrumental, sparse notes, soft reverb, peaceful and still, quiet home tour background, no vocals, no drums",
  aconchego: "Warm fingerpicked acoustic guitar instrumental, cosy and intimate, slow tempo, soft room tone, family home background, no vocals, no drums",
  elegante: "Elegant lounge instrumental, smooth electric piano, soft brushed drums, upright bass, luxury apartment tour background music, no vocals",
  sofisticado: "Sophisticated jazz lounge instrumental, rhodes electric piano and upright bass, brushed snare, refined and unhurried, luxury penthouse, no vocals",
  lounge: "Downtempo lounge instrumental, soft four-on-the-floor kick, warm chords, boutique hotel lobby music, relaxed, no vocals",
  moderna: "Modern minimal electronic instrumental, soft synth pads, light percussion, clean and airy, tech product video background, no vocals",
  urbano: "Modern hip hop instrumental, crisp drums, deep sub bass, confident and punchy, short social media reel background, no vocals",
  minimal: "Minimal ambient instrumental, few notes, wide space, soft analog synth, architectural film background, very calm, no vocals, no drums",
  alegre: "Happy acoustic instrumental, bright acoustic guitar, hand claps, ukulele, cheerful family home video background, no vocals",
  familia: "Cheerful ukulele and whistling instrumental, light hand percussion, warm and friendly, family lifestyle video, no vocals",
  verao: "Sunny tropical instrumental, marimba and soft nylon guitar, gentle shaker, beach house summer feeling, relaxed, no vocals",
  cinematografica: "Cinematic orchestral instrumental, building strings, soft timpani, hopeful and grand, real estate launch trailer, no vocals",
  epico: "Epic cinematic instrumental, powerful taiko drums and soaring strings, dramatic build, property launch trailer, no vocals",
  inspirador: "Inspiring cinematic instrumental, solo piano opening into full warm strings, uplifting and hopeful, no vocals",
};
const pedidos = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FAIXAS);
fs.mkdirSync("public/musica", { recursive: true });
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
  const bruto = path.join("public", "musica", id + ".bruto");
  fs.writeFileSync(bruto, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const out = path.join("public", "musica", id + ".m4a");
  execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", bruto, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=0.5,afade=t=out:st=44:d=1", "-c:a", "aac", "-b:a", "128k", "-t", "45", out]);
  fs.unlinkSync(bruto);
  const depois = await saldo();
  console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${Math.round(fs.statSync(out).size / 1024)} KB, custo US$ ${(antes - depois).toFixed(4)}`);
}
