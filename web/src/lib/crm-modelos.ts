import { ORIGEM_POR_ID, pedeDadoSensivel, semLinks, type EtapaId, type OrigemId } from "./crm";

// MODELOS DE MENSAGEM: o texto da casa, escrito por quem vende.
//
// Pedido do dono (21/09/2026): "quero opção de deixar mensagens personalizadas que a própria
// corretora ou imobiliária queira deixar", e "deixa opção da pessoa personalizar tb e deixar
// automático pra cada situação".
//
// Por que isso não é só conveniência: a mensagem que a IA escreve é boa e genérica. Quem
// vende há dez anos tem a SUA frase -- a que funciona no bairro dele, com o jeito dele. Antes
// ele tinha que reescrevê-la a cada cliente. Agora escreve uma vez por situação, marca como
// automática, e ela já vem pronta. Sem IA no meio: não gasta crédito e não muda sozinha.
//
// As travas do estudo jurídico continuam valendo sobre o texto dele, e é aqui que elas são
// aplicadas: no primeiro contato o Encena põe a identificação (nome + CRECI) em volta e tira
// qualquer link, e nenhum modelo pode pedir documento ou dado bancário.

/** Os momentos da conversa. É por eles que um modelo vira automático. */
export const SITUACOES = [
  { id: "primeiro_contato", rotulo: "Primeiro contato", dica: "A primeira mensagem, antes de a pessoa responder" },
  { id: "retorno", rotulo: "Retorno / sem resposta", dica: "Quando ela ainda não respondeu, ou faz tempo que não falam" },
  { id: "visita", rotulo: "Visita", dica: "Marcar, confirmar ou agradecer a visita" },
  { id: "proposta", rotulo: "Proposta", dica: "Quando a negociação está na mesa" },
  { id: "fechado", rotulo: "Fechado", dica: "Depois do negócio fechado" },
  { id: "qualquer", rotulo: "Qualquer momento", dica: "Um texto solto, que você escolhe na hora" },
] as const;
export type SituacaoId = (typeof SITUACOES)[number]["id"];
export const SITUACAO_POR_ID = Object.fromEntries(SITUACOES.map((s) => [s.id, s])) as Record<SituacaoId, (typeof SITUACOES)[number]>;

export const LIMITES_MODELO = {
  tituloMax: 60,
  textoMax: 900,
  /** Por conta. Passou disso, a lista vira um problema em vez de um atalho. */
  porConta: 40,
};

/**
 * O que a pessoa pode escrever entre chaves. Trocado na hora de usar.
 *
 * Nome curto e em português de propósito: quem escreve isto é corretor, não programador.
 */
export const VARIAVEIS = [
  { chave: "nome", rotulo: "Primeiro nome do cliente", exemplo: "Maria" },
  { chave: "nome_completo", rotulo: "Nome completo do cliente", exemplo: "Maria Souza" },
  { chave: "corretor", rotulo: "Seu nome", exemplo: "João Lima" },
  { chave: "creci", rotulo: "Seu CRECI", exemplo: "12345-F" },
  { chave: "imovel", rotulo: "Imóvel de interesse", exemplo: "Apto 302 · Setor Bueno" },
  { chave: "origem", rotulo: "De onde veio o contato", exemplo: "pelo anúncio no portal" },
] as const;
export type ChaveVariavel = (typeof VARIAVEIS)[number]["chave"];

export type DadosDaVariavel = {
  nomeLead: string;
  corretor: string;
  creci: string;
  imovel?: string | null;
  origem?: OrigemId | null;
};

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/**
 * Troca as chaves pelo valor. Chave que não existe some, e chave sem valor some junto com o
 * espaço em volta -- "sobre o {imovel}" sem imóvel viraria "sobre o", que é pior que nada.
 */
export function aplicarVariaveis(texto: string, d: DadosDaVariavel): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(d.nomeLead),
    nome_completo: d.nomeLead.trim(),
    corretor: d.corretor.trim(),
    creci: d.creci.trim(),
    imovel: d.imovel?.trim() ?? "",
    origem: d.origem ? (ORIGEM_POR_ID[d.origem]?.frase ?? "") : "",
  };
  return texto
    .replace(/\{([a-z_]+)\}/gi, (_, chave: string) => valores[chave.toLowerCase()] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** As chaves escritas no texto que NÃO existem -- pra avisar antes de salvar. */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS.map((v) => v.chave));
  const achadas = [...texto.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(achadas.filter((c) => !conhecidas.has(c)))];
}

/**
 * Em que situação este cliente está agora. É o que faz o modelo automático aparecer sozinho.
 *
 * A ordem importa: "ainda não mandei nada" ganha de tudo (é o primeiro contato de verdade), e
 * a etapa da negociação ganha do "sem resposta" -- quem já está em proposta e não respondeu
 * hoje continua sendo uma proposta, não um lead frio.
 */
export function situacaoDoLead(lead: { etapa: EtapaId; ultimo_envio_em?: string | null; tentativas_sem_resposta?: number }): SituacaoId {
  if (!lead.ultimo_envio_em) return "primeiro_contato";
  if (lead.etapa === "fechado") return "fechado";
  if (lead.etapa === "proposta") return "proposta";
  if (lead.etapa === "visita") return "visita";
  if (lead.etapa === "sem_resposta" || (lead.tentativas_sem_resposta ?? 0) > 0) return "retorno";
  return "retorno";
}

export type Modelo = { id: string; situacao: SituacaoId; titulo: string; texto: string; automatico: boolean };

/** O modelo que deve vir preenchido sozinho, se houver. "Qualquer momento" nunca é automático. */
export function modeloAutomatico(modelos: Modelo[], situacao: SituacaoId): Modelo | null {
  return modelos.find((m) => m.automatico && m.situacao === situacao) ?? null;
}

/** Os que fazem sentido oferecer nesta situação: os dela, e os de "qualquer momento". */
export function modelosDaSituacao(modelos: Modelo[], situacao: SituacaoId): Modelo[] {
  return modelos.filter((m) => m.situacao === situacao || m.situacao === "qualquer");
}

export type ProblemaNoModelo = { campo: "titulo" | "texto" | "situacao"; mensagem: string };

/**
 * Confere o que a pessoa escreveu ANTES de salvar.
 *
 * As mesmas travas da mensagem da IA, porque o texto vai pro mesmo lugar: nada de documento
 * ou dado bancário, e no primeiro contato nada de link (link no 1º contato é o que marca
 * spam). Fora isso, o texto é dela -- o Encena não reescreve o jeito de ninguém vender.
 */
export function conferirModelo(m: { situacao: string; titulo: string; texto: string }): ProblemaNoModelo[] {
  const problemas: ProblemaNoModelo[] = [];
  if (!SITUACOES.some((s) => s.id === m.situacao)) problemas.push({ campo: "situacao", mensagem: "Escolha um momento da conversa." });
  const titulo = m.titulo.trim();
  if (!titulo) problemas.push({ campo: "titulo", mensagem: "Dê um nome pra você achar depois." });
  if (titulo.length > LIMITES_MODELO.tituloMax) problemas.push({ campo: "titulo", mensagem: `O nome passa de ${LIMITES_MODELO.tituloMax} letras.` });
  const texto = m.texto.trim();
  if (!texto) problemas.push({ campo: "texto", mensagem: "Escreva a mensagem." });
  if (texto.length > LIMITES_MODELO.textoMax) problemas.push({ campo: "texto", mensagem: `A mensagem passa de ${LIMITES_MODELO.textoMax} letras.` });
  if (pedeDadoSensivel(texto)) problemas.push({ campo: "texto", mensagem: "A mensagem não pode pedir documento, PIX nem dado bancário." });
  if (m.situacao === "primeiro_contato" && /\bhttps?:\/\/|\bwww\./i.test(texto)) {
    problemas.push({ campo: "texto", mensagem: "Sem link na primeira mensagem: é o que faz a conversa ser marcada como spam. O link vai depois que a pessoa responder." });
  }
  const desconhecidas = variaveisDesconhecidas(texto);
  if (desconhecidas.length) {
    problemas.push({ campo: "texto", mensagem: `Não conheço ${desconhecidas.map((c) => `{${c}}`).join(", ")}. Use: ${VARIAVEIS.map((v) => `{${v.chave}}`).join(", ")}.` });
  }
  return problemas;
}

/**
 * O texto do modelo virando a mensagem que vai sair.
 *
 * No primeiro contato o Encena continua pondo a identificação em volta e tirando link -- as
 * duas coisas que a regra exige e que não podem depender de a pessoa ter lembrado.
 */
export function mensagemDoModelo(o: { modelo: Modelo; primeiroContato: boolean; dados: DadosDaVariavel }): string {
  const corpo = aplicarVariaveis(o.modelo.texto, o.dados);
  if (!o.primeiroContato) return corpo;
  const miolo = semLinks(corpo).replace(/\s*\n\s*/g, " ");
  return `Olá, ${primeiroNome(o.dados.nomeLead)}! Aqui é ${o.dados.corretor.trim()}, corretor(a) de imóveis, CRECI ${o.dados.creci.trim()}. ${miolo}`
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sugestões pra quem abre a tela pela primeira vez e não sabe o que escrever. */
export const MODELOS_SUGERIDOS: { situacao: SituacaoId; titulo: string; texto: string }[] = [
  {
    situacao: "primeiro_contato",
    titulo: "Apresentação",
    texto: "Vi que você se interessou {origem}. Posso te mandar as fotos e os detalhes do {imovel}?",
  },
  {
    situacao: "retorno",
    titulo: "Lembrete simpático",
    texto: "Oi, {nome}! Passando pra saber se você ainda tem interesse. Se quiser, te mando novidades parecidas com o que você procurava.",
  },
  {
    situacao: "visita",
    titulo: "Confirmar visita",
    texto: "Oi, {nome}! Confirmando nossa visita ao {imovel}. Qualquer imprevisto é só me avisar que a gente remarca.",
  },
  {
    situacao: "proposta",
    titulo: "Acompanhar proposta",
    texto: "Oi, {nome}! Levei sua proposta do {imovel} ao proprietário. Assim que tiver retorno eu te falo.",
  },
  {
    situacao: "fechado",
    titulo: "Agradecer",
    texto: "Obrigado pela confiança, {nome}! Qualquer coisa do {imovel}, é só me chamar. E se conhecer alguém procurando imóvel, me indica :)",
  },
];
