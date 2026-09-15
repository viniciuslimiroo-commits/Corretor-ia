// A linha do tempo de ponta a ponta, pelo app: cada cena com a SUA emenda, e o arquivo
// final medido. O que se prova aqui é o que nenhum teste de string prova -- que o ffmpeg
// aceita as transições novas (deslizar, aproximar, desfoque) e que a conta do tempo bate
// com o vídeo que sai.
//
//   BASE=http://localhost:3000 node scripts/testar-timeline.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-tl-"));

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

const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: process.env.CONTA ?? "viniciuslimiroo@gmail.com" }) });
const d = await r.json();
const hashed = d.hashed_token ?? d.properties?.hashed_token;
const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 3);
conferir(fotos.length === 3, "três fotos reais da conta", fotos.map((f) => f.rotulo).join(" · "));

// 3 cenas de 4s, emendas diferentes em cada uma. Sem tela final pra conta ficar limpa.
//   4+4+4 = 12  −  (0,6 deslizar + 0,5 desfoque) = 10,9s
const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: fotos[0].id, duracao: 4, efeito: "aproximar", transicao: "deslizar", legenda: "Sala" },
    { tipo: "foto", jobId: fotos[1].id, duracao: 4, efeito: "afastar", transicao: "desfoque" },
    { tipo: "foto", jobId: fotos[2].id, duracao: 4, efeito: "direita" },
  ],
  musica: "nenhuma",
  narracao: null,
  titulo: "Teste de linha do tempo",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
};
const esperado = 12 - (0.6 + 0.5);

const antes = await saldo();
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
conferir(Math.abs((dV.duracaoEstimada ?? 0) - esperado) < 0.05, "a duração estimada desconta cada emenda", `${dV.duracaoEstimada}s (esperado ${esperado})`);
conferir(dV.custo === 0, "montar e emendar não custa crédito", `custo ${dV.custo}`);

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
conferir(!!pronto, "o ffmpeg aceitou as transições novas e o vídeo ficou pronto");
conferir(antes === (await saldo()), "nenhum crédito cobrado");

if (pronto) {
  const arquivo = path.join(tmp, "tl.mp4");
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  const sonda = spawnSync(ffmpeg, ["-hide_banner", "-i", arquivo], { encoding: "utf8" });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(String(sonda.stderr));
  const real = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
  conferir(Math.abs(real - esperado) < 0.4, "o arquivo tem a duração que a conta previu", `${real?.toFixed(2)}s vs ${esperado}s`);
  conferir((pronto.espec?.cenas ?? []).map((c) => c.transicao).join(",") === "deslizar,desfoque,", "as emendas voltam no espec ao reabrir", (pronto.espec?.cenas ?? []).map((c) => c.transicao ?? "—").join(" · "));
  // Limpa: era teste, não material dele.
  await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
  console.log("     vídeo de teste apagado da conta");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
