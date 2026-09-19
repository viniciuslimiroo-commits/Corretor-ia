// O TOQUE no palco do editor, com dedo emulado em 375px (Chrome sem janela, conta real).
// Não grava nada: monta um vídeo só na memória da tela e não gera.
//
//   toque curto no texto      -> abre a edição
//   dedo segurado (0,7s)      -> abre o menu e NÃO abre a edição (antes abria os dois,
//                                o teclado subia e fechava o menu)
//   arrastar                  -> move (x/y) e não abre a edição
//   menu                      -> cabe na altura da tela
//   menu da linha do tempo    -> dedo segurado na cena (linha de faixas): com o cursor fora
//                                dela, Dividir e Aparar apagados, dizendo o porquê
//
//   BASE=http://localhost:3002 node scripts/conferir-palco-no-navegador.mjs

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
const CONTA = process.env.CONTA ?? "viniciuslimiroo@gmail.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-palco-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const d = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${d.hashed_token ?? d.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const c = await abrirChrome();
// O selo "N" do modo de desenvolvimento fica em cima da primeira ferramenta do celular: some da
// tela (continua lá, e o erroNaTela ainda lê o que ele mostra).
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const toque = (pontos, tipo) => c.cdp("Input.dispatchTouchEvent", { type: tipo, touchPoints: pontos.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
const caixa = (sel) =>
  c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
const TEXTO = "[data-palco] [data-texto-palco]";
const editando = () => c.avaliar("!!document.querySelector('[data-palco] input')");
const menuAberto = () => c.avaliar("(() => { const m = document.querySelector('[role=menu]'); if (!m) return null; const r = m.getBoundingClientRect(); return { topo: Math.round(r.top), base: Math.round(r.bottom), itens: m.querySelectorAll('[role=menuitem]').length, rola: m.scrollHeight > m.clientHeight }; })()");
const tecla = async (key) => {
  await c.cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
  await c.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
};

try {
  await c.abrir(`${BASE}/login`, { largura: 375, altura: 812, celular: true });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 375, altura: 812, celular: true, pronto: "!!document.querySelector('[data-editor]')" });
  // No celular o painel é uma folha que abre fechada: a ferramenta Mídia abre.
  const botaoMidia = await c.avaliar("(() => { const b = [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === 'Mídia'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  if (botaoMidia) {
    await toque([[botaoMidia.x, botaoMidia.y]], "touchStart");
    await esperar(60);
    await toque([], "touchEnd");
  }
  for (let i = 0; i < 60 && !(await c.avaliar("[...document.querySelectorAll('select option')].some(o => /^[0-9a-f-]{36}$/.test(o.value))")); i++) await esperar(250);
  // As fotos aparecem por imóvel: tenta um por um até achar um com foto pronta.
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); s.setAttribute('data-imoveis', ''); return [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)); })()");
  for (const id of ids) {
    await c.avaliar(`(() => { const s = document.querySelector('[data-imoveis]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    let achou = false;
    for (let i = 0; i < 24 && !achou; i++) {
      achou = await c.avaliar("!!document.querySelector('button[title*=\"clique pra pôr no fim\"]')");
      if (!achou) await esperar(250);
    }
    if (achou) break;
  }

  // Uma foto de verdade (das gerações da conta) e uma etiqueta nela.
  const temFoto = await c.avaliar("(() => { const b = document.querySelector('button[title*=\"clique pra pôr no fim\"]'); if (!b) return false; b.click(); return true; })()");
  conferir(temFoto, "editor: a conta tem foto pra pôr no vídeo");
  if (!temFoto) throw new Error("sem foto na conta");
  await esperar(1500);
  // A folha da Mídia fecha; tocar na cena mostra a barra com Ajustes, e os Ajustes da cena
  // (na folha) têm as etiquetas. "À venda" é etiqueta (coral no vídeo): é o estilo que a
  // prévia pintava de escuro.
  const tocarEm = async (sel) => {
    const r = await c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!r) return false;
    await toque([[r.x, r.y]], "touchStart");
    await esperar(60);
    await toque([], "touchEnd");
    await esperar(450);
    return true;
  };
  await tocarEm('[data-folha] button[aria-label="Fechar"]');
  await tocarEm('[data-area="linha"] [data-alvo="bloco"][data-chave="cenas:0"]');
  await tocarEm('[data-area="barra"] [data-acao="ajustes_cena"]');
  const pos = await c.avaliar("(() => { const b = [...document.querySelectorAll('[data-folha] button')].find(b => b.innerText.trim() === 'À venda'); if (!b) return false; b.click(); return 'À venda'; })()");
  await esperar(500);
  await tocarEm('[data-folha] button[aria-label="Fechar"]');
  await tocarEm('[data-area="barra"] button[data-fechar="1"]');
  await esperar(500);
  const alvo = await caixa(TEXTO);
  conferir(!!alvo, "palco: a etiqueta aparece em cima da foto", String(pos));
  if (!alvo) throw new Error("texto não apareceu no palco");
  const cor = await c.avaliar(`getComputedStyle(document.querySelector(${JSON.stringify(TEXTO)})).backgroundColor`);
  await shot("p1-etiqueta");

  // 1) toque curto: edita
  await toque([[alvo.x, alvo.y]], "touchStart");
  await esperar(90);
  await toque([], "touchEnd");
  await esperar(400);
  conferir(await editando(), "toque curto no texto: abre a edição");
  await tecla("Escape");
  await esperar(300);
  conferir(!(await editando()), "Esc: fecha a edição");

  // 2) dedo segurado: menu, e não a edição
  const a2 = await caixa(TEXTO);
  await toque([[a2.x, a2.y]], "touchStart");
  await esperar(700);
  await toque([], "touchEnd");
  await esperar(400);
  const m = await menuAberto();
  conferir(!!m && !(await editando()), "dedo segurado: abre o menu e NÃO abre a edição", m ? `${m.itens} itens` : "sem menu");
  if (m) conferir(m.topo >= 0 && m.base <= 812, "menu do texto: cabe na tela", `${m.topo}..${m.base}`);
  await shot("p2-menu-texto");
  await tecla("Escape");
  await esperar(300);

  // 3) arrastar: move, sem abrir a edição
  const a3 = await caixa(TEXTO);
  // Sempre em direção ao meio da foto: perto da borda, a posição para nos 5% (de propósito).
  const palco = await caixa("[data-palco]");
  const sentido = a3.y < palco.y ? 1 : -1;
  await toque([[a3.x, a3.y]], "touchStart");
  for (let i = 1; i <= 10; i++) {
    await toque([[a3.x - i * 6, a3.y + sentido * i * 14]], "touchMove");
    await esperar(20);
  }
  await toque([], "touchEnd");
  await esperar(500);
  const depois = await c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(TEXTO)}); const w = e.closest('span.absolute'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: w?.style.left ?? '', top: w?.style.top ?? '' }; })()`);
  conferir(!(await editando()) && Math.abs(depois.y - a3.y) > 100 && depois.left.endsWith("%"), "arrastar: o texto vai junto (posição livre) e a edição não abre", `andou ${Math.round(Math.abs(depois.y - a3.y))}px · left ${depois.left} top ${depois.top}`);
  await shot("p3-arrastado");

  // 4) a etiqueta na prévia tem a cor do vídeo (coral), não a escura
  conferir(/240, 107, 79/.test(cor), "prévia: etiqueta \"À venda\" com a cor do vídeo (coral)", cor);

  // 5) menu da cena pela linha do tempo NOVA (faixas): dedo segurado num bloco de cena abre o
  //    menu com as MESMAS ações da barra; cursor no começo = fora da cena: dividir/aparar apagados.
  await c.avaliar("document.querySelector('[data-rolagem]')?.scrollTo?.({ left: 0 })");
  await esperar(300);
  const bloco = await c.avaliar("(() => { const b = [...document.querySelectorAll('[data-area=linha] [data-alvo=bloco]')].find(e => !e.closest('[data-faixa]')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; })()");
  if (bloco) {
    await toque([[bloco.x, bloco.y]], "touchStart");
    await esperar(700);
    await toque([], "touchEnd");
    await esperar(500);
    const L = "String.fromCharCode(10)";
    const itens = await c.avaliar(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(b => ({ t: b.innerText.split(${L})[0].trim(), dica: (b.innerText.split(${L})[1] ?? '').trim(), off: b.disabled }))`);
    const menuL = await menuAberto();
    const dividir = itens.find((i) => i.t === "Dividir");
    const aparar = itens.find((i) => i.t === "Aparar início");
    conferir(!!dividir && dividir.off && /cursor/.test(dividir.dica) && aparar?.off === true, "menu da cena na linha nova: cursor fora da cena -> Dividir e Aparar apagados, dizendo o porquê", `${dividir?.dica ?? "sem Dividir"}`);
    conferir(!!menuL && menuL.base <= 812 && menuL.topo >= 0, "menu da cena: cabe na tela (rola por dentro se precisar)", menuL ? `${menuL.itens} itens, ${menuL.topo}..${menuL.base}` : "sem menu");
    conferir(!itens.some((i) => /silenci/i.test(i.t)), "menu: sem \"silenciar\" (não existe)");
    await shot("p4-menu-linha");
  } else conferir(false, "linha do tempo: achar o bloco da cena");
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
  await shot("erro").catch(() => {});
} finally {
  c.fechar();
  console.log(`telas: ${SAIDA}`);
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
