import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Onde está o ffmpeg e como rodá-lo. Em produção (Linux) é o binário estático que o
// build baixou pra bin/ffmpeg (scripts/ffmpeg-linux.mjs); no Windows de desenvolvimento
// é o do pacote ffmpeg-static. FFMPEG_PATH em env ganha dos dois, pra testar um build
// diferente sem mexer em código.

export function caminhoFfmpeg(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const local = path.join(process.cwd(), "bin", "ffmpeg");
  if (process.platform !== "win32" && fs.existsSync(local)) return local;
  // require dinâmico: o pacote resolve pro .exe no Windows e pro binário no Linux
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const doPacote = require("ffmpeg-static") as string | null;
  if (doPacote && fs.existsSync(doPacote)) return doPacote;
  throw new Error("ffmpeg não encontrado: nem bin/ffmpeg nem ffmpeg-static.");
}

/** Fonte usada pelo drawtext (Geist, OFL), empacotada em assets/fontes. */
export function caminhoFonte(): string {
  return path.join(process.cwd(), "assets", "fontes", "Geist-SemiBold.ttf");
}

/**
 * Roda o ffmpeg e devolve quando terminar. Sempre com timeout: um ffmpeg pendurado
 * numa função serverless come o tempo inteiro da função e ainda deixa o vídeo preso.
 * O stderr fica guardado pra mensagem de erro, com as últimas linhas (é onde o ffmpeg
 * explica o que não gostou).
 */
export function rodarFfmpeg(args: string[], timeoutMs = 240_000): Promise<{ segundos: number }> {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    execFile(caminhoFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-nostdin", ...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (erro, _stdout, stderr) => {
      if (erro) {
        const cauda = String(stderr ?? "").trim().split("\n").slice(-6).join(" | ");
        reject(new Error(`ffmpeg falhou (${erro.message.slice(0, 80)}): ${cauda.slice(0, 500)}`));
        return;
      }
      resolve({ segundos: (Date.now() - inicio) / 1000 });
    });
  });
}

/** Sonda um arquivo de mídia com o próprio ffmpeg (sem ffprobe no pacote estático). */
export function sondarMidia(arquivo: string): Promise<{ duracao: number | null; largura: number | null; altura: number | null; temAudio: boolean }> {
  return new Promise((resolve) => {
    execFile(caminhoFfmpeg(), ["-hide_banner", "-nostdin", "-i", arquivo], { timeout: 20_000 }, (_e, _o, stderr) => {
      const s = String(stderr ?? "");
      const dur = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const dim = s.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
      resolve({
        duracao: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
        largura: dim ? Number(dim[1]) : null,
        altura: dim ? Number(dim[2]) : null,
        temAudio: /Audio:/.test(s),
      });
    });
  });
}
