// VÍDEOS NA LINHA DO TEMPO, no navegador de verdade, com a conta de teste e os vídeos que
// ela já fez (Seus vídeos). Não grava nada: monta só na tela e NÃO gera.
//
// Computador (1280x800):
//   tocar num vídeo põe ele na linha (em partes seguidas, com corte seco, se passar de 8s);
//   o palco mostra o vídeo DE VERDADE (um <video> com o arquivo);
//   dois vídeos seguidos; arrastar um terceiro pro COMEÇO da linha põe ele ali;
//   duplicar, apagar e desfazer pelos ajustes da cena; S divide no cursor;
//   velocidade 2x pela barra; arrastar a BORDA de trás muda a duração;
//   arrastar o bloco muda a ordem; Play anda o vídeo do palco;
//   "⋯ > Assistir" abre a janela do vídeo e o Esc fecha; nada vaza pro lado; nenhum erro.
// Celular (375x812):
//   ferramenta Vídeos abre a folha; tocar põe na linha; a folha fecha no ✕; tocar no bloco
//   mostra a barra com Ajustes; Ajustes abre a folha da cena; dedo segurado no bloco abre a
//   folha de ações com Cancelar.
//
//   BASE=http://localhost:3002 CONTA=limiro.cardoso@outlook.com node scripts/conferir-editor-videos.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-videos-"));
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

const c = await abrirChrome();
// O selo "N" do modo de desenvolvimento fica em cima da primeira ferramenta do celular: some
// da tela (continua lá pra conferir erros). E cada erro da página fica anotado.
await c.cdp("Page.addScriptToEvaluateOnNewDocument", {
  source:
    "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); }); window.__erros = []; addEventListener('error', e => window.__erros.push('erro: ' + (e.message || e.type))); addEventListener('unhandledrejection', e => window.__erros.push('promessa: ' + (e.reason && e.reason.message || e.reason)));",
});
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const mouse = async (tipo, x, y, botoes = 0) => c.cdp("Input.dispatchMouseEvent", { type: tipo, x, y, button: tipo === "mouseMoved" && !botoes ? "none" : "left", buttons: botoes, clickCount: 1 });
const clicar = async (x, y) => {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, 1);
  await mouse("mouseReleased", x, y);
  await esperar(250);
};
const arrastar = async (x0, y0, x1, y1, passos = 12) => {
  await mouse("mouseMoved", x0, y0);
  await mouse("mousePressed", x0, y0, 1);
  for (let i = 1; i <= passos; i++) {
    await mouse("mouseMoved", x0 + ((x1 - x0) * i) / passos, y0 + ((y1 - y0) * i) / passos, 1);
    await esperar(16);
  }
  await mouse("mouseReleased", x1, y1);
  await esperar(400);
};
const toque = (pontos, tipo) => c.cdp("Input.dispatchTouchEvent", { type: tipo, touchPoints: pontos.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
const tocar = async (x, y, ms = 60) => {
  await toque([[x, y]], "touchStart");
  await esperar(ms);
  await toque([], "touchEnd");
  await esperar(350);
};
const tecla = async (key, code, vk, mod = 0) => {
  await c.avaliar("document.activeElement?.blur?.()");
  await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mod });
  await c.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mod });
  await esperar(300);
};
// Mede sem rolar nada (a régua, os blocos): rolar a linha pra medir mudava onde as coisas estavam.
const medir = (sel) => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const caixa = (sel) => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const botaoComTexto = (t) => c.avaliar(`(() => { const L = String.fromCharCode(10); const b = [...document.querySelectorAll('button')].filter(e => e.getClientRects().length).find(e => (e.innerText || '').trim().split(L)[0].trim() === ${JSON.stringify(t)} || e.getAttribute('aria-label') === ${JSON.stringify(t)}); if (!b) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const texto = () => c.avaliar("document.body.innerText");
const espec = () => c.avaliar("window.__encenaEditor?.espec?.() ?? null");
// As cenas na trilha (sem a tela final), da esquerda pra direita.
const blocosCena = () =>
  c.avaliar(`[...document.querySelectorAll('[data-area="linha"] [data-alvo="bloco"]')].filter(b => !b.closest('[data-faixa]') && b.dataset.chave?.startsWith('cenas:')).map(b => { const r = b.getBoundingClientRect(); return { chave: b.dataset.chave, video: b.dataset.video === '1', sel: b.dataset.selecionado === '1', x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }).filter(b => b.w > 0).sort((a, b) => a.x - b.x)`);
const erros = () => c.avaliar("(window.__erros || []).splice(0)");
const esperarAte = async (cond, ms = 12000) => {
  for (let i = 0; i < ms / 200; i++) {
    if (await c.avaliar(cond)) return true;
    await esperar(200);
  }
  return false;
};
const soVideos = (e) => (e?.cenas ?? []).filter((x) => x.tipo === "clipe" && /\/videos\/[0-9a-f-]{36}\.mp4$/.test(x.arquivo ?? ""));

async function entrar(largura, altura, celular) {
  await c.abrir(`${BASE}/login`, { largura, altura, celular });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura, altura, celular, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(600);
}

try {
  // ======================= COMPUTADOR =======================
  await entrar(1280, 800, false);
  const aba = await botaoComTexto("Vídeos");
  await clicar(aba.x, aba.y);
  const temVideos = await esperarAte("document.querySelectorAll('[data-video-id]:not([disabled])').length >= 3");
  conferir(temVideos, "aba Vídeos: os vídeos prontos da conta aparecem, com miniatura");
  await shot("v1-aba-videos");

  // 1) tocar no primeiro vídeo
  const primeiro = await caixa("[data-video-id]:not([disabled])");
  await clicar(primeiro.cx, primeiro.cy);
  const entrou = await esperarAte("[...document.querySelectorAll('[data-area=\"linha\"] [data-alvo=\"bloco\"]')].some(b => b.dataset.video === '1')");
  const e1 = await espec();
  const v1 = soVideos(e1);
  conferir(entrou && v1.length >= 1 && (await texto()).includes("Vídeo adicionado"), "tocar no vídeo: ele ENTRA na linha do tempo (antes não acontecia nada) e o aviso diz", `${v1.length} parte(s) · ${v1.map((x) => `${x.duracao}s@${x.inicio ?? 0}`).join(" + ")}`);
  if (v1.length > 1) {
    const seguidas = v1.every((x, i) => i === 0 || Math.abs((x.inicio ?? 0) - ((v1[i - 1].inicio ?? 0) + v1[i - 1].duracao)) < 0.15);
    conferir(seguidas && v1.slice(0, -1).every((x) => x.transicao === "corte"), "vídeo longo: partes seguidas do mesmo arquivo, com corte seco entre elas (emenda sem soluço)");
  }
  const noPalco = await esperarAte("(() => { const v = document.querySelector('[data-video-palco]'); return !!v && v.readyState >= 1 && v.videoWidth > 0; })()", 15000);
  conferir(noPalco, "o palco mostra o VÍDEO de verdade (arquivo carregado), não um retângulo com aviso", await c.avaliar("(() => { const v = document.querySelector('[data-video-palco]'); return v ? `${v.videoWidth}x${v.videoHeight}, ${v.duration?.toFixed?.(1)}s` : 'sem <video>'; })()"));
  await shot("v2-video-na-linha");

  // 2) segundo vídeo, no fim
  const todos = await c.avaliar("[...document.querySelectorAll('[data-video-id]:not([disabled])')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.videoId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })");
  const antes2 = (await espec()).cenas.length;
  await clicar(todos[1].cx, todos[1].cy);
  await esperarAte(`(window.__encenaEditor?.espec?.()?.cenas?.length ?? 0) > ${antes2}`);
  const e2 = await espec();
  conferir(e2.cenas.length > antes2 && e2.cenas.at(-1).arquivo.includes(todos[1].id), "segundo vídeo: entra DEPOIS do primeiro", `${antes2} -> ${e2.cenas.length} cenas`);

  // 3) arrastar o terceiro pro começo da linha (solta antes da primeira cena)
  const bl = await blocosCena();
  const alvo = bl[0];
  const antes3 = e2.cenas.length;
  await c.avaliar(`(() => {
    const dt = new DataTransfer();
    dt.setData('text/encena-video', ${JSON.stringify(todos[2].id)});
    window.__dt = dt;
    const trilha = document.querySelector('[data-alvo="cenas-fundo"]');
    const x = ${alvo.x + 4}, y = ${alvo.cy};
    trilha.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    trilha.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  })()`);
  await esperar(150);
  const indicador = await c.avaliar("!!document.querySelector('[data-soltura]')");
  await c.avaliar(`(() => { const trilha = document.querySelector('[data-alvo="cenas-fundo"]'); trilha.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientX: ${alvo.x + 4}, clientY: ${alvo.cy} })); })()`);
  await esperarAte(`(window.__encenaEditor?.espec?.()?.cenas?.length ?? 0) > ${antes3}`);
  const e3 = await espec();
  conferir(indicador, "arrastando por cima da linha, uma marca coral mostra ONDE o vídeo vai entrar");
  conferir(e3.cenas.length > antes3 && e3.cenas[0].arquivo.includes(todos[2].id), "arrastar um vídeo pro começo da linha: ele entra ALI (antes da primeira cena)", `${antes3} -> ${e3.cenas.length}`);
  await shot("v3-tres-videos");

  // 4) duplicar, apagar e desfazer pelos ajustes da cena
  const blocos4 = await blocosCena();
  await clicar(blocos4[0].cx, blocos4[0].cy);
  await esperar(400);
  const n0 = (await espec()).cenas.length;
  const dup = await caixa('[data-inspetor] button[aria-label="Duplicar"]');
  if (dup) await clicar(dup.cx, dup.cy);
  await esperar(400);
  const n1 = (await espec()).cenas.length;
  const apagar = await caixa('[data-inspetor] button[aria-label="Apagar a cena"]');
  if (apagar) await clicar(apagar.cx, apagar.cy);
  await esperar(400);
  const n2 = (await espec()).cenas.length;
  await tecla("z", "KeyZ", 90, 2);
  const n3 = (await espec()).cenas.length;
  conferir(n1 === n0 + 1 && n2 === n0 && n3 === n0 + 1, "ajustes da cena: Duplicar (+1), Apagar (−1) e Ctrl+Z (volta) respondem", `${n0} → ${n1} → ${n2} → ${n3}`);

  // 5) S divide no cursor (o cursor dentro da cena selecionada)
  const blocos5 = await blocosCena();
  const b5 = blocos5.find((b) => b.w > 90) ?? blocos5[0];
  await clicar(b5.cx, b5.cy);
  const regua = await medir('[data-alvo="regua"]');
  await clicar(b5.x + b5.w * 0.55, regua.cy);
  await clicar(b5.cx, b5.cy);
  const s0 = (await espec()).cenas.length;
  await tecla("s", "KeyS", 83);
  const s1 = (await espec()).cenas.length;
  conferir(s1 === s0 + 1, "S com o cursor dentro da cena: divide em duas", `${s0} → ${s1} · ${(await texto()).match(/Cena dividida|Leve o cursor[^\n]*/)?.[0] ?? ""}`);

  // 6) velocidade 2x pela barra da seleção
  const blocos6 = await blocosCena();
  const b6 = blocos6.find((b) => b.video) ?? blocos6[0];
  await clicar(b6.cx, b6.cy);
  const vel = await caixa('[data-area="barra"] [data-acao="velocidade"]');
  if (vel) await clicar(vel.cx, vel.cy);
  await esperar(300);
  const dois = await botaoComTexto("2x");
  if (dois) await clicar(dois.x, dois.y);
  await esperar(300);
  const e6 = await espec();
  conferir(!!vel && e6.cenas.some((x) => x.velocidade === 2), "barra da seleção: Velocidade > 2x muda a cena de vídeo", vel ? "" : "sem botão Velocidade na barra");

  // 7) arrastar a borda de trás de uma cena muda a duração
  //
  // Este passo reprovou por MESES com "3s → 3s", e o defeito era daqui, não do app:
  //   a) `blocosCena()` inclui a TELA FINAL (ela também mora na faixa "cenas:", no fim) e
  //      a tela final não tem alça nenhuma, de propósito;
  //   b) o índice vinha da posição no array, não do "cenas:N" da chave;
  //   c) cena no piso de duração (LIMITES.duracaoMin = 3s) responde "3s → 3s" a qualquer
  //      arraste, e isso é o comportamento CERTO;
  //   d) "sem alça" e "arrastei e nada mudou" caíam no MESMO `conferir`, então a mensagem
  //      não dizia qual dos dois tinha acontecido.
  // Agora cada um desses é uma pergunta separada, e a cena é escolhida por ter de onde
  // encolher.
  const MIN_CENA = 3;
  const e7 = await espec();
  const b7 = (await blocosCena()).filter((b) => Number(b.chave.split(":")[1]) < e7.cenas.length).map((b) => ({ ...b, i: Number(b.chave.split(":")[1]) })).find((b) => (e7.cenas[b.i]?.duracao ?? 0) > MIN_CENA);
  conferir(!!b7, "achei uma cena com folga pra encolher", b7 ? `${b7.chave}, ${e7.cenas[b7.i].duracao}s` : `nenhuma acima de ${MIN_CENA}s`);
  if (b7) {
    await clicar(b7.cx, b7.cy);
    await esperar(250);
    const d0 = (await espec()).cenas[b7.i]?.duracao;
    const alca = await medir('[data-alvo="bloco"][data-selecionado="1"] [data-alvo="alca-fim"]');
    conferir(!!alca, "a cena selecionada mostra a alça de FIM", alca ? `${Math.round(alca.w)}px` : "não existe no DOM");
    const zoom = await c.avaliar("parseFloat(getComputedStyle(document.querySelector('[data-area=\"linha\"]')).getPropertyValue('--pxs'))");
    if (alca) {
      await arrastar(b7.x + b7.w - 2, b7.cy, b7.x + b7.w - 2 - zoom * (d0 - MIN_CENA) * 0.8, b7.cy);
      const d1 = (await espec()).cenas[b7.i]?.duracao;
      conferir(d1 !== undefined && d0 !== undefined && d1 < d0, "arrastar a BORDA de trás da cena encolhe a duração (como no CapCut)", `${d0}s → ${d1}s`);
    }
  }

  // 8) arrastar o bloco muda a ordem
  const blocos8 = await blocosCena();
  const ordem0 = (await espec()).cenas.map((x) => `${x.arquivo ?? x.jobId}@${x.inicio ?? 0}`);
  await clicar(blocos8[0].cx, blocos8[0].cy);
  await arrastar(blocos8[0].cx, blocos8[0].cy, blocos8[2].cx + 4, blocos8[2].cy, 20);
  const ordem1 = (await espec()).cenas.map((x) => `${x.arquivo ?? x.jobId}@${x.inicio ?? 0}`);
  const curto = (l) => l.map((k) => k.replace(/^.*\/([0-9a-f]{4})[^@]*/, "$1")).join(" ");
  conferir(ordem1[0] !== ordem0[0] && ordem1.length === ordem0.length, "arrastar a cena pela linha muda a ordem", `${curto(ordem0)} → ${curto(ordem1)} · de x=${Math.round(blocos8[0].cx)} até x=${Math.round(blocos8[2].cx)}`);
  await shot("v3b-depois-de-arrastar");

  // 9) Play: o vídeo do palco anda junto
  await tecla("Home", "Home", 36);
  await esperar(300);
  const t0 = await c.avaliar("document.querySelector('[data-video-palco]')?.currentTime ?? -1");
  const play = await caixa('[data-area="linha"] button[aria-label="Tocar"]');
  await clicar(play.cx, play.cy);
  await esperar(1800);
  const t1 = await c.avaliar("document.querySelector('[data-video-palco]')?.currentTime ?? -1");
  const tocandoAgora = await c.avaliar("!!document.querySelector('[data-area=\"linha\"] button[aria-label=\"Pausar\"]')");
  const pausa = await caixa('[data-area="linha"] button[aria-label="Pausar"]');
  if (pausa) await clicar(pausa.cx, pausa.cy);
  conferir(tocandoAgora && t1 > t0 + 0.4, "Play: o vídeo no palco anda junto com a linha do tempo", `${t0.toFixed?.(2)}s → ${t1.toFixed?.(2)}s`);

  // 10) "⋯ > Assistir" abre a janela; Esc fecha
  const mais = await caixa('button[aria-label^="Mais opções de"]');
  if (mais) await clicar(mais.cx, mais.cy);
  const assistir = await botaoComTexto("Assistir");
  if (assistir) await clicar(assistir.x, assistir.y);
  const abriu = await esperarAte("!!document.querySelector('[data-modal-video] video')", 10000);
  await shot("v4-assistir");
  await tecla("Escape", "Escape", 27);
  const fechou = await c.avaliar("!document.querySelector('[data-modal-video]')");
  conferir(abriu && fechou, "“⋯ > Assistir” abre a janela do vídeo; Esc fecha (nada fica preso na tela)");

  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "1280px: nada vaza pro lado");
  const er1 = await erros();
  conferir(er1.length === 0, "computador: nenhum erro na página", er1.join(" | "));

  // ======================= CELULAR =======================
  await entrar(375, 812, true);
  const ferramenta = await botaoComTexto("Vídeos");
  await tocar(ferramenta.x, ferramenta.y);
  const folha = await esperarAte("!!document.querySelector('[data-folha] [data-video-id]')");
  conferir(folha, "celular: a ferramenta Vídeos abre a FOLHA com os vídeos (não um painel espremido)");
  const card = await caixa("[data-folha] [data-video-id]:not([disabled])");
  await tocar(card.cx, card.cy);
  const entrouCel = await esperarAte("(window.__encenaEditor?.espec?.()?.cenas?.length ?? 0) > 0");
  conferir(entrouCel, "celular: tocar no vídeo põe ele na linha do tempo");
  await esperar(600);
  await shot("m1-folha-videos");
  const fechar = await caixa('[data-folha] button[aria-label="Fechar"]');
  await tocar(fechar.cx, fechar.cy);
  await esperar(400);
  const blocoCel = (await blocosCena())[0];
  await tocar(blocoCel.cx, blocoCel.cy);
  await esperar(400);
  const ajustes = await caixa('[data-area="barra"] [data-acao="ajustes_cena"]');
  conferir(!!ajustes, "celular: tocar no bloco troca as ferramentas pela barra da seleção, com Ajustes");
  if (ajustes) await tocar(ajustes.cx, ajustes.cy);
  const folhaCena = await esperarAte("!!document.querySelector('[data-folha] [data-inspetor]')");
  conferir(folhaCena, "celular: Ajustes abre os ajustes da cena na folha");
  await shot("m2-ajustes-da-cena");
  const fechar2 = await caixa('[data-folha] button[aria-label="Fechar"]');
  if (fechar2) await tocar(fechar2.cx, fechar2.cy);
  await esperar(400);
  const blocoCel2 = (await blocosCena())[0];
  await toque([[blocoCel2.cx, blocoCel2.cy]], "touchStart");
  await esperar(700);
  await toque([], "touchEnd");
  await esperar(400);
  const acoes = await c.avaliar("(() => { const m = document.querySelector('[role=menu]'); if (!m) return null; const r = m.getBoundingClientRect(); return { base: Math.round(r.bottom), largura: Math.round(r.width), cancelar: [...m.querySelectorAll('button')].some(b => b.innerText.trim() === 'Cancelar') }; })()");
  conferir(!!acoes && acoes.cancelar && acoes.largura >= 370 && acoes.base >= 800, "celular: dedo segurado no bloco abre a folha de ações (largura toda, no pé, com Cancelar)", JSON.stringify(acoes));
  await shot("m3-folha-de-acoes");
  const cancelar = await botaoComTexto("Cancelar");
  if (cancelar) await tocar(cancelar.x, cancelar.y);
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "375px: nada vaza pro lado");
  const er2 = await erros();
  conferir(er2.length === 0, "celular: nenhum erro na página", er2.join(" | "));
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
