// QUEM NÃO TEM LOGO CONSEGUE CHEGAR EM /marca? Nas duas telas que dependem dele.
//
// Em 10/10/2026 ele disse: "é onde está a parte de colocar marca d'água e etc nos vídeos e
// fotos, não vejo!!". A conta dele não tinha logo -- e as duas funções se ESCONDIAM nesse
// caso: no vídeo sobrava um aviso sem botão (e com "Minha marca" em negrito, não em link);
// na foto a caixa "Com meu logo" simplesmente não era desenhada. O produto funcionava como
// projetado, e o projeto estava errado: recurso que se esconde não se descobre.
//
// Este teste roda com uma conta SEM logo de propósito. Se a conta tiver um, ele avisa e
// para -- medir o caminho vazio numa conta cheia não prova nada.
//
//   BASE=http://localhost:3000 node scripts/conferir-caminho-do-logo.mjs

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
const JOB = process.env.JOB ?? "d1b8d84a-c0af-4124-b967-f232f2ac3abf";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-caminho-logo-"));
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

// A PREMISSA DO TESTE, conferida antes de medir: esta conta não pode ter logo.
const marca = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json());
if (marca.logoUrl) {
  console.log(`A conta ${CONTA} TEM logo. Este teste só faz sentido sem logo -- ele mede o caminho de quem não tem.`);
  process.exit(1);
}
console.log(`conta ${CONTA} · sem logo, como este teste precisa\n`);

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
/** Há um link CLICÁVEL pra /marca na parte visível da tela? */
const linkParaMarca = () =>
  c.avaliar(`(() => {
    const a = [...document.querySelectorAll('a[href="/marca"]')].filter(e => e.offsetParent);
    return a.length ? { quantos: a.length, texto: a[0].innerText.replace(/\\s+/g, ' ').trim() } : null;
  })()`);
const clicarTexto = async (t, sel = "button") => {
  const r = await c.avaliar(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent).find(e => e.innerText.trim().split(String.fromCharCode(10))[0].trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
  if (r) await esperar(400);
  return r;
};

try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);

  // ---- 1. o editor de vídeo ----
  await c.abrir(`${BASE}/editor/video`, { largura: 1400, altura: 950, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(1500);
  let achou = (await c.avaliar("document.body.innerText")).includes("Marca d'água");
  if (!achou) {
    const abas = await c.avaliar("[...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.innerText.trim().split(String.fromCharCode(10))[0]).filter(t => t.length > 2 && t.length < 16)");
    for (const aba of [...new Set(abas)]) {
      await clicarTexto(aba);
      if ((await c.avaliar("document.body.innerText")).includes("Marca d'água")) {
        achou = true;
        break;
      }
    }
  }
  conferir(achou, "a seção “Marca d'água” aparece mesmo sem logo", "antes ela existia, mas sem saída");
  const noVideo = await linkParaMarca();
  conferir(!!noVideo, "e traz um LINK clicável pra /marca", noVideo ? `“${noVideo.texto}”` : "nenhum — a pessoa fica sabendo onde ir e não consegue ir");
  await shot("01-editor-sem-logo");

  // ---- 2. a tela de baixar a foto ----
  // Abre um job JÁ PRONTO (`?job=`): a caixa de exportar só existe com resultado na tela, e
  // gerar um aqui gastaria crédito do dono pra provar uma questão de layout.
  await c.abrir(`${BASE}/editar?job=${JOB}`, { largura: 1400, altura: 950, pronto: "/Baixar para o an/i.test(document.body.innerText)" });
  await esperar(1200);
  conferir(/Baixar para o an/i.test(await c.avaliar("document.body.innerText")), "a caixa de baixar abriu com o resultado pronto");
  const naFoto = await linkParaMarca();
  conferir(!!naFoto, "a tela da foto também leva pra /marca", naFoto ? `“${naFoto.texto}” (${naFoto.quantos} link(s))` : "nenhum");
  await shot("02-foto-sem-logo");

  // ---- 3. o link leva mesmo a uma tela que aceita logo ----
  // ESPERA POR ALGO QUE EXISTE, nunca pela AUSENCIA de algo.
  //
  // A primeira versao esperava `!/Entre para/.test(document.body.innerText)` -- a ausencia
  // do aviso de deslogado. Numa pagina que ainda nao renderizou, `innerText` e' "" e a
  // negacao da' VERDADEIRO: a espera terminava antes de existir qualquer coisa, e o teste
  // fotografava o quadro deslogado e reprovava a tela. A tela estava certa.
  //
  // Predicado de prontidao escrito como negacao ja' nasce satisfeito. Tem que casar o que a
  // tela PRONTA mostra.
  await c.abrir(`${BASE}/marca`, { largura: 1400, altura: 950, pronto: "/Materiais/.test(document.body.innerText)" });
  await esperar(1200);
  const aceita = await c.avaliar("!!document.querySelector('input[type=file]') || /logo/i.test(document.body.innerText)");
  conferir(aceita, "a /marca aceita logo de verdade", "link que leva a lugar nenhum seria pior que link nenhum");
  await shot("03-marca");
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
