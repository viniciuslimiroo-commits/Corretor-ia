// Grava o que o SANEADOR de hoje devolve para especs fixos, antes de ensinar a ele o áudio
// em blocos (docs/planos/linha-do-tempo-spec.md, pacote P0; invariante I4).
//
// Para cada espec de scripts/fixtures/especs-antigas.ts -- os escritos à mão e os 300
// sorteados -- guarda `JSON.stringify(limparEspec(espec).espec)` com o nome dele. Depois da
// mudança, todo espec sem `audios` tem que sair desta mesma string, byte a byte: um campo
// que some, muda de ordem ou ganha padrão novo aparece aqui, e não num vídeo de cliente.
//
//   node --import ./scripts/ts-direto.mjs scripts/gravar-especs-fixtures.ts
//   node --import ./scripts/ts-direto.mjs scripts/gravar-especs-fixtures.ts --saida <arquivo>
//
// Rodar SÓ no commit de antes da mudança. Rodar de novo depois apagaria a prova; por isso
// recusa sobrescrever sem --sobrescrever.

import fs from "node:fs";
import path from "node:path";
import { limparEspec } from "../src/lib/video.ts";
import { ESPECS_ANTIGAS, especsSorteadas } from "./fixtures/especs-antigas.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const i = process.argv.indexOf("--saida");
const saida = i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(RAIZ, "scripts", "fixtures", "especs-saneadas-antes.json");
if (fs.existsSync(saida) && !process.argv.includes("--sobrescrever")) {
  console.error(`${path.basename(saida)} já existe. Ele é a prova do ANTES; use --sobrescrever só se souber o que faz.`);
  process.exit(1);
}

const sorteados = especsSorteadas();
const aMao = Object.keys(ESPECS_ANTIGAS);
const repetidos = aMao.filter((nome) => nome in sorteados);
if (repetidos.length) {
  console.error(`Nome repetido entre os casos à mão e os sorteados: ${repetidos.join(", ")}`);
  process.exit(1);
}

const gravado: Record<string, string> = {};
let recusados = 0;
for (const [nome, espec] of Object.entries({ ...ESPECS_ANTIGAS, ...sorteados })) {
  const r = limparEspec(espec);
  // Espec recusado também é prova: o saneador tem que continuar recusando (grava "null").
  if (!r.espec) recusados++;
  gravado[nome] = JSON.stringify(r.espec);
}
// Os casos à mão foram escritos pra passar: um recusado ali é caso mal escrito, não prova.
const aMaoRecusados = aMao.filter((nome) => gravado[nome] === "null");
if (aMaoRecusados.length) {
  console.error(`O saneador recusou casos escritos à mão: ${aMaoRecusados.join(", ")}`);
  process.exit(1);
}

fs.writeFileSync(saida, JSON.stringify(gravado, null, 1));
console.log(`${aMao.length} casos à mão + ${Object.keys(sorteados).length} sorteados (${recusados} recusados pelo saneador) gravados em ${path.relative(RAIZ, saida).replace(/\\/g, "/")}`);
