// TODOS OS BOTÕES DO EDITOR, um por um, no computador (1280x800): com três fotos e um vídeo
// na linha, abre cada ferramenta e clica em cada botão do painel e dos ajustes da cena. Pra
// cada clique confere que a página não quebrou (nenhum erro, o editor continua na tela) e
// que ALGUMA coisa respondeu (a tela mudou, abriu menu/aviso, ou o botão estava desligado
// com o motivo na dica). Não clica no que gasta crédito, chama IA, pede câmera/microfone,
// abre arquivo do computador ou sai do editor.
//
//   BASE=http://localhost:3002 CONTA=limiro.cardoso@outlook.com node scripts/conferir-editor-botoes.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-botoes-"));
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
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${p.get("access_token")}` } }).then((x) => x.json());
const sessao = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", {
  source:
    "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); }); window.__erros = []; addEventListener('error', e => window.__erros.push('erro: ' + (e.message || e.type))); addEventListener('unhandledrejection', e => window.__erros.push('promessa: ' + (e.reason && e.reason.message || e.reason)));",
});
// Nada de câmera, microfone nem janela de arquivo: o navegador recusa na hora.
await c.cdp("Browser.grantPermissions", { permissions: [] }).catch(() => {});
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const clicarEl = async (x, y) => {
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};

// Rótulos que NÃO se clicam: gastam, chamam IA, pedem permissão, abrem arquivo ou saem.
const NAO = /fechar o painel|gerar vídeo|escrever com ia|legendas automáticas|gravar|câmera|enviar|escolher áudio|trocar o áudio|carregar arquivo|sair do editor|minha marca|preencher agora|ver planos|apagar vídeo|editar este projeto|baixar|compartilhar|mover a câmera/i;

await c.abrir(`${BASE}/login`, { largura: 1280, altura: 800 });
await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
await c.abrir(`${BASE}/editor/video`, { largura: 1280, altura: 800, pronto: "!!document.querySelector('[data-editor]')" });
await esperar(900);

try {
  // três fotos e um vídeo
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); return s ? [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)) : []; })()");
  for (const id of ids) {
    await c.avaliar(`(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === ${JSON.stringify(id)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await esperar(1500);
    if (await c.avaliar("document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]').length >= 3")) break;
  }
  await c.avaliar("[...document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]')].slice(0, 3).forEach(b => b.click())");
  await esperar(800);
  await c.avaliar("[...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === 'Vídeos')?.click()");
  await esperar(2500);
  await c.avaliar("document.querySelector('[data-video-id]:not([disabled])')?.click()");
  for (let i = 0; i < 60 && !(await c.avaliar("window.__encenaEditor.espec().cenas.some(x => x.tipo === 'clipe')")); i++) await esperar(250);
  const nCenas = await c.avaliar("window.__encenaEditor.espec().cenas.length");
  conferir(nCenas >= 4, "montagem de partida: três fotos e um vídeo na linha", `${nCenas} cenas`);

  const ABAS = await c.avaliar("[...document.querySelectorAll('nav[aria-label=Ferramentas] button')].map(b => b.innerText.trim())");
  let clicados = 0;
  let semResposta = [];
  for (const aba of ABAS) {
    // Abre a ferramenta (se já estiver aberta, o clique fecharia: confere antes).
    const aberta = await c.avaliar(`(() => { const b = [...document.querySelectorAll('nav[aria-label=Ferramentas] button')].find(b => b.innerText.trim() === ${JSON.stringify(aba)}); return b?.getAttribute('aria-pressed') === 'true'; })()`);
    if (!aberta) await c.avaliar(`[...document.querySelectorAll('nav[aria-label=Ferramentas] button')].find(b => b.innerText.trim() === ${JSON.stringify(aba)})?.click()`);
    await esperar(700);
    // Os botões do painel, pela ordem, por um "endereço" estável (rótulo + posição).
    // O que JÁ está escolhido (aria-pressed/selected) não muda ao clicar de novo: não conta.
    const lista = await c.avaliar(`[...document.querySelectorAll('[data-painel] button')].map((b, i) => ({ i, t: (b.getAttribute('aria-label') || b.innerText || b.title || '').trim().split(String.fromCharCode(10))[0].slice(0, 40), off: b.disabled, ja: b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' }))`);
    for (const item of lista) {
      if (!item.t || NAO.test(item.t) || item.off || item.ja) continue;
      // Guarda a tela inteira (não só o tamanho: trocar a classe de lugar dá o mesmo tamanho).
      await c.avaliar("window.__antes = document.querySelector('[data-editor]').innerHTML + JSON.stringify(window.__encenaEditor.espec()) + (document.querySelector('[role=menu]') ? 'M' : '') + (document.querySelector('[data-aviso]')?.innerText ?? '')");
      const alvo = await c.avaliar(`(() => { const b = [...document.querySelectorAll('[data-painel] button')][${item.i}]; if (!b || b.disabled) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (b.getAttribute('aria-label') || b.innerText || '').trim().split(String.fromCharCode(10))[0] }; })()`);
      if (!alvo || alvo.t.slice(0, 40) !== item.t) continue;
      await clicarEl(alvo.x, alvo.y);
      // Pôr um vídeo espera o servidor (o link do arquivo): dá tempo pra ele responder.
      await esperar(aba === "Vídeos" ? 2500 : 260);
      clicados++;
      const depois = await c.avaliar("document.querySelector('[data-editor]') ? (document.querySelector('[data-editor]').innerHTML + JSON.stringify(window.__encenaEditor.espec()) + (document.querySelector('[role=menu]') ? 'M' : '') + (document.querySelector('[data-aviso]')?.innerText ?? '')) === window.__antes ? 'IGUAL' : 'MUDOU' : 'SUMIU'");
      if (depois === "SUMIU") throw new Error(`o editor sumiu depois de "${item.t}" (${aba})`);
      if (depois === "IGUAL") semResposta.push(`${aba} > ${item.t}`);
      // Fecha menu que tenha aberto e volta a ferramenta, se o clique trocou de aba.
      await c.avaliar("document.querySelector('[role=menu]') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
      const erros = await c.avaliar("(window.__erros || []).splice(0)");
      if (erros.length) conferir(false, `sem erro depois de ${aba} > ${item.t}`, erros.join(" | "));
      const ainda = await c.avaliar(`(() => { const b = [...document.querySelectorAll('nav[aria-label=Ferramentas] button')].find(b => b.innerText.trim() === ${JSON.stringify(aba)}); return b?.getAttribute('aria-pressed') === 'true'; })()`);
      if (!ainda) break;
    }
  }
  conferir(clicados >= 35, "cliquei em todos os botões dos painéis (menos os que gastam ou pedem permissão)", `${clicados} cliques`);
  conferir(semResposta.length === 0, "nenhum botão ficou sem resposta (a tela, o vídeo ou um aviso mudou)", semResposta.slice(0, 12).join(" · "));

  // Os ajustes da cena (coluna da direita), numa cena de foto e numa de vídeo.
  for (const qual of ["foto", "video"]) {
    const bloco = await c.avaliar(`(() => { const bs = [...document.querySelectorAll('[data-area="linha"] [data-alvo="bloco"]')].filter(b => b.dataset.chave?.startsWith('cenas:') && (${JSON.stringify(qual)} === 'video' ? b.dataset.video === '1' : b.dataset.video !== '1') && !b.textContent.includes('Tela final')); const b = bs[0]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!bloco) continue;
    await clicarEl(bloco.x, bloco.y);
    await esperar(400);
    const botoes = await c.avaliar(`[...document.querySelectorAll('[data-inspetor] button')].map((b, i) => ({ i, t: (b.getAttribute('aria-label') || b.innerText || '').trim().split(String.fromCharCode(10))[0], off: b.disabled }))`);
    let n = 0;
    for (const b of botoes) {
      if (!b.t || b.off || NAO.test(b.t) || /apagar a cena/i.test(b.t)) continue;
      const alvo = await c.avaliar(`(() => { const e = [...document.querySelectorAll('[data-inspetor] button')][${b.i}]; if (!e || e.disabled) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!alvo) continue;
      await clicarEl(alvo.x, alvo.y);
      await esperar(220);
      n++;
      const erros = await c.avaliar("(window.__erros || []).splice(0)");
      if (erros.length) conferir(false, `sem erro depois de Ajustes da cena (${qual}) > ${b.t}`, erros.join(" | "));
      if (!(await c.avaliar("!!document.querySelector('[data-editor]')"))) throw new Error(`o editor sumiu depois de ${b.t}`);
    }
    conferir(n > 5, `ajustes da cena de ${qual}: cliquei em todos os botões, sem erro`, `${n} cliques`);
  }
  await shot("b1-depois-de-tudo");
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "depois de tudo, nada vaza pro lado");
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
