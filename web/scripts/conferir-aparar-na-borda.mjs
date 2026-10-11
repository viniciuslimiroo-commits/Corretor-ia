// APARAR A CENA ARRASTANDO A BORDA, na linha do tempo — e ONDE o gesto morre quando morre.
//
// Ele em 10/10/2026: "conserta aquilo de arrastar a borda pra cortar a cena".
//
// `conferir-editor-videos.mjs` já reprovava isso ("3s → 3s"), mas com uma mensagem que não
// distingue "a alça não existe" de "a alça existe e o arraste não fez nada" — as duas caem
// no mesmo `conferir`. Este roteiro separa os dois, e mais: conta os eventos de ponteiro que
// o motor de gestos realmente recebeu. Teste que só compara antes/depois diz QUE falhou;
// este diz ONDE.
//
// Não gera vídeo e não gasta crédito.
//
//   BASE=http://localhost:3000 node scripts/conferir-aparar-na-borda.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-aparar-"));
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
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='nextjs-portal{visibility:hidden!important}';document.head.appendChild(s);});" });
const shot = async (n) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${n}.png`), Buffer.from(data, "base64"));
};
const mouse = (type, x, y, buttons = 0) => c.cdp("Input.dispatchMouseEvent", { type, x: Math.round(x), y: Math.round(y), button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1, pointerType: "mouse" });
const clicar = async (x, y) => {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, 1);
  await esperar(60);
  await mouse("mouseReleased", x, y);
  await esperar(350);
};
/** Arrasta com um tempo de ESPERA entre apertar e começar a mover. Mão humana hesita. */
const arrastar = async (x0, y0, x1, y1, { esperaAntes = 30, passos = 14 } = {}) => {
  await mouse("mouseMoved", x0, y0);
  await mouse("mousePressed", x0, y0, 1);
  await esperar(esperaAntes);
  for (let i = 1; i <= passos; i++) {
    await mouse("mouseMoved", x0 + ((x1 - x0) * i) / passos, y0 + ((y1 - y0) * i) / passos, 1);
    await esperar(16);
  }
  await mouse("mouseReleased", x1, y1);
  await esperar(500);
};
const espec = () => c.avaliar("window.__encenaEditor?.espec?.() ?? null");
const medir = (sel) =>
  c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2 }; })()`);

try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 1400, altura: 950, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(2000);
  // Começa do zero: rascunho guardado de outra sessão muda o que está na linha.
  await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && /Começar do zero/.test(x.innerText)); b?.click(); })()`);
  await esperar(900);

  // ---- duas cenas de foto na linha ----
  // Pelo botão que está NO PALCO ("Fotos e arquivos"), não pela aba do trilho: depois de
  // "Começar do zero" o painel fecha, e clicar na aba não o reabria -- o roteiro seguia com
  // a linha vazia e acusava a alça de não existir num bloco que era a Tela final.
  await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => /Fotos e arquivos/.test(e.innerText)); b?.click(); })()`);
  await esperar(1200);
  await c.avaliar(`(() => { if (document.querySelector('select')) return; const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => e.innerText.trim().split(String.fromCharCode(10))[0].trim() === 'Mídia'); b?.click(); })()`);
  for (let i = 0; i < 60 && !(await c.avaliar("[...document.querySelectorAll('select option')].some(o => /^[0-9a-f-]{36}$/.test(o.value))")); i++) await esperar(250);
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); if (!s) return []; s.setAttribute('data-im',''); return [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)); })()");
  let fotos = 0;
  for (const id of ids) {
    await c.avaliar(`(() => { const s = document.querySelector('[data-im]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    for (let i = 0; i < 24; i++) {
      fotos = await c.avaliar('document.querySelectorAll(\'button[title*="clique pra pôr no fim"]\').length');
      if (fotos >= 2) break;
      await esperar(250);
    }
    if (fotos >= 2) break;
  }
  conferir(fotos >= 2, "achei fotos pra montar a linha", `${fotos}`);
  await c.avaliar('(() => { const b = [...document.querySelectorAll(\'button[title*="clique pra pôr no fim"]\')]; b[0]?.click(); })()');
  await esperar(1200);
  await c.avaliar('(() => { const b = [...document.querySelectorAll(\'button[title*="clique pra pôr no fim"]\')]; b[1]?.click(); })()');
  await esperar(1500);
  const e0 = await espec();
  await shot("00-setup");
  console.log(`  setup: espec=${e0 ? "existe" : "NULO"} · cenas=${e0?.cenas?.length ?? "?"} · imoveis no select=${ids.length} · botoes de foto=${fotos}`);
  conferir((e0?.cenas?.length ?? 0) >= 1, "pelo menos uma cena na linha do tempo", `${e0?.cenas?.length ?? 0}`);

  // ---- seleciona uma CENA ----
  // Só os blocos da faixa de CENAS. `[data-alvo="bloco"]` pega música e texto também, e
  // pegar o bloco de música fazia o roteiro arrastar a faixa errada e culpar a cena.
  // A chave é "cenas:N", e esse N é o índice no espec -- é assim que a medição e o dado
  // ficam falando do mesmo bloco.
  const blocosDeCena = () =>
    c.avaliar(`[...document.querySelectorAll('[data-alvo="bloco"][data-chave^="cenas:"]')].map(e => { const r = e.getBoundingClientRect(); return { chave: e.dataset.chave, i: Number(e.dataset.chave.split(':')[1]), x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2 }; })`);
  const todos = await c.avaliar(`[...document.querySelectorAll('[data-alvo="bloco"]')].map(e => e.dataset.chave + '(' + Math.round(e.getBoundingClientRect().width) + 'px)')`);
  console.log(`\n  blocos na linha (todas as faixas): ${todos.join(", ")}`);
  // A TELA FINAL TAMBÉM MORA NA FAIXA DE CENAS, no fim -- com a chave "cenas:N" logo depois
  // da última cena de verdade. Pegar "o último bloco de cena" pegava ELA, que não tem alça
  // por natureza (a tela final não se apara), e o roteiro acusava o app de um defeito que
  // não existia. Só vale bloco cujo índice ainda tem cena no espec.
  const quantasCenas = (await espec())?.cenas?.length ?? 0;
  const blocos = (await blocosDeCena()).filter((b) => b.i < quantasCenas);
  const alvo = blocos[blocos.length - 1];
  conferir(!!alvo, "achei o bloco de uma CENA DE VERDADE (não a tela final)", alvo ? `${alvo.chave}, ${Math.round(alvo.w)}px, de ${quantasCenas} cena(s)` : "nenhum bloco de cena");
  if (!alvo) throw new Error("sem cena na linha não dá pra testar o aparo");
  await clicar(alvo.cx, alvo.cy);
  const selecionado = await c.avaliar(`!!document.querySelector('[data-alvo="bloco"][data-selecionado="1"]')`);
  conferir(selecionado, "clicar no bloco SELECIONA ele", selecionado ? "" : "nenhum bloco ficou com data-selecionado");

  // CENA ANIMADA NÃO TEM ALÇA, DE PROPÓSITO: a duração dela é outro pedido ao modelo, e
  // muda pelo seletor. Um rascunho guardado com cena animada fazia este roteiro procurar
  // alça onde ela não deve existir e acusar o app. Então o tipo é FIXADO aqui.
  const tipoAntes = (await espec())?.cenas?.[alvo.i]?.tipo;
  if (tipoAntes === "animada") {
    await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => e.innerText.trim() === 'Foto'); b?.click(); })()`);
    await esperar(1200);
  }
  const tipo = (await espec())?.cenas?.[alvo.i]?.tipo;
  // Exigir um tipo CONHECIDO, e não só "diferente de animada": `undefined !== "animada"` é
  // verdade, e essa linha já me deu um "ok" verde apontando pra uma cena que nem existia.
  conferir(!!tipo && tipo !== "animada", "a cena é de um tipo que SE APARA", `tipo “${tipo}”${tipoAntes === "animada" ? " (troquei de animada pra foto)" : ""}`);

  // ---- a alça existe? (pergunta separada de "o arraste funciona") ----
  const alca = await medir('[data-alvo="bloco"][data-selecionado="1"] [data-alvo="alca-fim"]');
  conferir(!!alca, "a alça de FIM aparece no bloco selecionado", alca ? `${Math.round(alca.w)}x${Math.round(alca.h)} em x=${Math.round(alca.x)}` : "não existe no DOM");
  await shot("01-selecionado");

  if (alca) {
    // De onde o `conferir-editor-videos.mjs` agarra: 2px pra dentro da borda direita.
    const px = alvo.x + alvo.w - 2;
    const quemRecebe = await c.avaliar(`(() => { const e = document.elementFromPoint(${Math.round(px)}, ${Math.round(alvo.cy)}); if (!e) return 'nada'; const a = e.closest('[data-alvo]'); return a ? a.dataset.alvo : e.tagName.toLowerCase(); })()`);
    conferir(quemRecebe === "alca-fim", "no ponto do arraste, quem recebe o clique é a ALÇA", `recebe “${quemRecebe}”`);

    // Conta os eventos que o motor de gestos realmente vê.
    await c.avaliar(`(() => {
      window.__ev = { down: 0, move: 0, up: 0, alvos: [] };
      const r = document.querySelector('[data-area="linha"]')?.closest('div') ?? document;
      for (const t of ['pointerdown', 'pointermove', 'pointerup']) {
        document.addEventListener(t, (e) => {
          const k = t.replace('pointer', '');
          window.__ev[k === 'down' ? 'down' : k === 'move' ? 'move' : 'up']++;
          if (k === 'down') window.__ev.alvos.push(e.target?.closest?.('[data-alvo]')?.dataset?.alvo ?? e.target?.tagName);
        }, true);
      }
    })()`);

    const zoom = await c.avaliar(`parseFloat(getComputedStyle(document.querySelector('[data-area="linha"]')).getPropertyValue('--pxs'))`);
    conferir(zoom > 0, "li o zoom da linha (px por segundo)", `${zoom}`);

    // A CENA PRECISA TER DE ONDE ENCOLHER. `LIMITES.duracaoMin` é 3s: uma cena já no piso
    // responde "3s → 3s" a qualquer arraste, e isso é o comportamento CERTO. Foi assim que
    // eu quase registrei um defeito que não existia -- arrastei duas vezes a mesma cena e
    // li o limite como falha. Cada arraste agora usa uma cena própria, e a precondição é
    // conferida antes.
    const MIN = 3;
    const apararEmCenaPropria = async (indice, como, esperaAntes) => {
      const b = (await blocosDeCena()).filter((x) => x.i < quantasCenas)[indice];
      if (!b) return conferir(false, `${como}: achei a cena ${indice} pra aparar`);
      await clicar(b.cx, b.cy);
      await esperar(300);
      const antes = (await espec())?.cenas?.[b.i]?.duracao;
      if (!(antes > MIN)) return conferir(false, `${como}: a cena tem de onde encolher`, `está em ${antes}s, e o mínimo é ${MIN}s`);
      const alcaAqui = await medir('[data-alvo="bloco"][data-selecionado="1"] [data-alvo="alca-fim"]');
      if (!alcaAqui) return conferir(false, `${como}: a alça aparece nessa cena`);
      const x = b.x + b.w - 2;
      await c.avaliar("window.__ev = { down: 0, move: 0, up: 0, alvos: [] }");
      await arrastar(x, b.cy, x - zoom * (antes - MIN) * 0.8, b.cy, { esperaAntes });
      const ev = await c.avaliar("window.__ev");
      const depois = (await espec())?.cenas?.[b.i]?.duracao;
      conferir(depois !== undefined && depois < antes, `${como}: a borda ENCOLHE a cena`, `${antes}s → ${depois}s · ${ev.down}↓ ${ev.move}→ ${ev.up}↑ em ${ev.alvos.join(",")}`);
      return depois;
    };

    // Cena 0 com a mão rápida; cena 1 com a mão que hesita. Duas cenas diferentes, as duas
    // inteiras: assim o segundo caso não herda o piso deixado pelo primeiro.
    await apararEmCenaPropria(0, "mão rápida", 30);
    await shot("02-depois-do-arraste");
    await apararEmCenaPropria(1, "mão que HESITA 0,7 s na alça antes de puxar", 700);
    await shot("03-com-hesitacao");

    // ---- O MENU NÃO PODE TER SUMIDO. Tirar o "segurar" do mouse só se paga se o botão
    //      direito abrir o mesmo menu; senão eu troquei um defeito por outro. ----
    const bm = (await blocosDeCena()).filter((x) => x.i < quantasCenas)[0];
    await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(bm.cx), y: Math.round(bm.cy), buttons: 0 });
    await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(bm.cx), y: Math.round(bm.cy), button: "right", buttons: 2, clickCount: 1 });
    await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(bm.cx), y: Math.round(bm.cy), button: "right", buttons: 0, clickCount: 1 });
    await esperar(700);
    const menu = await c.avaliar(`(() => {
      const itens = [...document.querySelectorAll('[role=menu] button, [role=menuitem]')].filter(e => e.offsetParent).map(e => e.innerText.trim().split(String.fromCharCode(10))[0]);
      if (itens.length) return itens;
      const t = document.body.innerText;
      return /Dividir|Duplicar|Apagar cena|Usar como capa/.test(t) ? ['(por texto) ' + (t.match(/Dividir[^\\n]*/) ?? [''])[0]] : [];
    })()`);
    conferir(menu.length > 0, "BOTÃO DIREITO no bloco abre o menu da cena", menu.length ? `${menu.length} itens: ${menu.slice(0, 4).join(" · ")}` : "nenhum menu apareceu");
    await shot("04-menu-botao-direito");
    await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await esperar(400);

    // ---- E O DEDO continua abrindo o menu ao segurar: esse gesto é dele, não do mouse. ----
    const bd = (await blocosDeCena()).filter((x) => x.i < quantasCenas)[0];
    const ponto = [{ x: Math.round(bd.cx), y: Math.round(bd.cy), id: 0, radiusX: 6, radiusY: 6, force: 1 }];
    await c.cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: ponto });
    await esperar(750);
    await c.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await esperar(700);
    const menuDedo = await c.avaliar(`(() => { const t = document.body.innerText; return /Dividir|Duplicar|Apagar cena|Usar como capa/.test(t); })()`);
    conferir(menuDedo, "e SEGURAR com o dedo também abre o menu (o gesto do celular ficou)", menuDedo ? "" : "o dedo perdeu o menu — o conserto foi longe demais");
    await shot("05-menu-dedo");
  }

  conferir(!(await c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error/.test(t); })()")), "nenhum erro de execução");
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 200));
} finally {
  await c.fechar?.();
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
