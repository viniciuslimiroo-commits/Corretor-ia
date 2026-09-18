import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { DECLARACAO, depoisDeEnviar, depoisDeResponder, linkDaMensagem, pedeDadoSensivel, type EtapaId } from "@/lib/crm";
import { CAMPOS_DO_LEAD, bloquearNumero, contaCrm, crmLiberado, doLeadsDaConta, registrar, situacaoDeEnvio } from "@/lib/crm-servidor";

// As AÇÕES de um cliente, cada uma com a trava dela:
//
//   declarar      "essa pessoa me passou o contato e aceitou receber" -- com data, quem e
//                 a versão do texto (a autorização que a Meta exige);
//   enviar        confere TUDO de novo no servidor (bloqueio, CRECI, declaração, limite do
//                 dia, tentativas) e só então devolve o LINK da mensagem. Não envia nada:
//                 quem aperta enviar é o corretor, no aparelho dele;
//   respondeu     a pessoa respondeu: zera as tentativas;
//   pediu_parar   trava pra sempre, e o número fica bloqueado mesmo se o cliente sair;
//   numero_errado trava até o número ser corrigido.

const ACOES = ["declarar", "enviar", "respondeu", "pediu_parar", "numero_errado"] as const;
type Acao = (typeof ACOES)[number];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const c = await contaCrm(db, userId);
  const { data: lead } = await doLeadsDaConta(db.from("leads").select(CAMPOS_DO_LEAD).eq("id", id), c).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; texto?: unknown; aceito?: unknown };
  const acao = corpo.acao as Acao;
  if (!ACOES.includes(acao)) return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  const agora = new Date();
  const salvar = async (mudanca: Record<string, unknown>) => {
    const { data, error } = await db.from("leads").update({ ...mudanca, atualizado_em: agora.toISOString() }).eq("id", lead.id).select(CAMPOS_DO_LEAD).single();
    if (error) throw new Error(error.message);
    return data;
  };

  try {
    if (acao === "declarar") {
      if (lead.bloqueio) return NextResponse.json({ error: "Este cliente está bloqueado." }, { status: 409 });
      if (corpo.aceito !== true) return NextResponse.json({ error: "Marque a declaração pra continuar." }, { status: 400 });
      const novo = await salvar({ declaracao_em: agora.toISOString(), declaracao_por: userId, declaracao_versao: DECLARACAO.versao });
      await registrar(db, c, lead.id, "declarou", { versao: DECLARACAO.versao });
      return NextResponse.json({ lead: novo, envio: await situacaoDeEnvio(db, c, novo, agora) });
    }

    if (acao === "enviar") {
      const situacao = await situacaoDeEnvio(db, c, lead, agora);
      if (!situacao.pode.ok) return NextResponse.json({ error: situacao.pode.texto, motivo: situacao.pode.motivo }, { status: 409 });
      const texto = typeof corpo.texto === "string" && corpo.texto.trim() ? corpo.texto.trim().slice(0, 1000) : situacao.texto;
      if (pedeDadoSensivel(texto)) {
        return NextResponse.json({ error: "A mensagem pede documento ou dado bancário. Isso não vai por mensagem: use um formulário seguro." }, { status: 400 });
      }
      const depois = depoisDeEnviar({ etapa: lead.etapa as EtapaId, tentativas_sem_resposta: lead.tentativas_sem_resposta, ultimo_envio_em: lead.ultimo_envio_em }, agora);
      const novo = await salvar(depois);
      // O log guarda que o LINK foi gerado; se a pessoa enviou ou não, só o aparelho dela sabe.
      // `primeiro` só na primeira de verdade: é o que o limite do dia conta (reabrir não soma).
      await registrar(db, c, lead.id, "abriu_mensagem", {
        primeiro: !lead.ultimo_envio_em,
        reaberta: situacao.pode.reabertura,
        editada: texto !== situacao.texto,
        avisos: situacao.pode.avisos.length,
      });
      return NextResponse.json({ lead: novo, link: linkDaMensagem(lead.telefone, texto), avisos: situacao.pode.avisos, reaberta: situacao.pode.reabertura });
    }

    if (acao === "respondeu") {
      if (lead.bloqueio) return NextResponse.json({ error: "Este cliente está bloqueado." }, { status: 409 });
      const novo = await salvar(depoisDeResponder({ etapa: lead.etapa as EtapaId }));
      await registrar(db, c, lead.id, "respondeu");
      return NextResponse.json({ lead: novo, envio: await situacaoDeEnvio(db, c, novo, agora) });
    }

    // pediu_parar / numero_errado
    if (lead.bloqueio === "pediu_parar") return NextResponse.json({ lead });
    const novo = await salvar({ bloqueio: acao, bloqueado_em: agora.toISOString() });
    await bloquearNumero(db, c, lead.telefone, acao);
    await registrar(db, c, lead.id, acao);
    return NextResponse.json({ lead: novo, envio: await situacaoDeEnvio(db, c, novo, agora) });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui salvar agora (${(e instanceof Error ? e.message : String(e)).slice(0, 120)}).` }, { status: 503 });
  }
}
