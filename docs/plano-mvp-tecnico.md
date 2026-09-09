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
- **Fila:** nenhuma no MVP — chamada de IA é síncrona (~10s), não precisa de worker
  separado ainda. Adicionar BullMQ/Redis só se o volume exigir (fase 2+)

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

## Sprint 1 — Walking skeleton (3-5 dias) — 🟡 primeira versão pronta em 09/09/2026

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

**Critério de pronto:** você consegue subir uma foto sua e ver o resultado no navegador,
de ponta a ponta, sem rodar nada manualmente. **Falta só rodar `npm run dev` com a sua
`FAL_KEY` configurada pra testar.**

## Sprint 2 — As 5 ações do MVP + multi-provider (1 semana)

- [ ] Abstrair `ImageEditProvider` (interface) com 2 implementações: Nano Banana e Flux
      Kontext — o teste de pipeline já mostrou que cada um ganha em ações diferentes
- [ ] Implementar as 5 ações: Mobiliar, Esvaziar (→ Flux Kontext por padrão, dado o
      resultado do teste), Trocar céu, Melhorar, Remover objeto
- [ ] Fallback automático: se o resultado sair idêntico ao original (comparação simples
      de hash/diff) ou a chamada falhar, tentar o outro provedor antes de mostrar erro
- [ ] Etapa de upscale (Real-ESRGAN via Replicate/fal, ou serviço equivalente) — resolver
      o gap de resolução (1248×832 → mais perto de 4K) achado no teste
- [ ] Marca d'água configurável (aplicada só se `plano == grátis`)

## Sprint 3 — Créditos e billing (1 semana)

- [ ] Tabela `credit_ledger` funcionando: cada geração debita 1 crédito
- [ ] Trial: 5 créditos grátis no cadastro, **gerando de verdade** (diferencial vs. Pedra)
- [ ] Integração Stripe (cartão) — plano único no lançamento, ex. R$ 69/mês = 80 créditos
- [ ] Pix via Asaas ou Pagar.me — decidir entre os dois testando o onboarding de cada um
      (qual aprova CNPJ/CPF mais rápido, qual tem melhor doc de API)
- [ ] Política "geração ruim = crédito de volta" — versão simples no MVP: botão "reportar
      problema" que devolve o crédito manualmente (o classificador automático da Pedra é
      sofisticado demais pra copiar agora; fazer manual primeiro, automatizar depois)

## Sprint 4 — Export e vídeo (1 semana)

- [ ] Export por portal: presets de proporção/resolução pra ZAP, VivaReal, OLX,
      QuintoAndar — começar só com 2 (os mais usados) e expandir
- [ ] Vídeo simples: Ken Burns (zoom/pan) + música de fundo + FFmpeg, formatos 16:9 e
      9:16 no lançamento (adicionar 1:1/4:5 depois — é onde ganhamos da Pedra)
- [ ] Selo "imagem ilustrativa — decoração virtual" automático em toda imagem gerada

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
