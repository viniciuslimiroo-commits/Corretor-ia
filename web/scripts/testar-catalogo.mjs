// O catálogo com VÁRIOS imóveis: estrutura e layout.
//
// Roda sem banco e sem rede -- montarCatalogo e montarLayout são puros. Serve pra provar o
// que a rota sozinha não prova enquanto a conta de teste tiver um imóvel só: que N imóveis
// viram N páginas, com os mesmos campos na mesma posição em todas.
//
//   npx tsx scripts/testar-catalogo.mjs
//
// Precisa do tsx, e não do node puro: o projeto importa sem extensão ("./acoes"), que é o
// padrão do bundler do Next e o node em ESM não resolve.

import path from "node:path";
import { pathToFileURL } from "node:url";

const lib = (nome) => pathToFileURL(path.join(import.meta.dirname, "..", "src", "lib", nome)).href;
const { montarCatalogo, fichaCurta } = await import(lib("book-montagem.ts"));
const { montarLayout } = await import(lib("book-layout.ts"));
const { limparDocumento } = await import(lib("book-documento.ts"));
const { medirTexto } = await import(lib("book-metricas.ts"));

let falhas = 0;
const conferir = (o, rotulo, extra = "") => {
  console.log(`${o ? "ok   " : "FALHA"} ${rotulo}${extra ? " · " + extra : ""}`);
  if (!o) falhas += 1;
};

const imagem = (jobId, tipoEspaco) => ({ jobId, tipo: "mobiliar", tipoEspaco, criadoEm: "2026-09-01T00:00:00Z" });

const imoveis = [
  {
    imovel: { id: "a", titulo: "Apto 302 · Setor Bueno", endereco: "Rua T-55, 302 — Goiânia", preco: "R$ 545.000", area_util: 96.5, dormitorios: 3, suites: 1, vagas: 2 },
    imagens: [imagem("j1", "sala"), imagem("j2", "cozinha")],
  },
  {
    imovel: { id: "b", titulo: "Casa · Jardim Goiás", endereco: "Rua 15, 88 — Goiânia", preco: "R$ 1.200.000", area_util: 240, dormitorios: 4, suites: 2, vagas: 4 },
    imagens: [imagem("j3", "fachada")],
  },
  {
    imovel: { id: "c", titulo: "Cobertura · Marista", endereco: "Av. T-1, 900 — Goiânia", preco: "sob consulta", area_util: 310, dormitorios: 4, suites: 4, vagas: 3 },
    imagens: [imagem("j4", "varanda"), imagem("j5", "piscina")],
  },
];

const doc = montarCatalogo({ imoveis, cor: "#0F2D5B", titulo: "Limiro Imóveis" });
const tipos = doc.paginas.map((p) => p.tipo);
console.log(`páginas: ${tipos.join(" → ")}\n`);

conferir(tipos[0] === "capa", "capa primeiro");
conferir(tipos[tipos.length - 1] === "contato", "contato por último");
conferir(tipos.filter((t) => t === "imovel").length === 3, "uma página por imóvel", `${tipos.filter((t) => t === "imovel").length}`);
conferir(doc.paginas[0].textos.subtitulo === "3 imóveis", "a capa conta os imóveis", doc.paginas[0].textos.subtitulo);
conferir(doc.identidade.cor === "#0F2D5B", "cor da marca aplicada");

// Cada página traz os mesmos campos: é o que permite comparar.
const paginas = doc.paginas.filter((p) => p.tipo === "imovel");
paginas.forEach((p, i) => {
  const tem = ["titulo", "endereco", "preco", "ficha"].every((k) => typeof p.textos[k] === "string" && p.textos[k].length > 0);
  conferir(tem, `imóvel ${i + 1} com os quatro campos`, `${p.textos.titulo} · ${p.textos.ficha}`);
  conferir(p.imagens.length === 1, `imóvel ${i + 1} com uma foto`, p.imagens[0]);
});

conferir(fichaCurta(imoveis[2].imovel) === "310 m²  ·  4 dorms  ·  4 suítes  ·  3 vagas", "ficha curta no plural certo", fichaCurta(imoveis[2].imovel));
conferir(fichaCurta({ area_util: 50, dormitorios: 1, suites: 1, vagas: 1 }) === "50 m²  ·  1 dorm  ·  1 suíte  ·  1 vaga", "ficha curta no singular certo");

// O documento tem que sobreviver à sanitização da leitura -- foi lá que os tipos novos
// sumiram calados da primeira vez.
const relido = limparDocumento(JSON.parse(JSON.stringify(doc)));
conferir(relido?.paginas.length === doc.paginas.length, "documento sobrevive à releitura", `${relido?.paginas.length} de ${doc.paginas.length}`);
conferir(relido?.paginas.filter((p) => p.tipo === "imovel").length === 3, "as páginas de imóvel sobrevivem");

// E o layout precisa desenhar todas, com os campos na MESMA coordenada em cada uma.
const ctx = { marca: { nome: "Limiro Imóveis", creci: "12345-F GO", whatsapp: "62999991234", temLogo: false }, ficha: [], link: null };
const layout = montarLayout(relido, ctx, medirTexto);
conferir(layout.length === doc.paginas.length, "layout gerado pra todas", `${layout.length}`);

const yDoPreco = layout
  .filter((_, i) => relido.paginas[i].tipo === "imovel")
  .map((p) => p.caixas.filter((c) => c.tipo === "texto").map((c) => Math.round(c.y)));
const iguais = yDoPreco.every((ys) => JSON.stringify(ys) === JSON.stringify(yDoPreco[0]));
conferir(iguais, "mesmos campos na mesma altura em todas as páginas", JSON.stringify(yDoPreco[0]));

const semCaixa = layout.findIndex((p) => p.caixas.length === 0);
conferir(semCaixa === -1, "nenhuma página saiu vazia");

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
