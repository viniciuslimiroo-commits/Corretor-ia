// O AVISO DO LOGO na tela de editar foto, no navegador, com a conta real.
//
// O dono foi procurar onde se põe o logo na foto e não achou. O conserto foi uma linha
// colada no botão "Gerar", dizendo em que estado a marca está antes de gastar o crédito.
// Aqui alguém confere que ela aparece, que diz a coisa certa nos TRÊS casos, e que a
// escolha guardada manda.
//
// Não gera foto e não gasta crédito: só lê a tela e mexe na preferência do navegador.
//
//   BASE=http://localhost:3000 node scripts/conferir-aviso-do-logo.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-aviso-logo-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const CHAVE = "encena.logo-na-foto";
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

const marcaAntes = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json());
const tinhaLogo = !!marcaAntes.logoUrl;
console.log(`conta: ${CONTA} · logo próprio: ${tinhaLogo ? "SIM" : "não"}\n`);

async function subirLogoDeTeste() {
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 20, g: 45, b: 91, alpha: 1 } } }).png().toBuffer();
  const form = new FormData();
  form.append("logo", new Blob([png], { type: "image/png" }), "logo-de-teste.png");
  const r = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` }, body: form });
  return r.ok;
}
let subiLogo = false;

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const erroNaTela = () => c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error|Error:/.test(t) ? t.slice(0, 300) : ''; })()");
/** O aviso é o parágrafo logo acima do botão Gerar: leio pelo texto, que é o que a pessoa lê. */
const avisoNaTela = () =>
  c.avaliar(`(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && /^Gerar/.test(e.innerText.trim()));
    if (!b) return null;
    const p = b.previousElementSibling;
    return p ? p.innerText.replace(/\\s+/g, ' ').trim() : null;
  })()`);
const abrirEditar = async () => {
  await c.abrir(`${BASE}/editar`, { largura: 1280, altura: 900 });
  // A tela só sabe se há logo depois que /api/marca responde.
  for (let i = 0; i < 40 && !(await avisoNaTela()); i++) await esperar(200);
  await esperar(500);
};

try {
  await c.abrir(`${BASE}/login`, { largura: 1280, altura: 900 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.avaliar(`localStorage.removeItem(${JSON.stringify(CHAVE)})`);

  // ---- CASO 1: conta SEM logo ----
  if (!tinhaLogo) {
    await abrirEditar();
    const aviso = await avisoNaTela();
    conferir(!!aviso, "o aviso aparece colado no botão Gerar", aviso ?? "não achei");
    conferir(/Sem logo na sua marca/i.test(aviso ?? ""), "sem logo, diz que não há logo", aviso ?? "");
    conferir(/Envie o seu/i.test(aviso ?? ""), "e oferece o caminho pra enviar");
    const temLink = await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && /^Gerar/.test(e.innerText.trim())); return !!b?.previousElementSibling?.querySelector('a[href="/marca"]'); })()`);
    conferir(temLink, "o link leva pra /marca", temLink ? "a[href=/marca]" : "sem link");
    await shot("01-sem-logo");
    subiLogo = await subirLogoDeTeste();
    conferir(subiLogo, "logo de teste subido para exercer o outro caminho");
  }

  // ---- CASO 2: COM logo e sem escolha registrada -> LIGADO ----
  await abrirEditar();
  const padrao = await avisoNaTela();
  conferir(/Vai sair com o seu logo/i.test(padrao ?? ""), "com logo e sem escolha, diz que VAI SAIR COM o logo", padrao ?? "");
  await shot("02-com-logo-padrao");

  // ---- CASO 3: a escolha guardada MANDA ----
  // É o ponto do `null` na preferência: um "não" deliberado não pode virar "não decidiu".
  await c.avaliar(`localStorage.setItem(${JSON.stringify(CHAVE)}, "0")`);
  await abrirEditar();
  const recusado = await avisoNaTela();
  conferir(/Vai sair SEM o seu logo/i.test(recusado ?? ""), "com 'não' guardado, diz que vai sair SEM", recusado ?? "");
  await shot("03-com-logo-recusado");

  await c.avaliar(`localStorage.setItem(${JSON.stringify(CHAVE)}, "1")`);
  await abrirEditar();
  const aceito = await avisoNaTela();
  conferir(/Vai sair com o seu logo/i.test(aceito ?? ""), "com 'sim' guardado, volta a dizer que vai sair COM", aceito ?? "");

  // ---- e o 'não' sobrevive a recarregar, que é o defeito original ----
  await c.avaliar(`localStorage.setItem(${JSON.stringify(CHAVE)}, "0")`);
  await abrirEditar();
  await abrirEditar();
  const depoisDeDuas = await avisoNaTela();
  conferir(/Vai sair SEM o seu logo/i.test(depoisDeDuas ?? ""), "O 'NÃO' SOBREVIVE A RECARREGAR — era esse o defeito", depoisDeDuas ?? "");

  conferir(!(await erroNaTela()), "nenhum erro de execução", (await erroNaTela()).slice(0, 120));
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
  if (subiLogo) {
    const r = await fetch(`${BASE}/api/marca`, { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } });
    const conf = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
    conferir(r.ok && !conf.logoUrl, "o logo de teste foi APAGADO e a conta voltou como estava", conf.logoUrl ? "AINDA TEM LOGO" : "sem logo, como antes");
  }
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
