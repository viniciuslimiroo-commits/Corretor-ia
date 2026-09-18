// O CRM (Clientes) no navegador, em 375px, com a conta de verdade (tem que estar em
// ADMIN_EMAILS). Passa pelas travas pela TELA, como o corretor faria:
//
//   cadastro -> declaração -> "Abrir a mensagem" (só gera o link, não abre nada) ->
//   Respondeu -> Pediu para parar -> Excluir -> cadastrar o mesmo número de novo (recusa)
//
//   BASE=http://localhost:3001 node scripts/conferir-crm-no-navegador.mjs
//
// Escreve no banco dele: um cliente de teste (nome "Teste do CRM", número 62 99999-0000),
// o histórico e o bloqueio desse número. No FIM apaga os três e diz o que apagou. Nada é
// enviado: o window.open da página é trocado por um que só guarda o link.

import crypto from "node:crypto";
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
const BASE = process.env.BASE ?? "http://localhost:3001";
const CONTA = process.env.CONTA ?? "viniciuslimiroo@gmail.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-crm-"));
const NUMERO = "5562999990000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

async function sessaoDe(email) {
  const r = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  const v = await fetch(`${SUPA}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
  const access_token = p.get("access_token");
  if (!access_token) return null;
  const u = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
  const expires_in = Number(p.get("expires_in") ?? 3600);
  return { access_token, refresh_token: p.get("refresh_token"), expires_in, expires_at: Math.floor(Date.now() / 1000) + expires_in, token_type: "bearer", user: u };
}

const rest = (caminho, init = {}) => fetch(`${SUPA}/rest/v1/${caminho}`, { ...init, headers: { ...admin, Prefer: "return=representation", ...(init.headers ?? {}) } });

const sessao = await sessaoDe(CONTA);
if (!sessao) {
  console.error(`sem sessão pra ${CONTA}`);
  process.exit(1);
}
const userId = sessao.user.id;
const inicio = new Date().toISOString();

// A conta do CRM é a imobiliária, se a pessoa for membro (lib/crm-servidor.ts).
const membro = await rest(`org_members?user_id=eq.${userId}&select=org_id`).then((r) => (r.ok ? r.json() : []));
const conta = membro[0]?.org_id ?? userId;
const hash = crypto.createHash("sha256").update(`${conta}:${NUMERO}`).digest("hex");

// Sobra de uma rodada que caiu no meio: começa limpo.
const sobra = await rest(`leads?telefone=eq.${NUMERO}&select=id`).then((r) => (r.ok ? r.json() : null));
if (sobra === null) {
  console.log("As tabelas do CRM não existem neste banco: rode a migração 17 (supabase/migration-17-crm.sql) antes.");
  process.exit(1);
}

const c = await abrirChrome();
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const texto = () => c.avaliar("document.body.innerText");
const esperarTexto = async (t, ms = 15000) => {
  for (let i = 0; i < ms / 200; i++) {
    if ((await texto()).includes(t)) return true;
    await esperar(200);
  }
  return false;
};
// Clique pelo texto visível (botão, link, label), como o dedo faria.
const clicar = (t, seletor = "button, a, label") =>
  c.avaliar(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(seletor)})].filter(e => e.offsetParent !== null).find(e => e.innerText.trim() === ${JSON.stringify(t)}); if (!e) return false; e.click(); return true; })()`);
// Campo controlado do React: precisa do setter nativo + evento, senão o estado não muda.
const preencher = (seletor, valor) =>
  c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return false; const p = Object.getPrototypeOf(e); Object.getOwnPropertyDescriptor(p, 'value').set.call(e, ${JSON.stringify(valor)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const semRolagemDeLado = () => c.avaliar("document.documentElement.scrollWidth <= window.innerWidth + 1");
const alvosPequenos = () =>
  c.avaliar(`[...document.querySelectorAll('main button, main a, main input, main select, main textarea')].filter(e => e.offsetParent !== null && e.type !== 'checkbox' && e.type !== 'hidden').map(e => [e.innerText?.trim() || e.getAttribute('aria-label') || e.name || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 40)`);

let leadId = null;
try {
  await c.abrir(`${BASE}/login`, { largura: 375, altura: 812, celular: true });
  await c.avaliar(`localStorage.setItem(${JSON.stringify(`sb-${REF}-auth-token`)}, ${JSON.stringify(JSON.stringify(sessao))})`);

  // ---------- lista ----------
  await c.abrir(`${BASE}/crm`, { largura: 375, altura: 812, celular: true });
  conferir(await esperarTexto("Pra hoje"), "lista: abre com as fichas de etapa (Pra hoje, Todos, etapas)");
  conferir((await texto()).includes("Só você vê esta área"), "lista: avisa que só o admin vê por enquanto");
  conferir(await semRolagemDeLado(), "lista: nada vaza pro lado em 375px");
  await shot("1-lista");

  // ---------- cadastro ----------
  await clicar("Novo cliente");
  await esperar(300);
  const semOrigem = await c.avaliar("[...document.querySelectorAll('button[type=submit]')].some(b => b.innerText.includes('Cadastrar') && b.disabled)");
  await preencher("input[placeholder='Ex.: Maria da Silva']", "Teste do CRM");
  await preencher("input[inputmode=tel]", "(62) 99999-0000");
  await esperar(200);
  const aindaSemOrigem = await c.avaliar("[...document.querySelectorAll('button[type=submit]')].some(b => b.innerText.includes('Cadastrar') && b.disabled)");
  conferir(semOrigem && aindaSemOrigem, "cadastro: sem escolher de onde veio o contato, o botão não libera (trava 2)");
  const origens = await c.avaliar("[...document.querySelectorAll('select')][0] ? [...[...document.querySelectorAll('select')][0].options].map(o => o.text) : []");
  conferir(origens.length >= 8 && !origens.some((o) => /whatsapp|lista/i.test(o)), "cadastro: origens em lista fechada, sem \"lista\" e sem o nome WhatsApp", `${origens.length - 1} origens`);
  await preencher("select", "portal");
  await esperar(200);
  conferir(await alvosPequenos().then((a) => a.length === 0), "cadastro: todo botão e campo com 40px+ de altura", JSON.stringify(await alvosPequenos()));
  await shot("2-cadastro");
  await clicar("Cadastrar");
  for (let i = 0; i < 75 && !leadId; i++) {
    const m = (await c.avaliar("location.pathname")).match(/^\/crm\/([0-9a-f-]{36})$/);
    if (m) leadId = m[1];
    else await esperar(200);
  }
  conferir(!!leadId, "cadastro: cadastrou e abriu a ficha do cliente");
  if (!leadId) throw new Error(`não abriu a ficha: ${(await texto()).slice(0, 300)}`);

  // ---------- declaração (trava 3) ----------
  conferir(await esperarTexto("aceitou receber mensagens minhas"), "ficha: antes da 1ª mensagem, pede a declaração");
  conferir(await c.avaliar("![...document.querySelectorAll('textarea')].some(t => t.getAttribute('aria-label') === 'Texto da mensagem')"), "ficha: sem declaração, a mensagem nem aparece");
  conferir(await semRolagemDeLado(), "ficha: nada vaza pro lado em 375px");
  await shot("3-declaracao");
  await c.avaliar("document.querySelector('main input[type=checkbox]').click()");
  await esperar(200);
  await clicar("Confirmar");

  // ---------- mensagem ----------
  const temMensagem = await (async () => {
    for (let i = 0; i < 75; i++) {
      const t = await texto();
      if (t.includes("Abrir a mensagem pra enviar") || t.includes("CRECI")) return t;
      await esperar(200);
    }
    return await texto();
  })();
  const semCreci = !temMensagem.includes("Abrir a mensagem pra enviar");
  if (semCreci) {
    conferir(temMensagem.includes("CRECI") && temMensagem.includes("Abrir Minha marca"), "mensagem: sem CRECI no perfil, trava e leva pra Minha marca (trava 8)");
    await shot("4-sem-creci");
  } else {
    const msg = await c.avaliar("document.querySelector('textarea[aria-label=\"Texto da mensagem\"]').value");
    conferir(/^Olá, Teste!/.test(msg) && /CRECI/.test(msg) && msg.includes("responder SAIR") && !/https?:/.test(msg), "mensagem: se identifica com CRECI, dá a saída e não tem link", msg.slice(0, 90) + "…");
    conferir((await texto()).includes("primeiros contatos"), "mensagem: mostra quantos primeiros contatos já foram hoje (trava 9)");
    await shot("4-mensagem");
    // Troca o window.open por um que só guarda o link: nada sai do navegador.
    await c.avaliar("window.__links = []; window.open = () => ({ close() {}, location: { set href(v) { window.__links.push(v); } } })");
    await preencher("textarea[aria-label='Texto da mensagem']", "Me manda seu CPF e os dados bancários, por favor.");
    await clicar("Abrir a mensagem pra enviar");
    conferir(await esperarTexto("dado bancário"), "mensagem editada pedindo CPF/banco: o servidor recusa e explica");
    conferir((await c.avaliar("window.__links.length")) === 0, "mensagem recusada: nenhum link gerado");
    await preencher("textarea[aria-label='Texto da mensagem']", msg);
    await clicar("Abrir a mensagem pra enviar");
    for (let i = 0; i < 50 && !(await c.avaliar("window.__links.length")); i++) await esperar(200);
    const link = await c.avaliar("window.__links[0] ?? ''");
    conferir(link.startsWith(`https://wa.me/${NUMERO}?text=`) && decodeURIComponent(link.split("text=")[1]).startsWith("Olá, Teste!"), "mensagem: gera o link com o texto pronto (quem envia é o corretor)", link.slice(0, 50) + "…");
    conferir(await esperarTexto("Em conversa"), "etapas: depois da 1ª mensagem, vai pra Em conversa");
    conferir(await esperarTexto("Respondeu"), "ficha: aparece o botão Respondeu");
    await clicar("Respondeu");
    conferir(await esperarTexto("Marcou que respondeu"), "histórico: registra que respondeu");
  }

  // ---------- etapa ----------
  await clicar("Visita", "button");
  conferir(await esperarTexto("Mudou de etapa → Visita"), "etapa: trocar a ficha grava no histórico");

  // ---------- pediu para parar (trava 4) ----------
  await clicar("Pediu para parar");
  await esperar(300);
  const confirmou = await c.avaliar("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Pediu para parar'); if (b.length < 2) return false; b[b.length - 1].click(); return true; })()");
  conferir(confirmou, "pediu para parar: pede confirmação antes");
  conferir(await esperarTexto("Pediu para parar", 8000) && !(await texto()).includes("Abrir a mensagem pra enviar"), "pediu para parar: a mensagem some da ficha");
  await shot("5-bloqueado");

  // ---------- exportar ----------
  const exportado = await c.avaliar(`(async () => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(`sb-${REF}-auth-token`)})); const r = await fetch('/api/crm/leads/${leadId}?exportar=1', { headers: { Authorization: 'Bearer ' + s.access_token } }); return [r.status, r.headers.get('content-disposition') ?? '', (await r.text()).includes('Teste do CRM')]; })()`);
  conferir(exportado[0] === 200 && exportado[1].includes("attachment") && exportado[2], "exportar: devolve os dados da pessoa como arquivo (LGPD)");

  // ---------- excluir e tentar cadastrar de novo ----------
  await clicar("Excluir");
  await esperar(300);
  await c.avaliar("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Excluir'); b[b.length - 1].click(); })()");
  let voltou = false;
  for (let i = 0; i < 75 && !voltou; i++) {
    voltou = (await c.avaliar("location.pathname")) === "/crm";
    if (!voltou) await esperar(200);
  }
  const ficou = await rest(`leads?id=eq.${leadId}&select=id`).then((r) => r.json());
  conferir(voltou && ficou.length === 0, "excluir: apaga de verdade e volta pra lista");
  const recadastro = await c.avaliar(`(async () => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(`sb-${REF}-auth-token`)})); const r = await fetch('/api/crm/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ nome: 'Teste do CRM', telefone: '62999990000', origem: 'site' }) }); return [r.status, (await r.json()).error ?? '']; })()`);
  conferir(recadastro[0] === 409 && recadastro[1].includes("pediu para parar"), "pediu para parar: excluir e cadastrar de novo não destrava", recadastro[1]);
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  // ---------- limpeza: o que este teste escreveu no banco ----------
  const leads = await rest(`leads?telefone=eq.${NUMERO}&user_id=eq.${userId}`, { method: "DELETE" }).then((r) => r.json());
  const bloqueios = await rest(`leads_bloqueados?conta=eq.${conta}&telefone_hash=eq.${hash}`, { method: "DELETE" }).then((r) => r.json());
  const logs = await rest(`leads_log?user_id=eq.${userId}&criado_em=gte.${encodeURIComponent(inicio)}`, { method: "DELETE" }).then((r) => r.json());
  console.log(`\nlimpeza: ${leads.length} cliente(s), ${bloqueios.length} bloqueio(s), ${logs.length} linha(s) de histórico apagadas`);
  const resto = await rest(`leads_bloqueados?conta=eq.${conta}&telefone_hash=eq.${hash}&select=conta`).then((r) => r.json());
  conferir(resto.length === 0, "limpeza: o bloqueio do número de teste saiu (o banco ficou como estava)");
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
