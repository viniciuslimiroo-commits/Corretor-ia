// Gera os CARTÕES da galeria de efeitos de texto e a lista que a tela lê.
//
// A galeria é o lugar em que se ESCOLHE, então o cartão tem que ser o efeito de verdade.
// Mas o desenho depende das fontes, que só existem no servidor (e ~2,4 MB de fonte no
// celular pra desenhar vinte cartões seria pagar caro por nada). Então os cartões são
// desenhados aqui, com o MESMO catálogo que o vídeo usa, e saem como PNG pronto.
//
// Também escreve `src/lib/efeitos-texto/lista.ts` -- ids, nomes, categorias e amostras --
// que o navegador e o saneador importam sem carregar fonte nenhuma. É GERADO: mudar à mão
// faz a lista divergir do catálogo, e scripts/testar-efeitos-texto.ts confere as duas.
//
//   node --import ./scripts/ts-direto.mjs scripts/gerar-cartoes-efeitos.ts

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { EFEITOS_TEXTO } from "../src/lib/efeitos-texto/catalogo.ts";
import { desenharEfeito } from "../src/lib/efeitos-texto/nucleo.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTA = path.join(RAIZ, "public", "efeitos-texto");
fs.mkdirSync(PASTA, { recursive: true });

// Cartão quadrado, fundo transparente: a cor do cartão é da tela (o editor é escuro).
const LADO = 240;
const UTIL = 212;

const ids = new Set<string>();
for (const e of EFEITOS_TEXTO) {
  if (ids.has(e.id)) throw new Error(`id repetido no catálogo: ${e.id}`);
  ids.add(e.id);
  const d = desenharEfeito(e, e.amostra, 96, "cartao");
  const png = await sharp(Buffer.from(d.svg)).png().toBuffer();
  const escala = Math.min(UTIL / d.largura, UTIL / d.altura, 1.4);
  const peca = await sharp(png)
    .resize(Math.max(1, Math.round(d.largura * escala)), Math.max(1, Math.round(d.altura * escala)))
    .png()
    .toBuffer();
  const m = await sharp(peca).metadata();
  await sharp({ create: { width: LADO, height: LADO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: peca, left: Math.round((LADO - (m.width ?? 0)) / 2), top: Math.round((LADO - (m.height ?? 0)) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(PASTA, `${e.id}.png`));
}

// Cartão de efeito que saiu do catálogo não pode ficar servindo.
for (const f of fs.readdirSync(PASTA)) {
  if (f.endsWith(".png") && !ids.has(f.replace(/\.png$/, ""))) fs.rmSync(path.join(PASTA, f));
}

const linhas = EFEITOS_TEXTO.map((e) => `  { id: ${JSON.stringify(e.id)}, rotulo: ${JSON.stringify(e.rotulo)}, categoria: ${JSON.stringify(e.categoria)}, amostra: ${JSON.stringify(e.amostra)} },`);
const lista = `// GERADO por scripts/gerar-cartoes-efeitos.ts a partir de efeitos-texto/catalogo.ts.
// Não edite à mão: rode o script. scripts/testar-efeitos-texto.ts confere que bate.
//
// É a parte do catálogo que o NAVEGADOR e o saneador podem importar: sem fonte, sem
// desenho, só o que precisa pra listar e validar.

import type { CategoriaEfeito } from "./nucleo";

export type ItemEfeitoTexto = { id: string; rotulo: string; categoria: CategoriaEfeito; amostra: string };

export const LISTA_EFEITOS_TEXTO: ItemEfeitoTexto[] = [
${linhas.join("\n")}
];

export const IDS_EFEITOS_TEXTO: ReadonlySet<string> = new Set(LISTA_EFEITOS_TEXTO.map((e) => e.id));

export function urlDoCartaoDeEfeito(id: string): string {
  return \`/efeitos-texto/\${id}.png\`;
}
`;
fs.writeFileSync(path.join(RAIZ, "src", "lib", "efeitos-texto", "lista.ts"), lista);

console.log(`${EFEITOS_TEXTO.length} cartões em public/efeitos-texto · lista.ts escrita`);
