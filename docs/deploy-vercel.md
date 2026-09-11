# Deploy na Vercel — checklist

O app já está pronto pra publicar: build passa, rotas curtas (nenhuma passa de 6s),
Stripe e Supabase testados. O que falta é conta e configuração, e isso é seu.

## 1. Conta e projeto (você)

1. Crie a conta em https://vercel.com/signup entrando com o GitHub (mesma conta do
   repositório `viniciuslimiroo-commits/Corretor-ia`).
2. "Add New Project" → importe o repositório `Corretor-ia`.
3. **Root Directory:** `web` (o Next.js mora aí, não na raiz). Framework: Next.js,
   detectado sozinho.
4. Antes de clicar em Deploy, abra "Environment Variables" e cole as variáveis abaixo.

## 2. Variáveis de ambiente (você cola, eu não posso)

Copie os valores do seu `web/.env.local`, **exceto** as duas marcadas:

| Variável | De onde vem |
|---|---|
| `FAL_KEY` | igual ao local |
| `NEXT_PUBLIC_SUPABASE_URL` | igual ao local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual ao local |
| `SUPABASE_SERVICE_ROLE_KEY` | igual ao local |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | igual ao local (teste) — troque pela `pk_live_` no lançamento |
| `STRIPE_SECRET_KEY` | igual ao local (teste) — troque pela `sk_live_` no lançamento |
| `STRIPE_PRICE_ID` | igual ao local — em produção, crie o preço de novo no modo live e use o id novo |
| `STRIPE_PRICE_PACOTE_ID` | idem |
| `STRIPE_WEBHOOK_SECRET` | **NÃO copie o local.** Vem do passo 4. |
| `NEXT_PUBLIC_APP_URL` | a URL que a Vercel te der, ex. `https://corretor-ia.vercel.app` |

## 3. Supabase: liberar o domínio (você)

Em Authentication → URL Configuration, coloque a URL da Vercel em **Site URL** e em
**Redirect URLs**. Sem isso o link mágico de login volta pra localhost.

## 4. Webhook da Stripe (você, depois do primeiro deploy)

1. Painel da Stripe → Desenvolvedores → Webhooks → "Adicionar destino".
2. URL: `https://SEU-DOMINIO.vercel.app/api/stripe/webhook`
3. Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Copie o segredo `whsec_...` que aparece e cole na Vercel como `STRIPE_WEBHOOK_SECRET`.
5. Redeploy (a Vercel não relê variável sem isso).

## 5. Formas de pagamento (você, quando quiser)

O lançamento é com **cartão**, na assinatura e no pacote avulso. No painel da Stripe,
em Configurações → Formas de pagamento, dá pra ligar **Boleto** e **Google Pay**; o
checkout do pacote passa a mostrar sem mudar código.

**Pix não está disponível** nesta conta: a Stripe libera Pix pra conta brasileira só por
convite (conferido no painel em 11/09/2026). Não conte com ele pro lançamento. Se um
dia aparecer como disponível, é ligar no painel — o código já trata pagamento assíncrono.

## 0. Ativar a conta Stripe (você, antes de tudo)

A conta ainda está em modo de teste com ativação pendente: confirmar o e-mail, ativar
pagamentos e completar o perfil da empresa. As chaves `sk_live_`/`pk_live_` e o webhook
de produção só existem depois disso.

## O que eu já deixei pronto no código

- `maxDuration = 60` nas rotas longas: cabe no plano Hobby.
- Webhook lê o corpo cru e verifica assinatura; duplicatas ignoradas.
- Migrations 03 a 06 já aplicadas no Supabase (o banco de produção é o mesmo projeto).
- Nenhuma URL fixa em `localhost`: origem vem do cabeçalho ou de `NEXT_PUBLIC_APP_URL`.
