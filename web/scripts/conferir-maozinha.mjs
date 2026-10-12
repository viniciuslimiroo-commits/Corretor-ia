// BOTÃO TEM QUE PARECER BOTÃO: o cursor vira mãozinha?
//
// Ele em 12/10/2026: "a parte de ajustes abaixo fica muito escondido, eu mesmo não sabia que
// podia clicar ali onde aparecia o formato". Fui medir o cartão e o cursor dele era `default`.
// Medi o resto: /videos 24 de 24, /editar 35 de 35, /imoveis 3 de 3, /galeria 88 de 88 --
// TODO botão do produto mostrava seta.
//
// A causa é o Tailwind v4, que tirou do preflight o `cursor: pointer` que o v3 punha em
// <button>. Nada quebra numa mudança dessas: tudo continua clicando, só que o cursor parou
// de avisar. É o tipo de regressão que nenhum teste de comportamento pega -- por isso este
// roteiro olha o CURSOR COMPUTADO, e não o clique.
//
//   BASE=http://localhost:3000 node scripts/conferir-maozinha.mjs

import fs from "node:fs";
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
const at = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${at}` } }).then((x) => x.json());
const sessao = { access_token: at, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

/** Botões LIGADOS cujo cursor não é mãozinha, com um nome pra cada um. */
const CONTA_CURSOR = `(() => {
  const bs = [...document.querySelectorAll('button, [role="button"]')].filter((e) => e.offsetParent && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
  const seta = bs.filter((e) => getComputedStyle(e).cursor !== 'pointer');
  return {
    total: bs.length,
    comSeta: seta.length,
    exemplos: seta.slice(0, 5).map((e) => (e.innerText || e.getAttribute('aria-label') || e.title || '(sem nome)').split(String.fromCharCode(10))[0].trim().slice(0, 30)),
  };
})()`;

const c = await abrirChrome();
try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);

  for (const pagina of ["/videos", "/editar", "/imoveis", "/galeria", "/materiais"]) {
    await c.abrir(`${BASE}${pagina}`, { largura: 1400, altura: 950 });
    // Esperar a tela da CONTA, não um tempo fixo: a de login também tem botões, e medir ela
    // daria "tudo certo" sem ter olhado a página que importa. Contar botões não serve de
    // régua -- `/imoveis` tem três, e exigir "mais de 3" reprovava uma página perfeita.
    // A régua é: sumiu o convite de entrar E já há pelo menos um botão.
    let dentro = false;
    for (let i = 0; i < 50 && !dentro; i++) {
      dentro = await c.avaliar(`!/Entre para/.test(document.body.innerText) && document.querySelectorAll('button, [role="button"]').length >= 1`);
      if (!dentro) await esperar(400);
    }
    if (!dentro) {
      conferir(false, `${pagina}: a página abriu com a conta`, "não achei botões — a sessão não assumiu");
      continue;
    }
    const r = await c.avaliar(CONTA_CURSOR);
    conferir(r.comSeta === 0, `${pagina}: todo botão mostra a mãozinha`, r.comSeta === 0 ? `${r.total} botões` : `${r.comSeta} de ${r.total} com seta · ${r.exemplos.join(" | ")}`);
  }
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
