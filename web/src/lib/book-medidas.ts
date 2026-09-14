import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import type { Medidor } from "./book-layout";

// O medidor de texto. Só servidor.
//
// A quebra de linha do book é feita uma vez, no servidor, com as métricas da fonte QUE VAI
// PRO PDF -- e não com as do navegador. É isso que faz a tela e o arquivo quebrarem a
// frase no mesmo lugar. Medir aqui com Arial e lá com Helvetica traria de volta exatamente
// a divergência que o motor de layout existe pra eliminar.
//
// As fontes ficam em cache no módulo: medir não escreve nada no documento, então reusar o
// par entre requisições é seguro e evita recriar um PDFDocument a cada leitura de book.

let cache: Promise<{ normal: PDFFont; negrito: PDFFont }> | null = null;

async function fontes() {
  if (!cache) {
    cache = (async () => {
      const pdf = await PDFDocument.create();
      return {
        normal: await pdf.embedFont(StandardFonts.Helvetica),
        negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
      };
    })();
  }
  return cache;
}

export async function medidor(): Promise<Medidor> {
  const { normal, negrito } = await fontes();
  return (texto, tamanho, ehNegrito) => {
    try {
      return (ehNegrito ? negrito : normal).widthOfTextAtSize(texto, tamanho);
    } catch {
      // Caractere fora do WinAnsi derruba a medição da fonte padrão. Estimativa
      // conservadora em vez de exceção: o book sai com a linha um pouco curta, não
      // sai um 500 na cara do corretor.
      return texto.length * tamanho * 0.52;
    }
  };
}
