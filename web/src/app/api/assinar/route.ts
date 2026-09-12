import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";
import { OFERTAS_POR_ID, ehOfertaId, type OfertaId } from "@/lib/planos";
import { contaDe } from "@/lib/cobranca";

// Abre o pagamento de uma oferta (ver lib/planos.ts). O servidor cria (ou reaproveita)
// o cliente na Stripe, abre uma sessão de Checkout e devolve a URL. O navegador só
// redireciona -- nenhum dado de cartão passa por aqui, nunca.
//
// Quem paga: a PESSOA (ofertas de corretor e, fora de imobiliária, os pacotes) ou a
// IMOBILIÁRIA (ofertas de imobiliária e, sendo membro, os pacotes). O customer da Stripe
// fica gravado na conta certa ANTES do redirect, porque a Stripe não garante a ordem
// dos eventos e o webhook acha a conta pelo customer.
//
// Ofertas de imobiliária só o dono ou gestor compra. Corretor membro vê o plano da casa
// e não compra nada -- é o gestor que controla o gasto.
//
// O preço é achado pela `lookup_key`. Em modo live basta criar os preços com as mesmas
// chaves. Créditos vêm do metadata do preço (o webhook lê): creditos_por_ciclo (mensal),
// creditos_por_mes + meses (anual, liberado mês a mês), creditos (pacote).

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const s = stripe();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  if (!s) return NextResponse.json({ error: "STRIPE_SECRET_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const ofertaId: OfertaId = ehOfertaId(corpo?.oferta) ? corpo.oferta : corpo?.modo === "pacote" ? "pacote_80" : "pro_mensal";
  const oferta = OFERTAS_POR_ID[ofertaId];

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;
  const email = userData.user.email ?? "";

  const conta = await contaDe(db, userId);

  // ---- quem paga ----
  if (oferta.segmento === "imobiliaria" && !conta.org) {
    return NextResponse.json({ error: "Crie sua imobiliária em Equipe antes de assinar um plano de imobiliária.", criarImobiliaria: true }, { status: 409 });
  }
  if (oferta.segmento === "corretor" && conta.org) {
    return NextResponse.json({ error: "Você faz parte de uma imobiliária: os planos são os de imobiliária, em Equipe." }, { status: 409 });
  }
  if (conta.org && conta.org.papel === "corretor") {
    return NextResponse.json({ error: "Só o dono ou gestor da imobiliária compra planos e créditos." }, { status: 403 });
  }
  const pagador = conta.org ? { tabela: "organizations" as const, id: conta.org.id, tipo: "org" as const } : { tabela: "users" as const, id: userId, tipo: "user" as const };

  const { data: linha } = await db.from(pagador.tabela).select("stripe_customer_id").eq("id", pagador.id).single();
  const origem = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;

  try {
    let customerId = (linha?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      const cliente = await s.customers.create({
        email,
        name: conta.org ? conta.org.nome : undefined,
        metadata: conta.org ? { orgId: conta.org.id, userId } : { userId },
      });
      customerId = cliente.id;
      await db.from(pagador.tabela).update({ stripe_customer_id: customerId }).eq("id", pagador.id);
    }

    // Já assina: manda pro portal, onde troca de plano, troca cartão ou cancela. Código
    // de Defesa do Consumidor exige que cancelar seja tão fácil quanto assinar.
    if (oferta.tipo === "assinatura" && (conta.status === "active" || conta.status === "past_due")) {
      const portal = await s.billingPortal.sessions.create({ customer: customerId, return_url: `${origem}/planos` });
      return NextResponse.json({ url: portal.url, tipo: "portal" });
    }

    const { data: precos } = await s.prices.list({ lookup_keys: [oferta.lookupKey], active: true, limit: 1 });
    const preco = precos[0];
    if (!preco) return NextResponse.json({ error: `Preço "${oferta.lookupKey}" não existe na Stripe. Crie com essa lookup_key.` }, { status: 500 });

    const metadataConta: Record<string, string> = conta.org ? { orgId: conta.org.id, userId, oferta: oferta.id } : { userId, oferta: oferta.id };

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
        metadata: { ...metadataConta, creditos, tipo: "pacote" },
        payment_intent_data: { metadata: { ...metadataConta, tipo: "pacote" } },
        allow_promotion_codes: true,
      });
      if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
      return NextResponse.json({ url: sessao.url, tipo: "checkout" });
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: preco.id, quantity: 1 }],
      success_url: `${origem}/?assinatura=ok`,
      cancel_url: `${origem}/planos?assinatura=cancelada`,
      locale: "pt-BR",
      client_reference_id: userId,
      metadata: metadataConta,
      subscription_data: { metadata: metadataConta },
      allow_promotion_codes: true,
    };
    const sessao = await s.checkout.sessions.create(params);
    if (!sessao.url) throw new Error("A Stripe não devolveu URL de checkout.");
    return NextResponse.json({ url: sessao.url, tipo: "checkout" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro falando com a Stripe." }, { status: 502 });
  }
}
