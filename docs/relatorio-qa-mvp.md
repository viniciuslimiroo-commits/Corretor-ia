# Relatório de QA — MVP staging IA (`localhost:3000`)

**Data:** 09/09/2026 · **Ambiente:** Next.js dev (turbopack), Chrome
**Testado por:** Claude para Chrome · **Conta:** viniciuslimiroo@gmail.com

**Duas ressalvas sobre o setup:**

1. Não conseguiu alcançar `docs/pedra-teardown/fotos-teste/` (a sessão do Chrome não tem
   acesso a arquivos locais). Usou 4 fotos genéricas equivalentes: sala vazia, sala
   mobiliada, quarto escuro e fachada com céu nublado.
2. A sessão já estava logada quando começou o teste — **o login por magic link (Passo 1)
   não foi exercitado** nesta rodada.

---

## Resultado por ação

| Ação | Tempo (s) | Resolução final | Upscaled? | Modelo usado | Fallback? | Créditos debitaram? | Qualidade (1-5) |
|---|---|---|---|---|---|---|---|
| Mobiliar (Moderno) | ~62 | 4096×3184 | sim | `fal-ai/nano-banana/edit` | não | ❌ não | 5 |
| Esvaziar cômodo | ~38 | 4096×3040 | sim | `fal-ai/flux-pro/kontext` | não | ❌ não | 4 |
| Melhorar foto escura | ~44 | 4096×3184 | sim | `fal-ai/nano-banana/edit` | não | ❌ não | 2 |
| Trocar céu (pôr do sol) | ~70 | 4096×3184 | sim | `fal-ai/nano-banana/edit` | não | ❌ não | 5 |

Tempo médio ~51s. Todas entregaram 4096px no lado maior (upscale funcionando).

**Qualidade:** Mobiliar e Trocar céu excelentes. Esvaziar bom com ressalvas (abajur de pé
ficou, parede mudou de tom). **Melhorar foi o ponto fraco — clareou pouco.**

---

## Bugs encontrados e status

| # | Bug | Severidade | Status |
|---|---|---|---|
| 1 | Créditos nunca debitavam (RLS bloqueava o insert do navegador em `credit_ledger`, silenciosamente — o código não checava erro) | 🔴 crítico | **Corrigido 09/09** — débito passou pro servidor (`/api/gerar`), com verificação de token e saldo real antes de gerar. Fecha também a brecha de um cliente se dar crédito de graça via devtools. |
| 2 | URL da imagem resultado é pública e sem expiração (`fal.media/...`) — qualquer um com o link abre a foto do cliente | 🟠 importante | Backlog — precisa proxiar pelo nosso backend ou usar URL assinada com TTL. Não bloqueia uso interno/beta, mas bloqueia clientes reais. |
| 3 | "Melhorar foto escura" clareava muito pouco | 🟠 importante | **Corrigido 09/09** — prompt reforçado (pede explicitamente "2-3 stops" de exposição, remoção de ruído, resultado "bright, airy"). Re-testar. |
| 4 | Header quebra no mobile ("Sair" cola no e-mail) | 🟡 cosmético | **Corrigido 09/09** |
| 5 | ~19px de scroll horizontal no mobile depois do resultado aparecer | 🟡 cosmético | **Corrigido 09/09** (`min-w-0` nos containers de imagem) |
| 6 | Botão "✕ Remover" não limpava o `<input type=file>` — escolher a mesma foto de novo não fazia nada | 🟡 importante (UX) | **Corrigido 09/09** — reset via ref no input |
| 7 | Sem histórico (preview é só `blob:` local, some ao recarregar) | ℹ️ esperado no MVP | Backlog, não é bug |

## O que passou sem problema

- Botão "Gerar" desabilitado sem foto
- Preview lado a lado (desktop) / empilhado (mobile)
- Metadados (resolução · upscaled · modelo) corretos em toda geração
- Roteamento de modelo por ação certo (esvaziar → flux-kontext, resto → nano-banana)
- Nenhum erro real de console (só ruído de extensão do Chrome, `bis_skin_checked`)

---

## Pendências pra próxima rodada de QA

1. **Testar o Passo 1 (login/magic link) de verdade**, deslogado.
2. **Confirmar que os créditos debitam agora** (era o bug crítico, corrigido depois deste
   relatório).
3. **Testar "gerar sem crédito"** (Passo 6b) — só dá pra testar agora que o saldo desce.
4. Reavaliar a qualidade de "Melhorar" com o prompt novo.
5. Bug 2 (URL pública) segue em aberto — não é bloqueante pra continuar testando.
