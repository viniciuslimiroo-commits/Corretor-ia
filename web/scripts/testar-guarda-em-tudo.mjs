// O guarda de fatos vale em TODOS os caminhos em que a IA escreve, não só na criação
// automática. Era o furo: o botão "Escrever com IA" campo a campo passava direto.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCR = import.meta.dirname;
const BASE = process.env.BASE ?? "http://localhost:3000";
const tok = JSON.parse(fs.readFileSync(path.join(SCR, "tok.json"), "utf8"));
const cab = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (o, r, e = "") => { console.log(`${o ? "ok   " : "FALHA"} ${r}${e ? " · " + e : ""}`); if (!o) falhas++; };

async function pedir(c, o = {}) {
  const r = await fetch(`${BASE}${c}`, { headers: cab, ...o });
  const t = await r.text();
  let d = {}; try { if (t) d = JSON.parse(t); } catch { d = { error: t.slice(0, 200) }; }
  return { status: r.status, d };
}

const { conferirFatos } = await import(pathToFileURL(path.join(import.meta.dirname, "..", "src", "lib", "book-fatos.ts")).href);

const imovel = ((await pedir("/api/imoveis")).d.imoveis ?? []).find((i) => i.fotos > 0);
const cru = (await pedir(`/api/imoveis/${imovel.id}`)).d.imovel;
const ficha = { ...cru, ...(cru.ficha ?? {}) };

const book = await pedir("/api/books", { method: "POST", body: JSON.stringify({ imovelId: imovel.id, tipo: "book", auto: true }) });
conferir(book.status === 200, "book de teste criado");
const doc = (await pedir(`/api/books/${book.d.book.id}`)).d.documento;

// --- cada campo que tem botão "Escrever com IA"
const alvos = [
  [doc.paginas.find((p) => p.tipo === "capa"), "descricao"],
  [doc.paginas.find((p) => p.tipo === "capa"), "titulo"],
  [doc.paginas.find((p) => p.tipo === "foto"), "legenda"],
  [doc.paginas.find((p) => p.tipo === "contato"), "chamada"],
].filter(([p]) => p);

console.log("\n--- texto campo a campo, agora com guarda ---");
for (const [p, campo] of alvos) {
  const r = await pedir(`/api/books/${book.d.book.id}/textos`, { method: "POST", body: JSON.stringify({ paginaId: p.id, campo }) });
  if (r.status === 422) {
    conferir(true, `${p.tipo}.${campo}: guarda RECUSOU em vez de escrever errado`, r.d.error?.slice(0, 70));
    continue;
  }
  const ok = r.status === 200 && typeof r.d.texto === "string";
  conferir(ok, `${p.tipo}.${campo} respondeu`, `${r.status}`);
  if (!ok) continue;
  const v = conferirFatos(r.d.texto, ficha);
  conferir(v.length === 0, `${p.tipo}.${campo} passa no guarda`, JSON.stringify(r.d.texto).slice(0, 80) + (v.length ? " !! " + v.map((x) => x.trecho).join(", ") : ""));
}

await pedir(`/api/books/${book.d.book.id}`, { method: "DELETE" });

// --- roteiro do vídeo
console.log("\n--- roteiro do vídeo ---");
const rot = await pedir("/api/video/roteiro", {
  method: "POST",
  body: JSON.stringify({ titulo: "Apto 302", preco: "R$ 545.000", local: "Setor Bueno", observacoes: "Reformado, sol da manhã.", legendas: ["Sala", "Cozinha"] }),
});
if (rot.status === 422) {
  conferir(true, "guarda recusou narração inventada", rot.d.error?.slice(0, 70));
} else {
  conferir(rot.status === 200 && !!rot.d.roteiro, "roteiro escrito", `${rot.status}`);
  if (rot.d.roteiro) {
    const v = conferirFatos(rot.d.roteiro, { id: null, titulo: "Apto 302", endereco: "Setor Bueno", preco: "R$ 545.000", descricao: "Reformado, sol da manhã. Sala Cozinha" });
    conferir(v.length === 0, "narração passa no guarda", JSON.stringify(rot.d.roteiro).slice(0, 100) + (v.length ? " !! " + v.map((x) => x.trecho).join(", ") : ""));
  }
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exit(falhas ? 1 : 0);
