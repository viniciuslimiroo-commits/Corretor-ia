// Roda migração no Supabase sem abrir o painel.
//
//   node scripts/migrar.mjs                 -> roda todas as migrações, em ordem
//   node scripts/migrar.mjs 11              -> roda só a 11
//
// Precisa de SUPABASE_ACCESS_TOKEN no web/.env.local (token pessoal, criado em
// supabase.com/dashboard/account/tokens). É a única chave que falta pra nunca mais
// precisar colar SQL no painel à mão.
//
// Todas as migrações do projeto são idempotentes ("if not exists", "add column if not
// exists", "drop policy if exists"), então rodar de novo não quebra nada -- é por isso
// que este script não guarda estado de quais já rodaram.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

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

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    [
      "Falta SUPABASE_ACCESS_TOKEN no web/.env.local.",
      "",
      "1. Abra supabase.com/dashboard/account/tokens",
      '2. "Generate new token", nome: encena-cli',
      "3. Cole no web/.env.local assim:  SUPABASE_ACCESS_TOKEN=sbp_...",
      "",
      "Depois disso, toda migração roda por aqui e o painel não precisa mais ser aberto.",
    ].join("\n")
  );
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL no web/.env.local.");
  process.exit(1);
}
const ref = new URL(url).hostname.split(".")[0];

const alvo = process.argv[2];
const pasta = path.join(RAIZ, "supabase");
const arquivos = fs
  .readdirSync(pasta)
  .filter((f) => f.startsWith("migration-") && f.endsWith(".sql"))
  .filter((f) => !alvo || f.startsWith(`migration-${String(alvo).padStart(2, "0")}`))
  .sort();

if (arquivos.length === 0) {
  console.error(alvo ? `Não achei migração ${alvo} em web/supabase/.` : "Não achei migração nenhuma.");
  process.exit(1);
}

console.log(`projeto ${ref} · ${arquivos.length} ${arquivos.length === 1 ? "migração" : "migrações"}\n`);

for (const arquivo of arquivos) {
  const sql = fs.readFileSync(path.join(pasta, arquivo), "utf8");
  process.stdout.write(`${arquivo.padEnd(50)} `);
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const corpo = await r.text();
  if (!r.ok) {
    console.log(`FALHOU ${r.status}`);
    console.error(`\n${corpo.slice(0, 600)}\n`);
    process.exit(1);
  }
  console.log("ok");
}

console.log("\npronto.");
