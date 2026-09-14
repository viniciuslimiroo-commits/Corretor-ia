// Os tipos de book e o que cada um é. Só metadado e geometria: a tela lê isto pra
// desenhar as opções, o servidor lê o mesmo pra validar, e o motor de layout lê pra saber
// o tamanho da página. Nada de pdf-lib nem sharp aqui -- este arquivo vai pro navegador.
//
// A estrutura de cada tipo saiu da leitura de 16 materiais reais do mercado brasileiro
// (537 páginas): a ordem canônica é capa → promessa → localização → implantação → lazer →
// plantas → ficha → contato, e quem foge dela foge sempre no mesmo lugar.

export type TipoBook = "book" | "whatsapp" | "alto_padrao" | "lancamento" | "catalogo";

/** Formato da página. Deixou de ser A4 em tudo: o material de hoje é aberto no celular. */
export type Formato = "a4_retrato" | "a4_paisagem" | "quadrado" | "widescreen";

/** Em pontos PDF (72 por polegada). O navegador usa a mesma escala e divide por si. */
export const DIMENSOES: Record<Formato, { largura: number; altura: number }> = {
  a4_retrato: { largura: 595.28, altura: 841.89 },
  a4_paisagem: { largura: 841.89, altura: 595.28 },
  quadrado: { largura: 720, altura: 720 },
  widescreen: { largura: 960, altura: 540 },
};

/**
 * A lista é o valor, e o tipo sai DELA -- não o contrário.
 *
 * Havia duas listas: esta e uma cópia dentro do validador de documento. Acrescentar um
 * tipo de página aqui compilava, montava e gravava certo, e as páginas novas sumiam
 * calado na hora de LER do banco, porque a cópia não conhecia o nome. Uma lista só, e o
 * validador importa daqui: agora não tem como divergir.
 */
export const TIPOS_PAGINA = ["capa", "foto", "planta", "destaques", "localizacao", "ficha", "texto", "contato", "imovel"] as const;

export type TipoPagina = (typeof TIPOS_PAGINA)[number];

/** Como a página de foto se organiza. Três opções, de propósito -- não é editor gráfico. */
export type LayoutFoto = "cheia" | "duas" | "foto_texto";

export type DefBook = {
  id: TipoBook;
  rotulo: string;
  /** Uma linha na língua do corretor, pra aparecer no cartão de escolha. */
  para: string;
  formato: Formato;
  /** Teto de fotos. Sobrando, entram duas por página em vez de esticar o arquivo. */
  maxFotos: number;
  usaPreco: boolean;
  /** Agrupa por imóvel: o catálogo fala de vários, os outros de um só. */
  variosImoveis: boolean;
  /** Páginas que este tipo sempre tem, fora as de foto. */
  paginasFixas: TipoPagina[];
  /** Uma foto por página, sem legenda grande: o alto padrão respira. */
  fotoPorPagina: boolean;
};

export const TIPOS: DefBook[] = [
  {
    id: "book",
    rotulo: "Book do imóvel",
    para: "O apanhado completo pra mandar ao cliente: capa, todas as fotos e seu contato.",
    formato: "a4_retrato",
    maxFotos: 24,
    usaPreco: true,
    variosImoveis: false,
    paginasFixas: ["capa", "destaques", "localizacao", "ficha", "contato"],
    fotoPorPagina: false,
  },
  {
    id: "whatsapp",
    rotulo: "PDF pro WhatsApp",
    para: "Uma página só, leve de mandar: foto grande, preço e mais quatro fotos.",
    formato: "a4_retrato",
    maxFotos: 5,
    usaPreco: true,
    variosImoveis: false,
    paginasFixas: ["capa"],
    fotoPorPagina: false,
  },
  {
    id: "alto_padrao",
    rotulo: "Alto padrão",
    para: "Uma imagem por página, com margem. A foto é o produto e o texto atrapalha.",
    formato: "quadrado",
    maxFotos: 20,
    usaPreco: false,
    variosImoveis: false,
    paginasFixas: ["capa", "destaques", "localizacao", "ficha", "contato"],
    fotoPorPagina: true,
  },
  {
    id: "lancamento",
    rotulo: "Lançamento",
    para: "Deitado, do jeito que se projeta numa reunião. Preço fica fora do arquivo.",
    formato: "widescreen",
    maxFotos: 20,
    usaPreco: false,
    variosImoveis: false,
    paginasFixas: ["capa", "texto", "destaques", "localizacao", "ficha", "contato"],
    fotoPorPagina: true,
  },
  {
    id: "catalogo",
    rotulo: "Catálogo de imóveis",
    para: "Vários imóveis num arquivo, com o preço de cada um.",
    formato: "a4_retrato",
    maxFotos: 24,
    usaPreco: true,
    variosImoveis: true,
    paginasFixas: ["capa", "contato"],
    fotoPorPagina: false,
  },
];

export const TIPO_POR_ID: Record<string, DefBook> = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

/**
 * Qual tipo sugerir. Não é aleatório: sai do que existe.
 *
 * Abaixo de cinco imagens o book de 14 páginas fica pior que nenhum -- repete foto e
 * parece descuido. Nesse caso a sugestão é a página única, e a tela diz por quê.
 */
export function tipoSugerido(quantasImagens: number, quantosImoveis: number): { tipo: TipoBook; porque: string } {
  if (quantosImoveis > 1) return { tipo: "catalogo", porque: `${quantosImoveis} imóveis escolhidos` };
  if (quantasImagens < 5) return { tipo: "whatsapp", porque: `com ${quantasImagens} ${quantasImagens === 1 ? "foto" : "fotos"}, uma página só fica melhor que um book` };
  return { tipo: "book", porque: `${quantasImagens} fotos de um imóvel` };
}

/** Teto de páginas por tipo, pra estimativa antes de montar. */
export function paginasEstimadas(tipo: TipoBook, quantasFotos: number): number {
  const def = TIPO_POR_ID[tipo];
  if (!def) return 0;
  if (tipo === "whatsapp") return 1;
  const fotos = Math.min(quantasFotos, def.maxFotos);
  const dePagina = def.fotoPorPagina ? Math.max(0, fotos - 1) : Math.ceil(Math.max(0, fotos - 1) / 2);
  return 1 + dePagina + def.paginasFixas.filter((p) => p !== "capa").length;
}
