// AS FAIXAS DA LINHA DO TEMPO no navegador de verdade (docs/planos/linha-do-tempo-spec.md,
// pacote P5, testes do harness).
//
// O que o Node não alcança: altura de cada peça no celular (114 / 198 / 378), alvos de
// 44px, e o comportamento do dedo -- deslizar num bloco NÃO selecionado rola a linha sem
// mexer nele; no selecionado, move; toque seleciona sem andar o tempo; fundo vazio tira a
// seleção; tira fina abre a faixa; régua leva o cursor; segurar 450ms abre o menu; segundo
// dedo cancela o arraste; rolagem programada (tocando) não pausa, a da pessoa pausa;
// pinça muda o zoom mantendo o segundo no centro; Ajustar cabe o vídeo; guia de encaixe.
//
// Dirige o Chrome instalado por CDP (sem Puppeteer), com toque emulado, na bancada
// `/dev/linha-do-tempo` do servidor de desenvolvimento. Não toca banco, storage nem IA.
//
//   node scripts/conferir-faixas-no-navegador.mjs [--porta 3000] [--ver]
//   DEPURAR=1 ... mostra os eventos de ponteiro em volta dos toques que costumam falhar.
//
// Os toques ficam longe do canto de baixo à esquerda: ali mora o selo "N" das ferramentas
// de desenvolvimento do Next, que come o toque (só existe em dev).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const argumentos = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = argumentos.indexOf(nome);
  return i >= 0 && argumentos[i + 1] ? argumentos[i + 1] : padrao;
};
const PORTA = Number(valor("--porta", "3000"));
const PORTA_CDP = Number(valor("--porta-cdp", String(9500 + Math.floor(Math.random() * 300))));
const VER = argumentos.includes("--ver");
const BASE = `http://localhost:${PORTA}/dev/linha-do-tempo`;

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
].filter(Boolean);
const chrome = CHROMES.find((c) => fs.existsSync(c));
if (!chrome) throw new Error(`Chrome não encontrado. Tentei: ${CHROMES.join(", ")}`);

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra !== "" ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "encena-faixas-"));
const processo = spawn(
  chrome,
  [VER ? null : "--headless=new", `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank"].filter(Boolean),
  { stdio: "ignore" }
);
function fechar() {
  try { processo.kill(); } catch { /* já saiu */ }
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o temp resolve */ }
}

async function alvo() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) return await r.json();
    } catch { /* subindo */ }
    await esperar(100);
  }
  throw new Error("O Chrome não abriu a porta de depuração.");
}

let cdp, avaliar;

async function abrir(consulta, w, h, celular) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: celular ? 2 : 1, mobile: celular });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: celular, maxTouchPoints: celular ? 5 : 1 });
  await cdp("Page.navigate", { url: `${BASE}?${consulta}` });
  for (let i = 0; i < 100; i++) {
    await esperar(100);
    if (await avaliar("!!window.__linha && !!document.querySelector('[data-area=linha]')")) break;
  }
  await esperar(600);
}

const L = () => avaliar("JSON.parse(JSON.stringify({ ...window.__linha, eventos: window.__linha.eventos.map(e => ({ tipo: e.tipo, dado: e.dado })) }))");
const nEventos = async () => avaliar("window.__linha.eventos.length");
const eventosDesde = async (n) => avaliar(`JSON.parse(JSON.stringify(window.__linha.eventos.slice(${n}).map(e => ({ tipo: e.tipo, dado: e.dado }))))`);
const caixa = (seletor) => avaliar(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const rolagem = () => avaliar("document.querySelector('[data-rolagem]').scrollLeft");

async function toque(pontos, tipo) {
  await cdp("Input.dispatchTouchEvent", { type: tipo, touchPoints: pontos.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
}
async function tocar(x, y) {
  await toque([[x, y]], "touchStart");
  await esperar(40);
  await toque([], "touchEnd");
  await esperar(250);
}
async function arrastar(x0, y0, x1, y1, { passos = 12, antes = 30, depois = 30 } = {}) {
  await toque([[x0, y0]], "touchStart");
  await esperar(antes);
  for (let i = 1; i <= passos; i++) {
    await toque([[x0 + ((x1 - x0) * i) / passos, y0 + ((y1 - y0) * i) / passos]], "touchMove");
    await esperar(16);
  }
  await esperar(depois);
  await toque([], "touchEnd");
  await esperar(400);
}
async function segurar(x, y, ms) {
  await toque([[x, y]], "touchStart");
  await esperar(ms);
  await toque([], "touchEnd");
  await esperar(200);
}
const seletorBloco = (trilha, i) => `[data-alvo="bloco"][data-chave="${trilha}:${i}"]`;

try {
  const t = await alvo();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendentes.has(d.id)) { pendentes.get(d.id)(d); pendentes.delete(d.id); }
  };
  cdp = (method, params = {}) => new Promise((r, x) => {
    const n = ++id;
    pendentes.set(n, (d) => (d.error ? x(new Error(`${method}: ${d.error.message}`)) : r(d.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  avaliar = async (expressao) => {
    const r = await cdp("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expressao.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  await cdp("Page.enable");

  // ---------- alturas e alvos ----------
  for (const [w, h] of [[375, 812], [375, 667]]) {
    await abrir("caso=seis&celular=1&aberta=musica", w, h, true);
    const a1 = await avaliar("document.querySelector('[data-area=linha]').getBoundingClientRect().height");
    conferir(a1 === 198, `${w}x${h} · seis faixas, uma aberta: 198px`, a1);
    const botoes = await avaliar("[...document.querySelectorAll('[data-area=linha] button')].map(b => { const r = b.getBoundingClientRect(); return [r.left, r.right, r.width, r.height]; })");
    const sobrepoe = botoes.some((b, i) => i > 0 && b[0] < botoes[i - 1][1] - 0.5);
    conferir(botoes.every((b) => b[2] >= 44 && b[3] >= 44) && !sobrepoe && Math.max(...botoes.map((b) => b[1])) <= w, `${w}x${h} · fileira de controles: 5 botões de 44×44, sem sobrepor, dentro de ${w}px`, botoes.map((b) => Math.round(b[0])).join(","));
    conferir((await avaliar("document.documentElement.scrollWidth")) === w, `${w}x${h} · a página não rola de lado`);
    await abrir("caso=nenhuma&celular=1", w, h, true);
    const a0 = await avaliar("document.querySelector('[data-area=linha]').getBoundingClientRect().height");
    conferir(a0 === 114, `${w}x${h} · sem faixa: 114px`, a0);
    await abrir("caso=seis&celular=1&todas=1", w, h, true);
    const a2 = await avaliar("document.querySelector('[data-area=linha]').getBoundingClientRect().height");
    conferir(a2 === 378, `${w}x${h} · modo Faixas (todas abertas): 378px, sem rolagem por dentro`, a2);
  }
  await abrir("caso=seis&celular=0", 1280, 800, false);
  const aDesk = await avaliar("document.querySelector('[data-area=linha]').getBoundingClientRect().height");
  conferir(aDesk === 286, "1280x800 · computador, seis faixas abertas: 286px", aDesk);
  const rotulo = await caixa('[data-faixa="voz"] > .sticky');
  conferir(!!rotulo && Math.round(rotulo.w) === 72, "1280x800 · coluna de nomes com 72px", rotulo && Math.round(rotulo.w));

  // ---------- alça de 44px num bloco de 30px ----------
  await abrir("caso=curto&celular=1&aberta=musica", 375, 812, true);
  // O bloco curto (0,75s × 40px/s = 30px) é o segundo da faixa de música. Leva ele pro centro.
  await avaliar("(() => { const b = window.__linha; return true; })()");
  const curto = await caixa(seletorBloco("musica", 1));
  conferir(!!curto && Math.round(curto.w) === 30, "bloco curto com 30px", curto && Math.round(curto.w));
  await avaliar(`document.querySelector('[data-rolagem]').scrollLeft += ${curto.cx - 187.5}`);
  await esperar(300);
  const curto2 = await caixa(seletorBloco("musica", 1));
  await tocar(curto2.cx, curto2.cy);
  const alcas = await avaliar(`[...document.querySelectorAll('${seletorBloco("musica", 1)} [data-alvo^="alca"]')].map(a => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`);
  conferir(alcas.length === 2 && alcas.every(([w, h]) => w === 44 && h >= 44), "alças de 44×44 mesmo no bloco de 30px", JSON.stringify(alcas));

  // ---------- dedo: rolar, selecionar, mover ----------
  await abrir("caso=seis&celular=1&aberta=musica", 375, 812, true);
  if (process.env.DEPURAR) await avaliar("window.__p=[]; ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel'].forEach(t=>document.addEventListener(t,e=>__p.push(t+':'+(e.pointerId??'')+':'+((e.target.closest&&e.target.closest('[data-alvo]')?.dataset.alvo)||e.target.tagName)),true)); true");
  const m0 = await caixa(seletorBloco("musica", 0));
  const antes = await L();
  const r0 = await rolagem();
  let n = await nEventos();
  await arrastar(m0.cx, m0.cy, m0.cx - 120, m0.cy);
  const r1 = await rolagem();
  const depoisRolar = await L();
  const ev1 = await eventosDesde(n);
  conferir(Math.abs(r1 - r0) > 40 && !ev1.some((e) => e.tipo === "confirmar") && igualAudios(antes, depoisRolar), "deslizar num bloco NÃO selecionado rola a linha e não mexe nele", `rolou ${Math.round(r1 - r0)}px`);
  conferir(ev1.some((e) => e.tipo === "buscar" && e.dado.origem === "rolagem"), "e a rolagem da pessoa busca o tempo");

  const tAntes = (await L()).tempo;
  const m1 = await caixa(seletorBloco("musica", 0));
  const alvoToque = Math.min(Math.max(m1.x + 60, 100), 340);
  n = await nEventos();
  await tocar(alvoToque, m1.cy);
  const sel = await L();
  if (process.env.DEPURAR) console.log("      eventos do toque:", JSON.stringify(await eventosDesde(n)), JSON.stringify(await avaliar("__p.splice(0)")), "alvo", alvoToque, m1);
  conferir(sel.selecao?.faixa === "musica" && sel.selecao.id === "mus00001" && Math.abs(sel.tempo - tAntes) < 0.01, "toque no bloco seleciona e NÃO anda o tempo", JSON.stringify(sel.selecao));

  const m2 = await caixa(seletorBloco("musica", 0));
  const x0 = Math.min(Math.max(m2.x + 60, 100), 300);
  n = await nEventos();
  await arrastar(x0, m2.cy, x0 + 44, m2.cy);
  const ev2 = await eventosDesde(n);
  const conf = ev2.find((e) => e.tipo === "confirmar");
  conferir(!!conf && conf.dado.g.tipo === "mover" && conf.dado.mudou, "deslizar no bloco selecionado MOVE o bloco", conf && JSON.stringify(conf.dado.g));
  const movido = (await L()).estado.audios.find((a) => a.id === "mus00001");
  conferir(!!movido && movido.noVideo > 0.5, "e o estado guarda o lugar novo", movido?.noVideo);

  // ---------- fundo vazio, tira fina, régua, segurar ----------
  // Fundo vazio: vale só se HAVIA seleção (senão passa sem provar nada). O vão entre os dois
  // trechos de música vai pro centro, e o toque cai nele (o cabeçote não pega toque).
  const tinhaSelecao = (await L()).selecao !== null;
  // Um ponto onde o que está embaixo do dedo é o FUNDO da faixa (não bloco, não alça -- a
  // alça do selecionado passa 22px pra fora do bloco, por cima do vão).
  const acharVazio = () => avaliar(`(() => { const f = document.querySelector('[data-alvo="faixa-vazia"][data-faixa="musica"]'); const r = f.getBoundingClientRect(); const y = r.top + r.height / 2; for (let x = 100; x <= 340; x += 2) { const e = document.elementFromPoint(x, y); if (e && e.closest("[data-alvo]")?.dataset.alvo === "faixa-vazia") return { x, y }; } return null; })()`);
  let vazio = await acharVazio();
  for (let tentativa = 0; !vazio && tentativa < 3; tentativa++) {
    // Rola com o DEDO na régua (rolagem da pessoa: o tempo acompanha), devagar e com pausa
    // antes de soltar, pra não ter embalo.
    const rg = await caixa('[data-alvo="regua"]');
    await arrastar(260, rg.cy, 110, rg.cy, { passos: 16, depois: 350 });
    await esperar(300);
    vazio = await acharVazio();
  }
  if (vazio && tinhaSelecao) {
    await tocar(vazio.x, vazio.y);
    conferir((await L()).selecao === null, "toque no fundo vazio da faixa tira a seleção (havia seleção antes)");
  } else conferir(false, "montar o toque no fundo vazio", `vazio ${JSON.stringify(vazio)}, seleção antes ${tinhaSelecao}`);

  const tira = await caixa('[data-alvo="faixa-fina"][data-faixa="legendas"]');
  await tocar(187, tira.cy);
  conferir((await L()).faixaAberta === "legendas", "toque na tira fina abre aquela faixa");

  const regua = await caixa('[data-alvo="regua"]');
  const zoomAgora = (await L()).zoom;
  const tRegua0 = (await rolagem()) / zoomAgora;
  n = await nEventos();
  if (process.env.DEPURAR) console.log("      régua:", JSON.stringify(regua), "no ponto:", await avaliar(`(() => { const e = document.elementFromPoint(267, ${regua.cy}); return e.tagName + ' ' + (e.closest('[data-alvo]')?.dataset.alvo ?? '') + ' ' + (e.getAttribute('aria-label') ?? ''); })()`), "botões:", JSON.stringify(await avaliar("[...document.querySelectorAll('[data-area=linha] button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })")));
  await tocar(187 + 80, regua.cy);
  await esperar(500);
  const ev3 = await eventosDesde(n);
  if (process.env.DEPURAR) console.log("      eventos da régua:", JSON.stringify(ev3), JSON.stringify(await avaliar("__p.splice(0)")));
  const busca = ev3.find((e) => e.tipo === "buscar" && e.dado.origem === "regua");
  conferir(!!busca && Math.abs(busca.dado.t - (tRegua0 + 80 / zoomAgora)) < 0.15, "toque na régua leva o cursor pro ponto tocado", busca && `${busca.dado.t.toFixed(2)} (esperado ${(tRegua0 + 80 / zoomAgora).toFixed(2)})`);

  const cena = await caixa(seletorBloco("cenas", 1));
  n = await nEventos();
  await segurar(Math.min(Math.max(cena.cx, 100), 345), cena.cy, 650);
  const ev4 = await eventosDesde(n);
  conferir(ev4.some((e) => e.tipo === "menu" && e.dado.ref.faixa === "cenas"), "segurar 450ms num bloco abre o menu dele");
  conferir(!ev4.some((e) => e.tipo === "selecionar"), "e segurar não vira toque");

  // ---------- segundo dedo cancela o arraste ----------
  await abrir("caso=seis&celular=1&aberta=musica", 375, 812, true);
  const b0 = await caixa(seletorBloco("musica", 0));
  const bx = Math.min(Math.max(b0.x + 60, 100), 300);
  await tocar(bx, b0.cy);
  n = await nEventos();
  await toque([[bx, b0.cy]], "touchStart");
  for (let i = 1; i <= 6; i++) { await toque([[bx + i * 6, b0.cy]], "touchMove"); await esperar(16); }
  const fantasmaNoArraste = await avaliar("document.querySelector('[data-fantasma]').style.display");
  await toque([[bx + 36, b0.cy], [bx + 36, b0.cy - 60]], "touchStart");
  await esperar(40);
  await toque([[bx + 60, b0.cy], [bx + 36, b0.cy - 60]], "touchMove");
  await toque([], "touchEnd");
  await esperar(300);
  const ev5 = await eventosDesde(n);
  const fantasmaDepois = await avaliar("document.querySelector('[data-fantasma]').style.display");
  conferir(fantasmaNoArraste === "block" && fantasmaDepois === "none" && !ev5.some((e) => e.tipo === "confirmar"), "segundo dedo cancela o arraste (fantasma some, nada é confirmado)", `${fantasmaNoArraste} -> ${fantasmaDepois}`);

  // ---------- guia de encaixe ----------
  await abrir("caso=seis&celular=1&aberta=musica", 375, 812, true);
  // O segundo trecho de música começa em 10s; o primeiro vai de 0 a 8. Arrastar o primeiro
  // até a borda direita ficar a ~0,15s do 10 (6px a 40px/s) tem que grudar no 10.
  await avaliar("document.querySelector('[data-rolagem]').scrollLeft = 6 * window.__linha.zoom");
  await esperar(400);
  const e0 = await caixa(seletorBloco("musica", 0));
  const ex = Math.min(Math.max(e0.x + e0.w - 60, 100), 330);
  await tocar(ex, e0.cy);
  const z = (await L()).zoom;
  const alvoPx = (2 - 0.15) * z;
  n = await nEventos();
  await toque([[ex, e0.cy]], "touchStart");
  for (let i = 1; i <= 10; i++) { await toque([[ex + (alvoPx * i) / 10, e0.cy]], "touchMove"); await esperar(16); }
  const guiaVisivel = await avaliar("document.querySelector('[data-guia]').style.display");
  await toque([], "touchEnd");
  await esperar(300);
  const ev6 = await eventosDesde(n);
  const c6 = ev6.find((e) => e.tipo === "confirmar");
  conferir(guiaVisivel === "block" && !!c6 && Math.abs(c6.dado.ate - 10) < 0.011, "a 6px de outro bloco a borda gruda e a guia aparece", c6 && `fim ${c6.dado.ate}, guia ${c6.dado.guia}`);

  // ---------- tocando: rolagem programada não pausa; a da pessoa pausa ----------
  await abrir("caso=seis&celular=1&aberta=musica", 375, 812, true);
  const play = await caixa('[data-area=linha] button[aria-label="Tocar"]');
  const s0 = await rolagem();
  n = await nEventos();
  await tocar(play.cx, play.cy);
  await esperar(1200);
  const s1 = await rolagem();
  const ev7 = await eventosDesde(n);
  conferir(s1 - s0 > 20 && !ev7.some((e) => e.tipo === "tocar" && e.dado === false), "tocando, a linha anda sozinha e isso NÃO pausa", `andou ${Math.round(s1 - s0)}px`);
  const alvo7 = await caixa('[data-alvo="faixa-vazia"][data-faixa="musica"]');
  n = await nEventos();
  await arrastar(250, alvo7.cy, 120, alvo7.cy, { passos: 8 });
  const ev8 = await eventosDesde(n);
  conferir(ev8.some((e) => e.tipo === "tocar" && e.dado === false), "o dedo rolando a linha durante o Play pausa");

  // ---------- pinça e Ajustar ----------
  await abrir("caso=seis&celular=1&aberta=musica", 375, 812, true);
  const antesP = await L();
  const tCentro0 = (await rolagem()) / antesP.zoom;
  const faixaM = await caixa('[data-alvo="faixa-vazia"][data-faixa="musica"]');
  await toque([[160, faixaM.cy - 30], [215, faixaM.cy - 30]], "touchStart");
  for (let i = 1; i <= 10; i++) { await toque([[160 - i * 6, faixaM.cy - 30], [215 + i * 6, faixaM.cy - 30]], "touchMove"); await esperar(20); }
  await toque([], "touchEnd");
  await esperar(400);
  const depoisP = await L();
  const pxs = await avaliar("getComputedStyle(document.querySelector('[data-area=linha]')).getPropertyValue('--pxs')");
  const tCentro1 = (await rolagem()) / depoisP.zoom;
  conferir(depoisP.zoom > antesP.zoom * 1.5 && parseFloat(pxs) === depoisP.zoom, "pinça abre o zoom e --pxs acompanha", `${antesP.zoom} -> ${depoisP.zoom} (--pxs ${pxs.trim()})`);
  conferir(Math.abs(tCentro1 - tCentro0) < 0.1, "e o segundo embaixo do cabeçote é o mesmo", `${tCentro0.toFixed(2)} -> ${tCentro1.toFixed(2)}`);

  const ajustar = await caixa('[data-area=linha] button[aria-label="Ajustar à tela"]');
  await tocar(ajustar.cx, ajustar.cy);
  const aj = await L();
  const larg = await avaliar("document.querySelector('[data-rolagem]').clientWidth");
  const conteudo = await avaliar("document.querySelector('[data-rolagem] .relative.shrink-0').getBoundingClientRect().width");
  conferir(Math.abs(conteudo - (larg - 32)) < 2, "Ajustar: o vídeo inteiro cabe na largura (menos 32px)", `${Math.round(conteudo)}px em ${larg}px, zoom ${aj.zoom.toFixed(2)}`);
  conferir((await avaliar("document.documentElement.scrollWidth")) === 375, "depois de tudo, a página continua sem rolar de lado");

  ws.close();
} catch (e) {
  console.log("FALHA", e instanceof Error ? e.message : e);
  falhas++;
} finally {
  fechar();
}

function igualAudios(a, b) {
  return JSON.stringify(a.estado.audios) === JSON.stringify(b.estado.audios);
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
