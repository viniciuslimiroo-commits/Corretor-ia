// EXPERIMENTO: um modelo de visão consegue LER uma planta bem o bastante pra virar rascunho?
//
// 21/09/2026. Antes de investir em acabamento, medir. O dono pediu a opção de mandar a planta
// pronta em vez de desenhar; eu propus ler a planta com o modelo de visão que o projeto já
// usa no avaliador. Isso aqui responde se presta, com número em vez de opinião.
//
// O QUE TORNA ESTE EXPERIMENTO HONESTO: gabarito. As plantas de controle são geradas pelo
// PRÓPRIO produto a partir de cômodos que eu escrevi aqui -- então a resposta certa é
// conhecida em metros, e dá pra medir o erro de cada cômodo em vez de olhar e achar bonito.
//
// As variantes existem porque a planta que o corretor manda não é um PNG limpo: é print de
// portal, foto de prancha impressa, PDF exportado pequeno. Degradar o controle mede o que o
// mundo real faz com a leitura.
//
//   node --import ./scripts/ts-direto.mjs scripts/experimento-ler-planta.ts
//   node --import ./scripts/ts-direto.mjs scripts/experimento-ler-planta.ts --extra pasta/com/plantas
//
// Custa alguns centavos de dólar do saldo fal por imagem (modelo de visão, não de imagem).
// Não escreve nada no banco e não gasta crédito de ninguém.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chamarSincrono } from "../src/lib/fal.ts";
import { PASSO_PADRAO, type Planta } from "../src/lib/planta.ts";
import { plantaParaSvg } from "../src/lib/planta-svg.ts";
import { textoSvg } from "../src/lib/texto-svg.ts";
import { SISTEMA_LEITURA, limparLeitura, type ComodoLido } from "../src/lib/planta-lida.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()] as [string, string])
);
const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), "encena-ler-planta-"));
/**
 * O modelo que o produto usaria. `--modelo X` troca; `--modelos a,b` compara na mesma imagem.
 *
 * O padrão é o flash-lite porque é o que o avaliador já usa -- e foi medindo contra o
 * gabarito que se viu que ele não serve aqui (veja o relatório do experimento).
 */
const iModelo = process.argv.indexOf("--modelo");
const MODELO = iModelo > -1 && process.argv[iModelo + 1] ? process.argv[iModelo + 1].trim() : "google/gemini-2.5-flash-lite";

/** O gabarito: cômodos em metros, do jeito que uma planta de apartamento é de verdade. */
type Gabarito = { nome: string; x: number; y: number; l: number; a: number };
const GABARITO: Gabarito[] = [
  { nome: "Sala", x: 0, y: 0, l: 4.2, a: 3.6 },
  { nome: "Cozinha", x: 4.2, y: 0, l: 2.8, a: 2.4 },
  { nome: "Quarto 1", x: 0, y: 3.6, l: 3.4, a: 3.0 },
  { nome: "Quarto 2", x: 3.4, y: 3.6, l: 2.9, a: 3.0 },
  { nome: "Banheiro", x: 4.2, y: 2.4, l: 1.6, a: 1.2 },
];

const plantaDoGabarito = (): Planta => ({
  nome: "",
  passo: PASSO_PADRAO,
  comodos: GABARITO.map((g, i) => ({
    id: `g${i}`,
    nome: g.nome,
    pontos: [
      { x: g.x, y: g.y },
      { x: g.x + g.l, y: g.y },
      { x: g.x + g.l, y: g.y + g.a },
      { x: g.x, y: g.y + g.a },
    ],
  })),
  aberturas: [],
  moveis: [],
  cotas: true,
});

/** A planta de controle, desenhada pelo próprio produto, com as cotas que ele desenha. */
async function pngDoControle(): Promise<Buffer> {
  const { svg, largura, altura } = plantaParaSvg(plantaDoGabarito(), { escala: 90, grade: false, texto: textoSvg });
  return sharp(Buffer.from(svg)).resize(Math.min(1800, largura * 2), Math.round((Math.min(1800, largura * 2) / largura) * altura)).png().toBuffer();
}

/** Print de portal: pequeno e recomprimido. */
const comoPrint = (b: Buffer) => sharp(b).resize(760, null).jpeg({ quality: 45 }).toBuffer();

/** Foto de prancha impressa: torta, com sombra de um lado e menos contraste. */
const comoFoto = (b: Buffer) =>
  sharp(b)
    .resize(1400, null)
    .rotate(2.5, { background: "#e8e6e1" })
    .modulate({ brightness: 0.95 })
    .linear(0.86, 18)
    .jpeg({ quality: 62 })
    .toBuffer();

async function ler(bytes: Buffer, rotulo: string, modelo = MODELO) {
  const t0 = Date.now();
  const saida = (await chamarSincrono(
    "fal-ai/any-llm/vision",
    {
      model: modelo,
      system_prompt: SISTEMA_LEITURA,
      prompt: "Read this floor plan and return the JSON described in the system prompt.",
      image_urls: [`data:image/jpeg;base64,${bytes.toString("base64")}`],
      temperature: 0,
      max_tokens: 2000,
    },
    env.FAL_KEY,
    60_000
  )) as { output?: string; error?: string | null };
  const s = Number(((Date.now() - t0) / 1000).toFixed(1));
  if (saida.error) throw new Error(String(saida.error));
  const bruto = (saida.output ?? "").trim();
  const json = bruto.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`sem JSON: ${bruto.slice(0, 140)}`);
  return { leitura: limparLeitura(JSON.parse(json)), s, rotulo };
}

/** Casa cada cômodo lido com o do gabarito pelo NOME; sobra vira erro. */
function comparar(lidos: ComodoLido[]) {
  const porNome = new Map(GABARITO.map((g) => [g.nome.toLowerCase(), g]));
  let casados = 0;
  let somaErro = 0;
  let piorErro = 0;
  const detalhes: string[] = [];
  for (const c of lidos) {
    const g = porNome.get(c.nome.trim().toLowerCase());
    if (!g) {
      detalhes.push(`  ? "${c.nome}" não existe no gabarito (${c.largura.toFixed(2)}x${c.altura.toFixed(2)})`);
      continue;
    }
    casados++;
    // Erro relativo do LADO, que é o que vira medida no anúncio.
    const eL = Math.abs(c.largura - g.l) / g.l;
    const eA = Math.abs(c.altura - g.a) / g.a;
    const erro = Math.max(eL, eA);
    somaErro += erro;
    piorErro = Math.max(piorErro, erro);
    const marca = erro <= 0.05 ? "ok " : erro <= 0.2 ? "~~ " : "XX ";
    detalhes.push(`  ${marca}${g.nome.padEnd(10)} gabarito ${g.l.toFixed(2)}x${g.a.toFixed(2)}  lido ${c.largura.toFixed(2)}x${c.altura.toFixed(2)}  erro ${(erro * 100).toFixed(0)}%`);
  }
  const faltando = GABARITO.filter((g) => !lidos.some((c) => c.nome.trim().toLowerCase() === g.nome.toLowerCase())).map((g) => g.nome);
  return { casados, medioPct: casados ? (somaErro / casados) * 100 : NaN, piorPct: piorErro * 100, faltando, detalhes };
}

// ---------------- roda ----------------
const base = await pngDoControle();
fs.writeFileSync(path.join(SAIDA, "controle.png"), base);
const casos: { rotulo: string; bytes: Buffer; temGabarito: boolean }[] = [
  { rotulo: "controle (PNG limpo, cotas do produto)", bytes: await sharp(base).jpeg({ quality: 92 }).toBuffer(), temGabarito: true },
  { rotulo: "print de portal (760px, qualidade 45)", bytes: await comoPrint(base), temGabarito: true },
  { rotulo: "foto de prancha (torta, sem contraste)", bytes: await comoFoto(base), temGabarito: true },
];

const extra = process.argv.indexOf("--extra");
if (extra > -1 && process.argv[extra + 1]) {
  const pasta = process.argv[extra + 1];
  for (const f of fs.readdirSync(pasta).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
    casos.push({ rotulo: `real: ${f}`, bytes: await sharp(path.join(pasta, f)).resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(), temGabarito: false });
  }
}

console.log(`gabarito: ${GABARITO.length} cômodos · imagens: ${casos.length}\n`);
for (const caso of casos) {
  fs.writeFileSync(path.join(SAIDA, caso.rotulo.replace(/[^a-z0-9]+/gi, "-") + ".jpg"), caso.bytes);
  try {
    const { leitura, s } = await ler(caso.bytes, caso.rotulo);
    const comCota = leitura.comodos.filter((c) => c.medida_lida).length;
    console.log(`== ${caso.rotulo}  (${s}s, ${Math.round(caso.bytes.length / 1024)}KB)`);
    console.log(`   cômodos: ${leitura.comodos.length} · com cota lida: ${comCota} · tem_cotas: ${leitura.tem_cotas} · escala: ${leitura.escala ?? "—"}`);
    if (leitura.observacao) console.log(`   nota do modelo: ${leitura.observacao}`);
    if (caso.temGabarito) {
      const r = comparar(leitura.comodos);
      console.log(`   casados: ${r.casados}/${GABARITO.length}${r.faltando.length ? ` · faltou: ${r.faltando.join(", ")}` : ""}`);
      if (r.casados) console.log(`   erro de medida: médio ${r.medioPct.toFixed(0)}% · pior ${r.piorPct.toFixed(0)}%`);
      for (const d of r.detalhes) console.log(d);
    } else {
      for (const c of leitura.comodos.slice(0, 8)) console.log(`   · ${c.nome.padEnd(12)} ${c.largura.toFixed(2)} x ${c.altura.toFixed(2)} m${c.medida_lida ? "  (cota lida)" : ""}`);
    }
  } catch (e) {
    console.log(`== ${caso.rotulo}\n   FALHOU: ${e instanceof Error ? e.message : e}`);
  }
  console.log("");
}
// ---- o teto é o modelo ou a tarefa? mesma imagem, modelos diferentes ----
const iMod = process.argv.indexOf("--modelos");
if (iMod > -1 && process.argv[iMod + 1]) {
  console.log("\n---- mesma planta de controle, modelos diferentes ----\n");
  for (const m of process.argv[iMod + 1].split(",")) {
    try {
      const { leitura, s } = await ler(casos[0].bytes, m, m.trim());
      const r = comparar(leitura.comodos);
      const comCota = leitura.comodos.filter((c) => c.medida_lida).length;
      console.log(`== ${m}  (${s}s)`);
      console.log(`   cômodos ${leitura.comodos.length}/${GABARITO.length} · casados ${r.casados} · com cota ${comCota} · erro médio ${r.medioPct.toFixed(0)}% · pior ${r.piorPct.toFixed(0)}%`);
      for (const d of r.detalhes) console.log(d);
    } catch (e) {
      console.log(`== ${m}\n   FALHOU: ${e instanceof Error ? e.message : e}`);
    }
    console.log("");
  }
}

console.log(`imagens usadas em ${SAIDA}`);
