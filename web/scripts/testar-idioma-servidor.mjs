// O idioma além da tela: o que o SERVIDOR escreve e imprime.
//
// Traduzir os botões é a parte fácil. O que torna o produto errado em espanhol é o que
// sai do servidor: o aviso legal impresso no material, o selo queimado na imagem e o
// texto que a IA escreve. Tudo isso vai pro CLIENTE do corretor -- um aviso de imagem
// editada em português dentro de um book em espanhol não avisa ninguém.
//
// O que se mede aqui:
//
//   1. o aviso impresso no material sai nos três idiomas, lido do layout que o servidor
//      devolve (é o mesmo que o PDF e o JPG desenham);
//   2. o cookie vence o Accept-Language;
//   3. o texto que a IA escreve num pedido em espanhol não volta em português.
//
//   BASE=http://localhost:3000 node scripts/testar-idioma-servidor.mjs

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";

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

/** Cabeçalhos como o navegador manda: o cookie do idioma e o Accept-Language. */
const comIdioma = (idioma, aceita = "pt-BR,pt;q=0.9") => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Cookie: idioma ? `idioma=${idioma}` : "",
  "Accept-Language": aceita,
});

const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: comIdioma("pt") })).json()).creditos;

let materiais = { itens: [] };
for (let i = 0; i < 5 && !(materiais.itens ?? []).length; i++) {
  if (i) await new Promise((z) => setTimeout(z, 2000));
  materiais = await (await fetch(`${BASE}/api/materiais`, { headers: comIdioma("pt") })).json().catch(() => ({ itens: [] }));
}
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 3);
conferir(fotos.length >= 1, "fotos reais na conta", `${fotos.length}`);
if (!fotos.length) process.exit(1);

const antes = await saldo();

const cri = await fetch(`${BASE}/api/imoveis`, { method: "POST", headers: comIdioma("pt"), body: JSON.stringify({ titulo: "TESTE idioma · Apto 74", endereco: "Setor Bueno · Goiânia" }) });
const imovel = (await cri.json()).imovel;
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "PATCH", headers: comIdioma("pt"), body: JSON.stringify({ negocio: "venda", preco: "R$ 690.000", dormitorios: 3, suites: 1, vagas: 2, area_util: 120 }) });
for (const f of fotos) await fetch(`${BASE}/api/job/${f.id}`, { method: "PATCH", headers: comIdioma("pt"), body: JSON.stringify({ imovelId: imovel.id }) });

const rM = await fetch(`${BASE}/api/books`, { method: "POST", headers: comIdioma("pt"), body: JSON.stringify({ tipo: "book", imovelId: imovel.id }) });
const dM = await rM.json();
conferir(rM.ok && !!dM.book?.id, "material criado", dM.error ?? "");
if (!dM.book?.id) process.exit(1);
const bookId = dM.book.id;

// ---- 1. o aviso impresso, nos três ----
console.log("\n--- 1. o aviso impresso no material ---");
const ESPERADO = {
  pt: /Imagens ilustrativas · algumas editadas digitalmente/,
  es: /Imágenes ilustrativas · algunas editadas digitalmente/,
  en: /Illustrative images · some digitally edited/,
};

for (const idioma of ["pt", "es", "en"]) {
  const carga = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: comIdioma(idioma) })).json();
  const linhas = (carga.layout ?? []).flatMap((p) => (p.caixas ?? []).filter((c) => c.tipo === "texto").flatMap((c) => c.linhas));
  const achou = linhas.find((l) => /ilustrativ|Illustrative/i.test(l));
  conferir(!!achou && ESPERADO[idioma].test(achou), `${idioma}: o aviso sai no idioma certo`, achou ?? "nenhum aviso na página");
}

// ---- 2. o cookie vence o navegador ----
console.log("\n--- 2. cookie contra Accept-Language ---");
const comCookieEs = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: comIdioma("es", "en-US,en;q=0.9") })).json();
const linhasEs = (comCookieEs.layout ?? []).flatMap((p) => (p.caixas ?? []).filter((c) => c.tipo === "texto").flatMap((c) => c.linhas));
conferir(linhasEs.some((l) => ESPERADO.es.test(l)), "com cookie 'es' e navegador em inglês, vale o cookie");

const semCookieEn = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": "en-US,en;q=0.9" } })).json();
const linhasEn = (semCookieEn.layout ?? []).flatMap((p) => (p.caixas ?? []).filter((c) => c.tipo === "texto").flatMap((c) => c.linhas));
conferir(linhasEn.some((l) => ESPERADO.en.test(l)), "sem cookie, vale o navegador");

// ---- 3. o que a IA escreve ----
console.log("\n--- 3. o texto que a IA escreve ---");
const carga = await (await fetch(`${BASE}/api/books/${bookId}`, { headers: comIdioma("es") })).json();
const capa = carga.documento.paginas.find((p) => p.tipo === "capa");
const rIA = await fetch(`${BASE}/api/books/${bookId}/textos`, {
  method: "POST",
  headers: comIdioma("es"),
  body: JSON.stringify({ paginaId: capa.id, campo: "descricao" }),
});
const dIA = await rIA.json();
conferir(rIA.ok, "a IA respondeu", dIA.error ?? "");
if (rIA.ok) {
  const texto = String(dIA.texto ?? "");
  console.log(`     escreveu: ${texto.slice(0, 120)}`);
  // Português tem ã, õ e ç; espanhol não tem nenhum dos três. É um sinal grosso, mas é
  // exatamente o sinal que aparece quando a instrução de idioma não chega no prompt.
  const pareceportugues = /[ãõç]/i.test(texto) || /\b(não|você|são|então|imóvel|quartos)\b/i.test(texto);
  conferir(texto.length > 20, "e escreveu alguma coisa", `${texto.length} caracteres`);
  conferir(!pareceportugues, "o pedido em espanhol não voltou em português");
}

// ---- 4. o vocabulário da ficha dentro do material ----
// Estas palavras não são interface: entram impressas na peça que vai pro cliente.
console.log("\n--- 4. o vocabulário da ficha ---");
const VOCABULARIO = { pt: /\bquartos?\b|\bvagas?\b/i, es: /\bdormitorios?\b|\bcocheras?\b/i, en: /\bbedrooms?\b|\bgarages?\b/i };
const NAO_PODE = { pt: /\bbedrooms?\b|\bcocheras?\b/i, es: /\bquartos?\b|\bbedrooms?\b/i, en: /\bquartos?\b|\bdormitorios?\b/i };
for (const idioma of ["pt", "es", "en"]) {
  const r = await fetch(`${BASE}/api/books`, { method: "POST", headers: comIdioma(idioma), body: JSON.stringify({ tipo: "book", imovelId: imovel.id }) });
  const d = await r.json();
  if (!r.ok) {
    conferir(false, `${idioma}: material criado`, d.error ?? "");
    continue;
  }
  const carga2 = await (await fetch(`${BASE}/api/books/${d.book.id}`, { headers: comIdioma(idioma) })).json();
  const tudo = (carga2.layout ?? []).flatMap((pg) => (pg.caixas ?? []).filter((c) => c.tipo === "texto").flatMap((c) => c.linhas)).join(" | ");
  const achou = VOCABULARIO[idioma].test(tudo);
  const errado = NAO_PODE[idioma].test(tudo);
  conferir(achou, `${idioma}: a ficha usa as palavras do idioma`, (tudo.match(VOCABULARIO[idioma]) ?? ["nenhuma"])[0]);
  conferir(!errado, `${idioma}: e nenhuma palavra de outro idioma`, errado ? (tudo.match(NAO_PODE[idioma]) ?? [""])[0] : "");
  await fetch(`${BASE}/api/books/${d.book.id}`, { method: "DELETE", headers: comIdioma("pt") });
}

await fetch(`${BASE}/api/books/${bookId}`, { method: "DELETE", headers: comIdioma("pt") });
await fetch(`${BASE}/api/imoveis/${imovel.id}`, { method: "DELETE", headers: comIdioma("pt") });
conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
