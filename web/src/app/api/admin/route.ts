import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { saldoFal } from "@/lib/custo";
import { OFERTAS } from "@/lib/planos";

// Painel do fundador: saldo do fal, uso, receita e as contas. Só para os e-mails em
// ADMIN_EMAILS (separados por vírgula) -- sem isso, ninguém entra, nem eu.
//
// Por que existe: o custo de IA é pré-pago e invisível; sem um lugar que mostre "saldo
// dá pra X fotos" e "quanto cada geração custou de verdade", a primeira notícia de que
// o saldo acabou é um cliente vendo erro.

export const maxDuration = 60;

function ehAdmin(email: string | undefined): boolean {
  const lista = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && lista.includes(email.toLowerCase());
}

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: eu } = await db.from("users").select("email").eq("id", userId).single();
  if (!ehAdmin(eu?.email)) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const agora = new Date();
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const seteDias = new Date(agora.getTime() - 7 * 24 * 3600 * 1000);

  const [{ data: usuarios }, { data: orgs }, { data: jobs }, { data: videos }, { data: ledger }, { data: liberacoes }] = await Promise.all([
    db.from("users").select("id, email, nome, creditos_saldo, plano, assinatura_status, criado_em").order("criado_em", { ascending: false }).limit(500),
    db.from("organizations").select("id, nome, creditos_saldo, plano, assinatura_status, criado_em").order("criado_em", { ascending: false }).limit(200),
    db.from("jobs").select("id, tipo, status, custo_real, criado_em, reportado_em").gte("criado_em", seteDias.toISOString()).limit(2000),
    db.from("videos").select("id, status, custo_real, criado_em, creditos_cobrados").gte("criado_em", seteDias.toISOString()).limit(500),
    db.from("credit_ledger").select("delta, motivo, criado_em").gte("criado_em", inicioMes.toISOString()).limit(5000),
    db.from("liberacoes_creditos").select("creditos, restantes").gt("restantes", 0).limit(500),
  ]);

  const falKey = process.env.FAL_KEY;
  const saldo = falKey ? await saldoFal(falKey) : null;

  // Custo médio medido por geração concluída (jobs guardam custo_real do fal).
  const comCusto = (jobs ?? []).filter((j) => j.custo_real != null && Number(j.custo_real) > 0);
  const custoMedio = comCusto.length ? comCusto.reduce((s2, j) => s2 + Number(j.custo_real), 0) / comCusto.length : null;
  const custoSemana = comCusto.reduce((s2, j) => s2 + Number(j.custo_real), 0) + (videos ?? []).reduce((s2, v) => s2 + Number(v.custo_real ?? 0), 0);

  const porDia: Record<string, number> = {};
  for (const j of jobs ?? []) {
    const dia = j.criado_em.slice(0, 10);
    porDia[dia] = (porDia[dia] ?? 0) + 1;
  }

  // Receita do mês: o que a assinatura e os pacotes creditaram, convertido pelo preço
  // do plano. Aproximação honesta: a fonte da verdade é o painel da Stripe.
  const creditosPorReal = new Map(OFERTAS.map((o) => [o.creditos, o.preco]));
  let receitaMes = 0;
  for (const l of ledger ?? []) {
    if (l.delta <= 0) continue;
    const base = l.motivo.split(":")[0];
    if (base === "pacote" || base.startsWith("assinatura")) {
      const preco = creditosPorReal.get(l.delta);
      if (preco) receitaMes += preco / 100;
    }
  }

  const assinantes = [
    ...(usuarios ?? []).filter((u) => u.assinatura_status === "active").map((u) => ({ tipo: "pessoa" as const, nome: u.email, plano: u.plano })),
    ...(orgs ?? []).filter((o) => o.assinatura_status === "active").map((o) => ({ tipo: "imobiliaria" as const, nome: o.nome, plano: o.plano })),
  ];

  const geracoesMes = (ledger ?? []).filter((l) => l.delta < 0).reduce((s2, l) => s2 - l.delta, 0);
  const estornosMes = (ledger ?? []).filter((l) => l.motivo.startsWith("estorno")).length;

  return NextResponse.json({
    fal: {
      saldo,
      fotosRestantes: saldo != null && custoMedio ? Math.floor(saldo / custoMedio) : saldo != null ? Math.floor(saldo / 0.04) : null,
      custoMedio,
      custoSemana: Number(custoSemana.toFixed(2)),
      alerta: saldo != null && saldo < 20,
    },
    uso: {
      geracoes7d: (jobs ?? []).length,
      videos7d: (videos ?? []).length,
      falhas7d: (jobs ?? []).filter((j) => j.status === "falhou").length,
      reportes7d: (jobs ?? []).filter((j) => j.reportado_em).length,
      creditosGastosMes: geracoesMes,
      estornosMes,
      porDia: Object.entries(porDia).sort().map(([dia, n]) => ({ dia, n })),
    },
    contas: {
      pessoas: (usuarios ?? []).length,
      imobiliarias: (orgs ?? []).length,
      assinantes: assinantes.length,
      lista: assinantes,
      creditosEmCirculacao: (usuarios ?? []).reduce((s2, u) => s2 + u.creditos_saldo, 0) + (orgs ?? []).reduce((s2, o) => s2 + o.creditos_saldo, 0),
      creditosAgendados: (liberacoes ?? []).reduce((s2, l) => s2 + l.creditos * l.restantes, 0),
    },
    receita: { mes: Number(receitaMes.toFixed(2)) },
    ultimos: (usuarios ?? []).slice(0, 12).map((u) => ({ email: u.email, nome: u.nome, creditos: u.creditos_saldo, plano: u.plano, criadoEm: u.criado_em })),
  });
}
