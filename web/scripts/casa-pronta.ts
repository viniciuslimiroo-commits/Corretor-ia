// A CASA DO DONO, PRONTA -- preservando a construção e o terreno de verdade.
//
// Ele mandou a foto de uma casa simples abandonada no pasto e pediu: mostrar ela pronta,
// bonita e bem apresentada, "sem inventar ou alterar características da construção ou do
// terreno". É o caso que a regra de 20/09/2026 existe pra proteger (lib/preservar.ts).
//
// Faz DUAS versões da mesma foto, pra escolher a melhor com o olho:
//   1. reforma  -- a ação "renovar" do catálogo, que é a que um corretor usaria;
//   2. descrito -- "editar com texto", com a instrução escrita palavra por palavra.
//
// Como o gerar-exemplos-landing.mjs, este NÃO passa pela API do produto: monta o pedido com
// o mesmo código (acoes.ts + preservar.ts) e fala direto com o fal, então não debita crédito
// da conta (gasta ~US$ 0,04 por versão do saldo do fal). Carimba o selo do produto.
//
//   node --import ./scripts/ts-direto.mjs scripts/casa-pronta.ts [caminho-da-foto.jpg]
//
// Sem argumento, pega a foto mais recente de docs/fotos-origem que não seja do Pexels.
// As saídas vão pra public/exemplos/casa-antes.jpg e casa-depois-*.jpg.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ACOES_POR_ID, limparParametros } from "../src/lib/acoes.ts";
import { comEstruturaPreservada, ESTRUTURA_FIXA_SALVO_PEDIDO } from "../src/lib/preservar.ts";
import { consultar, corpoRequisicao, despachar, extrairImagem, resultado } from "../src/lib/fal.ts";
import { aplicarSelo, textoDoSelo } from "../src/lib/selo.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ORIGENS = path.join(RAIZ, "..", "docs", "fotos-origem");
const SAIDA = path.join(RAIZ, "public", "exemplos");
const MODELO = "fal-ai/nano-banana/edit" as const;
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()] as [string, string])
);

function acharFoto(): string {
  const dado = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (dado) return path.isAbsolute(dado) ? dado : path.resolve(dado);
  const candidatas = fs
    .readdirSync(ORIGENS)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith("pexels-"))
    .map((f) => ({ f, t: fs.statSync(path.join(ORIGENS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!candidatas.length) {
    console.log(`Nenhuma foto em ${ORIGENS} (fora as do Pexels). Ponha a foto da casa lá, ou passe o caminho:`);
    console.log("  node --import ./scripts/ts-direto.mjs scripts/casa-pronta.ts C:/caminho/da/foto.jpg");
    process.exit(1);
  }
  return path.join(ORIGENS, candidatas[0].f);
}

/** O fal aceita data URI, então a foto vai direto do disco -- nada sobe pro armazenamento. */
async function comoDataUri(arquivo: string): Promise<string> {
  const bytes = await sharp(arquivo).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

const INSTRUCAO_VIDRO_SLIM =
  "modern architectural renovation focusing on high-end modern windows for this urban corner townhouse: " +
  "remove all old window grilles and heavy shutters completely; " +
  "install sleek contemporary minimalist black aluminum slim window frames with large clear transparent tempered glass panes inside each existing window opening, letting interior light and reflections show; " +
  "clean off-white and light concrete stucco facade with smooth texture; " +
  "install modern minimalist black exterior door and modern up-and-down architectural beam lights on the facade; " +
  "clean and aligned roof tiles, spotless sidewalk. " +
  "Keep exact same building dimensions, same wall outline, same roof structure, exact same number and position of window openings. Photorealistic.";

const INSTRUCAO_CONTEMPORANEA_CLEAN =
  "sophisticated modern architect renovation of this corner house: " +
  "replace all old window frames and iron bars with brand-new contemporary black steel and glass windows (frameless look with dark slim profiles and clear glass) in all openings upstairs and downstairs; " +
  "facade repainted in elegant matte sand-grey / greige with clean sharp corners; " +
  "clean modern entrance door; " +
  "clean sidewalk with no clutter; " +
  "preserve the exact building structure, same openings placement and size, same roof angle, same camera perspective.";

const VERSOES = [
  {
    saida: "casa-depois-janelas-vidro",
    acao: "editar_prompt",
    params: { instrucao: INSTRUCAO_VIDRO_SLIM },
    contrato: ESTRUTURA_FIXA_SALVO_PEDIDO,
  },
  {
    saida: "casa-depois-janelas-minimalistas",
    acao: "editar_prompt",
    params: { instrucao: INSTRUCAO_CONTEMPORANEA_CLEAN },
    contrato: ESTRUTURA_FIXA_SALVO_PEDIDO,
  },
];

const foto = acharFoto();
console.log(`foto de entrada: ${foto}`);
const dataUri = await comoDataUri(foto);
await sharp(foto).rotate().resize(1500, null, { withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(SAIDA, "casa-antes.jpg"));

for (const v of VERSOES) {
  const acao = ACOES_POR_ID[v.acao];
  const p = limparParametros(acao, v.params);
  const prompt = comEstruturaPreservada(acao.prompt(p as never), v.contrato);
  console.log(`\n=== ${v.saida} ===\n${prompt.slice(0, 600)}…\n`);
  const t0 = Date.now();
  try {
    const despacho = await despachar(MODELO, corpoRequisicao(MODELO, { prompt, imagemUrl: dataUri }), env.FAL_KEY);
    let pronto = false;
    for (let i = 0; i < 120 && !pronto; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const e = await consultar(despacho.status_url, env.FAL_KEY);
      if (e.estado === "pronto") pronto = true;
      else if (e.estado === "erro") {
        console.log(`FALHA ${v.saida}: ${e.mensagem}`);
        break;
      }
    }
    if (!pronto) continue;
    const img = extrairImagem(await resultado(despacho.response_url, env.FAL_KEY));
    const bytes = Buffer.from(await (await fetch(img.url)).arrayBuffer());
    const pronta = await sharp(bytes).resize(1500, null, { withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(SAIDA, `${v.saida}.jpg`), await aplicarSelo(pronta, textoDoSelo(v.acao)));
    console.log(`ok ${v.saida} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`FALHA ${v.saida}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\npares em ${SAIDA} (casa-antes.jpg + casa-depois-*.jpg). Escolha a melhor e aponte ela em components/landing.tsx.`);
