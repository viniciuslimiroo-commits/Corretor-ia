// TIRAR O FUNDO DO LOGO, de ponta a ponta: tela, rota, storage.
//
// O par do `testar-fundo-do-logo.ts`. La' se prova a REGRA com logos sintéticos; aqui se
// prova a CORRENTE -- sobe um logo com fundo, confere que a tela oferece o botão, clica,
// e mede o arquivo que ficou no storage. Regra certa com rota errada entrega a mesma coisa
// que regra errada.
//
// Devolve a conta como estava: guarda o logo de antes e repõe no fim.
//
//   BASE=http://localhost:3000 node scripts/conferir-tirar-fundo.mjs

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
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-fundo-"));
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

const tinhaLogo = !!(await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json())).logoUrl;
if (tinhaLogo) {
  console.log(`A conta ${CONTA} já tem logo. Este teste SOBRESCREVE o logo da conta -- não roda numa conta com logo de verdade.`);
  process.exit(1);
}

/** Um logo de teste parecido com o do dono: desenho claro sobre fundo escuro, sem alfa. */
const comFundo = await sharp(
  Buffer.from(`<svg width="400" height="400"><rect width="400" height="400" fill="rgb(22,26,34)"/><circle cx="200" cy="200" r="110" fill="rgb(212,175,55)"/></svg>`)
)
  .removeAlpha()
  .png()
  .toBuffer();
fs.writeFileSync(path.join(SAIDA, "antes.png"), comFundo);

/** Quanto do PNG é transparente. É a medida que diz se o fundo saiu. */
async function fracaoTransparente(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < 40) n++;
  return n / (info.width * info.height);
}
const baixarDoStorage = async () => {
  const caminho = `marca/${user.id}/logo.png`;
  const r = await fetch(`${SUPA}/storage/v1/object/resultados/${caminho}`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  return Buffer.from(await r.arrayBuffer());
};

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const temBotao = (t) => c.avaliar(`[...document.querySelectorAll('button')].some(b => b.offsetParent && b.innerText.trim() === ${JSON.stringify(t)})`);

try {
  // ---- sobe o logo COM fundo pela rota, como a tela faria ----
  const form = new FormData();
  form.append("logo", new Blob([comFundo], { type: "image/png" }), "logo.png");
  const subiu = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` }, body: form }).then((r) => r.json());
  conferir(!!subiu.logoUrl, "logo com fundo subiu");
  conferir(subiu.fundo?.vale === true, "a ROTA já diz que dá pra tirar o fundo", subiu.fundo?.vale ? `tolerância ${subiu.fundo.tolerancia}` : subiu.fundo?.motivo);

  const antes = await fracaoTransparente(await baixarDoStorage());
  conferir(antes < 0.05, "e no storage ele está OPACO", `${Math.round(antes * 100)}% transparente`);

  // ---- a tela oferece? ----
  await c.abrir(`${BASE}/login`, { largura: 1280, altura: 900 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/marca`, { largura: 1280, altura: 900, pronto: "/Logo/.test(document.body.innerText)" });
  await esperar(1500);
  // O BOTÃO TEM QUE ESTAR AQUI mesmo sem upload nesta visita. A primeira versão só o
  // mostrava logo depois de enviar o arquivo, e isso reproduzia o defeito que o dono acabara
  // de relatar noutra tela: quem já tinha logo abria a página e não achava o recurso --
  // teria que subir o mesmo arquivo de novo pra destravar algo que existe. Agora o GET
  // devolve o veredito do logo guardado.
  conferir(await temBotao("Tirar o fundo"), "abrindo a tela com logo JÁ guardado, o botão aparece", "sem precisar subir de novo");
  await shot("01-marca");

  // ---- tira o fundo pela rota (o mesmo que o botão faz) ----
  const limpar = new FormData();
  limpar.append("tirarFundo", "1");
  const r2 = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` }, body: limpar }).then((r) => r.json());
  conferir(!!r2.logoUrl, "a rota de tirar o fundo respondeu");

  const depois = await fracaoTransparente(await baixarDoStorage());
  conferir(depois > 0.5, "O FUNDO SAIU no arquivo guardado", `${Math.round(antes * 100)}% → ${Math.round(depois * 100)}% transparente`);

  // E o desenho ficou: o centro tem que continuar opaco.
  const { data, info } = await sharp(await baixarDoStorage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meio = data[(Math.round(info.height / 2) * info.width + Math.round(info.width / 2)) * info.channels + 3];
  conferir(meio > 200, "e o DESENHO continua opaco", `alfa ${meio} no centro — limpar não é apagar`);

  // ---- tirar de novo tem que ser recusado, não aplicado duas vezes ----
  const r3 = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` }, body: (() => { const f = new FormData(); f.append("tirarFundo", "1"); return f; })() });
  conferir(r3.status === 400, "tirar o fundo DE NOVO é recusado", `HTTP ${r3.status} — já está limpo`);
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
  // Devolve a conta como estava: ela não tinha logo.
  const r = await fetch(`${BASE}/api/marca`, { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } });
  const conf = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
  conferir(r.ok && !conf.logoUrl, "o logo de teste foi APAGADO e a conta voltou como estava");
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
