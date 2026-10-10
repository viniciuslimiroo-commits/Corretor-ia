// AS BANCADAS ESTÃO FECHADAS NO AR? Tudo que mora em `/dev` é bancada de desenvolvimento e
// não pode abrir no site publicado. Quem fecha é o `notFound()` de `src/app/dev/layout.tsx`,
// que vale pra toda rota abaixo dele -- inclusive a que ainda não existe.
//
// Este teste não lê a trava e diz que está certa: ele vai BATER NA PORTA de cada bancada,
// no servidor de verdade. Código que parece certo já passou por aqui antes.
//
//   node scripts/conferir-bancadas-fechadas.mjs                              (produção publicada)
//   BASE=http://localhost:3000 node scripts/conferir-bancadas-fechadas.mjs   (depois de `next start`)
//
// Contra `npm run dev` ele FALHA de propósito: lá as bancadas TÊM que abrir.

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "https://corretor-ia-gilt.vercel.app";
const DEV = path.join(import.meta.dirname, "..", "src", "app", "dev");

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const status = async (rota) => {
  try {
    return (await fetch(`${BASE}${rota}`, { redirect: "manual" })).status;
  } catch (e) {
    return `sem resposta (${e.cause?.code ?? e.message})`;
  }
};

// As bancadas saem do DISCO, não de uma lista escrita aqui: lista escrita à mão envelhece
// calada, e aí o teste passa com a bancada nova aberta.
const bancadas = fs
  .readdirSync(DEV, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(DEV, e.name, "page.tsx")))
  .map((e) => e.name)
  .sort();

console.log(`${BASE} · ${bancadas.length} bancada(s): ${bancadas.join(", ") || "(nenhuma)"}\n`);

// CHÃO DA MEDIDA. Sem estas duas linhas, "todas deram 404" também é o que se vê com o site
// fora do ar, com o BASE errado ou com a pasta vazia -- estado de falha que satisfaz sozinho
// a condição de aprovação.
conferir(bancadas.length > 0, "achei bancada no disco pra conferir", DEV);
const raiz = await status("/");
conferir(raiz === 200, "o site responde (/ em 200)", `HTTP ${raiz}`);
if (bancadas.length === 0 || raiz !== 200) {
  console.log("\nsem chão pra medir -- parando antes de fingir que passou");
  process.exit(1);
}

console.log("\n--- no ar ---");
for (const nome of bancadas) {
  const s = await status(`/dev/${nome}`);
  conferir(s === 404, `/dev/${nome} responde 404`, `HTTP ${s}`);
}

// POR QUE O 404 ACIMA PROVA A TRAVA DO LAYOUT: nenhuma página de bancada tem trava própria.
// Se alguém copiar a linha de volta pra dentro de uma página, o 404 dela para de dizer
// qualquer coisa sobre o layout -- e a bancada seguinte, criada sem a cópia, abre. É esse
// começo de erosão que as duas conferências abaixo pegam.
console.log("\n--- de onde vem o 404 ---");
const layout = path.join(DEV, "layout.tsx");
conferir(
  fs.existsSync(layout) && /NODE_ENV === "production"/.test(fs.readFileSync(layout, "utf8")),
  "src/app/dev/layout.tsx tem a trava de NODE_ENV",
  layout
);
for (const nome of bancadas) {
  const propria = /NODE_ENV/.test(fs.readFileSync(path.join(DEV, nome, "page.tsx"), "utf8"));
  conferir(!propria, `/dev/${nome} não tem trava própria (o 404 dela é do layout)`, propria ? "achei NODE_ENV na página" : "");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo fechado");
process.exit(falhas ? 1 : 0);
