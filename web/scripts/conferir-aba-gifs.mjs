// A ABA GIFS MOSTRA GIF, e mostra ANTES de qualquer outra coisa.
//
// Em 21/09/2026 o dono disse "os gifs sumiram do editor". Não tinham sumido: a aba abria com
// a prateleira "Gente reagindo" (fotos de gente, do Pexels) e a grade de emojis animados
// começava 1048px abaixo, fora da tela. Quem abre uma aba chamada GIFs e vê fotos de pessoas
// conclui, com razão, que os GIFs acabaram.
//
// Então este teste não confere só que os arquivos carregam -- isso já carregava. Confere a
// ORDEM: o primeiro título da aba GIFs é "Emojis animados", e a grade aparece sem rolar.
// No computador (1280x900) e no celular (375x812), porque no celular o painel é uma folha
// que fecha ao mudar de tamanho e precisa ser reaberta pelo trilho de baixo.
//
//   BASE=http://localhost:3000 node scripts/conferir-aba-gifs.mjs
//   BASE=https://corretor-ia-gilt.vercel.app node scripts/conferir-aba-gifs.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-gifs-"));
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
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
/** Acha um botão pelo texto exato (o trilho rola pro lado: traz pra vista antes de medir). */
const botao = async (texto) =>
  c.avaliar(`(() => {
    const alvo = ${JSON.stringify(texto)}.toLowerCase();
    const b = [...document.querySelectorAll('button,[role=tab],[role=radio]')].find((el) => (el.textContent || '').trim().toLowerCase() === alvo || (el.getAttribute('aria-label') || '').trim().toLowerCase() === alvo);
    if (!b) return null;
    b.scrollIntoView({ inline: 'center', block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), visivel: r.width > 0 && r.height > 0 };
  })()`);

await c.abrir(`${BASE}/login`, { largura: 1280, altura: 900 });
await c.avaliar(`localStorage.setItem('sb-${REF}-auth-token', ${JSON.stringify(JSON.stringify(sessao))})`);

async function passar(rotulo, largura, altura, celular) {
  if (celular) {
    await c.cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 2, mobile: true });
    await esperar(2000);
  }
  // Abre o painel Elementos e a aba GIFs.
  const bEl = await botao("Elementos");
  conferir(!!bEl?.visivel, `${rotulo}: a ferramenta Elementos está na tela`);
  if (!bEl) return;
  await clicar(bEl.x, bEl.y);
  await esperar(1500);
  const bGif = await botao("GIFs");
  conferir(!!bGif?.visivel, `${rotulo}: a aba GIFs existe dentro de Elementos`);
  if (!bGif) return;
  await clicar(bGif.x, bGif.y);
  await esperar(3000);
  await foto(`gifs-${rotulo}`);

  const r = await c.avaliar(`(() => {
    const titulos = [...document.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).filter((t) => t === 'Emojis animados' || t === 'Gente reagindo');
    const h = [...document.querySelectorAll('p')].find((p) => (p.textContent || '').trim() === 'Emojis animados');
    const imgs = [...document.querySelectorAll('img')].filter((i) => /\\/adesivos\\//.test(i.currentSrc || i.src));
    const vistas = imgs.filter((i) => { const b = i.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0; });
    return {
      primeiro: titulos[0] ?? null,
      tituloY: h ? Math.round(h.getBoundingClientRect().top) : null,
      total: imgs.length,
      quebradas: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      vistasSemRolar: vistas.length,
    };
  })()`);

  conferir(r.primeiro === "Emojis animados", `${rotulo}: o primeiro bloco da aba GIFs é a grade de GIFs`, `veio "${r.primeiro}"`);
  conferir(r.tituloY !== null && r.tituloY >= 0 && r.tituloY < altura, `${rotulo}: o título "Emojis animados" cabe na tela sem rolar`, `y=${r.tituloY}`);
  conferir(r.vistasSemRolar >= 5, `${rotulo}: dá pra ver GIF sem rolar`, `${r.vistasSemRolar} à vista de ${r.total}`);
  conferir(r.total >= 60, `${rotulo}: a grade traz os GIFs todos`, `${r.total}`);
  conferir(r.quebradas === 0, `${rotulo}: nenhum arquivo de GIF quebrado`, `${r.quebradas} quebrados`);
}

await c.abrir(`${BASE}/editor/video`, { largura: 1280, altura: 900, pronto: "!!document.querySelector('[data-editor]')" });
for (let i = 0; i < 60 && (await c.avaliar(`/Abrindo o editor/.test(document.body.innerText)`)); i++) await esperar(1000);
await esperar(1200);
await passar("computador", 1280, 900, false);
await passar("celular", 375, 812, true);

console.log(`\nfotos em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
