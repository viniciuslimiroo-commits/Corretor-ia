// Legendas automáticas de ponta a ponta: fala real → transcrição → trechos com tempo →
// vídeo montado com a legenda queimada no quadro certo.
//
// O que só este teste pega: se o escape do `between(t,a,b)` estiver errado, o ffmpeg
// quebra; se o tempo vier trocado, a legenda aparece na hora errada. Por isso ele extrai
// um quadro DENTRO de um trecho e outro FORA, e compara: o de dentro tem que ter mais
// pixel branco na faixa de baixo do que o de fora.
//
//   BASE=http://localhost:3000 node scripts/testar-legendas.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-leg-"));

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

const r0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: process.env.CONTA ?? "viniciuslimiroo@gmail.com" }) });
const d0 = await r0.json();
const hashed = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

// ---- 1. fala real ----
console.log("--- 1. uma fala real, com frases separadas ---");
const fala = "Apartamento de três quartos no Setor Bueno. Varanda gourmet e duas vagas na garagem. Agende sua visita hoje mesmo.";
const rTts = await fetch("https://fal.run/fal-ai/elevenlabs/tts/multilingual-v2", {
  method: "POST",
  headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ text: fala, voice: "Daniel", language_code: "pt", stability: 0.5, similarity_boost: 0.75, speed: 1 }),
});
const dTts = await rTts.json();
conferir(!!dTts?.audio?.url, "TTS devolveu áudio");
if (!dTts?.audio?.url) process.exit(1);
const vozLocal = path.join(tmp, "voz.mp3");
fs.writeFileSync(vozLocal, Buffer.from(await (await fetch(dTts.audio.url)).arrayBuffer()));

const rUp = await fetch(`${BASE}/api/video/upload`, { method: "POST", headers: json, body: JSON.stringify({ tipo: "audio/mpeg", tamanho: fs.statSync(vozLocal).size }) });
const dUp = await rUp.json();
await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/resultados/${dUp.caminho}?token=${dUp.token}`, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: fs.readFileSync(vozLocal) });
conferir(!!dUp.caminho, "áudio no bucket");

// ---- 2. transcrição ----
console.log("\n--- 2. transcrevendo ---");
const antesCreditos = await saldo();
const rLeg = await fetch(`${BASE}/api/video/legendas`, { method: "POST", headers: json, body: JSON.stringify({ arquivo: dUp.caminho }) });
const dLeg = await rLeg.json();
conferir(rLeg.ok, "a rota de legendas respondeu", dLeg.error ?? "");
const trechos = dLeg.legendas?.trechos ?? [];
conferir(trechos.length >= 2, "a fala virou vários trechos", `${trechos.length} trechos`);
conferir(trechos.every((t) => t.fim > t.inicio), "todo trecho tem fim depois do início");
conferir(trechos.every((t, i) => i === 0 || t.inicio >= trechos[i - 1].inicio), "os trechos vêm em ordem");
conferir(/quartos|Bueno|visita/i.test(trechos.map((t) => t.texto).join(" ")), "o texto bate com a fala", trechos.map((t) => t.texto).join(" | ").slice(0, 110));
conferir(antesCreditos === (await saldo()), "transcrever NÃO gasta crédito", `${antesCreditos}`);

const semPermissao = await fetch(`${BASE}/api/video/legendas`, { method: "POST", headers: json, body: JSON.stringify({ arquivo: "uploads/outra-pessoa/voz.mp3" }) });
conferir(semPermissao.status === 400, "áudio de outra pessoa é recusado", String(semPermissao.status));

// ---- 3. o vídeo com a legenda queimada ----
console.log("\n--- 3. queimando no vídeo ---");
const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 2);
const dur = Math.max(6, Math.ceil((trechos[trechos.length - 1]?.fim ?? 8) + 1));
const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: fotos[0].id, duracao: 8, efeito: "aproximar" },
    { tipo: "foto", jobId: fotos[1].id, duracao: Math.max(3, dur - 8 + 1), efeito: "afastar" },
  ],
  musica: "calma",
  musicaVolume: 0.8,
  narracao: { origem: "enviada", arquivo: dUp.caminho, volume: 1, inicio: 0 },
  legendas: { ...dLeg.legendas, estilo: "faixa", posicao: "base" },
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
};
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);

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
conferir(!!pronto, "o ffmpeg aceitou o filtro das legendas");

if (pronto) {
  const arquivo = path.join(tmp, "legendado.mp4");
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  conferir((pronto.espec?.legendas?.trechos ?? []).length === trechos.length, "as legendas voltam no espec ao reabrir");

  /**
   * Brilho médio da faixa de baixo, onde a legenda mora. A caixa escura da legenda
   * derruba esse número; sem legenda, sobra só a foto. É a diferença que prova que a
   * legenda aparece na hora da fala e some no silêncio.
   */
  const brilhoEmbaixo = async (segundo, nome) => {
    const jpg = path.join(tmp, `${nome}.jpg`);
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", "-vf", "crop=iw:ih*0.2:0:ih*0.72", jpg], { timeout: 60_000 });
    // A média sai do sharp, não do signalstats: o filtro só imprime com `metadata=print`
    // junto, e depender disso é depender de um detalhe do ffmpeg pra medir o produto.
    const dados = await sharp(jpg).greyscale().raw().toBuffer();
    let soma = 0;
    for (const v of dados) soma += v;
    return { valor: soma / dados.length, jpg };
  };

  // Um instante DENTRO do primeiro trecho, e outro depois do último (silêncio).
  const dentroSeg = (trechos[0].inicio + trechos[0].fim) / 2;
  const foraSeg = Math.min((pronto.duracao ?? dur) - 0.3, (trechos[trechos.length - 1].fim ?? 0) + 0.6);
  const dentro = await brilhoEmbaixo(dentroSeg, "com-legenda");
  const fora = await brilhoEmbaixo(foraSeg, "sem-legenda");
  console.log(`     brilho da faixa de baixo: durante a fala ${dentro.valor.toFixed(1)} · no silêncio ${fora.valor.toFixed(1)}`);
  conferir(Number.isFinite(dentro.valor) && Number.isFinite(fora.valor), "consegui medir os dois quadros");
  conferir(fora.valor - dentro.valor > 8, "a legenda aparece na fala e some no silêncio", `${dentro.valor.toFixed(1)} vs ${fora.valor.toFixed(1)}`);

  fs.copyFileSync(dentro.jpg, path.join(SAIDA, "legenda-na-fala.jpg"));
  // Quadro inteiro, pra conferência a olho.
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(dentroSeg), "-i", arquivo, "-frames:v", "1", "-vf", "scale=360:-2", path.join(SAIDA, "quadro-legendado.jpg")], { timeout: 60_000 });
  console.log(`     quadro em ${path.relative(path.join(RAIZ, ".."), path.join(SAIDA, "quadro-legendado.jpg"))}`);

  await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
  console.log("     vídeo de teste apagado da conta");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
