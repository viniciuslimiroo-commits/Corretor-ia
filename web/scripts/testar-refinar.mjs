// Refinar de ponta a ponta, com foto real e IA real: mobiliar uma sala vazia, depois pedir
// UMA mudança em cima do resultado, e conferir o que o produto promete:
//
//   1. o refino nasce do RESULTADO (origem_job_id), não da foto original;
//   2. "ver versões" devolve Original → v1 → v2, na ordem;
//   3. o mesmo clique mandado duas vezes (mesma chave) NÃO cobra duas vezes;
//   4. o imóvel da origem é herdado pelo refino.
//
//   node scripts/testar-refinar.mjs <foto-de-sala-vazia.jpg> [pasta]
//
// Gasta 2 créditos (mobiliar + refino). O terceiro pedido, repetido, tem que custar zero.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const FOTO = process.argv[2];
const SAIDA = process.argv[3] ?? path.join(RAIZ, "..", "docs", "testes-reais", "refinar");
if (!FOTO || !fs.existsSync(FOTO)) {
  console.error("Uso: node scripts/testar-refinar.mjs <foto.jpg> [pasta]");
  process.exit(1);
}

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
const sql = async (caminho) => (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${caminho}`, { headers: admin })).json();

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

async function sessaoDe(email) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  return new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
}

const email = process.env.CONTA ?? "viniciuslimiroo@gmail.com";
const token = await sessaoDe(email);
const cab = { Authorization: `Bearer ${token}` };

async function saldo() {
  const d = await (await fetch(`${BASE}/api/conta`, { headers: cab })).json();
  return d.creditos;
}
async function gerar(campos) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  const r = await fetch(`${BASE}/api/gerar`, { method: "POST", headers: cab, body: f });
  return { status: r.status, d: await r.json() };
}
async function esperar(jobId) {
  for (let i = 0; i < 80; i++) {
    await new Promise((z) => setTimeout(z, 3000));
    const j = await (await fetch(`${BASE}/api/job/${jobId}`, { headers: cab })).json();
    if (j.status === "concluido" && j.url) return j;
    if (j.status === "falhou" || j.error) throw new Error(j.error ?? "falhou");
  }
  throw new Error("demorou demais");
}
const baixar = async (url, nome) => fs.writeFileSync(path.join(SAIDA, nome), Buffer.from(await (await fetch(url)).arrayBuffer()));

fs.mkdirSync(SAIDA, { recursive: true });
fs.copyFileSync(FOTO, path.join(SAIDA, "00-original.jpg"));
console.log(`conta: ${email}\n`);

// Um imóvel real da conta, pra testar a herança.
const [imovel] = (await (await fetch(`${BASE}/api/imoveis`, { headers: cab })).json()).imoveis ?? [];

// ---- 1. mobiliar (a base) ----
console.log("--- 1. mobiliar a sala vazia ---");
const saldo0 = await saldo();
const r1 = await gerar({
  foto: new File([fs.readFileSync(FOTO)], "sala.jpg", { type: "image/jpeg" }),
  acao: "mobiliar",
  parametros: JSON.stringify({ tipo_espaco: "sala", estilo: "brasileiro", faixa: "medio", criatividade: "alta" }),
  chaveIdempotencia: `teste-base-${Date.now()}`,
  ...(imovel ? { imovelId: imovel.id } : {}),
});
conferir(r1.status === 200, "mobiliar aceito", `${r1.status} ${r1.d.error ?? ""}`);
const base = await esperar(r1.d.jobId);
await baixar(base.url, "01-mobiliada.jpg");
console.log(`     v1 pronta · job ${r1.d.jobId}`);

// ---- 2. refinar em cima do resultado ----
console.log("\n--- 2. refinar: só o sofá ---");
const chave = `teste-refino-${Date.now()}`;
const saldo1 = await saldo();
const r2 = await gerar({
  baseJobId: r1.d.jobId,
  acao: "refinar",
  parametros: JSON.stringify({ instrucao: "Troque somente o sofá por um modelo bege mais moderno e mantenha todo o resto exatamente igual." }),
  chaveIdempotencia: chave,
});
conferir(r2.status === 200, "refino aceito sem mandar foto (entrada = job)", `${r2.status} ${r2.d.error ?? ""}`);
const v2 = await esperar(r2.d.jobId);
await baixar(v2.url, "02-refinada-sofa.jpg");
const saldo2 = await saldo();
conferir(saldo1 - saldo2 === 1, "refino cobrou exatamente 1 crédito", `${saldo1} → ${saldo2}`);

const [linha] = await sql(`jobs?id=eq.${r2.d.jobId}&select=origem_job_id,property_id,tipo`);
conferir(linha?.origem_job_id === r1.d.jobId, "origem_job_id aponta pra base", String(linha?.origem_job_id));
conferir(linha?.tipo === "refinar", "tipo do job é refinar");
if (imovel) conferir(linha?.property_id === imovel.id, "o refino herdou o imóvel da base", String(linha?.property_id));

// ---- 3. mesmo clique, duas vezes ----
console.log("\n--- 3. dedo duplo: mesma chave de novo ---");
const r3 = await gerar({
  baseJobId: r1.d.jobId,
  acao: "refinar",
  parametros: JSON.stringify({ instrucao: "qualquer coisa" }),
  chaveIdempotencia: chave,
});
conferir(r3.status === 200 && r3.d.repetido === true, "servidor reconheceu a repetição", JSON.stringify(r3.d).slice(0, 80));
conferir(r3.d.jobId === r2.d.jobId, "e devolveu o MESMO job");
const saldo3 = await saldo();
conferir(saldo3 === saldo2, "sem cobrança dupla", `${saldo2} → ${saldo3}`);

// ---- 4. versões ----
console.log("\n--- 4. ver versões ---");
const vs = (await (await fetch(`${BASE}/api/job/${r2.d.jobId}/versoes`, { headers: cab })).json()).versoes ?? [];
conferir(vs.length === 3, "Original + v1 + v2", vs.map((v) => v.rotulo).join(" → "));
conferir(vs[0]?.rotulo === "Original" && vs[0].jobId === null, "a primeira é a foto original");
conferir(vs[1]?.jobId === r1.d.jobId, "a segunda é a base (mobiliar)");
conferir(vs[2]?.jobId === r2.d.jobId && vs[2].atual === true, "a terceira é o refino, marcada como atual");
conferir(typeof vs[2]?.instrucao === "string" && vs[2].instrucao.includes("sofá"), "e carrega a instrução usada");
// Pedindo versões pela BASE, o refino feito depois também aparece.
const vsBase = (await (await fetch(`${BASE}/api/job/${r1.d.jobId}/versoes`, { headers: cab })).json()).versoes ?? [];
conferir(vsBase.length === 3, "pedindo pela base, o refino posterior também aparece", String(vsBase.length));

// ---- 5. o que não pode ----
console.log("\n--- 5. origem alheia ou inexistente ---");
const r5 = await gerar({ baseJobId: "00000000-0000-0000-0000-000000000000", acao: "refinar", parametros: JSON.stringify({ instrucao: "x" }) });
conferir(r5.status === 400, "job inexistente é recusado antes de cobrar", `${r5.status}`);
const saldo5 = await saldo();
conferir(saldo5 === saldo3, "e não cobrou", `${saldo3} → ${saldo5}`);

console.log(`\ncréditos: ${saldo0} → ${saldo5} (2 gerações)`);
console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
console.log(`imagens em ${SAIDA}`);
process.exitCode = falhas ? 1 : 0;
