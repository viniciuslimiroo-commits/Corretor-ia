// A LEITURA PEGA A ÁREA QUE ESTÁ ESCRITA NA PLANTA?
//
// Ele mandou em 13/10/2026 uma planta técnica brasileira comum -- cada cômodo com o nome em
// cima e a área embaixo, no formato `a=4.50 m²`. A leitura acertou os SEIS nomes e NENHUMA
// das seis áreas, e ainda respondeu que "esta planta não tem medidas escritas". Afirmar que
// a planta é incompleta quando ela não é é pior do que não ler: o corretor é informado de um
// defeito que não existe e vai digitar tudo na mão.
//
// POR QUE UMA BANCADA E NÃO UM AJUSTE DE PROMPT. Está escrito em `planta-lida.ts`, por mim
// mesmo, em 21/09/2026, depois de uma tentativa que melhorou duas plantas e derrubou uma
// terceira de 97% pra 64%:
//
//     "cada ajuste de prompt move o erro de lugar, e sem uma bancada que pontue VÁRIAS
//      plantas de uma vez, afinar aqui é trocar um acerto conhecido por outro desconhecido.
//      A próxima pessoa que sentir vontade de melhorar isto precisa primeiro da bancada,
//      não de uma frase melhor."
//
// A bancada que já existia (`experimento-ler-planta.ts`) mede LAYOUT, com plantas de controle
// desenhadas pelo próprio produto, e plantas reais alemãs de museu. Nenhuma delas escreve
// `a=X m²` em cada cômodo. Esta aqui mede a OUTRA coisa, no estilo que falhou.
//
// O gabarito é exato porque eu desenho as plantas: a área escrita no desenho é a área que eu
// calculei. A planta real dele entra junto, com as seis áreas digitadas da imagem.
//
//   node --import ./scripts/ts-direto.mjs scripts/bancada-area-escrita.ts
//   node --import ./scripts/ts-direto.mjs scripts/bancada-area-escrita.ts --so-real
//
// Custa uma chamada de visão por planta (frações de centavo). Não escreve no banco.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chamarSincrono } from "../src/lib/fal.ts";
import { SISTEMA_LEITURA, limparLeitura, type LeituraDaPlanta } from "../src/lib/planta-lida.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()] as [string, string])
);
// O MESMO que a rota usa, com o MESMO prompt e o MESMO teto de tokens. Medir com um modelo
// diferente do que roda em produção mede outra coisa -- e o flash-lite já foi reprovado aqui
// em setembro por devolver 3,40 onde estava 3,00, erro que sai parecendo número certo.
const MODELO = "google/gemini-2.5-flash";
const PEDIDO = "Read this floor plan and return the JSON described in the system prompt.";
const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), "bancada-planta-"));

type Peca = { nome: string; x: number; y: number; l: number; a: number };
type Caso = { rotulo: string; pecas: Peca[]; bytes?: Buffer };

/** Quanto a área lida pode errar e ainda contar como acerto. 5% é o erro de digitação. */
const TOLERANCIA = 0.05;

const areaDe = (p: Peca) => Math.round(p.l * p.a * 100) / 100;

/**
 * Desenha a planta no estilo brasileiro de verdade: parede preta grossa, nome do cômodo em
 * caixa alta e a área logo abaixo, em `a=X.XX m²`.
 *
 * Desenhada aqui e não pelo `plantaParaSvg` do produto de propósito: o renderizador do
 * produto escreve cota NA PAREDE, que é outro formato. O que falhou foi este, e a bancada
 * tem que reproduzir o que falhou.
 */
function desenhar(pecas: Peca[], escala = 110): string {
  const larg = Math.max(...pecas.map((p) => p.x + p.l)) + 0.4;
  const alt = Math.max(...pecas.map((p) => p.y + p.a)) + 0.4;
  const px = (v: number) => (v + 0.2) * escala;
  const corpo = pecas
    .map((p) => {
      const cx = px(p.x + p.l / 2);
      const cy = px(p.y + p.a / 2);
      return (
        `<rect x="${px(p.x)}" y="${px(p.y)}" width="${p.l * escala}" height="${p.a * escala}" fill="#ffffff" stroke="#111111" stroke-width="7"/>` +
        `<text x="${cx}" y="${cy - 4}" font-family="Arial" font-size="15" fill="#0b4fa0" text-anchor="middle">${p.nome.toUpperCase()}</text>` +
        `<text x="${cx}" y="${cy + 15}" font-family="Arial" font-size="12.5" fill="#0b4fa0" text-anchor="middle">a=${areaDe(p).toFixed(2)} m²</text>`
      );
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px(larg)}" height="${px(alt)}"><rect width="100%" height="100%" fill="#ffffff"/>${corpo}</svg>`;
}

// ---- as plantas da bancada ----
//
// Variadas de propósito: quantidade de cômodos, nomes com e sem número, área de 2 a 25 m²,
// e uma com nome composto ("Sala de estar / jantar"), que é onde o casamento por nome falha.
const CASOS: Caso[] = [
  {
    rotulo: "2 quartos (igual à dele)",
    pecas: [
      { nome: "Serviço", x: 0, y: 0, l: 1.8, a: 2.5 },
      { nome: "Cozinha", x: 0, y: 2.5, l: 2.7, a: 2.5 },
      { nome: "BWC", x: 2.7, y: 2.5, l: 1.5, a: 2.0 },
      { nome: "Quarto", x: 4.2, y: 2.5, l: 3.0, a: 3.33 },
      { nome: "Sala de estar / jantar", x: 0, y: 5.0, l: 3.4, a: 4.86 },
      { nome: "Quarto 2", x: 3.4, y: 5.0, l: 3.8, a: 3.36 },
    ],
  },
  {
    rotulo: "quitinete, 3 cômodos",
    pecas: [
      { nome: "Sala", x: 0, y: 0, l: 4.0, a: 3.5 },
      { nome: "Cozinha", x: 4.0, y: 0, l: 2.2, a: 2.0 },
      { nome: "Banheiro", x: 4.0, y: 2.0, l: 2.2, a: 1.5 },
    ],
  },
  {
    rotulo: "casa 7 cômodos",
    pecas: [
      { nome: "Varanda", x: 0, y: 0, l: 4.5, a: 1.8 },
      { nome: "Sala", x: 0, y: 1.8, l: 4.5, a: 3.6 },
      { nome: "Cozinha", x: 4.5, y: 1.8, l: 3.0, a: 2.6 },
      { nome: "Área de serviço", x: 4.5, y: 0, l: 3.0, a: 1.8 },
      { nome: "Quarto 1", x: 0, y: 5.4, l: 3.2, a: 3.1 },
      { nome: "Quarto 2", x: 3.2, y: 5.4, l: 2.9, a: 3.1 },
      { nome: "Banheiro", x: 6.1, y: 5.4, l: 1.4, a: 3.1 },
    ],
  },
  {
    rotulo: "apê grande, áreas quebradas",
    pecas: [
      { nome: "Suíte", x: 0, y: 0, l: 3.75, a: 3.4 },
      { nome: "Quarto 2", x: 3.75, y: 0, l: 2.95, a: 3.4 },
      { nome: "Sala", x: 0, y: 3.4, l: 4.85, a: 4.15 },
      { nome: "Cozinha", x: 4.85, y: 3.4, l: 1.85, a: 2.35 },
      { nome: "Banheiro", x: 4.85, y: 5.75, l: 1.85, a: 1.8 },
    ],
  },
];

/** A planta REAL que ele mandou, com as seis áreas digitadas do desenho. */
const REAL: Caso = {
  rotulo: "REAL: a planta que ele mandou",
  pecas: [
    { nome: "Serviço", x: 0, y: 0, l: 1, a: 4.5 },
    { nome: "Cozinha", x: 0, y: 0, l: 1, a: 6.75 },
    { nome: "BWC", x: 0, y: 0, l: 1, a: 3.0 },
    { nome: "Quarto", x: 0, y: 0, l: 1, a: 9.99 },
    { nome: "Sala de estar / jantar", x: 0, y: 0, l: 1, a: 16.54 },
    { nome: "Quarto 2", x: 0, y: 0, l: 1, a: 12.76 },
  ],
};

async function ler(bytes: Buffer): Promise<{ leitura: LeituraDaPlanta; s: string }> {
  const t0 = Date.now();
  const r = (await chamarSincrono(
    "fal-ai/any-llm/vision",
    { model: MODELO, system_prompt: SISTEMA_LEITURA, prompt: PEDIDO, image_urls: [`data:image/jpeg;base64,${bytes.toString("base64")}`], temperature: 0, max_tokens: 2000 },
    env.FAL_KEY,
    90_000
  )) as { output?: string };
  const cru = String(r?.output ?? "").trim();
  if (process.argv.includes("--cru")) console.log(`
   [cru] ${cru.slice(0, 400)}
`);
  // O MESMO caminho da rota: achar o bloco JSON, parsear, e só então limpar. `limparLeitura`
  // recebe OBJETO -- passar a string crua devolve zero cômodos em silêncio, que foi como eu
  // li "0 de 27" e quase fui mexer no prompt por causa de um erro meu de duas linhas.
  const bloco = cru.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) throw new Error(`o modelo não devolveu JSON: ${cru.slice(0, 120)}`);
  return { leitura: limparLeitura(JSON.parse(bloco)), s: ((Date.now() - t0) / 1000).toFixed(1) };
}

/**
 * Nomes que o modelo NORMALIZA, e que contam como acerto.
 *
 * A planta dele escreve "BWC"; o modelo devolve "Banheiro". Isso é acerto, não erro -- o
 * cômodo foi achado e o nome ficou melhor pro corretor. Contar como falha baixaria o número
 * da bancada por uma coisa que o produto faz certo.
 *
 * Fica curto e explícito de propósito: lista de sinônimos é o jeito mais fácil de maquiar a
 * nota da bancada, e cada linha aqui tem que ser defensável sozinha.
 */
const SINONIMOS: Record<string, string> = { bwc: "banheiro", wc: "banheiro", sanitario: "banheiro" };

/** Casa por nome, tolerando acento, caixa e "1"/"2" no fim. */
const chave = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(bwc|wc|sanitario)$/, (m) => SINONIMOS[m]);

async function main() {
  const soReal = process.argv.includes("--so-real");
  const casos: Caso[] = [];
  if (!soReal) {
    for (const c of CASOS) {
      const bytes = await sharp(Buffer.from(desenhar(c.pecas))).jpeg({ quality: 92 }).toBuffer();
      fs.writeFileSync(path.join(SAIDA, c.rotulo.replace(/[^a-z0-9]+/gi, "-") + ".jpg"), bytes);
      casos.push({ ...c, bytes });
    }
  }
  const imagemReal = process.argv[process.argv.indexOf("--real") + 1];
  if (imagemReal && fs.existsSync(imagemReal)) {
    casos.push({ ...REAL, bytes: await sharp(imagemReal).resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer() });
  }

  console.log(`modelo: ${MODELO} · ${casos.length} planta(s) · tolerância de área: ${TOLERANCIA * 100}%\n`);
  let totalPecas = 0;
  let totalNomes = 0;
  let totalAreas = 0;
  let totalComCota = 0;

  for (const caso of casos) {
    const { leitura, s } = await ler(caso.bytes!);
    const lidos = leitura.comodos;
    let nomes = 0;
    let areas = 0;
    const linhas: string[] = [];
    for (const p of caso.pecas) {
      const achado = lidos.find((c) => chave(c.nome) === chave(p.nome)) ?? lidos.find((c) => chave(c.nome).startsWith(chave(p.nome).slice(0, 5)));
      const esperada = areaDe(p);
      if (!achado) {
        linhas.push(`      ${p.nome.padEnd(22)} esperado ${esperada.toFixed(2).padStart(6)} m²   NÃO ACHOU O CÔMODO`);
        continue;
      }
      nomes++;
      const lida = achado.largura * achado.altura;
      const erro = Math.abs(lida - esperada) / esperada;
      const certo = erro <= TOLERANCIA;
      if (certo) areas++;
      linhas.push(`      ${p.nome.padEnd(22)} esperado ${esperada.toFixed(2).padStart(6)} · leu ${lida.toFixed(2).padStart(6)} m²  ${certo ? "ok" : `ERRO ${(erro * 100).toFixed(0)}%`}${achado.medida_lida ? " (diz que leu a cota)" : ""}`);
    }
    const comCota = lidos.filter((c) => c.medida_lida).length;
    totalPecas += caso.pecas.length;
    totalNomes += nomes;
    totalAreas += areas;
    totalComCota += comCota;
    console.log(`== ${caso.rotulo}  (${s}s)`);
    console.log(`   nomes ${nomes}/${caso.pecas.length} · ÁREAS CERTAS ${areas}/${caso.pecas.length} · tem_cotas=${leitura.tem_cotas} · diz ter lido cota em ${comCota}`);
    if (leitura.observacao) console.log(`   nota do modelo: ${leitura.observacao}`);
    for (const l of linhas) console.log(l);
    console.log("");
  }

  console.log("---------------------------------------------");
  console.log(`NOMES:  ${totalNomes}/${totalPecas} (${((totalNomes / totalPecas) * 100).toFixed(0)}%)`);
  console.log(`ÁREAS:  ${totalAreas}/${totalPecas} (${((totalAreas / totalPecas) * 100).toFixed(0)}%)   <- é este número que precisa subir`);
  console.log(`o modelo AFIRMA ter lido cota em ${totalComCota} cômodo(s)`);
  console.log(`\nimagens em ${SAIDA}`);
}

main();
