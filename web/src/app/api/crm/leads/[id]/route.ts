import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { ETAPAS, LIMITES_CRM, normalizarTelefone, type EtapaId } from "@/lib/crm";
import { CAMPOS_DO_LEAD, bloquearNumero, contaCrm, crmLiberado, doLeadsDaConta, numeroBloqueado, registrar, situacaoDeEnvio } from "@/lib/crm-servidor";

// Um cliente: ver (com o histórico e o que dá pra fazer agora), editar, excluir de
// verdade e exportar (direitos do titular, LGPD art. 18).

async function abrir(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await usuarioDaRota(req);
  if (s.erro) return { erro: s.erro } as const;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return { erro: NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 }) } as const;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erro: NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 }) } as const;
  const c = await contaCrm(db, userId);
  const { data: lead } = await doLeadsDaConta(db.from("leads").select(CAMPOS_DO_LEAD).eq("id", id), c).maybeSingle();
  if (!lead) return { erro: NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 }) } as const;
  return { db, userId, c, lead, erro: null } as const;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, c, lead } = a;
  const { data: historico } = await db.from("leads_log").select("acao, detalhe, criado_em, user_id").eq("lead_id", lead.id).order("criado_em", { ascending: false }).limit(100);

  // Exportar: tudo que o Encena guarda deste cliente, num arquivo (direito de acesso do titular).
  if (new URL(req.url).searchParams.get("exportar") === "1") {
    await registrar(db, c, lead.id, "exportou");
    return new NextResponse(JSON.stringify({ exportado_em: new Date().toISOString(), cliente: lead, historico: historico ?? [] }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cliente-${lead.id}.json"` },
    });
  }

  const envio = await situacaoDeEnvio(db, c, lead, new Date());
  return NextResponse.json({ lead, historico: historico ?? [], envio });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, c, lead } = a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mudanca: Record<string, unknown> = {};

  if (typeof b.nome === "string") {
    const nome = b.nome.trim().slice(0, LIMITES_CRM.nomeMax);
    if (!nome) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    mudanca.nome = nome;
  }
  if (typeof b.email === "string" || b.email === null) {
    const email = typeof b.email === "string" && b.email.trim() ? b.email.trim().slice(0, LIMITES_CRM.emailMax) : null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "O e-mail não parece certo." }, { status: 400 });
    mudanca.email = email;
  }
  if (typeof b.observacoes === "string" || b.observacoes === null) {
    mudanca.observacoes = typeof b.observacoes === "string" && b.observacoes.trim() ? b.observacoes.trim().slice(0, LIMITES_CRM.observacoesMax) : null;
  }
  if (typeof b.etapa === "string") {
    if (!ETAPAS.some((e) => e.id === b.etapa)) return NextResponse.json({ error: "Etapa desconhecida." }, { status: 400 });
    mudanca.etapa = b.etapa as EtapaId;
  }
  if (typeof b.proximo_contato_em === "string" || b.proximo_contato_em === null) {
    mudanca.proximo_contato_em = typeof b.proximo_contato_em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.proximo_contato_em) ? b.proximo_contato_em : null;
  }
  if (typeof b.telefone === "string") {
    // Trocar o número de quem pediu pra parar não destrava nada: o pedido é da pessoa.
    if (lead.bloqueio === "pediu_parar") return NextResponse.json({ error: "Esta pessoa pediu para parar. O número não se troca." }, { status: 409 });
    const tel = normalizarTelefone(b.telefone);
    if (!tel) return NextResponse.json({ error: "O número não parece um telefone do Brasil com DDD." }, { status: 400 });
    if (tel.numero !== lead.telefone) {
      const bloqueado = await numeroBloqueado(db, c, tel.numero);
      if (bloqueado === "pediu_parar") return NextResponse.json({ error: "Este número pediu para parar de receber mensagens desta conta." }, { status: 409 });
      mudanca.telefone = tel.numero;
      // Número corrigido: sai o "número errado", e a declaração vale pra pessoa nova de novo.
      if (lead.bloqueio === "numero_errado") Object.assign(mudanca, { bloqueio: null, bloqueado_em: null, declaracao_em: null, declaracao_por: null, declaracao_versao: null, tentativas_sem_resposta: 0, ultimo_envio_em: null });
    }
  }
  if (!Object.keys(mudanca).length) return NextResponse.json({ lead });

  const { data, error } = await db.from("leads").update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq("id", lead.id).select(CAMPOS_DO_LEAD).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Este número já está em outro cliente." }, { status: 409 });
    return NextResponse.json({ error: `Não consegui salvar agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  }
  await registrar(db, c, lead.id, mudanca.etapa && mudanca.etapa !== lead.etapa ? "mudou_etapa" : "editou", {
    campos: Object.keys(mudanca).filter((k) => !["bloqueado_em", "declaracao_por", "declaracao_versao", "ultimo_envio_em"].includes(k)),
    ...(mudanca.etapa ? { de: lead.etapa, para: mudanca.etapa } : {}),
  });
  return NextResponse.json({ lead: data });
}

/** Exclusão DE VERDADE (direito do titular). Quem pediu pra parar continua bloqueado pelo hash. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, c, lead } = a;
  if (lead.bloqueio) await bloquearNumero(db, c, lead.telefone, lead.bloqueio);
  await registrar(db, c, lead.id, "excluiu", { etapa: lead.etapa, bloqueio: lead.bloqueio });
  const { error } = await db.from("leads").delete().eq("id", lead.id);
  if (error) return NextResponse.json({ error: `Não consegui excluir agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  return NextResponse.json({ ok: true });
}
