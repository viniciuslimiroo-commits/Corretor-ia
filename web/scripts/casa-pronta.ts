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
import { comEstruturaPreservada, ESTRUTURA_FIXA, ESTRUTURA_FIXA_SALVO_PEDIDO } from "../src/lib/preservar.ts";
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

const INSTRUCAO_MODERNA =
  "modernize and renovate this corner two-storey townhouse for an architectural real estate listing: " +
  "repaint the facade in a clean, sophisticated off-white with an elegant dark graphite base trim at street level, " +
  "install sleek modern matte-black aluminum window frames with clear glass inside each existing window opening, keeping the exact dimensions, position and number of windows, " +
  "install modern matte-black architectural outdoor wall sconces with subtle up-and-down warm light accents on the facade, " +
  "restore and align the ceramic roof tiles to look clean and neat, " +
  "clean the sidewalk pavement completely and remove the street pedestrian and any trash on the corner, " +
  "no wood cladding on the ground level street wall. Keep the exact same building footprint, wall angles, roof structure and pitch, same street wires and poles, same camera angle and framing.";

const INSTRUCAO_CONTEMPORANEA =
  "high-end contemporary architectural renovation of this Brazilian urban corner house: " +
  "smooth light warm-grey and sand textured stucco on the exterior walls, with clean waterproof microcement finish on the ground floor base, " +
  "replace old frames with contemporary minimalist black window frames fitted precisely inside the existing wall openings, " +
  "clean and pressure-wash the roof tiles, " +
  "add subtle modern facade lighting with warm architectural spotlights, " +
  "clean up the corner sidewalk nicely, " +
  "no wood panels on the lower exterior wall. Keep the exact building structure, same number and position of windows, same roofline, same perspective.";

const VERSOES = [
  {
    saida: "casa-depois-moderna",
    acao: "editar_prompt",
    params: { instrucao: INSTRUCAO_MODERNA },
    contrato: ESTRUTURA_FIXA_SALVO_PEDIDO,
  },
  {
    saida: "casa-depois-contemporanea",
    acao: "editar_prompt",
    params: { instrucao: INSTRUCAO_CONTEMPORANEA },
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
