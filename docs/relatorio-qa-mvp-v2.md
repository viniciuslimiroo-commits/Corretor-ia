# QA MVP staging de imóveis — rodada 2 (10/09/2026)

**Contexto:** teste manual de ponta a ponta, sessão logada por magic link. Foco: validar
as duas correções da rodada 1 (débito de crédito e prompt de "Melhorar"). 2 gerações
reais. Fotos genéricas (não as do kit `docs/pedra-teardown/fotos-teste/`).

**Resultado geral:** Mobiliar aprovado (9/10). Débito de crédito corrigia o número, mas
com falha de arquitetura séria (ver BUG-1). Melhorar reprovado com medição objetiva de
luminância (ver BUG-2). Console sem erro real da aplicação.

---

## 1. Débito de créditos — número certo, arquitetura errada

| Momento | Créditos |
|---|---|
| Início | 5 |
| Após 1ª geração (sem reload) | 4 |
| Após F5 | 4 |
| Após 2ª geração + F5 | 3 |

Debitava exatamente 1 por geração e persistia. **Mas** a extensão viu `POST
/rest/v1/credit_ledger` disparado **do navegador**, **depois** de `/api/gerar` já ter
respondido 200 — ou seja, o débito ainda dependia de uma chamada do cliente acontecer
depois da imagem já ter sido gerada (e paga no fal.ai).

**Risco real:** bloquear essa chamada (DevTools, extensão, perda de rede, fechar a aba)
gera imagem de graça — custo sem receita. Também não tinha proteção contra corrida
(duplo clique = debitar 2? não testado, mas a arquitetura não impedia).

**Correção aplicada no mesmo dia:** débito virou **atômico no Postgres**, rodado **antes**
de chamar a IA — não depois. Ver `web/supabase/migration-02-creditos-atomicos.sql`:
função `debitar_credito` (SECURITY DEFINER, só `service_role` executa) faz
`UPDATE...WHERE saldo>0 RETURNING` num único statement — o próprio Postgres serializa
contra corrida de duplo clique. Se a geração falhar nos dois provedores, `estornar_credito`
devolve o crédito. `users.creditos_saldo` vira a fonte da verdade (a UI lê direto de lá).

---

## 2. Mobiliar (estilo Moderno) — 9/10, aprovado

- Tempo: 47,6s. Saída 4096×3184, upscaled, `nano-banana/edit`.
- Mobília coerente, arquitetura 100% preservada, sombras corretas, sem artefatos.
- Observação de UX (não corrigida ainda): 47s sem barra de progresso é muito tempo sem
  feedback — considerar texto de etapas ("gerando... upscaling...") no Sprint 3.

## 3. Melhorar foto escura — 3/10, reprovado (com número)

Medição objetiva (luminância 0-255, foto reamostrada 400px):

| Métrica | Antes | Depois (prompt reforçado) | Meta |
|---|---|---|---|
| Luminância média | 37,7 | 38,8 (+3%) | 110-140 |
| % pixels sombra esmagada (<25) | 57,0% | 48,9% | baixo |
| % pixels estourados (>250) | 4,4% | 2,2% | baixo |
| RGB médio | 46/36/26 (dominante laranja) | 48/37/24 (inalterado) | R≈G≈B |

**Diagnóstico do QA:** o prompt melhorou *shadow lifting*, mas não mexe em exposição
global nem balanço de branco — é um problema de imagem, não de interpretação de texto.

**Correção aplicada no mesmo dia:** correção **determinística** (não depende do modelo de
IA) via `sharp`: gray-world white balance (corrige a dominante de cor) + esticar a
luminância média pra perto de 130 (a meta que o próprio QA definiu) + leve gamma pra
sombra. Roda **antes** do modelo — a IA só entra depois pra refinar ruído/detalhe, com
prompt ajustado pra isso (não pede mais pra IA "consertar a exposição").

**Pendente:** re-testar com número — a meta de aceite do QA é luminância saindo de ~38
para 110+ e |R-B| < 10.

## 4. Console

Sem erro real da aplicação — só ruído de extensão do Chrome (`bis_skin_checked`,
exceções vindas de `chrome-extension://`). Recomendação do QA: reconferir em janela
anônima antes de assumir bug.

## 5. Não coberto nesta rodada

Esvaziar, Trocar céu, login por magic link do zero, saldo zerado, upload inválido/HEIC.

---

## Ações derivadas (feitas no mesmo dia)

- [x] Débito atômico antes de gerar + estorno em falha (migration-02, rota reescrita)
- [x] `users.creditos_saldo` como fonte da verdade na UI
- [x] Correção determinística de exposição (sharp) antes da IA no "Melhorar"
- [ ] Rodar `migration-02-creditos-atomicos.sql` no Supabase (usuário)
- [ ] Re-testar: números de luminância do "Melhorar", débito com a nova arquitetura,
      duplo-clique, saldo zerado, Esvaziar, Trocar céu
- [ ] Backlog: barra de progresso/etapas durante a geração (47s parado incomoda)
