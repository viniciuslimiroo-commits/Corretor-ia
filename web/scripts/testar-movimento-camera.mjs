// Subir e descer: os movimentos de câmera que faltavam, medidos no arquivo.
//
// A prova é a SIMETRIA, e ela é forte de propósito. Duas cenas da MESMA foto, uma
// subindo e outra descendo:
//
//   o primeiro quadro de "subir"  tem que ser igual ao ÚLTIMO de "descer"
//   o último quadro de "subir"    tem que ser igual ao PRIMEIRO de "descer"
//   e o começo e o fim de "subir" têm que ser BEM diferentes entre si
//
// Uma expressão de y trocada, invertida ou copiada da outra quebra pelo menos uma das
// três. Medir "mudou alguma coisa" não quebraria: zoom sozinho também muda tudo.
//
//   BASE=http://localhost:3000 node scripts/testar-movimento-camera.mjs

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-mov-"));

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

const DUR = 4;
const antes = await saldo();
const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: foto.id, duracao: DUR, efeito: "cima" },
    { tipo: "foto", jobId: foto.id, duracao: DUR, efeito: "baixo" },
  ],
  musica: "nenhuma",
  narracao: null,
  titulo: "",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
  filtro: "natural",
};

const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec }) });
const dV = await rV.json();
conferir(rV.ok, "vídeo aceito", dV.error ?? dV.videoId);
conferir(dV.custo === 0, "movimento de câmera não custa crédito", `custo ${dV.custo}`);

let pronto = null;
for (let i = 0; i < 90 && !pronto; i++) {
  await new Promise((z) => setTimeout(z, 3000));
  const j = await (await fetch(`${BASE}/api/video/${dV.videoId}`, { headers: cab })).json();
  if (j.status === "concluido" && j.url) pronto = j;
  else if (j.status === "falhou") {
    conferir(false, "o vídeo falhou", j.error);
    break;
  }
}
conferir(!!pronto, "o ffmpeg aceitou subir e descer");
if (!pronto) process.exit(1);

const arquivo = path.join(tmp, "mov.mp4");
fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));

/** Um quadro em cinza e reduzido: o que importa é PARA ONDE a imagem andou. */
async function quadro(segundo, nome) {
  const jpg = path.join(tmp, `${nome}.jpg`);
  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", jpg], { timeout: 60_000 });
  const { data } = await sharp(jpg).greyscale().resize(120, 214, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return { dados: data, jpg };
}

const distancia = (a, b) => {
  let s = 0;
  const n = Math.min(a.dados.length, b.dados.length);
  for (let i = 0; i < n; i++) s += Math.abs(a.dados[i] - b.dados[i]);
  return s / n;
};

// O movimento acaba antes do fim da cena (os últimos 25% são o pouso), então 2,9s de uma
// cena de 4s já está parado no destino.
const subirComeco = await quadro(0.1, "subir-comeco");
const subirFim = await quadro(2.9, "subir-fim");
const descerComeco = await quadro(DUR + 0.1, "descer-comeco");
const descerFim = await quadro(DUR + 2.9, "descer-fim");

// O PISO DE RUÍDO: dois quadros parados no mesmo pouso. Um número abaixo deste não
// existe, porque o JPEG e a redução já custam alguma coisa. Sem ele, qualquer limiar é
// chute -- foi por isso que a primeira versão reprovou uma simetria que estava certa.
const paradoA = await quadro(3.4, "parado-a");
const paradoB = await quadro(3.7, "parado-b");
const ruido = distancia(paradoA, paradoB);

const percorreu = distancia(subirComeco, subirFim);
const simetriaComeco = distancia(subirComeco, descerFim);
const simetriaFim = distancia(subirFim, descerComeco);
// O CONTROLE: os começos das duas cenas são pontas OPOSTAS da foto. Se este número não
// for grande, as duas cenas estão andando pro mesmo lado e a simetria não prova nada.
const pontasOpostas = distancia(subirComeco, descerComeco);

console.log(`\n     piso de ruído (dois quadros parados):        ${ruido.toFixed(1)}`);
console.log(`     o quanto "subir" andou do começo ao fim:      ${percorreu.toFixed(1)}`);
console.log(`     começo de "subir"  x  fim de "descer":        ${simetriaComeco.toFixed(1)}`);
console.log(`     fim de "subir"     x  começo de "descer":     ${simetriaFim.toFixed(1)}`);
console.log(`     começo de "subir"  x  começo de "descer":     ${pontasOpostas.toFixed(1)}  (controle: tem que ser grande)\n`);

conferir(percorreu > ruido * 3, "“Subir” de fato percorre a foto", `${percorreu.toFixed(1)} contra ruído ${ruido.toFixed(1)}`);
conferir(pontasOpostas > ruido * 3, "subir e descer começam em pontas opostas", pontasOpostas.toFixed(1));
conferir(simetriaComeco < pontasOpostas / 2, "onde “subir” começa é onde “descer” termina", `${simetriaComeco.toFixed(1)} contra ${pontasOpostas.toFixed(1)}`);
conferir(simetriaFim < pontasOpostas / 2, "onde “subir” termina é onde “descer” começa", `${simetriaFim.toFixed(1)} contra ${pontasOpostas.toFixed(1)}`);

const tira = path.join(SAIDA, "movimento-cima-baixo.jpg");
spawnSync(
  ffmpeg,
  ["-y", "-hide_banner", "-loglevel", "error", "-i", subirComeco.jpg, "-i", subirFim.jpg, "-i", descerComeco.jpg, "-i", descerFim.jpg, "-filter_complex", "[0][1][2][3]hstack=inputs=4,scale=1000:-2", tira],
  { timeout: 120_000 }
);
console.log(`     tira em docs/testes-reais/editor/movimento-cima-baixo.jpg (subir início · subir fim · descer início · descer fim)`);

await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
