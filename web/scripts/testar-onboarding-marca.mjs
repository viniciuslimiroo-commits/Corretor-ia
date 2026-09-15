// O que a tela de boas-vindas promete, conferido pelo lado de fora: validação de logo,
// permissão de quem pode mexer na marca da imobiliária, e o estado que impede a tela de
// aparecer de novo.
//
// Roda contra o servidor local (BASE=http://localhost:3000) com token de verdade, tirado
// pelo admin do Supabase -- nada de mock: o que quebra em produção é a rota, não o teste.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Sessão de verdade pra um e-mail, sem mandar e-mail nenhum. */
async function sessaoDe(email) {
  const r = await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const d = await r.json();
  const hashed = d.hashed_token ?? d.properties?.hashed_token;
  if (!hashed) throw new Error(`sem hashed_token pra ${email}: ${JSON.stringify(d).slice(0, 200)}`);
  const v = await fetch(`${SUPA}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  const destino = v.headers.get("location") ?? "";
  const token = new URLSearchParams(destino.split("#")[1] ?? "").get("access_token");
  if (!token) throw new Error(`sem access_token pra ${email}`);
  return token;
}

const sql = async (caminho, metodo = "GET", corpo) =>
  (await fetch(`${SUPA}/rest/v1/${caminho}`, { method: metodo, headers: { ...admin, Prefer: "return=representation" }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })).json();

async function postMarca(token, campos, rota = "/api/marca") {
  const corpo = new FormData();
  for (const [k, v] of Object.entries(campos)) corpo.set(k, v);
  const r = await fetch(`${BASE}${rota}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: corpo });
  const t = await r.text();
  let d = {};
  try {
    if (t) d = JSON.parse(t);
  } catch {
    d = { error: t.slice(0, 160) };
  }
  return { status: r.status, d };
}

// Logo de verdade, não quadrado colorido: a do próprio produto, rasterizada na hora. Tem
// as duas cores da marca e fundo transparente, que é o caso que a extração precisa acertar.
const { default: sharp } = await import("sharp");
const logoReal = new File(
  [await sharp(fs.readFileSync(path.join(RAIZ, "public", "marca-encena.svg")), { density: 300 }).resize(512, 512, { fit: "inside" }).png().toBuffer()],
  "logo.png",
  { type: "image/png" }
);

// ---------------------------------------------------------------- quem testa
const [dono] = await sql("users?email=eq.limiro.cardoso@outlook.com&select=id,email");
const tokenDono = await sessaoDe(dono.email);
console.log(`conta de teste: ${dono.email}\n`);

// ------------------------------------------------------- validação da logo
console.log("--- logo inválida ---");

const pdf = new File([Buffer.from("%PDF-1.4\n% fake", "utf8")], "contrato.pdf", { type: "application/pdf" });
conferir((await postMarca(tokenDono, { logo: pdf })).status === 400, "PDF com nome de PDF é recusado");

// O caso que importa: nome e MIME mentem, o conteúdo não. Só o decodificador pega.
const disfarcado = new File([Buffer.from("%PDF-1.4\n% fake", "utf8")], "logo.png", { type: "image/png" });
const rDisfarcado = await postMarca(tokenDono, { logo: disfarcado });
conferir(rDisfarcado.status === 400, "PDF disfarçado de .png também é recusado", rDisfarcado.d.error?.slice(0, 50));

const svg = new File([Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", "utf8")], "logo.svg", { type: "image/svg+xml" });
conferir((await postMarca(tokenDono, { logo: svg })).status === 400, "SVG é recusado (script dentro de imagem)");

const gigante = new File([Buffer.alloc(6 * 1024 * 1024, 1)], "logo.png", { type: "image/png" });
const rGigante = await postMarca(tokenDono, { logo: gigante });
conferir(rGigante.status === 400 && /5 MB/.test(rGigante.d.error ?? ""), "arquivo de 6 MB é recusado com o limite na frase", rGigante.d.error?.slice(0, 60));

const vazio = new File([Buffer.alloc(0)], "logo.png", { type: "image/png" });
conferir((await postMarca(tokenDono, { logo: vazio })).status === 400, "arquivo vazio é recusado");

// ------------------------------------------------------------ logo válida
console.log("\n--- logo válida ---");
const rOk = await postMarca(tokenDono, { logo: logoReal, nome: "Imobiliaria Horizonte", onboarding: "feito" });
conferir(rOk.status === 200, "logo real sobe", String(rOk.status));
conferir(!!rOk.d.logoUrl, "e volta com URL assinada pra mostrar na hora");
conferir(Array.isArray(rOk.d.cores) && rOk.d.cores.length > 0, "e com as cores achadas nela", JSON.stringify(rOk.d.cores));

const [depois] = await sql(`users?id=eq.${dono.id}&select=onboarding_marca,logo_path,nome`);
conferir(depois.onboarding_marca === "feito", "estado gravado: a tela não aparece de novo", String(depois.onboarding_marca));
conferir(depois.logo_path === `marca/${dono.id}/logo.png`, "logo guardada na pasta do próprio usuário", String(depois.logo_path));

// ---------------------------------------------------------------- permissão
console.log("\n--- marca da imobiliária: quem pode ---");
const [membro] = await sql(`org_members?user_id=eq.${dono.id}&select=org_id,papel`);
if (!membro) {
  console.log("(conta não está em imobiliária; pulando o bloco de permissão)");
} else {
  conferir((await postMarca(tokenDono, { nome: "Casa Nova" }, "/api/equipe/marca")).status === 200, `${membro.papel} edita a marca da casa`);

  // Rebaixa a mesma pessoa pra corretor e tenta de novo: é o teste que importa, porque é
  // o membro comum que não pode mexer na marca global da imobiliária.
  await sql(`org_members?user_id=eq.${dono.id}`, "PATCH", { papel: "corretor" });
  const rCorretor = await postMarca(tokenDono, { nome: "Nao Deveria Passar" }, "/api/equipe/marca");
  conferir(rCorretor.status === 403, "corretor comum recebe 403 na marca da casa", `${rCorretor.status} ${rCorretor.d.error ?? ""}`.slice(0, 60));

  const [orgDepois] = await sql(`organizations?id=eq.${membro.org_id}&select=nome`);
  conferir(orgDepois.nome !== "Nao Deveria Passar", "e o nome da imobiliária não mudou", orgDepois.nome);
  await sql(`org_members?user_id=eq.${dono.id}`, "PATCH", { papel: membro.papel });
}

// ------------------------------------------------------------------ sessão
console.log("\n--- sessão ---");
conferir((await postMarca("token-invalido", { nome: "X" })).status === 401, "token inválido é 401");
const semToken = await fetch(`${BASE}/api/marca`, { method: "POST", body: new FormData() });
conferir(semToken.status === 401, "sem token é 401");

// -------------------------------------------------------------- pular
console.log("\n--- pular ---");
await sql(`users?id=eq.${dono.id}`, "PATCH", { onboarding_marca: null });
const rPular = await postMarca(tokenDono, { onboarding: "pulado" });
conferir(rPular.status === 200, "pular responde 200 sem mandar nada");
const [aposPular] = await sql(`users?id=eq.${dono.id}&select=onboarding_marca`);
conferir(aposPular.onboarding_marca === "pulado", "e grava 'pulado'", String(aposPular.onboarding_marca));

const conta = await (await fetch(`${BASE}/api/conta`, { headers: { Authorization: `Bearer ${tokenDono}` } })).json();
conferir(conta.marca?.onboarding === "pulado", "/api/conta conta isso pra tela");
conferir(typeof conta.marca?.progresso === "number", "e manda o progresso", `${conta.marca?.progresso}%`);

console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exitCode = falhas ? 1 : 0;
