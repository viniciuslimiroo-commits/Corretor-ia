// O CRM numa IMOBILIÁRIA e as travas que dependem de tempo, conferidos contra o servidor de
// teste e o banco de verdade:
//
//   - quem vê o quê: dono e gestor veem tudo; corretor só os dele (nem pelo link);
//   - número repetido dentro da casa; "pediu para parar" vale pra casa inteira;
//   - limite de primeiros contatos é POR PESSOA; 2 sem resposta em dias diferentes trava;
//   - "Número errado" -> corrigir -> destrava (e pede a declaração de novo);
//   - avisos de SP e PR pra contato frio; "Pra hoje"; o histórico sem dado pessoal;
//   - a tela: corretor em 375px, computador em 1280px, espanhol, o link abrindo de verdade.
//
//   BASE=http://localhost:3001 node scripts/conferir-crm-imobiliaria.mjs
//
// Leva uns 8 minutos no servidor de dev (cada rota compila na primeira chamada): não rodar
// com limite de tempo curto, ou a limpeza é cortada no meio.
//
// PRECISA: o servidor de teste com CRM_ABERTO=1 (as contas de teste não estão em
// ADMIN_EMAILS) e as contas DONO/CORRETOR/GESTOR abaixo. Durante o teste, CORRETOR e GESTOR
// entram na imobiliária do DONO e ela ganha um CRECI provisório; no fim, tudo volta e o
// script imprime o que desfez, lido do banco.

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
const DONO = process.env.DONO ?? "viniciuslimiroo@gmail.com";
const CORRETOR = process.env.CORRETOR ?? "novo-1789325410@teste.encena.app.br";
const GESTOR = process.env.GESTOR ?? "novo-1789325452@teste.encena.app.br";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-crm-casa-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const rest = (c, init = {}) => fetch(`${SUPA}/rest/v1/${c}`, { ...init, headers: { ...admin, Prefer: "return=representation", ...(init.headers ?? {}) } }).then((r) => r.json());

// Números de teste (nenhum recebe nada: o link só é gerado).
const N = { a: "5562999990001", b: "5562999990002", c: "5562999990003", corrigido: "5562999990004", sp: "5511999990005", pr: "5541999990006", hoje: "5562999990007", futuro: "5562999990008", spQuente: "5511999990009" };
const legivel = (n) => `(${n.slice(2, 4)}) ${n.slice(4, n.length - 4)}-${n.slice(-4)}`;

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const hojeBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diaMais = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + d * 86400000));

async function sessaoDe(email) {
  const d = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) }).then((r) => r.json());
  const v = await fetch(`${SUPA}/auth/v1/verify?token=${d.hashed_token ?? d.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
  const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
  const access_token = p.get("access_token");
  if (!access_token) throw new Error(`sem sessão pra ${email}`);
  const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
  return { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
}

// ---------- antes de escrever qualquer coisa: servidor, tabelas, contas ----------
if (!(await fetch(`${BASE}/login`).then((r) => r.ok).catch(() => false))) {
  console.log(`servidor fora do ar em ${BASE}`);
  process.exit(1);
}
const [dono, corretor, gestor] = [await sessaoDe(DONO), await sessaoDe(CORRETOR), await sessaoDe(GESTOR)];
const [membroDono] = await rest(`org_members?user_id=eq.${dono.user.id}&select=org_id,papel`);
if (membroDono?.papel !== "dono") {
  console.log(`${DONO} precisa ser dono de uma imobiliária.`);
  process.exit(1);
}
const org = membroDono.org_id;
const jaMembros = await rest(`org_members?user_id=in.(${corretor.user.id},${gestor.user.id})&select=user_id`);
if (jaMembros.length) {
  console.log("As contas de teste já estão numa imobiliária: o teste não mexe nelas.");
  process.exit(1);
}
const [orgAntes] = await rest(`organizations?id=eq.${org}&select=creci`);
const api = (quem, metodo, caminho, corpo) =>
  fetch(`${BASE}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", Authorization: `Bearer ${quem.access_token}` }, body: corpo ? JSON.stringify(corpo) : undefined }).then(async (r) => ({
    status: r.status,
    ...(await r.json().catch(() => ({}))),
  }));
const aberto = await api(corretor, "GET", "/api/crm/leads");
if (aberto.status === 403) {
  console.log("O servidor de teste não está com CRM_ABERTO=1: as contas de teste não entram no CRM.");
  process.exit(1);
}
const inicio = new Date().toISOString();
const ids = {};
let c = null;

try {
  await rest("org_members", { method: "POST", body: JSON.stringify([{ org_id: org, user_id: corretor.user.id, papel: "corretor" }, { org_id: org, user_id: gestor.user.id, papel: "gestor" }]) });
  await rest(`organizations?id=eq.${org}`, { method: "PATCH", body: JSON.stringify({ creci: "TESTE-0000" }) });

  const cadastrar = (quem, numero, origem = "portal", nome = "Teste da Casa") => api(quem, "POST", "/api/crm/leads", { nome, telefone: legivel(numero), origem });
  const acao = (quem, id, a, extra = {}) => api(quem, "POST", `/api/crm/leads/${id}/acao`, { acao: a, ...extra });
  const ficha = (quem, id) => api(quem, "GET", `/api/crm/leads/${id}`);
  const lista = async (quem) => (await api(quem, "GET", "/api/crm/leads")).leads?.map((l) => l.id) ?? [];

  // ---------- quem vê o quê ----------
  ids.a = (await cadastrar(dono, N.a)).lead?.id;
  ids.b = (await cadastrar(corretor, N.b)).lead?.id;
  conferir(!!ids.a && !!ids.b, "casa: dono e corretor cadastram");
  const [vDono, vCorretor, vGestor] = [await lista(dono), await lista(corretor), await lista(gestor)];
  conferir(vDono.includes(ids.a) && vDono.includes(ids.b), "casa: o DONO vê os clientes de todos");
  conferir(vGestor.includes(ids.a) && vGestor.includes(ids.b), "casa: o GESTOR vê os clientes de todos");
  conferir(vCorretor.includes(ids.b) && !vCorretor.includes(ids.a), "casa: o CORRETOR só vê os dele");
  const listaDono = await api(dono, "GET", "/api/crm/leads");
  const [bNoDono, aNoDono] = [listaDono.leads?.find((l) => l.id === ids.b), listaDono.leads?.find((l) => l.id === ids.a)];
  conferir(!!bNoDono?.corretor && !aNoDono?.corretor, "casa: na lista do dono, cliente de colega diz de qual corretor é (os dele, não)", bNoDono?.corretor);
  const listaCorretor = await api(corretor, "GET", "/api/crm/leads");
  conferir(listaCorretor.leads?.every((l) => !l.corretor) && listaCorretor.soAdmin === false, "casa: o corretor não vê rótulo de corretor; CRM aberto, sem o aviso \"só você vê\"");
  conferir((await ficha(dono, ids.b)).corretor === bNoDono?.corretor && (await ficha(dono, ids.a)).corretor === null, "casa: a ficha do cliente do colega também diz o corretor");
  const alheio = [await ficha(corretor, ids.a), await api(corretor, "GET", `/api/crm/leads/${ids.a}?exportar=1`), await api(corretor, "PATCH", `/api/crm/leads/${ids.a}`, { nome: "x" }), await acao(corretor, ids.a, "declarar", { aceito: true }), await api(corretor, "DELETE", `/api/crm/leads/${ids.a}`)];
  conferir(alheio.every((r) => r.status === 404), "casa: corretor não abre, exporta, edita, declara nem exclui cliente do colega (404)", alheio.map((r) => r.status).join("/"));

  // ---------- número repetido dentro da casa ----------
  const dupCorretor = await cadastrar(corretor, N.a);
  conferir(dupCorretor.status === 409 && /outro corretor/.test(dupCorretor.error ?? "") && !dupCorretor.existente, "repetido: corretor ouve que é de outro corretor (sem link pro que ele não vê)", dupCorretor.error);
  const dupDono = await cadastrar(dono, N.b);
  conferir(dupDono.status === 409 && dupDono.existente === ids.b, "repetido: dono recebe o link pro cliente que já existe");

  // ---------- limite de primeiros contatos é por pessoa ----------
  await rest("leads_log", { method: "POST", body: JSON.stringify(Array.from({ length: 20 }, () => ({ user_id: corretor.user.id, org_id: org, acao: "abriu_mensagem", detalhe: { primeiro: true } }))) });
  ids.c = (await cadastrar(corretor, N.c)).lead?.id;
  await acao(corretor, ids.c, "declarar", { aceito: true });
  const limite = await ficha(corretor, ids.c);
  conferir(limite.envio?.pode?.motivo === "limite_dia", "limite: 20 primeiros contatos hoje, o 21º espera amanhã", limite.envio?.pode?.texto);
  const tentaMesmoAssim = await acao(corretor, ids.c, "enviar");
  conferir(tentaMesmoAssim.status === 409 && !tentaMesmoAssim.link, "limite: o servidor recusa mesmo chamado direto (não é só o botão sumir)");
  await acao(dono, ids.a, "declarar", { aceito: true });
  conferir((await ficha(dono, ids.a)).envio?.pode?.ok === true, "limite: é da PESSOA -- o dono, na mesma casa, continua podendo");

  // ---------- 2 sem resposta em dias diferentes ----------
  const e1 = await acao(dono, ids.a, "enviar");
  await rest(`leads?id=eq.${ids.a}`, { method: "PATCH", body: JSON.stringify({ ultimo_envio_em: new Date(Date.now() - 86400000).toISOString() }) }); // a 1ª foi "ontem"
  const e2 = await acao(dono, ids.a, "enviar");
  const [depois2] = await rest(`leads?id=eq.${ids.a}&select=etapa,tentativas_sem_resposta`);
  conferir(!!e1.link && !!e2.link && depois2.tentativas_sem_resposta === 2 && depois2.etapa === "sem_resposta", "sem resposta: ontem + hoje = 2 tentativas, vai pra Sem resposta", JSON.stringify(depois2));
  await rest(`leads?id=eq.${ids.a}`, { method: "PATCH", body: JSON.stringify({ ultimo_envio_em: new Date(Date.now() - 86400000).toISOString() }) }); // e a 2ª também, pra não ser reabertura
  const e3 = await acao(dono, ids.a, "enviar");
  conferir(e3.status === 409 && /sem resposta/.test(e3.error ?? ""), "sem resposta: a 3ª trava até marcar Respondeu", e3.error);
  await acao(dono, ids.a, "respondeu");
  const [depoisResp] = await rest(`leads?id=eq.${ids.a}&select=etapa,tentativas_sem_resposta`);
  conferir(depoisResp.tentativas_sem_resposta === 0 && depoisResp.etapa === "em_contato" && (await ficha(dono, ids.a)).envio?.pode?.ok === true, "sem resposta: Respondeu destrava e volta pra Em conversa");

  // ---------- número errado -> corrigir ----------
  await acao(dono, ids.a, "numero_errado");
  const travado = await ficha(dono, ids.a);
  conferir(travado.envio?.pode?.motivo === "bloqueado" && /errado/.test(travado.envio?.pode?.texto ?? ""), "número errado: trava e diz pra corrigir o número");
  const corrigido = await api(dono, "PATCH", `/api/crm/leads/${ids.a}`, { telefone: legivel(N.corrigido) });
  const aposCorrigir = await ficha(dono, ids.a);
  conferir(corrigido.lead?.bloqueio === null && aposCorrigir.envio?.pode?.motivo === "declaracao", "número errado: corrigido, destrava e pede a declaração de novo (é outra pessoa do outro lado)");
  const velho = await cadastrar(dono, N.a, "site", "Outro Teste");
  ids.velho = velho.lead?.id;
  conferir(velho.lead?.bloqueio === "numero_errado", "número errado: o número antigo cadastrado de novo já entra travado");
  const paraNumeroDoColega = await api(dono, "PATCH", `/api/crm/leads/${ids.a}`, { telefone: legivel(N.b) });
  conferir(paraNumeroDoColega.status === 409, "número: trocar pra um número que já é cliente da casa é recusado", paraNumeroDoColega.error);

  // ---------- "pediu para parar" vale pra casa inteira ----------
  await acao(corretor, ids.b, "pediu_parar");
  await api(corretor, "DELETE", `/api/crm/leads/${ids.b}`);
  const outraVez = await cadastrar(dono, N.b);
  conferir(outraVez.status === 409 && /pediu para parar/.test(outraVez.error ?? ""), "pediu para parar: o corretor exclui, e nem o dono cadastra de novo", outraVez.error);

  // ---------- avisos de SP e PR (contato frio) ----------
  for (const [chave, origem] of [["sp", "cliente_antigo"], ["pr", "cliente_antigo"], ["spQuente", "portal"]]) {
    ids[chave] = (await cadastrar(dono, N[chave], origem)).lead?.id;
    await acao(dono, ids[chave], "declarar", { aceito: true });
  }
  const [fSp, fPr, fQuente] = [await ficha(dono, ids.sp), await ficha(dono, ids.pr), await ficha(dono, ids.spQuente)];
  conferir(fSp.envio?.pode?.ok && fSp.envio.pode.avisos.length >= 1, "estado: cliente antigo com DDD de SP recebe o aviso (e pode enviar)", fSp.envio?.pode?.avisos?.[0]?.slice(0, 70));
  conferir(fPr.envio?.pode?.ok && fPr.envio.pode.avisos.length >= 1, "estado: cliente antigo com DDD do PR recebe o aviso", `${fPr.envio?.pode?.avisos?.length} aviso(s)`);
  conferir(fQuente.envio?.pode?.ok && fQuente.envio.pode.avisos.length === 0, "estado: quem procurou o corretor (portal), mesmo em SP, sem aviso");

  // ---------- "Pra hoje" ----------
  ids.hoje = (await cadastrar(dono, N.hoje)).lead?.id;
  ids.futuro = (await cadastrar(dono, N.futuro)).lead?.id;
  for (const k of ["hoje", "futuro"]) {
    await acao(dono, ids[k], "declarar", { aceito: true });
    await acao(dono, ids[k], "enviar");
  }
  await api(dono, "PATCH", `/api/crm/leads/${ids.hoje}`, { proximo_contato_em: hojeBrasilia() });
  await api(dono, "PATCH", `/api/crm/leads/${ids.futuro}`, { proximo_contato_em: diaMais(5) });

  // ---------- histórico sem dado pessoal ----------
  const logs = await rest(`leads_log?org_id=eq.${org}&criado_em=gte.${encodeURIComponent(inicio)}&select=acao,detalhe`);
  const comDado = logs.filter((l) => /9999|Teste|Outro/.test(JSON.stringify(l.detalhe ?? {})));
  conferir(logs.length > 20 && comDado.length === 0, "histórico: nenhuma linha guarda nome ou número (LGPD)", `${logs.length} linhas, ${comDado.length} com dado`);

  // ---------- a TELA ----------
  c = await abrirChrome();
  const shot = async (nome, inteira = false) => {
    const { data } = await c.cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: inteira });
    fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
  };
  const texto = () => c.avaliar("document.body.innerText");
  const entrar = async (quem) => {
    await c.abrir(`${BASE}/login`, { largura: 375, altura: 812, celular: true });
    await c.avaliar(`localStorage.clear(); localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(quem))})`);
  };
  const semRolagemDeLado = () => c.avaliar("document.documentElement.scrollWidth <= window.innerWidth + 1");
  const links = () => c.avaliar("[...document.querySelectorAll('main li a')].map(a => a.getAttribute('href').split('/').pop())");

  // Dono, celular: "Pra hoje"
  await entrar(dono);
  await c.abrir(`${BASE}/crm`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Pra hoje')" });
  const praHoje = await links();
  conferir(praHoje.includes(ids.hoje) && !praHoje.includes(ids.futuro) && !praHoje.includes(ids.velho), "Pra hoje: entra quem tem retorno hoje; retorno daqui a 5 dias e número travado ficam fora", `${praHoje.length} na lista`);
  const telaDono = await texto();
  conferir(telaDono.includes("Corretor:") && !telaDono.includes("Só você vê esta área"), "tela do dono: o cliente do corretor aparece com \"Corretor: …\"; sem o aviso de área fechada");
  await shot("c1-dono-pra-hoje");

  // Dono, ficha com "Sem resposta" já resolvida e o número corrigido: pede declaração de novo
  await c.abrir(`${BASE}/crm/${ids.a}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Histórico')" });
  conferir((await texto()).includes("aceitou receber mensagens minhas"), "tela: número corrigido pede a declaração de novo");

  // Link abrindo DE VERDADE (toque real, sem trocar o window.open): o Encena fica aberto?
  await c.abrir(`${BASE}/crm/${ids.hoje}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Abrir a mensagem')" });
  const botao = await c.avaliar("(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Abrir a mensagem pra enviar'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await esperar(300);
  const antes = (await c.cdp("Target.getTargets")).targetInfos.filter((t) => t.type === "page").length;
  await c.cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: botao.x, y: botao.y }] });
  await c.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await esperar(4000);
  const abas = (await c.cdp("Target.getTargets")).targetInfos.filter((t) => t.type === "page");
  const aqui = await c.avaliar("location.pathname");
  const conversa = abas.find((t) => /wa\.me|whatsapp\.com/.test(t.url));
  conferir(abas.length === antes + 1 && !!conversa && aqui === `/crm/${ids.hoje}`, "toque de verdade: a conversa abre em outra aba e o Encena continua na ficha", conversa?.url.slice(0, 60));
  // Este cliente já recebeu mensagem hoje (pela API, acima): é reabertura, e a tela diz isso.
  conferir((await texto()).includes("Mensagem aberta de novo") && (await texto()).includes("volte aqui e toque em Respondeu"), "toque de verdade: a ficha diz o que aconteceu (aqui, reabertura que não conta) e o próximo passo");

  // Corretor, celular: só os dele; o do colega nem pelo link
  await entrar(corretor);
  await c.abrir(`${BASE}/crm`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Novo cliente')" });
  await c.avaliar("[...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Todos'))?.click()");
  await esperar(300);
  const doCorretor = await links();
  conferir(doCorretor.includes(ids.c) && !doCorretor.includes(ids.a) && !doCorretor.includes(ids.hoje), "tela do corretor: só aparecem os clientes dele", `${doCorretor.length} na lista`);
  await shot("c2-corretor-lista");
  await c.abrir(`${BASE}/crm/${ids.a}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Clientes')" });
  await esperar(1500);
  conferir((await texto()).includes("Cliente não encontrado"), "tela do corretor: o link do cliente do colega diz \"não encontrado\"");
  await c.abrir(`${BASE}/crm/${ids.c}`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Histórico')" });
  conferir((await texto()).includes("primeiros contatos hoje"), "tela do corretor: no limite do dia, a ficha explica e manda continuar amanhã");
  await shot("c3-corretor-limite");

  // Dono, computador (1280)
  await entrar(dono);
  await c.abrir(`${BASE}/crm`, { largura: 1280, altura: 900, celular: false, pronto: "document.body.innerText.includes('Pra hoje')" });
  conferir(await semRolagemDeLado(), "computador: a lista não rola de lado");
  await shot("c4-computador-lista");
  await c.abrir(`${BASE}/crm/${ids.sp}`, { largura: 1280, altura: 900, celular: false, pronto: "document.body.innerText.includes('Histórico')" });
  conferir(await semRolagemDeLado(), "computador: a ficha não rola de lado");
  await shot("c5-computador-ficha-sp");

  // Espanhol: o menu troca; e as telas do CRM?
  await c.cdp("Network.enable");
  await c.cdp("Network.setCookie", { name: "idioma", value: "es", url: BASE });
  await c.abrir(`${BASE}/crm`, { largura: 375, altura: 812, celular: true, pronto: "document.body.innerText.includes('Clientes')" });
  const t = await texto();
  console.log(`info  espanhol: menu em espanhol? ${t.includes("Inmuebles") ? "sim" : "não"} · telas do CRM em espanhol? ${t.includes("Novo cliente") ? "NÃO (seguem em português)" : "sim"}`);
  await shot("c6-espanhol");
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.stack?.split("\n").slice(0, 2).join(" | "));
} finally {
  c?.fechar();
  // ---------- desfaz tudo -- o que mexe em CONTA primeiro (uma rodada que cai no meio já
  // deixou as contas de teste dentro da imobiliária e o CRECI provisório) ----------
  const membros = await rest(`org_members?org_id=eq.${org}&user_id=in.(${corretor.user.id},${gestor.user.id})`, { method: "DELETE" });
  await rest(`organizations?id=eq.${org}`, { method: "PATCH", body: JSON.stringify({ creci: orgAntes?.creci ?? null }) });
  const numeros = Object.values(N);
  const leads = await rest(`leads?org_id=eq.${org}&telefone=in.(${numeros.join(",")})`, { method: "DELETE" });
  const hashes = numeros.map((n) => crypto.createHash("sha256").update(`${org}:${n}`).digest("hex"));
  const bloqueios = await rest(`leads_bloqueados?conta=eq.${org}&telefone_hash=in.(${hashes.join(",")})`, { method: "DELETE" });
  const logs = await rest(`leads_log?user_id=in.(${dono.user.id},${corretor.user.id},${gestor.user.id})&criado_em=gte.${encodeURIComponent(inicio)}`, { method: "DELETE" });
  const [orgDepois] = await rest(`organizations?id=eq.${org}&select=creci`);
  const sobras = await rest(`leads?telefone=in.(${numeros.join(",")})&select=id`);
  console.log(`\ndesfeito: ${leads.length} cliente(s), ${bloqueios.length} bloqueio(s), ${logs.length} linha(s) de histórico, ${membros.length} conta(s) de teste fora da imobiliária, CRECI da imobiliária de volta a ${JSON.stringify(orgDepois?.creci ?? null)}`);
  conferir(sobras.length === 0 && (orgDepois?.creci ?? null) === (orgAntes?.creci ?? null) && membros.length === 2, "limpeza: o banco ficou como estava");
  console.log(`telas: ${SAIDA} · ${Math.round((Date.now() - Date.parse(inicio)) / 1000)}s`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
