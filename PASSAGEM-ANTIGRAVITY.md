# Passagem para o Antigravity — 20/09/2026

Quem continua daqui: leia **este arquivo inteiro** e depois `CONTINUAR-AQUI.md` (estado do
projeto, armadilhas e diário).

**Tudo o que foi feito nos últimos dias já está NESTA pasta**, no branch `antigravity`, que
em 20/09 foi adiantado para o mesmo ponto do `editor-2026` (32 commits, avanço direto, sem
mesclagem). Trabalhe aqui, normalmente:

```bash
git branch --show-current    # antigravity
git log --oneline -12        # o que entrou desde 19/09
cd web && npm run dev
```

A pasta `.claude/worktrees/revisao-ag` é a cópia de trabalho antiga, no branch
`editor-2026`, apontando para o mesmo commit. **Não precisa dela** — se atrapalhar, ignore.

## 1. Onde o projeto está

| | |
|---|---|
| Produção (o que está no ar) | branch `main`, commit `46bde3f` — **publicado em 20/09/2026** com aprovação do dono |
| Onde está o trabalho novo | branch `antigravity` (esta pasta), alinhado com o `main` |
| Link de teste (atualiza a cada push no branch) | https://corretor-ia-git-editor-2026-limiro-brasil.vercel.app |
| Site oficial | corretor-ia-gilt.vercel.app |

**Publicado em produção (commit `46bde3f`):**

1. **Revisão completa do editor de vídeo** (visual novo, vídeo entra na linha do tempo, Play sem travar).
2. **Preços novos sincronizados na Stripe**: pacotes 20/R$ 29, 60/R$ 79, 150/R$ 179; Pro com selo "Preço de lançamento"; Termos corrigidos.
3. **Som da prévia consertado** (áudio aquecido no 1º toque, suporte a credentials).
4. **Página inicial refeita** em 11 seções, nos 3 idiomas, com fotos reais.
5. **A estrutura do imóvel não muda** — regra nova da IA, em `web/src/lib/preservar.ts`.
6. **Casa pronta contemporânea**: sobrado de esquina reformado e integrado à vitrine inicial.

## 2. As regras do dono (valem para qualquer ferramenta)

- **Responder sempre em português do Brasil.** Ele já cobrou três vezes.
- **`git push` no `main` PUBLICA em produção.** Só com o "sim" dele. Push no branch `editor-2026` é seguro: só atualiza o link de teste.
- **Não gastar crédito de IA sem autorização.** A conta de teste (`limiro.cardoso@outlook.com`, equipe "Limiro Imoveis") está com **0 crédito**. Repor crédito é decisão dele.
- **A ESTRUTURA DO IMÓVEL NÃO MUDA** (regra de 20/09): a IA não cria, remove nem modifica janela, porta, parede, cômodo, telhado, piscina, muro ou terreno — só quando a pessoa pedir. Está implementada em `web/src/lib/preservar.ts` e ligada nas quatro portas que falam com o modelo (`api/gerar`, `api/terreno/ia`, `api/planta/humanizar`, `api/job/[id]`). **Toda ferramenta nova de imagem tem que passar por `comEstruturaPreservada()`** — `scripts/testar-preservacao.ts` falha se alguém esquecer.
- **Nunca usar imagem com marca d'água de terceiro** na página (foi por isso que a série da obra ficou de fora).
- **Nenhum imóvel de cliente na página pública** — as capturas do produto foram feitas com fotos licenciadas.
- Teste que escreve no banco dele **devolve o que mexeu**, e apaga só pelo id do que criou.
- Dinheiro, CPF, cartão, Stripe e domínio são decisões dele.

## 3. O que está pendente, em ordem

### 3.1 A casa dele — CONCLUÍDO (20/09/2026)
A foto do sobrado de esquina foi processada com a nova regra de preservação, aprovada na versão de reforma contemporânea e integrada ao comparador da página inicial nos 3 idiomas (`landing.ex.casa`).

### 3.2 Publicar — CONCLUÍDO (20/09/2026)
Publicado em produção no commit `46bde3f` (`git checkout main && git merge antigravity && git push origin main`).
- `stripe-sincronizar-precos.ts --aplicar`: 9 ofertas sincronizadas na Stripe.
- `conferir-checkout-pacotes.mjs`: checagem em produção 100% verde (20/R$ 29, 60/R$ 79, 150/R$ 179).
- `conferir-video-clipes.mjs`: renderização de vídeo e clipes em produção 100% verde.

### 3.3 Decisões que estão com ele
- Repor crédito na conta de teste (0 hoje). Dá para comprar um pacote na própria tela de planos em modo teste, cartão `4242 4242 4242 4242`.
- Ligar a troca de plano no portal da Stripe (hoje quem quer sair do mensal pro anual precisa cancelar e assinar de novo).
- Abrir o CRM (pronto, mas fechado para quem não está em `ADMIN_EMAILS`).
- Vídeo posto na linha do tempo entra **mudo** (a montagem não mixa o áudio do clipe): se ele quiser o som, é trabalho novo no ffmpeg.
- A série da obra (fundação → casa pronta) na página inicial: precisa de uma foto de lote licenciada e 4 créditos.

### 3.4 Backlog antigo
`CONTINUAR-AQUI.md` seção 8 e a memória do projeto: P7c (voz de IA reaproveitada, 1º toque no texto), DNS `encena.app.br`, Resend, idioma do app inteiro em ES/EN.

## 4. Como rodar e testar

```bash
cd web
npm run dev -- -p 3002            # servidor de desenvolvimento
npx tsc --noEmit -p .             # tipos (apague .next/dev antes se o build reclamar de routes.d.ts)
npx next build                    # build de produção
```

Testes que valem a pena rodar depois de mexer:
```bash
node --import ./scripts/ts-direto.mjs scripts/testar-preservacao.ts     # a regra da estrutura
node --import ./scripts/ts-direto.mjs scripts/testar-planos.ts          # preços e margens
node --import ./scripts/ts-direto.mjs scripts/testar-previa-audio.ts    # som da prévia
BASE=http://localhost:3002 node scripts/conferir-som-do-play.mjs        # sai som no 1º Play
BASE=http://localhost:3002 node scripts/conferir-editor-faixas.mjs      # linha do tempo
```

## 5. Armadilhas que já custaram tempo

- O `grep`/`sed` do Git Bash no Windows **escondem o `\r`**: "não achei \r" não prova que o arquivo é LF. Pergunte ao Python.
- Heredoc grande e string escapada em camadas quebram calado: script de edição vai para arquivo e roda de lá.
- `.next/dev/types/routes.d.ts` fica truncado se o servidor for parado no meio — `rm -rf .next/dev` antes do build.
- Mensagem de commit escrita da memória mente: confira cada item contra o `git diff --cached`.
- Teste que desliga a condição real do navegador (`--autoplay-policy=no-user-gesture-required`) esconde defeito: foi assim que o "Play mudo" passou semanas verde.
