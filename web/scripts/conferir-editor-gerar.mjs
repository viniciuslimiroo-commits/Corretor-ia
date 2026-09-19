// GERAR PELO EDITOR NOVO, de ponta a ponta na tela (computador 1280x800), sem crédito: uma
// foto pronta, "Gerar vídeo", o progresso no cabeçalho (barra fina + porcentagem no botão),
// e a JANELA do vídeo pronto (vídeo tocável, Baixar, Editar, Usar na linha, Esc fecha).
// Escreve UM vídeo na conta e apaga no fim, pelo id que a própria janela mostra. Confere
// que o saldo não mudou.
//
//   BASE=http://localhost:3003 CONTA=limiro.cardoso@outlook.com node scripts/conferir-editor-gerar.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-gerar-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const r0 = await fetch(`${BASE}/login`).catch(() => null);
if (!r0 || !r0.ok) {
  console.log(`o servidor ${BASE} não respondeu; nada foi feito`);
  process.exit(1);
}
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
const cab = { Authorization: `Bearer ${access_token}` };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); }); window.__erros = []; addEventListener('error', e => window.__erros.push('erro: ' + (e.message || e.type)));" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const antes = await saldo();
let videoId = null;
try {
  await c.abrir(`${BASE}/login`, { largura: 1280, altura: 800 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 1280, altura: 800, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(900);
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); return s ? [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)) : []; })()");
  for (const id of ids) {
    await c.avaliar(`(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === ${JSON.stringify(id)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await esperar(1500);
    if (await c.avaliar("!!document.querySelector('button[title*=\"clique pra pôr no fim\"]')")) break;
  }
  await c.avaliar("document.querySelector('button[title*=\"clique pra pôr no fim\"]')?.click()");
  await esperar(900);
  const gerar = await c.avaliar("(() => { const b = document.querySelector('[data-gerar]'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  conferir(!!gerar, "com uma foto na linha, Gerar vídeo fica ligado");
  if (!gerar) throw new Error("Gerar desligado");
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: gerar.x, y: gerar.y, button: "left", buttons: 1, clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: gerar.x, y: gerar.y, button: "left", clickCount: 1 });
  let viuProgresso = false;
  for (let i = 0; i < 20 && !viuProgresso; i++) {
    await esperar(300);
    viuProgresso = await c.avaliar("/\\d+%/.test(document.querySelector('[data-gerar]')?.innerText ?? '')");
  }
  await shot("g1-gerando");
  conferir(viuProgresso, "gerando: o botão mostra a porcentagem e a barra corre no cabeçalho");
  let abriu = false;
  for (let i = 0; i < 200 && !abriu; i++) {
    await esperar(1500);
    abriu = await c.avaliar("!!document.querySelector('[data-modal-video] video')");
  }
  conferir(abriu, "pronto: abre a JANELA do vídeo (e não um cartão empurrando o palco)");
  if (abriu) {
    await esperar(1200);
    await shot("g2-pronto");
    const href = await c.avaliar("[...document.querySelectorAll('[data-modal-video] a')].find(a => /Baixar/.test(a.innerText))?.href ?? ''");
    videoId = (href.match(/\/videos\/([0-9a-f-]{36})\.mp4/) ?? [])[1] ?? null;
    conferir(!!videoId, "a janela tem Baixar MP4 com o arquivo do vídeo novo", videoId ?? href.slice(0, 80));
    const botoes = await c.avaliar("[...document.querySelectorAll('[data-modal-video] button')].map(b => (b.getAttribute('aria-label') || b.innerText).trim())");
    conferir(["Editar", "Usar na linha", "Fechar"].every((t) => botoes.some((b) => b.startsWith(t))), "e Editar, Usar na linha e Fechar", botoes.join(" · "));
    const outro = await c.avaliar("[...document.querySelectorAll('[data-modal-video] button')].some(b => /Quadrado/.test(b.innerText))");
    conferir(outro, "vídeo recém-gerado oferece “Fazer também em” outro formato");
    await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await esperar(400);
    conferir(await c.avaliar("!document.querySelector('[data-modal-video]')"), "Esc fecha a janela");
  }
  const er = await c.avaliar("(window.__erros || []).splice(0)");
  conferir(er.length === 0, "nenhum erro na página", er.join(" | "));
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  if (videoId) {
    const r = await fetch(`${BASE}/api/video/${videoId}`, { method: "DELETE", headers: cab });
    console.log(`vídeo de teste apagado: HTTP ${r.status}`);
  }
  conferir(antes === (await saldo()), "nada disso gastou crédito", `${antes}`);
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
