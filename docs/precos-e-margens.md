# Preços, custos e margens (12/09/2026, revisto em 19/09/2026)

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

## Margem por oferta (por mês)

Taxas = Stripe + imposto. "Uso 100%" = cliente gasta todos os créditos; "uso 50%" é o
caso típico de SaaS de créditos. No anual, receita e taxas estão divididas pelos 12
meses. **A tabela é a saída de `web/scripts/testar-planos.ts`** (mesmas premissas, mesma
conta): mudou preço ou premissa, roda o teste e cola de novo. Nada de calculadora.

| Oferta | Receita/mês | Taxas | IA 100% | Lucro 100% | Lucro 50% |
|---|---|---|---|---|---|
| Pro mensal · R$ 69 | R$ 69 | R$ 7,28 | R$ 20 | **R$ 41,72 (60%)** | R$ 51,72 (75%) |
| Pro anual · R$ 690 | R$ 57,50 | R$ 5,78 | R$ 20 | **R$ 31,72 (55%)** | R$ 41,72 (73%) |
| Equipe mensal · R$ 249 | R$ 249 | R$ 25,27 | R$ 100 | **R$ 123,73 (50%)** | R$ 173,73 (70%) |
| Equipe anual · R$ 2.490 | R$ 207,50 | R$ 20,76 | R$ 100 | **R$ 86,74 (42%)** | R$ 136,74 (66%) |
| Imobiliária mensal · R$ 599 | R$ 599 | R$ 60,23 | R$ 300 | **R$ 238,77 (40%)** | R$ 388,77 (65%) |
| Imobiliária anual · R$ 5.990 | R$ 499,17 | R$ 49,90 | R$ 300 | **R$ 149,27 (30%)** | R$ 299,27 (60%) |
| 20 créditos · R$ 29 | R$ 29 | R$ 3,29 | R$ 5 | **R$ 20,71 (71%)** | — |
| 60 créditos · R$ 79 | R$ 79 | R$ 8,28 | R$ 15 | **R$ 55,72 (71%)** | — |
| 150 créditos · R$ 179 | R$ 179 | R$ 18,27 | R$ 37,50 | **R$ 123,23 (69%)** | — |

**Correção de 19/09/2026:** a versão de 12/09 dava ao anual 57% (Pro), 46% (Equipe) e
38% (Imobiliária) com uso total; a conta subestimava as taxas. O certo é 55%, 42% e
**30%**. O Imobiliária anual é a oferta mais apertada da tabela. O custo por crédito
(R$ 0,25) tem folga, porque o upscale caiu pra 1600 px depois da medição (ver
`web/src/lib/custo.ts`), mas vale medir de novo com clientes reais.

**Ponto de equilíbrio da infra fixa (R$ 250):** 5 Pro, ou 2 Equipe, ou 1 Imobiliária.

## Comparação com a Pedra

Pedra: €29/mês por pessoa, 100 créditos (≈ R$ 185 a €6,40). Por crédito ≈ R$ 1,86,
contra R$ 0,86 no nosso Pro. Para uma imobiliária de 10 corretores, a Pedra sai
≈ R$ 1.850/mês; o nosso Imobiliária, R$ 599 (15 pessoas). Somos 3 a 5× mais baratos por
cadeira, de propósito: entrada sem marca conhecida. Com 20 clientes pagando, subir o Pro
para R$ 89 e o Equipe para R$ 299 sem perder ninguém.

## Riscos e decisões

1. **Uso pesado no Imobiliária** deixa 40% de margem no mensal e 30% no anual.
   Aceitável, mas é o plano a vigiar: se a média passar de 80% de uso, sobe pra R$ 699
   ou cai pra 1.000 créditos.
2. **Infra grátis não serve pra cobrar:** o plano Hobby da Vercel proíbe uso comercial e
   o Supabase grátis tem 2 GB de tráfego/mês (vídeos compartilhados estouram). Antes de
   cobrar de verdade: Vercel Pro e Supabase Pro.
3. **fal é pré-pago.** Saldo em 12/09: US$ 0,42. Uma imobiliária cheia gasta ≈ US$ 55/mês
   de IA. Manter saldo para 2 meses e alerta em US$ 20.
4. **Vídeo montado custa quase nada** e hoje não cobra crédito (só a cena animada, 2, e
   a narração de IA, 1). Custo que não aparece no crédito: armazenamento dos vídeos.
5. **Boleto e nota fiscal** são condição pra fechar imobiliária média. Boleto liga no
   painel da Stripe; NF exige integração (enotas/NFE.io) -- fica pro lançamento.
6. **Pix** continua indisponível na Stripe Brasil (só por convite).

## Mudanças de 19/09/2026

Pedidas pelo Vinicius ("faça esses ajustes que achar necessário") depois da análise de
preço contra Pedra e Interior AI.

1. **Pacotes avulsos passaram a custar mais por foto que a assinatura.** Antes: 20 por
   R$ 25, 80 por R$ 69 (o preço do Pro, sem prazo nem compromisso) e 200 por R$ 149
   (R$ 0,75 a foto, mais barato que o Pro). Quem fizesse a conta nunca assinava. Agora:
   20 por R$ 29 (R$ 1,45), 60 por R$ 79 (R$ 1,32), 150 por R$ 179 (R$ 1,19). O pacote é
   pra quem usa pouco ou pra completar o mês. `testar-planos.ts` falha se um pacote
   ficar mais barato por foto que a assinatura.
2. **Pro em preço de lançamento** (R$ 69 / R$ 690): quem assina agora mantém o valor
   enquanto a assinatura estiver ativa (Termos, item 5). Com 20 assinantes Pro pagando,
   subir pra R$ 89 nas assinaturas novas: muda o `preco` em `planos.ts`, publica e roda
   `scripts/stripe-sincronizar-precos.ts --aplicar`. O script cria o preço novo, passa a
   lookup_key pra ele e deixa as assinaturas antigas no preço antigo.
3. **Termos:** vídeo montado não gasta crédito (dizia 1); cancelar o anual mantém os
   créditos entrando até o fim do ano pago (dizia que interrompia, e o portal da Stripe
   cancela no fim do período); mudança de preço em assinatura ativa com 30 dias de aviso.
4. **Esperando dado, sem mudança:** plano de entrada (R$ 39 a 49, 25 a 30 créditos) pra
   quem acha o Pro caro, depois do primeiro mês de uso real; Imobiliária (item 1 acima);
   regra de armazenamento pra vídeo de conta grátis antigo.
5. **Achado:** o portal da Stripe não deixa trocar de plano (mensal → anual, por
   exemplo); quem quiser trocar tem que cancelar e assinar de novo. Ligar a troca é
   configuração da conta Stripe, decisão do dono.
