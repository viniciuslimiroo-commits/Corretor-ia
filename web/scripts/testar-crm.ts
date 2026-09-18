// AS REGRAS DO CRM (lib/crm.ts): as travas do estudo jurídico (docs/planos/crm-whatsapp-regras.md,
// seção 5) conferidas uma a uma, sem banco e sem rede.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-crm.ts

import {
  DECLARACAO,
  LIMITES_CRM,
  ORIGENS,
  avisosDoEstado,
  depoisDeEnviar,
  depoisDeResponder,
  limparLeadNovo,
  linkDaMensagem,
  mensagemPronta,
  normalizarTelefone,
  pedeDadoSensivel,
  podeEnviar,
  telefoneLegivel,
  type LeadParaEnvio,
} from "../src/lib/crm.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- telefone ----------
{
  const casos: [string, string | null][] = [
    ["(62) 99999-1234", "5562999991234"],
    ["+55 62 9 9999 1234", "5562999991234"],
    ["62999991234", "5562999991234"],
    ["5562999991234", "5562999991234"],
    ["062 99999-1234", "5562999991234"],
    ["(11) 3333-4444", "551133334444"],
    ["(62) 89999-1234", null], // celular tem que começar com 9
    ["(20) 99999-1234", null], // DDD 20 não existe
    ["99999-1234", null], // sem DDD
    ["+1 415 555 1234", null], // fora do Brasil
    ["", null],
  ];
  const erradas = casos.filter(([e, s]) => (normalizarTelefone(e)?.numero ?? null) !== s);
  conferir(erradas.length === 0, "telefone: aceita o que a pessoa digita, recusa o que não é celular/fixo do Brasil com DDD", erradas.map((c) => c[0]).join(" | "));
  conferir(telefoneLegivel("5562999991234") === "(62) 99999-1234" && telefoneLegivel("551133334444") === "(11) 3333-4444", "telefone: formato pra mostrar");
}

// ---------- cadastro (trava 2: origem obrigatória, lista fechada) ----------
{
  const ok = limparLeadNovo({ nome: " Maria da Silva ", telefone: "(62) 99999-1234", origem: "portal", email: "maria@exemplo.com" });
  conferir(ok.erro === null && ok.lead?.nome === "Maria da Silva" && ok.lead.telefone === "5562999991234" && ok.lead.frio === false, "cadastro: nome, telefone e origem limpos");
  conferir(limparLeadNovo({ nome: "Maria", telefone: "(62) 99999-1234" }).erro?.includes("origem") === true, "cadastro: sem origem, não cadastra");
  conferir(limparLeadNovo({ nome: "Maria", telefone: "(62) 99999-1234", origem: "lista_comprada" }).erro?.includes("origem") === true, "cadastro: origem fora da lista (\"lista comprada\") não entra");
  conferir(!ORIGENS.some((o) => /lista|comprad/i.test(o.id + o.rotulo)), "cadastro: a lista de origens não tem \"lista comprada\"");
  conferir(limparLeadNovo({ nome: "", telefone: "(62) 99999-1234", origem: "site" }).erro !== null, "cadastro: sem nome, não cadastra");
  conferir(limparLeadNovo({ nome: "Maria", telefone: "1234", origem: "site" }).erro?.includes("telefone") === true, "cadastro: telefone inválido explica o formato");
  conferir(limparLeadNovo({ nome: "Maria", telefone: "(62) 99999-1234", origem: "cliente_antigo" }).lead?.frio === true, "cadastro: cliente antigo entra como contato frio");
  conferir(!ORIGENS.some((o) => /whatsapp/i.test(o.rotulo)), "marca da Meta: nenhuma origem usa o nome WhatsApp");
}

// ---------- mensagem pronta (travas 7 e 16) ----------
{
  const m = mensagemPronta({ corretor: "João Lima", creci: "12345-F", nomeLead: "Maria da Silva", origem: "portal", imovel: "Apto 302 Setor Bueno" });
  conferir(m.startsWith("Olá, Maria!") && m.includes("João Lima") && m.includes("corretor(a) de imóveis") && m.includes("CRECI 12345-F"), "mensagem: se identifica com nome, profissão e CRECI", m);
  conferir(m.includes("pelo anúncio no portal") && m.includes("Apto 302"), "mensagem: diz de onde veio o contato e o imóvel");
  conferir(m.includes("responder SAIR"), "mensagem: dá a saída (responda SAIR)");
  conferir(!/https?:\/\//.test(m), "mensagem: sem link no primeiro contato");
  conferir(!pedeDadoSensivel(m), "mensagem: a pronta nunca pede documento nem dado bancário");
  conferir(pedeDadoSensivel("me manda seu CPF") && pedeDadoSensivel("preciso dos dados bancários") && !pedeDadoSensivel("Posso te mandar as fotos?"), "mensagem editada: pedido de documento é detectado");
  const l = linkDaMensagem("5562999991234", "Olá, Maria! Tudo bem?");
  conferir(l === "https://wa.me/5562999991234?text=Ol%C3%A1%2C%20Maria!%20Tudo%20bem%3F", "link: wa.me com o texto codificado (o corretor aperta enviar)", l);
}

// ---------- quando pode enviar (travas 3, 4, 8, 9) ----------
{
  const base: LeadParaEnvio = { telefone: "5562999991234", bloqueio: null, declaracao_em: "2026-09-18T12:00:00Z", tentativas_sem_resposta: 0, ultimo_envio_em: null, frio: false };
  const ctx: { creci: string | null; primeirosHoje: number; agora: Date } = { creci: "12345-F", primeirosHoje: 0, agora: new Date("2026-09-18T15:00:00Z") };
  const ok = podeEnviar(base, ctx);
  conferir(ok.ok && ok.primeiroContato && ok.avisos.length === 0, "envio: com declaração, CRECI e limite livre, pode");
  const r = (l: Partial<LeadParaEnvio>, c: Partial<typeof ctx> = {}) => podeEnviar({ ...base, ...l }, { ...ctx, ...c });
  const motivo = (x: ReturnType<typeof podeEnviar>) => (x.ok ? "ok" : x.motivo);
  conferir(motivo(r({ declaracao_em: null })) === "declaracao", "envio: sem declaração, não envia (trava 3)");
  conferir(motivo(r({ bloqueio: "pediu_parar" })) === "bloqueado", "envio: pediu para parar trava (trava 4)");
  conferir(motivo(r({ bloqueio: "numero_errado" })) === "bloqueado", "envio: número errado trava (trava 4)");
  conferir(motivo(r({ bloqueio: "pediu_parar", declaracao_em: null })) === "bloqueado", "envio: o bloqueio vence a falta de declaração (não pede declaração de quem pediu pra parar)");
  conferir(motivo(r({}, { creci: null })) === "sem_creci" && motivo(r({}, { creci: "  " })) === "sem_creci", "envio: sem CRECI no perfil, não envia (trava 8)");
  conferir(motivo(r({}, { primeirosHoje: LIMITES_CRM.primeirosPorDia })) === "limite_dia", `envio: ${LIMITES_CRM.primeirosPorDia} primeiros contatos no dia, o próximo espera amanhã (trava 9)`);
  conferir(motivo(r({ ultimo_envio_em: "2026-09-17T12:00:00Z", tentativas_sem_resposta: 1 }, { primeirosHoje: 99 })) === "ok", "envio: o limite do dia vale só pra PRIMEIRO contato");
  conferir(motivo(r({ ultimo_envio_em: "2026-09-17T12:00:00Z", tentativas_sem_resposta: 2 })) === "sem_resposta", "envio: 2 mensagens sem resposta, trava até a pessoa responder (trava 9)");
  conferir(motivo(r({ telefone: "123" })) === "telefone", "envio: telefone que não fecha, não envia");
}

// ---------- tentativas e etapas ----------
{
  const t0 = new Date("2026-09-18T15:00:00Z");
  const e1 = depoisDeEnviar({ etapa: "novo", tentativas_sem_resposta: 0 }, t0);
  conferir(e1.etapa === "em_contato" && e1.tentativas_sem_resposta === 1 && e1.ultimo_envio_em === t0.toISOString(), "etapas: 1ª mensagem leva de Novo pra Em conversa");
  const e2 = depoisDeEnviar({ etapa: "em_contato", tentativas_sem_resposta: 1 }, t0);
  conferir(e2.etapa === "sem_resposta" && e2.tentativas_sem_resposta === 2, "etapas: 2ª sem resposta leva pra Sem resposta");
  const e3 = depoisDeEnviar({ etapa: "visita", tentativas_sem_resposta: 0 }, t0);
  conferir(e3.etapa === "visita", "etapas: mensagem pra quem já está em Visita não rebaixa a etapa");
  const e4 = depoisDeEnviar({ etapa: "proposta", tentativas_sem_resposta: 1, ultimo_envio_em: "2026-09-16T15:00:00Z" }, t0);
  conferir(e4.etapa === "proposta" && e4.tentativas_sem_resposta === 2, "etapas: 2ª sem resposta de quem está em Proposta trava, mas não apaga a etapa");

  // Reabrir no mesmo dia (a conversa não abriu, fechou sem querer) é a MESMA tentativa.
  const hojeCedo = "2026-09-18T12:00:00Z"; // 9h em Brasília; t0 = 12h
  const re = depoisDeEnviar({ etapa: "em_contato", tentativas_sem_resposta: 1, ultimo_envio_em: hojeCedo }, t0);
  conferir(re.etapa === "em_contato" && re.tentativas_sem_resposta === 1, "reabertura: abrir 2x no mesmo dia não vira 2 tentativas (antes ia pra Sem resposta em segundos)");
  const ontem = depoisDeEnviar({ etapa: "em_contato", tentativas_sem_resposta: 1, ultimo_envio_em: "2026-09-17T12:00:00Z" }, t0);
  conferir(ontem.tentativas_sem_resposta === 2 && ontem.etapa === "sem_resposta", "reabertura: mensagem de ontem + nova hoje conta como 2ª tentativa");
  const meiaNoite = depoisDeEnviar({ etapa: "em_contato", tentativas_sem_resposta: 1, ultimo_envio_em: "2026-09-18T02:30:00Z" }, t0);
  conferir(meiaNoite.tentativas_sem_resposta === 2, "reabertura: o dia é o de Brasília (23h30 de ontem lá não é hoje)");
  const base: LeadParaEnvio = { telefone: "5562999991234", bloqueio: null, declaracao_em: "x", tentativas_sem_resposta: 2, ultimo_envio_em: hojeCedo, frio: false };
  const p1 = podeEnviar(base, { creci: "1", primeirosHoje: 0, agora: t0 });
  conferir(p1.ok && p1.reabertura, "reabertura: com 2 tentativas, a de HOJE ainda pode ser reaberta");
  const trava = podeEnviar({ ...base, ultimo_envio_em: "2026-09-17T12:00:00Z" }, { creci: "1", primeirosHoje: 0, agora: t0 });
  conferir(!trava.ok && trava.motivo === "sem_resposta", "reabertura: com 2 tentativas e a última ontem, trava");
  const p2 = podeEnviar({ ...base, tentativas_sem_resposta: 1 }, { creci: "1", primeirosHoje: 99, agora: t0, primeiraMensagemHoje: true });
  conferir(p2.ok && p2.primeiroContato, "reabertura da 1ª mensagem: continua sendo apresentação e não esbarra no limite do dia");

  const r1 = depoisDeResponder({ etapa: "sem_resposta" });
  conferir(r1.etapa === "em_contato" && r1.tentativas_sem_resposta === 0, "etapas: respondeu zera as tentativas e volta pra conversa");
  conferir(depoisDeResponder({ etapa: "proposta" }).etapa === "proposta", "etapas: resposta de quem está em Proposta não muda a etapa");
}

// ---------- avisos de SP e PR (trava 11) ----------
{
  // 18/09/2026 é sexta. 15:00 UTC = 12:00 em Brasília; 23:00 UTC = 20:00.
  const meioDia = new Date("2026-09-18T15:00:00Z");
  const noite = new Date("2026-09-18T23:00:00Z");
  const domingo = new Date("2026-09-20T15:00:00Z");
  const sabado11 = new Date("2026-09-19T14:00:00Z");
  const sabado17 = new Date("2026-09-19T20:00:00Z");
  conferir(avisosDoEstado(11, false, meioDia).length === 0, "estado: contato que procurou o corretor (não frio) não recebe aviso");
  conferir(avisosDoEstado(11, true, meioDia).length === 1 && avisosDoEstado(19, true, meioDia).length === 1, "estado: frio com DDD de SP (11 a 19) avisa");
  conferir(avisosDoEstado(41, true, meioDia).length === 1, "estado: frio com DDD do PR em horário permitido: só o aviso do cadastro");
  conferir(avisosDoEstado(43, true, noite).length === 2 && avisosDoEstado(46, true, domingo).length === 2, "estado: PR fora do horário (20h, domingo) avisa também o horário");
  conferir(avisosDoEstado(44, true, sabado11).length === 1 && avisosDoEstado(44, true, sabado17).length === 2, "estado: PR no sábado, 10h às 16h pode; 17h avisa");
  conferir(avisosDoEstado(62, true, noite).length === 0, "estado: outros DDDs, sem aviso");
  const lead: LeadParaEnvio = { telefone: "5541999991234", bloqueio: null, declaracao_em: "x", tentativas_sem_resposta: 0, ultimo_envio_em: null, frio: true };
  const p = podeEnviar(lead, { creci: "1", primeirosHoje: 0, agora: noite });
  conferir(p.ok && p.avisos.length === 2, "estado: o aviso não trava o envio, só informa (a decisão é do corretor)");
}

conferir(DECLARACAO.texto.includes("passou o contato") && /^\d{4}-\d{2}-\d{2}$/.test(DECLARACAO.versao), "declaração: texto e versão datada (vão pro banco com cada assinatura)");

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
