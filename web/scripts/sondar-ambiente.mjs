// O que esta máquina tem pra rodar o ffmpeg de PRODUÇÃO (Linux) localmente.
//
// A produção usa um ffmpeg Linux baixado no build (scripts/ffmpeg-linux.mjs: 7.x ou master),
// e os testes locais usam o ffmpeg-static 6.1.1. Receita de áudio medida num e não no outro
// é receita não medida (docs/planos/linha-do-tempo-spec.md, P0 "Production binary
// decision"). Rodar o binário Linux aqui exige WSL ou Docker; este script só registra o que
// existe -- não instala, não baixa, não liga nada.
//
//   node scripts/sondar-ambiente.mjs

import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

/** Saída de um comando, ou o motivo de não ter saída. O `wsl.exe` escreve em UTF-16. */
function rodar(cmd, args) {
  const r = spawnSync(cmd, args, { timeout: 30_000, windowsHide: true });
  if (r.error) return { ok: false, texto: r.error.code === "ENOENT" ? "não instalado (comando não encontrado)" : r.error.message };
  const bruto = Buffer.concat([r.stdout ?? Buffer.alloc(0), r.stderr ?? Buffer.alloc(0)]);
  const utf16 = bruto.length > 1 && bruto.subarray(0, 200).filter((b) => b === 0).length > 20;
  const texto = (utf16 ? bruto.toString("utf16le") : bruto.toString("utf8")).replace(/\0/g, "").replace(/\r/g, "").trim();
  return { ok: r.status === 0, status: r.status, texto: texto || "(sem saída)" };
}

const primeira = (t) => t.split("\n").find((l) => l.trim()) ?? t;

console.log(`sondado em ${new Date().toISOString()} · ${process.platform} ${process.arch} · node ${process.version}`);

const wsl = rodar("wsl", ["--status"]);
console.log(`\nwsl --status (saída ${wsl.status ?? "-"}):\n  ${wsl.texto.split("\n").join("\n  ")}`);

const docker = rodar("docker", ["--version"]);
console.log(`\ndocker --version (saída ${docker.status ?? "-"}):\n  ${primeira(docker.texto)}`);

const estatico = rodar(ffmpegStatic, ["-version"]);
console.log(`\nffmpeg-static (o dos testes locais):\n  ${primeira(estatico.texto)}`);

const doPath = rodar("ffmpeg", ["-version"]);
console.log(`\nffmpeg no PATH:\n  ${primeira(doPath.texto)}`);

console.log(
  `\nResumo: WSL ${wsl.ok ? "disponível" : "indisponível"} · Docker ${docker.ok ? "disponível" : "indisponível"} · ffmpeg local ${(/ffmpeg version (\S+)/.exec(estatico.texto) ?? [])[1] ?? "?"}` +
    (wsl.ok || docker.ok ? "" : " → o binário Linux da produção não roda aqui sem baixar um build win64 da mesma versão (decisão do dono).")
);
