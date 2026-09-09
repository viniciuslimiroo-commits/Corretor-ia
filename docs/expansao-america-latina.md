# Expansão para a América Latina

Documento vivo. Objetivo: definir se, quando e como o produto sai do Brasil para o resto
da América Latina — e principalmente **como cobrar** numa região com câmbio volátil e
meios de pagamento fragmentados.

Relacionado: [arquitetura-tecnica.md](arquitetura-tecnica.md) ·
[pedra-teardown/relatorio-teste.md](pedra-teardown/relatorio-teste.md)

---

## 1. Tese

A dor (foto ruim de imóvel, custo alto de home staging físico, anúncio que não converte) é
praticamente idêntica em toda a região. Quase não há player local forte **em espanhol** com
o pacote completo. A Pedra atende a região de fora, em euro, sem localização de pagamento
nem integração com portais locais — a mesma brecha que existe no Brasil.

Na prática, "vender para a América Latina" é **dois produtos**: um em português (Brasil) e
um em espanhol (o resto). O motor de IA é o mesmo; muda idioma, presets de export por
portal, moeda, meios de pagamento e o texto de disclosure legal.

## 2. Mercados e portais

| País | Portais para export nativo | Licença de corretor | Moeda | Nota |
|---|---|---|---|---|
| Brasil | ZAP, VivaReal, OLX, QuintoAndar, Chaves na Mão | CRECI (obrigatório) | BRL | mercado-base |
| México | Inmuebles24, Lamudi, Vivanuncios, Propiedades.com | sem licença nacional | MXN | 2º maior; Stripe funciona |
| Argentina | Zonaprop, Argenprop, MercadoLibre Inmuebles | matrícula (CUCICBA / colegios) | ARS | câmbio e controles cambiais; caso difícil |
| Colômbia | Fincaraíz, Metrocuadrado, Ciencuadras | registro (Lei 2071/2021) | COP | PSE / Nequi dominam |
| Chile | Portal Inmobiliario, Toctoc, Yapo | sem licença obrigatória | CLP | Webpay / Khipu |
| Peru | Urbania, Adondevivir | sem licença obrigatória | PEN | mercado menor |
| Regional | Properati, Lamudi (vários países) | — | — | úteis como export "genérico LatAm" |

## 3. O problema central do billing

O custo de inferência é em **dólar** (Nano Banana / Flux cobram em USD). Várias moedas da
região desvalorizam frente ao dólar. Se você precificar em moeda local e ela cair 30% no
ano, sua margem evapora.

**Regra de ouro:** precificar em **USD** e cobrar na moeda local via um agregador que
converte e te repassa em **USD**. Assim a margem fica protegida e o cliente paga no meio
que ele conhece.

## 4. Infraestrutura de pagamento

| Região | Solução | Meios cobertos |
|---|---|---|
| Brasil | gateway local (Asaas / Pagar.me) + Stripe | Pix, boleto, cartão, recorrência |
| México | Stripe direto | cartão, OXXO, SPEI |
| Resto da região | **dLocal** ou **EBANX** | cartão local, transferências, carteiras (Nequi, PSE, Webpay, MercadoPago); FX; repasse em USD; fee ~4-6% |
| Argentina (reforço) | **MercadoPago** integrado à parte | domina o país; também forte em MX/CL/CO/PE/UY |
| Alternativa "menos esforço" | Paddle / Lemon Squeezy (Merchant of Record) | resolve imposto de todo país, mas cobre menos meios locais e fee maior |

Recomendação: **dLocal ou EBANX** como espinha dorsal fora de BR/MX, MercadoPago como
reforço na Argentina, Stripe no México, gateway local no Brasil.

## 5. Modelo de preço

Dois eixos, usar **os dois ao mesmo tempo**:

1. **Assinatura mensal** (cartão recorrente) — funciona bem em BR, MX, CL, CO.
2. **Pacotes de créditos pré-pagos** (paga uma vez, gasta quando quiser) — **padrão na
   Argentina** e em qualquer lugar onde cobrança recorrente no cartão falha muito. Elimina
   risco de inadimplência.

### Faixas regionais (mesmo plano, preço ancorado no Brasil)

R$ 69 ≈ US$ 12-13. Esse valor em USD é ok para México e Chile, salgado para
Colômbia/Peru/Argentina. Três faixas:

| Plano | Brasil | México / Chile / Uruguai | Argentina / Colômbia / Peru |
|---|---|---|---|
| Corretor (~80 créditos) | R$ 69 | US$ 12 | US$ 8 |
| Imobiliária (multiusuário) | R$ 199 | US$ 35 | US$ 25 |
| Créditos avulsos | pacotes em BRL | pacotes em USD | pacotes em USD |

A interface mostra a moeda local; o agregador converte no momento da cobrança.

## 6. Localização além do pagamento

- **Idioma:** interface em espanhol neutro (evitar regionalismos fortes). PT-BR e ES são
  builds separados do mesmo app.
- **Export por portal:** presets de dimensão/proporção por portal de cada país (§2).
- **Disclosure legal:** texto de "imagem ilustrativa / decoração virtual" adaptado por país;
  no Brasil citar CRECI, nos outros o registro equivalente quando existir.
- **Estilos de decoração:** manter estilos regionais (o "varanda gourmet / churrasqueira"
  brasileiro não se traduz direto; México e Argentina têm padrões próprios).
- **Prova social:** depoimentos de corretor local por país — genérico "LatAm" converte mal.

## 7. Roteiro sugerido

| Fase | Mercado | Pré-requisito |
|---|---|---|
| 1 | **Brasil** | MVP no ar, Pix, qualidade e retenção validadas |
| 2 | **México** | build em espanhol pronto; Stripe (OXXO/SPEI); presets Inmuebles24/Lamudi |
| 3 | **Chile + Colômbia** | dLocal/EBANX integrado; presets Portal Inmobiliario / Fincaraíz |
| 4 | **Argentina** | créditos pré-pagos como padrão; MercadoPago; preço revisado por inflação |
| 5 | **Peru + Central América + resto** | export "genérico LatAm" via Properati/Lamudi |

Não abrir mercado novo antes de o anterior estar com retenção saudável (churn mensal
< 5-7%). Cada mercado adiciona suporte, presets e um meio de pagamento.

## 8. Decisões abertas

- [ ] dLocal x EBANX — pedir proposta comercial de cada, comparar fee e cobertura.
- [ ] Preço em USD fixo x USD ajustado por PPP por país (tabela do §5 é ponto de partida).
- [ ] Entidade jurídica: operar tudo pela PJ brasileira com repasse do agregador, ou abrir
      entidade no México na fase 2? (a Pedra opera tudo pela S.L. espanhola).
- [ ] Espanhol único x variações por país (custo de manutenção vs. conversão).
- [ ] Suporte: horário e idioma — chat em espanhol a partir de que fase?
