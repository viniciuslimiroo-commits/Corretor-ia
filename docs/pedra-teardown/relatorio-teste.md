# Pedra.ai sob teste — relatório de product research

Teste funcional da Pedra (SaaS de fotos/vídeo/tours 360° com IA para imóveis), numa conta
Free/trial, para orientar o desenvolvimento de um concorrente brasileiro (SaaS de vídeos de
tour a partir de fotos, com IA, para corretores e imobiliárias).

Data: 08/09/2026 · Conta: Free Plan · 1 membro · Créditos no início: 0

Versão navegável publicada pelo agente: https://claude.ai/code/artifact/9479f660-04d1-40b2-af5c-feb27cc79240

## Achado central

A conta Free começa com **0 créditos** e sem histórico de créditos. Toda ferramenta de IA
que consome crédito (Mobiliar, Esvaziar, Renovar, Melhorar, Corrigir perspectiva, trocar
céu, renderização de planta) abre o painel normalmente e mostra o custo em créditos, mas ao
clicar em "Gerar imagem" o resultado é sempre o modal "Escolha o seu plano" — sem gerar
nada. A única exceção foi a **geração de vídeo**, coberta por uma promoção de "primeiro
vídeo grátis".

> Consequência prática: **não há benchmark real de tempo/qualidade de staging** neste teste.
> Todos os números de imagem abaixo são "bloqueado no trial".

## Tabela de resultados

| Ferramenta | Tempo (s) | Créditos | Qualidade 1–5 | Marca d'água? | Observações |
|---|---|---|---|---|---|
| Mobiliar (bloqueado) | — | 2 (não debitado) | N/A | — | Testado em sala vazia. Painel completo (nível, tipo de espaço, estilo, móveis); "Gerar imagem" dispara paywall antes de renderizar. |
| Esvaziar (bloqueado) | — | 2 (não debitado) | N/A | — | Sala bagunçada. Mesmo bloqueio. |
| Melhorar / auto-enhance (bloqueado) | — | 1 (não debitado) | N/A | — | Foto escura. Paywall ao gerar. |
| Trocar céu (bloqueado) | — | 1 (não debitado) | N/A | — | Fachada (céu nublado). Paywall ao gerar. |
| Renovar / reforma virtual (bloqueado) | — | 2 (não debitado) | N/A | — | Cozinha. Painel com nível (Alta/Média), tipo de espaço, estilo (Minimalista), móveis. Paywall idêntico. |
| **Criar vídeo (concluído)** | **~86s** | "Grátis" (promo) | **4/5** | Sim — "Made with 🐶 Pedra.ai" | 3 fotos do imóvel. Único teste concluído de ponta a ponta. Saída em horizontal e vertical. Transições fluidas; watermark fixo é o ponto fraco. |
| Renderização de planta (não testado) | — | 2 (tabela de preços) | N/A | — | Fora da prioridade 1–4; custo confirmado só na tela de planos. |

> Nota: os painéis de Mobiliar/Renovar mostraram **2 créditos**, mas a tela de planos
> lista "Decoração virtual" como **1 crédito**. Divergência a confirmar quando houver
> conta paga.

## Mapa da interface

**Menu principal:** Imóveis · Convidar membros · Tutoriais (abre pedra.ai/learn
externamente) · Configurações (Conta, Assinatura e créditos — *saldo de créditos fica
aqui*, Faturação, Branding, Redes sociais, API) · botão fixo "Atualizar para Pro".

**Dentro de um imóvel:** abas Fotos · Vídeo · Tour virtual 360° · Planta · +. Foto
selecionada abre painel direito: Editar com IA (Decorar: Renovar, Mobiliar, Esvaziar,
Remover objeto, Mudar piso, Mudar parede / Melhorar: Melhorar, Corrigir perspectiva,
Melhorar e corrigir, Converter em HD), Criar vídeo, Adicionar marca d'água/legenda,
Compartilhar, Baixar (com/sem marca d'água), Excluir.

**Painel de uma ferramenta (ex. Renovar):** 1) Nível de renovação (Alta/Média) → 2) Tipo
de espaço (Auto) → 3) Estilo (dropdown) → 4) Móveis (Auto/Com móveis/Vazio) → botão "Gerar
imagem" com custo em créditos. **Não há seleção de área/máscara em nenhum painel** —
geração é sempre na imagem inteira.

**Tutoriais (externo, pedra.ai/pt/learn):** 10 vídeos curtos em 5 blocos — Comece aqui (1),
Fotos (2), Vídeo (3), Visitas 360° (3), Plantas (1).

## Planos e preços

**Pro Anual — 239 €/ano** (4 meses grátis, ~20 €/mês vs 29 €) — 1.200 créditos/ano —
suporte prioritário — inclui "Pedra para telemóvel" (novo, só no anual).

**Pro Mensal — 29 €/mês** — 100 créditos/mês — suporte padrão.

Ambos incluem: Decoração virtual (1 crédito), Melhoria de fotos (1 crédito), Vídeos de
imóveis (ilimitado), Tours virtuais 360° (ilimitado), Automação de redes sociais
(ilimitado), Renderizações de planta (2 créditos), Integração API.

**Checkout:** Stripe, faturado por **Pedra Software S.L.** (entidade espanhola). Preços em
EUR; pagamento em BRL soma **~4% de câmbio**. Sem Pix nem boleto — só cartão internacional.
Tela cita "20.000+ agências" (Engel & Völkers, RE/MAX, Keller Williams, eXp). Contato do
fundador exposto na própria tela: felix@pedra.ai.

## Pontos fortes

1. **Fluxo completo por imóvel** — fotos, vídeo, tour 360° e planta no mesmo lugar,
   cobrindo as "seis peças de um anúncio completo" que a própria Pedra ensina.
2. **Vídeo automático rápido e configurável** — ~86s para 3 fotos, marca própria (cor,
   fonte, watermark) em Branding, publicação direta em Instagram/Facebook/YouTube.
3. **Onboarding didático e humano** — 10 tutoriais curtos por caso de uso, contato direto
   com o fundador (e-mail e chamada de 15 min) na tela de planos.
4. **Editor de IA bem categorizado** — Decorar vs. Melhorar, cada ferramenta com nível,
   tipo de espaço e estilo.
5. **Modelo de crédito único e previsível** — staging/esvaziar/renovar no mesmo tipo de
   crédito; vídeo, tour 360° e redes sociais ilimitados nos dois planos pagos.

## Lacunas (lente de concorrente brasileiro)

1. **Zero localização de pagamento** — EUR, +4% de câmbio, sem Pix/boleto, entidade
   espanhola no checkout.
2. **Sem WhatsApp nem portais nacionais** — o ícone de WhatsApp no app é só suporte;
   nenhuma integração com ZAP, VivaReal ou OLX.
3. **Trial que não deixa testar** — 0 créditos desde o cadastro bloqueiam quase todas as
   ferramentas de imagem antes de qualquer geração.
4. **Edição em caixa-preta** — sem seleção de área/máscara, sem prévia antes de gastar
   crédito; nível + estilo + um clique, sem ajuste fino por cômodo.
5. **Sem dado real de velocidade/qualidade de imagem** — como as gerações foram bloqueadas,
   não há benchmark de tempo/qualidade de staging para comparar — oportunidade de
   diferenciação por prova.

## Log de screenshots (capturados ao vivo durante o teste)

1. Menu principal (sidebar) — Imóveis, Convidar membros, Tutoriais, Configurações,
   "Atualizar para Pro".
2. Configurações → Assinatura e créditos — "Plan: Free", "Créditos restantes: 0".
3. Configurações → Branding — marca d'água, foto do profissional, cor da marca, fonte do
   vídeo.
4. Configurações → Redes sociais — Instagram/Facebook/YouTube "Não conectado"; TikTok "Em
   breve".
5. pedra.ai/pt/learn — 10 tutoriais em 5 categorias.
6. Imóvel de teste — aba Fotos com as 6 imagens do Pexels.
7. Painel "Editar com IA" aberto (Decorar / Melhorar).
8. Painel "Mobiliar" (sala vazia) — nível, tipo de espaço, estilo, móveis, 2 créditos.
9. Paywall ao gerar (Mobiliar) — modal "Escolha o seu plano".
10. Painel "Esvaziar" (sala bagunçada) — mesmo bloqueio.
11. Painel "Melhorar" (foto escura) — bloqueado.
12. Troca de céu (fachada) — bloqueado.
13. Aba Vídeo — configuração (3 fotos, trilha, locução, legendas, logo, orientação).
14. Vídeo gerado — ~86s, watermark "Made with 🐶 Pedra.ai", horizontal e vertical.
15. Painel "Renovar" (cozinha) — nível, tipo de espaço, estilo Minimalista, móveis, 2
    créditos.
16. Paywall ao gerar (Renovar).
17. Tela "Escolha o seu plano" — comparativo Pro Anual × Pro Mensal.

---

## O que ficou SEM resposta (rodar de novo com conta paga ou trial com créditos)

- Tempo e qualidade reais de: Mobiliar, Esvaziar, Renovar, Enhance, Troca de céu, Remoção
  de objeto, Remoção de marca d'água.
- Lista completa de estilos de decoração (dropdown não foi enumerado).
- Resolução de saída das imagens; quantas variações por geração; se dá para "travar" uma
  variação.
- Política de "geração ruim = crédito de volta".
- Fluxo de Tour 360° e Planta baixa (telas e opções).
- Fluxo de automação de redes sociais (o que gera, se agenda).
- Opções de export/download e se há preset por portal.
- Documentação da API (endpoints, auth, preço).
- Preço de pacote avulso de créditos e o que a opção "pausar assinatura" oferece.

*Teste conduzido numa conta Free/trial própria da Pedra.ai, sem inserir dados de pagamento
nem concluir assinatura.*
