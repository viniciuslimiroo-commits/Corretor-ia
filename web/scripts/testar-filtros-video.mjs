// Os filtros de imagem do vídeo, MEDIDOS no arquivo final.
//
// Filtro de cor é a coisa mais fácil de fingir que funciona: a string entra no comando, o
// ffmpeg não reclama e o vídeo sai igual ao anterior. Então aqui se mede o que cada
// acabamento promete, no quadro que saiu:
//
//   claro   -> mais claro que o natural
//   quente  -> mais vermelho que azul
//   sobrio  -> mais azul que o natural
//   pb      -> sem cor nenhuma (R = G = B)
//   luz     -> o mesmo acabamento, mais claro
//
// Um vídeo só, com cinco cenas da mesma foto: assim a única coisa diferente entre os
// quadros é o filtro, e não a foto.
//
//   BASE=http://localhost:3000 node scripts/testar-filtros-video.mjs

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-filtro-"));

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
const hash = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hash}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

// /api/materiais devolve 500 "JWT issued at future" de vez em quando logo depois do
// login (relógio do Supabase contra o token recém-emitido) e a lista volta vazia. É
// transitório e conhecido: tentar de novo em vez de acusar "a conta não tem foto".
let materiais = { itens: [] };
let erroLista = "";
for (let i = 0; i < 5 && !(materiais.itens ?? []).length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  const r = await fetch(`${BASE}/api/materiais`, { headers: cab });
  materiais = await r.json().catch(() => ({ itens: [] }));
  erroLista = r.ok ? "" : materiais.error ?? `HTTP ${r.status}`;
}
const foto = (materiais.itens ?? []).find((i) => i.categoria !== "video");
conferir(!!foto, "uma foto real da conta", foto ? (foto.acao ?? foto.id) : erroLista || "lista vazia");
if (!foto) process.exit(1);

// A MESMA foto cinco vezes, parada: só o acabamento muda de cena pra cena.
const ORDEM = ["natural", "claro", "quente", "sobrio", "pb"];
const DURACAO = 3;
const antes = await saldo();
const espec = {
  formato: "1:1",
  cenas: ORDEM.map((f) => ({ tipo: "foto", jobId: foto.id, duracao: DURACAO, efeito: "parado", filtro: f })).concat([
    // Sexta cena: o mesmo "natural", só que com a luz no máximo.
    { tipo: "foto", jobId: foto.id, duracao: DURACAO, efeito: "parado", filtro: "natural", luz: 0.25 },
  ]),
  musica: "nenhuma",
  narracao: null,
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
};

const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
conferir(dV.custo === 0, "filtro não custa crédito", `custo ${dV.custo}`);

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
conferir(!!pronto, "o ffmpeg aceitou os seis acabamentos");
if (!pronto) process.exit(1);

const arquivo = path.join(tmp, "filtros.mp4");
fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
conferir(pronto.espec?.cenas?.[1]?.filtro === "claro", "o filtro da cena volta no espec ao reabrir", pronto.espec?.cenas?.[1]?.filtro ?? "sumiu");

/** Média de R, G, B e do brilho no meio da cena de índice `i`. */
async function medir(i, nome) {
  const jpg = path.join(tmp, `${nome}.jpg`);
  const segundo = i * DURACAO + DURACAO / 2;
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", jpg], { timeout: 60_000 });
  const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  const px = data.length / info.channels;
  for (let p = 0; p < data.length; p += info.channels) {
    r += data[p];
    g += data[p + 1];
    b += data[p + 2];
  }
  return { r: r / px, g: g / px, b: b / px, luz: (r + g + b) / (3 * px), jpg };
}

const m = {};
for (let i = 0; i < ORDEM.length; i++) m[ORDEM[i]] = await medir(i, ORDEM[i]);
m.luzAlta = await medir(ORDEM.length, "luz-alta");

console.log("\n     acabamento     R      G      B    brilho");
for (const [nome, v] of Object.entries(m)) {
  console.log(`     ${nome.padEnd(12)} ${v.r.toFixed(1).padStart(6)} ${v.g.toFixed(1).padStart(6)} ${v.b.toFixed(1).padStart(6)} ${v.luz.toFixed(1).padStart(8)}`);
}
console.log("");

conferir(m.claro.luz > m.natural.luz + 3, "“Claro e limpo” clareia mesmo", `${m.natural.luz.toFixed(1)} → ${m.claro.luz.toFixed(1)}`);
// Quente e sóbrio: o que muda é o EQUILÍBRIO entre vermelho e azul, não o brilho.
const eq = (v) => v.r - v.b;
conferir(eq(m.quente) > eq(m.natural) + 6, "“Aconchegante” puxa pro vermelho", `R−B ${eq(m.natural).toFixed(1)} → ${eq(m.quente).toFixed(1)}`);
conferir(eq(m.sobrio) < eq(m.natural) - 6, "“Sóbrio” puxa pro azul", `R−B ${eq(m.natural).toFixed(1)} → ${eq(m.sobrio).toFixed(1)}`);
const desvioPb = Math.max(Math.abs(m.pb.r - m.pb.g), Math.abs(m.pb.g - m.pb.b), Math.abs(m.pb.r - m.pb.b));
conferir(desvioPb < 2, "“Preto e branco” não tem cor", `maior diferença entre canais: ${desvioPb.toFixed(2)}`);
conferir(m.luzAlta.luz > m.natural.luz + 10, "a luz no máximo clareia a cena", `${m.natural.luz.toFixed(1)} → ${m.luzAlta.luz.toFixed(1)}`);
// O controle: o natural tem que ser igual à foto que entrou, não um "quase".
conferir(Math.abs(eq(m.natural)) < 40, "“Natural” não inventa dominante de cor", `R−B ${eq(m.natural).toFixed(1)}`);

// Uma tira com os seis lado a lado, pra conferir a olho.
const tira = path.join(SAIDA, "filtros-video.jpg");
spawnSync(
  ffmpeg,
  ["-y", "-hide_banner", "-loglevel", "error", ...[...ORDEM, "luzAlta"].flatMap((n) => ["-i", m[n].jpg]), "-filter_complex", `[0][1][2][3][4][5]hstack=inputs=6,scale=1440:-2`, tira],
  { timeout: 120_000 }
);
console.log(`     tira em docs/testes-reais/editor/filtros-video.jpg (${[...ORDEM, "luz máxima"].join(" · ")})`);

await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
