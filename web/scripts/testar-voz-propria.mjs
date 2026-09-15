// Voz própria de ponta a ponta, pelo app de verdade: gera uma voz real (a mesma TTS que
// o produto usa), sobe como se a pessoa tivesse enviado o arquivo, monta o vídeo com uma
// FOTO REAL da conta e confere no arquivo final que:
//
//   1. o vídeo saiu e tem áudio;
//   2. NÃO cobrou crédito (é o arquivo da pessoa, não passa por modelo na montagem);
//   3. a música abaixa durante a fala e volta depois -- medido em dB no MP4 baixado.
//
//   BASE=http://localhost:3000 node scripts/testar-voz-propria.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "voz");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-voz-"));

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

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

async function sessao(email) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  return new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
}

const token = await sessao(process.env.CONTA ?? "viniciuslimiroo@gmail.com");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

// ---- 1. uma voz de verdade (a mesma TTS do produto) ----
console.log("--- 1. gerando uma voz real ---");
const fala = "Apartamento de três quartos no Setor Bueno, com varanda gourmet e duas vagas. Agende sua visita hoje mesmo.";
const r1 = await fetch("https://fal.run/fal-ai/elevenlabs/tts/multilingual-v2", {
  method: "POST",
  headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ text: fala, voice: "Daniel", language_code: "pt", stability: 0.5, similarity_boost: 0.75, speed: 1 }),
});
const d1 = await r1.json();
const urlVoz = d1?.audio?.url;
conferir(!!urlVoz, "TTS devolveu áudio", r1.status + "");
if (!urlVoz) process.exit(1);
const vozLocal = path.join(tmp, "voz.mp3");
fs.writeFileSync(vozLocal, Buffer.from(await (await fetch(urlVoz)).arrayBuffer()));
const bytesVoz = fs.statSync(vozLocal).size;
console.log(`     ${Math.round(bytesVoz / 1024)} KB de fala real`);

// ---- 2. sobe como arquivo da pessoa ----
console.log("\n--- 2. enviando como áudio da pessoa ---");
const rUp = await fetch(`${BASE}/api/video/upload`, { method: "POST", headers: json, body: JSON.stringify({ tipo: "audio/mpeg", tamanho: bytesVoz }) });
const dUp = await rUp.json();
conferir(rUp.ok && !!dUp.caminho && dUp.ehAudio === true, "o servidor aceitou áudio e assinou o upload", dUp.error ?? dUp.caminho);
const put = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/resultados/${dUp.caminho}?token=${dUp.token}`, {
  method: "PUT",
  headers: { "Content-Type": "audio/mpeg" },
  body: fs.readFileSync(vozLocal),
});
conferir(put.ok, "o arquivo subiu pro bucket", String(put.status));

// ---- 3. monta o vídeo com foto real da conta ----
console.log("\n--- 3. montando o vídeo ---");
const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 2);
conferir(fotos.length === 2, "achei duas fotos reais na conta", fotos.map((f) => f.rotulo).join(" · "));

const antes = await saldo();
const espec = {
  formato: "9:16",
  cenas: fotos.map((f, i) => ({ tipo: "foto", jobId: f.id, efeito: i === 0 ? "aproximar" : "afastar", duracao: 6 })),
  musica: "calma",
  musicaVolume: 0.8,
  narracao: { origem: "enviada", arquivo: dUp.caminho, volume: 1, inicio: 2 },
  titulo: "Teste de voz própria",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
};
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
conferir(dV.custo === 0, "custou ZERO créditos (voz própria não passa por IA)", `custo ${dV.custo}`);

let pronto = null;
for (let i = 0; i < 90 && !pronto; i++) {
  await new Promise((z) => setTimeout(z, 3000));
  const j = await (await fetch(`${BASE}/api/video/${dV.videoId}`, { headers: cab })).json();
  if (j.status === "concluido" && j.url) pronto = j;
  else if (j.status === "falhou") {
    conferir(false, "o vídeo falhou", j.error);
    break;
  }
}
conferir(!!pronto, "o vídeo ficou pronto");
const depois = await saldo();
conferir(antes === depois, "nenhum crédito foi cobrado", `${antes} → ${depois}`);

// ---- 4. o som do arquivo final ----
if (pronto) {
  const arquivo = path.join(SAIDA, "com-voz-propria.mp4");
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  console.log("\n--- 4. medindo o áudio do arquivo final ---");

  const sonda = spawnSync(ffmpeg, ["-hide_banner", "-i", arquivo], { encoding: "utf8" });
  conferir(/Audio: aac/.test(String(sonda.stderr)), "o MP4 tem faixa de áudio AAC");

  const medir = (inicio, dur) => {
    const r = spawnSync(ffmpeg, ["-hide_banner", "-nostdin", "-ss", String(inicio), "-t", String(dur), "-i", arquivo, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", timeout: 60_000 });
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(r.stderr));
    return m ? Number(m[1]) : NaN;
  };
  // A voz começa em 2s e dura ~7s; antes disso só há música.
  const soMusica = medir(0.3, 1.5);
  const comVoz = medir(3, 3);
  console.log(`     só música ${soMusica.toFixed(1)} dB · com a voz ${comVoz.toFixed(1)} dB`);
  conferir(comVoz > soMusica, "o trecho com voz é mais alto (a voz está lá)", `${(comVoz - soMusica).toFixed(1)} dB`);
  console.log(`     arquivo em ${path.relative(path.join(RAIZ, ".."), arquivo)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
