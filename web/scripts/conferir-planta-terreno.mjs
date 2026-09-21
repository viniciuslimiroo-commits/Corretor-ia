// A BORRACHA APAGA, O CÔMODO FECHA, E O TERRENO TEM VOLTAR/SEGUIR.
//
// 21/09/2026, três coisas que ele relatou na mesma tarde:
//   - "a parte de apagar não funciona" -> a borracha usava o ponto de DESENHO, que gruda
//     na parede; tocando perto da linha o ponto saía do cômodo e nada era apagado. E móvel
//     ela nunca apagou.
//   - "desenhei um retângulo mas depois vi que não estavam ligadas" -> fechar o cômodo era
//     tocar de novo no primeiro canto, e nada na tela dizia isso.
//   - "colocar opção de voltar e seguir aparente" no terreno.
//
//   BASE=http://localhost:3000 node scripts/conferir-planta-terreno.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-planta-"));
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
const foto = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const apontar = async (x, y, botao = "left") => {
  if (botao === "right") {
    // O `Input.dispatchMouseEvent` do CDP NÃO sintetiza `contextmenu` -- quem gera esse
    // evento é a camada nativa do sistema, que aqui não existe (medido: o clique direito
    // chegava e o menu nunca disparava). Então o evento vai no elemento que está DEBAIXO
    // do ponto: a geometria continua sendo a de verdade, só a origem é script.
    const achou = await c.avaliar(`(() => {
      const el = document.elementFromPoint(${x}, ${y});
      if (!el) return false;
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, button: 2 }));
      return true;
    })()`);
    if (!achou) console.log("     (nada debaixo de " + x + "," + y + ")");
    return;
  }
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
const arrastar = async (x0, y0, x1, y1) => {
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0, button: "none", buttons: 0 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) {
    await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + ((x1 - x0) * i) / 6, y: y0 + ((y1 - y0) * i) / 6, button: "left", buttons: 1 });
    await esperar(40);
  }
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button: "left", clickCount: 1 });
};
const chip = async (texto) =>
  c.avaliar(`(() => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === ${JSON.stringify(texto)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
const caixa = async () => c.avaliar(`(() => { const e = document.querySelector('[data-caixa]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
/** Quantos cômodos estão desenhados: cada um tem um polígono preenchido no SVG da prévia. */
const comodos = async () => c.avaliar(`document.querySelectorAll('[data-caixa] svg path[fill]:not([fill="none"])').length`);

await c.abrir(`${BASE}/login`, { largura: 1280, altura: 950 });
await c.avaliar(`localStorage.setItem('sb-${REF}-auth-token', ${JSON.stringify(JSON.stringify(sessao))})`);

// ---------------- PLANTA ----------------
await c.abrir(`${BASE}/planta`, { largura: 1280, altura: 950, pronto: "!!document.querySelector('[data-caixa]')" });
await esperar(2500);
const cx = await caixa();
conferir(!!cx, "planta: a caixa de desenho está na tela");
if (cx) {
  const antes = await comodos();
  const ret = await chip("Retângulo");
  if (ret) await apontar(ret.x, ret.y);
  await esperar(400);
  await arrastar(cx.x + cx.w * 0.25, cx.y + cx.h * 0.25, cx.x + cx.w * 0.65, cx.y + cx.h * 0.6);
  await esperar(700);
  const depoisDeDesenhar = await comodos();
  conferir(depoisDeDesenhar > antes, "planta: o retângulo virou cômodo", `${antes} -> ${depoisDeDesenhar}`);
  await foto("planta-1-comodo");

  // a borracha, tocando PERTO DA PAREDE -- o caso que não funcionava
  const apagar = await chip("Apagar");
  conferir(!!apagar, "planta: a ferramenta Apagar existe");
  if (apagar) await apontar(apagar.x, apagar.y);
  await esperar(400);
  await apontar(Math.round(cx.x + cx.w * 0.45), Math.round(cx.y + cx.h * 0.25) + 2); // em cima da parede de cima
  await esperar(700);
  const depoisDeApagar = await comodos();
  conferir(depoisDeApagar < depoisDeDesenhar, "planta: a borracha apaga tocando NA PAREDE do cômodo", `${depoisDeDesenhar} -> ${depoisDeApagar}`);
  await foto("planta-2-apagado");

  // o alvo de fechar o cômodo livre
  const livre = await chip("Cômodo livre");
  if (livre) await apontar(livre.x, livre.y);
  await esperar(400);
  const cantos = [
    [0.3, 0.3],
    [0.6, 0.3],
    [0.6, 0.55],
  ];
  for (const [fx, fy] of cantos) {
    await apontar(Math.round(cx.x + cx.w * fx), Math.round(cx.y + cx.h * fy));
    await esperar(350);
  }
  const alvo = await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].find((el) => el.title === 'Fechar o cômodo aqui'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), tam: Math.round(r.width) }; })()`);
  conferir(!!alvo, "planta: com 3 cantos aparece o alvo de FECHAR no primeiro canto", alvo ? `${alvo.tam}px` : "não apareceu");
  await foto("planta-3-alvo-de-fechar");

  if (alvo) {
    await apontar(alvo.x, alvo.y);
    await esperar(700);
    conferir((await comodos()) > depoisDeApagar, "planta: clicar no alvo fecha o cômodo");
  }

  // botão direito tira o último canto. DEPOIS de fechar, com um rascunho novo: tirar canto
  // antes fazia o alvo sumir (ele só existe com 3) e o teste do fechar media o alvo velho.
  const cantosDireito = await c.avaliar(`document.querySelectorAll('[data-caixa] > span.rounded-full').length`);
  for (const [fx, fy] of [[0.72, 0.3], [0.85, 0.45]]) {
    await apontar(Math.round(cx.x + cx.w * fx), Math.round(cx.y + cx.h * fy));
    await esperar(350);
  }
  const antesDireito = await c.avaliar(`document.querySelectorAll('[data-caixa] > span.rounded-full').length`);
  conferir(antesDireito > cantosDireito, "planta: dois cantos novos entraram no rascunho", `${cantosDireito} -> ${antesDireito}`);
  await apontar(Math.round(cx.x + cx.w * 0.85), Math.round(cx.y + cx.h * 0.45), "right");
  await esperar(500);
  const depoisDireito = await c.avaliar(`document.querySelectorAll('[data-caixa] > span.rounded-full').length`);
  conferir(depoisDireito < antesDireito, "planta: botão direito tira o último canto", `${antesDireito} -> ${depoisDireito}`);
}

// ---------------- TERRENO ----------------
await c.abrir(`${BASE}/terreno`, { largura: 1280, altura: 950, pronto: "document.body.innerText.includes('Terreno')" });
await esperar(2000);
const entrada = await c.avaliar(`!!document.querySelector('input[type=file]')`);
conferir(entrada, "terreno: a tela abriu com o campo de foto");
if (entrada) {
  const { root } = await c.cdp("DOM.getDocument", {});
  const { nodeId } = await c.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await c.cdp("DOM.setFileInputFiles", { nodeId, files: [path.join(RAIZ, "public", "exemplos", "casa-antes.jpg")] });
  await esperar(2500);
  const cxT = await c.avaliar(`(() => { const e = document.querySelector('[data-marcacao]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  conferir(!!cxT, "terreno: a foto entrou e a caixa de marcação apareceu");
  if (cxT) {
    for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7]]) {
      await apontar(Math.round(cxT.x + cxT.w * fx), Math.round(cxT.y + cxT.h * fy));
      await esperar(300);
    }
    // Conta os cantos NO DESENHO, não no rótulo: o texto muda de forma conforme o número
    // ("3 cantos · arraste" vs "Toque nos cantos (2/3…)"), e uma contagem que lê o rótulo
    // devolve zero justamente quando o desfazer funciona -- o contrário do que se quer medir.
    const contar = async () =>
      c.avaliar(`(() => {
        const p = document.querySelector('[data-marcacao] [points]');
        const v = (p && p.getAttribute('points') || '').trim();
        return v ? v.split(/\\s+/).length : 0;
      })()`);
    const tres = await contar();
    conferir(tres === 3, "terreno: três toques = três cantos", `${tres}`);
    const bVoltar = await chip("Voltar");
    const bSeguir = await chip("Seguir");
    conferir(!!bVoltar && !!bSeguir, "terreno: Voltar e Seguir estão à vista");
    await foto("terreno-1-tres-cantos");
    if (bVoltar) {
      await apontar(bVoltar.x, bVoltar.y);
      await esperar(500);
      conferir((await contar()) === 2, "terreno: Voltar tira um canto", `${await contar()}`);
      if (bSeguir) {
        await apontar(bSeguir.x, bSeguir.y);
        await esperar(500);
        conferir((await contar()) === 3, "terreno: Seguir devolve o canto", `${await contar()}`);
      }
    }
    await apontar(Math.round(cxT.x + cxT.w * 0.5), Math.round(cxT.y + cxT.h * 0.5), "right");
    await esperar(500);
    conferir((await contar()) === 2, "terreno: botão direito desfaz", `${await contar()}`);
    await foto("terreno-2-depois-do-direito");
  }
}

console.log(`\nfotos em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
