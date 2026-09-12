import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { creditar } from "@/lib/cobranca";

// Rotina diária (vercel.json: 9h UTC): libera a parcela mensal de créditos dos planos
// anuais. O webhook da Stripe credita a primeira parcela na hora do pagamento e grava
// uma linha em `liberacoes_creditos` com as 11 restantes; aqui cada dia se pergunta
// "alguma venceu?" e credita. Reembolso ou cancelamento apagam a linha (webhook).
//
// Protegida pelo CRON_SECRET: a Vercel manda `Authorization: Bearer <segredo>` nas
// chamadas agendadas; qualquer outra origem leva 401. Pode ser chamada à mão com o
// mesmo cabeçalho (é como foi testada).

export const maxDuration = 60;

function proximoMes(iso: string): string {
  const d = new Date(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const agora = new Date().toISOString();
  const { data: vencidas, error } = await db
    .from("liberacoes_creditos")
    .select("id, user_id, org_id, creditos, restantes, proxima_em, referencia")
    .gt("restantes", 0)
    .lte("proxima_em", agora)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let liberadas = 0;
  const falhas: string[] = [];
  for (const l of vencidas ?? []) {
    try {
      const conta = l.org_id ? { tipo: "org" as const, id: l.org_id } : { tipo: "user" as const, id: l.user_id as string };
      await creditar(db, conta, null, l.creditos, "assinatura_parcela", l.referencia ?? l.id);
      await db
        .from("liberacoes_creditos")
        .update({ restantes: l.restantes - 1, proxima_em: proximoMes(l.proxima_em) })
        .eq("id", l.id);
      liberadas++;
    } catch (e) {
      falhas.push(`${l.id}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return NextResponse.json({ agora, vencidas: vencidas?.length ?? 0, liberadas, falhas });
}
