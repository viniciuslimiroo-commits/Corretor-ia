// A PONTE: a planta desenhada aqui vira referência do "Construir a casa" sem baixar nada.
//
// 21/09/2026. "Construir a casa" sempre aceitou uma planta como segunda imagem -- o prompt
// tem instrução própria pra ela ("siga a planta: mesma implantação, mesmos cômodos"). Só que
// o caminho era: desenhar, gerar, BAIXAR o PNG, ir pro terreno e SUBIR o arquivo. Quatro
// passos manuais entre duas telas que já se entendiam.
//
// Este teste faz o caminho de verdade no navegador: desenha um cômodo, gera a planta (grátis),
// clica em "Construir esta casa num terreno" e confere que a outra tela abriu com a planta
// escolhida e a ação certa. NÃO gera a casa: isso custa 1 crédito e é decisão do dono.
//
// Limpa o que criou: a planta gerada é um job, e o job (com os arquivos) é apagado no fim.
//
//   BASE=http://localhost:3000 node scripts/conferir-planta-no-terreno.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-ponte-"));
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
const clicar = async (x, y) => {
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
/** Acha um botão ou link pelo texto (pedaço basta) e devolve o centro dele. */
const achar = async (texto) =>
  c.avaliar(`(() => {
    const alvo = ${JSON.stringify(texto)}.toLowerCase();
    const el = [...document.querySelectorAll('button,a')].find((e) => (e.textContent || '').toLowerCase().includes(alvo));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), href: el.getAttribute('href') || null };
  })()`);

await c.abrir(`${BASE}/login`, { largura: 1280, altura: 950 });
await c.avaliar(`localStorage.setItem('sb-${REF}-auth-token', ${JSON.stringify(JSON.stringify(sessao))})`);

// ---------- desenha e gera a planta (grátis) ----------
await c.abrir(`${BASE}/planta`, { largura: 1280, altura: 950, pronto: "!!document.querySelector('[data-caixa]')" });
await esperar(2500);
const cx = await c.avaliar(`(() => { const e = document.querySelector('[data-caixa]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
const ret = await achar("Retângulo");
if (ret) await clicar(ret.x, ret.y);
await esperar(400);
await arrastar(cx.x + cx.w * 0.25, cx.y + cx.h * 0.25, cx.x + cx.w * 0.7, cx.y + cx.h * 0.65);
await esperar(700);

const gerar = await achar("Gerar planta");
conferir(!!gerar, "planta: o botão de gerar está na tela");
if (gerar) await clicar(gerar.x, gerar.y);
for (let i = 0; i < 40 && !(await achar("Construir esta casa")); i++) await esperar(1000);
await foto("ponte-1-planta-pronta");

const ponte = await achar("Construir esta casa");
conferir(!!ponte, "planta: aparece \"Construir esta casa num terreno\" depois de gerar");
const jobId = ponte?.href ? new URL(ponte.href, BASE).searchParams.get("planta") : null;
conferir(!!jobId, "e o link leva o id da planta junto", jobId ?? "sem id");

// ---------- a outra tela abre com a planta na mão ----------
if (ponte) {
  await clicar(ponte.x, ponte.y);
  for (let i = 0; i < 30 && !/Terreno com medidas/i.test(String(await c.avaliar(`document.body.innerText`))); i++) await esperar(1000);
  await esperar(1500);
  const estado = await c.avaliar(`(() => {
    const t = document.body.innerText;
    const acao = [...document.querySelectorAll('button')].find((b) => /Construir a casa/i.test(b.textContent || ''));
    const marcada = acao ? acao.className.includes('marca-indigo') || acao.getAttribute('aria-pressed') === 'true' : false;
    return {
      naTelaDoTerreno: /Terreno com medidas/i.test(t),
      avisaQueVeio: /Sua planta veio junto/i.test(t),
      temCartaoDaPlanta: /A planta que você desenhou/i.test(t),
      dizInspirada: /inspirada nela/i.test(t),
      acaoConstruir: !!acao,
      construirMarcada: marcada,
      url: location.search,
    };
  })()`);
  conferir(estado.naTelaDoTerreno, "terreno: a tela abriu");
  conferir(estado.avisaQueVeio, "terreno: avisa que a planta veio junto, antes mesmo da foto");
  await foto("ponte-2-terreno-sem-foto");

  // As opções de IA só existem com a foto do lote (é nela que a casa é construída): põe uma
  // foto real e confere o cartão da planta.
  // Espera o campo de arquivo existir: na navegação interna a Dropzone monta depois.
  for (let i = 0; i < 20 && !(await c.avaliar(`document.querySelectorAll('input[type=file]').length`)); i++) await esperar(500);
  const quantos = await c.avaliar(`document.querySelectorAll('input[type=file]').length`);
  conferir(quantos > 0, "terreno: o campo da foto do lote está na tela", `${quantos}`);
  if (quantos > 0) {
    const { root } = await c.cdp("DOM.getDocument", { depth: -1 });
    const { nodeId } = await c.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
    await c.cdp("DOM.setFileInputFiles", { nodeId, files: [path.join(RAIZ, "public", "exemplos", "casa-antes.jpg")] });
    await esperar(3500);
  }
  const comFoto = await c.avaliar(`(() => {
    const t = document.body.innerText;
    const acao = [...document.querySelectorAll('button')].find((b) => /^Construir a casa$/i.test((b.textContent || '').trim()));
    return {
      temCartaoDaPlanta: /A planta que você desenhou/i.test(t),
      dizInspirada: /inspirada nela/i.test(t),
      construirEscolhida: !!acao && /bg-marca-indigo|text-white/.test(acao.className),
    };
  })()`);
  Object.assign(estado, comFoto);
  conferir(estado.temCartaoDaPlanta, "terreno: com a foto do lote, a planta aparece como referência (sem subir arquivo)");
  conferir(estado.dizInspirada, "e a tela diz que a casa sai INSPIRADA na planta (não é projeto)");
  conferir(estado.url.includes(`planta=${jobId}`), "o id chegou pela URL", estado.url);
  conferir(estado.construirEscolhida, "e a ação já vem em \"Construir a casa\"");
  await foto("ponte-3-terreno-com-a-planta");
}

// ---------- limpeza: some com o que este teste criou ----------
if (jobId) {
  const uid = user.id;
  await fetch(`${SUPA}/storage/v1/object/resultados`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: [`${uid}/${jobId}.jpg`, `${uid}/${jobId}.png`] }) }).catch(() => {});
  const del = await fetch(`${SUPA}/rest/v1/jobs?id=eq.${jobId}`, { method: "DELETE", headers: admin });
  console.log(`limpeza: job ${jobId} apagado (${del.status})`);
}

console.log(`\nfotos em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
