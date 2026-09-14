// Enviar foto pronta: entra no acervo, não debita crédito, não leva o aviso de
// "editadas digitalmente" e serve de capa de book como qualquer outra.
//
//   node scripts/testar-envio-foto.mjs <caminho-da-foto> [mais fotos...]
//
// Precisa de um `tok.json` ao lado com a sessão de teste ({access_token}).

import fs from "node:fs";
import path from "node:path";

const SCR = import.meta.dirname;
const BASE = process.env.BASE ?? "http://localhost:3000";
const tok = JSON.parse(fs.readFileSync(path.join(SCR, "tok.json"), "utf8"));
const cab = { Authorization: `Bearer ${tok.access_token}` };
const json = { ...cab, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (o, r, extra = "") => {
  console.log(`${o ? "ok   " : "FALHA"} ${r}${extra ? " · " + extra : ""}`);
  if (!o) falhas += 1;
};

async function pedir(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { headers: json, ...opcoes });
  const t = await r.text();
  let d = {};
  try { if (t) d = JSON.parse(t); } catch { d = { error: t.slice(0, 200) }; }
  return { status: r.status, d };
}

const fotos = process.argv.slice(2).filter((f) => fs.existsSync(f));
if (fotos.length === 0) {
  console.log("Passe ao menos uma foto existente. Ex.: node scripts/testar-envio-foto.mjs fachada.jpg");
  process.exit(1);
}

// --- estado antes
const conta = (await pedir("/api/conta")).d;
const creditosAntes = conta?.creditos ?? conta?.conta?.creditos ?? null;
const antes = (await pedir("/api/materiais")).d.itens?.length ?? 0;
console.log(`antes: ${antes} materiais, ${creditosAntes ?? "?"} créditos\n`);

// --- envia
const form = new FormData();
for (const f of fotos) form.append("fotos", new Blob([fs.readFileSync(f)], { type: "image/jpeg" }), path.basename(f));
const r = await fetch(`${BASE}/api/materiais/enviar`, { method: "POST", headers: cab, body: form });
const env = await r.json();
conferir(r.status === 200, "POST /api/materiais/enviar", `${r.status} ${env.error ?? ""}`);
conferir((env.entraram ?? []).length === fotos.length, "todas entraram", `${(env.entraram ?? []).length} de ${fotos.length}`);
const ids = (env.entraram ?? []).map((e) => e.id);
conferir((env.entraram ?? []).every((e) => e.miniatura), "cada uma veio com miniatura");

// --- não cobrou
const depoisConta = (await pedir("/api/conta")).d;
const creditosDepois = depoisConta?.creditos ?? depoisConta?.conta?.creditos ?? null;
conferir(creditosAntes === null || creditosAntes === creditosDepois, "NÃO gastou crédito", `${creditosAntes} → ${creditosDepois}`);

// --- aparece no acervo, com rótulo honesto
const mat = (await pedir("/api/materiais")).d;
conferir((mat.itens ?? []).length === antes + fotos.length, "apareceu no acervo", `${(mat.itens ?? []).length}`);
const novo = (mat.itens ?? []).find((i) => i.id === ids[0]);
conferir(novo?.rotulo === "Foto enviada", "rótulo é 'Foto enviada'", novo?.rotulo);
conferir(novo?.categoria === "foto", "cai na categoria Fotos", novo?.categoria);

// --- serve de material, e o aviso some porque nada foi editado
const imovel = ((await pedir("/api/imoveis")).d.imoveis ?? [])[0];
const book = await pedir("/api/books", { method: "POST", body: JSON.stringify({ imovelId: imovel?.id ?? null, tipo: "book", jobIds: ids }) });
conferir(book.status === 200, "montou book só com fotos enviadas", `${book.status} ${book.d.error ?? ""}`);

if (book.status === 200) {
  const full = (await pedir(`/api/books/${book.d.book.id}`)).d;
  conferir(full.ctx?.temEditada === false, "contexto diz que NÃO há imagem editada", String(full.ctx?.temEditada));
  const rodapes = full.layout.flatMap((p) => p.caixas.filter((c) => c.tipo === "texto").flatMap((c) => c.linhas));
  const temAviso = rodapes.some((l) => l.includes("editadas digitalmente"));
  conferir(!temAviso, "o aviso de 'editadas digitalmente' NÃO aparece");

  const pdf = await fetch(`${BASE}/api/books/${book.d.book.id}/exportar`, { method: "POST", headers: json, body: JSON.stringify({ qualidade: "leve" }) });
  conferir(pdf.ok, "exporta em PDF", `${pdf.status}`);
  await pedir(`/api/books/${book.d.book.id}`, { method: "DELETE" });
}

// --- e some quando apagado
const apagar = await pedir("/api/materiais/apagar", { method: "POST", body: JSON.stringify({ ids, forcar: true }) });
conferir(apagar.status === 200 && apagar.d.apagados === ids.length, "apaga como qualquer material", `${apagar.d.apagados}`);
const fim = (await pedir("/api/materiais")).d.itens?.length ?? 0;
conferir(fim === antes, "acervo voltou ao tamanho original", `${fim} de ${antes}`);

console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exit(falhas ? 1 : 0);
