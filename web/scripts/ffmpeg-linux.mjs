// Baixa o ffmpeg estático de Linux pra bin/ffmpeg ANTES do `next build`. Roda no build
// da Vercel (linux) e é ignorado no Windows, onde o ffmpeg-static do npm já serve.
//
// Por que não o binário do pacote ffmpeg-static: o build linux dele NÃO tem drawtext
// (sem libfreetype) -- descoberto no primeiro vídeo em produção, 12/09/2026:
// "No such filter: 'drawtext'". E o npm da Vercel bloqueia o script de instalação do
// pacote de qualquer jeito. Aqui o download é parte explícita do build: tenta as
// fontes na ordem, confere que o binário roda E tem drawtext, e falha alto explicando
// o que viu. O binário entra no bundle da função via outputFileTracingIncludes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "bin", "ffmpeg");

// Ordem: menor primeiro. Todos são builds estáticos com libfreetype.
const FONTES = [
  { nome: "johnvansickle", url: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz", padrao: "*/ffmpeg" },
  { nome: "BtbN", url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz", padrao: "*/bin/ffmpeg" },
];

function diagnostico(bin) {
  try {
    const versao = execFileSync(bin, ["-version"], { stdio: ["ignore", "pipe", "pipe"] }).toString().split("\n")[0];
    const filtros = execFileSync(bin, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return { roda: true, versao, drawtext: /\bdrawtext\b/.test(filtros), zoompan: /\bzoompan\b/.test(filtros), xfade: /\bxfade\b/.test(filtros) };
  } catch (e) {
    return { roda: false, erro: String(e?.stderr ?? e?.message ?? e).slice(0, 300) };
  }
}

if (process.platform !== "linux") {
  console.log("[ffmpeg-linux] não é linux, pulando");
  process.exit(0);
}
if (fs.existsSync(destino)) {
  const d = diagnostico(destino);
  if (d.roda && d.drawtext) {
    console.log("[ffmpeg-linux] já existe:", d.versao);
    process.exit(0);
  }
  console.log("[ffmpeg-linux] o bin/ffmpeg existente não serve:", JSON.stringify(d));
}

fs.mkdirSync(path.dirname(destino), { recursive: true });
let ok = false;
for (const fonte of FONTES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ffmpeg-"));
  try {
    console.log(`[ffmpeg-linux] baixando (${fonte.nome})`, fonte.url);
    const r = await fetch(fonte.url, { redirect: "follow" });
    if (!r.ok) {
      console.log(`[ffmpeg-linux] ${fonte.nome}: download falhou (${r.status})`);
      continue;
    }
    const tarLocal = path.join(tmp, "ffmpeg.tar.xz");
    fs.writeFileSync(tarLocal, Buffer.from(await r.arrayBuffer()));
    console.log(`[ffmpeg-linux] ${fonte.nome}: ${Math.round(fs.statSync(tarLocal).size / 1e6)} MB, extraindo`);
    execFileSync("tar", ["-xJf", tarLocal, "-C", tmp, "--wildcards", fonte.padrao], { stdio: "inherit" });
    const achado = acharBinario(tmp);
    if (!achado) {
      console.log(`[ffmpeg-linux] ${fonte.nome}: o tar não trouxe o binário`);
      continue;
    }
    fs.chmodSync(achado, 0o755);
    const d = diagnostico(achado);
    console.log(`[ffmpeg-linux] ${fonte.nome}:`, JSON.stringify(d));
    if (!d.roda || !d.drawtext) continue;
    fs.copyFileSync(achado, destino);
    fs.chmodSync(destino, 0o755);
    ok = true;
    console.log(`[ffmpeg-linux] ok (${fonte.nome}),`, Math.round(fs.statSync(destino).size / 1e6), "MB");
    break;
  } catch (e) {
    console.log(`[ffmpeg-linux] ${fonte.nome}: erro`, e instanceof Error ? e.message : e);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
if (!ok) {
  console.error("[ffmpeg-linux] nenhuma fonte deu um ffmpeg com drawtext");
  process.exit(1);
}

function acharBinario(dir) {
  const pilha = [dir];
  while (pilha.length) {
    const atual = pilha.pop();
    for (const ent of fs.readdirSync(atual, { withFileTypes: true })) {
      const p = path.join(atual, ent.name);
      if (ent.isDirectory()) pilha.push(p);
      else if (ent.name === "ffmpeg") return p;
    }
  }
  return null;
}
