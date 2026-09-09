# Arquitetura técnica — SaaS BR de staging virtual para imóveis (referência: Pedra)

Documento vivo. Objetivo: definir o pipeline de IA, a stack, o modelo de custo por
imagem e as decisões de infraestrutura para o MVP.

---

## 0. Benchmark da Pedra (teste v2 real — conta Pro, 09/09/2026)

Fonte: [pedra-teardown/relatorio-teste-v2.md](pedra-teardown/relatorio-teste-v2.md).
Teste completo, 10 blocos, conta paga. **Vários pressupostos do teste v1 caíram.**

### O que MUDOU em relação ao que a gente achava

| Achávamos | Realidade (teste v2) |
|---|---|
| Pedra não tem seleção de área/máscara | **TEM.** "Posição → Desenhar" = pincel real com tamanho de traço e "Limpar desenho", no Mobiliar e no Remover objeto. |
| "Trocar só o piso / só a parede" seria nosso diferencial | Pedra tem **"Mudar piso"** (8 materiais, 1 crédito — resultado pixel-idêntico fora do piso) e **"Mudar parede"** (4 materiais, 1 crédito). Cirúrgico. |
| Consistência entre fotos seria nosso diferencial | Pedra tem **"Usar móveis de outra imagem"** (staging usando o mobiliário de uma foto de referência). |
| Trial dá 0 créditos (v1) | Site anuncia 7 créditos + 1 vídeo + 1 tour. Divergência não resolvida — a conta v1 pode ter sido A/B ou região. |

### Dados reais para calibrar o MVP

| Dado | Valor | Implicação |
|---|---|---|
| Resolução de saída | **4096 × 2732 px** | igualar; não entregar abaixo disso no pago |
| Marca d'água no Pro | **nenhuma** (imagem e vídeo confirmados) | "Made with Pedra.ai" só no conteúdo de demo pré-fabricado |
| Créditos — Mobiliar/Renovar | **Alta = 1, Média = 2** (inversão estranha) | nosso modelo: 1 crédito = 1 imagem, sem inversão |
| Créditos — Esvaziar, Melhorar, Corrigir perspectiva, HD, Mudar piso, Mudar parede, Remover objeto | **1 crédito** cada | |
| Créditos — Céu azul | **2 créditos** | |
| Vídeo | **"Tudo animado" = 5 créditos/cena**; "Tudo estático" = grátis | 4 fotos = 20 créditos, ~91 s, ~13 s de duração (4s/cena), efeito Ken Burns (não paralaxe 3D) |
| Vídeo — formatos | **só 16:9 e 9:16** (não tem 1:1) | oportunidade: oferecer 1:1 e 4:5 (feed Instagram) |
| Narração | **só PT**, 4 vozes, "Escrever com IA" p/ roteiro, "Gerar áudio" = 1 crédito | dá p/ usar voz própria |
| Latência (outliers) | Mudar parede 178 s, Remover objeto 159 s (e **falhou** — objeto não removido) | Pedra tem inconsistência de tempo e de qualidade |
| Preço Pedra | Pro Mensal 29 €/100 cr; Anual 239 €/1.200 cr; pacotes extras 0,26 → 0,14 €/cr | nosso alvo de crédito: **R$ 0,70–1,00** no plano |
| Pagamento | Stripe, entidade espanhola, EUR, sem Pix/boleto; interface **pt-PT** ("telemóvel", "Faturação", bug "octubro"), exemplos Lisboa/Barcelona | Pix + pt-BR de verdade + cidades/portais BR = vantagem real |
| Política "crédito de volta" | **existe e é sofisticada**: botão "Pedir crédito" → classificador de IA avalia (escreve justificativa em inglês, visível no histórico) → estorno automático | igualar: classificador de qualidade próprio, não estorno incondicional |
| Planta | editor 2D CAD **grátis** (medição automática, catálogo de móveis com dimensões) + "lê" esboço (1 cr) + humano desenha (19 €+IVA, 2-3 dias) | fase 3; a barra é alta |
| API | REST pública **+ servidor MCP oficial** (`pedra-ai/pedra-mcp`, "dentro de Claude/ChatGPT/Cursor") | Pedra já está no canal "IA assistente" |

Ainda **sem medição** de: tempo/qualidade de Mobiliar/Esvaziar/Renovar/Enhance individual
(só há notas subjetivas 4/5 e "excelente"); tour 360; efeitos de vídeo Transição e Mágico.

### Diferenciais que sobraram (ver plano/artifact §07)

Máscara e troca de superfície **não são mais wedge** — a Pedra tem. O que resta:
pt-BR real + R$/Pix/NF · export nativo por portal BR (ZAP/VivaReal/OLX/QuintoAndar) ·
WhatsApp como canal (Pedra é web+API+MCP) · preço em BRL mais baixo · formatos de vídeo
1:1 e 4:5 · estilos brasileiros · confiabilidade (Pedra falha em Remover objeto, tem bugs
de i18n e a inversão de preço Alta<Média).

---

## 0.1 Teste do nosso pipeline (fal.ai — 09/09/2026)

Fonte: [pipeline-teste/relatorio-pipeline.md](pipeline-teste/relatorio-pipeline.md).
Rodamos as mesmas 5 ações da Pedra nas mesmas fotos, via Nano Banana e Flux Kontext.
**Custo real: US$ 0,275** (7 chamadas).

- **6 de 7 saíram excelentes** — mobiliar (2 modelos), trocar piso, trocar céu, melhorar:
  arquitetura preservada, resultado fotorrealista, comparável ao que a Pedra entrega.
- **1 falhou:** Esvaziar com Nano Banana não removeu nada (imagem idêntica à original).
  **Flux Kontext resolveu o mesmo caso muito bem.**
- **Resolução ficou em 1248×832** vs. os 4096×2732 da Pedra — confirma que **upscale é
  etapa obrigatória** do pipeline (já estava orçado em §3), não opcional.

**Decisão: Abordagem B confirmada para o MVP**, com dois ajustes forçados pelo teste:
1. **Multi-provider desde o dia 1** — nenhum fornecedor sozinho cobriu as 5 ações com
   qualidade; escolher modelo por ação (ex.: Nano Banana p/ mobiliar/piso/céu/enhance,
   Flux Kontext p/ esvaziar/remoção de objeto), com fallback automático se o resultado
   sair idêntico ao original ou falhar.
2. Upscale sempre no pipeline, antes de entregar ao usuário.

---

## 1. Visão geral

O produto é, no núcleo, uma **fila de jobs de inferência de imagem** com:

- app web (upload, editor, galeria, billing)
- API de jobs (enfileira, processa, notifica)
- workers de GPU (ou API de terceiros) que rodam o pipeline de staging
- storage de imagens + CDN
- billing por crédito

```
[Browser / WhatsApp]
        │  upload foto + parâmetros (ambiente, estilo, ação)
        ▼
[API Next.js / Node]  ──►  [Fila (Redis/SQS)]  ──►  [Worker de inferência]
        │                                                   │
        │                                                   ├─ pré-processo (resize, EXIF, auto-orient)
        │                                                   ├─ segmentação + máscara
        │                                                   ├─ mapa de profundidade + bordas
        │                                                   ├─ geração (inpaint / image-edit)
        │                                                   ├─ upscale / restauração
        │                                                   └─ marca d'água + disclosure
        ▼                                                   ▼
[Postgres: jobs, créditos]                        [S3/R2 + CDN: resultados]
        │
        └──►  webhook / websocket ──►  UI atualiza, debita crédito
```

## 2. O pipeline de staging (o que faz a Pedra "preservar as paredes")

Duas famílias de abordagem. Recomendação: **começar pela B (API de image-edit)** pela
velocidade de MVP, e migrar partes críticas para A quando volume justificar.

### Abordagem A — pipeline próprio (ComfyUI / diffusers em GPU)

1. **Pré-processamento** — auto-orient por EXIF, resize para ~1024–1536px no lado maior,
   correção de perspectiva opcional.
2. **Segmentação** — Grounding DINO (detecção por texto: "sofá", "cama", "mesa") + SAM 2
   para máscara pixel-a-pixel. Gera a região a preencher (esvaziar) ou a região livre
   (mobiliar).
3. **Geometria** — Depth Anything V2 (mapa de profundidade) + Canny (bordas). Alimentam
   dois ControlNets (depth + edge) que **travam paredes, janelas, portas e molduras**.
4. **Geração** — modelo de difusão (SDXL ou Flux) + ControlNet de inpainting, guiado pela
   máscara e pelo prompt de estilo. Para "esvaziar": inpaint sobre os móveis reconstruindo
   piso/parede. Para "mobiliar": inpaint na área vazia inserindo mobília.
5. **Pós** — upscale 2x (Real-ESRGAN / modelo de restauração), harmonização de cor/sombra,
   correção de artefatos.
6. **Entrega** — marca d'água (plano grátis), selo "imagem ilustrativa – decoração virtual",
   metadados.

Prós: controle total, custo marginal baixo em escala, sem depender de política de terceiros.
Contras: precisa de GPU (A10/L4/A100), MLOps, tempo de engenharia grande.

### Abordagem B — API de image-edit (recomendada para o MVP)

Usar um modelo de edição de imagem por instrução que já respeita razoavelmente a estrutura:

- **Gemini 2.5 Flash Image ("Nano Banana")** — ~US$ 0,039/imagem. Bom em manter layout,
  rápido, aceita imagem de referência + instrução. (Modelo base se aposenta em 02/10/2026 —
  planejar migração para o sucessor / Nano Banana Pro.)
- **Flux.1 Kontext [pro]** — US$ 0,04/imagem; **[max]** US$ 0,08. Forte em edição
  contextual preservando o resto da cena.
- **Nano Banana Pro (Gemini 3 Pro Image)** — ~US$ 0,13/imagem (1–2K), ~US$ 0,24 (4K). Usar
  só para alto padrão / saída premium.

Fluxo B mínimo:

1. Pré-processo (resize, orient).
2. Prompt estruturado: `"Mobilie este {ambiente} vazio no estilo {estilo}. Mantenha
   EXATAMENTE as paredes, janelas, portas, piso e iluminação. Não altere a arquitetura.
   Adicione apenas móveis e decoração fotorrealistas em escala correta."`
3. (Recomendado, não opcional) enviar também máscara/segmentação como imagem auxiliar —
   habilita edição por região (trocar só o piso, só um móvel). **Paridade com a Pedra**,
   que tem pincel manual ("Desenhar") + ferramentas dedicadas "Mudar piso"/"Mudar parede".
   Rodar SAM 2 no navegador ou num worker leve e passar a máscara na chamada.
4. 1 chamada = 1–3 variações.
5. Pós: upscale opcional, marca d'água, disclosure.

Prós: MVP em semanas, sem GPU, custo previsível.
Contras: custo por imagem 5–20x maior que pipeline próprio em escala; sujeito a preço e
política do fornecedor; menos controle fino (ex: "trocar só o piso").

### Ferramentas por ação

| Ação | Abordagem B (MVP) | Abordagem A (escala) |
|---|---|---|
| Mobiliar vazio | image-edit + prompt de estilo | inpaint + ControlNet depth/edge |
| Esvaziar | image-edit "remova todos os móveis" | SAM mask + inpaint |
| Reforma interior | image-edit por instrução | inpaint segmentado por superfície |
| Reforma fachada | image-edit | idem + céu |
| Auto-enhance | modelo de restauração (GFPGAN/CodeFormer) ou filtro clássico | idem |
| Troca de céu | segmentação de céu + composição | idem |
| Remoção de objeto | LaMa / inpaint | LaMa |
| Upscale | Real-ESRGAN / Topaz API | Real-ESRGAN local |
| Vídeo a partir de fotos | Ken Burns/parallax + FFmpeg + TTS | idem; image-to-video (Kling/LTX) no tier pago |
| Locução PT-BR | TTS (ElevenLabs / Azure / OpenAI) | idem |

## 3. Modelo de custo por imagem (MVP, abordagem B)

Premissas por geração de staging (1 imagem final, 2 variações internas):

| Item | Custo |
|---|---|
| 2x chamadas image-edit (Nano Banana ~US$ 0,039) | US$ 0,078 |
| Upscale (API ou GPU serverless) | US$ 0,01 |
| Storage + CDN + egress (amortizado) | US$ 0,003 |
| Compute da API/worker (amortizado) | US$ 0,004 |
| **Custo total por imagem entregue** | **≈ US$ 0,095  (~R$ 0,52)** |

Com câmbio R$ 5,50 e margem alvo:

- Preço sugerido do crédito ao cliente: **R$ 0,70–1,00** (plano) a **R$ 1,50** (avulso).
- Margem bruta por imagem: **~50–75%** no MVP; sobe para **>90%** ao migrar staging de
  alto volume para pipeline próprio (custo marginal cai para ~US$ 0,01–0,02/imagem em GPU
  L4 serverless).
- Vídeo/tour "ilimitado": só é sustentável se o custo real for baixo — Ken Burns + FFmpeg
  em worker CPU custa centavos; TTS é o maior item (limitar minutos ou cachear vozes).

Regra de ouro: **geração ruim = crédito de volta + regenera de graça.** Orçar ~10–15% de
retrabalho no custo. (A Pedra faz isso segundo a doc deles; não confirmado no teste v1.)

## 4. Stack sugerida (MVP)

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Next.js (App Router) + React + Tailwind | editor web, SSR para SEO programático |
| Editor de imagem | Canvas / Konva.js (crop, máscara, comparador antes/depois) | leve, sem backend |
| Backend API | Next.js API routes ou NestJS | mesma linguagem, deploy simples |
| Fila | Upstash Redis + BullMQ (ou AWS SQS) | jobs assíncronos, retry |
| Workers | Serverless GPU sob demanda: Replicate / fal.ai / Modal / RunPod | zero GPU parada; paga por segundo |
| Banco | Postgres (Supabase / Neon) | jobs, usuários, créditos, imobiliárias |
| Auth | Supabase Auth / Clerk / Auth.js | login social + e-mail |
| Storage | Cloudflare R2 ou AWS S3 + CDN | egress barato (R2) |
| Billing | Stripe (cartão) + **Asaas ou Pagar.me (PIX + boleto + recorrência)** | PIX é essencial no BR |
| Transacional | Resend / Postmark (e-mail) + WhatsApp Cloud API | notificação de job pronto |
| Observabilidade | Sentry + PostHog | erros + funil de conversão |
| Infra | Vercel (app) + fornecedor de GPU serverless | escala sem ops |

## 5. Modelo de dados (essencial)

- `users` (id, nome, email, creci?, plano, creditos_saldo)
- `organizations` (imobiliária: id, nome, logo_url, cor, creditos_saldo)
- `org_members` (user_id, org_id, papel: admin/corretor)
- `properties` (imóvel: id, org_id, endereço, portal_refs)
- `jobs` (id, user_id, org_id, property_id, tipo, status, input_url, params_json,
  output_urls[], creditos_cobrados, custo_real, criado_em, concluido_em)
- `credit_ledger` (id, org_id/user_id, delta, motivo: compra/consumo/estorno/plano, job_id)
- `assets` (id, job_id, url, tipo, com_marca_dagua)
- `subscriptions` (gateway, status, plano, renova_em, pausado_ate)

## 6. Decisões abertas

- [x] Abordagem A vs B para o lançamento → **B, confirmada pelo teste de pipeline (§0.1)**.
- [ ] Fornecedor de GPU serverless (Replicate x fal.ai x Modal) — testar latência e preço.
- [ ] Gateway BR: Asaas x Pagar.me x Stripe+PIX beta.
- [ ] Resolução máxima de saída no plano base (2K? 4K só no premium?).
- [ ] Política de retenção de imagens e treino (declarar "não treinamos IA com suas fotos").
- [ ] Marca d'água: sempre no grátis; nunca no pago; disclosure "decoração virtual"
      configurável (alguns portais/CRECI exigem).

## 7. Riscos técnicos

- **Preço/descontinuação de modelo de terceiros** (Nano Banana base sai 10/2026). Abstrair
  o fornecedor atrás de uma interface `ImageEditProvider`.
- **Qualidade inconsistente** em cômodos difíceis (muito espelho, pé-direito duplo, foto
  ruim). Ter fallback e mensagem clara.
- **Custo de vídeo/tour "ilimitado"** virar prejuízo — instrumentar custo real por job
  desde o dia 1 (`jobs.custo_real`).
- **LGPD** — foto de imóvel pode ter pessoas/dados. Termo de uso + expurgo + região de
  dados no Brasil se possível.

---

## Relacionado

- [pedra-teardown/relatorio-teste.md](pedra-teardown/relatorio-teste.md) — teste v1 da Pedra
- [pedra-teardown/prompt-teste-completo-v2.md](pedra-teardown/prompt-teste-completo-v2.md) — teste v2 (conta paga)
- [expansao-america-latina.md](expansao-america-latina.md) — billing e roteiro LatAm

## Fontes técnicas

- Pipeline de staging (Grounding DINO + SAM + Depth Anything + ControlNet):
  https://github.com/mithunparab/virtual-staging ·
  https://www.superteams.ai/blog/ai-virtual-staging-with-comfyui-instantly-transform-empty-rooms-into-stunning-spaces/
- Preço Nano Banana / Gemini 2.5 Flash Image: https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-image
- Preço Flux Kontext: https://www.together.ai/models/flux-1-kontext-pro
