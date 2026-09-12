# Deploy na Vercel — checklist

## Nome e domínio (12/09/2026)

O produto se chama **Encena**. Site, título da página, botões e produtos da Stripe já
usam o nome e a paleta.

**Domínio registrado em 12/09/2026: `encena.app.br`** (Registro.br, DNS do próprio
Registro.br, `a.auto.dns.br`/`b.auto.dns.br`). É o domínio de teste/lançamento; o
`encena.ai` continua livre pra quando fizer sentido pagar os 2 anos mínimos.

Estado do apontamento:

1. ✅ `encena.app.br` e `www.encena.app.br` adicionados ao projeto `corretor-ia` na Vercel
   pela CLI (`vercel domains add`).
2. ⏳ **Você**, no painel do Registro.br → domínio → DNS → Editar zona, cria:
   `A @ 216.198.79.1`, `A @ 64.29.17.1`, `CNAME www cname.vercel-dns.com`.
   (Os IPs vieram de `vercel domains verify encena.app.br`; são os atuais da Vercel, não
   o antigo 76.76.21.21.)
3. ⏳ Quando `nslookup encena.app.br` responder com esses IPs, a Vercel emite o
   certificado sozinha. Aí: `vercel env add NEXT_PUBLIC_APP_URL` = `https://encena.app.br`
   (Production) + `vercel --prod`; no Supabase, Site URL = `https://encena.app.br` e
   Redirect URLs + `https://encena.app.br/**`; na Stripe, trocar a URL do webhook pra
   `https://encena.app.br/api/stripe/webhook` (ou criar outro endpoint e atualizar o
   `STRIPE_WEBHOOK_SECRET`).
4. Na Stripe, a descrição no extrato do cartão é `ENCENA`: fica no passo "Descrição no
   extrato" da ativação (a API não deixa alterar na própria conta).

## ✅ Estado em 11/09/2026

**Produção no ar: https://corretor-ia-gilt.vercel.app** (time `limiro-brasil`, projeto
`corretor-ia`, Root Directory `web`, Next.js, Node 24). O subdomínio `corretor-ia` puro
já era de outra pessoa, por isso o sufixo `-gilt`; `NEXT_PUBLIC_APP_URL` aponta pro
domínio real.

Feito pela CLI (`vercel` 59): login por código de dispositivo, `vercel link` **na raiz
do repositório** (não em `web/` — com Root Directory configurado, a CLI tem que rodar da
raiz, senão procura `web/web`), nove variáveis enviadas pra Production e Preview via
stdin (nenhum valor passou por tela ou chat), `vercel --prod`.

Também feitos em 11/09/2026, a pedido:
- **Supabase**: Site URL = `https://corretor-ia-gilt.vercel.app`; Redirect URLs =
  `https://corretor-ia-gilt.vercel.app/**` e `http://localhost:3000/**` (o segundo mantém
  o login local funcionando). Detalhe do painel: o campo "uma URL por linha" gravou duas
  URLs coladas numa só quando recebeu quebra de linha; foi preciso apagar e adicionar uma
  de cada vez. E a lista mostra estado atrasado depois de salvar/remover — conferir
  recarregando a página.
- **Stripe**: webhook `we_1UEdj3Gu8BwjRA4gIOb9uB0d` registrado pela API apontando pra
  `/api/stripe/webhook`, com os 6 eventos; o `whsec_` foi injetado na Vercel (Production
  e Preview) direto da resposta da API, sem passar por tela, e a produção foi
  redeployada. **Provado com entrega real:** assinatura de teste criada pela API → a
  Stripe entregou `invoice.paid` ao site publicado → créditos 5 → 85, plano pro;
  cancelamento → plano grátis. Conta de teste devolvida a 5 créditos.

O que continua sendo só seu: ativar a conta Stripe (dados da empresa e conta bancária) e,
quando for pra produção de verdade, repetir preço + webhook no modo live.

---

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
