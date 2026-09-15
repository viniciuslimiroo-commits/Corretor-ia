// A mesma sala vazia, mobiliada nas quatro faixas de mercado.
//
//   node scripts/testar-faixas.mjs <foto-de-sala-vazia.jpg> [pasta] [faixas...]
//
// O que precisa ser olhado aqui nenhum assert pega: se "econômico" saiu BONITO. A regra
// do produto é que faixa menor muda material e quantidade de camadas, nunca capricho --
// nada de parede encardida, móvel velho ou sala vazia fingindo de simples.
//
// Uma imagem de IA por faixa, 1 crédito cada.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const FOTO = process.argv[2];
const SAIDA = process.argv[3] ?? path.join(RAIZ, "..", "docs", "testes-reais", "faixas");
const FAIXAS = process.argv.slice(4).length ? process.argv.slice(4) : ["economico", "medio", "alto", "luxo"];

if (!FOTO || !fs.existsSync(FOTO)) {
  console.error("Uso: node scripts/testar-faixas.mjs <foto.jpg> [pasta] [faixas...]");
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

const email = process.env.CONTA ?? "viniciuslimiroo@gmail.com";
const token = await sessaoDe(email);
if (!token) {
  console.error(`sem sessão pra ${email}`);
  process.exit(1);
}

fs.mkdirSync(SAIDA, { recursive: true });
fs.copyFileSync(FOTO, path.join(SAIDA, "00-antes.jpg"));

const ESTILO = process.env.ESTILO ?? "moderno";
const ESPACO = process.env.ESPACO ?? "sala";
console.log(`conta: ${email}\nfoto: ${path.basename(FOTO)}\nestilo: ${ESTILO} · espaço: ${ESPACO}\n`);

for (const faixa of FAIXAS) {
  const t0 = Date.now();
  process.stdout.write(`${faixa.padEnd(11)} `);

  const f = new FormData();
  f.set("foto", new File([fs.readFileSync(FOTO)], "sala.jpg", { type: "image/jpeg" }));
  // `mobiliar` só acrescenta móvel; `renovar` refaz piso, parede e luz. A faixa aparece
  // muito mais na segunda, e testar só a primeira dá a impressão de que o eixo não pega.
  f.set("acao", process.env.ACAO ?? "mobiliar");
  f.set("tipo_espaco", ESPACO);
  f.set("estilo", ESTILO);
  f.set("faixa", faixa);
  f.set("criatividade", "alta");

  const r = await fetch(`${BASE}/api/gerar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
  const d = await r.json();
  if (!r.ok) {
    console.log(`FALHOU · ${d.error}`);
    continue;
  }

  let url = null;
  for (let i = 0; i < 60 && !url; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/job/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.status === "concluido" && j.url) url = j.url;
    else if (j.status === "falhou" || j.error) {
      console.log(`FALHOU · ${j.error ?? "a IA não conseguiu"}`);
      break;
    }
  }
  if (!url) {
    if (!process.stdout.write("")) {/* nada */}
    console.log("sem resultado");
    continue;
  }

  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(SAIDA, `${faixa}.jpg`), bytes);
  console.log(`ok · ${Math.round((Date.now() - t0) / 1000)}s`);
}

console.log(`\nsalvas em ${SAIDA}`);
