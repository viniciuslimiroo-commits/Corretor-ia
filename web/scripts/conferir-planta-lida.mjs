// MANDAR UMA PLANTA PRONTA: o caminho inteiro, no navegador, com planta de verdade.
//
// 21/09/2026. Ele pediu as duas opções -- desenhar OU mandar o arquivo. Isto confere a
// segunda de ponta a ponta: o link existe, o arquivo sobe, a leitura volta, os cômodos
// aparecem no editor com nome e medida, e o aviso diz de onde vieram as medidas.
//
// Gasta uma chamada de visão (centavos do saldo fal) e NÃO gasta crédito -- ler é de graça,
// como desenhar. Apaga o job que criou.
//
//   BASE=http://localhost:3000 PLANTA=caminho/da/planta.jpg node scripts/conferir-planta-lida.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = process.env.BASE ?? "http://localhost:3000";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const PLANTA = process.env.PLANTA ?? path.join(RAIZ, "..", "docs", "fotos-origem", "plantas", "planta.jpg");
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-lida-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

if (!fs.existsSync(PLANTA)) {
  console.log(`não achei a planta em ${PLANTA}. Passe PLANTA=caminho/da/imagem.jpg`);
  process.exit(1);
}
const r0 = await fetch(`${BASE}/login`).catch(() => null);
if (!r0 || !r0.ok) {
  console.log(`o servidor ${BASE} não respondeu; nada foi feito`);
  process.exit(1);
}

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${p.get("access_token")}` } }).then((x) => x.json());
const sessao = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const antes = await fetch(`${SUPA}/rest/v1/jobs?select=id&user_id=eq.${user.id}&tipo=eq.planta_lida`, { headers: admin }).then((r) => r.json());

const c = await abrirChrome();
const foto = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};

await c.abrir(`${BASE}/login`, { largura: 1280, altura: 1000 });
await c.avaliar(`localStorage.setItem('sb-${REF}-auth-token', ${JSON.stringify(JSON.stringify(sessao))})`);
await c.abrir(`${BASE}/planta`, { largura: 1280, altura: 1000, pronto: "!!document.querySelector('[data-caixa]')" });
await esperar(2500);

const temLink = await c.avaliar(`/Mandar uma planta pronta/i.test(document.body.innerText)`);
conferir(!!temLink, "o link “Mandar uma planta pronta” está na tela");
conferir(!!(await c.avaliar(`/beta/i.test(document.body.innerText)`)), "e está marcado como beta");

// Sobe o arquivo pelo campo escondido do link.
const { root } = await c.cdp("DOM.getDocument", { depth: -1 });
const { nodeId } = await c.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file][accept*=image]" });
conferir(!!nodeId, "o campo de arquivo existe");
if (!nodeId) process.exit(1);
await c.cdp("DOM.setFileInputFiles", { nodeId, files: [path.resolve(PLANTA)] });

const t0 = Date.now();
for (let i = 0; i < 60 && !(await c.avaliar(`/Rascunho lido da sua planta/i.test(document.body.innerText)`)); i++) {
  if (await c.avaliar(`/Não consegui|não parece|Falta rodar/i.test(document.body.innerText)`)) break;
  await esperar(1000);
}
await esperar(800);
await foto("planta-lida");

const estado = await c.avaliar(`(() => {
  const t = document.body.innerText;
  const m = t.match(/(\\d+)\\s+c[oô]modos?\\s+·\\s+([\\d.,]+)/i);
  return {
    avisou: /Rascunho lido da sua planta/i.test(t),
    dizDeOndeVeio: /cota|layout|medidas lidas|aproximad/i.test(t),
    dizQueRecalcula: /recalculada do desenho/i.test(t),
    comodos: m ? Number(m[1]) : 0,
    area: m ? m[2] : null,
    erro: (t.match(/Não consegui[^\\n]{0,80}/i) || [])[0] ?? null,
  };
})()`);

conferir(estado.avisou, "o aviso do rascunho apareceu", `${((Date.now() - t0) / 1000).toFixed(1)}s`);
conferir(estado.comodos >= 4, "os cômodos entraram no editor", `${estado.comodos} cômodos · ${estado.area ?? "?"} m²`);
conferir(estado.dizDeOndeVeio, "o aviso diz de onde vieram as medidas");
conferir(estado.dizQueRecalcula, "e avisa que a área é recalculada do desenho");
if (estado.erro) console.log(`     (mensagem na tela: ${estado.erro})`);

// O "Voltar" desfaz a importação inteira, numa vez só.
const voltar = await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].find((e) => /^Voltar$/i.test((e.textContent||'').trim())); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
if (voltar) {
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: voltar.x, y: voltar.y, button: "left", buttons: 1, clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: voltar.x, y: voltar.y, button: "left", clickCount: 1 });
  await esperar(900);
  const depois = await c.avaliar(`(document.body.innerText.match(/(\\d+)\\s+c[oô]modos?/i) || [0, 0])[1] * 1`);
  conferir(depois === 0, "“Voltar” desfaz a importação inteira de uma vez", `${estado.comodos} -> ${depois}`);
}

// ---- limpeza: apaga o job que este teste criou ----
const depoisJobs = await fetch(`${SUPA}/rest/v1/jobs?select=id&user_id=eq.${user.id}&tipo=eq.planta_lida`, { headers: admin }).then((r) => r.json());
const novos = depoisJobs.filter((j) => !antes.some((a) => a.id === j.id));
for (const j of novos) {
  await fetch(`${SUPA}/storage/v1/object/resultados`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: [`entradas/${user.id}/${j.id}-foto.jpg`] }) }).catch(() => {});
  await fetch(`${SUPA}/rest/v1/jobs?id=eq.${j.id}`, { method: "DELETE", headers: admin });
}
console.log(`limpeza: ${novos.length} job(s) de leitura apagado(s)`);

console.log(`\nfoto em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
