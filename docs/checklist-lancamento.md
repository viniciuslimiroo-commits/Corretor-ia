# Checklist de lançamento (o que é seu, o que é meu)

Atualizado em 12/09/2026. Cada item diz quem faz e o que acontece depois.

## 1. DNS do encena.app.br (você, 5 min)

1. https://registro.br/painel/ → domínio **encena.app.br** (precisa estar ativo, não
   "aguardando ativação").
2. Aba **DNS** → **Editar zona** (servidores DNS do Registro.br).
3. Nova entrada, três vezes:
   - `A` · nome em branco · `216.198.79.1`
   - `A` · nome em branco · `64.29.17.1`
   - `CNAME` · `www` · `cname.vercel-dns.com`
4. Salvar. Avisar.

**Depois (eu):** `NEXT_PUBLIC_APP_URL=https://encena.app.br` na Vercel + redeploy; Site
URL e Redirect URLs no Supabase; URL do webhook na Stripe; certificado sai sozinho.

## 2. Saldo do fal (você, 2 min)

https://fal.ai/dashboard/billing → Add funds. US$ 30 agora (≈ 700 fotos); no lançamento
US$ 100 com auto top-up ligado. Uma imobiliária cheia gasta ≈ US$ 55/mês.

## 3. Vercel Pro (você, US$ 20/mês)

https://vercel.com/limiro-brasil/~/settings/billing → Upgrade to Pro. Hobby proíbe uso
comercial e limita cron a 1×/dia. Nada muda no código.

## 4. E-mail de login: Resend (você, 10 min, grátis) — BLOQUEIA O LANÇAMENTO

O e-mail embutido do Supabase manda **2 e-mails por hora no projeto inteiro**. O terceiro
corretor que tentar entrar não recebe link nenhum — e foi isso que travou o login pelo
celular em 14/09/2026.

Esse teto **não é ajustável**. Não é questão de plano nem de painel: a API responde
`401 Custom SMTP required to configure RATE_LIMIT_EMAIL_SENT`. O único jeito de subir é
ter SMTP próprio. (Registrado assim porque eu mesmo já mandei procurar no painel uma
opção que não existe.)

1. https://resend.com → criar conta (grátis, 3.000 e-mails/mês, sem cartão).
2. **API Keys → Create API Key → Full access.** Colar no `web/.env.local` como
   `RESEND_API_KEY=re_...` — não precisa mandar no chat.
3. **Domains → Add domain `encena.app.br`** → colar os registros que ele mostra na mesma
   zona DNS do item 1. (Sem domínio verificado a Resend só entrega no seu próprio e-mail:
   dá pra testar, não dá pra atender corretor.)
4. `cd web && node scripts/configurar-email.mjs`

O script faz o resto sozinho: SMTP no Supabase, limite de 2 → 100 e-mails/hora, e os
textos dos e-mails em português com o código de 8 dígitos. `--ver` mostra como está hoje
sem mudar nada.

Supabase Pro (US$ 25/mês) é assunto separado — vale pelo backup diário e pelo banco sem
pausa, não pelo e-mail.

## 5. Ativar a Stripe (você, 15 min)

https://dashboard.stripe.com/account/onboarding → Ativar pagamentos → pessoa física ou
CNPJ → categoria Software/SaaS → site `https://encena.app.br` → descrição no extrato
**ENCENA** → conta bancária → documento.

**Depois (eu):** recriar os 9 preços (mesmas lookup_keys e metadata) e o webhook em modo
live; você cola `sk_live`/`pk_live` no `web/.env.local`; eu mando pra Vercel e publico.
Só então trocar o toggle "modo de teste" no painel.

## 6. Boleto e nota fiscal

- **Boleto** (depois da ativação): https://dashboard.stripe.com/settings/payment_methods
  → Boleto → Ativar. Eu adiciono `boleto` ao checkout dos pacotes (compensa em até 3
  dias; `checkout.session.async_payment_succeeded` já é tratado). Assinatura continua no
  cartão.
- **Nota fiscal:** exige CNPJ. MEI **não** cobre software (as ocupações de TI ficam fora
  da lista); o caminho é ME no Simples Nacional com contador. CNAE a avaliar com ele:
  6203-1/00 ou 6311-9/00. NFS-e pela prefeitura de Goiânia; depois integrar emissão
  automática (eNotas ou NFE.io) no `invoice.paid`.

### Sem CNPJ ainda: como começar (12/09/2026)

Vinicius não tem CNPJ nem MEI. Não é impedimento pra validar:

1. **Ativar a Stripe como pessoa física** (CPF + conta bancária). Recebe normal; o
   cliente recebe o recibo da Stripe por e-mail, que serve pra corretor autônomo.
2. **Declarar no carnê-leão** todo mês (site da Receita). Tabela do IR: começa isento,
   chega a 27,5%.
3. **Abrir ME** quando vier o primeiro dos dois: uma imobiliária que exige nota, ou
   faturamento acima de ~R$ 3.000/mês (aí o Simples a 6% fica mais barato que os 27,5%).
   Custo: ~R$ 300 de abertura e R$ 150-250/mês de contador online.

Limitação a saber: sem CNPJ não há NFS-e, e imobiliária média não fecha sem nota. Ou
seja, PF serve pros primeiros corretores autônomos; imobiliária pede empresa.

### Conta de e-mail contato@encena.app.br (você, 10 min)

Aparece nos Termos e na Política como canal do controlador de dados (LGPD). O
Registro.br não oferece caixa de e-mail: use **Zoho Mail** (grátis com domínio próprio)
ou o Google Workspace. Ele dá registros MX pra colar na mesma zona DNS do item 1.

## 7. Páginas legais e conta de contato (eu + você)

- `/termos` e `/privacidade` no ar (LGPD). Revisar com advogado antes de escalar.
- Criar a caixa `contato@encena.app.br` (Zoho Mail grátis ou alias no Gmail via
  Registro.br não oferece e-mail): é o endereço do controlador de dados na política.
