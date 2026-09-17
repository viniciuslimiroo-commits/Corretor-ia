// CORS dos arquivos de áudio e vídeo do bucket, antes da prévia com som (Web Audio).
//
// A prévia da linha do tempo vai BAIXAR a voz e o Você pelo navegador (`fetch` em modo
// cors → `decodeAudioData`). Isso só funciona se a URL assinada do Supabase responder com
// `Access-Control-Allow-Origin` pra origem do editor -- em GET inteiro, em GET com Range e
// no preflight (OPTIONS) que o navegador manda quando pede Range. Se não responder, a voz
// sai "prévia sem som" e a música vai primeiro (docs/planos/linha-do-tempo-spec.md, D8).
//
// SÓ LEITURA: lista pastas do bucket, assina duas URLs (1 mp3, 1 mp4) e faz as requisições.
// Não grava nada, não sobe nada, não gasta crédito. Nunca imprime chave, token nem a URL
// assinada; o id da pessoa no caminho sai trocado por <usuario>.
//
//   node scripts/conferir-cors-audio.mjs

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BUCKET = "resultados";
const ORIGENS = ["http://localhost:3000", "https://corretor-ia-gilt.vercel.app"];

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const semUsuario = (p) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");

async function listar(pasta, limite = 1000) {
  const { data, error } = await db.storage.from(BUCKET).list(pasta, { limit: limite, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(`listar ${semUsuario(pasta)}: ${error.message}`);
  return data ?? [];
}

// Procura, pessoa por pessoa, um mp3 (de preferência a voz de IA guardada, voz-*.mp3) e um
// mp4 (upload do Você ou clipe; na falta, um vídeo pronto). Para no primeiro de cada.
async function acharArquivos() {
  const achados = { mp3: null, mp4: null };
  const pessoas = (await listar("uploads", 200)).filter((f) => !f.id).map((f) => f.name);
  for (const pessoa of pessoas) {
    const arquivos = (await listar(`uploads/${pessoa}`)).filter((f) => f.id);
    const vozIa = arquivos.find((f) => /^voz-.*\.mp3$/.test(f.name));
    const mp3 = vozIa ?? arquivos.find((f) => f.name.endsWith(".mp3"));
    const mp4 = arquivos.find((f) => f.name.endsWith(".mp4"));
    if (mp3 && !achados.mp3) achados.mp3 = { caminho: `uploads/${pessoa}/${mp3.name}`, bytes: mp3.metadata?.size ?? null };
    if (mp4 && !achados.mp4) achados.mp4 = { caminho: `uploads/${pessoa}/${mp4.name}`, bytes: mp4.metadata?.size ?? null };
    if (achados.mp3 && achados.mp4) break;
  }
  if (!achados.mp4) {
    for (const pessoa of pessoas) {
      const prontos = (await listar(`${pessoa}/videos`, 50)).filter((f) => f.id && f.name.endsWith(".mp4"));
      if (prontos[0]) {
        achados.mp4 = { caminho: `${pessoa}/videos/${prontos[0].name}`, bytes: prontos[0].metadata?.size ?? null };
        break;
      }
    }
  }
  return achados;
}

/** Uma requisição crua (node:https): o cabeçalho Origin vai exatamente como escrito. Lê só os
 *  cabeçalhos e corta o corpo -- um vídeo inteiro não precisa descer pra saber do CORS. */
function pedir(url, metodo, cabecalhos) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: metodo, headers: cabecalhos }, (res) => {
      const h = res.headers;
      resolve({ status: res.statusCode, h });
      res.destroy();
    });
    req.setTimeout(30_000, () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end();
  });
}

const linha = (rotulo, r, extras) =>
  `  ${rotulo.padEnd(34)} status ${String(r.status).padEnd(4)} ACAO=${r.h["access-control-allow-origin"] ?? "(ausente)"} · content-type=${r.h["content-type"] ?? "(ausente)"}${extras ? " · " + extras : ""}`;

const achados = await acharArquivos();
let semCors = 0;
for (const tipo of ["mp3", "mp4"]) {
  const a = achados[tipo];
  if (!a) {
    console.log(`\n${tipo}: nenhum arquivo encontrado no bucket`);
    continue;
  }
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(a.caminho, 600);
  if (error || !data?.signedUrl) {
    console.log(`\n${tipo}: não consegui assinar (${error?.message ?? "sem URL"})`);
    continue;
  }
  const url = data.signedUrl;
  console.log(`\n${tipo}: ${semUsuario(a.caminho)} (${a.bytes ?? "?"} bytes) · host ${new URL(url).host}`);
  for (const origem of ORIGENS) {
    console.log(` Origin: ${origem}`);
    const get = await pedir(url, "GET", { Origin: origem });
    console.log(linha("GET", get, `content-length=${get.h["content-length"] ?? "?"} · accept-ranges=${get.h["accept-ranges"] ?? "(ausente)"}`));
    const faixa = await pedir(url, "GET", { Origin: origem, Range: "bytes=0-1023" });
    console.log(linha("GET Range bytes=0-1023", faixa, `content-range=${faixa.h["content-range"] ?? "(ausente)"} · expose-headers=${faixa.h["access-control-expose-headers"] ?? "(ausente)"}`));
    const pre = await pedir(url, "OPTIONS", { Origin: origem, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "range" });
    console.log(linha("OPTIONS (preflight GET + range)", pre, `allow-methods=${pre.h["access-control-allow-methods"] ?? "(ausente)"} · allow-headers=${pre.h["access-control-allow-headers"] ?? "(ausente)"}`));
    for (const r of [get, faixa, pre]) {
      const acao = r.h["access-control-allow-origin"];
      if (!(acao === "*" || acao === origem)) semCors++;
    }
  }
}
console.log(semCors ? `\n${semCors} resposta(s) SEM Access-Control-Allow-Origin para a origem pedida` : "\nCORS ok: toda resposta libera a origem pedida");
process.exitCode = semCors ? 1 : 0;
