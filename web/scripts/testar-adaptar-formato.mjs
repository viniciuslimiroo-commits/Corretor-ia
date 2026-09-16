// "Fazer também em outro formato": o mesmo conteúdo, outro enquadramento.
//
// Vale pros dois editores e por isso o teste é um só: o vídeo vira quadrado e 4:5 com as
// mesmas cenas, e o material vira Story e feed com os mesmos textos. O que se confere é o
// ARQUIVO -- a proporção que saiu, e não o que o pedido dizia.
//
//   BASE=http://localhost:3000 node scripts/testar-adaptar-formato.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emprestarFotos } from "./emprestar-fotos.mjs";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-fmt-"));

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

let materiais = { itens: [] };
for (let i = 0; i < 5 && !(materiais.itens ?? []).length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json().catch(() => ({ itens: [] }));
}
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 2);
conferir(fotos.length >= 2, "fotos reais na conta", `${fotos.length}`);
if (fotos.length < 2) process.exit(1);

const antes = await saldo();

// ---------- 1. o vídeo em três formatos ----------
console.log("--- 1. o vídeo em três enquadramentos ---");
const base = {
  formato: "9:16",
  cenas: fotos.map((f) => ({ tipo: "foto", jobId: f.id, duracao: 3, efeito: "parado" })),
  musica: "nenhuma",
  narracao: null,
  titulo: "Adaptação",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
};

const ESPERADO = { "9:16": 1080 / 1920, "1:1": 1, "4:5": 1080 / 1350 };

for (const formato of ["9:16", "1:1", "4:5"]) {
  const r = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec: { ...base, formato } }) });
  const d = await r.json();
  conferir(r.ok, `${formato}: aceito`, d.error ?? "");
  conferir(d.custo === 0, `${formato}: adaptar não custa crédito`, `custo ${d.custo}`);
  if (!r.ok) continue;

  let pronto = null;
  for (let i = 0; i < 90 && !pronto; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/video/${d.videoId}`, { headers: cab })).json();
    if (j.status === "concluido" && j.url) pronto = j;
    else if (j.status === "falhou") {
      conferir(false, `${formato}: falhou`, j.error);
      break;
    }
  }
  if (!pronto) {
    conferir(false, `${formato}: não ficou pronto`);
    continue;
  }

  const arq = path.join(tmp, `v-${formato.replace(":", "x")}.mp4`);
  fs.writeFileSync(arq, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  // Medido no QUADRO, não pelo ffprobe: o caminho do ffprobe não existe neste pacote
  // (`ffmpeg-static` traz só o ffmpeg), e trocar "ffmpeg" por "ffprobe" no caminho
  // acerta o nome da PASTA antes do executável. Extrair um quadro e medir com o sharp
  // usa o que está instalado e mede a imagem que a pessoa vai ver.
  const jpg = path.join(tmp, `v-${formato.replace(":", "x")}.jpg`);
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", arq, "-frames:v", "1", jpg], { timeout: 60_000 });
  const meta = await sharp(jpg).metadata();
  const w = meta.width ?? 0;
  const alt = meta.height ?? 1;
  const prop = w / alt;
  console.log(`     ${formato}: ${w}×${alt} (${prop.toFixed(3)})`);
  conferir(Math.abs(prop - ESPERADO[formato]) < 0.01, `${formato}: o arquivo saiu na proporção pedida`, `${prop.toFixed(3)} vs ${ESPERADO[formato].toFixed(3)}`);
  conferir(pronto.espec?.cenas?.length === base.cenas.length, `${formato}: as mesmas cenas`, `${pronto.espec?.cenas?.length}`);
  await fetch(`${BASE}/api/video/${d.videoId}`, { method: "DELETE", headers: cab });
}

// ---------- 2. o material em três formatos ----------
console.log("\n--- 2. o material em três enquadramentos ---");
const cri = await fetch(`${BASE}/api/imoveis`, { method: "POST", headers: json, body: JSON.stringify({ titulo: "TESTE formato · Apto 74", endereco: "Setor Bueno · Goiânia" }) });
const imovel = (await cri.json()).imovel;
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ negocio: "venda", preco: "R$ 690.000", dormitorios: 3, area_util: 120 }) });
const devolverFotos = await emprestarFotos(BASE, json, fotos, imovel.id);

const rM = await fetch(`${BASE}/api/books`, { method: "POST", headers: json, body: JSON.stringify({ tipo: "post", imovelId: imovel.id }) });
const dM = await rM.json();
conferir(rM.ok && !!dM.book?.id, "post criado", dM.error ?? "");
if (dM.book?.id) {
  const bookId = dM.book.id;
  const PROPORCAO = { quadrado: 1, story: 1080 / 1920, feed: 1080 / 1350 };
  let titulo = null;
  for (const formato of ["quadrado", "story", "feed"]) {
    const atual = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
    const capa = atual.documento.paginas.find((p) => p.tipo === "capa");
    // O título é lido na primeira volta e conferido nas outras: trocar o enquadramento
    // não pode mexer no conteúdo.
    titulo ??= capa?.textos.titulo ?? "";
    const troca = await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: { ...atual.documento, formato }, versao: atual.book.versao }) });
    conferir(troca.ok, `${formato}: formato trocado`, troca.ok ? "" : (await troca.json()).error);

    const e = await fetch(`${BASE}/api/books/${bookId}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve", pagina: 0 }) });
    conferir(e.ok, `${formato}: exportou`, e.ok ? "" : (await e.json()).error);
    if (!e.ok) continue;
    const bytes = Buffer.from(await e.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    const prop = meta.width / meta.height;
    console.log(`     ${formato}: ${meta.width}×${meta.height} (${prop.toFixed(3)})`);
    conferir(Math.abs(prop - PROPORCAO[formato]) < 0.02, `${formato}: a imagem saiu na proporção pedida`, `${prop.toFixed(3)} vs ${PROPORCAO[formato].toFixed(3)}`);
    conferir(meta.width === 1080, `${formato}: 1080px de largura, como a rede pede`, `${meta.width}`);

    const depois = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
    const capaDepois = depois.documento.paginas.find((p) => p.tipo === "capa");
    conferir(capaDepois?.textos.titulo === titulo, `${formato}: o conteúdo não mudou junto com o quadro`, capaDepois?.textos.titulo ?? "sumiu");
    conferir(capaDepois?.origem === "auto", `${formato}: trocar o quadro não marca a página como mexida à mão`, `${capaDepois?.origem}`);
  }
  await fetch(`${BASE}/api/books/${bookId}`, { method: "DELETE", headers: cab });
}
// As fotos voltam pro imóvel de onde vieram ANTES de apagar o de teste: apagar
// primeiro deixaria cada uma sem imóvel nenhum, e não há histórico pra reconstruir.
await devolverFotos();
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "DELETE", headers: cab });

conferir(antes === (await saldo()), "adaptar formato não gasta crédito nenhum", `${antes}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
