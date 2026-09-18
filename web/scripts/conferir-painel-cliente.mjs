// O PAINEL DO CLIENTE e o fluxo "preparar envio" no navegador (375px e 1280px), com a conta
// real que tem imóvel com fotos, vídeos e books.
//
//   menu principal tem "Clientes"; o painel abre com o nome em destaque;
//   1º contato: materiais travados (sem link); depois que a pessoa responde: liberados;
//   escolher 2 materiais + "Preparar com IA" -> mensagem com os links /c/ e /b/ no fim;
//   copiar passa pela ação do servidor (entra no histórico como "copiada").
//
//   BASE=http://localhost:3002 CONTA=limiro.cardoso@outlook.com IMOVEL=Buriti node scripts/conferir-painel-cliente.mjs
//
// ESCREVE (e desfaz no fim, lendo o banco): um cliente de teste, o histórico dele, um CRECI
// provisório na conta e os links públicos que o teste ligar nos materiais. Faz UMA chamada
// real à IA de texto (frações de centavo na fal).

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
const NOME_IMOVEL = process.env.IMOVEL ?? "Buriti";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-painel-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const rest = (c, init = {}) => fetch(`${SUPA}/rest/v1/${c}`, { ...init, headers: { ...admin, Prefer: "return=representation", ...(init.headers ?? {}) } }).then((r) => r.json());
const NUMERO = "5562999990011";

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

if (!(await fetch(`${BASE}/login`).then((r) => r.ok).catch(() => false))) {
  console.log(`servidor fora do ar em ${BASE}`);
  process.exit(1);
}
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
const api = (m, c, b) =>
  fetch(`${BASE}${c}`, { method: m, headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

const [imovel] = await rest(`properties?user_id=eq.${user.id}&titulo=eq.${encodeURIComponent(NOME_IMOVEL)}&select=id,share_token`);
if (!imovel) {
  console.log(`imóvel "${NOME_IMOVEL}" não achado na conta`);
  process.exit(1);
}
// Retrato dos links públicos de ANTES: o teste liga alguns, e o fim devolve cada um.
const antes = {
  properties: [{ id: imovel.id, share_token: imovel.share_token }],
  videos: await rest(`videos?property_id=eq.${imovel.id}&select=id,share_token`),
  books: await rest(`books?property_id=eq.${imovel.id}&select=id,share_token`),
};
const [u0] = await rest(`users?id=eq.${user.id}&select=creci`);
let leadId = null;
let c = null;

try {
  await rest(`users?id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ creci: "TESTE-0000" }) });
  const cad = await api("POST", "/api/crm/leads", { nome: "Mariana Teste Painel", telefone: "(62) 99999-0011", origem: "portal", property_id: imovel.id });
  leadId = cad.lead?.id;
  conferir(!!leadId, "cliente de teste cadastrado com o imóvel de interesse", cad.error ?? "");
  if (!leadId) throw new Error("sem cliente");

  // 1º contato: preparar com material é recusado pelo servidor (sem link).
  await api("POST", `/api/crm/leads/${leadId}/acao`, { acao: "declarar", aceito: true });
  const mats = await api("GET", `/api/crm/leads/${leadId}/preparar?imovel=${imovel.id}`);
  conferir((mats.materiais ?? []).length >= 2, "o imóvel lista os materiais (fotos, vídeos, books)", `${(mats.materiais ?? []).length}: ${(mats.materiais ?? []).map((m) => m.tipo).join(", ")}`);
  const recusa = await api("POST", `/api/crm/leads/${leadId}/preparar`, { imovelId: imovel.id, materiais: [mats.materiais[0].chave], tom: "cordial" });
  conferir(recusa.status === 409 && /sem link/.test(recusa.error ?? ""), "1º contato: material recusado no servidor (sem link)", recusa.error);

  c = await abrirChrome();
  const shot = async (nome, inteira = false) => {
    const { data } = await c.cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: inteira });
    fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
  };
  const texto = () => c.avaliar("document.body.innerText");
  await c.abrir(`${BASE}/login`, { largura: 1280, altura: 900, celular: false });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);

  // ---------- computador: menu principal ----------
  await c.abrir(`${BASE}/crm`, { largura: 1280, altura: 900, celular: false, pronto: "document.body.innerText.includes('Meus clientes')" });
  const noMenu = await c.avaliar("[...document.querySelectorAll('header a')].some(a => a.getAttribute('href') === '/crm' && a.offsetParent !== null && a.innerText.trim() === 'Clientes')");
  conferir(noMenu, "computador: \"Clientes\" no menu principal, do lado de Imóveis");
  const larguraOk = await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1");
  conferir(larguraOk, "computador: o menu com Clientes cabe na largura (1280)");
  await shot("n1-lista-1280");

  // ---------- celular: 1º contato, materiais travados ----------
  await c.abrir(`${BASE}/crm/${leadId}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Preparar envio')" });
  await esperar(900);
  const h1 = await c.avaliar("(() => { const h = document.querySelector('main h1'); return h ? { t: h.innerText, px: parseFloat(getComputedStyle(h).fontSize) } : null; })()");
  conferir(h1?.t === "Mariana Teste Painel" && h1.px >= 28, "painel: o nome em destaque no topo", h1 ? `${h1.px}px` : "sem h1");
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "painel: nada vaza pro lado em 375px");
  const travados = await c.avaliar("[...document.querySelectorAll('button[aria-pressed]')].filter(b => b.closest('ul')).every(b => b.disabled)");
  conferir(travados && (await texto()).includes("os materiais liberam quando a pessoa responder"), "1º contato: os cartões de material ficam travados, com o motivo");
  const menuCel = await c.avaliar("[...document.querySelectorAll('nav a')].some(a => a.getAttribute('href') === '/crm' && a.offsetParent !== null)");
  conferir(menuCel, "celular: \"Clientes\" na barra de navegação");
  await shot("n2-painel-1o-contato-375", true);

  // Manda a 1ª (copiar) e marca que respondeu: aí os materiais liberam.
  await api("POST", `/api/crm/leads/${leadId}/acao`, { acao: "enviar", canal: "copiar" });
  await api("POST", `/api/crm/leads/${leadId}/acao`, { acao: "respondeu" });

  // ---------- celular: retorno, escolher materiais e preparar com IA ----------
  await c.cdp("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: BASE }).catch(() => {});
  await c.abrir(`${BASE}/crm/${leadId}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Preparar envio') && document.querySelectorAll('ul button[aria-pressed]').length > 1" });
  await esperar(600);
  const liberados = await c.avaliar("(() => { const bs = [...document.querySelectorAll('ul button[aria-pressed]')]; if (bs.length < 2 || bs.some(b => b.disabled)) return 0; bs[0].click(); bs[bs.length - 1].click(); return bs.length; })()");
  conferir(liberados >= 2, "depois da resposta: materiais liberados e 2 marcados", `${liberados} cartões`);
  await esperar(300);
  const marcados = await c.avaliar("document.querySelectorAll('ul button[aria-pressed=\"true\"]').length");
  conferir(marcados === 2, "os 2 materiais aparecem marcados (check)");
  await shot("n3-materiais-375", true);
  await c.avaliar("[...document.querySelectorAll('button')].find(b => b.innerText.includes('Preparar com IA')).click()");
  let msg = "";
  for (let i = 0; i < 90 && !/https?:\/\//.test(msg); i++) {
    await esperar(500);
    msg = await c.avaliar("document.querySelector('textarea[aria-label=\"Texto da mensagem\"]')?.value ?? ''");
  }
  const links = msg.match(/https?:\/\/\S+/g) ?? [];
  conferir(/^Olá, Mariana!/.test(msg) && links.length === 2 && links.every((l) => /\/(c|b)\/[\w-]+$/.test(l)), "IA: mensagem com o nome e os 2 links (/c/ e /b/) no fim", `${links.length} link(s)`);
  conferir(!/Teste Painel|99999|@/.test(msg.split("http")[0]), "IA: sem sobrenome, telefone ou e-mail na mensagem");
  console.log("     mensagem:\n" + msg.split("\n").map((l) => "       " + l).join("\n"));
  const avisoIa = await c.avaliar("[...document.querySelectorAll('[role=status], .text-emerald-800, .bg-emerald-50')].map(e => e.innerText).join(' | ')");
  await shot("n4-mensagem-375", true);

  // Copiar: passa pela ação do servidor (histórico "copiada").
  // Clique de mouse DE VERDADE (dá foco e "gesto do usuário", que a área de transferência exige).
  await c.cdp("Page.bringToFront");
  const bCopiar = await c.avaliar("(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Copiar'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await esperar(300);
  await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: bCopiar.x, y: bCopiar.y, button: "left", clickCount: 1 });
  await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: bCopiar.x, y: bCopiar.y, button: "left", clickCount: 1 });
  const copiou = await (async () => {
    for (let i = 0; i < 30; i++) {
      await esperar(300);
      if ((await texto()).includes("Mensagem copiada")) return true;
    }
    return false;
  })();
  if (!copiou) console.log(`     na tela depois de copiar: ${(await c.avaliar("[...document.querySelectorAll('div')].filter(d => /bg-red-50|bg-marca-teal|bg-amber-50/.test(d.className)).map(d => d.innerText).join(' | ')")).slice(0, 200)}`);
  const logs = await rest(`leads_log?lead_id=eq.${leadId}&acao=eq.abriu_mensagem&select=detalhe&order=criado_em.desc&limit=1`);
  conferir(copiou && logs[0]?.detalhe?.canal === "copiar" && logs[0]?.detalhe?.links === 2, "copiar: confirma na tela e entra no histórico (canal copiar, 2 links)", JSON.stringify(logs[0]?.detalhe ?? {}));
  if (avisoIa) console.log(`     avisos: ${avisoIa.slice(0, 160)}`);

  // Depois dessa 2ª mensagem (no mesmo dia da 1ª), NÃO pode voltar a ser "1º contato".
  await c.abrir(`${BASE}/crm/${leadId}`, { largura: 375, altura: 812, celular: true, pronto: "document.querySelectorAll('ul button[aria-pressed]').length > 1" });
  await esperar(600);
  const aindaLiberados = await c.avaliar("[...document.querySelectorAll('ul button[aria-pressed]')].every(b => !b.disabled) && !document.body.innerText.includes('os materiais liberam quando a pessoa responder')");
  conferir(aindaLiberados, "2ª mensagem no mesmo dia: continua liberado (não volta a ser 1º contato)");

  // Os links abrem de verdade (página pública do material).
  const abrem = await Promise.all(links.map((l) => fetch(l.replace(/^https?:\/\/[^/]+/, BASE)).then((r) => r.status)));
  conferir(abrem.length > 0 && abrem.every((s) => s === 200), "os links da mensagem abrem (páginas públicas)", abrem.join("/") || "nenhum link");

  // ---------- computador: o painel inteiro ----------
  await c.abrir(`${BASE}/crm/${leadId}`, { largura: 1280, altura: 900, celular: false, pronto: "document.body.innerText.includes('Histórico')" });
  await esperar(900);
  conferir(await c.avaliar("document.documentElement.scrollWidth <= innerWidth + 1"), "computador: o painel não rola de lado");
  await shot("n5-painel-1280", true);
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
} finally {
  c?.fechar();
  // ---------- desfaz: conta primeiro, depois os dados de teste ----------
  await rest(`users?id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ creci: u0?.creci ?? null }) });
  let voltaram = 0;
  for (const [tabela, linhas] of Object.entries(antes)) {
    for (const l of linhas) {
      const [agora] = await rest(`${tabela}?id=eq.${l.id}&select=share_token`);
      if ((agora?.share_token ?? null) !== (l.share_token ?? null)) {
        await rest(`${tabela}?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ share_token: l.share_token ?? null }) });
        voltaram++;
      }
    }
  }
  // Histórico só do cliente de teste (pelo id, antes de apagar o cliente): a conta é real.
  const logs = leadId ? await rest(`leads_log?lead_id=eq.${leadId}`, { method: "DELETE" }) : [];
  const apagados = await rest(`leads?telefone=eq.${NUMERO}&user_id=eq.${user.id}`, { method: "DELETE" });
  const [u1] = await rest(`users?id=eq.${user.id}&select=creci`);
  console.log(`\ndesfeito: CRECI de volta a ${JSON.stringify(u1?.creci ?? null)}, ${voltaram} link(s) público(s) desligado(s) de novo, ${apagados.length} cliente, ${logs.length} linha(s) de histórico`);
  conferir((u1?.creci ?? null) === (u0?.creci ?? null), "limpeza: a conta ficou como estava");
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
