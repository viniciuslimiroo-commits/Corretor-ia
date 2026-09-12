// Ofertas do Encena. Uma lista só para a tela de planos, o botão de assinar e o
// servidor. A Stripe é a fonte da verdade de PREÇO e CRÉDITO (metadata do price); aqui
// fica o que a tela mostra e a chave de busca (`lookup_key`) que liga os dois. Criar o
// mesmo conjunto em modo live é só repetir as chaves -- nenhum id de preço mora em env.
//
// Referência de custo (medido em 12/09/2026): US$ 0,04 por geração ≈ R$ 0,22. O pacote
// mais barato por crédito (R$ 0,75) ainda paga o modelo três vezes.
//
// Sem segredo neste arquivo: ele é importado pelo navegador.

export type OfertaId = "pro_mensal" | "pro_anual" | "pacote_20" | "pacote_80" | "pacote_200";

export type Oferta = {
  id: OfertaId;
  lookupKey: string;
  tipo: "assinatura" | "pacote";
  rotulo: string;
  /** Em centavos de real. */
  preco: number;
  creditos: number;
  periodo?: "mês" | "ano";
  destaque?: boolean;
  descricao: string;
  detalhes: string[];
};

export const OFERTAS: Oferta[] = [
  {
    id: "pro_mensal",
    lookupKey: "encena_pro_mensal",
    tipo: "assinatura",
    rotulo: "Pro mensal",
    preco: 6900,
    creditos: 80,
    periodo: "mês",
    descricao: "80 fotos por mês, renovando sozinho.",
    detalhes: ["80 créditos todo mês", "Todas as ações de edição", "Imóveis, galeria e links de compartilhamento", "Cancele quando quiser"],
  },
  {
    id: "pro_anual",
    lookupKey: "encena_pro_anual",
    tipo: "assinatura",
    rotulo: "Pro anual",
    preco: 69000,
    creditos: 960,
    periodo: "ano",
    destaque: true,
    descricao: "Dois meses grátis e os 960 créditos entram de uma vez.",
    detalhes: ["960 créditos na hora (80 × 12)", "Equivale a R$ 57,50 por mês", "Todas as ações de edição", "Imóveis, galeria e links de compartilhamento"],
  },
  {
    id: "pacote_20",
    lookupKey: "encena_pacote_20",
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
    tipo: "pacote",
    rotulo: "200 créditos",
    preco: 14900,
    creditos: 200,
    descricao: "Pra imobiliária ou lançamento.",
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
