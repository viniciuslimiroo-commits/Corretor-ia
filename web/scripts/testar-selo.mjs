// Verifica o selo de imagem ilustrativa FORA do app -- mesma ideia do
// testar-exposicao.mjs: medir com número, não olhar e achar bonito.
//
// O risco real que este teste cobre: o texto do SVG é desenhado pelo librsvg usando
// FONTE DO SISTEMA. Se nenhuma fonte da lista existir na máquina (e o servidor de
// produção é outro sistema operacional), a caixa preta aparece e o texto NÃO -- um
// carimbo vazio, que passa despercebido em revisão de código e em screenshot pequeno.
// Por isso o teste não pergunta "mudou alguma coisa?", e sim "tem pixel claro DENTRO
// da caixa?", que é a assinatura de texto branco renderizado de verdade.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { aplicarSelo, SELOS } from "../src/lib/selo.ts";

// Caminhos ancorados na pasta DO SCRIPT, nao no diretorio de onde ele foi chamado --
// rodar de web/ e rodar de web/scripts/ tem que dar o mesmo resultado.
const RAIZ = path.resolve(import.meta.dirname, "../..");
const ENTRADA =
  process.argv[2] || path.join(RAIZ, "docs/pipeline-teste/resultados/01_mobiliar_nanobanana.jpg");
const PASTA_SAIDA = path.join(RAIZ, "docs/pipeline-teste/resultados");

// Recorta o canto inferior direito (onde o selo mora) e conta pixels quase-brancos.
async function medirCanto(buffer) {
  const meta = await sharp(buffer).metadata();
  const largura = Math.round(meta.width * 0.45);
  const altura = Math.round(meta.height * 0.12);
  const { data } = await sharp(buffer)
    .extract({
      left: meta.width - largura,
      top: meta.height - altura,
      width: largura,
      height: altura,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let claros = 0;
  let escuros = 0;
  for (const v of data) {
    if (v > 215) claros++;
    if (v < 60) escuros++;
  }
  return {
    claros: claros / data.length,
    escuros: escuros / data.length,
    total: data.length,
  };
}

const original = fs.readFileSync(ENTRADA);
const metaOriginal = await sharp(original).metadata();
console.log(`Entrada: ${path.basename(ENTRADA)} (${metaOriginal.width}x${metaOriginal.height})\n`);

const antes = await medirCanto(original);
console.log(
  `canto ANTES do selo: claros=${(antes.claros * 100).toFixed(2)}% escuros=${(
    antes.escuros * 100
  ).toFixed(2)}%\n`
);

let falhas = 0;

for (const [acao, texto] of Object.entries(SELOS)) {
  const selado = await aplicarSelo(original, texto);

  if (texto === null) {
    const igual = Buffer.compare(original, selado) === 0;
    console.log(`${acao.padEnd(16)} sem selo (esperado) -> bytes intactos: ${igual ? "sim" : "NAO"}`);
    if (!igual) falhas++;
    continue;
  }

  const depois = await medirCanto(selado);
  const ganhoEscuro = depois.escuros - antes.escuros; // a caixa preta translucida
  const ganhoClaro = depois.claros - antes.claros; // o texto branco

  // A caixa tem que escurecer o canto E o texto tem que acender pixels claros dentro
  // dela. Só o primeiro = caixa sem texto (fonte faltando). Só o segundo = nao rolou.
  const caixaOk = ganhoEscuro > 0.005;
  const textoOk = ganhoClaro > 0.0008;
  const ok = caixaOk && textoOk;
  if (!ok) falhas++;

  const saida = path.join(PASTA_SAIDA, `selo-${acao}.jpg`);
  fs.writeFileSync(saida, selado);

  console.log(
    `${acao.padEnd(16)} caixa ${caixaOk ? "ok" : "FALHOU"} (+${(ganhoEscuro * 100).toFixed(
      2
    )}% escuro)  texto ${textoOk ? "ok" : "FALHOU"} (+${(ganhoClaro * 100).toFixed(
      3
    )}% claro)  -> ${path.basename(saida)}`
  );
}

console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
