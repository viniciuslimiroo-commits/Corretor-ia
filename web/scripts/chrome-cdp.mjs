// O Chrome instalado, dirigido por CDP, pros testes de navegador (sem Puppeteer: o Node 24
// já tem WebSocket e fetch). Abre um Chrome sem janela com perfil temporário e devolve
// `cdp(método, parâmetros)`, `avaliar(expressão)` e `fechar()`.
//
// Os testes antigos (conferir-previa-no-navegador.mjs, conferir-faixas-no-navegador.mjs)
// têm a mesma coisa escrita dentro; os novos usam este.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function abrirChrome({ ver = false, prefixo = "encena-teste-" } = {}) {
  const chromes = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const chrome = chromes.find((c) => fs.existsSync(c));
  if (!chrome) throw new Error(`Chrome não encontrado. Tentei: ${chromes.join(", ")}`);
  const porta = 9800 + Math.floor(Math.random() * 150);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  const processo = spawn(
    chrome,
    [ver ? null : "--headless=new", `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank"].filter(Boolean),
    { stdio: "ignore" }
  );
  const fechar = () => {
    try { processo.kill(); } catch { /* já saiu */ }
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o temp resolve */ }
  };
  let alvo = null;
  for (let i = 0; i < 100 && !alvo; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) alvo = await r.json();
    } catch { /* subindo */ }
    if (!alvo) await esperar(100);
  }
  if (!alvo) {
    fechar();
    throw new Error("O Chrome não abriu a porta de depuração.");
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendentes.has(d.id)) { pendentes.get(d.id)(d); pendentes.delete(d.id); }
  };
  const cdp = (method, params = {}) => new Promise((r, x) => {
    const n = ++id;
    pendentes.set(n, (d) => (d.error ? x(new Error(`${method}: ${d.error.message}`)) : r(d.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const avaliar = async (expressao) => {
    const r = await cdp("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expressao.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  await cdp("Page.enable");
  return {
    cdp,
    avaliar,
    fechar: () => {
      try { ws.close(); } catch { /* fechado */ }
      fechar();
    },
    /** Abre a página no tamanho pedido (celular = toque emulado) e espera `pronto` ser verdade. */
    async abrir(url, { largura, altura, celular, pronto = "document.readyState === 'complete'" }) {
      await cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: celular ? 2 : 1, mobile: !!celular });
      await cdp("Emulation.setTouchEmulationEnabled", { enabled: !!celular, maxTouchPoints: celular ? 5 : 1 });
      await cdp("Page.navigate", { url });
      for (let i = 0; i < 150; i++) {
        await esperar(100);
        try {
          if (await avaliar(pronto)) break;
        } catch { /* ainda carregando */ }
      }
      await esperar(500);
    },
  };
}
