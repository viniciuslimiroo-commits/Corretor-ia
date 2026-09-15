// A obra inteira, de ponta a ponta, com uma foto de lote de verdade e IA de verdade.
//
//   node scripts/testar-obra-real.mjs "C:\caminho\lote.jpg" [saida]
//
// Gasta 4 créditos: uma imagem por etapa. Salva as quatro na pasta de saída pra dar pra
// olhar lado a lado -- porque o que precisa ser conferido aqui nenhum assert pega: se é a
// MESMA casa subindo, se o terreno continuou sendo aquele terreno, e se a marca d'água de
// quem fotografou o lote sobreviveu.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const FOTO = process.argv[2];
const SAIDA = process.argv[3] ?? path.join(RAIZ, "..", "docs", "testes-reais", "obra");

if (!FOTO || !fs.existsSync(FOTO)) {
  console.error("Uso: node scripts/testar-obra-real.mjs <foto-do-lote.jpg> [pasta-de-saida]");
  process.exit(1);
}

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

const { ETAPAS_OBRA } = await import(new URL("../src/lib/obra-etapas.ts", import.meta.url).href);

async function sessaoDe(email) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  return new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
}

const email = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const token = await sessaoDe(email);
if (!token) {
  console.error(`não consegui uma sessão pra ${email}`);
  process.exit(1);
}

fs.mkdirSync(SAIDA, { recursive: true });
fs.copyFileSync(FOTO, path.join(SAIDA, "00-terreno-original.jpg"));

const PROJETO = { tipo: process.env.TIPO ?? "terrea", estilo: process.env.ESTILO ?? "moderna" };
const EQUIPE = process.env.EQUIPE === "1";
console.log(`conta: ${email}`);
console.log(`projeto: ${PROJETO.tipo} · ${PROJETO.estilo} · equipe ${EQUIPE ? "ligada" : "desligada"}\n`);

let entrada = new File([fs.readFileSync(FOTO)], "lote.jpg", { type: "image/jpeg" });
const comeco = Date.now();

for (const etapa of ETAPAS_OBRA) {
  const t0 = Date.now();
  process.stdout.write(`${etapa.ordem}. ${etapa.rotulo.padEnd(10)} `);

  const f = new FormData();
  f.set("foto", entrada);
  f.set("acao", etapa.id);
  f.set("equipe", EQUIPE ? "1" : "");
  f.set("tipo", PROJETO.tipo);
  f.set("estilo", PROJETO.estilo);

  const r = await fetch(`${BASE}/api/terreno/ia`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
  const d = await r.json();
  if (!r.ok) {
    console.log(`FALHOU · ${d.error}`);
    process.exit(1);
  }

  let url = null;
  for (let i = 0; i < 60 && !url; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/job/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.status === "concluido" && j.url) url = j.url;
    else if (j.status === "falhou" || j.error) {
      console.log(`FALHOU · ${j.error ?? "a IA não conseguiu"}`);
      process.exit(1);
    }
  }
  if (!url) {
    console.log("FALHOU · demorou demais");
    process.exit(1);
  }

  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  const arquivo = path.join(SAIDA, `${String(etapa.ordem).padStart(2, "0")}-${etapa.id.replace("obra_", "")}.jpg`);
  fs.writeFileSync(arquivo, bytes);
  console.log(`ok · ${Math.round((Date.now() - t0) / 1000)}s · ${(bytes.length / 1024).toFixed(0)} KB`);

  // A imagem pronta é a entrada da próxima: é isso que faz a obra ser UMA obra.
  entrada = new File([bytes], `${etapa.id}.jpg`, { type: "image/jpeg" });
}

console.log(`\nas quatro etapas em ${Math.round((Date.now() - comeco) / 1000)}s`);
console.log(`salvas em ${SAIDA}`);
