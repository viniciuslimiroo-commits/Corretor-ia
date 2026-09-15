// A capa montada: a imagem que aparece ANTES de alguém tocar no play.
//
// Dois vídeos iguais, um com capa montada e outro sem. O que se mede na miniatura que o
// servidor guardou:
//
//   o PÉ do quadro escurece (é a faixa) e ganha pixels brancos (é a letra)
//   o TOPO fica como estava -- a faixa não subiu por cima da foto
//   sem capa montada, nada disso acontece
//
// Medir só "mudou" não serviria: a faixa escura sozinha mudaria o pé mesmo sem uma letra
// escrita, e é a letra que faz a capa valer a pena.
//
//   BASE=http://localhost:3000 node scripts/testar-capa-montada.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-capa-"));

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
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const r0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: process.env.CONTA ?? "viniciuslimiroo@gmail.com" }) });
const d0 = await r0.json();
const hash = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hash}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

let materiais = { itens: [] };
for (let i = 0; i < 5 && !(materiais.itens ?? []).length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json().catch(() => ({ itens: [] }));
}
const foto = (materiais.itens ?? []).find((i) => i.categoria !== "video");
conferir(!!foto, "uma foto real da conta", foto?.id ?? "");
if (!foto) process.exit(1);

const antes = await saldo();
const base = {
  formato: "9:16",
  cenas: [{ tipo: "foto", jobId: foto.id, duracao: 3, efeito: "parado" }],
  musica: "nenhuma",
  narracao: null,
  titulo: "Apartamento no Campo Belo",
  preco: "R$ 890.000",
  local: "Campo Belo · São Paulo",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
};

/** Gera e devolve a MINIATURA que o servidor guardou (é ela a capa, não o vídeo). */
async function capaDe(espec, nome) {
  const r = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
  const d = await r.json();
  conferir(r.ok, `${nome}: vídeo aceito`, d.error ?? "");
  if (!r.ok) return null;
  let pronto = null;
  for (let i = 0; i < 90 && !pronto; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/video/${d.videoId}`, { headers: cab })).json();
    if (j.status === "concluido" && j.url) pronto = j;
    else if (j.status === "falhou") {
      conferir(false, `${nome}: falhou`, j.error);
      break;
    }
  }
  conferir(!!pronto, `${nome}: ficou pronto`);
  if (!pronto) return null;
  conferir(!!pronto.miniatura, `${nome}: o servidor guardou uma capa`);
  const bytes = pronto.miniatura ? Buffer.from(await (await fetch(pronto.miniatura)).arrayBuffer()) : null;
  await fetch(`${BASE}/api/video/${d.videoId}`, { method: "DELETE", headers: cab });
  return bytes;
}

/** Brilho médio e % de pixels quase brancos numa faixa horizontal (fração da altura). */
async function faixa(bytes, de, ate) {
  const m = await sharp(bytes).metadata();
  const top = Math.round(de * m.height);
  const { data } = await sharp(bytes)
    .extract({ left: 0, top, width: m.width, height: Math.max(1, Math.round((ate - de) * m.height)) })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let soma = 0;
  let brancos = 0;
  for (const p of data) {
    soma += p;
    if (p > 225) brancos++;
  }
  return { brilho: soma / data.length, brancos: (brancos / data.length) * 100 };
}

console.log("\n--- com capa montada ---");
const comCapa = await capaDe({ ...base, capaMontada: true }, "com capa");
console.log("\n--- sem capa montada ---");
const semCapa = await capaDe({ ...base, capaMontada: false }, "sem capa");

if (comCapa && semCapa) {
  fs.writeFileSync(path.join(SAIDA, "capa-montada.jpg"), comCapa);
  fs.writeFileSync(path.join(SAIDA, "capa-crua.jpg"), semCapa);

  const peCom = await faixa(comCapa, 0.7, 0.95);
  const peSem = await faixa(semCapa, 0.7, 0.95);
  const topoCom = await faixa(comCapa, 0.08, 0.3);
  const topoSem = await faixa(semCapa, 0.08, 0.3);

  console.log("\n            brilho   brancos");
  console.log(`     pé com   ${peCom.brilho.toFixed(1).padStart(6)}  ${peCom.brancos.toFixed(2).padStart(6)}%`);
  console.log(`     pé sem   ${peSem.brilho.toFixed(1).padStart(6)}  ${peSem.brancos.toFixed(2).padStart(6)}%`);
  console.log(`     topo com ${topoCom.brilho.toFixed(1).padStart(6)}`);
  console.log(`     topo sem ${topoSem.brilho.toFixed(1).padStart(6)}\n`);

  conferir(peCom.brilho < peSem.brilho - 20, "a faixa escurece o pé da capa", `${peSem.brilho.toFixed(1)} → ${peCom.brilho.toFixed(1)}`);
  conferir(peCom.brancos > peSem.brancos + 0.5, "e tem LETRA escrita nela, não só a faixa", `${peSem.brancos.toFixed(2)}% → ${peCom.brancos.toFixed(2)}%`);
  // A capa sai da FOTO e o quadro cru sai do VÍDEO (com o carimbo de título no alto),
  // então o topo das duas é diferente de propósito: o que se confere é que a capa NÃO
  // repete o título -- o alto dela tem que ser foto, não faixa escura.
  conferir(topoCom.brilho > 120, "o alto da capa é foto, não uma segunda faixa de título", topoCom.brilho.toFixed(1));
  console.log("     imagens em docs/testes-reais/editor/capa-montada.jpg e capa-crua.jpg");
}

// Sem nada escrito, a capa montada não faz sentido e não deve entrar: uma faixa preta
// cobrindo um terço da foto pra não dizer nada é pior que o quadro cru.
console.log("\n--- sem título nem preço ---");
const semTexto = await capaDe({ ...base, titulo: "", preco: "", local: "", capaMontada: true }, "sem texto");
if (semTexto && semCapa) {
  const pe = await faixa(semTexto, 0.7, 0.95);
  const peSem = await faixa(semCapa, 0.7, 0.95);
  console.log(`     pé sem texto: ${pe.brilho.toFixed(1)} · pé do quadro cru: ${peSem.brilho.toFixed(1)}`);
  conferir(Math.abs(pe.brilho - peSem.brilho) < 8, "sem o que escrever, a capa sai crua mesmo", `${pe.brilho.toFixed(1)} vs ${peSem.brilho.toFixed(1)}`);
}

conferir(antes === (await saldo()), "capa montada não gasta crédito", `${antes}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
