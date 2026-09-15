// Gera src/lib/book-metricas.ts: larguras e kerning das fontes padrão do PDF, extraídas do
// próprio pdf-lib, pra que o NAVEGADOR meça texto exatamente como o arquivo vai medir.
//
// Duas famílias, que são as que o pdf-lib traz embutidas sem precisar de arquivo de fonte:
//   moderna   Helvetica / Helvetica-Bold   (no Windows resolve pra Arial, mesmas larguras)
//   classica  Times-Roman / Times-Bold     (Times New Roman, idem)
//
// O kerning entra de propósito: somar caractere a caractere sem ele erra até 7pt numa frase
// longa -- uma palavra inteira pulando de linha entre a tela e o arquivo. Cada par do WinAnsi
// é medido de verdade (largura do par menos as duas larguras), e só o que não é zero fica.
//
//   node scripts/gerar-metricas-book.mjs
//
// Rode de novo se o pdf-lib mudar de versão. testar-book-fontes.mjs confere a igualdade.

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const SAIDA = path.resolve(import.meta.dirname, "../src/lib/book-metricas.ts");

// WinAnsi: ASCII imprimível, Latin-1 e os 27 do bloco 0x80-0x9F do Windows-1252
// (aspas curvas, travessões, reticências, euro, bullet…).
const CODIGOS = [];
for (let c = 32; c <= 126; c++) CODIGOS.push(c);
for (let c = 160; c <= 255; c++) CODIGOS.push(c);
for (const c of [8364, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 381, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 382, 376]) CODIGOS.push(c);

const FAMILIAS = {
  moderna: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  classica: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
};

const pdf = await PDFDocument.create();

async function tabelas(nome) {
  const fonte = await pdf.embedFont(nome);
  const larguras = {};
  const chars = [];
  for (const cp of CODIGOS) {
    const ch = String.fromCodePoint(cp);
    try {
      larguras[cp] = Math.round(fonte.widthOfTextAtSize(ch, 1000));
      chars.push([cp, ch]);
    } catch {
      // fora do encoding da fonte: fica de fora, e o medidor cai na largura de "n"
    }
  }
  const kern = {};
  for (const [a, ca] of chars) {
    for (const [b, cb] of chars) {
      let par;
      try {
        par = fonte.widthOfTextAtSize(ca + cb, 1000);
      } catch {
        continue;
      }
      const k = Math.round(par - larguras[a] - larguras[b]);
      if (k !== 0) kern[`${a}_${b}`] = k;
    }
  }
  return { larguras, kern };
}

const partes = [];
for (const [id, [normal, negrito]] of Object.entries(FAMILIAS)) {
  const n = await tabelas(normal);
  const g = await tabelas(negrito);
  partes.push(
    `  ${id}: {\n` +
      `    normal: ${JSON.stringify(n.larguras)},\n` +
      `    negrito: ${JSON.stringify(g.larguras)},\n` +
      `    kernNormal: ${JSON.stringify(n.kern)},\n` +
      `    kernNegrito: ${JSON.stringify(g.kern)},\n` +
      `  },`
  );
  console.log(`${id}: ${Object.keys(n.larguras).length} larguras, ${Object.keys(n.kern).length}/${Object.keys(g.kern).length} pares de kerning`);
}

const arquivo = `// GERADO por scripts/gerar-metricas-book.mjs -- não editar à mão. Métricas das fontes
// padrão do PDF em milésimos de em, extraídas do próprio pdf-lib.
//
// Existe pra que o NAVEGADOR meça texto exatamente como o PDF vai medir. Com isto o
// layout é recalculado no cliente a cada tecla, sem ida ao servidor e sem nenhuma fresta
// pra divergência: são os mesmos números do outro lado.
//
// O KERNING está aqui de propósito. Somar caractere a caractere sem ele erra até 7pt numa
// frase longa -- uma palavra inteira pulando de linha entre a tela e o arquivo.
//
// Cobre o WinAnsi, encoding das fontes padrão do PDF. Caractere fora dele cai na largura
// de "n": a linha sai um pouco curta, o que é melhor do que quebrar a medição.
//
// Duas famílias: "moderna" (Helvetica) e "classica" (Times). Quem escolhe é a identidade
// do documento; o catálogo com rótulo e família CSS mora em book-documento.ts.

import type { FonteBook } from "./book-documento";

type Tabela = {
  normal: Record<number, number>;
  negrito: Record<number, number>;
  kernNormal: Record<string, number>;
  kernNegrito: Record<string, number>;
};

const TABELAS: Record<FonteBook, Tabela> = {
${partes.join("\n")}
};

export type Medidor = (texto: string, tamanho: number, negrito: boolean) => number;

/** Largura do texto naquele tamanho, em pontos. A mesma conta que o pdf-lib faz. */
export function medirTexto(texto: string, tamanho: number, negrito: boolean, fonte: FonteBook = "moderna"): number {
  const t = TABELAS[fonte] ?? TABELAS.moderna;
  const larguras = negrito ? t.negrito : t.normal;
  const kern = negrito ? t.kernNegrito : t.kernNormal;
  const padrao = larguras[110] ?? 556;
  let total = 0;
  let anterior: number | null = null;
  for (const ch of texto) {
    const cp = ch.codePointAt(0) ?? 110;
    total += larguras[cp] ?? padrao;
    if (anterior !== null) total += kern[\`\${anterior}_\${cp}\`] ?? 0;
    anterior = cp;
  }
  return (total * tamanho) / 1000;
}

/** O medidor já amarrado a uma família: é o que o layout recebe. */
export function medidorDaFonte(fonte?: FonteBook | null): Medidor {
  const f: FonteBook = fonte === "classica" ? "classica" : "moderna";
  return (texto, tamanho, negrito) => medirTexto(texto, tamanho, negrito, f);
}
`;

fs.writeFileSync(SAIDA, arquivo, "utf8");
console.log(`escrito ${path.relative(process.cwd(), SAIDA)} (${(arquivo.length / 1024).toFixed(0)} KB)`);
