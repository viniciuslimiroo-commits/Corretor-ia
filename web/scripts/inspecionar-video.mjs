// Baixa um vídeo pronto da conta e tira quadros dele pra conferir a olho o que o espec
// prometeu: a miniatura (capa), o começo de cada cena e a tela final. Não gasta crédito.
//
//   BASE=http://localhost:3000 node scripts/inspecionar-video.mjs <videoId> <pasta-de-saida>

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const [videoId, SAIDA] = process.argv.slice(2);
if (!videoId || !SAIDA) {
  console.error("Uso: node scripts/inspecionar-video.mjs <videoId> <pasta>");
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function sessaoDe(email) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  return new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
}

const token = await sessaoDe(process.env.CONTA ?? "viniciuslimiroo@gmail.com");
const r = await fetch(`${BASE}/api/video/${videoId}`, { headers: { Authorization: `Bearer ${token}` } });
const d = await r.json();
if (!r.ok || d.status !== "concluido") {
  console.error("vídeo não está pronto:", r.status, d.error ?? d.status);
  process.exit(1);
}

const baixar = async (url, nome) => {
  const arq = path.join(SAIDA, nome);
  fs.writeFileSync(arq, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return arq;
};
const video = await baixar(d.url, "video.mp4");
if (d.miniatura) await baixar(d.miniatura, "miniatura.jpg");

const quadro = (segundo, nome) =>
  execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", segundo.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", path.join(SAIDA, nome)]);

const e = d.espec;
const sobre = e.transicao === "suave" ? 0.6 : 0;
let t = 0;
e.cenas.forEach((c, i) => {
  const dur = c.duracao ?? 4;
  quadro(t + Math.min(1.5, dur / 2), `cena${i + 1}.jpg`);
  t += dur - sobre;
});
quadro(Math.max(0, (d.duracao ?? t) - 0.8), "tela-final.jpg");

console.log(JSON.stringify({ duracao: d.duracao, capa: e.capa, chamada: e.chamada, cenas: e.cenas.map((c) => `${c.tipo}${c.legenda ? " «" + c.legenda + "»" : ""}`), avisos: d.avisos, pasta: SAIDA }, null, 1));
