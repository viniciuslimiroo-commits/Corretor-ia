// CRM DO ENCENA: as regras, sem banco e sem rede.
//
// O estudo jurídico (docs/planos/crm-whatsapp-regras.md, seção 5) listou as travas que
// separam "CRM de corretor" de "ferramenta de lista fria". Elas moram AQUI, em funções
// puras, e são testadas no Node (scripts/testar-crm.ts) -- não espalhadas em telas:
//
//   1. zero automação: a mensagem sai por um LINK (wa.me) que o corretor abre e envia
//      com o próprio dedo, um por um;
//   2. origem obrigatória, numa lista fechada, sem "lista comprada";
//   3. declaração antes do 1º envio ("essa pessoa me passou o contato e aceitou receber");
//   4. "pediu para parar" e "número errado" travam o envio pra sempre;
//   7. mensagem pronta que se identifica (nome, corretor de imóveis, CRECI, de onde veio o
//      contato) e sem link no primeiro contato;
//   8. sem CRECI no perfil, não envia;
//   9. limite de primeiros contatos por dia, e no máximo 2 mensagens sem resposta;
//  11. aviso pra contato frio com DDD de SP e do PR, e fora do horário no PR;
//  12. aviso fixo no campo de observações;
//  16. a mensagem pronta nunca pede documento nem dado bancário.
//
// Regra de marca da Meta: "WhatsApp" não aparece em nome de recurso nem como verbo. Os
// textos dizem "mensagem".

export const ORIGENS = [
  { id: "portal", rotulo: "Portal (ZAP, VivaReal, OLX...)", frase: "pelo anúncio no portal" },
  { id: "site", rotulo: "Meu site", frase: "pelo meu site" },
  { id: "anuncio", rotulo: "Anúncio (Instagram, Facebook, Google)", frase: "pelo meu anúncio" },
  { id: "indicacao", rotulo: "Indicação", frase: "por indicação" },
  { id: "placa", rotulo: "Placa no imóvel", frase: "pela placa no imóvel" },
  { id: "atendimento", rotulo: "Atendimento (plantão, visita, ligação)", frase: "pelo nosso atendimento" },
  { id: "cliente_antigo", rotulo: "Cliente antigo", frase: "porque você já foi meu cliente" },
  { id: "mensagem_recebida", rotulo: "Ele me mandou mensagem", frase: "porque você me mandou mensagem" },
] as const;
export type OrigemId = (typeof ORIGENS)[number]["id"];
export const ORIGEM_POR_ID = Object.fromEntries(ORIGENS.map((o) => [o.id, o])) as Record<OrigemId, (typeof ORIGENS)[number]>;

export const ETAPAS = [
  { id: "novo", rotulo: "Novo" },
  { id: "em_contato", rotulo: "Em conversa" },
  { id: "visita", rotulo: "Visita" },
  { id: "proposta", rotulo: "Proposta" },
  { id: "fechado", rotulo: "Fechado" },
  { id: "perdido", rotulo: "Perdido" },
  { id: "sem_resposta", rotulo: "Sem resposta" },
] as const;
export type EtapaId = (typeof ETAPAS)[number]["id"];
export const ETAPA_POR_ID = Object.fromEntries(ETAPAS.map((e) => [e.id, e])) as Record<EtapaId, (typeof ETAPAS)[number]>;

export const BLOQUEIOS = [
  { id: "pediu_parar", rotulo: "Pediu para parar" },
  { id: "numero_errado", rotulo: "Número errado" },
] as const;
export type BloqueioId = (typeof BLOQUEIOS)[number]["id"];

export const LIMITES_CRM = {
  nomeMax: 80,
  emailMax: 120,
  observacoesMax: 1000,
  /** Primeiros contatos por dia: muita conversa nova no mesmo dia é o que dispara a restrição da conta. */
  primeirosPorDia: 20,
  /** Mensagens seguidas sem resposta. Depois disso o lead vai pra "Sem resposta". */
  tentativasSemResposta: 2,
};

/** A declaração que o corretor assina antes do 1º envio a cada lead. A versão vai pro banco junto. */
export const DECLARACAO = {
  versao: "2026-09-18",
  texto: "Esta pessoa me passou o contato dela e aceitou receber mensagens minhas sobre imóveis.",
};

export const AVISO_OBSERVACOES = "Não anote saúde, religião, dados de crianças nem documentos (RG, CPF, conta de banco).";

// ---------- telefone ----------

/** DDDs em uso no Brasil (Anatel). Número com DDD fora da lista é erro de digitação. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * O telefone como o link da mensagem pede: 55 + DDD + número, só dígitos. Aceita o que a
 * pessoa digita ("(62) 99999-1234", "+55 62 9 9999 1234", "62999991234"). Devolve null
 * pra número que não é do Brasil ou que não fecha a conta de dígitos.
 */
export function normalizarTelefone(bruto: string): { numero: string; ddd: number } | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return null;
  // Celular tem 9 dígitos e começa com 9; fixo tem 8 e começa com 2 a 5.
  const resto = d.slice(2);
  if (resto.length === 9 && resto[0] !== "9") return null;
  if (resto.length === 8 && !/^[2-5]/.test(resto)) return null;
  return { numero: `55${d}`, ddd };
}

/** "+55 (62) 99999-1234", pra mostrar. */
export function telefoneLegivel(numero: string): string {
  const d = numero.replace(/\D/g, "").replace(/^55/, "");
  const ddd = d.slice(0, 2);
  const r = d.slice(2);
  return r.length === 9 ? `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}` : `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
}

// ---------- avisos de estado (cadastro de bloqueio de SP e PR) ----------

const SP = (ddd: number) => ddd >= 11 && ddd <= 19;
const PR = (ddd: number) => ddd >= 41 && ddd <= 46;

/** Hora e dia da semana em Brasília (SP e PR estão nele), sem depender do fuso da máquina. */
function horaDeBrasilia(agora: Date): { hora: number; minuto: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", weekday: "short", hour12: false }).formatToParts(agora);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hora: Number(v("hour")) % 24, minuto: Number(v("minute")), dia: dias[v("weekday")] ?? 1 };
}

/**
 * Avisos pra contato FRIO (ele não procurou o corretor agora) com DDD de SP ou do PR: os
 * cadastros estaduais de bloqueio desses estados incluem mensagem. No PR, também fora do
 * horário permitido (8h-18h em dia útil, 10h-16h no sábado, nunca domingo). Aviso, não
 * trava: a lei é do estado e a decisão é do corretor, mas ele decide sabendo.
 */
export function avisosDoEstado(ddd: number, frio: boolean, agora: Date): string[] {
  if (!frio) return [];
  const avisos: string[] = [];
  if (SP(ddd)) avisos.push("Contato frio com DDD de São Paulo: o estado tem cadastro de bloqueio que inclui mensagem. Confira se a pessoa não está nele.");
  if (PR(ddd)) {
    avisos.push("Contato frio com DDD do Paraná: o estado tem cadastro de bloqueio que inclui mensagem. Confira se a pessoa não está nele.");
    const { hora, minuto, dia } = horaDeBrasilia(agora);
    const m = hora * 60 + minuto;
    const permitido = dia >= 1 && dia <= 5 ? m >= 8 * 60 && m < 18 * 60 : dia === 6 ? m >= 10 * 60 && m < 16 * 60 : false;
    if (!permitido) avisos.push("No Paraná, contato frio só em dia útil das 8h às 18h e sábado das 10h às 16h (nunca domingo e feriado).");
  }
  return avisos;
}

// ---------- mensagem pronta ----------

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

// A FRASE DE SAÍDA SAIU (21/09/2026), por decisão do dono.
//
// A mensagem terminava oferecendo à pessoa a opção de não receber mais ("responda SAIR", e
// depois a versão em português de gente). Ele leu as duas e cortou: "não precisa ter essa
// opção de negativa". É decisão dele, e está registrada aqui e no estudo jurídico.
//
// O que se perde e o que fica, pra a decisão poder ser revista com a conta na mão: a saída
// explícita era o item 7 do estudo (docs/planos/crm-whatsapp-regras.md) e servia pra duas
// coisas -- transparência (LGPD art. 9º) e reduzir denúncia de spam, que é o que restringe a
// conta de mensagem. Continuam de pé as travas que fazem o trabalho pesado: zero automação
// (quem aperta enviar é o corretor), identificação com nome e CRECI em toda primeira
// mensagem, origem declarada de lista fechada, declaração assinada antes do 1º envio, limite
// por dia, "pediu para parar" travando o número pra sempre, e nada de link no 1º contato.
//
// Quem quiser a frase de volta pode escrevê-la num modelo de mensagem, agora que dá.

/**
 * A primeira mensagem. Se identifica (nome, corretor de imóveis, CRECI) e diz de onde veio
 * o contato. Sem link: o link vai depois da resposta. Nunca pede documento nem dado bancário.
 */
export function mensagemPronta(o: { corretor: string; creci: string; nomeLead: string; origem: OrigemId; imovel?: string | null }): string {
  const origem = ORIGEM_POR_ID[o.origem]?.frase ?? "";
  const sobre = o.imovel?.trim() ? `, sobre o imóvel "${o.imovel.trim()}"` : "";
  return (
    `Olá, ${primeiroNome(o.nomeLead)}! Aqui é ${o.corretor.trim()}, corretor(a) de imóveis, CRECI ${o.creci.trim()}. ` +
    `Estou falando com você ${origem}${sobre}. Posso te mandar as informações?`
  );
}

/** Mensagem de acompanhamento (depois que a pessoa já respondeu): curta, e o corretor escreve o resto. */
export function mensagemDeRetorno(o: { corretor: string; nomeLead: string }): string {
  return `Olá, ${primeiroNome(o.nomeLead)}! Aqui é ${o.corretor.trim()}. `;
}

/** O link que abre a conversa com o texto pronto. É o próprio corretor que aperta enviar. */
export function linkDaMensagem(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

/**
 * O mesmo endereço, no esquema que o APLICATIVO instalado no computador atende.
 *
 * Não é automação (trava 1 continua de pé): é o mesmo clique do corretor, abrindo o app que
 * ele já tem em vez de passar pelo navegador. No computador, o wa.me cai numa página
 * intermediária e depois no WhatsApp Web, que pede pareamento por QR -- duas janelas antes
 * de escrever qualquer coisa. Este endereço pula as duas.
 *
 * Quem não tem o app instalado não vê nada acontecer, e por isso a tela sempre oferece o
 * caminho do navegador logo ao lado: adivinhar se o programa existe não é possível, avisar é.
 */
export function linkDoApp(numero: string, texto: string): string {
  return `whatsapp://send?phone=${numero.replace(/\D/g, "")}&text=${encodeURIComponent(texto)}`;
}

/** Documento, conta de banco, senha: a mensagem editada não pode pedir isso. */
export function pedeDadoSensivel(texto: string): boolean {
  return /\b(cpf|rg|identidade|cnh|documento|senha|conta banc[aá]ria|ag[eê]ncia|pix|cart[aã]o de cr[eé]dito|dados banc[aá]rios)\b/i.test(texto);
}

// ---------- mensagem preparada (IA + materiais) ----------
//
// A IA escreve; o que a regra EXIGE, o Encena escreve. No primeiro contato a abertura (nome,
// profissão, CRECI) é fixa e a IA só escreve o miolo -- assim nenhuma
// resposta criativa tira a identificação. Link a IA nunca escreve: o que ela puser some, e
// os links dos materiais entram depois, pelo código, um por linha (só fora do 1º contato).

const RE_LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** Tem endereço de internet no texto? (1º contato não pode ter: é o que marca spam.) */
export function temLink(texto: string): boolean {
  return /\bhttps?:\/\/|\bwww\./i.test(texto);
}

/** Tira os links e arruma os espaços que sobram. */
export function semLinks(texto: string): string {
  return texto
    .replace(RE_LINK, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type LinkDeMaterial = { rotulo: string; url: string };

export const TONS = [
  { id: "cordial", rotulo: "Cordial", instrucao: "tom cordial e acolhedor" },
  { id: "direto", rotulo: "Direto", instrucao: "tom direto e objetivo, frases curtas" },
  { id: "animado", rotulo: "Animado", instrucao: "tom animado e caloroso, sem exagero" },
] as const;
export type TomId = (typeof TONS)[number]["id"];
export const TOM_POR_ID = Object.fromEntries(TONS.map((t) => [t.id, t])) as Record<TomId, (typeof TONS)[number]>;

/** A mensagem final: o que a IA escreveu, com o obrigatório em volta e os links no fim. */
export function montarMensagem(o: { primeiroContato: boolean; corretor: string; creci: string; nomeLead: string; miolo: string; links: LinkDeMaterial[] }): string {
  const miolo = semLinks(o.miolo).replace(/\s*\n\s*/g, o.primeiroContato ? " " : "\n");
  if (o.primeiroContato) {
    return `Olá, ${primeiroNome(o.nomeLead)}! Aqui é ${o.corretor.trim()}, corretor(a) de imóveis, CRECI ${o.creci.trim()}. ${miolo}`
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  const links = o.links.filter((l) => /^https?:\/\//.test(l.url)).map((l) => `${l.rotulo}: ${l.url}`);
  return links.length ? `${miolo}\n\n${links.join("\n")}` : miolo;
}

/**
 * O pedido pra IA. Só vai o que a mensagem precisa: primeiro nome, a etapa e os dados do
 * imóvel. Telefone, e-mail e observações do cliente NÃO vão (a IA é um fornecedor de fora;
 * mandar só o necessário é o que a Lei de Proteção de Dados pede).
 */
export function pedidoDaMensagem(o: {
  primeiroContato: boolean;
  nomeLead: string;
  corretor: string;
  origem: OrigemId;
  etapa: EtapaId;
  tom: TomId;
  imovel: { titulo: string; endereco?: string | null; preco?: string | null; ficha: { rotulo: string; valor: string }[]; descricao?: string | null } | null;
  materiais: string[];
}): string {
  const tom = TOM_POR_ID[o.tom] ?? TONS[0];
  const im = o.imovel;
  const dados = im
    ? [
        `Imóvel: ${im.titulo}.`,
        im.endereco ? `Onde: ${im.endereco}.` : "",
        im.preco ? `Valor: ${im.preco}.` : "",
        im.ficha.length ? `Ficha: ${im.ficha.map((f) => `${f.rotulo} ${f.valor}`).join("; ")}.` : "",
        im.descricao ? `Descrição do corretor: ${im.descricao}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "Nenhum imóvel escolhido.";
  const comum = [
    "Português do Brasil, como numa conversa de celular. Sem emojis, sem hashtags, sem links, sem assinatura.",
    "Não invente nada sobre o imóvel: só use os dados abaixo. Sem promessas (nada de 'melhor da região', 'oportunidade única').",
    "Nunca peça documento, CPF, RG ou dado bancário.",
    `Use ${tom.instrucao}.`,
  ];
  if (o.primeiroContato) {
    return [
      "Você escreve UMA ou DUAS frases do meio de uma primeira mensagem de corretor de imóveis para uma pessoa que pediu informação.",
      `A abertura (saudação, nome ${o.corretor} e CRECI) e o fim (como sair da lista) já existem: NÃO cumprimente, NÃO se apresente e NÃO se despeça.`,
      `Diga de onde veio o contato (${ORIGEM_POR_ID[o.origem]?.frase ?? "pelo seu contato"}) e pergunte se pode mandar as informações do imóvel. No máximo 35 palavras.`,
      ...comum,
      dados,
      "Responda só com as frases.",
    ].join("\n");
  }
  return [
    `Você escreve uma mensagem curta de ${o.corretor}, corretor de imóveis, para ${primeiroNome(o.nomeLead)}, com quem já está conversando (etapa: ${ETAPA_POR_ID[o.etapa]?.rotulo ?? o.etapa}).`,
    "Comece com 'Olá, " + primeiroNome(o.nomeLead) + "!'. De 2 a 4 frases, no máximo 70 palavras.",
    o.materiais.length
      ? `Diga que está mandando logo abaixo: ${o.materiais.join(", ")} (os links vão depois da mensagem; não escreva endereço nenhum).`
      : "Não fale de links nem de anexos.",
    "Termine com uma pergunta simples que convide a responder (ex.: se quer marcar uma visita).",
    ...comum,
    dados,
    "Responda só com a mensagem.",
  ].join("\n");
}

// ---------- quando pode enviar ----------

export type LeadParaEnvio = {
  telefone: string;
  bloqueio: BloqueioId | null;
  declaracao_em: string | null;
  tentativas_sem_resposta: number;
  ultimo_envio_em: string | null;
  frio: boolean;
};

export type PodeEnviar =
  | { ok: true; primeiroContato: boolean; reabertura: boolean; avisos: string[] }
  | { ok: false; motivo: "bloqueado" | "sem_creci" | "declaracao" | "limite_dia" | "sem_resposta" | "telefone"; texto: string };

/** Mesmo dia no calendário de Brasília (o dia do corretor, não o do servidor). */
export function mesmoDiaEmBrasilia(a: Date, b: Date): boolean {
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return dia(a) === dia(b);
}

/**
 * REABERTURA: abrir de novo, no mesmo dia, a mensagem que já foi aberta hoje (a conversa não
 * abriu, o corretor fechou sem querer). É a MESMA tentativa: não conta de novo pro limite
 * de tentativas nem pro de primeiros contatos, e o texto continua o mesmo. Sem isso, dois
 * toques seguidos no botão levavam o cliente pra "Sem resposta" em segundos.
 * `primeiraMensagemHoje`: a última mensagem que saiu (a que está sendo reaberta) foi a
 * PRIMEIRA deste cliente.
 */
export function podeEnviar(lead: LeadParaEnvio, o: { creci: string | null; primeirosHoje: number; agora: Date; primeiraMensagemHoje?: boolean }): PodeEnviar {
  if (lead.bloqueio === "pediu_parar") return { ok: false, motivo: "bloqueado", texto: "Esta pessoa pediu para parar. O envio fica travado pra sempre." };
  if (lead.bloqueio === "numero_errado") return { ok: false, motivo: "bloqueado", texto: "Número marcado como errado. Corrija o número pra enviar." };
  const tel = normalizarTelefone(lead.telefone);
  if (!tel) return { ok: false, motivo: "telefone", texto: "O número não parece um celular do Brasil com DDD." };
  if (!o.creci?.trim()) return { ok: false, motivo: "sem_creci", texto: "Cadastre seu CRECI em Minha marca antes de enviar mensagens." };
  if (!lead.declaracao_em) return { ok: false, motivo: "declaracao", texto: "Confirme que esta pessoa te passou o contato antes da primeira mensagem." };
  // Reabrir só vale enquanto a última mensagem está SEM resposta (tentativas > 0): depois do
  // "respondeu", a próxima mensagem é outra conversa, mesmo que seja no mesmo dia.
  const reabertura = !!lead.ultimo_envio_em && lead.tentativas_sem_resposta > 0 && mesmoDiaEmBrasilia(new Date(lead.ultimo_envio_em), o.agora);
  if (lead.tentativas_sem_resposta >= LIMITES_CRM.tentativasSemResposta && !reabertura) {
    return { ok: false, motivo: "sem_resposta", texto: `${LIMITES_CRM.tentativasSemResposta} mensagens sem resposta. Espere a pessoa responder e marque "Respondeu".` };
  }
  const novo = !lead.ultimo_envio_em;
  const primeiroContato = novo || (reabertura && !!o.primeiraMensagemHoje);
  if (novo && o.primeirosHoje >= LIMITES_CRM.primeirosPorDia) {
    return { ok: false, motivo: "limite_dia", texto: `Você já fez ${LIMITES_CRM.primeirosPorDia} primeiros contatos hoje. Muita conversa nova no mesmo dia pode travar seu número. Continue amanhã.` };
  }
  return { ok: true, primeiroContato, reabertura, avisos: avisosDoEstado(tel.ddd, lead.frio, o.agora) };
}

/**
 * O que muda no lead quando o corretor abre a mensagem pra enviar. Reabertura no mesmo dia
 * não conta (ver podeEnviar). E "Sem resposta" só substitui etapa do começo (Novo, Em
 * conversa): quem está em Visita ou Proposta continua lá -- a trava de tentativas vale do
 * mesmo jeito, mas o corretor não perde em que pé a negociação estava.
 */
export function depoisDeEnviar(
  lead: { etapa: EtapaId; tentativas_sem_resposta: number; ultimo_envio_em?: string | null },
  agora: Date
): { etapa: EtapaId; tentativas_sem_resposta: number; ultimo_envio_em: string } {
  if (lead.ultimo_envio_em && lead.tentativas_sem_resposta > 0 && mesmoDiaEmBrasilia(new Date(lead.ultimo_envio_em), agora)) {
    return { etapa: lead.etapa, tentativas_sem_resposta: lead.tentativas_sem_resposta, ultimo_envio_em: agora.toISOString() };
  }
  const tentativas = lead.tentativas_sem_resposta + 1;
  const inicio = lead.etapa === "novo" || lead.etapa === "em_contato";
  const etapa: EtapaId = tentativas >= LIMITES_CRM.tentativasSemResposta && inicio ? "sem_resposta" : lead.etapa === "novo" ? "em_contato" : lead.etapa;
  return { etapa, tentativas_sem_resposta: tentativas, ultimo_envio_em: agora.toISOString() };
}

/** A pessoa respondeu: zera as tentativas e, se estava parada, volta pra conversa. */
export function depoisDeResponder(lead: { etapa: EtapaId }): { etapa: EtapaId; tentativas_sem_resposta: number } {
  return { etapa: lead.etapa === "novo" || lead.etapa === "sem_resposta" ? "em_contato" : lead.etapa, tentativas_sem_resposta: 0 };
}

// ---------- cadastro ----------

export type LeadNovo = { nome: string; telefone: string; email: string | null; origem: OrigemId; observacoes: string | null; frio: boolean; property_id: string | null };

/** Valida e limpa o que vem do navegador. Devolve o lead pronto ou o erro em português. */
export function limparLeadNovo(b: Record<string, unknown>): { lead: LeadNovo; erro: null } | { lead: null; erro: string } {
  const nome = typeof b.nome === "string" ? b.nome.trim().slice(0, LIMITES_CRM.nomeMax) : "";
  if (!nome) return { lead: null, erro: "Escreva o nome da pessoa." };
  const tel = normalizarTelefone(typeof b.telefone === "string" ? b.telefone : "");
  if (!tel) return { lead: null, erro: "O número não parece um telefone do Brasil com DDD. Ex.: (62) 99999-1234." };
  if (!ORIGENS.some((o) => o.id === b.origem)) return { lead: null, erro: "Diga de onde veio esse contato. Sem origem, não dá pra cadastrar." };
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim().slice(0, LIMITES_CRM.emailMax) : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { lead: null, erro: "O e-mail não parece certo." };
  const observacoes = typeof b.observacoes === "string" && b.observacoes.trim() ? b.observacoes.trim().slice(0, LIMITES_CRM.observacoesMax) : null;
  const property_id = typeof b.property_id === "string" && /^[0-9a-f-]{36}$/.test(b.property_id) ? b.property_id : null;
  // Cliente antigo é, por definição, contato que não procurou o corretor agora.
  const frio = b.frio === true || b.origem === "cliente_antigo";
  return { lead: { nome, telefone: tel.numero, email, origem: b.origem as OrigemId, observacoes, frio, property_id }, erro: null };
}
