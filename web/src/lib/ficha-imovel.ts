// A ficha técnica do imóvel: os campos que alimentam a página de ficha do book e a capa.
//
// Fica num lugar só porque a rota valida por esta lista e a tela desenha por esta lista.
// Duas listas iguais em arquivos diferentes é como um campo novo entra numa metade só.
//
// Preço, condomínio e IPTU são TEXTO de propósito: o corretor escreve "sob consulta",
// "a partir de R$ 690.000", "isento". Guardar número obriga a formatar, e formatar moeda
// é onde o bug mora.

export type CampoFicha = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "area" | "longo" | "escolha";
  dica?: string;
  max?: number;
  /** Ocupa a linha inteira no formulário. */
  largo?: boolean;
  /** Só pra tipo "escolha". O valor guardado é `valor`. */
  opcoes?: { valor: string; rotulo: string }[];
};

/**
 * Venda ou locação.
 *
 * O valor sozinho não se explica: "R$ 690.000" é obviamente venda, mas "R$ 2.500" pode ser
 * o aluguel do apartamento ou a venda de uma vaga. Quem escreveu sabe; quem recebe o PDF
 * no WhatsApp não, e é ele que decide se liga.
 *
 * Fica em cima porque muda o rótulo do campo logo abaixo -- na locação, "Preço" vira
 * "Aluguel" -- e porque é a primeira coisa que o corretor pensa sobre o imóvel.
 */
export const NEGOCIOS = [
  { valor: "venda", rotulo: "Venda" },
  { valor: "locacao", rotulo: "Locação" },
  { valor: "ambos", rotulo: "Venda e locação" },
];

export const CAMPOS_FICHA: CampoFicha[] = [
  { chave: "negocio", rotulo: "Negócio", tipo: "escolha", opcoes: NEGOCIOS, largo: true, dica: "Muda o rótulo do valor e o “/mês” nos materiais. Em branco, o valor sai como você escreveu." },
  { chave: "preco", rotulo: "Preço", tipo: "texto", max: 40, dica: "R$ 690.000, sob consulta…" },
  { chave: "condominio", rotulo: "Condomínio", tipo: "texto", max: 40, dica: "R$ 780, isento…" },
  { chave: "iptu", rotulo: "IPTU", tipo: "texto", max: 40 },
  { chave: "area_util", rotulo: "Área útil", tipo: "area", dica: "m²" },
  { chave: "area_total", rotulo: "Área total", tipo: "area", dica: "m²" },
  { chave: "dormitorios", rotulo: "Dormitórios", tipo: "numero" },
  { chave: "suites", rotulo: "Suítes", tipo: "numero" },
  { chave: "banheiros", rotulo: "Banheiros", tipo: "numero" },
  { chave: "vagas", rotulo: "Vagas", tipo: "numero" },
  { chave: "ano_construcao", rotulo: "Ano", tipo: "numero", dica: "de construção" },
  {
    chave: "registro_incorporacao",
    rotulo: "Registro de incorporação",
    tipo: "texto",
    max: 120,
    largo: true,
    dica: "Número, matrícula e cartório. A lei exige em anúncio de imóvel na planta.",
  },
  { chave: "descricao", rotulo: "Descrição", tipo: "longo", max: 600, largo: true, dica: "Duas ou três linhas. Sai na capa do book." },
];

export const CHAVES_FICHA = CAMPOS_FICHA.map((c) => c.chave);

/**
 * Como o valor deve ser chamado e escrito, dado o negócio.
 *
 * Um lugar só, e todo mundo que imprime preço passa por aqui. É a lição de hoje repetida
 * duas vezes: texto corrigido num lugar e esquecido no outro é o bug mais comum desta
 * base -- o cartão do 360, o preço do book.
 *
 * Sem negócio informado, devolve o valor exatamente como o corretor escreveu. Acrescentar
 * "/mês" por conta própria seria inventar um fato sobre o imóvel, que é justamente o que o
 * guarda de fatos existe pra impedir.
 */
export function rotuloDoValor(negocio?: string | null): string {
  if (negocio === "locacao") return "Aluguel";
  if (negocio === "ambos") return "Venda / aluguel";
  return "Preço";
}

export function valorComPeriodo(valor: string | null | undefined, negocio?: string | null): string {
  const v = (valor ?? "").trim();
  if (!v || negocio !== "locacao") return v;
  // Não repete o que já está escrito: o corretor que digitou "R$ 2.500/mês" não merece
  // "R$ 2.500/mês/mês".
  if (/\/\s*m[êe]s|por m[êe]s|mensal/i.test(v)) return v;
  // "Sob consulta", "a combinar": não é valor, não leva período.
  if (!/\d/.test(v)) return v;
  return `${v}/mês`;
}

/** Limpa o que veio do navegador, campo a campo, pelo tipo declarado acima. */
export function limparFicha(corpo: Record<string, unknown>): Record<string, string | number | null> {
  const saida: Record<string, string | number | null> = {};
  for (const campo of CAMPOS_FICHA) {
    if (!(campo.chave in corpo)) continue;
    const bruto = corpo[campo.chave];
    if (bruto === null || bruto === "") {
      saida[campo.chave] = null;
      continue;
    }
    // Escolha: só valor da lista entra. O que vier de fora vira null, e o produto volta a
    // imprimir o valor cru -- que é o comportamento de quem não escolheu.
    if (campo.tipo === "escolha") {
      const v = String(bruto).trim();
      saida[campo.chave] = campo.opcoes?.some((o) => o.valor === v) ? v : null;
      continue;
    }
    if (campo.tipo === "numero" || campo.tipo === "area") {
      // Aceita "96", "96,5" e "96.5": quem digita área usa vírgula.
      const n = Number(String(bruto).replace(",", "."));
      saida[campo.chave] = Number.isFinite(n) && n >= 0 ? (campo.tipo === "numero" ? Math.round(n) : Math.round(n * 100) / 100) : null;
    } else {
      saida[campo.chave] = String(bruto).trim().slice(0, campo.max ?? 120) || null;
    }
  }
  return saida;
}
