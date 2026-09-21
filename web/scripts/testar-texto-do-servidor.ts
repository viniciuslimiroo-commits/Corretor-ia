// O TEXTO QUE O SERVIDOR DESENHA SOBREVIVE A UMA MÁQUINA SEM FONTE NENHUMA.
//
// 21/09/2026: ele marcou um terreno, digitou os metros de cada lado, gerou a imagem -- e as
// medidas não estavam lá. Nem a área, nem o título, nem o aviso legal. Tudo glifo vazio.
//
// A causa: `<text font-family="...">` precisa de um ARQUIVO de fonte onde o desenho
// acontece, e no servidor da Vercel não existe nenhum. O defeito é invisível na máquina de
// quem programa (o Windows tem fontes) e sobreviveu a DUAS tentativas de conserto pela
// lista de fontes -- não adianta pedir um nome melhor quando não há arquivo do outro lado.
//
// O conserto é `lib/texto-svg.ts`: a letra vira CONTORNO lido do .ttf com opentype.js, e
// nada depende de fonte instalada.
//
// Este teste RECRIA a máquina sem fonte: rasteriza num processo separado com um fontconfig
// que enxerga uma pasta VAZIA. E não mede "saiu tinta?" -- o glifo vazio também é tinta. O
// que distingue é: com letra de verdade, "18" e "35" dão imagens DIFERENTES; sem fonte, os
// dois viram a mesma fileira de quadradinhos e as imagens ficam idênticas.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-texto-do-servidor.ts

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { larguraDoTexto, textoSvg } from "../src/lib/texto-svg.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "encena-texto-"));

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- a máquina sem fonte ----
const VAZIA = path.join(TMP, "sem-fonte");
fs.mkdirSync(VAZIA, { recursive: true });
const CONF = path.join(TMP, "fonts.conf"); // o fontconfig procura ESTE nome dentro de FONTCONFIG_PATH
fs.writeFileSync(
  CONF,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig>` +
    `<dir>${VAZIA.replace(/\\/g, "/")}</dir><cachedir>${path.join(TMP, "cache").replace(/\\/g, "/")}</cachedir></fontconfig>`
);

// O rasterizador vai num ARQUIVO, e não num `-e`: aspas em quatro camadas (shell, Node,
// SVG, XML) quebram calado, e já custou tempo neste projeto.
const PINTOR = path.join(TMP, "pintar.cjs");
fs.writeFileSync(
  PINTOR,
  [
    `const fs = require("fs");`,
    `const sharp = require(${JSON.stringify(path.join(RAIZ, "node_modules", "sharp"))});`,
    `sharp(Buffer.from(fs.readFileSync(process.env.ENCENA_SVG, "utf8"))).png().toBuffer()`,
    `  .then((b) => process.stdout.write(b.toString("base64")))`,
    `  .catch((e) => { console.error("FALHOU:", e && e.message); process.exit(1); });`,
  ].join("\n")
);

/** Rasteriza o SVG num processo novo, com o fontconfig apontado pra pasta vazia. */
function pintar(svg: string): string {
  const arq = path.join(TMP, `${crypto.randomUUID()}.svg`);
  fs.writeFileSync(arq, svg, "utf8");
  const saida = execFileSync(process.execPath, [PINTOR], {
    env: { ...process.env, FONTCONFIG_FILE: CONF, FONTCONFIG_PATH: TMP, ENCENA_SVG: arq },
    maxBuffer: 40 * 1024 * 1024,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return crypto.createHash("sha256").update(saida).digest("hex").slice(0, 12);
}

const moldura = (miolo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="#ffffff"/>${miolo}</svg>`;

// ---------- 1. o controle negativo: o jeito antigo, na máquina sem fonte ----------
const velho = (t: string) => moldura(`<text x="16" y="55" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="42" fill="#000000">${t}</text>`);
const v18 = pintar(velho("18"));
const v35 = pintar(velho("35"));
conferir(v18 === v35, "`<text>` numa máquina sem fonte: 18 e 35 saem IDÊNTICOS (é o defeito que ele viu)", `${v18} = ${v35}`);
if (v18 !== v35) console.log("     (se este passo falha, o teste não recria a condição do servidor e o resto não vale)");

// ---------- 2. o conserto: contorno ----------
const novo = (t: string) => moldura(textoSvg(t, { x: 16, y: 55, corpo: 42 }));
const n18 = pintar(novo("18"));
const n35 = pintar(novo("35"));
conferir(n18 !== n35, "em contorno, na MESMA máquina sem fonte: 18 e 35 saem DIFERENTES", `${n18} ≠ ${n35}`);
conferir(n18 !== v18, "e nenhum dos dois é o quadradinho", `${n18} ≠ ${v18}`);

// ---------- 3. o contorno em si ----------
const d = textoSvg("35 m", { x: 0, y: 40, corpo: 40 });
conferir(d.startsWith("<path") && /d="M/.test(d), "o texto vira <path> com curvas de verdade", `${d.length} caracteres`);
conferir(textoSvg("", { x: 0, y: 0, corpo: 20 }) === "", "texto vazio não vira lixo no SVG");
conferir(textoSvg("   ", { x: 0, y: 0, corpo: 20 }) === "", "e só espaço também não");

// ---------- 4. a medida, que decide o tamanho das caixas ----------
const l1 = larguraDoTexto("1", 40);
const l2 = larguraDoTexto("127,5 m", 40);
conferir(l1 > 0 && l2 > l1 * 3, "a largura medida cresce com o texto (é o que dimensiona o balão)", `"1"=${l1.toFixed(1)} "127,5 m"=${l2.toFixed(1)}`);
conferir(larguraDoTexto("", 40) === 0, "texto vazio mede zero");

// ---------- 5. ninguém mais desenha texto com <text> no servidor ----------
// A varredura é o que impede a volta: rota nova que escreva `<text>` some em produção.
function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...arquivos(p));
    else if (/\.tsx?$/.test(e.name)) saida.push(p);
  }
  return saida;
}
// `planta-svg.ts` desenha pros DOIS lados e recebe o desenhista de fora: o `<text>` dele é
// o padrão da TELA, e a rota passa o contorno. Por isso está de fora da varredura.
const PERDOADOS = ["planta-svg.ts", "texto-arte.ts", "elementos.ts", "nucleo.ts", "book-pdf.ts"];
const doServidor = [...arquivos(path.join(RAIZ, "src", "app", "api")), ...arquivos(path.join(RAIZ, "src", "lib"))].filter(
  (f) => !PERDOADOS.includes(path.basename(f)) && /from "sharp"|require\("sharp"\)/.test(fs.readFileSync(f, "utf8"))
);
const comTexto = doServidor.filter((f) =>
  fs
    .readFileSync(f, "utf8")
    .split("\n")
    .some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /<text[\s>]/.test(l))
);
conferir(doServidor.length > 0, "achei os arquivos que desenham imagem no servidor", `${doServidor.length}`);
conferir(comTexto.length === 0, "nenhum deles desenha texto com <text> (que some sem fonte)", comTexto.map((f) => path.relative(RAIZ, f)).join(" · ") || "todos em contorno");

fs.rmSync(TMP, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
