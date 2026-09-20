// REFAZ OS EXEMPLOS DA PÁGINA COM A REGRA DA ESTRUTURA LIGADA (lib/preservar.ts).
//
// Por que não passa pela API do produto, como o gerar-exemplos-landing.mjs: aquele caminho
// debita crédito da conta, e repor crédito é mexer no banco compartilhado -- coisa do dono,
// não minha. Aqui o pedido ao modelo é montado pelo MESMO código do produto
// (acoes.ts + preservar.ts), a foto de entrada é a URL pública do Pexels e a saída leva o
// mesmo selo de imagem ilustrativa. Gasta o saldo do fal (≈ US$ 0,04 por foto), autorizado
// pelo dono em 20/09/2026; não escreve nada no banco nem no armazenamento.
//
// Imprime o prompt inteiro: é a prova de que o contrato foi junto.
//
//   node --import ./scripts/ts-direto.mjs scripts/refazer-exemplos-com-regra.ts [--so-mostrar]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ACOES_POR_ID, limparParametros } from "../src/lib/acoes.ts";
import { comEstruturaPreservada, ESTRUTURA_FIXA } from "../src/lib/preservar.ts";
import { consultar, corpoRequisicao, despachar, extrairImagem, resultado } from "../src/lib/fal.ts";
import { aplicarSelo, textoDoSelo } from "../src/lib/selo.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SO_MOSTRAR = process.argv.includes("--so-mostrar");
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()] as [string, string])
);
const MODELO = "fal-ai/nano-banana/edit" as const;
const SAIDA = path.join(RAIZ, "public", "exemplos");

/** A mesma foto de origem dos exemplos de hoje: Pexels, licença de uso comercial. */
const pexels = (id: string) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1800`;

const CASOS = [
  { saida: "sala", pexels: "3935327", acao: "mobiliar", params: { tipo_espaco: "sala", estilo: "brasileiro", faixa: "medio", criatividade: "alta" } },
  { saida: "jantar", pexels: "3935349", acao: "mobiliar", params: { tipo_espaco: "sala", estilo: "escandinavo", faixa: "medio", criatividade: "alta" } },
];

for (const caso of CASOS) {
  const acao = ACOES_POR_ID[caso.acao];
  const p = limparParametros(acao, caso.params);
  const prompt = comEstruturaPreservada(acao.prompt(p as never), ESTRUTURA_FIXA);
  console.log(`\n=== ${caso.saida} · ${caso.acao} ===\n${prompt}\n`);
  if (SO_MOSTRAR) continue;

  const t0 = Date.now();
  const despacho = await despachar(MODELO, corpoRequisicao(MODELO, { prompt, imagemUrl: pexels(caso.pexels) }), env.FAL_KEY);
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const e = await consultar(despacho.status_url, env.FAL_KEY);
    if (e.estado === "pronto") pronto = true;
    else if (e.estado === "erro") {
      console.log(`FALHA ${caso.saida}: ${e.mensagem}`);
      break;
    }
  }
  if (!pronto) continue;

  const saida = await resultado(despacho.response_url, env.FAL_KEY);
  const img = extrairImagem(saida);
  const bytes = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  const redimensionada = await sharp(bytes).resize(1500, null, { withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  // O mesmo selo que o produto carimba: a página não pode mostrar resultado sem aviso.
  const comSelo = await aplicarSelo(redimensionada, textoDoSelo(caso.acao));
  fs.writeFileSync(path.join(SAIDA, `${caso.saida}-depois.jpg`), comSelo);
  // O "antes" é a foto de origem, no mesmo tamanho.
  const original = Buffer.from(await (await fetch(pexels(caso.pexels))).arrayBuffer());
  await sharp(original).rotate().resize(1500, null, { withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(SAIDA, `${caso.saida}-antes.jpg`));
  console.log(`ok ${caso.saida} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(comSelo.length / 1024)} KB`);
}
