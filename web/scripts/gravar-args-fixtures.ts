// Grava os COMANDOS DO FFMPEG de hoje para casos fixos, antes de mexer na montagem.
//
// Fase 1 da linha do tempo (docs/planos/linha-do-tempo-faixas.md): o relógio novo e os
// consertos não podem mudar nada além do que é conserto. Este arquivo congela "como era":
// scripts/testar-relogio.ts compara cada comando de depois com o de antes, e só os casos
// marcados como conserto podem diferir (e a diferença é conferida à mão, no próprio teste).
//
//   node --import ./scripts/ts-direto.mjs scripts/gravar-args-fixtures.ts
//
// Rodar SÓ no commit de antes da mudança. Rodar de novo depois apagaria a prova.

import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;
const { casosDeArgs } = await import("./fixtures/casos-de-args.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
const saida = path.join(RAIZ, "scripts", "fixtures", "args-antes.json");
if (fs.existsSync(saida) && !process.argv.includes("--sobrescrever")) {
  console.error("args-antes.json já existe. Ele é a prova do ANTES; use --sobrescrever só se souber o que faz.");
  process.exit(1);
}
const casos = casosDeArgs();
fs.writeFileSync(saida, JSON.stringify(casos, null, 1));
console.log(`${Object.keys(casos).length} casos gravados em scripts/fixtures/args-antes.json`);
