// O selo de imagem ilustrativa, medido com número em vez de olhado -- mesma ideia do
// testar-exposicao.mjs. Duas metades:
//
// 1. CARIMBAR. O risco real: o texto do SVG é desenhado pelo librsvg com FONTE DO
//    SISTEMA. Se nenhuma fonte da lista existir na máquina (e o servidor de produção é
//    outro sistema operacional), a caixa preta aparece e o texto NÃO -- um carimbo
//    vazio, que passa despercebido em revisão de código e em screenshot pequeno. Por
//    isso o teste não pergunta "mudou alguma coisa?", e sim "tem pixel claro DENTRO da
//    caixa?", que é a assinatura de texto branco renderizado de verdade.
//
// 2. COBRIR A CAIXA antes de a imagem voltar pra IA (refinar, obra encadeada). O que se
//    confere: a caixa some de fato (os pixels escuros dela desaparecem), o texto some,
//    o RESTO da imagem não é tocado, e o remendo não é uma cópia espelhada do que está
//    acima (a versão anterior era, e o chevron no piso aparecia na imagem final).
//
// Roda em resultados REAIS do app, já carimbados por ele, em docs/testes-reais/. Os
// rodapés antes/depois ficam em docs/testes-reais/selo/ pra conferência a olho.
//
//   node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-selo.mjs

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { aplicarSelo, geometriaDoSelo, limparFaixaDoSelo } from "../src/lib/selo.ts";
import { ACOES } from "../src/lib/acoes.ts";
import { ETAPAS_OBRA } from "../src/lib/obra-etapas.ts";

// Caminhos ancorados na pasta DO SCRIPT, não no diretório de onde ele foi chamado.
const RAIZ = path.resolve(import.meta.dirname, "../..");
const SAIDA = path.join(RAIZ, "docs/testes-reais/selo");
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Fração de pixels quase-brancos e quase-pretos num retângulo. */
async function medir(buffer, ret) {
  const { data } = await sharp(buffer).extract(ret).greyscale().raw().toBuffer({ resolveWithObject: true });
  let claros = 0;
  let escuros = 0;
  for (const v of data) {
    if (v > 215) claros++;
    if (v < 60) escuros++;
  }
  return { claros: claros / data.length, escuros: escuros / data.length };
}

/** Diferença média absoluta entre dois recortes iguais (0 = idêntico). */
async function diferenca(a, b, ret) {
  const [da, db] = await Promise.all([a, b].map((x) => sharp(x).extract(ret).greyscale().raw().toBuffer()));
  let soma = 0;
  for (let i = 0; i < da.length; i++) soma += Math.abs(da[i] - db[i]);
  return soma / da.length;
}

/**
 * Nitidez de um retângulo: diferença média entre pixels vizinhos. Foto nítida = alta;
 * borrão = baixa. É como se distingue o remendo desfocado (o que se quer) de uma cópia
 * espelhada do trecho acima (o que a versão anterior fazia, e aparecia na imagem final):
 * a cópia tem a MESMA nitidez do original.
 */
async function nitidez(buffer, ret) {
  const { data, info } = await sharp(buffer).extract(ret).greyscale().raw().toBuffer({ resolveWithObject: true });
  let soma = 0;
  let n = 0;
  for (let y = 0; y < info.height - 1; y++) {
    for (let x = 0; x < info.width - 1; x++) {
      const i = y * info.width + x;
      soma += Math.abs(data[i] - data[i + 1]) + Math.abs(data[i] - data[i + info.width]);
      n += 2;
    }
  }
  return soma / n;
}

async function rodape(buffer, arquivo) {
  const m = await sharp(buffer).metadata();
  const h = Math.round(m.height * 0.2);
  await sharp(buffer).extract({ left: 0, top: m.height - h, width: m.width, height: h }).jpeg({ quality: 88 }).toFile(arquivo);
}

// ---------------------------------------------------------------------------------
console.log("--- carimbar: todo texto do catálogo, numa foto real sem selo ---");
const SEM_SELO = path.join(RAIZ, "docs/testes-reais/refinar/00-original.jpg");
const original = fs.readFileSync(SEM_SELO);
const meta = await sharp(original).metadata();
console.log(`foto: ${path.relative(RAIZ, SEM_SELO)} (${meta.width}x${meta.height})`);

const textos = new Map();
for (const a of ACOES) textos.set(a.id, a.selo);
for (const e of ETAPAS_OBRA) textos.set(e.id, e.selo);

for (const [acao, texto] of textos) {
  const selado = await aplicarSelo(original, texto);
  if (texto === null) {
    conferir(Buffer.compare(original, selado) === 0, `${acao}: sem selo, bytes intactos`);
    continue;
  }
  const g = geometriaDoSelo(meta.width, meta.height, texto);
  const caixa = { left: g.left, top: g.top, width: g.larguraCaixa, height: g.alturaCaixa };
  const antes = await medir(original, caixa);
  const depois = await medir(selado, caixa);
  // A caixa tem que escurecer E tem que haver pixel claro dentro dela DEPOIS. O claro é
  // medido em absoluto, não como ganho: a caixa é 55% preta, então o que era branco na
  // foto vira cinza médio (255 × 0,45 = 115), e pixel claro dentro dela só pode ser texto.
  // Medir o ganho enganava quando a foto tinha piso claro debaixo da caixa -- o texto
  // acendia 6% e a caixa apagava outros 6%, e a soma dava zero com o selo perfeito.
  // Só escureceu = caixa sem texto (fonte faltando). Só claro = não carimbou.
  conferir(
    depois.escuros - antes.escuros > 0.15 && depois.claros > 0.02,
    `${acao}: caixa e texto`,
    `escuro +${((depois.escuros - antes.escuros) * 100).toFixed(0)}% claro ${(depois.claros * 100).toFixed(1)}%`
  );
}

// ---------------------------------------------------------------------------------
console.log("\n--- cobrir a caixa: em resultados reais já carimbados pelo app ---");
const casos = [
  ["refinar/01-mobiliada.jpg", "Imagem ilustrativa · mobília virtual"],
  ["obra/02-estrutura.jpg", "Imagem ilustrativa · obra simulada, não existe no terreno"],
  ["obra/04-pronta.jpg", "Imagem ilustrativa · casa sugerida, não incluída no terreno"],
];
for (const [rel, texto] of casos) {
  const arquivo = path.join(RAIZ, "docs/testes-reais", rel);
  const selado = fs.readFileSync(arquivo);
  const m = await sharp(selado).metadata();
  const g = geometriaDoSelo(m.width, m.height, texto);
  const caixa = { left: g.left, top: g.top, width: g.larguraCaixa, height: g.alturaCaixa };
  const nome = rel.replace("/", "-").replace(/\.jpg$/, "");

  const limpo = await limparFaixaDoSelo(selado, texto);
  await rodape(selado, path.join(SAIDA, `${nome}-antes.jpg`));
  await rodape(limpo, path.join(SAIDA, `${nome}-depois.jpg`));

  const antes = await medir(selado, caixa);
  const depois = await medir(limpo, caixa);
  conferir(depois.escuros < antes.escuros * 0.25, `${rel}: a caixa escura sumiu`, `escuros ${(antes.escuros * 100).toFixed(0)}% → ${(depois.escuros * 100).toFixed(1)}%`);
  conferir(depois.claros < 0.01, `${rel}: o texto branco sumiu`, `claros ${(depois.claros * 100).toFixed(2)}%`);

  // O resto da imagem: a metade de cima e a faixa do rodapé À ESQUERDA da caixa têm que
  // ficar como estavam (só o ruído do JPEG re-salvo).
  const metadeDeCima = { left: 0, top: 0, width: m.width, height: Math.floor(m.height / 2) };
  const rodapeEsquerdo = { left: 0, top: g.top, width: Math.max(1, g.left - g.margem * 2), height: m.height - g.top };
  conferir((await diferenca(selado, limpo, metadeDeCima)) < 2.5, `${rel}: a metade de cima não foi tocada`);
  conferir((await diferenca(selado, limpo, rodapeEsquerdo)) < 2.5, `${rel}: o rodapé fora da caixa não foi tocado`);

  // O remendo tem que ser um borrão, não uma cópia (espelhada ou não) do trecho acima.
  const acima = { ...caixa, top: caixa.top - caixa.height };
  const [nitidezRemendo, nitidezAcima] = await Promise.all([nitidez(limpo, caixa), nitidez(limpo, acima)]);
  conferir(
    nitidezAcima < 2 || nitidezRemendo < nitidezAcima * 0.4,
    `${rel}: o remendo é desfoque, não cópia do trecho acima`,
    `nitidez ${nitidezRemendo.toFixed(1)} vs ${nitidezAcima.toFixed(1)} acima`
  );
}

// Sem saber o texto ainda tem que remover o aviso (é o que não pode entrar no modelo).
{
  const arquivo = path.join(RAIZ, "docs/testes-reais/obra/02-estrutura.jpg");
  const selado = fs.readFileSync(arquivo);
  const m = await sharp(selado).metadata();
  const texto = "Imagem ilustrativa · obra simulada, não existe no terreno";
  const g = geometriaDoSelo(m.width, m.height, texto);
  const caixa = { left: g.left, top: g.top, width: g.larguraCaixa, height: g.alturaCaixa };
  const limpo = await limparFaixaDoSelo(selado, null);
  const depois = await medir(limpo, caixa);
  conferir(depois.claros < 0.01 && depois.escuros < 0.1, "sem texto: ainda remove o aviso (faixa inteira)", `claros ${(depois.claros * 100).toFixed(2)}% escuros ${(depois.escuros * 100).toFixed(1)}%`);
}

console.log(`\nrodapés antes/depois em ${path.relative(RAIZ, SAIDA)}`);
console.log(falhas === 0 ? "TODOS OK" : `${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
