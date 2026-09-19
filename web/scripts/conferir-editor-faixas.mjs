// O EDITOR com a linha do tempo de FAIXAS, com dedo emulado (375×812) e no computador
// (1280×800), com a conta real e fotos reais. Não grava nada: monta o vídeo só na tela e NÃO gera.
//
//   música é um bloco na faixa Música (desde o começo: "Calma" do início ao fim);
//   "Sem música" tira; escolher de novo ADICIONA, seleciona e avisa "toque para cortar";
//   a barra da música tem Trecho, Início aqui, Fim aqui, Dividir, Volume, Fade, Trocar, Apagar;
//   levar o cursor pra dentro e "Fim aqui" corta; Desfazer volta; o pedido vira versão 2;
//   Play toca (o relógio anda) e Pausa para; teclado: End/Home, setas (quadro e segundo), S
//   divide, Ctrl+Z desfaz; nada vaza pro lado.
//
//   BASE=http://localhost:3002 CONTA=limiro.cardoso@outlook.com node scripts/conferir-editor-faixas.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-faixas-"));
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
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const texto = () => c.avaliar("document.body.innerText");
const toque = (pontos, tipo) => c.cdp("Input.dispatchTouchEvent", { type: tipo, touchPoints: pontos.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
const tocar = async (x, y) => {
  await toque([[x, y]], "touchStart");
  await esperar(60);
  await toque([], "touchEnd");
  await esperar(350);
};
const caixa = (sel) => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const tocarTexto = async (t, sel = "button") => {
  const r = await c.avaliar(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent !== null).find(e => e.innerText.trim().split('\\n')[0].trim() === ${JSON.stringify(t)}); if (!b) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!r) return false;
  await tocar(r.x, r.y);
  return true;
};
const erroNaTela = () => c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error|Error:/.test(t) ? t.slice(0, 300) : ''; })()");
const blocosMusica = () => c.avaliar("[...document.querySelectorAll('[data-faixa=\"musica\"] [data-alvo=\"bloco\"]')].map(b => ({ sel: b.dataset.selecionado === '1', larg: +b.dataset.largura }))");

try {
  await c.abrir(`${BASE}/login`, { largura: 375, altura: 812, celular: true });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 375, altura: 812, celular: true, pronto: "[...document.querySelectorAll('select option')].some(o => /^[0-9a-f-]{36}$/.test(o.value))" });
  // As fotos aparecem por imóvel: o primeiro que tiver foto pronta.
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); s.setAttribute('data-imoveis', ''); return [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)); })()");
  for (const id of ids) {
    await c.avaliar(`(() => { const s = document.querySelector('[data-imoveis]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    let achou = false;
    for (let i = 0; i < 24 && !achou; i++) {
      achou = await c.avaliar("document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]').length >= 2");
      if (!achou) await esperar(250);
    }
    if (achou) break;
  }
  const fotos = await c.avaliar("(() => { const bs = [...document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]')].slice(0, 2); bs.forEach(b => b.click()); return bs.length; })()");
  conferir(fotos === 2, "duas fotos reais no vídeo");
  await esperar(1500);
  conferir(!(await erroNaTela()), "o editor abre a linha nova sem erro", await erroNaTela());
  conferir(!!(await caixa('[data-area="linha"]')), "a linha do tempo de faixas está na tela");
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "375px: nada vaza pro lado");
  const m0 = await blocosMusica();
  conferir(m0.length === 1, "a música de sempre (Calma) já aparece como bloco na faixa Música", JSON.stringify(m0));
  await shot("f1-inicio");

  // ---------- aba Áudio: tirar e pôr a música ----------
  await tocarTexto("Áudio");
  await esperar(500);
  const tirou = await tocarTexto("Sem música");
  await esperar(700);
  conferir(tirou && (await blocosMusica()).length === 0 && (await texto()).includes("Música tirada"), "\"Sem música\": o bloco sai e o aviso diz (com Desfazer)");
  const faixasBA = await c.avaliar("[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && /Piano|cordas|Violão|Batida|suave/i.test(b.innerText)).map(b => b.innerText.split('\\n')[0]).slice(0, 5)");
  // Um item de MÚSICA (nome + descrição, duas linhas) -- não a etiqueta de categoria "Calma".
  const escolheu = await c.avaliar("(() => { const L = String.fromCharCode(10); const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.innerText.trim().includes(L)).find(b => /^(Sereno|Calma|Aconchego)$/.test(b.innerText.trim().split(L)[0].trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { t: b.innerText.split(L)[0], x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  if (escolheu) await tocar(escolheu.x, escolheu.y);
  await esperar(900);
  const m1 = await blocosMusica();
  conferir(!!escolheu && m1.length === 1 && m1[0].sel && (await texto()).includes("Música adicionada"), "escolher música: o bloco APARECE na faixa Música, já selecionado, com o aviso \"toque para cortar\"", `${escolheu?.t ?? "?"} · ${JSON.stringify(m1)} · opções vistas: ${faixasBA.join("|")}`);
  const barra = await c.avaliar("[...document.querySelectorAll('[data-area=\"barra\"] button')].map(b => b.innerText.trim()).filter(Boolean)");
  conferir(["Trecho da música", "Início aqui", "Fim aqui", "Dividir", "Volume", "Fade", "Trocar", "Apagar"].every((n) => barra.includes(n)), "a barra da música: Trecho, Início aqui, Fim aqui, Dividir, Volume, Fade, Trocar, Apagar", barra.join(" · "));
  await shot("f2-musica-selecionada");

  // ---------- cortar: cursor pra dentro e "Fim aqui" ----------
  const regua = await caixa('[data-alvo="regua"]');
  await tocar(187 + 110, regua.cy);
  await esperar(900);
  const larg0 = (await blocosMusica())[0]?.larg ?? 0;
  const cortou = await tocarTexto("Fim aqui");
  await esperar(700);
  const larg1 = (await blocosMusica())[0]?.larg ?? 0;
  conferir(cortou && larg1 > 0 && larg1 < larg0 - 10 && (await texto()).includes("Cortado aqui"), "\"Fim aqui\": a música termina no cursor (o bloco encolhe) e o aviso oferece Desfazer", `${larg0}px -> ${larg1}px`);
  const especV2 = await c.avaliar("window.__encenaEditor?.espec?.() ?? null");
  if (especV2) conferir(especV2.versao === 2 && Array.isArray(especV2.audios) && especV2.audios.some((a) => a.duracao > 0), "o pedido ao servidor vai com a música cortada (versão 2)", JSON.stringify(especV2.audios?.[0] ?? {}));

  // ---------- desfazer ----------
  const desfez = await c.avaliar("(() => { const b = [...document.querySelectorAll('[data-area=\"linha\"] button')].find(b => /desfazer/i.test(b.getAttribute('aria-label') ?? b.title ?? '')); if (!b || b.disabled) return false; b.click(); return true; })()");
  await esperar(700);
  const larg2 = (await blocosMusica())[0]?.larg ?? 0;
  conferir(desfez && Math.abs(larg2 - larg0) <= 2, "Desfazer: a música volta ao tamanho de antes", `${larg2}px`);
  await shot("f3-cortada-desfeita");

  // ---------- Play e Pausa ----------
  const t0 = await c.avaliar("+(document.querySelector('[data-area=\"linha\"]')?.innerText.match(/(\\d+):(\\d+)[.,](\\d)/) ?? [0,0,0,0]).slice(1).join('')");
  const play = await c.avaliar("(() => { const b = [...document.querySelectorAll('[data-area=\"linha\"] button')].find(b => /tocar|play/i.test(b.getAttribute('aria-label') ?? b.title ?? '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  if (play) await tocar(play.x, play.y);
  await esperar(1600);
  const tocandoAgora = await c.avaliar("!![...document.querySelectorAll('[data-area=\"linha\"] button')].find(b => /pausa|pausar/i.test(b.getAttribute('aria-label') ?? b.title ?? ''))");
  conferir(!!play && tocandoAgora, "Play: toca (o botão vira Pausa e o cursor anda)");
  if (play) await tocar(play.x, play.y);
  await esperar(500);
  conferir(!(await erroNaTela()), "depois de tocar e pausar, nenhum erro", await erroNaTela());
  void t0;

  // ---------- atalhos de teclado (os do CapCut/Premiere) ----------
  const tecla = async (key, code, vk, mod = 0) => {
    await c.avaliar("document.activeElement?.blur?.()");
    await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mod });
    await c.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mod });
    await esperar(250);
  };
  const tempoAgora = () => c.avaliar("window.__encenaEditor?.tempo?.() ?? -1");
  const total = await c.avaliar("window.__encenaEditor?.espec?.()?.cenas?.reduce((s, x) => s + (x.duracao ?? 0), 0) ?? 0");
  await tecla("End", "End", 35);
  const tFim = await tempoAgora();
  await tecla("Home", "Home", 36);
  const tIni = await tempoAgora();
  await tecla("ArrowRight", "ArrowRight", 39, 8);
  await tecla("ArrowRight", "ArrowRight", 39, 8);
  await tecla("ArrowLeft", "ArrowLeft", 37);
  const tSetas = await tempoAgora();
  conferir(tFim > 1 && tIni === 0 && Math.abs(tSetas - (2 - 1 / 30)) < 0.02, "teclado: End/Home vão ao fim e ao começo; Shift+→ anda 1s; ← volta um quadro", `fim ${tFim}s (cenas ${total}s) · começo ${tIni}s · setas ${tSetas}s`);
  const bm = await caixa('[data-faixa="musica"] [data-alvo="bloco"]');
  if (bm) await tocar(Math.min(bm.x + 30, 360), bm.cy);
  await esperar(500);
  await tecla("s", "KeyS", 83);
  await esperar(500);
  const partes = await blocosMusica();
  conferir(partes.length === 2 && (await texto()).includes("Dividido no cursor"), "teclado: S divide a música selecionada no cursor (Ctrl+Z desfaz)", JSON.stringify(partes));
  await tecla("z", "KeyZ", 90, 2);
  await esperar(500);
  conferir((await blocosMusica()).length === 1, "teclado: Ctrl+Z junta de novo");

  // ---------- computador ----------
  await c.abrir(`${BASE}/editor/video`, { largura: 1280, altura: 800, celular: false, pronto: "!!document.querySelector('[data-area=\"linha\"]')" });
  await esperar(800);
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "1280px: nada vaza pro lado");
  await shot("f4-computador");
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
