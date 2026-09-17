import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

// ---- versão do binário ----
//
// O ffmpeg do desenvolvimento (ffmpeg-static 6.1.1) e o de produção (o estático que o
// build baixa: 7.x do johnvansickle ou master do BtbN) não recebem um grafo de filtros
// grande do mesmo jeito. Do 7 em diante a forma é `-/filter_complex arquivo`; antes,
// `-filter_complex_script arquivo`. Rodar `-version` uma vez por processo e guardar:
// a montagem chama o ffmpeg várias vezes na mesma função.
let versaoGuardada: number | null = null;

/** Versão MAIOR do ffmpeg em uso. Build de master conta 99; o que não der pra ler, 6. */
export function versaoDoFfmpeg(): number {
  if (versaoGuardada !== null) return versaoGuardada;
  let saida = "";
  try {
    saida = String(execFileSync(caminhoFfmpeg(), ["-version"], { timeout: 20_000, maxBuffer: 1024 * 1024 }));
  } catch {
    saida = "";
  }
  const m = saida.match(/ffmpeg version n?(\d+)\./);
  versaoGuardada = m ? Number(m[1]) : /version N-/.test(saida) ? 99 : 6;
  return versaoGuardada;
}

/** Só pros testes: esquece a versão lida, pra medir com outro binário na mesma execução. */
export function esquecerVersaoDoFfmpeg(): void {
  versaoGuardada = null;
}

/** Acima disto o grafo vai pra um arquivo: a linha de comando tem teto no sistema. */
export const LIMITE_DO_GRAFO = 20_000;

/**
 * Grafo de filtros grande não cabe na linha de comando -- com 16 trechos de áudio e
 * 120 legendas ele passa de 20 KB, e o sistema recusa o processo (E2BIG no Linux, e no
 * Windows o limite é ainda menor). Nesse caso o grafo vai pra um arquivo temporário e o
 * ffmpeg o lê de lá.
 */
function grafoEmArquivo(args: string[]): { args: string[]; arquivo: string | null } {
  const i = args.indexOf("-filter_complex");
  if (i < 0 || (args[i + 1]?.length ?? 0) <= LIMITE_DO_GRAFO) return { args, arquivo: null };
  const arquivo = path.join(os.tmpdir(), `encena-grafo-${randomUUID()}.txt`);
  fs.writeFileSync(arquivo, args[i + 1]);
  const opcao = versaoDoFfmpeg() >= 7 ? "-/filter_complex" : "-filter_complex_script";
  return { args: [...args.slice(0, i), opcao, arquivo, ...args.slice(i + 2)], arquivo };
}

/**
 * Roda o ffmpeg e devolve quando terminar. Sempre com timeout: um ffmpeg pendurado
 * numa função serverless come o tempo inteiro da função e ainda deixa o vídeo preso.
 * O stderr fica guardado pra mensagem de erro, com as últimas linhas (é onde o ffmpeg
 * explica o que não gostou).
 */
export function rodarFfmpeg(args: string[], timeoutMs = 240_000): Promise<{ segundos: number }> {
  const inicio = Date.now();
  const preparado = grafoEmArquivo(args);
  return new Promise<{ segundos: number }>((resolve, reject) => {
    execFile(caminhoFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-nostdin", ...preparado.args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (erro, _stdout, stderr) => {
      if (erro) {
        const cauda = String(stderr ?? "").trim().split("\n").slice(-6).join(" | ");
        reject(new Error(`ffmpeg falhou (${erro.message.slice(0, 80)}): ${cauda.slice(0, 500)}`));
        return;
      }
      resolve({ segundos: (Date.now() - inicio) / 1000 });
    });
  }).finally(() => {
    if (preparado.arquivo) {
      try {
        fs.rmSync(preparado.arquivo, { force: true });
      } catch {
        // arquivo temporário que não sai não derruba a montagem
      }
    }
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
