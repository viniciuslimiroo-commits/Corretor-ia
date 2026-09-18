// PROVA NO AR: um vídeo montado pela API de PRODUÇÃO, sem crédito, conferido no arquivo.
//
// Serve pra depois de um deploy que mexeu no pacote das funções de vídeo (8df8f45 tirou
// músicas, adesivos e scripts do pacote da função de criar): se um arquivo necessário ficou
// de fora, o vídeo sai sem ele -- ou falha -- só em produção, nunca aqui.
//
// Duas cenas da MESMA foto real, paradas, com corte seco:
//   cena 1: texto no rodapé (a FONTE do drawtext) + adesivo solto no meio da foto (o PNG do
//           catálogo e a posição livre)
//   cena 2: a foto limpa -- o controle. A diferença entre as duas é só o que foi posto.
// E música de fundo (o .m4a do catálogo).
//
//   BASE=https://corretor-ia-gilt.vercel.app CONTA=limiro.cardoso@outlook.com node scripts/conferir-video-producao.mjs
//
// Escreve UM vídeo na conta e apaga no fim. Confere que o saldo não mudou.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";

const ffmpeg = ffmpegStatic;
const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "https://corretor-ia-gilt.vercel.app";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-prod-"));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const g = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

console.log(`prova no ar · ${BASE} · ${CONTA}\n`);

// Uma foto real da conta ("JWT issued at future" logo após o login é transitório: repete).
let itens = [];
for (let i = 0; i < 5 && !itens.length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  itens = ((await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json().catch(() => ({}))).itens ?? []);
}
const foto = itens.find((i) => i.categoria !== "video");
conferir(!!foto, "uma foto real da conta", foto ? (foto.acao ?? foto.id) : "lista vazia");
if (!foto) process.exit(1);

const DUR = 3;
const antes = await saldo();
const espec = {
  formato: "9:16",
  cenas: [
    {
      tipo: "foto",
      jobId: foto.id,
      duracao: DUR,
      efeito: "parado",
      textos: [{ texto: "Sala ampla e iluminada", posicao: "base", estilo: "faixa", animacao: "nenhuma" }],
      elementos: [{ id: "adesivo:casa", ancora: "topo_dir", tamanho: 0.2, x: 30, y: 40 }],
    },
    { tipo: "foto", jobId: foto.id, duracao: DUR, efeito: "parado" },
  ],
  musica: "calma",
  narracao: null,
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
};

let videoId = null;
try {
  const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
  const dV = await rV.json();
  videoId = dV.videoId ?? null;
  conferir(rV.ok && !!videoId, "produção aceitou o vídeo", dV.error ?? videoId);
  conferir(dV.custo === 0, "montar com foto pronta não custa crédito", `custo ${dV.custo}`);
  if (!videoId) throw new Error(dV.error ?? "sem id");

  let pronto = null;
  const t0 = Date.now();
  for (let i = 0; i < 100 && !pronto; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/video/${videoId}`, { headers: cab })).json();
    if (j.status === "concluido" && j.url) pronto = j;
    else if (j.status === "falhou") throw new Error(`o vídeo falhou em produção: ${j.error ?? "sem motivo"}`);
  }
  conferir(!!pronto, "produção montou o vídeo (texto com a fonte, adesivo e música)", pronto ? `${Math.round((Date.now() - t0) / 1000)}s` : "não terminou em 5 min");
  if (!pronto) throw new Error("não terminou");
  const avisos = pronto.pipeline?.avisos ?? pronto.avisos ?? [];
  conferir(!avisos.length, "a montagem não deixou aviso de arquivo faltando", avisos.join(" | ") || "nenhum aviso");

  const mp4 = path.join(SAIDA, "producao.mp4");
  fs.writeFileSync(mp4, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));

  // Música: o volume médio de um trecho mudo fica abaixo de -70 dB.
  const vol = spawnSync(ffmpeg, ["-hide_banner", "-i", mp4, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const media = Number((vol.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/) ?? [])[1]);
  conferir(Number.isFinite(media) && media > -45, "tem música no arquivo (volume médio)", Number.isFinite(media) ? `${media} dB` : "sem trilha de áudio");

  // Imagem: cena 1 contra cena 2 (mesma foto, parada). O que mudou foi o que se pôs.
  const quadro = async (seg, nome) => {
    const png = path.join(SAIDA, `${nome}.png`);
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(seg), "-i", mp4, "-frames:v", "1", png]);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, W: info.width, H: info.height };
  };
  const a = await quadro(DUR / 2, "cena1");
  const b = await quadro(DUR + DUR / 2, "cena2");
  const tinta = (y0, y1) => {
    let n = 0, sx = 0, sy = 0;
    for (let y = Math.round(a.H * y0); y < Math.round(a.H * y1); y++)
      for (let x = 0; x < a.W; x++) {
        const i = (y * a.W + x) * 3;
        const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
        if (d > 40) {
          n++;
          sx += x;
          sy += y;
        }
      }
    return { n, cx: sx / Math.max(1, n) / a.W, cy: sy / Math.max(1, n) / a.H };
  };
  const adesivo = tinta(0.1, 0.7);
  conferir(adesivo.n > 800 && Math.abs(adesivo.cx - 0.3) < 0.08 && Math.abs(adesivo.cy - 0.4) < 0.08, "adesivo desenhado, no ponto solto (30%, 40%)", `${adesivo.n} px · centro ${Math.round(adesivo.cx * 100)}%,${Math.round(adesivo.cy * 100)}%`);
  const texto = tinta(0.75, 1);
  conferir(texto.n > 800, "texto do rodapé desenhado (a fonte chegou na função)", `${texto.n} px`);
  console.log(`     quadros em ${SAIDA}`);
} catch (e) {
  conferir(false, "a prova chegou ao fim", e.message);
} finally {
  if (videoId) {
    const r = await fetch(`${BASE}/api/video/${videoId}`, { method: "DELETE", headers: cab });
    console.log(`\nvídeo de teste apagado: HTTP ${r.status}`);
  }
  conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
