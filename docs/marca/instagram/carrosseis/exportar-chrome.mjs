// Exporta cada slide de um carrossel como PNG 1080x1350, pelo Chrome já instalado.
//
// Faz o mesmo que exportar.py, sem Playwright: o Node 24 já tem WebSocket e fetch, e o
// Chrome aceita ser dirigido pelo protocolo de depuração (CDP). Nada pra instalar.
//
//   node exportar-chrome.mjs 01-antes-e-depois/carrossel.html [outro.html ...]
//
// Confere o que costuma falhar calado: a fonte Geist carregou (sem ela o slide sai na fonte
// do sistema e ninguém repara) e o PNG saiu com 1080x1350.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const LARGURA = 420;
const ALTURA = 525;
const ESCALA = 1080 / 420;

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  console.error("Uso: node exportar-chrome.mjs <pasta>/carrossel.html [...]");
  process.exit(1);
}

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chrome = CHROMES.find((c) => fs.existsSync(c));
if (!chrome) throw new Error(`Chrome não encontrado. Tentei: ${CHROMES.join(", ")}`);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PORTA = 9400 + Math.floor(Math.random() * 400);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "encena-carrossel-"));
const processo = spawn(chrome, ["--headless=new", `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

function fechar() {
  try { processo.kill(); } catch { /* já saiu */ }
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Chrome ainda segura um arquivo */ }
}

async function alvo() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) return await r.json();
    } catch { /* ainda subindo */ }
    await esperar(100);
  }
  throw new Error("O Chrome não abriu a porta de depuração.");
}

/** Tamanho real do PNG, lido do cabeçalho IHDR. */
function tamanhoPng(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

let falhas = 0;
try {
  const t = await alvo();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
  let id = 0;
  const pendentes = new Map();
  const eventos = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendentes.has(d.id)) { pendentes.get(d.id)(d); pendentes.delete(d.id); }
    else if (d.method) eventos.push(d.method);
  };
  const cdp = (method, params = {}) => new Promise((r, x) => {
    const n = ++id;
    pendentes.set(n, (d) => (d.error ? x(new Error(`${method}: ${d.error.message}`)) : r(d.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const avaliar = async (expressao) => (await cdp("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true })).result.value;

  await cdp("Page.enable");
  // Página ampliada por CSS `zoom` na escala final, e não densidade de pixel 2,57: com a
  // densidade, o texto é medido a 11px e cada letra cai em pixel inteiro -- "es tar",
  // "ilus trativa". Com o zoom, a mesma letra é medida a 28px e o espaçamento sai certo.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1350, deviceScaleFactor: 1, mobile: false });

  for (const arq of arquivos) {
    const html = path.resolve(arq);
    const pasta = path.dirname(html);
    const texto = fs.readFileSync(html, "utf8");
    const total = Number(/<meta\s+name="total-slides"\s+content="(\d+)"/.exec(texto)?.[1] ?? 0);
    if (!total) { console.log(`FALHA ${arq}: sem <meta name="total-slides">`); falhas++; continue; }

    eventos.length = 0;
    await cdp("Page.navigate", { url: pathToFileURL(html).href });
    for (let i = 0; i < 200 && !eventos.includes("Page.loadEventFired"); i++) await esperar(50);
    await avaliar(`document.body.classList.add('exportando'); document.body.style.zoom = "${ESCALA}"; document.fonts.ready.then(() => true)`);
    await esperar(3000);
    const fonte = await avaliar("document.fonts.check('700 30px Geist') && [...document.fonts].some(f => f.family.replace(/\"/g,'') === 'Geist' && f.status === 'loaded')");
    if (!fonte) { console.log(`FALHA ${arq}: a fonte Geist não carregou (sem internet?) -- os PNGs sairiam com a fonte do sistema`); falhas++; continue; }

    for (let i = 0; i < total; i++) {
      await avaliar(`(() => { const t = document.querySelector('.carousel-track'); t.style.transition = 'none'; t.style.transform = 'translateX(${-i * LARGURA}px)'; return true; })()`);
      await esperar(150);
      const { data } = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1080, height: 1350, scale: 1 } });
      const buf = Buffer.from(data, "base64");
      const saida = path.join(pasta, `slide_${i + 1}.png`);
      fs.writeFileSync(saida, buf);
      const { w, h } = tamanhoPng(buf);
      const ok = w === 1080 && h === 1350;
      if (!ok) falhas++;
      console.log(`${ok ? "ok   " : "FALHA"} ${path.basename(pasta)}/slide_${i + 1}.png · ${w}x${h} · ${Math.round(buf.length / 1024)} KB`);
    }
  }
  ws.close();
} finally {
  fechar();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo exportado");
process.exit(falhas ? 1 : 0);
