// CORES PRÓPRIAS DO TEXTO, na tela, com a conta real e fotos reais.
//
// Põe uma etiqueta numa cena, abre "Cores e tamanho próprios", muda a cor — e MEDE a cor
// que o palco está pintando. É o par do `testar-visual-do-texto.ts`: lá se prova que a cor
// chega no vídeo renderizado, aqui que o controle chega na prévia. Os dois juntos fecham a
// corrente; um sozinho deixa metade sem prova.
//
// Não gera vídeo e não gasta crédito: monta a cena na tela e para antes de gerar.
//
//   BASE=http://localhost:3000 node scripts/conferir-cores-do-texto.mjs

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
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-cores-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const erroNaTela = () => c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error|Error:/.test(t) ? t.slice(0, 300) : ''; })()");
const clicarTexto = async (t, sel = "button") => {
  const r = await c.avaliar(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent).find(e => e.innerText.trim().split('\\n')[0].trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
  if (r) await esperar(350);
  return r;
};
/** A cor e o tamanho que o PALCO está pintando no texto (não o que o código diz que pinta). */
const textoNoPalco = () =>
  c.avaliar(`(() => {
    const e = document.querySelector('[data-texto-palco="1"]');
    if (!e) return null;
    const s = getComputedStyle(e);
    return { texto: e.innerText.trim(), cor: s.color, fundo: s.backgroundColor, tamanho: s.fontSize };
  })()`);

try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 1400, altura: 950, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(1500);

  // ---- uma cena de verdade, com foto de verdade ----
  if (!(await c.avaliar("!!document.querySelector('select')"))) await clicarTexto("Mídia");
  for (let i = 0; i < 60 && !(await c.avaliar("[...document.querySelectorAll('select option')].some(o => /^[0-9a-f-]{36}$/.test(o.value))")); i++) await esperar(250);
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); if (!s) return []; s.setAttribute('data-imoveis',''); return [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)); })()");
  let posta = 0;
  for (const id of ids) {
    await c.avaliar(`(() => { const s = document.querySelector('[data-imoveis]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    for (let i = 0; i < 24; i++) {
      posta = await c.avaliar('document.querySelectorAll(\'button[title*="clique pra pôr no fim"]\').length');
      if (posta > 0) break;
      await esperar(250);
    }
    if (posta > 0) break;
  }
  conferir(posta > 0, "achei foto pronta pra montar a cena", `${posta} fotos`);
  await c.avaliar('(() => { const b = document.querySelector(\'button[title*="clique pra pôr no fim"]\'); b?.click(); })()');
  await esperar(1200);
  conferir(!!(await textoNoPalco()) === false, "o palco começa sem texto nenhum");

  // ---- põe uma etiqueta ----
  const pos = await clicarTexto("Lançamento");
  await esperar(700);
  conferir(pos, "consegui pôr a etiqueta “Lançamento”");
  const inicial = await textoNoPalco();
  conferir(!!inicial && /Lan/.test(inicial.texto), "a etiqueta aparece NO PALCO", inicial ? `“${inicial.texto}” · ${inicial.cor} sobre ${inicial.fundo}` : "não achei");
  await shot("01-etiqueta-posta");

  // ---- ela é editável? (a queixa original) ----
  const temCampo = await c.avaliar(`[...document.querySelectorAll('input[type=text]')].some(i => i.offsetParent && i.value.includes('Lan'))`);
  conferir(temCampo, "existe um CAMPO pra reescrever a etiqueta depois de posta");

  // ---- abre as cores próprias ----
  const abriu = await clicarTexto("Cores e tamanho próprios");
  await esperar(500);
  conferir(abriu, "o botão “Cores e tamanho próprios” existe e responde");
  const depoisDeAbrir = await textoNoPalco();
  conferir(
    depoisDeAbrir && inicial && depoisDeAbrir.cor === inicial.cor && depoisDeAbrir.fundo === inicial.fundo,
    "ABRIR não muda nada no palco",
    inicial && depoisDeAbrir ? `${inicial.cor}/${inicial.fundo} → ${depoisDeAbrir.cor}/${depoisDeAbrir.fundo}` : ""
  );

  const cores = await c.avaliar("document.querySelectorAll('input[type=color]').length");
  conferir(cores >= 3, "aparecem os três seletores de cor (letra, fundo, contorno)", `${cores}`);
  await shot("02-controles-abertos");

  // ---- muda a cor da LETRA e mede o palco ----
  const mudar = (indice, hex) =>
    c.avaliar(`(() => {
      const i = [...document.querySelectorAll('input[type=color]')].filter(e => e.offsetParent)[${indice}];
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(i, ${JSON.stringify(hex)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

  await mudar(0, "#00ff00");
  await esperar(500);
  const verde = await textoNoPalco();
  conferir(verde?.cor === "rgb(0, 255, 0)", "mudar a LETRA pra verde MUDA o palco", verde?.cor ?? "sumiu");

  await mudar(1, "#ff0000");
  await esperar(500);
  const fundo = await textoNoPalco();
  conferir(/^rgba?\(255, 0, 0/.test(fundo?.fundo ?? ""), "mudar o FUNDO pra vermelho muda o palco", fundo?.fundo ?? "sumiu");
  await shot("03-cores-mudadas");

  // ---- tamanho ----
  const antes = parseFloat(fundo?.tamanho ?? "0");
  await c.avaliar(`(() => {
    const i = [...document.querySelectorAll('input[type=range]')].filter(e => e.offsetParent).find(e => /Tamanho da letra/i.test(e.closest('label')?.innerText ?? ''));
    if (!i) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, '0.1');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await esperar(500);
  const maior = parseFloat((await textoNoPalco())?.tamanho ?? "0");
  conferir(maior > antes, "aumentar o tamanho aumenta a letra NO PALCO", `${antes}px → ${maior}px`);

  // ---- desligar devolve ao estilo ----
  await clicarTexto("Cores próprias · ligado");
  await esperar(500);
  const voltou = await textoNoPalco();
  conferir(voltou && inicial && voltou.cor === inicial.cor && voltou.fundo === inicial.fundo, "desligar DEVOLVE o texto ao estilo", voltou && inicial ? `${voltou.cor}/${voltou.fundo} vs ${inicial.cor}/${inicial.fundo}` : "");

  conferir(!(await erroNaTela()), "nenhum erro de execução", (await erroNaTela()).slice(0, 120));
  await shot("04-fim");
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
