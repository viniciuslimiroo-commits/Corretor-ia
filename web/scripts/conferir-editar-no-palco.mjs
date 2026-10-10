// CLICAR NO QUE APARECE NO PALCO abre a edição?
//
// Ele em 10/10/2026: "quando abro um vídeo no editor não consigo editar nome, lugar,
// legendas etc. que já estavam no vídeo" -- e, perguntado, escolheu "clico e não acontece
// nada". Lendo o código eu não acho o defeito: `editarVideo` devolve título, preço, local,
// legendas e textos, e o título do palco tem `onClick`. Então ou o código mente, ou o que
// ele clica não é o que eu estou lendo.
//
// Este roteiro não confia em nada disso: ele acha o texto NO PALCO, mede quem está por cima
// no ponto do clique (`elementFromPoint`), clica com MOUSE DE VERDADE e diz o que mudou.
//
// Não gera vídeo e não gasta crédito.
//
//   BASE=http://localhost:3000 node scripts/conferir-editar-no-palco.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-palco-"));
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
const shot = async (n) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${n}.png`), Buffer.from(data, "base64"));
};
/** Clica com MOUSE DE VERDADE no ponto, não com `.click()` do DOM: o palco usa
 *  `pointerdown`/`pointerup` com captura, e `.click()` sintético aprovaria um palco
 *  que o dedo não move. */
const clicarNoPonto = async (x, y, segurar = 90) => {
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0, pointerType: "mouse" });
  await esperar(80);
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1, pointerType: "mouse" });
  await esperar(segurar);
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, buttons: 0, pointerType: "mouse" });
  await esperar(600);
};
/** Quais campos de texto estão abertos na tela agora (pra ver o que o clique abriu). */
const camposAbertos = () =>
  c.avaliar(`[...document.querySelectorAll('input[type=text], input:not([type]), textarea')].filter(e => e.offsetParent).map(e => e.value)`);
/** O campo que o clique DEIXOU EM FOCO, e o que tem escrito nele.
 *  Contar campos não basta: abrir um campo VAZIO em cima de um texto que existe conta
 *  como "abriu" e esconde justamente o defeito -- a pessoa teria que redigitar. */
const campoComFoco = () =>
  c.avaliar(`(() => { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return null; return { valor: a.value, placeholder: a.placeholder || '' }; })()`);

try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);

  // ---- Qual vídeo PRONTO existe pra reabrir? É o caso que ele descreve. ----
  const lista = await fetch(`${BASE}/api/video`, { headers: { Authorization: `Bearer ${access_token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const prontos = (lista?.videos ?? lista?.itens ?? lista ?? []).filter?.((x) => x?.status === "concluido") ?? [];
  const alvo = process.env.VIDEO ?? prontos[0]?.id ?? null;
  console.log(alvo ? `reabrindo o vídeo pronto ${alvo}` : "nenhum vídeo pronto na conta — testo o editor com o rascunho que estiver lá");

  await c.abrir(alvo ? `${BASE}/editor/video?editar=${alvo}` : `${BASE}/editor/video`, { largura: 1400, altura: 950, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(4000);

  // ---- O que está escrito NO PALCO? (não suponho o texto: leio) ----
  const palco = await c.avaliar(`(() => {
    // O palco se identifica: \`data-palco\` no quadro que o editor desenha (editor-video.tsx).
    // Procurar "o maior div vertical com <img>" pegava o PAINEL da direita e reprovava 43
    // rótulos de ajuste -- um localizador por aparência reprova a tela errada.
    const p = document.querySelector('[data-palco]');
    if (!p) return { erro: 'não achei [data-palco]' };
    const r = p.getBoundingClientRect();
    // Todo pedaço de TEXTO visível dentro dele.
    const textos = [...p.querySelectorAll('*')].filter(e => {
      const t = (e.textContent || '').trim();
      const rr = e.getBoundingClientRect();
      return t && t.length < 90 && rr.width > 10 && rr.height > 6 && ![...e.children].some(ch => (ch.textContent || '').trim() === t);
    }).map(e => {
      const rr = e.getBoundingClientRect();
      const cx = Math.round(rr.left + rr.width / 2), cy = Math.round(rr.top + rr.height / 2);
      const porCima = document.elementFromPoint(cx, cy);
      return {
        texto: (e.textContent || '').trim(),
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute('role') || '',
        cursor: getComputedStyle(e).cursor,
        ponteiro: getComputedStyle(e).pointerEvents,
        x: cx, y: cy,
        // QUEM recebe o clique nesse ponto? Se não for ele nem filho dele, algo o cobre.
        recebeOClique: porCima ? (porCima === e || e.contains(porCima) || porCima.contains(e) ? 'ele mesmo' : porCima.tagName.toLowerCase() + '.' + (porCima.className?.toString?.().slice(0, 60) ?? '')) : 'nada',
      };
    });
    return { retrato: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, textos };
  })()`);

  if (palco.erro) {
    conferir(false, "achei o palco na tela", palco.erro);
  } else {
    conferir(true, "achei o palco", `${palco.retrato.w}x${palco.retrato.h}`);
    console.log(`\n  texto no palco (${palco.textos.length}):`);
    for (const t of palco.textos) console.log(`    “${t.texto}” · <${t.tag}${t.role ? ` role=${t.role}` : ""}> cursor=${t.cursor} ponteiro=${t.ponteiro} · quem recebe o clique: ${t.recebeOClique}`);
    console.log("");
    await shot("01-antes-do-clique");

    conferir(palco.textos.length > 0, "há texto desenhado no palco pra clicar");

    // Dois cliques por texto: um RÁPIDO e um DEMORADO. A mão humana não solta o botão em
    // 90ms -- um clique pensado passa fácil de meio segundo. O guarda de 450ms existia por
    // causa do menu de toque longo, que é só do DEDO (`onTouchStart` em menu-contexto.tsx);
    // no mouse ele só fazia o clique dele não fazer nada, sem menu e sem aviso.
    for (const t of palco.textos) {
      for (const [segurar, como] of [[90, "clique rápido"], [700, "clique DEMORADO (0,7 s)"]]) {
        const antes = await camposAbertos();
        await clicarNoPonto(t.x, t.y, segurar);
        const depois = await camposAbertos();
        const foco = await campoComFoco();
        const abriu = !!foco || depois.length > antes.length;
        conferir(abriu, `${como} em “${t.texto.slice(0, 32)}” abre a edição`, abriu ? "abriu" : `NADA aconteceu · quem recebe o clique: ${t.recebeOClique}`);
        // E o campo tem que vir COM o texto que estava lá. Abrir vazio seria o mesmo defeito
        // por outro caminho: o que já está no vídeo teria que ser redigitado.
        if (abriu) conferir(foco?.valor === t.texto, `   e já vem com “${t.texto.slice(0, 32)}” pra editar`, foco ? `veio “${foco.valor}”` : "nenhum campo ficou em foco");
        await shot(`02-${segurar}ms-${t.texto.slice(0, 16).replace(/[^\w]+/g, "-")}`);
        await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await c.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await esperar(400);
      }
    }
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
