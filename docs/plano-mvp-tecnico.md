# Plano técnico do MVP — passo a passo

Documento vivo. Objetivo: quebrar a Fase 1 do roadmap (staging + enhance + export +
vídeo + billing) em passos concretos, na ordem certa de construir. Referências:
[arquitetura-tecnica.md](arquitetura-tecnica.md) (stack e pipeline) e
[pipeline-teste/relatorio-pipeline.md](pipeline-teste/relatorio-pipeline.md) (decisão de
fornecedor já validada — fal.ai, multi-provider).

## Princípio: walking skeleton primeiro

Erro clássico de MVP: construir auth + billing + banco de dados bonitinho antes de saber
se a geração de imagem funciona ponta a ponta. Ordem certa é o oposto — **primeiro um
fio fino conectando tudo (upload → IA → resultado na tela), depois engordar cada parte.**
Isso já foi validado: sabemos que o pipeline funciona (7 chamadas reais no teste), só
falta empacotar em produto.

## Stack (já decidida, ver arquitetura §4)

- **Frontend/API:** Next.js (App Router) — um só projeto, deploy na Vercel
- **Banco + Auth + Storage:** **Supabase** — resolve os três de uma vez, ideal pra
  founder solo (Postgres gerenciado, auth com e-mail/social, storage de imagens com CDN)
- **IA:** fal.ai — já testado e funcionando. Nano Banana como padrão; Flux Kontext como
  fallback/alternativa por ação (achado do teste de pipeline)
- **Billing:** Stripe (cartão) + Asaas ou Pagar.me (Pix) — decidir em Sprint 3
- **Fila:** ~~nenhuma no MVP — chamada de IA é síncrona (~10s), não precisa de worker
  separado~~ **Premissa errada, corrigida em 11/09/2026.** Medido em teste real:
  "remover objeto" 99,9s e "mobiliar" 38,2s, com upscale. Não é 10s, é 4 a 10 vezes
  isso — e função serverless na Vercel corta em 10s por padrão (60s no teto do Hobby),
  então segurar a requisição significava funcionar local e morrer no deploy.
  **A fila já existe e é do fal** (`queue.fal.run`), não precisou de BullMQ nem Redis:
  `/api/gerar` despacha e responde, `/api/job/[id]` avança uma etapa por chamada.
  Worker próprio continua sendo fase 2+, e agora por volume de verdade, não por duração.

## Sprint 0 — Fundação (2-3 dias) — ✅ feito em 09/09/2026

- [x] `git init` no projeto (`git`, `node`, `npm` instalados; repo local com primeiro commit)
- [x] `npx create-next-app` em `web/` (TypeScript, App Router, Tailwind, ESLint)
- [ ] Repositório remoto no GitHub (privado) — pendente, precisa da sua conta
- [ ] Projeto no Supabase: criar tabelas `users`, `properties`, `jobs`, `credit_ledger`
      (schema simplificado de arquitetura §5 — sem `organizations`/`org_members` ainda,
      isso é fase 2) — pendente, precisa da sua conta
- [ ] Deploy inicial na Vercel — pendente, precisa da sua conta
- [x] `web/.env.local.example` criado — falta você copiar o valor da `FAL_KEY` de
      `docs/pipeline-teste/fal_key.txt` pra `web/.env.local` (real, gitignorado)

## Sprint 1 — Walking skeleton (3-5 dias) — ✅ validado de ponta a ponta em 09/09/2026

Objetivo: uma pessoa sobe uma foto, escolhe uma ação, vê o resultado. Sem login, sem
créditos, sem banco ainda — só a mágica funcionando ponta a ponta.

- [x] Tela de upload de 1 foto + seletor de ação (`web/src/app/page.tsx`)
- [x] Rota de API que chama a IA de verdade — Mobiliar e Melhorar via Nano Banana,
      Esvaziar via Flux Kontext (`web/src/app/api/gerar/route.ts`) — a escolha de
      provedor por ação já reflete o achado do teste de pipeline
- [x] Mostrar resultado ao lado do original (antes/depois) na mesma tela
- [x] Build validado (`npm run build` passa sem erro)
- [x] Tela de login (Supabase Auth, magic link por e-mail) — `web/src/app/login/page.tsx`
- [x] Salvar o job no banco + debitar 1 crédito no `credit_ledger` a cada geração
- [x] Saldo de créditos exibido na tela, gerar bloqueado em 0 créditos
- [x] Trial de 5 créditos automático no cadastro (trigger SQL)

**Critério de pronto: batido.** Testado pelo usuário em 09/09/2026 — login por magic link,
crédito debitado (5→4), upload, geração via Nano Banana ("Mobiliar" estilo Moderno),
resultado exibido, job + ledger salvos no Supabase. Sprint 1 fechado.

## Sprint 2 — As 5 ações do MVP + multi-provider — ✅ as 5 ações fechadas em 11/09/2026

- [x] Provedor por ação com fallback: cada ação define [primário, secundário]; se o
      primário der erro (rede/4xx/5xx), tenta o secundário antes de devolver erro pro
      usuário (`web/src/app/api/gerar/route.ts`)
- [x] 4 de 5 ações: Mobiliar, Esvaziar (Flux Kontext primário, confirmado pelo teste),
      Melhorar, Trocar céu
- [x] **Remover objeto** — feito em 11/09/2026. O que faltava era a seleção de área, e
      ela agora existe: `web/src/components/editor-mascara.tsx`, dois canvas sobrepostos
      no tamanho natural da foto (um vermelho translúcido pro usuário ver, um
      branco-sobre-preto que é a máscara de verdade). Pincel proporcional à largura da
      foto, desfazer e limpar, `touch-action: none` pra pintar no celular sem rolar a
      página. Provedores: `fal-ai/object-removal/mask` com fallback
      `fal-ai/flux-pro/v1/erase` — os dois documentam branco 255 = apaga.
      O servidor "queima" a orientação EXIF antes de mandar (foto de celular em pé vinha
      com a máscara 90° fora do lugar).
      **Verificado no navegador**, sem gastar crédito: pincelada de teste devolveu PNG
      1600×1067 (= resolução natural da foto), 3,25% de pixels brancos, caixa
      698,512→1291,710, batendo com onde o traço foi feito.
- [x] Etapa de upscale (`fal-ai/clarity-upscaler`, alvo ~4096px de largura) — roda depois
      da geração; se falhar, entrega o resultado sem upscale em vez de dar erro
- [x] Fallback por "resultado idêntico ao original" — feito em 11/09/2026
      (`web/src/lib/comparar.ts`). Se o modelo devolve praticamente a foto de entrada,
      troca de provedor; se os dois fizerem isso, estorna o crédito e explica o motivo
      em vez de entregar a foto do próprio usuário de volta.
      **Limiar calibrado nos seus 7 testes de pipeline, não chutado:** o defeito
      conhecido (esvaziar via Nano Banana) mede 7,00 de diferença média por pixel, e a
      MENOR mudança legítima medida é 16,35 — o corte ficou em 11, no meio do vão.
      Vale só pra `mobiliar` e `esvaziar`, que transformam a cena inteira. Fica de fora
      em `remover_objeto` (mudança local, exigiria comparar só dentro da máscara, e isso
      não tem calibração), em `melhorar` (parecer com a entrada é o comportamento certo
      ali) e em `trocar_ceu` (numa fachada com pouco céu a mudança legítima é pequena).
- [ ] Marca d'água configurável (aplicada só se `plano == grátis`)

### QA rodado em 09/09/2026 — [relatorio-qa-mvp.md](relatorio-qa-mvp.md)

- [x] **Bug crítico corrigido:** créditos nunca debitavam (RLS bloqueava insert do
      navegador, código não checava erro). Débito moveu pro servidor, verificado por
      token + saldo real (`web/src/lib/supabase-server.ts`). Fecha também um jeito de
      dar crédito de graça pra si mesmo via devtools.
- [x] Bug corrigido: botão "Remover" não limpava o `<input type=file>`
- [x] Prompt de "Melhorar" reforçado (QA deu nota 2/5 — clareava pouco)
- [x] 2 ajustes de CSS mobile (header quebrando, scroll horizontal)
- [ ] **Pendente:** `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` + reiniciar o servidor dev
- [x] **Resolvido em 11/09/2026** (era "backlog, não bloqueante": URL do resultado
      pública/sem expiração, link direto pro `fal.media`). O servidor agora baixa o
      resultado, carimba o selo e guarda em bucket **privado** do Supabase Storage; o
      navegador só recebe URL assinada de 1 hora. A URL do `fal.media` não chega no
      cliente nem é gravada no banco, e a migration 03 apaga as que já estavam gravadas.
      Virou bloqueante na hora em que a próxima pessoa a subir foto seria um corretor
      com foto de casa de cliente, não eu com foto de banco de imagens.
- [x] **Brecha de SSRF fechada junto:** `/api/exportar` recebia uma `url` do navegador e
      dava `fetch` nela — o cliente escolhia qual endereço o servidor ia buscar. Agora
      recebe `jobId`, confere que o job é de quem pediu (`eq("user_id")`, porque o
      service role ignora RLS) e lê do storage.
- [ ] Re-rodar QA: login por magic link (não testado nesta rodada), débito de crédito
      funcionando, "gerar sem crédito", qualidade nova do "Melhorar"

### ✅ Migration 03 aplicada em 11/09/2026

`web/supabase/migration-03-storage-e-selo.sql` rodou no projeto **Corretor-ia**
(org Limiro Brasil, `szqcnhrnhlgujwvmqzmg`, AWS sa-east-1). Conferido depois de rodar:
bucket `resultados` existe com `public = false`, colunas `output_path` e `selo` criadas
em `jobs`, e as 14 URLs de `fal.media` que estavam gravadas foram zeradas.

Caminho de storage testado com as mesmas chamadas que `/api/gerar` e `/api/exportar`
fazem (upload, URL assinada, download, remoção): tudo ok, e o download **sem** assinatura
volta 400, que é a prova de que o bucket é privado de verdade e não só no nome.

**Consequência nova de capacidade:** o resultado agora ocupa espaço nosso, não do
fornecedor. Um resultado de 4096px com selo pesa ~1 MB, então o 1 GB do plano free do
Supabase dá pra cerca de 1.000 imagens. Antes de abrir pra vários corretores, decidir
entre limpar resultado antigo por rotina ou subir de plano.

### ✅ Geração assíncrona (11/09/2026) — desbloqueio de deploy

Achado no teste ponta a ponta: a geração segurava a requisição HTTP por até 99,9s. Isso
não é lentidão, é impedimento de deploy — a Vercel corta função serverless em 10s por
padrão no Hobby. O app funcionava na minha máquina e morreria em produção, que é o pior
tipo de defeito porque só aparece depois de publicar.

Corrigido trocando `fal.run` (síncrono) por `queue.fal.run` (fila do próprio fal):

- `POST /api/gerar` — valida, cobra o crédito, sobe foto e máscara pro storage privado,
  despacha pra fila e responde com o `jobId`. **2,33s medidos.**
- `GET /api/job/[id]` — avança no máximo uma etapa por chamada (geração → upscale →
  carimbo e guarda). A tela pergunta de 2,5 em 2,5s e mostra em que pé está.
- `migration-04-fila-assincrona.sql` — coluna `pipeline` (jsonb) guarda o estado da
  máquina de etapas, e um índice parcial pra achar job preso mais tarde.

**Medição depois da mudança** (mesma foto, mesma ação, `remover_objeto` com upscale):

| | antes | depois |
|---|---|---|
| tempo total até a imagem | 99,9s | 99,6s |
| **requisição mais longa** | **99,9s** | **6,13s** |

O tempo total é o mesmo, como tinha que ser: o trabalho é o mesmo. O que mudou é que
ninguém mais segura uma requisição enquanto isso. Passa com folga no teto do plano
gratuito, e as rotas declaram `maxDuration = 60` como margem.

Efeitos colaterais bons: a entrada agora vive no storage durante o job, então o fallback
entre provedores voltou a ser possível (antes os bytes morriam com a requisição), e a
chamada ao fal deixou de carregar megabytes de base64. As entradas são apagadas quando o
job conclui.

**Verificado na tela, não só na API:** logado de verdade, foto escolhida, pincelada na
área, o botão passou por "Gerando..." e "Aumentando a resolução..." antes de entregar a
imagem de 4096×2728 com o selo e os dois botões de export. Crédito debitado de 2 para 1.

### ⚠️ Custo por geração: a premissa estava 9x errada (11/09/2026)

A coluna `jobs.custo_real` existia desde o Sprint 0 e nunca tinha sido preenchida. Ao
preencher, o número apareceu: **US$ 0,3482 por geração**, medido pela variação do saldo
do fal em 4 gerações reais. O plano trabalhava com ~US$ 0,04 de IA mais ~US$ 0,01 de
upscale. Quase 7 vezes a premissa.

**O gasto não estava na inteligência, estava na resolução.** O `clarity-upscaler` cobra
US$ 0,03 por megapixel de saída (preço publicado na página do modelo). Subir pra 4096px
de largura gera 11,2 megapixels: ~US$ 0,34 só de upscale, contra ~US$ 0,04 do modelo de
IA que ele estava "polindo". Pagávamos oito vezes mais pelo acabamento do que pela obra.

E o pior: **esses pixels nunca chegavam ao anúncio.** Os presets de export reduzem pra
3840 ou 1920. Estávamos comprando megapixel caro pro próprio app jogar fora no passo
seguinte.

Alvo do upscale baixou de 4096 para **2048** (`web/src/lib/custo.ts`). Medido depois:

| | antes (4096) | depois (2048) |
|---|---|---|
| custo por geração | US$ 0,3482 | **US$ 0,0398** |
| tempo total | ~99s | **35s** |
| 80 créditos (1 assinatura/mês) | US$ 27,86 | **US$ 3,18** |

Redução de 89% no custo, e de quebra ficou 3x mais rápido. Qualidade conferida a olho na
imagem de 2048×1360: continua nítida e publicável — o modelo de IA entrega ~1248px de
qualquer forma, então 4096 era ampliação inventada, não detalhe real.

A partir de agora **todo job grava `custo_real`**, medido pela diferença de saldo do fal
entre o despacho e a conclusão. Ressalva registrada no código: com gerações simultâneas
essa medição se contamina; no volume de hoje é exata, e quando houver concorrência de
verdade vira conferência do relatório de uso do fal.

## Sprint 3 — Créditos e billing (1 semana)

- [ ] Tabela `credit_ledger` funcionando: cada geração debita 1 crédito
- [x] Trial: 5 créditos grátis no cadastro, **gerando de verdade** (diferencial vs. Pedra)
      — trigger SQL desde o Sprint 0; débito atômico desde a correção do QA v2
- [x] Integração Stripe (cartão) — **feita e testada em 11/09/2026.** Produto "Corretor IA
      Pro" e preço de R$ 69/mês criados na conta de teste, com `creditos_por_ciclo=80` no
      metadata do preço (a fonte da verdade fica na Stripe, muda sem deploy).
      - `POST /api/assinar` cria o customer, grava `stripe_customer_id` ANTES do redirect
        (a Stripe não garante ordem de eventos), e devolve o Checkout hospedado. Quem já
        assina recebe o portal de cobrança, onde troca cartão ou cancela sozinho.
      - `POST /api/stripe/webhook` é o único lugar que credita. Três defesas: assinatura
        verificada no corpo cru; idempotência por id de evento (tabela `stripe_eventos`,
        chave primária); e resolução do usuário pelo customer, não pela ordem dos eventos.
        `invoice.paid` credita (primeira cobrança e cada renovação); cancelamento volta pra
        `gratis` sem tirar crédito já pago.
      - `migration-05-stripe.sql`: `adicionar_creditos` (irmã atômica da
        `debitar_credito`), colunas de vínculo e status, tabela de eventos.
      - **Testado com eventos REAIS**: assinatura de teste criada pela API com o token
        `pm_card_visa`, os 12 eventos que a Stripe gerou foram buscados e replicados no
        webhook local assinados com o segredo local. Crédito 0 → 80, plano pro, renovação
        gravada; o mesmo `invoice.paid` replicado de novo não creditou; assinatura falsa
        levou 400; cancelamento real voltou pra grátis mantendo os 80 créditos.
      - **Pendente pra produção:** registrar a URL pública do webhook no dashboard da
        Stripe (precisa do deploy) e trocar `STRIPE_WEBHOOK_SECRET` pelo `whsec_` real.
        O de hoje no `.env.local` é local, só serve pro teste sintético.
      **Agora essa conta fecha, mas quase não fechava — ver a seção de custo abaixo.**
      Com o custo medido hoje (US$ 0,0398/crédito), 80 créditos custam US$ 3,18, uns
      R$ 17 dos R$ 69. Com o custo de ontem (US$ 0,3482), custavam US$ 27,86, uns R$ 150:
      o plano vendia por menos da metade do próprio custo de produção.
- [ ] **Sem isso, o app trava em 0 créditos e não dá pra testar mais nada** — é o próximo
      bloqueio real (saldo zerou em 10/09 depois das rodadas de QA)
- [ ] ~~Pix via Asaas ou Pagar.me~~ **Pix sai da lista de lançamento (11/09/2026).**
      Conferido no painel da conta: a Stripe libera Pix pra conta brasileira **só por
      convite**, e Pix Automático (recorrente) não existe no Brasil. Uma leitura anterior
      minha da doc pública dizia o contrário; o painel é a fonte que vale. Lançamento
      fica com cartão (assinatura e pacote avulso); Boleto e Google Pay podem ser ligados
      no painel. Se Pix voltar a ser prioridade, é uma mudança isolada — um provedor a
      mais (Mercado Pago, Asaas, Pagar.me, ou a própria Stripe se liberar) restrito ao
      pacote avulso, porque Pix é pagamento único. A assinatura fica na Stripe como está.
      O pacote avulso existe de qualquer forma:
      R$ 69 uma vez, 80 créditos, sem renovação. Combina com corretor que foge de
      cobrança recorrente no cartão.
      - Produto "Pacote de 80 créditos" criado na Stripe; `POST /api/assinar` com
        `{modo:"pacote"}` abre checkout de pagamento único; o webhook credita em
        `checkout.session.completed` (cartão, já vem pago) ou
        `checkout.session.async_payment_succeeded` (forma assíncrona, como boleto, paga
        depois), sempre pelo critério `payment_status == "paid"`, com guarda por id de
        sessão no ledger além da guarda por id de evento.
      - O checkout do pacote não fixa formas de pagamento: mostra o que estiver ligado no
        painel. Hoje, cartão. Boleto e Google Pay podem ser ligados lá sem mudar código.
      - Testado: sessão real criada (R$ 69, brl, mode=payment); eventos de sessão paga
        SINTÉTICOS (o único teste do dia sem evento real, porque pagar exige alguém
        digitar cartão) — cartão creditou, mesma sessão de novo não creditou, pagamento
        assíncrono pendente não creditou e confirmado creditou.
- [x] Política "geração ruim = crédito de volta" — **feita em 11/09/2026**, versão manual
      como o plano pediu. Link "Ficou ruim? Reportar e recuperar o crédito" embaixo do
      resultado; `POST /api/job/[id]/reportar` devolve 1 crédito. Dois freios: um estorno
      por geração (UPDATE atômico com `WHERE reportado_em IS NULL`) e no máximo 3 estornos
      automáticos por usuário em 24h — do 4º em diante o reporte fica registrado pra
      análise, sem crédito automático. Testado: 3 estornos, 4º e 5º registrados sem
      estorno, repetir a mesma geração devolve 409. `migration-06-reportar-problema.sql`.

## Sprint 4 — Export e vídeo (1 semana) — 🟡 export começado em 10/09/2026

- [x] Export por portal: `web/src/app/api/exportar/route.ts` — 2 presets, specs
      pesquisadas (não inventadas): **ZAP · VivaReal · OLX** (mesma integração "ZAP+",
      260-3840×350-2160px, fonte ajuda.zapmais.com) e **genérico/Full HD** (QuintoAndar
      não publica spec de pixels — usar com ressalva). `fit:inside` + `withoutEnlargement`
      — nunca corta o cômodo, nunca amplia além do original. Testado localmente (3 casos
      de tamanho, incluindo downscale de imagem 5000×3200).
- [ ] Ainda falta: botão de download testado no app de verdade (só testei a lógica de
      resize isolada); presets adicionais se algum portal publicar spec própria depois.
- [ ] Vídeo simples: Ken Burns (zoom/pan) + música de fundo + FFmpeg, formatos 16:9 e
      9:16 no lançamento (adicionar 1:1/4:5 depois — é onde ganhamos da Pedra)
- [x] Selo "imagem ilustrativa" automático — feito em 11/09/2026
      (`web/src/lib/selo.ts`). Queimado no pixel antes de guardar, então sai junto no
      download e no export do portal; não dá pra pegar a versão sem aviso.
      **O texto muda por ação** ("mobília virtual", "céu substituído digitalmente",
      "objeto removido digitalmente"...), porque aviso genérico em cima de alteração
      específica é aviso errado. **"Melhorar" não leva selo de propósito:** essa ação só
      corrige exposição, balanço de branco e ruído, não inventa nem remove nada — é o
      mesmo que revelar a foto direito. Carimbar ela sujaria uma foto honesta e
      ensinaria o comprador a ignorar o selo justamente nas fotos em que ele importa.
      Verificado por medição (`web/scripts/testar-selo.mjs`): o teste não pergunta "mudou
      alguma coisa", pergunta se existe **pixel claro dentro da caixa** — porque o risco
      real era o librsvg não achar fonte no sistema e desenhar a caixa preta sem texto
      nenhum, que passa batido em revisão. Também confirmado que o selo sobrevive legível
      ao downscale dos dois presets de export (3840 e 1920).

## Sprint 5 — Polimento e lançamento fechado (1 semana)

- [ ] Termos de uso + política de privacidade (LGPD: "não treinamos IA com suas fotos")
- [ ] Onboarding: 3 telas, primeira geração guiada
- [ ] Convidar as pessoas do roteiro de entrevistas que topearam beta
- [ ] Sentry (erros) + PostHog (funil) — mínimo de observabilidade antes de abrir pra
      gente de fora

---

## Depois do MVP (não fazer agora)

Painel de imobiliária multiusuário, bot de WhatsApp completo, automação de Instagram,
tour 360°, planta baixa, API pública — tudo isso é fase 2/3 do roadmap. Resistir à
tentação de adiantar.

## Primeira ação concreta, hoje

`git init`, criar o projeto Next.js, e criar a conta no Supabase. É o Sprint 0 completo
em menos de uma tarde — depois disso já dá pra atacar o walking skeleton.
