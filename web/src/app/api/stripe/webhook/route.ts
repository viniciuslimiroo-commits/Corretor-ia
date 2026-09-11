import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { CREDITOS_POR_CICLO_PADRAO, idDe, stripe } from "@/lib/stripe";

// Webhook da Stripe: é AQUI que crédito entra na conta de alguém. Por isso três defesas,
// nesta ordem, antes de tocar no banco:
//
// 1. Assinatura. `constructEvent` verifica o cabeçalho `Stripe-Signature` contra o
//    corpo CRU da requisição (por isso `req.text()`, nunca `req.json()` -- qualquer
//    reserialização quebra a verificação). Sem isso, qualquer um que soubesse a URL
//    mandaria um JSON "invoice.paid" e ganharia créditos de graça.
//
// 2. Idempotência. A Stripe entrega o mesmo evento mais de uma vez de propósito
//    (retentativas, reenvio manual). O INSERT em `stripe_eventos` tem chave primária no
//    id do evento; se falhar por duplicidade, a resposta é 200 e nada acontece. Sem
//    isso, cada retentativa daria +80 créditos.
//
// 3. Ordem. A Stripe não garante ordem. Nada aqui assume que `checkout.session.completed`
//    chegou antes de `invoice.paid`: o usuário é achado pelo `stripe_customer_id`, que o
//    /api/assinar gravou ANTES de redirecionar.
//
// Nó em vez de edge, porque a verificação de assinatura usa crypto do Node.
export const runtime = "nodejs";

type LinhaFatura = {
  price?: { id?: string; metadata?: Record<string, string> } | null;
  pricing?: { price_details?: { price?: string } | null } | null;
  period?: { end?: number } | null;
};

/**
 * Quantos créditos esta fatura compra. Lê `metadata.creditos_por_ciclo` do preço --
 * a fonte da verdade fica na Stripe, pra mudar o plano sem deploy.
 *
 * Duas formas de linha porque a Stripe mudou o formato do objeto de fatura entre
 * versões da API: antes `line.price` vinha expandido, agora vem só o id em
 * `line.pricing.price_details.price`. Lida com as duas e, se nenhuma resolver, cai no
 * padrão e deixa isso registrado no motivo do ledger.
 */
async function creditosDaFatura(s: Stripe, fatura: Stripe.Invoice): Promise<{ creditos: number; origem: string }> {
  let total = 0;
  const linhas = (fatura.lines?.data ?? []) as unknown as LinhaFatura[];
  for (const linha of linhas) {
    const doObjeto = linha.price?.metadata?.creditos_por_ciclo;
    if (doObjeto) {
      total += Number(doObjeto);
      continue;
    }
    const priceId = linha.pricing?.price_details?.price ?? linha.price?.id;
    if (priceId) {
      const preco = await s.prices.retrieve(priceId);
      const doPreco = preco.metadata?.creditos_por_ciclo;
      if (doPreco) total += Number(doPreco);
    }
  }
  if (total > 0) return { creditos: total, origem: "metadata_do_preco" };
  return { creditos: CREDITOS_POR_CICLO_PADRAO, origem: "padrao_sem_metadata" };
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
    return NextResponse.json(
      { error: `Assinatura inválida: ${e instanceof Error ? e.message : e}` },
      { status: 400 }
    );
  }

  // ---- 2. idempotência ----
  const { error: erroRegistro } = await db
    .from("stripe_eventos")
    .insert({ id: evento.id, tipo: evento.type });
  if (erroRegistro) {
    if (erroRegistro.code === "23505") {
      return NextResponse.json({ recebido: true, duplicado: true });
    }
    // Se não consegui registrar, não processo: melhor a Stripe tentar de novo do que
    // eu creditar sem conseguir marcar que creditei.
    return NextResponse.json({ error: `Erro registrando evento: ${erroRegistro.message}` }, { status: 500 });
  }

  // ---- 3. quem é o usuário ----
  const objeto = evento.data.object as { customer?: unknown };
  const customerId = idDe(objeto.customer);

  async function usuarioDoCustomer(): Promise<string | null> {
    if (!customerId) return null;
    const { data } = await db!.from("users").select("id").eq("stripe_customer_id", customerId).single();
    return data?.id ?? null;
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        // Dois eventos, por causa das formas de pagamento assíncronas (boleto hoje;
        // Pix se a Stripe um dia liberar pra esta conta): a sessão "completa" quando a
        // pessoa fecha o checkout, mas o dinheiro só chega depois -- e aí vem o
        // `async_payment_succeeded`. Cartão já vem pago no `completed`. O critério que
        // vale é um só: `payment_status === "paid"`.
        const sessao = evento.data.object as Stripe.Checkout.Session;
        const userId = sessao.client_reference_id ?? (await usuarioDoCustomer());
        const subscriptionId = idDe(sessao.subscription);
        if (userId) {
          await db
            .from("users")
            .update({
              stripe_customer_id: customerId,
              ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
            })
            .eq("id", userId);
        }

        // Pacote avulso pago: credita. Assinatura NÃO credita aqui -- quem credita
        // assinatura é o invoice.paid, senão a primeira cobrança creditaria duas vezes.
        if (sessao.mode === "payment" && sessao.payment_status === "paid" && userId) {
          const referencia = `pacote:${sessao.id}`;
          // Guarda extra além do id de evento: se por qualquer motivo os dois eventos
          // chegarem pagos pra mesma sessão, o ledger já tem a referência e não credita
          // de novo.
          const { data: jaCreditado } = await db
            .from("credit_ledger")
            .select("id")
            .eq("user_id", userId)
            .eq("motivo", referencia)
            .limit(1);
          if (!jaCreditado || jaCreditado.length === 0) {
            const creditos = Number(sessao.metadata?.creditos ?? CREDITOS_POR_CICLO_PADRAO);
            const { error: erroCredito } = await db.rpc("adicionar_creditos", {
              p_user_id: userId,
              p_quantidade: creditos,
              p_motivo: "pacote",
              p_referencia: sessao.id,
            });
            if (erroCredito) throw new Error(`adicionar_creditos (pacote): ${erroCredito.message}`);
          }
        }
        break;
      }

      case "invoice.paid": {
        // O ÚNICO lugar que credita. Dispara na primeira cobrança e em toda renovação.
        const fatura = evento.data.object as Stripe.Invoice;
        if ((fatura.amount_paid ?? 0) <= 0) break; // fatura de R$ 0 (ajuste, teste) não compra crédito

        const userId = await usuarioDoCustomer();
        if (!userId) {
          // Pago mas sem dono conhecido: devolve 500 pra Stripe tentar de novo mais
          // tarde (o checkout.session.completed pode ainda estar a caminho), e deixa
          // o evento registrado pra investigação.
          return NextResponse.json({ error: `invoice.paid sem usuário pro customer ${customerId}` }, { status: 500 });
        }

        const { creditos, origem } = await creditosDaFatura(s, fatura);
        const { error: erroCredito } = await db.rpc("adicionar_creditos", {
          p_user_id: userId,
          p_quantidade: creditos,
          p_motivo: `assinatura_${origem}`,
          p_referencia: fatura.id,
        });
        if (erroCredito) throw new Error(`adicionar_creditos: ${erroCredito.message}`);

        const linhas = (fatura.lines?.data ?? []) as unknown as LinhaFatura[];
        const fimDoPeriodo = linhas[0]?.period?.end;
        const parent = (fatura as unknown as { parent?: { subscription_details?: { subscription?: unknown } } }).parent;
        const subscriptionId =
          idDe(parent?.subscription_details?.subscription) ??
          idDe((fatura as unknown as { subscription?: unknown }).subscription);

        await db
          .from("users")
          .update({
            plano: "pro",
            assinatura_status: "active",
            ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
            ...(fimDoPeriodo ? { assinatura_renova_em: new Date(fimDoPeriodo * 1000).toISOString() } : {}),
          })
          .eq("id", userId);
        break;
      }

      case "invoice.payment_failed": {
        const userId = await usuarioDoCustomer();
        if (userId) await db.from("users").update({ assinatura_status: "past_due" }).eq("id", userId);
        break;
      }

      case "customer.subscription.updated": {
        const sub = evento.data.object as Stripe.Subscription;
        const userId = await usuarioDoCustomer();
        if (userId) {
          await db
            .from("users")
            .update({ assinatura_status: sub.status, stripe_subscription_id: sub.id })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Cancelou. Os créditos que já tem continuam valendo até acabar -- foram pagos.
        // Só não entra mais nenhum.
        const userId = await usuarioDoCustomer();
        if (userId) {
          await db
            .from("users")
            .update({ plano: "gratis", assinatura_status: "canceled" })
            .eq("id", userId);
        }
        break;
      }

      default:
        // Evento que não nos interessa: 200 mesmo assim, senão a Stripe fica tentando.
        break;
    }
  } catch (e) {
    // Falhou depois de registrar o id: apaga o registro pra Stripe poder reentregar e
    // o processamento acontecer da próxima vez.
    await db.from("stripe_eventos").delete().eq("id", evento.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro processando evento." }, { status: 500 });
  }

  return NextResponse.json({ recebido: true });
}
