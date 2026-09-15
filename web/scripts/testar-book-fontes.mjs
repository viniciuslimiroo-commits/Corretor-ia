// As duas fontes do book (Moderna = Helvetica, Clássica = Times), medidas com número:
//
//   1. o medidor do navegador dá EXATAMENTE a largura que o pdf-lib dá, nas duas famílias,
//      normal e negrito, com acento, cifrão, aspas curvas e travessão -- é a igualdade que
//      deixa o layout ser calculado no cliente sem divergir do arquivo;
//   2. o documento guarda a fonte e a releitura respeita (moderna quando não há);
//   3. o layout carimba a fonte nas páginas e QUEBRA LINHA com as métricas dela: o mesmo
//      texto longo tem que sair com quebras diferentes em Times e em Helvetica.
//
//   node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-book-fontes.mjs

import { PDFDocument, StandardFonts } from "pdf-lib";
import { medirTexto, medidorDaFonte } from "../src/lib/book-metricas.ts";
import { FONTES_BOOK, limparDocumento } from "../src/lib/book-documento.ts";
import { montarLayout } from "../src/lib/book-layout.ts";
import { TIPO_POR_ID } from "../src/lib/book-tipos.ts";

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

console.log("--- 1. medidor = pdf-lib, nas duas famílias ---");
const pdf = await PDFDocument.create();
const NOMES = {
  moderna: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  classica: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
};
const FRASES = [
  "Imóvel à venda · 3 quartos · R$ 690.000",
  "Apartamento no Setor Bueno, com varanda gourmet e vista livre — “pronto pra morar”",
  "AVENIDA T-63, Nº 1.250 (esq. c/ Rua 9) — cond. isento, IPTU 2026 pago",
  "Você vai amar: 96,5 m² úteis, 2 vagas, lazer completo… Agende sua visita!",
  "WATER Yes AWAY To. Ty. 11 ff fl Ç ã õ ê € ½ ¼ ® ©",
];
for (const [id, [n, g]] of Object.entries(NOMES)) {
  const fn = await pdf.embedFont(n);
  const fg = await pdf.embedFont(g);
  let piorDif = 0;
  for (const frase of FRASES) {
    for (const tamanho of [8, 10.5, 12, 28]) {
      piorDif = Math.max(piorDif, Math.abs(medirTexto(frase, tamanho, false, id) - fn.widthOfTextAtSize(frase, tamanho)));
      piorDif = Math.max(piorDif, Math.abs(medirTexto(frase, tamanho, true, id) - fg.widthOfTextAtSize(frase, tamanho)));
    }
  }
  // Igualdade exata a menos do arredondamento em milésimos de em (0,0005 × 28pt).
  conferir(piorDif < 0.02, `${id}: mesma largura que o pdf-lib em ${FRASES.length} frases × 4 tamanhos × 2 pesos`, `pior diferença ${piorDif.toFixed(4)}pt`);
}
conferir(medirTexto("Imóvel", 12, false, "classica") !== medirTexto("Imóvel", 12, false, "moderna"), "as famílias medem diferente (não é a mesma tabela duas vezes)");
conferir(medirTexto("Imóvel", 12, false) === medirTexto("Imóvel", 12, false, "moderna"), "sem fonte = moderna (compatível com o que já existia)");
conferir(medidorDaFonte("classica")("Imóvel", 12, true) === medirTexto("Imóvel", 12, true, "classica"), "medidorDaFonte amarra a família");
conferir(medidorDaFonte(undefined)("x", 10, false) === medirTexto("x", 10, false, "moderna"), "medidorDaFonte sem fonte cai na moderna");
conferir(FONTES_BOOK.length === 2 && FONTES_BOOK.every((f) => f.css && f.rotulo), "catálogo com rótulo e família CSS");

console.log("\n--- 2. o documento guarda a fonte ---");
const tipo = Object.keys(TIPO_POR_ID)[0];
const base = {
  versao: 1,
  tipo,
  formato: TIPO_POR_ID[tipo].formato,
  identidade: { capaEscura: true },
  paginas: [
    {
      id: "p1",
      tipo: "capa",
      origem: "auto",
      imagens: [],
      textos: {
        titulo: "Apartamento amplo com varanda gourmet e três suítes no Setor Bueno",
        subtitulo: "Setor Bueno · Goiânia",
        preco: "R$ 690.000",
        descricao:
          "Apartamento de 96 m² com sala ampla integrada à varanda gourmet, três quartos sendo uma suíte, cozinha planejada, área de serviço independente e duas vagas cobertas. Condomínio com piscina, academia e salão de festas, a duas quadras do parque.",
      },
    },
  ],
};
const semFonte = limparDocumento(base);
conferir(semFonte?.identidade.fonte === "moderna", "sem fonte: moderna (documentos antigos)", String(semFonte?.identidade.fonte));
const classico = limparDocumento({ ...base, identidade: { capaEscura: true, fonte: "classica" } });
conferir(classico?.identidade.fonte === "classica", "classica é guardada");
const inventada = limparDocumento({ ...base, identidade: { capaEscura: true, fonte: "comic sans" } });
conferir(inventada?.identidade.fonte === "moderna", "fonte desconhecida vira moderna, sem erro");

console.log("\n--- 3. o layout usa a fonte ---");
const ctx = { marca: { nome: "Ana", creci: "12345", whatsapp: "62999990000", temLogo: false }, ficha: [], link: null, temEditada: false };
const lm = montarLayout(semFonte, ctx);
const lc = montarLayout(classico, ctx);
conferir(lm.every((p) => p.fonte === "moderna") && lc.every((p) => p.fonte === "classica"), "cada página sai carimbada com a fonte do documento");
const linhas = (lay) => lay[0].caixas.filter((c) => c.tipo === "texto").map((c) => c.linhas.join("|"));
const lmL = linhas(lm);
const lcL = linhas(lc);
conferir(lmL.length === lcL.length && lmL.length > 0, "mesmas caixas de texto nas duas", `${lmL.length}`);
conferir(lmL.some((l, i) => l !== lcL[i]), "algum texto quebra linha em lugar diferente (Times é mais estreita)", `moderna: ${lmL.find((l, i) => l !== lcL[i])?.slice(0, 60)}…`);
const explicito = montarLayout(classico, ctx, medidorDaFonte("moderna"));
conferir(explicito.every((p) => p.fonte === "classica") && linhas(explicito).join() === lmL.join(), "medidor explícito (teste) vence, mas o carimbo continua sendo o do documento");

console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
