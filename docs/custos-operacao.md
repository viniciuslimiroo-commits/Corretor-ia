# Quanto custa até o primeiro cliente, e o que roda sozinho (12/09/2026)

Pergunta do Vinicius: "não sabia que teria mais esses gastos para testar e manter".
Resposta em três blocos: o que já foi gasto, o que custa até o primeiro cliente pagante,
e o que passa a custar por mês quando houver clientes. Depois, o que já roda sem
ninguém apertar botão e o que ainda depende de gente.

## O que já saiu do bolso (até hoje)

| Item | Valor | Por quê |
|---|---|---|
| fal.ai (IA) | ≈ US$ 33 (≈ R$ 180) | testes reais: ~60 fotos, 2 cenas animadas, 1 narração, 5 músicas |
| Domínio encena.app.br | R$ 40/ano | Registro.br |
| Vercel, Supabase, Stripe, GitHub, Resend | R$ 0 | planos grátis / sem mensalidade |

## Até o primeiro cliente (fase de teste)

Dá pra ficar nos planos grátis de tudo, menos a IA:

| Item | Valor |
|---|---|
| fal.ai | US$ 30 já colocados. Dão ~700 fotos ou a bateria de testes inteira mais 20 clientes de teste |
| Resto | R$ 0 |

**Total até vender: só o que já foi pago.** Não precisa de Vercel Pro, Supabase Pro nem
CNPJ pra testar com corretores conhecidos.

## Quando houver cliente pagando (por mês)

| Item | Valor | Obrigatório? |
|---|---|---|
| Vercel Pro | US$ 20 (≈ R$ 110) | sim: o grátis proíbe uso comercial |
| Supabase Pro | US$ 25 (≈ R$ 138) | sim: 2 GB de tráfego do grátis acabam com vídeos compartilhados |
| fal.ai | variável: R$ 0,22 por foto, R$ 0,72 por cena animada | pré-pago; ≈ R$ 18 por assinante Pro que usa tudo |
| Stripe | 3,99% + R$ 0,39 por cobrança | só quando vende |
| Resend (e-mail de login) | R$ 0 até 3.000 e-mails/mês | |
| Contador (quando abrir ME) | R$ 150-250 | só com CNPJ |
| **Fixo sem contador** | **≈ R$ 250/mês** | |

**Ponto de equilíbrio:** 5 assinantes Pro (R$ 345) ou 2 Equipe (R$ 498) pagam o fixo. A
partir do 6º, é lucro. A conta completa por plano está em `precos-e-margens.md`.

## O que já roda sozinho

- Cobrança, renovação e cancelamento (Stripe → webhook → créditos na conta certa).
- Liberação mensal dos créditos do plano anual (cron diário na Vercel).
- Estorno de geração que falhou, com devolução de crédito.
- Avaliação automática de "ficou ruim" e devolução por cortesia.
- Convite de equipe (entra ao logar com o e-mail convidado).
- Deploy: cada `git push` que eu faço vira versão nova.
- Painel do fundador (`/admin`) com alerta de saldo baixo do fal.

## O que ainda depende de gente

| O quê | Quem | Quando |
|---|---|---|
| Recarregar o fal antes de zerar | Vinicius (auto top-up no painel do fal resolve) | ligar hoje |
| DNS do domínio | Vinicius | 5 min |
| Ativar Stripe, virar modo real | Vinicius + eu | antes do 1º pagamento |
| Vercel Pro e Supabase Pro | Vinicius (cartão) | antes do 1º pagamento |
| E-mail de login próprio (Resend) | Vinicius cria conta + eu configuro | antes de ter 5 usuários |
| Nota fiscal | precisa de CNPJ | quando vier imobiliária |
| Reporte acima do limite de cortesia | análise manual (Vinicius) | raro |

## Recomendação

1. Ligar o **auto top-up do fal** (recarrega sozinho ao chegar em US$ 10): tira o único
   risco operacional de hoje, que é a IA parar no meio de um cliente.
2. Ficar no grátis até o primeiro "sim" de cliente. No dia do primeiro pagamento, subir
   Vercel e Supabase pra Pro. São dois cliques cada.
3. Não abrir CNPJ antes do primeiro cliente que exigir nota.
