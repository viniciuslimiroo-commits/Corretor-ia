// A camada livre do editor de materiais: elemento posto onde a pessoa quiser.
//
// O que se mede, e por quê:
//
// 1. O BLOCO cai exatamente onde a fração manda. Um retângulo na cor da marca em x=0.55,
//    y=0.30 tem que aparecer no quadrante certo da imagem exportada e NÃO nos outros.
//    É a conversão fração -> ponto, que é onde esse tipo de coisa erra.
// 2. O mesmo elemento sobrevive à MUDANÇA DE FORMATO. É a razão de as coordenadas serem
//    fração e não ponto: um post que vira Story leva os elementos junto, na proporção.
// 3. Ida e volta pelo servidor sem perder campo -- o saneamento deste arquivo já engoliu
//    conteúdo em silêncio três vezes (legenda2, imagens da grade, chaves com dígito).
// 4. Pôr elemento NÃO marca a página como mexida à mão: é camada separada, e Refazer
//    continua reescrevendo o texto de baixo.
// 5. O PDF exporta sem quebrar -- é o terceiro desenhista, e o único que estoura.
//
//   BASE=http://localhost:3000 node scripts/testar-camada-livre.mjs

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "sociais");
fs.mkdirSync(SAIDA, { recursive: true });

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
const h = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${h}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

const cri = await fetch(`${BASE}/api/imoveis`, { method: "POST", headers: json, body: JSON.stringify({ titulo: "TESTE camada · Apto 74", endereco: "Setor Bueno · Goiânia" }) });
const imovel = (await cri.json()).imovel;
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ negocio: "venda", preco: "R$ 690.000", dormitorios: 3, area_util: 120 }) });

let materiais = { itens: [] };
for (let i = 0; i < 5 && !(materiais.itens ?? []).length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json().catch(() => ({ itens: [] }));
}
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 4);
conferir(fotos.length >= 1, "fotos reais na conta", `${fotos.length}`);
for (const f of fotos) await fetch(`${BASE}/api/job/${f.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ imovelId: imovel.id }) });

const antes = await saldo();

// O bloco fica na METADE DIREITA e no TERÇO DE CIMA. Escolhido assim porque os quatro
// quadrantes ficam claramente distintos: um erro de eixo trocado ou de origem invertida
// aparece na hora.
const BLOCO = { x: 0.55, y: 0.14, l: 0.38, a: 0.13 };

const rMat = await fetch(`${BASE}/api/books`, { method: "POST", headers: json, body: JSON.stringify({ tipo: "post", imovelId: imovel.id }) });
const dMat = await rMat.json();
conferir(rMat.ok && !!dMat.book?.id, "post criado", dMat.error ?? dMat.book?.id);
if (!dMat.book?.id) process.exit(1);
const bookId = dMat.book.id;

const exportar = async () => {
  const e = await fetch(`${BASE}/api/books/${bookId}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve", pagina: 0 }) });
  if (!e.ok) throw new Error((await e.json()).error);
  return Buffer.from(await e.arrayBuffer());
};

const carga = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
const capa = carga.documento.paginas.find((p) => p.tipo === "capa");
const origemAntes = capa.origem;
const semElementos = await exportar();

const elementos = [
  { id: "e1", estilo: "bloco", texto: "", ...BLOCO },
  { id: "e2", estilo: "etiqueta", texto: "Últimas unidades", x: 0.07, y: 0.62, l: 0.44, alinhamento: "centro" },
  { id: "e3", estilo: "nota", texto: "Valores sujeitos a alteração", x: 0.07, y: 0.72, l: 0.6 },
];
const doc = { ...carga.documento, paginas: carga.documento.paginas.map((p) => (p.tipo === "capa" ? { ...p, elementos } : p)) };
const sal = await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: doc, versao: carga.book.versao }) });
conferir(sal.ok, "camada salva", sal.ok ? "" : (await sal.json()).error);

const relido = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
const capaDepois = relido.documento.paginas.find((p) => p.tipo === "capa");
const guardados = capaDepois?.elementos ?? [];
conferir(guardados.length === 3, "os três elementos voltaram do servidor", `${guardados.length}`);
const bloco = guardados.find((e) => e.estilo === "bloco");
conferir(
  bloco && Math.abs(bloco.x - BLOCO.x) < 0.002 && Math.abs(bloco.y - BLOCO.y) < 0.002 && Math.abs(bloco.l - BLOCO.l) < 0.002 && Math.abs(bloco.a - BLOCO.a) < 0.002,
  "a posição atravessou o saneamento sem se mexer",
  bloco ? `x=${bloco.x} y=${bloco.y} l=${bloco.l} a=${bloco.a}` : "sumiu"
);
const etiqueta = guardados.find((e) => e.estilo === "etiqueta");
conferir(etiqueta?.texto === "Últimas unidades", "o texto do elemento sobreviveu", etiqueta?.texto ?? "sumiu");
conferir(etiqueta?.alinhamento === "centro", "o alinhamento sobreviveu", etiqueta?.alinhamento ?? "sumiu");
conferir(capaDepois?.origem === origemAntes, "pôr elemento não marcou a capa como mexida à mão", `${capaDepois?.origem}`);

// Elemento com fração impossível é recusado, não desenhado pra fora do papel.
const absurdo = { ...relido.documento, paginas: relido.documento.paginas.map((p) => (p.tipo === "capa" ? { ...p, elementos: [{ id: "x", estilo: "bloco", texto: "", x: 5, y: -3, l: 9, a: 2 }] } : p)) };
await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: absurdo, versao: relido.book.versao }) });
const apos = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
const preso = (apos.documento.paginas.find((p) => p.tipo === "capa")?.elementos ?? [])[0];
conferir(preso && preso.x >= 0 && preso.x + preso.l <= 1.001 && preso.y >= 0 && preso.y <= 0.98, "fração impossível é presa dentro da página", preso ? `x=${preso.x} l=${preso.l} y=${preso.y}` : "sumiu");

// Devolve os três e mede a imagem.
const volta = { ...apos.documento, paginas: apos.documento.paginas.map((p) => (p.tipo === "capa" ? { ...p, elementos } : p)) };
await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: volta, versao: apos.book.versao }) });
const comElementos = await exportar();

/** % de pixels na cor da marca dentro de um retângulo dado em fração da imagem. */
async function corDaMarca(bytes, r, hex) {
  const m = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes)
    .extract({
      left: Math.round(r.x * m.width),
      top: Math.round(r.y * m.height),
      width: Math.max(1, Math.round(r.l * m.width)),
      height: Math.max(1, Math.round(r.a * m.height)),
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = parseInt(hex.replace("#", ""), 16);
  const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let perto = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.abs(data[i] - R) + Math.abs(data[i + 1] - G) + Math.abs(data[i + 2] - B) < 42) perto++;
  }
  return (perto / (data.length / info.channels)) * 100;
}

const marca = relido.documento.identidade.cor ?? "#0f2d5b";
// Um pouquinho por dentro do bloco, pra não medir a borda borrada do JPG.
const dentro = { x: BLOCO.x + 0.03, y: BLOCO.y + 0.02, l: BLOCO.l - 0.06, a: BLOCO.a - 0.04 };
const espelho = { x: 0.07, y: BLOCO.y + 0.02, l: BLOCO.l - 0.06, a: BLOCO.a - 0.04 };

const noLugar = await corDaMarca(comElementos, dentro, marca);
const antesDisso = await corDaMarca(semElementos, dentro, marca);
const doOutroLado = await corDaMarca(comElementos, espelho, marca);
console.log(`     cor da marca onde o bloco foi posto: ${antesDisso.toFixed(1)}% antes → ${noLugar.toFixed(1)}% depois`);
console.log(`     mesma faixa, do outro lado da página: ${doOutroLado.toFixed(1)}%`);
conferir(noLugar > 90, "o bloco cobre o retângulo que a fração mandou", `${noLugar.toFixed(1)}%`);
conferir(antesDisso < 5, "e ali não havia nada disso antes", `${antesDisso.toFixed(1)}%`);
conferir(doOutroLado < 20, "o lado espelhado continua sem bloco (eixo não está invertido)", `${doOutroLado.toFixed(1)}%`);

fs.writeFileSync(path.join(SAIDA, "camada-livre-post.jpg"), comElementos);

// ---- o mesmo material em Story: os elementos acompanham ----
console.log("\n--- o post virando Story ---");
const atual2 = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
const comoStory = { ...atual2.documento, formato: "story" };
const trocou = await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: comoStory, versao: atual2.book.versao }) });
conferir(trocou.ok, "formato trocado pra Story", trocou.ok ? "" : (await trocou.json()).error);
const story = await exportar();
const metaStory = await sharp(story).metadata();
conferir(metaStory.height > metaStory.width, "saiu em pé", `${metaStory.width}×${metaStory.height}`);
const noLugarStory = await corDaMarca(story, dentro, marca);
console.log(`     cor da marca na MESMA fração, agora no Story: ${noLugarStory.toFixed(1)}%`);
conferir(noLugarStory > 90, "o elemento acompanhou a mudança de formato", `${noLugarStory.toFixed(1)}%`);
fs.writeFileSync(path.join(SAIDA, "camada-livre-story.jpg"), story);

// ---- o PDF, que é o terceiro desenhista ----
console.log("\n--- o mesmo em PDF ---");
const atual3 = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: { ...atual3.documento, tipo: "whatsapp", formato: "a4_retrato" }, versao: atual3.book.versao }) });
const pdf = await fetch(`${BASE}/api/books/${bookId}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve" }) });
conferir(pdf.ok, "o PDF exportou com a camada livre", pdf.ok ? "" : (await pdf.json()).error);
if (pdf.ok) {
  const bytes = Buffer.from(await pdf.arrayBuffer());
  conferir(bytes.subarray(0, 4).toString() === "%PDF", "é PDF de verdade", bytes.subarray(0, 8).toString());
  conferir(bytes.length > 20_000, "com conteúdo", `${Math.round(bytes.length / 1024)} KB`);
}

await fetch(`${BASE}/api/books/${bookId}`, { method: "DELETE", headers: cab });
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "DELETE", headers: cab });
conferir(antes === (await saldo()), "a camada livre não gasta crédito", `${antes}`);

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
