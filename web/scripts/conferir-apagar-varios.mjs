// APAGAR VÁRIOS DE UMA VEZ, na tela de verdade.
//
// Ele em 10/10/2026: "na opção de vídeos no editor e em outros locais que seja possível ter
// a opção de escolher vários arquivos de uma vez para apagar".
//
// O teste do lote (`testar-apagar-em-lote.ts`) prova a CONTA; este prova que a tela liga a
// conta no botão: marcar, contar, apagar e sumir -- e que o que NÃO foi marcado continua lá.
//
// Mexe no banco dele, então obedece a regra da casa: cria vídeos de teste SEUS, com título
// reconhecível, e apaga no fim só pelos ids que criou. Nenhum vídeo dele é marcado nem
// apagado -- e o teste CONFERE isso contando antes e depois.
//
//   BASE=http://localhost:3000 node scripts/conferir-apagar-varios.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-lote-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
/** Título inconfundível: nada do acervo dele começa assim, e o olho acha no print. */
const MARCA = "ZZ TESTE LOTE";

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- entrar ----
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const emBanco = async (busca) => fetch(`${SUPA}/rest/v1/videos?user_id=eq.${user.id}&${busca}`, { headers: admin }).then((r) => r.json());
const criados = [];

try {
  // ---- o acervo DELE, antes de tudo ----
  const antesTodos = await emBanco("select=id,titulo");
  const deleAntes = antesTodos.filter((x) => !x.titulo?.startsWith(MARCA)).map((x) => x.id).sort();
  console.log(`a conta tem ${deleAntes.length} vídeo(s) dele — nenhum deve sumir\n`);

  // ---- três vídeos de teste, meus ----
  const novos = await fetch(`${SUPA}/rest/v1/videos`, {
    method: "POST",
    headers: { ...admin, Prefer: "return=representation" },
    body: JSON.stringify(
      [1, 2, 3].map((n) => ({
        user_id: user.id,
        titulo: `${MARCA} ${n}`,
        formato: "9:16",
        status: "concluido",
        espec: { formato: "9:16", cenas: [], titulo: `${MARCA} ${n}` },
        duracao_segundos: 5,
        creditos_cobrados: 0,
      }))
    ),
  }).then((r) => r.json());
  if (!Array.isArray(novos) || novos.length !== 3) {
    conferir(false, "criei três vídeos de teste", JSON.stringify(novos).slice(0, 200));
    throw new Error("sem os vídeos de teste não dá pra seguir");
  }
  criados.push(...novos.map((x) => x.id));
  conferir(true, "criei três vídeos de teste na conta", criados.join(", ").slice(0, 60) + "…");

  // ---- a tela ----
  const c = await abrirChrome();
  await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='nextjs-portal{visibility:hidden!important}';document.head.appendChild(s);});" });
  const shot = async (n) => {
    const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SAIDA, `${n}.png`), Buffer.from(data, "base64"));
  };
  const clicar = async (texto, sel = "button, a") => {
    const ok = await c.avaliar(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent).find(e => e.innerText.trim().replace(/\\s+/g,' ').includes(${JSON.stringify(texto)})); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
    if (ok) await esperar(500);
    return ok;
  };

  try {
    await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
    await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
    await c.abrir(`${BASE}/videos`, { largura: 1400, altura: 950 });
    for (let i = 0; i < 40 && !(await c.avaliar(`document.body.innerText.includes(${JSON.stringify(MARCA)})`)); i++) await esperar(300);
    conferir(await c.avaliar(`document.body.innerText.includes(${JSON.stringify(MARCA)})`), "os vídeos de teste aparecem na lista");

    // ---- antes de marcar, nenhum botão de apagar em lote ----
    conferir(!(await c.avaliar("/Apagar · \\d/.test(document.body.innerText)")), "sem nada marcado, não há botão de apagar vários");

    conferir(await clicar("Selecionar vários"), "achei e cliquei em “Selecionar vários”");
    await shot("01-modo-ligado");

    // ---- marcar OS TRÊS pelo título ----
    const marcou = await c.avaliar(`(() => {
      const linhas = [...document.querySelectorAll('li')].filter(li => li.innerText.includes(${JSON.stringify(MARCA)}));
      let n = 0;
      for (const li of linhas) { const b = li.querySelector('button[aria-pressed]'); if (b) { b.click(); n++; } }
      return n;
    })()`);
    conferir(marcou === 3, "marquei os três de uma vez", `${marcou} marcado(s)`);
    await esperar(600);
    const contador = await c.avaliar("(document.body.innerText.match(/(\\d+) marcados?/) ?? [])[1] ?? ''");
    conferir(contador === "3", "a tela conta 3 marcados", `diz “${contador}”`);
    await shot("02-tres-marcados");

    // ---- apagar, e confirmar ----
    conferir(await clicar("Apagar · 3"), "achei o botão “Apagar · 3”");
    await esperar(700);
    await shot("03-pergunta");
    const confirmou = await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => e.innerText.trim() === 'Apagar'); if (!b) return false; b.click(); return true; })()`);
    conferir(confirmou, "a pergunta de confirmação apareceu e eu confirmei");
    await esperar(3500);
    await shot("04-depois");

    // ---- o banco é quem decide ----
    const sobraram = await emBanco(`select=id,titulo&titulo=like.${encodeURIComponent(MARCA + "%")}`);
    conferir(sobraram.length === 0, "os três saíram DO BANCO, não só da tela", `${sobraram.length} sobrando`);
    const deleDepois = (await emBanco("select=id,titulo")).filter((x) => !x.titulo?.startsWith(MARCA)).map((x) => x.id).sort();
    conferir(deleDepois.join() === deleAntes.join(), "e NENHUM vídeo dele foi junto", `${deleAntes.length} antes, ${deleDepois.length} depois`);
    conferir(!(await c.avaliar(`document.body.innerText.includes(${JSON.stringify(MARCA)})`)), "a lista na tela também já não os mostra");

    // ---- o mesmo botão existe no EDITOR (foi o lugar que ele citou) ----
    await c.abrir(`${BASE}/editor/video`, { largura: 1400, altura: 950, pronto: "!!document.querySelector('[data-editor]')" });
    await esperar(2500);
    conferir(await clicar("Vídeos", "button"), "abri a aba Vídeos do editor");
    await esperar(1200);
    conferir(await c.avaliar("/Selecionar/.test(document.body.innerText)"), "o editor também oferece marcar vários");
    await shot("05-editor");

    // ---- A GALERIA: lá o vídeo nem se marcava. Agora se marca -- e some junto. ----
    const extra = await fetch(`${SUPA}/rest/v1/videos`, {
      method: "POST",
      headers: { ...admin, Prefer: "return=representation" },
      body: JSON.stringify([{ user_id: user.id, titulo: `${MARCA} GALERIA`, formato: "9:16", status: "concluido", espec: { formato: "9:16", cenas: [] }, duracao_segundos: 5, creditos_cobrados: 0 }]),
    }).then((r) => r.json());
    if (Array.isArray(extra) && extra[0]?.id) criados.push(extra[0].id);

    await c.abrir(`${BASE}/galeria`, { largura: 1400, altura: 950 });
    for (let i = 0; i < 40 && !(await c.avaliar(`document.body.innerText.includes(${JSON.stringify(MARCA)})`)); i++) await esperar(300);
    conferir(await c.avaliar(`document.body.innerText.includes(${JSON.stringify(MARCA)})`), "o vídeo aparece na Galeria");
    const temBolinha = await c.avaliar(`(() => {
      const li = [...document.querySelectorAll('li')].find(x => x.innerText.includes(${JSON.stringify(MARCA)}));
      if (!li) return 'não achei o cartão';
      const b = li.querySelector('button[aria-pressed]');
      if (!b) return 'o vídeo NÃO tem bolinha de marcar';
      b.click();
      return 'marcou';
    })()`);
    conferir(temBolinha === "marcou", "o vídeo tem bolinha de marcar na Galeria", temBolinha);
    await esperar(700);
    await shot("06-galeria-marcada");
    conferir(await c.avaliar("/Apagar · 1/.test(document.body.innerText)"), "com o vídeo marcado, aparece “Apagar · 1”");

    if (await clicar("Apagar · 1")) {
      await esperar(700);
      // A pergunta tem que dizer VÍDEO, não "imagem": é nela que ele confere o sem-volta.
      const pergunta = await c.avaliar("(document.body.innerText.match(/Apagar 1 (imagem|vídeo|iten?s?)\\?/) ?? [])[0] ?? ''");
      conferir(pergunta.includes("vídeo"), "a pergunta diz “vídeo”, não “imagem”", `diz “${pergunta}”`);
      await c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => e.innerText.trim() === 'Apagar'); b?.click(); })()`);
      await esperar(3500);
      const sobrou = await emBanco(`select=id&titulo=like.${encodeURIComponent(MARCA + "%")}`);
      conferir(sobrou.length === 0, "a Galeria apagou o vídeo de verdade", `${sobrou.length} sobrando`);
      await shot("07-galeria-depois");
    } else {
      conferir(false, "achei o botão de apagar na Galeria");
    }
  } finally {
    await c.fechar?.();
  }
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 200));
} finally {
  // ---- devolve a conta como estava: só os ids que EU criei ----
  const resto = criados.length ? await emBanco(`select=id&id=in.(${criados.join(",")})`) : [];
  if (resto.length) {
    await fetch(`${SUPA}/rest/v1/videos?id=in.(${resto.map((x) => x.id).join(",")})`, { method: "DELETE", headers: admin });
    console.log(`\nlimpei ${resto.length} vídeo(s) de teste que tinham sobrado`);
  }
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
