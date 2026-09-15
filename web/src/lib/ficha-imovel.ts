// A ficha técnica do imóvel: os campos que alimentam a página de ficha do book e a capa.
//
// Fica num lugar só porque a rota valida por esta lista e a tela desenha por esta lista.
// Duas listas iguais em arquivos diferentes é como um campo novo entra numa metade só.
//
// Preço, condomínio e IPTU são TEXTO de propósito: o corretor escreve "sob consulta",
// "a partir de R$ 690.000", "isento". Guardar número obriga a formatar, e formatar moeda
// é onde o bug mora.

import type { Idioma } from "@/i18n/idiomas";

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
 *
 * O vocabulário da ficha, nos três idiomas.
 *
 * Existe porque estas palavras NÃO ficam na tela: elas entram desenhadas dentro do vídeo
 * e impressas no material, que é o que o corretor manda pro cliente dele. "3 quartos"
 * dentro de um Reels em espanhol não é falta de polimento -- é a peça saindo errada.
 *
 * O VALOR em si não é traduzido nem formatado: quem digita o preço é o corretor, no
 * cadastro, com o símbolo e a pontuação do país dele. A Encena não adivinha moeda; ela
 * só não estraga o que foi digitado. O que muda aqui é a palavra em volta.
 */
const PALAVRAS: Record<Idioma, { quarto: [string, string]; vaga: [string, string]; suite: [string, string]; banheiro: [string, string]; preco: string; aluguel: string; ambos: string; porMes: string; cond: string }> = {
  pt: { quarto: ["quarto", "quartos"], vaga: ["vaga", "vagas"], suite: ["suíte", "suítes"], banheiro: ["banheiro", "banheiros"], preco: "Preço", aluguel: "Aluguel", ambos: "Venda / aluguel", porMes: "/mês", cond: "Cond." },
  es: { quarto: ["dormitorio", "dormitorios"], vaga: ["cochera", "cocheras"], suite: ["suite", "suites"], banheiro: ["baño", "baños"], preco: "Precio", aluguel: "Alquiler", ambos: "Venta / alquiler", porMes: "/mes", cond: "Cond." },
  en: { quarto: ["bedroom", "bedrooms"], vaga: ["garage", "garages"], suite: ["suite", "suites"], banheiro: ["bathroom", "bathrooms"], preco: "Price", aluguel: "Rent", ambos: "Sale / rent", porMes: "/month", cond: "HOA" },
};

export function rotuloDoValor(negocio?: string | null, idioma: Idioma = "pt"): string {
  const pal = PALAVRAS[idioma];
  if (negocio === "locacao") return pal.aluguel;
  if (negocio === "ambos") return pal.ambos;
  return pal.preco;
}

export function valorComPeriodo(valor: string | null | undefined, negocio?: string | null, idioma: Idioma = "pt"): string {
  const v = (valor ?? "").trim();
  if (!v || negocio !== "locacao") return v;
  // Não repete o que já está escrito: o corretor que digitou "R$ 2.500/mês" não merece
  // "R$ 2.500/mês/mês". Vale pros três idiomas, porque quem digitou pode ter escrito em
  // qualquer um deles.
  if (/\/\s*m[êe]s|por m[êe]s|mensal|\/\s*mes\b|\/\s*month|per month|monthly/i.test(v)) return v;
  // "Sob consulta", "a combinar": não é valor, não leva período.
  if (!/\d/.test(v)) return v;
  return `${v}${PALAVRAS[idioma].porMes}`;
}

/**
 * A ficha em uma linha curta: "3 quartos · 2 vagas · 120 m²". Pra legenda de cena de
 * vídeo (40 caracteres) e onde mais couber um resumo.
 *
 * Só o que está preenchido entra; nada é inventado nem arredondado pra cima. A ordem é a
 * que o comprador pergunta primeiro -- quartos, vagas, área -- e o que não couber no
 * limite fica de fora em vez de cortar palavra no meio.
 */
export function resumoDaFicha(ficha: Record<string, unknown> | null | undefined, max = 40, idioma: Idioma = "pt"): string {
  if (!ficha) return "";
  const n = (k: string) => {
    const v = Number(ficha[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const pal = PALAVRAS[idioma];
  const partes: string[] = [];
  const dorm = n("dormitorios");
  if (dorm) partes.push(`${dorm} ${pal.quarto[dorm === 1 ? 0 : 1]}`);
  const vagas = n("vagas");
  if (vagas) partes.push(`${vagas} ${pal.vaga[vagas === 1 ? 0 : 1]}`);
  const area = n("area_util") ?? n("area_total");
  if (area) partes.push(`${String(area).replace(".", ",")} m²`);
  const suites = n("suites");
  if (suites) partes.push(`${suites} ${pal.suite[suites === 1 ? 0 : 1]}`);
  const banh = n("banheiros");
  if (banh) partes.push(`${banh} ${pal.banheiro[banh === 1 ? 0 : 1]}`);
  let linha = "";
  for (const p of partes) {
    const tentativa = linha ? `${linha} · ${p}` : p;
    if (tentativa.length > max) break;
    linha = tentativa;
  }
  return linha;
}

/**
 * As PEÇAS do imóvel: cada dado da ficha já escrito do jeito que vai pro vídeo ou pro
 * material, pronto pra virar um texto na tela.
 *
 * Existe pra o editor não pedir que o corretor digite "R$ 690.000" de novo -- ele já
 * digitou uma vez, no cadastro. Só entra o que está preenchido: peça vazia não vira
 * botão, e botão que insere texto em branco é pior que botão nenhum.
 *
 * A marca entra junto porque, na hora de montar, CRECI e WhatsApp são da mesma família
 * de "dados que eu não quero digitar" -- e vêm do mesmo lugar pra vídeo e pra book.
 */
export function pecasDoImovel(
  ficha: Record<string, unknown> | null | undefined,
  marca?: { nome?: string | null; creci?: string | null; whatsapp?: string | null } | null,
  idioma: Idioma = "pt"
): { id: string; rotulo: string; texto: string }[] {
  const pal = PALAVRAS[idioma];
  const pecas: { id: string; rotulo: string; texto: string }[] = [];
  const f = ficha ?? {};
  const num = (k: string) => {
    const v = Number(f[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const txt = (k: string) => {
    const v = f[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const negocio = txt("negocio");
  const preco = valorComPeriodo(txt("preco"), negocio);
  if (preco) pecas.push({ id: "preco", rotulo: rotuloDoValor(negocio), texto: preco });

  const dorm = num("dormitorios");
  if (dorm) pecas.push({ id: "dormitorios", rotulo: pal.quarto[1], texto: `${dorm} ${pal.quarto[dorm === 1 ? 0 : 1]}` });
  const suites = num("suites");
  if (suites) pecas.push({ id: "suites", rotulo: pal.suite[1], texto: `${suites} ${pal.suite[suites === 1 ? 0 : 1]}` });
  const banheiros = num("banheiros");
  if (banheiros) pecas.push({ id: "banheiros", rotulo: pal.banheiro[1], texto: `${banheiros} ${pal.banheiro[banheiros === 1 ? 0 : 1]}` });
  const vagas = num("vagas");
  if (vagas) pecas.push({ id: "vagas", rotulo: pal.vaga[1], texto: `${vagas} ${pal.vaga[vagas === 1 ? 0 : 1]}` });
  const area = num("area_util") ?? num("area_total");
  if (area) pecas.push({ id: "area", rotulo: "Área", texto: `${String(area).replace(".", ",")} m²` });
  const cond = txt("condominio");
  if (cond) pecas.push({ id: "condominio", rotulo: pal.cond, texto: `${pal.cond} ${cond}` });

  const resumo = resumoDaFicha(f, 44, idioma);
  if (resumo && resumo.includes("·")) pecas.push({ id: "resumo", rotulo: "Resumo", texto: resumo });

  if (marca?.nome) pecas.push({ id: "corretor", rotulo: "Nome", texto: marca.nome });
  if (marca?.creci) pecas.push({ id: "creci", rotulo: "CRECI", texto: `CRECI ${marca.creci}` });
  if (marca?.whatsapp) {
    const n = marca.whatsapp.replace(/\D/g, "").slice(-11);
    const formatado = n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : marca.whatsapp;
    pecas.push({ id: "whatsapp", rotulo: "WhatsApp", texto: formatado });
  }
  return pecas;
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
