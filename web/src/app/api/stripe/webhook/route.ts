import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { CREDITOS_POR_CICLO_PADRAO, idDe, stripe } from "@/lib/stripe";
import { contaPorStripeCustomer, creditar, type ContaCobranca } from "@/lib/cobranca";

// Webhook da Stripe: é AQUI que crédito entra numa conta. Três defesas, nesta ordem:
//
// 1. Assinatura. `constructEvent` verifica o cabeçalho `Stripe-Signature` contra o
//    corpo CRU (por isso `req.text()`, nunca `req.json()`).
// 2. Idempotência. INSERT em `stripe_eventos` com chave no id do evento; duplicata = 200
//    sem efeito.
// 3. Ordem. Nada assume ordem: a conta é achada pelo `stripe_customer_id`, gravado por
//    /api/assinar ANTES do redirect -- na pessoa ou na imobiliária (12/09/2026).
//
// Créditos, pelo metadata do preço:
//   creditos_por_ciclo          mensal: entra tudo a cada fatura paga
//   creditos_por_mes + meses    anual: entra a 1ª parcela agora e as outras ficam
//                               agendadas em liberacoes_creditos (cron diário)
//   creditos                    pacote: entra no checkout pago
//
// Reembolso (charge.refunded) apaga as parcelas agendadas daquele customer: quem
// devolveu o dinheiro não recebe os meses que faltavam.
export const runtime = "nodejs";

type LinhaFatura = {
  price?: { id?: string; metadata?: Record<string, string> } | null;
  pricing?: { price_details?: { price?: string } | null } | null;
  period?: { end?: number } | null;
};

type Regra = { modo: "ciclo"; creditos: number; plano: string | null } | { modo: "mensal"; creditosPorMes: number; meses: number; plano: string | null } | { modo: "padrao"; creditos: number; plano: null };

async function regraDaFatura(s: Stripe, fatura: Stripe.Invoice): Promise<Regra> {
  const linhas = (fatura.lines?.data ?? []) as unknown as LinhaFatura[];
  for (const linha of linhas) {
    let meta = linha.price?.metadata;
    if (!meta) {
      const priceId = linha.pricing?.price_details?.price ?? linha.price?.id;
      if (priceId) meta = (await s.prices.retrieve(priceId)).metadata;
    }
    if (!meta) continue;
    const plano = meta.plano ?? (meta.segmento === "corretor" ? "pro" : null);
    if (meta.creditos_por_mes) return { modo: "mensal", creditosPorMes: Number(meta.creditos_por_mes), meses: Number(meta.meses ?? 12), plano };
    if (meta.creditos_por_ciclo) return { modo: "ciclo", creditos: Number(meta.creditos_por_ciclo), plano };
  }
  return { modo: "padrao", creditos: CREDITOS_POR_CICLO_PADRAO, plano: null };
}

function proximoMes(d: Date): Date {
  const n = new Date(d);
  const dia = n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
  n.setUTCDate(Math.min(dia, ultimo));
  return n;
}

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const s = stripe();
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!db || !s || !segredo) {
    return NextResponse.json({ error: "Servidor sem Supabase, Stripe ou STRIPE_WEBHOOK_SECRET." }, { status: 500 });
  }

  // ---- 1. assinatura ----
  const corpoCru = await req.text();
  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) return NextResponse.json({ error: "Sem cabeçalho Stripe-Signature." }, { status: 400 });
  let evento: Stripe.Event;
  try {
    evento = s.webhooks.constructEvent(corpoCru, assinatura, segredo);
  } catch (e) {
    return NextResponse.json({ error: `Assinatura inválida: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  // ---- 2. idempotência ----
  const { error: erroRegistro } = await db.from("stripe_eventos").insert({ id: evento.id, tipo: evento.type });
  if (erroRegistro) {
    if (erroRegistro.code === "23505") return NextResponse.json({ recebido: true, duplicado: true });
    return NextResponse.json({ error: `Erro registrando evento: ${erroRegistro.message}` }, { status: 500 });
  }

  // ---- 3. de quem é ----
  const objeto = evento.data.object as { customer?: unknown; metadata?: Record<string, string> };
  const customerId = idDe(objeto.customer);

  async function contaDoEvento(): Promise<ContaCobranca | null> {
    const meta = objeto.metadata ?? {};
    if (meta.orgId) return { tipo: "org", id: meta.orgId };
    if (customerId) {
      const c = await contaPorStripeCustomer(db!, customerId);
      if (c) return c;
    }
    if (meta.userId) return { tipo: "user", id: meta.userId };
    return null;
  }

  const tabela = (c: ContaCobranca) => (c.tipo === "org" ? "organizations" : "users");

  try {
    switch (evento.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const sessao = evento.data.object as Stripe.Checkout.Session;
        const conta = (await contaDoEvento()) ?? (sessao.client_reference_id ? { tipo: "user" as const, id: sessao.client_reference_id } : null);
        const subscriptionId = idDe(sessao.subscription);
        if (conta) {
          await db
            .from(tabela(conta))
            .update({ stripe_customer_id: customerId, ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}) })
            .eq("id", conta.id);
        }
        // Pacote pago credita aqui; assinatura credita no invoice.paid (senão dobra).
        if (sessao.mode === "payment" && sessao.payment_status === "paid" && conta) {
          const referencia = `pacote:${sessao.id}`;
          const { data: jaCreditado } = await db.from("credit_ledger").select("id").eq("motivo", referencia).limit(1);
          if (!jaCreditado || jaCreditado.length === 0) {
            const creditos = Number(sessao.metadata?.creditos ?? CREDITOS_POR_CICLO_PADRAO);
            await creditar(db, conta, sessao.metadata?.userId ?? null, creditos, "pacote", sessao.id);
          }
        }
        break;
      }

      case "invoice.paid": {
        const fatura = evento.data.object as Stripe.Invoice;
        if ((fatura.amount_paid ?? 0) <= 0) break;
        const parent = (fatura as unknown as { parent?: { subscription_details?: { subscription?: unknown; metadata?: Record<string, string> } } }).parent;
        const metaSub = parent?.subscription_details?.metadata ?? {};
        const conta: ContaCobranca | null = metaSub.orgId ? { tipo: "org", id: metaSub.orgId } : customerId ? await contaPorStripeCustomer(db, customerId) : null;
        if (!conta) {
          // Pago mas sem dono conhecido: 500 pra Stripe tentar de novo mais tarde -- e o
          // registro de idempotência sai junto, senão a retentativa seria tratada como
          // duplicata e o crédito nunca entraria (bug herdado da versão anterior).
          await db.from("stripe_eventos").delete().eq("id", evento.id);
          return NextResponse.json({ error: `invoice.paid sem conta pro customer ${customerId}` }, { status: 500 });
        }
        const regra = await regraDaFatura(s, fatura);
        const subscriptionId = idDe(parent?.subscription_details?.subscription) ?? idDe((fatura as unknown as { subscription?: unknown }).subscription);
        const linhas = (fatura.lines?.data ?? []) as unknown as LinhaFatura[];
        const fimDoPeriodo = linhas[0]?.period?.end;

        if (regra.modo === "mensal") {
          await creditar(db, conta, metaSub.userId ?? null, regra.creditosPorMes, "assinatura_parcela", fatura.id);
          if (regra.meses > 1) {
            await db.from("liberacoes_creditos").insert({
              user_id: conta.tipo === "user" ? conta.id : null,
              org_id: conta.tipo === "org" ? conta.id : null,
              creditos: regra.creditosPorMes,
              restantes: regra.meses - 1,
              proxima_em: proximoMes(new Date()).toISOString(),
              referencia: fatura.id,
              stripe_customer_id: customerId,
            });
          }
        } else {
          await creditar(db, conta, metaSub.userId ?? null, regra.creditos, regra.modo === "ciclo" ? "assinatura" : "assinatura_padrao_sem_metadata", fatura.id);
        }

        await db
          .from(tabela(conta))
          .update({
            plano: regra.plano ?? (conta.tipo === "org" ? "equipe" : "pro"),
            assinatura_status: "active",
            ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
            ...(fimDoPeriodo ? { assinatura_renova_em: new Date(fimDoPeriodo * 1000).toISOString() } : {}),
          })
          .eq("id", conta.id);
        break;
      }

      case "invoice.payment_failed": {
        const conta = customerId ? await contaPorStripeCustomer(db, customerId) : null;
        if (conta) await db.from(tabela(conta)).update({ assinatura_status: "past_due" }).eq("id", conta.id);
        break;
      }

      case "customer.subscription.updated": {
        const sub = evento.data.object as Stripe.Subscription;
        const conta = (await contaDoEvento()) ?? null;
        if (conta) await db.from(tabela(conta)).update({ assinatura_status: sub.status, stripe_subscription_id: sub.id }).eq("id", conta.id);
        break;
      }

      case "customer.subscription.deleted": {
        // Cancelou. Créditos que já tem continuam valendo; parcelas futuras somem.
        const conta = (await contaDoEvento()) ?? null;
        if (conta) {
          await db.from(tabela(conta)).update({ plano: "gratis", assinatura_status: "canceled" }).eq("id", conta.id);
          if (customerId) await db.from("liberacoes_creditos").delete().eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "charge.refunded": {
        // Devolveu o dinheiro: as parcelas que ainda iam entrar não entram mais.
        if (customerId) await db.from("liberacoes_creditos").delete().eq("stripe_customer_id", customerId);
        break;
      }

      default:
        break;
    }
  } catch (e) {
    await db.from("stripe_eventos").delete().eq("id", evento.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro processando evento." }, { status: 500 });
  }

  return NextResponse.json({ recebido: true });
}
