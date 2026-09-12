// Ofertas do Encena. Uma lista só para a tela de planos, o botão de assinar e o
// servidor. A Stripe é a fonte da verdade de PREÇO e CRÉDITO (metadata do price); aqui
// fica o que a tela mostra e a chave de busca (`lookup_key`) que liga os dois. Criar o
// mesmo conjunto em modo live é só repetir as chaves -- nenhum id de preço mora em env.
//
// Dois públicos (12/09/2026): corretor autônomo (Pro) e imobiliária (Equipe e
// Imobiliária, com conta de equipe: créditos compartilhados, convites, marca da casa).
// Plano anual paga 10 meses e libera os créditos MÊS A MÊS (metadata creditos_por_mes):
// evita pagar, gastar tudo em uma semana e pedir reembolso nos 7 dias do CDC.
//
// Conta de custo e margem: docs/precos-e-margens.md. Sem segredo neste arquivo.

export type Segmento = "corretor" | "imobiliaria" | "pacote";
export type PlanoId = "gratis" | "pro" | "equipe" | "imobiliaria";
export type OfertaId =
  | "pro_mensal"
  | "pro_anual"
  | "equipe_mensal"
  | "equipe_anual"
  | "imobiliaria_mensal"
  | "imobiliaria_anual"
  | "pacote_20"
  | "pacote_80"
  | "pacote_200";

export type Oferta = {
  id: OfertaId;
  lookupKey: string;
  segmento: Segmento;
  tipo: "assinatura" | "pacote";
  plano?: PlanoId;
  rotulo: string;
  /** Em centavos de real. */
  preco: number;
  /** Assinatura: créditos por mês. Pacote: total. */
  creditos: number;
  periodo?: "mês" | "ano";
  /** Pessoas incluídas (conta de equipe). */
  pessoas?: number;
  destaque?: boolean;
  descricao: string;
  detalhes: string[];
};

/** Quantas pessoas cada plano comporta na conta de equipe. `gratis` é pra montar e testar. */
export const PESSOAS_POR_PLANO: Record<PlanoId, number> = { gratis: 3, pro: 1, equipe: 5, imobiliaria: 15 };

const BASE_EQUIPE = ["Conta de equipe: cada corretor com seu login", "Créditos compartilhados, uso por pessoa visível", "Marca da imobiliária nas fotos, vídeos e links", "Todas as ações de edição e o vídeo"];

export const OFERTAS: Oferta[] = [
  {
    id: "pro_mensal",
    lookupKey: "encena_pro_mensal",
    segmento: "corretor",
    tipo: "assinatura",
    plano: "pro",
    rotulo: "Pro mensal",
    preco: 6900,
    creditos: 80,
    periodo: "mês",
    pessoas: 1,
    descricao: "80 fotos por mês, renovando sozinho.",
    detalhes: ["80 créditos todo mês", "Todas as ações de edição e o vídeo", "Imóveis, galeria e links de compartilhamento", "Cancele quando quiser"],
  },
  {
    id: "pro_anual",
    lookupKey: "encena_pro_anual",
    segmento: "corretor",
    tipo: "assinatura",
    plano: "pro",
    rotulo: "Pro anual",
    preco: 69000,
    creditos: 80,
    periodo: "ano",
    pessoas: 1,
    destaque: true,
    descricao: "Paga 10 meses, usa 12. Créditos entram mês a mês.",
    detalhes: ["80 créditos por mês, por 12 meses", "Equivale a R$ 57,50 por mês", "Todas as ações de edição e o vídeo", "Imóveis, galeria e links de compartilhamento"],
  },
  {
    id: "equipe_mensal",
    lookupKey: "encena_equipe_mensal",
    segmento: "imobiliaria",
    tipo: "assinatura",
    plano: "equipe",
    rotulo: "Equipe mensal",
    preco: 24900,
    creditos: 400,
    periodo: "mês",
    pessoas: 5,
    descricao: "Até 5 pessoas e 400 fotos por mês.",
    detalhes: ["400 créditos todo mês", "Até 5 pessoas", ...BASE_EQUIPE, "Cancele quando quiser"],
  },
  {
    id: "equipe_anual",
    lookupKey: "encena_equipe_anual",
    segmento: "imobiliaria",
    tipo: "assinatura",
    plano: "equipe",
    rotulo: "Equipe anual",
    preco: 249000,
    creditos: 400,
    periodo: "ano",
    pessoas: 5,
    destaque: true,
    descricao: "Paga 10 meses, usa 12. Créditos entram mês a mês.",
    detalhes: ["400 créditos por mês, por 12 meses", "Até 5 pessoas", "Equivale a R$ 207,50 por mês", ...BASE_EQUIPE],
  },
  {
    id: "imobiliaria_mensal",
    lookupKey: "encena_imobiliaria_mensal",
    segmento: "imobiliaria",
    tipo: "assinatura",
    plano: "imobiliaria",
    rotulo: "Imobiliária mensal",
    preco: 59900,
    creditos: 1200,
    periodo: "mês",
    pessoas: 15,
    descricao: "Até 15 pessoas e 1.200 fotos por mês.",
    detalhes: ["1.200 créditos todo mês", "Até 15 pessoas", ...BASE_EQUIPE, "Cancele quando quiser"],
  },
  {
    id: "imobiliaria_anual",
    lookupKey: "encena_imobiliaria_anual",
    segmento: "imobiliaria",
    tipo: "assinatura",
    plano: "imobiliaria",
    rotulo: "Imobiliária anual",
    preco: 599000,
    creditos: 1200,
    periodo: "ano",
    pessoas: 15,
    descricao: "Paga 10 meses, usa 12. Créditos entram mês a mês.",
    detalhes: ["1.200 créditos por mês, por 12 meses", "Até 15 pessoas", "Equivale a R$ 499 por mês", ...BASE_EQUIPE],
  },
  {
    id: "pacote_20",
    lookupKey: "encena_pacote_20",
    segmento: "pacote",
    tipo: "pacote",
    rotulo: "20 créditos",
    preco: 2500,
    creditos: 20,
    descricao: "Pra um imóvel avulso.",
    detalhes: ["R$ 1,25 por foto", "Não expira", "Sem renovação"],
  },
  {
    id: "pacote_80",
    lookupKey: "encena_pacote_80",
    segmento: "pacote",
    tipo: "pacote",
    rotulo: "80 créditos",
    preco: 6900,
    creditos: 80,
    descricao: "O mesmo que um mês do Pro, sem assinar.",
    detalhes: ["R$ 0,86 por foto", "Não expira", "Sem renovação"],
  },
  {
    id: "pacote_200",
    lookupKey: "encena_pacote_200",
    segmento: "pacote",
    tipo: "pacote",
    rotulo: "200 créditos",
    preco: 14900,
    creditos: 200,
    descricao: "Pra lançamento ou mês cheio.",
    detalhes: ["R$ 0,75 por foto", "Não expira", "Sem renovação"],
  },
];

export const OFERTAS_POR_ID = Object.fromEntries(OFERTAS.map((o) => [o.id, o])) as Record<OfertaId, Oferta>;

export function ehOfertaId(v: unknown): v is OfertaId {
  return typeof v === "string" && v in OFERTAS_POR_ID;
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: centavos % 100 === 0 ? 0 : 2 });
}

export function rotuloDoPlano(plano: string | null | undefined): string {
  switch (plano) {
    case "pro":
      return "Pro";
    case "equipe":
      return "Equipe";
    case "imobiliaria":
      return "Imobiliária";
    default:
      return "Grátis";
  }
}
