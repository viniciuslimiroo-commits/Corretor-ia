// A biblioteca de áudio e os acabamentos de texto, MEDIDOS no arquivo final.
//
// Duas coisas que só o arquivo prova:
//
// 1. O EFEITO SONORO toca na virada de cena. Mede-se o volume num recorte de 0,4s em
//    volta da emenda, contra o mesmo recorte do vídeo sem efeito. Um efeito que o ffmpeg
//    aceitou mas pôs no lugar errado (ou com volume zero) passa em qualquer teste de
//    string e falha aqui.
// 2. O ESTILO DE TEXTO desenha. "Contorno" e "sombra" não têm caixa atrás: se a receita
//    estiver errada, o texto some na foto e o vídeo sai sem ele -- sem erro nenhum.
//
//   BASE=http://localhost:3000 node scripts/testar-audio-e-texto.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-som-"));

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
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 2);
conferir(fotos.length >= 2, "duas fotos reais da conta", `${fotos.length}`);
if (fotos.length < 2) process.exit(1);

const antes = await saldo();
const DUR = 4;
const base = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: fotos[0].id, duracao: DUR, efeito: "parado", textos: [{ texto: "R$ 890.000", estilo: "contorno", posicao: "base", animacao: "nenhuma" }] },
    { tipo: "foto", jobId: fotos[1].id, duracao: DUR, efeito: "parado" },
  ],
  musica: "nenhuma",
  narracao: null,
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
  capaMontada: false,
};

async function gerar(espec, nome) {
  const r = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
  const d = await r.json();
  conferir(r.ok, `${nome}: aceito`, d.error ?? "");
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
  conferir(!!pronto, `${nome}: renderizou`);
  if (!pronto) return null;
  const arq = path.join(tmp, `${nome}.mp4`);
  fs.writeFileSync(arq, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  await fetch(`${BASE}/api/video/${d.videoId}`, { method: "DELETE", headers: cab });
  return arq;
}

/** Volume médio (dBFS) de um trecho. -91 quer dizer silêncio absoluto. */
function volume(arquivo, de, dur) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-ss", String(de), "-t", String(dur), "-i", arquivo, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", timeout: 60_000 });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr ?? "");
  return m ? Number(m[1]) : null;
}

console.log("\n--- 1. o efeito sonoro na virada ---");
const semEfeito = await gerar(base, "sem-efeito");
const comEfeito = await gerar({ ...base, efeitoSonoro: "passagem" }, "com-efeito");

if (semEfeito && comEfeito) {
  // A virada fica em DUR (corte seco, sem sobreposição).
  const naVirada = volume(comEfeito, DUR - 0.1, 0.5);
  const antesDaVirada = volume(comEfeito, 0.5, 0.5);
  const viradaSemEfeito = volume(semEfeito, DUR - 0.1, 0.5);
  console.log(`     com efeito · na virada: ${naVirada} dB · longe dela: ${antesDaVirada} dB`);
  console.log(`     sem efeito · na virada: ${viradaSemEfeito} dB`);
  conferir(naVirada !== null && naVirada > -60, "tem som na virada quando há efeito", `${naVirada} dB`);
  // `null` aqui é o resultado CERTO, não uma falha de medição: sem música, sem voz e sem
  // efeito o vídeo sai sem faixa de áudio nenhuma, e o volumedetect não tem o que medir.
  conferir(viradaSemEfeito === null || viradaSemEfeito < -60, "e silêncio na virada quando não há", viradaSemEfeito === null ? "sem faixa de áudio" : `${viradaSemEfeito} dB`);
  conferir(naVirada !== null && antesDaVirada !== null && naVirada > antesDaVirada + 15, "o som está NA VIRADA, não espalhado pelo vídeo", `${naVirada} contra ${antesDaVirada}`);
}

console.log("\n--- 2. o acabamento do texto ---");
const semTexto = await gerar({ ...base, cenas: [{ ...base.cenas[0], textos: [] }, base.cenas[1]] }, "sem-texto");

if (semEfeito && semTexto) {
  /** % de pixels quase brancos no pé do quadro: é a letra. */
  const brancos = async (arquivo, nome) => {
    const jpg = path.join(tmp, `${nome}.jpg`);
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "2", "-i", arquivo, "-frames:v", "1", "-vf", "crop=iw:ih*0.14:0:ih*0.78", jpg], { timeout: 60_000 });
    const { data } = await sharp(jpg).greyscale().raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (const p of data) if (p > 235) n++;
    return { pct: (n / data.length) * 100, jpg };
  };
  const com = await brancos(semEfeito, "pe-com-texto");
  const sem = await brancos(semTexto, "pe-sem-texto");
  console.log(`     pixels quase brancos no pé: ${sem.pct.toFixed(2)}% sem texto → ${com.pct.toFixed(2)}% com "Contorno"`);
  conferir(com.pct > sem.pct + 0.5, "o texto com contorno aparece, mesmo sem caixa atrás", `${com.pct.toFixed(2)}%`);
  fs.copyFileSync(com.jpg, path.join(SAIDA, "texto-contorno.jpg"));
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "2", "-i", semEfeito, "-frames:v", "1", "-vf", "scale=360:-2", path.join(SAIDA, "texto-contorno-cena.jpg")], { timeout: 60_000 });
  console.log("     quadro em docs/testes-reais/editor/texto-contorno-cena.jpg");
}

conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
