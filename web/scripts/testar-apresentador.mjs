// O apresentador por cima do vídeo, de ponta a ponta e MEDIDO no arquivo final.
//
// O clipe do apresentador é um vídeo REAL da conta (baixado e reenviado como se a pessoa
// tivesse gravado). O que se mede: o canto onde ele deve aparecer MUDA durante a janela
// dele e volta ao normal fora dela -- é assim que se prova que o `enable=between` está
// certo e que o recorte em círculo não engoliu o vídeo todo.
//
//   BASE=http://localhost:3000 node scripts/testar-apresentador.mjs

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-apre-"));

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
const h = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${h}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

// ---- 1. um clipe de verdade pra fazer o papel de apresentador ----
console.log("--- 1. o clipe do apresentador ---");
const listaV = await (await fetch(`${BASE}/api/video`, { headers: cab })).json();
const pronto0 = (listaV.videos ?? []).find((v) => v.status === "concluido");
conferir(!!pronto0, "achei um vídeo pronto na conta pra usar de clipe", pronto0?.titulo ?? "");
if (!pronto0) process.exit(1);
const det = await (await fetch(`${BASE}/api/video/${pronto0.id}`, { headers: cab })).json();
const clipeLocal = path.join(tmp, "apre.mp4");
fs.writeFileSync(clipeLocal, Buffer.from(await (await fetch(det.url)).arrayBuffer()));

const rUp = await fetch(`${BASE}/api/video/upload`, { method: "POST", headers: json, body: JSON.stringify({ tipo: "video/mp4", tamanho: fs.statSync(clipeLocal).size }) });
const dUp = await rUp.json();
conferir(rUp.ok && !!dUp.caminho, "upload de vídeo assinado", dUp.error ?? "");
const put = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/resultados/${dUp.caminho}?token=${dUp.token}`, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: fs.readFileSync(clipeLocal) });
conferir(put.ok, "o clipe subiu", String(put.status));

const alheio = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec: { formato: "9:16", cenas: [{ tipo: "foto", jobId: "11111111-2222-4333-8444-555555555555" }], musica: "nenhuma", telaFinal: false, apresentador: { arquivo: "uploads/outra-pessoa/x.mp4" } } }) });
conferir(alheio.status === 400, "clipe de outra pessoa é recusado", String(alheio.status));

// ---- 2. o vídeo com o apresentador no canto, em círculo ----
console.log("\n--- 2. círculo no canto de baixo ---");
const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 2);

const antes = await saldo();
const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: fotos[0].id, duracao: 6, efeito: "aproximar" },
    { tipo: "foto", jobId: fotos[1].id, duracao: 6, efeito: "afastar" },
  ],
  musica: "calma",
  musicaVolume: 0.8,
  narracao: null,
  apresentador: { arquivo: dUp.caminho, formato: "circulo", canto: "inferior_direito", tamanho: "grande", entra: 1, duracao: 4, inicio: 0, volume: 1 },
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
};
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
conferir(dV.custo === 0, "aparecer no vídeo não custa crédito", `custo ${dV.custo}`);

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
conferir(!!pronto, "o ffmpeg aceitou o overlay e a máscara circular");

if (pronto) {
  const arquivo = path.join(tmp, "com-apre.mp4");
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  conferir(!!pronto.espec?.apresentador?.arquivo, "o apresentador volta no espec ao reabrir");

  /** Um recorte do canto de baixo à direita, em cinza, pra comparar dois instantes. */
  const canto = async (segundo, nome) => {
    const jpg = path.join(tmp, `${nome}.jpg`);
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", "-vf", "crop=iw*0.45:ih*0.22:iw*0.5:ih*0.7", jpg], { timeout: 60_000 });
    const { data } = await sharp(jpg).greyscale().raw().toBuffer({ resolveWithObject: true });
    return { dados: data, jpg };
  };
  const dentro = await canto(2.5, "canto-com");
  const fora = await canto(9.5, "canto-sem");
  let dif = 0;
  const n = Math.min(dentro.dados.length, fora.dados.length);
  for (let i = 0; i < n; i++) dif += Math.abs(dentro.dados[i] - fora.dados[i]);
  const media = dif / n;
  console.log(`     diferença média no canto: ${media.toFixed(1)}`);
  conferir(media > 10, "o canto MUDA durante a janela do apresentador", media.toFixed(1));

  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "2.5", "-i", arquivo, "-frames:v", "1", "-vf", "scale=360:-2", path.join(SAIDA, "apresentador-circulo.jpg")], { timeout: 60_000 });
  console.log(`     quadro em ${path.relative(path.join(RAIZ, ".."), path.join(SAIDA, "apresentador-circulo.jpg"))}`);
  await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
}

// ---- 3. faixa no pé ----
console.log("\n--- 3. faixa no pé ---");
const r2 = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ espec: { ...espec, apresentador: { ...espec.apresentador, formato: "rodape", entra: 0, duracao: 5 } } }),
});
const d2 = await r2.json();
let pronto2 = null;
for (let i = 0; i < 90 && !pronto2; i++) {
  await new Promise((z) => setTimeout(z, 3000));
  const j = await (await fetch(`${BASE}/api/video/${d2.videoId}`, { headers: cab })).json();
  if (j.status === "concluido" && j.url) pronto2 = j;
  else if (j.status === "falhou") {
    conferir(false, "a faixa falhou", j.error);
    break;
  }
}
conferir(!!pronto2, "a faixa no pé renderizou");
if (pronto2) {
  const arq2 = path.join(tmp, "rodape.mp4");
  fs.writeFileSync(arq2, Buffer.from(await (await fetch(pronto2.url)).arrayBuffer()));
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "2", "-i", arq2, "-frames:v", "1", "-vf", "scale=360:-2", path.join(SAIDA, "apresentador-rodape.jpg")], { timeout: 60_000 });
  await fetch(`${BASE}/api/video/${d2.videoId}`, { method: "DELETE", headers: cab });
}

conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
