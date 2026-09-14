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
  tipo: "texto" | "numero" | "area" | "longo";
  dica?: string;
  max?: number;
  /** Ocupa a linha inteira no formulário. */
  largo?: boolean;
};

export const CAMPOS_FICHA: CampoFicha[] = [
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
