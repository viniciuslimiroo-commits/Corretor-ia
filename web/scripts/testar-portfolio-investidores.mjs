// Portfólio e apresentação para investidores, no motor de Books.
//
// Os dois vieram do motor antigo (material-pdf). O que este teste garante é o que os
// diferencia: portfólio é grade de TRABALHO, sem preço; investidores abre com os NÚMEROS
// da ficha, deitado. Puro, sem banco e sem rede.
//
//   npx tsx scripts/testar-portfolio-investidores.mjs

import path from "node:path";
import { pathToFileURL } from "node:url";
const lib = (n) => pathToFileURL(path.join(import.meta.dirname, "..", "src", "lib", n)).href;
const { montarPortfolio, montar } = await import(lib("book-montagem.ts"));
const { montarLayout } = await import(lib("book-layout.ts"));
const { limparDocumento } = await import(lib("book-documento.ts"));
const { medirTexto } = await import(lib("book-metricas.ts"));
let f = 0; const ok = (c, r, e = "") => { console.log(`${c ? "ok   " : "FALHA"} ${r}${e ? " · " + e : ""}`); if (!c) f++; };
const img = (id, esp) => ({ jobId: id, tipo: "mobiliar", tipoEspaco: esp, criadoEm: "2026-09-01T00:00:00Z" });
const imoveis = [
  { imovel: { id: "a", titulo: "Apto 302 · Setor Bueno" }, imagens: [img("j1","sala"), img("j2","cozinha"), img("j3","quarto")] },
  { imovel: { id: "b", titulo: "Casa · Jardim Goiás" }, imagens: [img("j4","fachada"), img("j5","piscina")] },
  { imovel: { id: "c", titulo: "Cobertura · Marista" }, imagens: [img("j6","varanda"), img("j7","sala"), img("j8","quarto")] },
];
const port = limparDocumento(JSON.parse(JSON.stringify(montarPortfolio({ imoveis, cor: "#0F2D5B", titulo: "Portfólio · Limiro" }))));
const tipos = port.paginas.map((p) => p.tipo);
console.log("portfólio:", tipos.join(" → "));
ok(tipos[0] === "capa" && tipos.at(-1) === "contato", "capa e contato nas pontas");
ok(tipos.filter((t) => t === "grade").length >= 1, "tem grade", String(tipos.filter((t) => t === "grade").length));
const g = port.paginas.find((p) => p.tipo === "grade");
ok(g.imagens.length <= 6 && g.imagens.length > 0, "até 6 por grade", String(g.imagens.length));
ok(!!g.textos.legenda1 && !!g.textos.legenda6 === (g.imagens.length === 6), "nome do imóvel embaixo de cada foto", g.textos.legenda1);
ok(!port.paginas.some((p) => p.textos.preco), "portfólio NÃO traz preço");

const inv = limparDocumento(JSON.parse(JSON.stringify(montar({ tipo: "investidores", imovel: { id: "a", titulo: "Apto 302", endereco: "Rua T-55", preco: "R$ 545.000", area_util: 96.5, dormitorios: 3, vagas: 2, ano_construcao: 2014, condominio: "R$ 780", descricao: "Reformado." }, imagens: [img("j1","sala"), img("j2","varanda")], cor: "#0F2D5B" }))));
const ti = inv.paginas.map((p) => p.tipo);
console.log("investidores:", ti.join(" → "));
ok(ti.includes("numeros"), "tem página de números");
const n = inv.paginas.find((p) => p.tipo === "numeros");
const cartoes = (n.textos.corpo || "").split("\n").filter(Boolean);
ok(cartoes.length >= 4, "números saíram da ficha", cartoes.join(" | "));
ok(cartoes.every((l) => /^[^:]+:\s*.+$/.test(l)), "todos no formato Rótulo: valor");
ok(inv.formato === "widescreen", "deitado", inv.formato);

const ctx = { marca: { nome: "Limiro", creci: "12345", whatsapp: "62999", temLogo: false }, ficha: [], link: null };
for (const [nome, d] of [["portfólio", port], ["investidores", inv]]) {
  const lay = montarLayout(d, ctx, medirTexto);
  ok(lay.length === d.paginas.length && lay.every((p) => p.caixas.length > 0), `layout de ${nome} desenha todas`, String(lay.length));
}
console.log(f ? `\n${f} falha(s)` : "\ntudo certo");
process.exit(f ? 1 : 0);
