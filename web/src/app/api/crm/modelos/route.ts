import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { LIMITES_MODELO, conferirModelo, type SituacaoId } from "@/lib/crm-modelos";
import { CAMPOS_DO_MODELO, dosModelosDaConta, faltaATabela, liberarVagaDoAutomatico } from "@/lib/crm-modelos-servidor";
import { contaCrm, crmLiberado } from "@/lib/crm-servidor";

// MODELOS DE MENSAGEM da conta: listar e criar.
//
// Pedido do dono (21/09/2026): guardar os textos dele (ou da imobiliária) e deixar um
// automático por situação. Regras do texto em lib/crm-modelos.ts, conferidas AQUI também --
// a tela é sugestão, a rota é a lei.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 });
  const c = await contaCrm(db, userId);

  const { data, error } = await dosModelosDaConta(db.from("modelos_mensagem").select(CAMPOS_DO_MODELO), c)
    .order("situacao", { ascending: true })
    .order("atualizado_em", { ascending: false });
  if (error) {
    if (faltaATabela(error.message)) return NextResponse.json({ modelos: [], semTabela: true });
    return NextResponse.json({ error: `Não consegui ler seus modelos agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  }
  return NextResponse.json({ modelos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 });
  const c = await contaCrm(db, userId);

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const novo = {
    situacao: String(b.situacao ?? ""),
    titulo: String(b.titulo ?? "").trim().slice(0, LIMITES_MODELO.tituloMax + 1),
    texto: String(b.texto ?? "").trim().slice(0, LIMITES_MODELO.textoMax + 1),
  };
  const problemas = conferirModelo(novo);
  if (problemas.length) return NextResponse.json({ error: problemas[0].mensagem, problemas }, { status: 400 });

  const { count } = await dosModelosDaConta(db.from("modelos_mensagem").select("id", { count: "exact", head: true }), c);
  if ((count ?? 0) >= LIMITES_MODELO.porConta) {
    return NextResponse.json({ error: `Você já tem ${LIMITES_MODELO.porConta} modelos. Apague um pra criar outro.` }, { status: 409 });
  }

  // "Qualquer momento" é escolhido na hora, nunca automático: ele não tem um momento seu.
  const automatico = b.automatico === true && novo.situacao !== "qualquer";
  if (automatico) await liberarVagaDoAutomatico(db, c, novo.situacao as SituacaoId);

  const { data, error } = await db
    .from("modelos_mensagem")
    .insert({ user_id: userId, org_id: c.orgId, situacao: novo.situacao, titulo: novo.titulo, texto: novo.texto, automatico })
    .select(CAMPOS_DO_MODELO)
    .single();
  if (error) {
    if (faltaATabela(error.message)) return NextResponse.json({ error: "Falta rodar a migração 18 (modelos de mensagem) no Supabase." }, { status: 503 });
    return NextResponse.json({ error: `Não consegui salvar agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  }
  return NextResponse.json({ modelo: data });
}
