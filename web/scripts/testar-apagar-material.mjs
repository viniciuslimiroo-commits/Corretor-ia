// Apagar material: cria um job DESCARTAVEL a partir de uma copia de uma foto real,
// apaga pela rota e confere que sumiu do banco E do armazenamento -- sem encostar em
// nenhuma imagem de verdade da conta.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SCR = import.meta.dirname;
const BASE = process.env.BASE ?? "http://localhost:3000";
const tok = JSON.parse(fs.readFileSync(path.join(SCR, "tok.json"), "utf8"));
const cab = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };

const env = Object.fromEntries(
  fs.readFileSync("C:/Users/Vinicius Cardoso Lim/Desktop/Saas Ia de Corretor e imobiliária/web/.env.local", "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (o, r, extra = "") => { console.log(`${o ? "ok   " : "FALHA"} ${r}${extra ? " · " + extra : ""}`); if (!o) falhas += 1; };

async function pedir(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { headers: cab, ...opcoes });
  const t = await r.text();
  let d = {}; try { if (t) d = JSON.parse(t); } catch { d = { error: t.slice(0, 200) }; }
  return { status: r.status, d };
}

// --- de onde copiar: uma foto real da conta
const mat = await pedir("/api/materiais");
const antes = (mat.d.itens ?? []).length;
conferir(antes > 0, "conta tem materiais", `${antes} itens`);

const { data: jobsReais } = await (await fetch(`${SB}/rest/v1/jobs?select=id,user_id,tipo,output_path,property_id&status=eq.concluido&output_path=not.is.null&limit=1`, { headers: admin })).json()
  .then((j) => ({ data: j }));
const modelo = jobsReais[0];
conferir(!!modelo?.output_path, "achou uma foto real pra copiar", modelo?.output_path);

// --- copia o arquivo pra um caminho novo
const novoId = crypto.randomUUID();
const destino = `${modelo.user_id}/${novoId}.jpg`;
const copia = await fetch(`${SB}/storage/v1/object/copy`, {
  method: "POST", headers: admin,
  body: JSON.stringify({ bucketId: "resultados", sourceKey: modelo.output_path, destinationKey: destino }),
});
conferir(copia.ok, "copiou o arquivo no storage", `${copia.status}`);

// --- cria a linha do job descartavel
const criar = await fetch(`${SB}/rest/v1/jobs`, {
  method: "POST", headers: { ...admin, Prefer: "return=representation" },
  body: JSON.stringify({ id: novoId, user_id: modelo.user_id, tipo: modelo.tipo, status: "concluido", creditos_cobrados: 0, output_path: destino, property_id: modelo.property_id }),
});
conferir(criar.ok, "criou o job descartável", `${criar.status}`);

const comExtra = await pedir("/api/materiais");
conferir((comExtra.d.itens ?? []).length === antes + 1, "material novo aparece na lista", `${(comExtra.d.itens ?? []).length}`);

// --- trava: usado num book recusa sem forcar
const im = (await pedir("/api/imoveis")).d.imoveis.filter((i) => i.fotos > 0);
const book = await pedir("/api/books", { method: "POST", body: JSON.stringify({ imovelId: im[0].id, tipo: "book", jobIds: [novoId] }) });
conferir(book.status === 200, "montou um book usando o material novo", `${book.status}`);

const recusa = await pedir("/api/materiais/apagar", { method: "POST", body: JSON.stringify({ ids: [novoId] }) });
conferir(recusa.status === 409 && recusa.d.emUso, "recusa apagar o que está num book", `${recusa.status}`);
console.log(`     recado: ${recusa.d.error}`);

// --- forcando, apaga
const forcado = await pedir("/api/materiais/apagar", { method: "POST", body: JSON.stringify({ ids: [novoId], forcar: true }) });
conferir(forcado.status === 200 && forcado.d.apagados === 1, "apaga quando força", `${forcado.status} · ${forcado.d.apagados} apagado(s)`);
console.log(`     books afetados: ${(forcado.d.booksAfetados ?? []).join(", ")}`);

// --- sumiu do banco?
const { length: aindaNoBanco } = await (await fetch(`${SB}/rest/v1/jobs?select=id&id=eq.${novoId}`, { headers: admin })).json();
conferir(aindaNoBanco === 0, "linha sumiu do banco");

// --- sumiu do armazenamento?
const arquivo = await fetch(`${SB}/storage/v1/object/info/resultados/${destino}`, { headers: admin });
conferir(arquivo.status === 404 || arquivo.status === 400, "arquivo sumiu do armazenamento", `${arquivo.status}`);

// --- e o original continua lá
const original = await fetch(`${SB}/storage/v1/object/info/resultados/${modelo.output_path}`, { headers: admin });
conferir(original.ok, "a foto original NÃO foi tocada", `${original.status}`);

const depois = await pedir("/api/materiais");
conferir((depois.d.itens ?? []).length === antes, "a lista voltou ao tamanho original", `${(depois.d.itens ?? []).length} de ${antes}`);

await pedir(`/api/books/${book.d.book.id}`, { method: "DELETE" });
console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exit(falhas ? 1 : 0);
