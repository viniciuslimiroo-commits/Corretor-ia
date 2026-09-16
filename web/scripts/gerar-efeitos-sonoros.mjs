// Gera a biblioteca de EFEITOS SONOROS (uma vez) e guarda em public/efeitos/*.m4a.
//
// Irmão de gerar-musicas.mjs, com duas diferenças que importam: são CURTOS (2 a 4s) e
// levam um corte de silêncio no começo. O modelo costuma entregar meio segundo de nada
// antes do som, e num efeito que marca uma virada de cena meio segundo atrasado é o
// efeito caindo no lugar errado.
//
// Gerados, não baixados: efeito sonoro de banco de terceiros vem com licença, e anúncio
// de imóvel com áudio licenciado errado é problema do corretor, não da ferramenta.
//
// Uso: node scripts/gerar-efeitos-sonoros.mjs [id...]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const EFEITOS = {
  passagem: { seg: 3, prompt: "Short clean whoosh transition sound effect, air swoosh, single hit, no music, no reverb tail" },
  clique: { seg: 2, prompt: "Camera shutter click sound effect, single crisp snap, photographic, no music" },
  brilho: { seg: 3, prompt: "Short magic sparkle chime sound effect, bright bell shimmer, single hit, no music" },
  toque: { seg: 2, prompt: "Soft UI pop sound effect, single short bubble pop, clean, no music" },
  impacto: { seg: 3, prompt: "Deep cinematic impact hit, short boom with quick decay, trailer transition, no music" },
  sino: { seg: 3, prompt: "Single soft bell ding sound effect, warm and clear, notification style, no music" },
};

const pedidos = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EFEITOS);
fs.mkdirSync("public/efeitos", { recursive: true });

const saldo = async () =>
  Number(await (await fetch("https://rest.alpha.fal.ai/billing/user_balance", { headers: { Authorization: "Key " + env.FAL_KEY } })).text());

for (const id of pedidos) {
  const def = EFEITOS[id];
  if (!def) {
    console.error(id, "não está no catálogo");
    continue;
  }
  const antes = await saldo();
  const t0 = Date.now();
  const r = await fetch("https://fal.run/fal-ai/stable-audio-25/text-to-audio", {
    method: "POST",
    headers: { Authorization: "Key " + env.FAL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: def.prompt, seconds_total: Math.max(3, def.seg), num_inference_steps: 8, guidance_scale: 1 }),
  });
  const d = await r.json();
  const url = d.audio?.url ?? d.audio_file?.url;
  if (!r.ok || !url) {
    console.error(id, "falhou:", JSON.stringify(d).slice(0, 300));
    continue;
  }
  const bruto = path.join("public", "efeitos", id + ".bruto");
  fs.writeFileSync(bruto, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const out = path.join("public", "efeitos", id + ".m4a");
  // `silenceremove` corta o silêncio da frente; `loudnorm` deixa todos no mesmo volume,
  // pra trocar de efeito não virar trocar de volume.
  execFileSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", bruto,
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=" + (def.seg - 0.3).toFixed(2) + ":d=0.3",
    "-c:a", "aac", "-b:a", "128k", "-t", String(def.seg),
    out,
  ]);
  fs.unlinkSync(bruto);
  const depois = await saldo();
  console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${Math.round(fs.statSync(out).size / 1024)} KB, custo US$ ${(antes - depois).toFixed(4)}`);
}
