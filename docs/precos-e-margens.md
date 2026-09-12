# Preços, custos e margens (12/09/2026)

Conta feita antes de fechar os planos de imobiliária. O que é **medido** veio de testes
reais nesta data; o que é **estimado** está marcado. Rever a cada mudança de modelo,
de câmbio ou de plano.

## Premissas

| Item | Valor | Origem |
|---|---|---|
| Dólar | R$ 5,50 | estimado; conferir |
| Foto editada (modelo + upscale 2048) | US$ 0,040 | **medido** (saldo do fal antes/depois, 9 gerações) |
| Cena animada de vídeo (wan 2.2 5b, 720p, ~4s) | US$ 0,13 | **medido** (1 cena) |
| Narração (ElevenLabs multilingual v2, ~130 caracteres) | US$ 0,03 | **medido** (junto com a cena) |
| Avaliador de estorno (gemini flash-lite, 2 imagens) | ≈ US$ 0,002 | estimado pela tabela do fal |
| Render de vídeo (CPU Fluid na Vercel, 70s) | ≈ US$ 0,003 | estimado pela tabela da Vercel |
| Música de fundo | US$ 0,20 por faixa, uma vez | **medido** (5 faixas = US$ 1,00) |
| Stripe Brasil, cartão | 3,99% + R$ 0,39 | tabela pública |
| Imposto | 6% (Simples, anexo III com fator R) | estimado; depende do CNPJ |
| Infra fixa | R$ 250/mês (Vercel Pro US$ 20 + Supabase Pro US$ 25 + domínio) | tabela pública |

**Custo por crédito:** foto R$ 0,22; cena animada R$ 0,72 por 2 créditos (R$ 0,36/cr);
narração R$ 0,17; vídeo montado R$ 0,02. Para a conta, **R$ 0,25 por crédito** (mix
pesado em foto, com folga).

Atenção: **Converter em HD** faz upscale até 2560 px. Se o upscaler cobrar por
megapixel de saída, uma conversão pode custar mais que uma foto comum. Medir e, se
passar de R$ 0,50, cobrar 2 créditos.

## Margem por plano (mensal)

Taxas = Stripe + imposto. "Uso 100%" = cliente gasta todos os créditos; "uso 50%" é o
caso típico de SaaS de créditos.

| Plano | Receita | Taxas | IA a 100% | Lucro 100% | Lucro 50% |
|---|---|---|---|---|---|
| Pro · R$ 69 · 80 cr · 1 pessoa | 69,00 | 7,28 | 20,00 | **41,7 (60%)** | 51,7 (75%) |
| Equipe · R$ 249 · 400 cr · 5 pessoas | 249,00 | 25,27 | 100,00 | **123,7 (50%)** | 173,7 (70%) |
| Imobiliária · R$ 599 · 1.200 cr · 15 pessoas | 599,00 | 60,23 | 300,00 | **238,8 (40%)** | 388,8 (65%) |
| Pacote 20 · R$ 25 | 25,00 | 2,89 | 5,00 | 17,1 (68%) | — |
| Pacote 80 · R$ 69 | 69,00 | 7,28 | 20,00 | 41,7 (60%) | — |
| Pacote 200 · R$ 149 | 149,00 | 15,29 | 50,00 | 83,7 (56%) | — |

**Anual:** paga 10 meses e recebe 12 de créditos, liberados mês a mês. Por mês
equivalente: Pro R$ 57,50 (lucro a 100% de uso: 32,6 = 57%), Equipe R$ 207,50 (95,6 =
46%), Imobiliária R$ 499 (187,2 = 38%). É o preço da fidelidade de um ano.

**Ponto de equilíbrio da infra fixa (R$ 250):** 5 Pro, ou 2 Equipe, ou 1 Imobiliária.

## Comparação com a Pedra

Pedra: €29/mês por pessoa, 100 créditos (≈ R$ 185 a €6,40). Por crédito ≈ R$ 1,86,
contra R$ 0,86 no nosso Pro. Para uma imobiliária de 10 corretores, a Pedra sai
≈ R$ 1.850/mês; o nosso Imobiliária, R$ 599 (15 pessoas). Somos 3 a 5× mais baratos por
cadeira, de propósito: entrada sem marca conhecida. Com 20 clientes pagando, subir o Pro
para R$ 89 e o Equipe para R$ 299 sem perder ninguém.

## Riscos e decisões

1. **Uso pesado no Imobiliária** deixa 40% de margem. Aceitável, mas é o plano a
   vigiar: se a média passar de 80% de uso, sobe pra R$ 699 ou cai pra 1.000 créditos.
2. **Infra grátis não serve pra cobrar:** o plano Hobby da Vercel proíbe uso comercial e
   o Supabase grátis tem 2 GB de tráfego/mês (vídeos compartilhados estouram). Antes de
   cobrar de verdade: Vercel Pro e Supabase Pro.
3. **fal é pré-pago.** Saldo em 12/09: US$ 0,42. Uma imobiliária cheia gasta ≈ US$ 55/mês
   de IA. Manter saldo para 2 meses e alerta em US$ 20.
4. **Vídeo estático custa quase nada** e cobra 1 crédito. É a alavanca pra "vídeos
   inclusos" num plano futuro, se a Pedra puxar por aí.
5. **Boleto e nota fiscal** são condição pra fechar imobiliária média. Boleto liga no
   painel da Stripe; NF exige integração (enotas/NFE.io) -- fica pro lançamento.
6. **Pix** continua indisponível na Stripe Brasil (só por convite).
