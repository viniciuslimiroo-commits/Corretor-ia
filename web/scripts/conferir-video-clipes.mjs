// UM VÍDEO PRONTO COMO CLIPE DE OUTRO, montado de verdade (pipeline + ffmpeg), sem crédito.
//
// Pega um vídeo que a conta já fez, põe ele em DUAS PARTES seguidas (0..A e A..A+B, corte
// seco entre elas -- o que o editor faz com vídeo longo) e monta. Confere no arquivo:
//   - a montagem aceita o vídeo pronto como clipe (antes recusava: "Arquivo não reconhecido");
//   - a duração é a soma das partes;
//   - cada ponto do vídeo novo mostra o MESMO quadro do original no mesmo segundo: a parte 2
//     continua exatamente de onde a 1 parou (nem pula, nem repete);
//   - perto da emenda o vídeo continua andando (sem o "pouso" de 0,45s congelado).
// Escreve UM vídeo na conta e apaga no fim. Confere que o saldo não mudou.
//
//   BASE=http://localhost:3002 CONTA=limiro.cardoso@outlook.com node scripts/conferir-video-clipes.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-clipes-"));
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const r0 = await fetch(`${BASE}/login`).catch(() => null);
if (!r0 || !r0.ok) {
  console.log(`o servidor ${BASE} não respondeu; nada foi feito`);
  process.exit(1);
}
const g = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

console.log(`vídeo pronto como clipe · ${BASE} · ${CONTA}\n`);

// Um vídeo pronto de pelo menos 9s ("JWT issued at future" logo após o login: repete).
let lista = [];
for (let i = 0; i < 5 && !lista.length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  lista = ((await (await fetch(`${BASE}/api/video`, { headers: cab })).json().catch(() => ({}))).videos ?? []).filter((x) => x.status === "concluido" && (x.duracao ?? 0) >= 9);
}
const fonteResumo = lista[0];
conferir(!!fonteResumo, "um vídeo pronto da conta, com 9s ou mais", fonteResumo ? `${fonteResumo.titulo} · ${fonteResumo.duracao}s` : "nenhum");
if (!fonteResumo) process.exit(1);
const fonte = await (await fetch(`${BASE}/api/video/${fonteResumo.id}`, { headers: cab })).json();
conferir(typeof fonte.arquivo === "string" && fonte.arquivo.endsWith(`/videos/${fonteResumo.id}.mp4`), "a API devolve o caminho do arquivo pronto (é o que o editor manda de volta)", fonte.arquivo);

const A = 4;
const B = 4;
const antes = await saldo();
const espec = {
  formato: fonte.formato ?? "9:16",
  cenas: [
    { tipo: "clipe", arquivo: fonte.arquivo, duracao: A, transicao: "corte" },
    { tipo: "clipe", arquivo: fonte.arquivo, inicio: A, duracao: B },
  ],
  musica: "nenhuma",
  narracao: null,
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "dissolver",
  filtro: "natural",
};

const ffmpeg = ffmpegStatic;
const quadro = async (mp4, seg, nome) => {
  const png = path.join(SAIDA, `${nome}.png`);
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", seg.toFixed(2), "-i", mp4, "-frames:v", "1", png]);
  const { data } = await sharp(png).resize(108, 192, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
};
const distancia = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

let videoId = null;
try {
  const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
  const dV = await rV.json();
  videoId = dV.videoId ?? null;
  conferir(rV.ok && !!videoId, "a montagem ACEITA um vídeo pronto como clipe (antes: “Arquivo não reconhecido”)", dV.error ?? videoId);
  conferir(dV.custo === 0, "não custa crédito", `custo ${dV.custo}`);
  if (!videoId) throw new Error(dV.error ?? "sem id");

  let pronto = null;
  const t0 = Date.now();
  for (let i = 0; i < 120 && !pronto; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/video/${videoId}`, { headers: cab })).json();
    if (j.status === "concluido" && j.url) pronto = j;
    else if (j.status === "falhou") throw new Error(`o vídeo falhou: ${j.error ?? "sem motivo"}`);
  }
  conferir(!!pronto, "montou o vídeo", pronto ? `${Math.round((Date.now() - t0) / 1000)}s` : "não terminou em 6 min");
  if (!pronto) throw new Error("não terminou");

  const novo = path.join(SAIDA, "novo.mp4");
  const original = path.join(SAIDA, "original.mp4");
  fs.writeFileSync(novo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  fs.writeFileSync(original, Buffer.from(await (await fetch(fonte.url)).arrayBuffer()));

  conferir(Math.abs((pronto.duracao ?? 0) - (A + B)) < 0.3, "a duração é a soma das partes", `${pronto.duracao}s (esperado ${A + B}s)`);

  // Cada segundo do novo mostra o quadro do original no mesmo segundo.
  const pontos = [1, A - 0.35, A + 0.35, A + B - 0.8];
  const dists = [];
  for (const t of pontos) dists.push(distancia(await quadro(novo, t, `novo-${t}`), await quadro(original, t, `orig-${t}`)));
  conferir(dists.every((d) => d < 14), "cada ponto do vídeo novo é o MESMO quadro do original no mesmo segundo (a parte 2 continua de onde a 1 parou)", dists.map((d) => d.toFixed(1)).join(" / "));

  // Perto da emenda o vídeo anda (sem o pouso congelado), se o original anda ali.
  const mOrig = distancia(await quadro(original, A - 0.42, "o1"), await quadro(original, A - 0.04, "o2"));
  const mNovo = distancia(await quadro(novo, A - 0.42, "n1"), await quadro(novo, A - 0.04, "n2"));
  conferir(mOrig < 1.5 || mNovo > mOrig * 0.5, "perto da emenda o vídeo continua andando (sem quadro congelado)", `movimento no original ${mOrig.toFixed(2)}, no novo ${mNovo.toFixed(2)}`);
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
