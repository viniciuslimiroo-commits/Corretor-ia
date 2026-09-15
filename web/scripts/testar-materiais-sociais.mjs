// Post, Story e carrossel: os formatos que o corretor publica, com fotos REAIS da conta.
//
// O que se prova aqui é o que um teste de string não prova: a imagem sai no tamanho que a
// rede pede, com o texto desenhado dentro dela (e não uma foto nua), e o carrossel sai com
// uma imagem por página. As três acabam em docs/testes-reais/sociais pra conferir a olho.
//
//   BASE=http://localhost:3000 node scripts/testar-materiais-sociais.mjs

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

// Um imóvel de teste com ficha preenchida: as peças (preço, quartos) só aparecem no
// material se existirem no cadastro.
const cri = await fetch(`${BASE}/api/imoveis`, { method: "POST", headers: json, body: JSON.stringify({ titulo: "TESTE sociais · Apto 74", endereco: "Setor Bueno · Goiânia" }) });
const imovel = (await cri.json()).imovel;
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ negocio: "venda", preco: "R$ 690.000", dormitorios: 3, suites: 1, vagas: 2, area_util: 120, descricao: "Apartamento com varanda gourmet, sala integrada e vista livre, a duas quadras do parque." }) });

// As fotos reais da conta viram fotos deste imóvel, pelo caminho normal do produto.
const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 8);
conferir(fotos.length >= 5, "achei fotos reais na conta", `${fotos.length}`);
for (const f of fotos) {
  await fetch(`${BASE}/api/job/${f.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ imovelId: imovel.id }) });
}

const antes = await saldo();
const esperado = {
  post: { proporcao: 1, paginas: 1 },
  story: { proporcao: 1080 / 1920, paginas: 1 },
  carrossel: { proporcao: 1, paginas: 8 },
};

for (const tipo of ["post", "story", "carrossel"]) {
  console.log(`\n--- ${tipo} ---`);
  const r = await fetch(`${BASE}/api/books`, { method: "POST", headers: json, body: JSON.stringify({ tipo, imovelId: imovel.id }) });
  const d = await r.json();
  conferir(r.ok && !!d.book?.id, "material criado", d.error ?? d.book?.id);
  if (!d.book?.id) continue;

  const exp = await fetch(`${BASE}/api/books/${d.book.id}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve", pagina: 0 }) });
  conferir(exp.ok, "exportou", exp.ok ? "" : (await exp.json()).error);
  if (!exp.ok) continue;

  conferir(exp.headers.get("content-type") === "image/jpeg", "saiu IMAGEM, não PDF", exp.headers.get("content-type") ?? "");
  const bytes = Buffer.from(await exp.arrayBuffer());
  const arquivo = path.join(SAIDA, `${tipo}.jpg`);
  fs.writeFileSync(arquivo, bytes);

  const meta = await sharp(bytes).metadata();
  conferir(meta.width === 1080, "1080px de largura, como a rede pede", `${meta.width}×${meta.height}`);
  const prop = (meta.width ?? 1) / (meta.height ?? 1);
  conferir(Math.abs(prop - esperado[tipo].proporcao) < 0.02, "a proporção do formato", `${prop.toFixed(3)} (esperado ${esperado[tipo].proporcao.toFixed(3)})`);
  conferir(Number(exp.headers.get("X-Encena-Paginas")) === esperado[tipo].paginas, `${esperado[tipo].paginas} página(s)`, exp.headers.get("X-Encena-Paginas") ?? "");

  // Tem TEXTO desenhado? A faixa da capa é escura e o texto é branco: numa foto nua não
  // existiria essa combinação na mesma faixa.
  const alturaFaixa = Math.round((meta.height ?? 100) * 0.18);
  const { data } = await sharp(bytes)
    .extract({ left: 0, top: Math.max(0, Math.round((meta.height ?? 100) * 0.42)), width: meta.width ?? 100, height: alturaFaixa })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let claros = 0;
  let escuros = 0;
  for (const p of data) {
    if (p > 225) claros++;
    if (p < 70) escuros++;
  }
  conferir(claros / data.length > 0.004 && escuros / data.length > 0.05, "tem texto claro sobre faixa escura (não é foto nua)", `claros ${((claros / data.length) * 100).toFixed(1)}% escuros ${((escuros / data.length) * 100).toFixed(0)}%`);

  if (esperado[tipo].paginas > 1) {
    const p2 = await fetch(`${BASE}/api/books/${d.book.id}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve", pagina: 1 }) });
    const b2 = Buffer.from(await p2.arrayBuffer());
    fs.writeFileSync(path.join(SAIDA, `${tipo}-2.jpg`), b2);
    conferir(p2.ok && Buffer.compare(bytes, b2) !== 0, "a segunda imagem do carrossel é diferente da primeira");
  }

  await fetch(`${BASE}/api/books/${d.book.id}`, { method: "DELETE", headers: cab });
}

conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "DELETE", headers: cab });
console.log(`\nimagens em ${path.relative(path.join(RAIZ, ".."), SAIDA)}`);
console.log(falhas === 0 ? "TUDO PASSOU" : `${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
