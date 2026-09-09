# Relatório — teste do nosso pipeline (fal.ai)

**Data:** 09/09/2026 · **Custo real:** US$ 0,275 (7 chamadas + 1 retry) · **Fonte:**
`docs/pipeline-teste/resultados/` e `resultados.csv`

Pergunta que este teste responde: **dá para chegar perto da qualidade da Pedra com uma
API de terceiro, sem GPU própria?**

## Resultado por teste

| # | Ação | Modelo | Tempo | Resultado |
|---|---|---|---|---|
| 1 | Mobiliar | Nano Banana | 10,8s | **Muito bom.** Arquitetura (janela, porta de vidro, teto, paredes) preservada perfeitamente. Móveis realistas, escala correta, sombras coerentes. |
| 2 | Mobiliar | Flux Kontext | 12,8s | **Muito bom**, estilo diferente (mais clássico/cinza). Mesma precisão arquitetônica. |
| 3 | Esvaziar | Nano Banana | 9,7s | **FALHOU.** Não removeu nada — imagem saiu idêntica à original (sofá, tapete, orquídea, tudo intacto). |
| 4 | Esvaziar | Flux Kontext | 11,2s | **Muito bom.** Sofá e tapete removidos, piso e parede reconstruídos de forma natural. |
| 5 | Trocar piso (cozinha) | Nano Banana | 9,6s | **Excelente.** Piso virou concreto polido; armários, luminária pendente, mesa, eletrodomésticos, escultura — tudo pixel-próximo do original. Bate com o teste "Mudar piso" da Pedra, que foi o resultado mais impressionante do teardown deles. |
| 6 | Trocar céu (fachada) | Nano Banana | 8,8s | **Excelente.** Céu de pôr do sol dramático, fachada/gramado/calçada preservados. |
| 7 | Melhorar (foto escura) | Nano Banana | 8,6s | **Excelente.** Exposição e balanço de branco corrigidos, sem artefatos, resultado natural. |

## Achado principal

**A qualidade está lá — mas nenhum modelo sozinho ganha em tudo.** Nano Banana foi ótimo em
4 de 5 testes (mobiliar, piso, céu, melhorar) e **falhou completamente** em esvaziar. Flux
Kontext resolveu exatamente o caso que o Nano Banana não resolveu.

Isso **confirma** a decisão já registrada na arquitetura (§2, abordagem B): abstrair o
provedor atrás de uma interface `ImageEditProvider` e escolher o modelo **por ação**, não
um só para tudo — ex.: Nano Banana para mobiliar/piso/céu/enhance, Flux Kontext para
esvaziar/remoção de objeto. Provavelmente vale testar ambos em cada ação antes de decidir
o padrão de produção, e ter fallback automático (se um falhar/sair idêntico ao original,
tentar o outro antes de cobrar o crédito do usuário).

## O que ficou abaixo do padrão da Pedra

**Resolução: 1248×832 px.** A Pedra entrega 4096×2732 — quase 11x mais pixels. Isso *não*
invalida a abordagem (a etapa de upscale já estava no pipeline planejado, §3 da
arquitetura), mas confirma que **upscale é obrigatório, não opcional**, antes de entregar
qualquer imagem ao usuário. Custo de upscale já estava orçado (~US$0,01/imagem).

## Conclusão para a decisão de arquitetura

**Abordagem B (API de terceiro) se sustenta para o MVP.** Com 6 de 7 ações testadas
saindo excelentes (usando o modelo certo por ação) e custo de ~US$0,04/imagem, o pipeline
planejado é viável. Os dois ajustes que este teste força:

1. **Multi-provider desde o dia 1**, não "trocar depois" — a falha do esvaziar mostra que
   um único fornecedor não cobre todas as ações com qualidade.
2. **Upscale é etapa obrigatória do pipeline**, sempre, para chegar perto da resolução da
   Pedra.

Decisões abertas em `docs/arquitetura-tecnica.md § 6` podem ser fechadas: Abordagem B,
confirmada.
