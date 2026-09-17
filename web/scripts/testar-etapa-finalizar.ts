// A montagem em DUAS etapas, de ponta a ponta pela API (fase 1 da linha do tempo).
//
// `montar` roda o ffmpeg e sobe o mp4; `finalizar` faz a capa, a miniatura e grava como
// pronto. O que se confere num vídeo de verdade (fotos reais da conta, sem crédito):
//   - a contagem de etapas inclui a nova, e a trava é solta a cada chamada;
//   - `p.tempos.montar` e `p.tempos.finalizar` ficam gravados, com `nucleos`;
//   - a duração gravada e a do arquivo são as do relógio (±0,05);
//   - capa e miniatura existem; o vídeo é apagado no fim e o saldo não muda.
//
//   BASE=http://localhost:3000 node --import ./scripts/ts-direto.mjs scripts/testar-etapa-finalizar.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const FF = ffmpegStatic as unknown as string;
process.env.FFMPEG_PATH ??= FF;
const { relogioDoEspec } = await import("../src/lib/video.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
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
const conferir = (ok: boolean, oque: string, extra = "") => {
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

const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i: { categoria: string }) => i.categoria !== "video").slice(0, 3);
conferir(fotos.length === 3, "3 fotos reais da conta");
if (fotos.length < 3) process.exit(1);

const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: fotos[0].id, duracao: 4, efeito: "aproximar" },
    { tipo: "foto", jobId: fotos[1].id, duracao: 5, efeito: "afastar" },
    { tipo: "foto", jobId: fotos[2].id, duracao: 3, efeito: "aproximar" },
  ],
  musica: "nenhuma",
  narracao: null,
  titulo: "Apto 302",
  preco: "R$ 690.000",
  local: "Setor Bueno",
  telaFinal: true,
  transicao: "dissolver",
  efeitoSonoro: "clique",
};
const relogio = relogioDoEspec(espec as never);
const antes = await saldo();
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
if (!rV.ok) process.exit(1);

const mensagens = new Set<string>();
let pronto: Record<string, unknown> | null = null;
let totalDeEtapas = 0;
for (let i = 0; i < 120 && !pronto; i++) {
  await new Promise((z) => setTimeout(z, 2500));
  const j = await (await fetch(`${BASE}/api/video/${dV.videoId}`, { headers: cab })).json();
  if (j.mensagem) mensagens.add(`${j.etapa}: ${j.mensagem} (${j.feitas}/${j.total})`);
  if (j.total) totalDeEtapas = j.total;
  if (j.status === "concluido" && j.url) pronto = j;
  else if (j.status === "falhou") {
    conferir(false, "o vídeo falhou", j.error);
    break;
  }
}
console.log("     " + [...mensagens].join("\n     "));
conferir(!!pronto, "o vídeo ficou pronto");
// Com folga, a montagem emenda o `finalizar` na mesma chamada -- aí a tela nem chega a ver
// a etapa nova. O que prova que ela rodou é o tempo gravado dela, conferido abaixo.
console.log(`     etapa "finalizar" vista pela tela: ${[...mensagens].some((m) => m.startsWith("finalizar:")) ? "sim" : "não (emendou na montagem)"}`);
// 3 cenas + tela final + montar + finalizar
conferir(totalDeEtapas === 6, "a contagem de etapas inclui a nova", String(totalDeEtapas));

if (pronto) {
  const [linha] = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/videos?id=eq.${dV.videoId}&select=pipeline,duracao_segundos,thumb_path,output_path,status,lock_ate`, { headers: admin })).json();
  const p = linha.pipeline;
  console.log(`     tempos ${JSON.stringify(p.tempos)} · núcleos ${p.nucleos} · duração gravada ${linha.duracao_segundos} · relógio ${relogio.total}`);
  conferir(p.etapa === "concluido" && linha.status === "concluido", "gravado como concluído");
  conferir((p.tempos?.montar ?? 0) > 0 && (p.tempos?.finalizar ?? 0) > 0 && (p.tempos?.cena ?? 0) > 0, "tempos de cena, montar e finalizar gravados");
  conferir(Number.isInteger(p.nucleos) && p.nucleos > 0, "núcleos gravados", String(p.nucleos));
  conferir(Math.abs(Number(linha.duracao_segundos) - relogio.total) <= 0.05, "duração gravada = relógio", `${linha.duracao_segundos} x ${relogio.total}`);
  conferir(!!linha.thumb_path, "capa gravada");
  conferir(linha.lock_ate === null, "a trava foi solta pela chamada dona dela", String(linha.lock_ate));
  const arquivo = path.join(os.tmpdir(), `encena-finalizar-${dV.videoId}.mp4`);
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(String(pronto.url))).arrayBuffer()));
  const s = String(spawnSync(FF, ["-hide_banner", "-i", arquivo], { encoding: "utf8" }).stderr);
  const m = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const dur = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
  conferir(Math.abs(dur - relogio.total) <= 0.05, "duração do arquivo = relógio", `${dur} x ${relogio.total}`);
  fs.rmSync(arquivo, { force: true });
}

const apagar = await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
conferir(apagar.ok, "vídeo de teste apagado");
conferir(antes === (await saldo()), "o saldo não mudou", String(antes));
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
