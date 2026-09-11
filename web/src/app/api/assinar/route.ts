import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

// Sprint 3: começa uma assinatura. O servidor cria (ou reaproveita) o cliente na Stripe,
// abre uma sessão de Checkout e devolve a URL. O navegador só redireciona -- nenhum dado
// de cartão passa por aqui, nunca.
//
// Detalhe que importa: o `stripe_customer_id` é gravado no usuário ANTES do redirect.
// A Stripe não garante ordem de entrega dos eventos, então `invoice.paid` pode chegar
// antes de `checkout.session.completed`. Com o customer já vinculado, o webhook acha o
// usuário por ele em qualquer ordem.

// Dois jeitos de pagar, um endpoint:
//   assinatura  R$ 69/mês, 80 créditos por ciclo, cartão. Renova sozinha.
//   pacote      R$ 69 uma vez, 80 créditos, sem renovação. É AQUI que o Pix entra: a
//               Stripe só aceita Pix no Brasil pra pagamento único (Pix Automático é
//               por convite), então Pix nunca vai ser assinatura -- vai ser pacote.
//               O checkout do pacote não fixa formas de pagamento: mostra o que estiver
//               ligado no painel da Stripe. Hoje é só cartão; no dia em que o Pix for
//               ativado lá, ele aparece aqui sem mudar código.
type Modo = "assinatura" | "pacote";

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const s = stripe();
  const corpo = await req.json().catch(() => ({}));
  const modo: Modo = corpo?.modo === "pacote" ? "pacote" : "assinatura";
  const priceId = modo === "pacote" ? process.env.STRIPE_PRICE_PACOTE_ID : process.env.STRIPE_PRICE_ID;
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  if (!s) return NextResponse.json({ error: "STRIPE_SECRET_KEY não configurada." }, { status: 500 });
  if (!priceId) {
    return NextResponse.json(
      { error: `${modo === "pacote" ? "STRIPE_PRICE_PACOTE_ID" : "STRIPE_PRICE_ID"} não configurado.` },
      { status: 500 }
    );
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const { data: usuario, error: erroUsuario } = await db
    .from("users")
    .select("email, stripe_customer_id, assinatura_status")
    .eq("id", userId)
    .single();
  if (erroUsuario || !usuario) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // A origem vem do cabeçalho pra funcionar igual em localhost e em produção, sem
  // hardcode. NEXT_PUBLIC_APP_URL, se existir, ganha (útil atrás de proxy).
  const origem = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;

  try {
    let customerId = usuario.stripe_customer_id as string | null;
    if (!customerId) {
      const cliente = await s.customers.create({
        email: usuario.email,
        metadata: { userId },
      });
      customerId = cliente.id;
      await db.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    if (modo === "pacote") {
      const preco = await s.prices.retrieve(priceId);
      const creditos = preco.metadata?.creditos ?? "80";
      const sessao = await s.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origem}/?compra=ok`,
        cancel_url: `${origem}/?compra=cancelada`,
        locale: "pt-BR",
        client_reference_id: userId,
        // Os créditos vão no metadata da sessão: é o que o webhook lê pra creditar,
        // sem precisar buscar linha por linha.
        metadata: { userId, creditos, tipo: "pacote" },
        payment_intent_data: { metadata: { userId, tipo: "pacote" } },
        allow_promotion_codes: true,
      });
      if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
      return NextResponse.json({ url: sessao.url, tipo: "checkout" });
    }

    // Já assina: manda pro portal, onde ela troca cartão ou cancela. Código de Defesa
    // do Consumidor exige que cancelar seja tão fácil quanto assinar, e o portal da
    // Stripe resolve isso sem a gente construir tela nenhuma.
    if (usuario.assinatura_status === "active" || usuario.assinatura_status === "past_due") {
      const portal = await s.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origem}/`,
      });
      return NextResponse.json({ url: portal.url, tipo: "portal" });
    }

    const sessao = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origem}/?assinatura=ok`,
      cancel_url: `${origem}/?assinatura=cancelada`,
      locale: "pt-BR",
      client_reference_id: userId,
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
    });
    if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
    return NextResponse.json({ url: sessao.url, tipo: "checkout" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro falando com a Stripe." },
      { status: 502 }
    );
  }
}
