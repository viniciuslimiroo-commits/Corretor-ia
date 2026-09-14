// Liga o "Entrar com Google" no Supabase.
//
//   node scripts/configurar-google.mjs        -> aplica
//   node scripts/configurar-google.mjs --ver  -> só mostra como está
//
// Precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no web/.env.local, criados no
// Google Cloud (APIs & Services -> Credentials -> OAuth client ID -> Web application).
//
// O endereço de retorno que o Google exige está impresso aqui embaixo: é sempre o
// domínio do SUPABASE, nunca o do site. Confundir os dois é o erro nº 1 desse setup --
// o Google devolve "redirect_uri_mismatch" e não diz qual era o certo.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SO_VER = process.argv.includes("--ver");

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

const pat = env.SUPABASE_ACCESS_TOKEN;
const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL;
if (!pat || !supaUrl) {
  console.error("Falta SUPABASE_ACCESS_TOKEN ou NEXT_PUBLIC_SUPABASE_URL no web/.env.local.");
  process.exitCode = 1;
}

const ref = new URL(supaUrl).hostname.split(".")[0];
const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const RETORNO = `${supaUrl}/auth/v1/callback`;

async function mostrar() {
  const r = await fetch(API, { headers: { Authorization: `Bearer ${pat}` } });
  const c = await r.json();
  console.log(`  Entrar com Google   ${c.external_google_enabled ? "LIGADO" : "desligado"}`);
  console.log(`  Client ID           ${c.external_google_client_id ?? "—"}`);
  console.log(`  Endereço de retorno ${RETORNO}`);
}

async function aplicar() {
  const id = env.GOOGLE_CLIENT_ID;
  const segredo = env.GOOGLE_CLIENT_SECRET;
  if (!id || !segredo) {
    console.error(
      [
        "Falta GOOGLE_CLIENT_ID e/ou GOOGLE_CLIENT_SECRET no web/.env.local.",
        "",
        "1. https://console.cloud.google.com -> criar projeto (nome: Encena)",
        "2. APIs & Services -> OAuth consent screen -> External -> preencher nome e e-mail",
        "3. APIs & Services -> Credentials -> Create credentials -> OAuth client ID",
        "   Application type: Web application",
        "   Authorized redirect URIs: " + RETORNO,
        "4. Copie os dois valores pro web/.env.local:",
        "     GOOGLE_CLIENT_ID=...apps.googleusercontent.com",
        "     GOOGLE_CLIENT_SECRET=GOCSPX-...",
        "",
        "Não precisa mandar no chat. Depois de colar, rode este script de novo.",
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const r = await fetch(API, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      external_google_enabled: true,
      external_google_client_id: id,
      external_google_secret: segredo,
    }),
  });
  if (!r.ok) {
    console.error(`PATCH config/auth ${r.status}: ${(await r.text()).slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }

  console.log("Entrar com Google ligado no Supabase.");
  console.log(`  endereço de retorno  ${RETORNO}  (tem que estar igual no Google Cloud)`);
  console.log("");
  console.log("Falta só o botão aparecer na tela. Me avise, ou rode:");
  console.log("  npx vercel env add NEXT_PUBLIC_LOGIN_GOOGLE production");
  console.log("  (valor: 1)   e depois  npx vercel --prod");
}

try {
  await (SO_VER ? mostrar() : aplicar());
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
