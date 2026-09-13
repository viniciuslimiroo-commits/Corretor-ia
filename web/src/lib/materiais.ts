// Os modelos de material que a Biblioteca sabe montar. Só metadado: a tela lê isto pra
// desenhar as opções e o servidor lê o mesmo pra validar o que chegou. Nada de pdf-lib
// nem sharp aqui -- este arquivo é importado pelo navegador.

export type ModeloMaterial = "book" | "whatsapp" | "catalogo" | "portfolio" | "lancamento" | "investidores";

export type DefModelo = {
  id: ModeloMaterial;
  rotulo: string;
  /** Uma linha dizendo pra que serve, na língua do corretor. */
  para: string;
  orientacao: "retrato" | "paisagem";
  /** true = o material fala de VÁRIOS imóveis, então as fotos são agrupadas por imóvel. */
  variosImoveis: boolean;
  maxFotos: number;
  usaPreco: boolean;
  /** O que a caixa de descrição significa neste modelo (muda o texto de ajuda). */
  descricao: "texto" | "topicos" | "nenhuma";
};

export const MODELOS: DefModelo[] = [
  {
    id: "book",
    rotulo: "Book do imóvel",
    para: "O apanhado completo pra mandar ao cliente: capa, todas as fotos e seu contato.",
    orientacao: "retrato",
    variosImoveis: false,
    maxFotos: 30,
    usaPreco: true,
    descricao: "texto",
  },
  {
    id: "whatsapp",
    rotulo: "PDF pro WhatsApp",
    para: "Uma página só, leve de mandar: foto grande, preço e mais quatro fotos.",
    orientacao: "retrato",
    variosImoveis: false,
    maxFotos: 5,
    usaPreco: true,
    descricao: "texto",
  },
  {
    id: "catalogo",
    rotulo: "Catálogo de imóveis",
    para: "Vários imóveis num arquivo, dois por página, com preço de cada um.",
    orientacao: "retrato",
    variosImoveis: true,
    maxFotos: 24,
    usaPreco: true,
    descricao: "texto",
  },
  {
    id: "portfolio",
    rotulo: "Portfólio",
    para: "O que você (ou a imobiliária) já fez, em grade. Bom pra captação.",
    orientacao: "retrato",
    variosImoveis: true,
    maxFotos: 36,
    usaPreco: false,
    descricao: "texto",
  },
  {
    id: "lancamento",
    rotulo: "Apresentação de lançamento",
    para: "Deitado, uma foto por página, do jeito que se projeta numa reunião.",
    orientacao: "paisagem",
    variosImoveis: false,
    maxFotos: 20,
    usaPreco: true,
    descricao: "texto",
  },
  {
    id: "investidores",
    rotulo: "Apresentação para investidores",
    para: "Deitado, com uma página de números antes das fotos.",
    orientacao: "paisagem",
    variosImoveis: false,
    maxFotos: 16,
    usaPreco: true,
    descricao: "topicos",
  },
];

export const MODELOS_POR_ID: Record<string, DefModelo> = Object.fromEntries(MODELOS.map((m) => [m.id, m]));

/** As categorias que a Biblioteca usa pra filtrar, deduzidas do `tipo` do job. */
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
export function separarTopicos(texto: string) {
  const numeros: { rotulo: string; valor: string }[] = [];
  const paragrafos: string[] = [];
  for (const linha of texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^([^:]{2,28}):\s*(.+)$/.exec(linha);
    if (m && numeros.length < 6) numeros.push({ rotulo: m[1].trim(), valor: m[2].trim().slice(0, 24) });
    else paragrafos.push(linha);
  }
  return { numeros, paragrafos };
}
