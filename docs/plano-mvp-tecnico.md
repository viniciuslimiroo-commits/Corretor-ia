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

## Sprint 0 — Fundação (2-3 dias)

- [ ] `git init` no projeto, repositório no GitHub (privado)
- [ ] `npx create-next-app` (TypeScript, App Router, Tailwind)
- [ ] Projeto no Supabase: criar tabelas `users`, `properties`, `jobs`, `credit_ledger`
      (schema simplificado de arquitetura §5 — sem `organizations`/`org_members` ainda,
      isso é fase 2)
- [ ] Deploy inicial na Vercel (só a home, pra validar o pipeline de deploy cedo)
- [ ] Variáveis de ambiente: `FAL_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` etc.

## Sprint 1 — Walking skeleton (3-5 dias)

Objetivo: uma pessoa loga, sobe uma foto, escolhe "Mobiliar", vê o resultado. Sem
créditos, sem cobrança, sem export — só a mágica funcionando ponta a ponta.

- [ ] Tela de login (Supabase Auth, e-mail + Google)
- [ ] Tela de upload de 1 foto (Supabase Storage)
- [ ] 1 botão: "Mobiliar (estilo Moderno)" → chama fal.ai/nano-banana/edit com o prompt
      estruturado (já escrito e testado — reaproveitar de `pipeline-teste/testar-pipeline.ps1`)
- [ ] Mostrar resultado ao lado do original (antes/depois)
- [ ] Salvar o job no banco (`jobs`: input_url, output_url, status, custo_real)

**Critério de pronto:** você consegue subir uma foto sua e ver o resultado no navegador,
de ponta a ponta, sem rodar nada manualmente.

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
