// OS EXEMPLOS DA PÁGINA INICIAL, feitos pelo próprio Encena.
//
// Baixa as fotos de origem (Pexels, licença livre pra uso comercial), manda pela MESMA API
// que o corretor usa (/api/gerar) e grava os pares antes/depois em public/exemplos. O que
// aparece na página é trabalho do produto, não montagem: é o que sustenta a frase "resultado
// real, sem retoque manual".
//
// Gasta crédito de verdade (1 por foto, ~US$ 0,04 no fal). Autorizado pelo dono em
// 20/09/2026. As fotos de origem e os créditos ficam anotados em docs/fotos-da-landing.md.
//
//   BASE=http://localhost:3002 node scripts/gerar-exemplos-landing.mjs [--so-baixar]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SO_BAIXAR = process.argv.includes("--so-baixar");
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const ORIGENS = path.join(RAIZ, "..", "docs", "fotos-origem");
const SAIDA = path.join(RAIZ, "public", "exemplos");

/** Foto do Pexels em tamanho de trabalho. `w` grande o bastante pro modelo e pro site. */
const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1800`;

// id da foto no Pexels · arquivo · ação · parâmetros · legenda que vai na página
const CASOS = [
  // A sala do herói sai no estilo "Brasileiro contemporâneo" de propósito: é o repertório
  // que a arquitetura daqui usa (palhinha, madeira quente, fibra natural) e é o que separa
  // a Encena de um staging gringo que mobília tudo igual.
  { saida: "sala", pexels: "3935327", acao: "mobiliar", params: { tipo_espaco: "sala", estilo: "brasileiro", faixa: "medio", criatividade: "alta" } },
  { saida: "quarto", pexels: "3935349", acao: "mobiliar", params: { tipo_espaco: "quarto", estilo: "escandinavo", faixa: "medio", criatividade: "alta" } },
  { saida: "cozinha", pexels: "11211127", acao: "remover_objeto", params: { instrucao: "" } },
  { saida: "sala2", pexels: "3958953", acao: "mobiliar", params: { tipo_espaco: "sala", estilo: "contemporaneo", faixa: "alto", criatividade: "alta" } },
];

fs.mkdirSync(ORIGENS, { recursive: true });
fs.mkdirSync(SAIDA, { recursive: true });

async function baixar(id) {
  const arquivo = path.join(ORIGENS, `pexels-${id}.jpg`);
  if (fs.existsSync(arquivo)) return arquivo;
  const r = await fetch(pexels(id));
  if (!r.ok) throw new Error(`pexels ${id}: HTTP ${r.status}`);
  fs.writeFileSync(arquivo, Buffer.from(await r.arrayBuffer()));
  console.log(`baixada  pexels-${id}.jpg · ${Math.round(fs.statSync(arquivo).size / 1024)} KB`);
  return arquivo;
}

const origens = [];
for (const c of CASOS) origens.push(await baixar(c.pexels));
if (SO_BAIXAR) {
  console.log("só baixei; nada foi gerado");
  process.exit(0);
}

// ---- sessão da conta ----
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;
console.log(`créditos antes: ${await saldo()}`);

async function gerar(caso, origem) {
  const t0 = Date.now();
  const form = new FormData();
  form.append("foto", new Blob([fs.readFileSync(origem)], { type: "image/jpeg" }), "foto.jpg");
  form.append("acao", caso.acao);
  form.append("parametros", JSON.stringify(caso.params));
  const r = await fetch(`${BASE}/api/gerar`, { method: "POST", headers: cab, body: form });
  const d = await r.json();
  if (!r.ok) {
    console.log(`FALHA   ${caso.saida}: ${d.error}`);
    return null;
  }
  for (let i = 0; i < 160; i++) {
    await new Promise((res) => setTimeout(res, 2500));
    const rr = await fetch(`${BASE}/api/job/${d.jobId}`, { headers: cab });
    const dd = await rr.json();
    if (dd.status === "concluido") {
      const bytes = Buffer.from(await (await fetch(dd.url)).arrayBuffer());
      await sharp(bytes).resize(1600, null, { withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(SAIDA, `${caso.saida}-depois.jpg`));
      await sharp(origem).rotate().resize(1600, null, { withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(SAIDA, `${caso.saida}-antes.jpg`));
      console.log(`ok      ${caso.saida} · ${caso.acao} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${dd.modelo ?? ""}${dd.aviso ? " (reserva)" : ""}`);
      return dd.jobId ?? d.jobId;
    }
    if (dd.status === "erro") {
      console.log(`FALHA   ${caso.saida}: ${dd.error ?? "erro no job"}`);
      return null;
    }
  }
  console.log(`FALHA   ${caso.saida}: tempo esgotado`);
  return null;
}

for (let i = 0; i < CASOS.length; i++) await gerar(CASOS[i], origens[i]);
console.log(`créditos depois: ${await saldo()}`);
console.log(`pares em ${SAIDA}`);
