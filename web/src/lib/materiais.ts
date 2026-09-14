// O vocabulário do ACERVO: como cada job vira item de tela.
//
// Os MODELOS de material moravam aqui e foram embora: eram um segundo motor de PDF, com
// os mesmos nomes dos tipos de Book ("Book do imóvel", "Catálogo", "Apresentação de
// lançamento") e um resultado diferente. Duas engrenagens produzindo a mesma coisa de
// jeitos diferentes é o tipo de duplicação que ninguém percebe de dentro e todo mundo
// percebe de fora. Agora existe um motor só: book-tipos + book-montagem + book-layout.

export type Categoria = "foto" | "planta" | "terreno" | "video";

export function categoriaDoTipo(tipo: string): Categoria {
  if (tipo.startsWith("planta")) return "planta";
  if (tipo.startsWith("terreno")) return "terreno";
  return "foto";
}

export const CATEGORIAS: { id: Categoria | "tudo"; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "foto", rotulo: "Fotos" },
  { id: "planta", rotulo: "Plantas" },
  { id: "terreno", rotulo: "Terrenos" },
  { id: "video", rotulo: "Vídeos" },
];

/**
 * "Rótulo: valor" vira card de número; o resto vira parágrafo. É o que separa a
 * apresentação de investidores das outras -- ela mostra dado, não texto corrido.
 */
