// Grava os COMANDOS DO FFMPEG de hoje para casos fixos, antes de mexer na montagem.
//
// Fase 1 da linha do tempo (docs/planos/linha-do-tempo-faixas.md): o relógio novo e os
// consertos não podem mudar nada além do que é conserto. Este arquivo congela "como era":
// scripts/testar-relogio.ts compara cada comando de depois com o de antes, e só os casos
// marcados como conserto podem diferir (e a diferença é conferida à mão, no próprio teste).
//
//   node --import ./scripts/ts-direto.mjs scripts/gravar-args-fixtures.ts
//
// Outro conjunto de casos, noutro arquivo (a linha do tempo, docs/planos/linha-do-tempo-spec.md):
//
//   node --import ./scripts/ts-direto.mjs scripts/gravar-args-fixtures.ts --casos scripts/fixtures/casos-de-args-fase3.ts --saida scripts/fixtures/args-fase3-antes.json
//
// O módulo de casos exporta `casosDeArgs()`. Caminhos relativos valem a partir da pasta de
// onde roda (web/).
//
// Rodar SÓ no commit de antes da mudança. Rodar de novo depois apagaria a prova.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegStatic from "ffmpeg-static";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

const RAIZ = path.resolve(import.meta.dirname, "..");
const valorDe = (nome: string) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const casosPedidos = valorDe("--casos");
const saidaPedida = valorDe("--saida");
// Sem --saida, casos de outro módulo iriam parar em cima de args-antes.json.
if (!!casosPedidos !== !!saidaPedida) {
  console.error("Use --casos e --saida juntos (ou nenhum dos dois, pro conjunto de sempre).");
  process.exit(1);
}
const modulo = casosPedidos ? path.resolve(casosPedidos) : path.join(RAIZ, "scripts", "fixtures", "casos-de-args.ts");
const saida = saidaPedida ? path.resolve(saidaPedida) : path.join(RAIZ, "scripts", "fixtures", "args-antes.json");
const nome = path.basename(saida);
if (fs.existsSync(saida) && !process.argv.includes("--sobrescrever")) {
  console.error(`${nome} já existe. Ele é a prova do ANTES; use --sobrescrever só se souber o que faz.`);
  process.exit(1);
}
const { casosDeArgs } = (await import(pathToFileURL(modulo).href)) as { casosDeArgs: () => Record<string, string[]> };
const casos = casosDeArgs();
fs.writeFileSync(saida, JSON.stringify(casos, null, 1));
console.log(`${Object.keys(casos).length} casos gravados em ${path.relative(RAIZ, saida).replace(/\\/g, "/")}`);
