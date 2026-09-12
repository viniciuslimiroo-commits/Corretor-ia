import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";
import { OFERTAS_POR_ID, ehOfertaId, type OfertaId } from "@/lib/planos";

// Abre o pagamento de uma oferta (ver lib/planos.ts). O servidor cria (ou reaproveita)
// o cliente na Stripe, abre uma sessão de Checkout e devolve a URL. O navegador só
// redireciona -- nenhum dado de cartão passa por aqui, nunca.
//
// Detalhe que importa: o `stripe_customer_id` é gravado no usuário ANTES do redirect.
// A Stripe não garante ordem de entrega dos eventos, então `invoice.paid` pode chegar
// antes de `checkout.session.completed`. Com o customer já vinculado, o webhook acha o
// usuário por ele em qualquer ordem.
//
// Fase B: o preço é achado pela `lookup_key` (encena_pro_mensal, encena_pro_anual,
// encena_pacote_20/80/200), não por id em env. Em modo live basta criar os preços com as
// mesmas chaves. Os créditos vêm do metadata do preço (creditos_por_ciclo na assinatura,
// creditos no pacote), lidos pelo webhook.
//
// Formas de pagamento: o checkout mostra o que estiver ligado no painel da Stripe. Hoje
// é cartão. Pix NÃO está disponível: conferido no painel em 11/09/2026, a Stripe libera
// Pix pra conta brasileira só por convite.

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const s = stripe();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  if (!s) return NextResponse.json({ error: "STRIPE_SECRET_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  // `modo` é o contrato antigo (assinatura | pacote); `oferta` é o novo.
  const ofertaId: OfertaId = ehOfertaId(corpo?.oferta) ? corpo.oferta : corpo?.modo === "pacote" ? "pacote_80" : "pro_mensal";
  const oferta = OFERTAS_POR_ID[ofertaId];

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
      const cliente = await s.customers.create({ email: usuario.email, metadata: { userId } });
      customerId = cliente.id;
      await db.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    // Já assina: manda pro portal, onde ela troca de plano, troca cartão ou cancela.
    // Código de Defesa do Consumidor exige que cancelar seja tão fácil quanto assinar, e
    // o portal da Stripe resolve isso sem a gente construir tela nenhuma.
    if (oferta.tipo === "assinatura" && (usuario.assinatura_status === "active" || usuario.assinatura_status === "past_due")) {
      const portal = await s.billingPortal.sessions.create({ customer: customerId, return_url: `${origem}/` });
      return NextResponse.json({ url: portal.url, tipo: "portal" });
    }

    const { data: precos } = await s.prices.list({ lookup_keys: [oferta.lookupKey], active: true, limit: 1 });
    const preco = precos[0];
    if (!preco) {
      return NextResponse.json({ error: `Preço "${oferta.lookupKey}" não existe na Stripe. Crie com essa lookup_key.` }, { status: 500 });
    }

    if (oferta.tipo === "pacote") {
      const creditos = preco.metadata?.creditos ?? String(oferta.creditos);
      const sessao = await s.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price: preco.id, quantity: 1 }],
        success_url: `${origem}/?compra=ok`,
        cancel_url: `${origem}/planos?compra=cancelada`,
        locale: "pt-BR",
        client_reference_id: userId,
        // Os créditos vão no metadata da sessão: é o que o webhook lê pra creditar.
        metadata: { userId, creditos, tipo: "pacote", oferta: oferta.id },
        payment_intent_data: { metadata: { userId, tipo: "pacote", oferta: oferta.id } },
        allow_promotion_codes: true,
      });
      if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
      return NextResponse.json({ url: sessao.url, tipo: "checkout" });
    }

    const sessao = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: preco.id, quantity: 1 }],
      success_url: `${origem}/?assinatura=ok`,
      cancel_url: `${origem}/planos?assinatura=cancelada`,
      locale: "pt-BR",
      client_reference_id: userId,
      subscription_data: { metadata: { userId, oferta: oferta.id } },
      allow_promotion_codes: true,
    });
    if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
    return NextResponse.json({ url: sessao.url, tipo: "checkout" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro falando com a Stripe." }, { status: 502 });
  }
}
