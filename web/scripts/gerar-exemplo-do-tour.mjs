// GERA O EXEMPLO REAL DO "TOUR PELA CASA" que a janelinha de /videos mostra.
//
// Ele em 11/10/2026, olhando a janelinha: "os exemplos estão quase iguais, do tour e o
// padrão grátis; a tour realmente ande, parece somente efeito aproximando". Estava certo:
// o tour é um clipe gerado por IA, em que a câmera se desloca pelo espaço, e nenhuma
// animação de navegador reproduz isso -- um zoom numa foto chapada não revela a parede que
// a foto não viu. A única demonstração honesta é um clipe de verdade.
//
// ESTE ROTEIRO GASTA CRÉDITO DE IA (2, uma cena animada). Ele autorizou em 11/10/2026, uma
// vez. Por isso há trava: se o arquivo de saída já existe, ele não roda. Pra refazer de
// propósito, apague o arquivo antes.
//
// A foto de origem é a NOSSA (`public/exemplos/sala-depois.jpg`). Imóvel de cliente não
// vira arquivo do produto -- existem 19 clipes prontos na conta principal e nenhum deles
// pode ser embarcado, por isso este aqui nasce da foto de exemplo.
//
//   BASE=http://localhost:3000 node scripts/gerar-exemplo-do-tour.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ORIGEM = path.join(RAIZ, "public/exemplos/sala-depois.jpg");
const SAIDA = path.join(RAIZ, "public/exemplos/tour-camera.mp4");
const BASE = process.env.BASE ?? "http://localhost:3000";
// NÃO é a conta de teste de sempre (`limiro.cardoso@outlook.com`): ela é dona da org
// "Limiro Imoveis", e quem paga a cena animada de quem está numa organização é a ORG, que
// está zerada -- o pedido voltou com "a imobiliária não tem saldo suficiente". Esta aqui é
// uma conta descartável, sem organização, que paga do saldo pessoal dela. A org de verdade
// dele (Imobiliária J7, 38 créditos) é dinheiro do negócio e fica fora disto.
const CONTA = process.env.CONTA ?? "novo-1789325410@teste.encena.app.br";
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

// ---- a trava ----
if (fs.existsSync(SAIDA)) {
  console.log(`${path.relative(RAIZ, SAIDA)} já existe — não gero de novo (custaria 2 créditos).`);
  console.log("Pra refazer de propósito, apague o arquivo e rode outra vez.");
  process.exit(0);
}
if (!fs.existsSync(ORIGEM)) {
  console.error(`não achei a foto de origem: ${ORIGEM}`);
  process.exit(1);
}

const saldo = async (userId) =>
  fetch(`${SUPA}/rest/v1/users?id=eq.${userId}&select=creditos_saldo`, { headers: admin })
    .then((r) => r.json())
    .then((x) => x?.[0]?.creditos_saldo ?? null);
const listarAnimadas = async (userId) =>
  fetch(`${SUPA}/storage/v1/object/list/resultados`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `animadas/${userId}`, limit: 200 }),
  })
    .then((r) => r.json())
    .then((x) => (Array.isArray(x) ? x.map((f) => f.name) : []));

// ---- entrar ----
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }).then((x) => x.json());
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };

const antes = await saldo(user.id);
console.log(`conta ${CONTA} · ${antes} crédito(s) antes`);
if (antes !== null && antes < 2) {
  console.error("menos de 2 créditos: não dá pra gerar a cena animada.");
  process.exit(1);
}
const animadasAntes = new Set(await listarAnimadas(user.id));

// ---- a foto de exemplo entra como upload da conta ----
// CAMINHO FIXO, de propósito. A chave que guarda o clipe da IA é um sha1 de
// [arquivo, animação, quadros, proporção] (`chaveDaAnimacao`): com um UUID novo a cada
// corrida, refazer o arquivo cobraria 2 créditos de novo. Com o caminho fixo, o clipe é
// REAPROVEITADO e refazer sai de graça -- o que muda por cima (o movimento do ffmpeg) não
// entra na chave justamente porque não passa por modelo nenhum.
const caminhoFoto = `uploads/${user.id}/exemplo-tour-sala.jpg`;
const subiu = await fetch(`${SUPA}/storage/v1/object/resultados/${caminhoFoto}`, {
  method: "POST",
  headers: { ...admin, "Content-Type": "image/jpeg" },
  body: fs.readFileSync(ORIGEM),
});
if (!subiu.ok) {
  console.error(`não consegui subir a foto: ${subiu.status} ${await subiu.text()}`);
  process.exit(1);
}
console.log(`foto de exemplo em ${caminhoFoto}`);

// ---- uma cena só, animada: é o que custa e é o que eu quero mostrar ----
const espec = {
  formato: "9:16",
  // `efeito: "direita"` NÃO é enfeite -- é metade do movimento.
  //
  // O produto soma duas coisas numa cena animada: a IA dá a PARALAXE (o batente ganha
  // espessura, o sofá sai da frente da parede) e o ffmpeg dá a DISTÂNCIA (recorta e desliza).
  // Está medido em video-ffmpeg.ts: a IA sozinha anda 8,1 e o alvo é 16,4; com `direita` por
  // cima dá 16,7. Na primeira geração eu mandei `parado`, desliguei o ffmpeg e gravei só o
  // clipe cru -- ele olhou e disse "tour pela casa está parado", com razão: era metade.
  // `aproximar` soma pouco (12,6: é redundante com o avanço da IA) e `afastar` CANCELA (8,1).
  cenas: [{ tipo: "animada", arquivo: caminhoFoto, animacao: "caminhar", duracao: 4, efeito: "direita" }],
  musica: "nenhuma",
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
  const r = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
  const d = await r.json();
  videoId = d.videoId ?? null;
  if (!r.ok || !videoId) throw new Error(d.error ?? `HTTP ${r.status}`);
  console.log(`vídeo ${videoId} · custo ${d.custo} crédito(s) · gerando (costuma levar alguns minutos)…`);

  let pronto = null;
  const t0 = Date.now();
  for (let i = 0; i < 160 && !pronto; i++) {
    await new Promise((z) => setTimeout(z, 4000));
    const j = await fetch(`${BASE}/api/video/${videoId}`, { headers: cab }).then((x) => x.json());
    if (j.status === "concluido" && j.url) pronto = j;
    else if (j.status === "falhou") throw new Error(`falhou: ${j.error ?? "sem motivo"}`);
    else if (i % 5 === 0) process.stdout.write(`  ${Math.round((Date.now() - t0) / 1000)}s · etapa ${j.pipeline?.etapa ?? j.status}\n`);
  }
  if (!pronto) throw new Error("não terminou em 10 minutos");
  console.log(`pronto em ${Math.round((Date.now() - t0) / 1000)}s`);

  // O arquivo que a pessoa receberia -- não o clipe cru. É ele que a janelinha deve mostrar.
  const bruto = path.join(os.tmpdir(), `tour-bruto-${Date.now()}.mp4`);
  fs.writeFileSync(bruto, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  console.log(`baixado: ${Math.round(fs.statSync(bruto).size / 1024)} kB`);

  // ---- encolher pra web: a janelinha tem 152px de largura ----
  const ff = spawnSync(ffmpegStatic, ["-y", "-i", bruto, "-an", "-vf", "scale=288:-2", "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow", "-movflags", "+faststart", SAIDA], { encoding: "utf8" });
  if (ff.status !== 0) throw new Error(`ffmpeg falhou: ${(ff.stderr ?? "").slice(-400)}`);
  console.log(`gravado em ${path.relative(RAIZ, SAIDA)} · ${Math.round(fs.statSync(SAIDA).size / 1024)} kB`);

  const animadasDepois = await listarAnimadas(user.id);
  const novos = animadasDepois.filter((n) => !animadasAntes.has(n));
  console.log(`clipe cru guardado como: ${novos.join(", ") || "(nenhum novo — reaproveitou um existente)"}`);
} finally {
  // O vídeo montado sai; a FOTO FICA. Ela é a chave do clipe guardado: apagando-a, a
  // próxima corrida subiria outra e pagaria a IA de novo. São poucos kB numa conta
  // descartável -- barato perto de 2 créditos.
  if (videoId) await fetch(`${BASE}/api/video/${videoId}`, { method: "DELETE", headers: cab }).catch(() => {});
  const depois = await saldo(user.id);
  console.log(`\nsaldo: ${antes} → ${depois} crédito(s)${antes === depois ? " (reaproveitou o clipe guardado — não custou nada)" : ""}`);
}
