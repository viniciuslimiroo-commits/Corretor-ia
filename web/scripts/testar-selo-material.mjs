// A etiqueta da capa do material: "À VENDA", "VENDIDO", "OPEN HOUSE".
//
// O que se mede: o mesmo material exportado DUAS vezes, sem e com etiqueta, e a diferença
// procurada onde a etiqueta deve estar -- alto à esquerda no post, alto à direita no
// Story, porque no Story o logo mora na esquerda. Comparar com o próprio material sem
// etiqueta é o que separa "a etiqueta apareceu" de "a foto já tinha algo ali".
//
//   BASE=http://localhost:3000 node scripts/testar-selo-material.mjs

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

const cri = await fetch(`${BASE}/api/imoveis`, { method: "POST", headers: json, body: JSON.stringify({ titulo: "TESTE selo · Apto 74", endereco: "Setor Bueno · Goiânia" }) });
const imovel = (await cri.json()).imovel;
await fetch(`${BASE}/api/imoveis/${imovel.id}`, {
  method: "PATCH",
  headers: json,
  body: JSON.stringify({ negocio: "venda", preco: "R$ 690.000", dormitorios: 3, suites: 1, vagas: 2, area_util: 120, descricao: "Apartamento com varanda gourmet e vista livre." }),
});

const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 6);
conferir(fotos.length >= 2, "fotos reais na conta", `${fotos.length}`);
for (const f of fotos) await fetch(`${BASE}/api/job/${f.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ imovelId: imovel.id }) });

const antes = await saldo();

/**
 * Quantos por cento do canto de cima estão na COR DA MARCA.
 *
 * Diferença genérica de cinza não servia: o recorte pega meia largura de foto que não
 * mudou, e a etiqueta virava 7,7 pontos num limiar de 8 -- um teste que passa ou falha
 * pelo tamanho do recorte não está medindo a etiqueta. A cor da marca no alto da foto é
 * uma coisa que ou está lá ou não está.
 */
async function corDaMarcaNoCanto(bytes, lado, hex) {
  const m = await sharp(bytes).metadata();
  const l = Math.round(m.width * 0.45);
  const a = Math.round(m.height * 0.13);
  const esquerda = lado === "direita" ? m.width - l : 0;
  const { data, info } = await sharp(bytes).extract({ left: esquerda, top: 0, width: l, height: a }).raw().toBuffer({ resolveWithObject: true });
  const n = parseInt(hex.replace("#", ""), 16);
  const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const canais = info.channels;
  let perto = 0;
  for (let i = 0; i < data.length; i += canais) {
    // O JPG borra a borda da etiqueta; 42 de distância aceita o borrão e recusa a foto.
    if (Math.abs(data[i] - R) + Math.abs(data[i + 1] - G) + Math.abs(data[i + 2] - B) < 42) perto++;
  }
  return (perto / (data.length / canais)) * 100;
}

for (const [tipo, lado] of [
  ["post", "esquerda"],
  ["story", "direita"],
]) {
  console.log(`\n--- ${tipo}: etiqueta à ${lado} ---`);
  const r = await fetch(`${BASE}/api/books`, { method: "POST", headers: json, body: JSON.stringify({ tipo, imovelId: imovel.id }) });
  const d = await r.json();
  conferir(r.ok && !!d.book?.id, "material criado", d.error ?? d.book?.id);
  if (!d.book?.id) continue;
  const bookId = d.book.id;

  const exportar = async () => {
    const e = await fetch(`${BASE}/api/books/${bookId}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve", pagina: 0 }) });
    if (!e.ok) throw new Error((await e.json()).error);
    return Buffer.from(await e.arrayBuffer());
  };

  const semSelo = await exportar();

  // A etiqueta entra no documento como qualquer outra edição: PATCH com a versão.
  const carga = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
  const capaAntes = carga.documento.paginas.find((p) => p.tipo === "capa");
  conferir(!!capaAntes && !capaAntes.textos.selo, "material nasce sem etiqueta");
  const origemAntes = capaAntes.origem;

  const doc = {
    ...carga.documento,
    paginas: carga.documento.paginas.map((p) => (p.tipo === "capa" ? { ...p, textos: { ...p.textos, selo: "Vendido" } } : p)),
  };
  const sal = await fetch(`${BASE}/api/books/${bookId}`, { method: "PATCH", headers: json, body: JSON.stringify({ documento: doc, versao: carga.book.versao }) });
  conferir(sal.ok, "etiqueta salva", sal.ok ? "" : (await sal.json()).error);

  const relido = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: cab })).json();
  const capa = relido.documento.paginas.find((p) => p.tipo === "capa");

  // O aviso de imagem editada tem que estar NA PÁGINA, não só nas outras. O Story é de
  // uma página só e a capa cheia saía antes do rodapé: o material inteiro ficava sem
  // aviso, e o selo que a foto carrega é cortado pelo enquadramento 9:16.
  const linhasDaCapa = (relido.layout?.[0]?.caixas ?? []).filter((x) => x.tipo === "texto").flatMap((x) => x.linhas);
  conferir(
    linhasDaCapa.some((l) => /editadas digitalmente/i.test(l)),
    "a capa avisa que as imagens foram editadas",
    linhasDaCapa.find((l) => /editadas/i.test(l)) ?? "não avisa"
  );
  conferir(capa?.textos.selo === "Vendido", "a etiqueta sobreviveu à ida e volta pelo servidor", capa?.textos.selo ?? "sumiu");
  conferir(capa?.origem === origemAntes, "pôr etiqueta não marcou a capa como mexida à mão (Refazer continua valendo)", `${capa?.origem}`);

  const comSelo = await exportar();
  const marca = relido.documento.identidade.cor ?? "#0f2d5b";
  const outro = lado === "esquerda" ? "direita" : "esquerda";
  const [semNoLado, comNoLado, comNoOutro] = await Promise.all([
    corDaMarcaNoCanto(semSelo, lado, marca),
    corDaMarcaNoCanto(comSelo, lado, marca),
    corDaMarcaNoCanto(comSelo, outro, marca),
  ]);
  console.log(`     cor da marca no canto ${lado}: ${semNoLado.toFixed(2)}% sem etiqueta → ${comNoLado.toFixed(2)}% com`);
  conferir(comNoLado > semNoLado + 1.5, `a etiqueta aparece no alto à ${lado}`, `${comNoLado.toFixed(2)}%`);
  // E o outro canto NÃO ganhou etiqueta: a foto não virou azul inteira.
  console.log(`     cor da marca no canto ${outro}: ${comNoOutro.toFixed(2)}%`);
  conferir(comNoOutro < comNoLado / 3, `nada de etiqueta no canto ${outro}`, `${comNoOutro.toFixed(2)}%`);

  fs.writeFileSync(path.join(SAIDA, `${tipo}-selo.jpg`), comSelo);
  console.log(`     imagem em docs/testes-reais/sociais/${tipo}-selo.jpg`);

  await fetch(`${BASE}/api/books/${bookId}`, { method: "DELETE", headers: cab });
}

conferir(antes === (await saldo()), "pôr etiqueta não gasta crédito", `${antes}`);
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "DELETE", headers: cab });

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
