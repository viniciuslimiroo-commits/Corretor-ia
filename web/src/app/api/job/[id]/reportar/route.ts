import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// "Geração ruim = crédito de volta" (Sprint 3). A pessoa aperta "Reportar problema" no
// resultado e o crédito daquela geração volta na hora, sem ninguém aprovar.
//
// Dois freios, porque um botão de estorno sem freio é um botão de gerar de graça:
//   1. Um estorno por job. O UPDATE abaixo só pega a linha se `reportado_em` ainda for
//      nulo -- é um statement só, então dois cliques simultâneos não estornam duas vezes.
//   2. No máximo REPORTES_POR_DIA por usuário em 24h. Quem passa disso ainda consegue
//      reportar (o reporte fica gravado pra análise), só não recebe o crédito
//      automaticamente -- a mensagem explica e pede pra falar com o suporte.
const REPORTES_POR_DIA = 3;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const motivo = (await req.json().catch(() => ({})))?.motivo;
  const motivoLimpo = typeof motivo === "string" ? motivo.slice(0, 500) : null;

  const { data: job } = await db
    .from("jobs")
    .select("status, reportado_em")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!job) return NextResponse.json({ error: "Geração não encontrada." }, { status: 404 });
  if (job.status !== "concluido") {
    return NextResponse.json({ error: "Só dá pra reportar uma geração que terminou." }, { status: 409 });
  }
  if (job.reportado_em) {
    return NextResponse.json({ error: "Esta geração já foi reportada." }, { status: 409 });
  }

  // Freio 2: quantos reportes nas últimas 24h?
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("reportado_em", desde);
  const passouDoLimite = (count ?? 0) >= REPORTES_POR_DIA;

  // Freio 1: marca como reportado de forma atômica. Se outra requisição chegou antes,
  // `data` volta vazio e a gente não estorna de novo.
  const { data: marcado } = await db
    .from("jobs")
    .update({ reportado_em: new Date().toISOString(), motivo_reporte: motivoLimpo })
    .eq("id", id)
    .eq("user_id", userId)
    .is("reportado_em", null)
    .select("id");
  if (!marcado || marcado.length === 0) {
    return NextResponse.json({ error: "Esta geração já foi reportada." }, { status: 409 });
  }

  if (passouDoLimite) {
    return NextResponse.json({
      estornado: false,
      mensagem: `Reporte registrado. Você já recebeu ${REPORTES_POR_DIA} estornos automáticos nas últimas 24h; este vai ser analisado manualmente.`,
    });
  }

  const { data: saldo, error: erroEstorno } = await db.rpc("estornar_credito", {
    p_user_id: userId,
    p_job_id: id,
    p_motivo: "estorno_reporte",
  });
  if (erroEstorno) {
    return NextResponse.json({ error: `Erro devolvendo o crédito: ${erroEstorno.message}` }, { status: 500 });
  }

  return NextResponse.json({
    estornado: true,
    creditosRestantes: saldo,
    mensagem: "Crédito devolvido. Obrigado por avisar, isso ajuda a melhorar os modelos.",
  });
}
