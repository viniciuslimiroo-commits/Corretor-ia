# Continuar o Encena daqui

Arquivo de passagem de bastão, escrito em 18/09/2026 pelo Claude (Claude Code) pra outra
ferramenta (Antigravity ou qualquer agente) continuar o trabalho, e pra o Claude retomar
depois. **Leia inteiro antes de mexer em qualquer coisa.**

> **Pra quem continuar:** responda sempre em **português do Brasil**. No fim de cada sessão,
> escreva o que fez na seção [Diário](#diário-de-quem-continuou) no fim deste arquivo e faça
> commit com mensagem clara. É por esse diário e pelo `git log` que o próximo retoma.

## 0. Como trabalhar sem risco (ler primeiro)

1. **Trabalhe no branch `antigravity`, nunca no `main`:**
   ```bash
   git switch -c antigravity     # na primeira vez; depois: git switch antigravity
   ```
   Push do branch `antigravity` só gera uma PRÉVIA na Vercel (endereço de teste), não mexe
   no site no ar. **Push no `main` publica o site: nunca faça.** Quem junta o branch no
   `main` é o Claude, quando voltar, depois de revisar e rodar os testes.
2. **Comece pelas tarefas bem definidas e de baixo risco:**
   - Tradução PT/ES/EN das telas que faltam (seção 8): o padrão está pronto em `web/src/i18n/`;
     uma tela por commit, conferida em 375px.
   - Os 6 erros de lint antigos (seção 8), um arquivo por commit, sem mudar comportamento.
   - Galeria: abas "Áudios" e "Materiais"; a corrida de estado do `mudarImovel`.
3. **A linha do tempo (P7, seção 6) é a parte mais delicada do projeto.** Só mexa nela
   seguindo a especificação à risca e rodando TODOS os testes da seção 3 (inclusive os de
   navegador) antes de dizer que ficou pronto. Na dúvida, deixe pro Claude.
4. Nunca diga "feito" sem ter rodado os testes. Se não conseguiu rodar, escreva isso no Diário.

---

## 1. O que é o Encena

SaaS brasileiro pra corretor de imóveis e imobiliária: **"O imóvel inteiro, pronto para
anunciar."** Fotos editadas por IA (mobiliar com 10 estilos, esvaziar, tirar objeto, trocar
piso/parede/céu, melhorar foto, converter em HD), vídeo do imóvel com editor, tour 360°,
planta baixa, terreno/lote, materiais (book, post, story, carrossel), com a marca do
corretor. Planos Pro, Equipe e Imobiliária; 5 fotos grátis sem cartão; 1 crédito = 1 foto
editada; vídeo, tour, planta e terreno não gastam crédito (só cena animada = 2 e narração
de IA = 1).

- **Produção:** https://corretor-ia-gilt.vercel.app (Vercel, time `limiro-brasil`, projeto
  `corretor-ia`). O `corretor-ia.vercel.app` (sem `-gilt`) é de outra pessoa.
- **Domínio registrado:** `encena.app.br` (DNS ainda não apontado: ver pendências).
  `encena.ai` NÃO está registrado.
- **Repositório:** https://github.com/viniciuslimiroo-commits/Corretor-ia
- **Marca:** índigo `#0F2D5B`, coral `#F06B4F`, pêssego `#FAD7C4`, teal `#2CB1A3`; fonte
  Geist; logo "E" branco com a barra do meio coral; nome escrito "Encena" + ".ai" discreto
  (`web/src/components/marca.tsx`). Kit do Instagram em `docs/marca/instagram/`.
- **Não é clone da Pedra.ai:** a Pedra é só referência interna de funcionalidade. Nunca
  copiar nome, logo, textos, paleta ou imagens dela.

## 2. Stack e pastas

- **Next.js 16.3.4 + React 19 + Tailwind 4 + TypeScript.** Esta versão do Next tem
  mudanças que não estão no seu treinamento: **leia a doc em `web/node_modules/next/dist/docs/`
  antes de usar qualquer API** (ex.: `searchParams` de página é Promise).
- **Supabase** (banco + auth + storage privado), **Stripe** (modo teste), **fal.ai** (modelos
  de imagem/vídeo/voz/transcrição), **ffmpeg** (montagem de vídeo roda DENTRO da Vercel).
- `web/src/app/` páginas e rotas de API · `web/src/lib/` regras (o coração: `video.ts`,
  `video-ffmpeg.ts`, `video-pipeline.ts`, `linha-do-tempo.ts`, `acoes.ts`, `cobranca.ts`) ·
  `web/src/components/editor/` o editor de vídeo e de materiais · `web/scripts/` testes e
  utilitários · `web/supabase/` migrations (`schema.sql` + `migration-02` a `-16`) ·
  `docs/` planos, testes reais, marca.
- `.claude/worktrees/` são cópias antigas de trabalho: **ignore**.

## 3. Rodar e testar

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

- `web/.env.local` já existe nesta máquina (não vai pro git). Variáveis: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
  `FAL_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_PRICE_ID`, `STRIPE_PRICE_PACOTE_ID`, `PEXELS_API_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_LOGIN_GOOGLE`, `ADMIN_EMAILS`, `CRON_SECRET`.
  **Nunca** escreva chave em arquivo versionado nem em mensagem. `github_token.txt` na raiz
  é segredo e está no `.gitignore`.
- **Testes em TypeScript:** de dentro de `web/`, `node --import ./scripts/ts-direto.mjs scripts/<nome>.ts`.
  Cada teste diz no cabeçalho o que confere. Os da linha do tempo:
  `testar-saneador-linha.ts`, `testar-linha-gestos.ts` (2000 sequências sorteadas),
  `testar-montagem-audio.ts`, `testar-audio-blocos.ts` (renderiza com ffmpeg, ~2 min),
  `testar-pedido-video.ts`, `testar-narracao-reaproveitada.ts`, `testar-previa-audio.ts`,
  `testar-historico.ts`, `testar-relogio.ts`.
- **Testes no navegador** (precisam do `npm run dev` na porta 3000; usam o Chrome instalado,
  sem Playwright): `node scripts/conferir-faixas-no-navegador.mjs` (32 conferências) e
  `node scripts/conferir-barra-no-navegador.mjs` (26). Bancadas de desenvolvimento (404 em
  produção): `/dev/linha-do-tempo`, `/dev/barra-da-selecao`, `/dev/previa-audio`.
- **Antes de commitar:** `npx tsc --noEmit -p .` e `npx eslint <arquivos>` sem erro.
- **Build:** `npx next build` (o `npm run build` baixa o ffmpeg de Linux, só serve na Vercel).
  **Pare o `npm run dev` antes de buildar:** os dois escrevem em `.next` e o build quebra.
- **Peso das funções da Vercel:** `rm -rf .next && npx next build && node scripts/medir-funcoes.mjs`.

## 4. Deploy — CUIDADO

- **`git push` no `main` PUBLICA EM PRODUÇÃO** (a Vercel está ligada ao GitHub). Push = deploy.
- Não dê push sem o Vinicius liberar.
- Pra ver se um push já publicou: `gh api repos/viniciuslimiroo-commits/Corretor-ia/commits/<sha>/status`.
- Nunca use `permanent: true` em redirect de endereço que pode voltar (o navegador guarda o
  308 pra sempre; já aconteceu com `/video`).

## 5. Estado em 18/09/2026

**No ar** (último publicado: `36be70f`): tudo até a linha do tempo P0, P1, P2 e P4
(áudio em trechos no servidor, prévia de áudio) — "escuros": o editor ainda não usa.

**Só no computador, NÃO publicados** (os 8 commits abaixo, em cima de `36be70f`, mais o
commit deste arquivo):

| Commit | O quê |
|---|---|
| `cc1ddb3` | P3: biblioteca pura da linha do tempo (`web/src/lib/linha-do-tempo.ts`) |
| `964cff3`, `192f015` | Carrosséis do Instagram na marca (`docs/marca/instagram/carrosseis/`) |
| `c2adc34` | P5: componente das faixas (`web/src/components/editor/faixas/`) |
| `f2072e4` | P6: histórico, barra da seleção, avisos, lista, legenda no palco |
| `8df8f45` | Funções de vídeo mais leves (criar 138→4 MB, montar 169→35 MB) |
| `20917e0`, `ec13c01` | `scripts/medir-funcoes.mjs` |

Nada disso muda o editor que as pessoas usam ainda (P5/P6 são peças novas, prontas pra
entrar no P7).

## 6. Onde parou: linha do tempo com faixas (estilo CapCut)

Pedido do Vinicius: **tudo que entra no vídeo aparece na linha do tempo lá embaixo pra
editar** (música, voz, Você, textos, adesivos, legendas, cenas), como nos editores de verdade.

- **Decisão (vale sobre tudo):** `docs/planos/linha-do-tempo-decisao.md` (opção D: textos e
  adesivos continuam PRESOS à foto; toque seleciona, arrastar só o selecionado).
- **Especificação completa:** `docs/planos/linha-do-tempo-spec.md` (em inglês; seções A-G).
- **Feito:** P0, P1, P2, P3, P4, P5, P6, **P7a e P7b** (branch `p7-faixas`, 19/09 -- ver
  diário). A linha velha (`linha-do-tempo.tsx`) foi apagada; o editor usa
  `faixas/linha-de-faixas.tsx`. Música é trecho (`audios`), aparece na faixa, corta e TOCA.
- **Falta — P7c** (em `web/src/components/editor/editor-video.tsx`, ~4000 linhas):
  - voz de IA reaproveitada sem cobrar de novo (`vozIaGuardada`) e cortada em trechos;
  - primeiro toque num texto do palco só seleciona (D9); `GaleriaTexto` com `indiceAlvo`;
  - conferir no dedo o modo "Trecho" (arrastar a música por dentro do bloco).
  - Critério de "pronto": conferido em **375px no celular** (spec F5) e no celular do Vinicius
    (a spec F7 fala em iPhone, mas o dele é um **Android, Samsung S25 FE**).

## 7. Pendências que dependem do Vinicius

1. ~~Liberar o push e provar o conserto das funções em produção~~ — **FEITO 18/09**: publicado
   (`88b959d`), e `web/scripts/conferir-video-producao.mjs` montou um vídeo no ar sem crédito
   (música −25 dB, adesivo no ponto solto, texto com a fonte, sem aviso), apagado no fim.
2. **Confirmar o @ do Instagram** usado nos carrosséis (`@encena.app` provisório): trocar em
   `docs/marca/instagram/carrosseis/gerar.py` (`MARCA["arroba"]`) e no `CLAUDE.md` da pasta.
3. **DNS do `encena.app.br`** no Registro.br: `A @ 216.198.79.1`, `A @ 64.29.17.1`,
   `CNAME www cname.vercel-dns.com`. Depois trocar `NEXT_PUBLIC_APP_URL`, URL no Supabase e
   webhook do Stripe (`docs/deploy-vercel.md`).
4. `RESEND_API_KEY` (e-mail), ativar Stripe em modo real, app do Google fora do modo teste.

## 8. Outras frentes pedidas (backlog, por prioridade)

- Tradução PT/ES/EN do resto do app (~400 frases; o mecanismo está em `web/src/i18n/`).
- CRM com WhatsApp: só estudo feito (`docs/planos/crm-whatsapp-regras.md`); construir COM as
  travas listadas lá.
- Galeria: abas "Áudios" e "Materiais"; `mudarImovel` tem a mesma corrida de estado que o
  favoritar já corrigido.
- Qualidade de IA: faixa de preço no "renovar" não segura (usar imagem de referência); obra
  no terreno varia enquadramento.
- Lint antigo: 6 erros `react-hooks` pré-existentes em `editor/material/[id]`, `materiais` e
  `imoveis/[id]` (não deixar crescer).

## 9. Regras do Vinicius (valem pra qualquer ferramenta)

- **Português do Brasil em tudo que escrever pra ele.** Ele já pediu mais de uma vez.
- **Autonomia:** não fique pedindo permissão pra seguir; feche a etapa, relate curto e comece
  a próxima. Mas **dinheiro, CPF, cartão, senha, Stripe, domínio e push/deploy são dele**.
- **Celular primeiro:** ele usa o celular (Android S25 FE). Toda tela nova conferida em
  **375px** antes de dizer "pronto". Recurso escondido no celular = recurso que não existe.
- **Teste sempre com foto REAL de imóvel** (`docs/testes-reais/`, `web/public/exemplos/`,
  `docs/pedra-teardown/fotos-teste/`). Nada de imagem gerada ou quadrado colorido.
- **Teste que escreve no banco dele devolve o que mexeu** (`scripts/emprestar-fotos.mjs`).
- **Não gastar crédito pago** (fal.ai: imagem, vídeo animado, voz) sem aval dele.
- Relatório curto e direto, sem jargão; decida e diga por quê, em vez de oferecer opções.

## 10. Armadilhas que já custaram caro

- **Fim de linha:** o git converte pra CRLF no Windows. Teste que lê código-fonte com regex
  tem que normalizar (`.replace(/\r\n/g, "\n")`).
- **Heredoc grande no terminal do Windows quebra calado:** escreva arquivo inteiro com a
  ferramenta de escrita, não com `cat <<EOF`.
- **ffmpeg:** dentro de um filtro, vírgula separa filtros → escapar `\,` em `min()`,
  `between()`; `drawtext` não quebra linha sozinho (usar `quebrarLinhas()`).
- **Lint do React Compiler:** sem ler `ref` no render, sem `setState` síncrono em efeito,
  sem mutar objeto que veio de `useState`. Estado mutável = objeto com métodos criado em
  `useState(() => criar())`.
- **Config de empacotamento não é prova:** meça o pacote (`medir-funcoes.mjs`). Inclusão
  `**` ganha da exclusão; `*` casa pasta inteira; `execFile(caminhoDinamico())` sem
  `/* turbopackIgnore: true */` faz o build rastrear o projeto todo.
- **Toque:** alvo fino encostado em botão perde o toque pro "ajuste de toque" do Chrome — dar
  um ouvinte de clique NATIVO (ver `faixas/regua.tsx`).
- **Teste de toque sintético que falha:** olhe o alvo real do evento antes de culpar o código
  (o selo "N" das ferramentas do Next no canto de baixo à esquerda come toque em dev).

## 11. Pra voltar pro Claude

Abra o Claude Code na pasta do projeto e diga: **"leia CONTINUAR-AQUI.md, o diário no fim
dele e o `git log` desde `ec13c01`, e continue"**. O Claude tem memória própria deste
projeto, e o diário diz o que mudou enquanto ele esteve fora.

---

## Diário de quem continuou

<!-- Uma entrada por sessão: data, ferramenta, o que fez (commits), o que ficou pela metade,
     o que descobriu. Mais nova em cima. -->

- **19/09/2026 — Claude Code (P7a + P7b, branch `p7-faixas`, NÃO publicado ainda):** pedido do
  Vinicius: "ao selecionar uma faixa de áudio, ela não é adicionada à linha do tempo" +
  "navegação instável; use programas parecidos de espelho" (CapCut).
  - `3fbf41e` regras puras do áudio (`lib/audio-do-editor.ts`, teste `testar-audio-do-editor`).
  - `feba677` música e voz viram trechos no estado do editor (pedido canônico: sem mexer, sai
    no formato antigo byte a byte; com corte, `versao: 2` + `audios`).
  - `915352d` a linha de faixas no lugar da velha: bloco de música, barra da seleção (no
    celular troca a navegação), desfazer/refazer, avisos com Desfazer, Play com som.
  - `bbd161f` atalhos S/Ctrl+B, setas (quadro; Shift = 1s), Home/End.
  - Provas: `scripts/conferir-editor-faixas.mjs` (375 e 1280px, conta outlook, foto real) e
    `conferir-palco-no-navegador.mjs` (menu da cena agora sai da linha nova); unitários da
    linha, áudio, prévia, montagem e CRM; `testar-ferramentas-linha` (ffmpeg, rodar SEM
    `timeout` -- o timeout mata o ffmpeg e parece erro); `next build` ok.
  - Depois de publicar: gerar um vídeo em produção com a música cortada (pedido v2).

- **18/09/2026 (noite) — Claude Code:** ramo `crm-painel` (sobre o `main` publicado): "Clientes" no menu principal; painel do cliente (cabeçalho com nome em destaque, próximo passo, caminho das etapas, histórico em linha do tempo, dados atrás de "Editar"); "Preparar envio" (imóvel → materiais como link público → mensagem com IA → abrir/copiar/compartilhar), com as travas do estudo jurídico. Testes: `testar-crm.ts`, `conferir-painel-cliente.mjs` (IA real, materiais reais), CRM antigos atualizados; limpeza só pelos clientes de teste (o dono já tem cliente real no CRM). `next build` passa. NÃO publicado.
- **18/09/2026 (fim da tarde) — Claude Code:** publicou o ramo `integracao` no `main` (`88b959d`, no ar ~1 min depois) e provou em produção com `conferir-video-producao.mjs`. Próximo: P7a/b/c.
- **18/09/2026 (tarde) — Claude Code:** revisou o trabalho do Antigravity e juntou tudo no ramo `integracao` (antigravity + crm + consertos). Consertos: arraste livre vale no vídeo final (antes só na prévia); "usar vídeo pronto na linha do tempo" escondido (a geração falhava); toque longo × edição, menu que passava da tela, áudio solto virando foto, soltar no fim, gravação em uso que não saía do vídeo, etiqueta com a cor do vídeo, regressão da seleção vinda da Galeria em Materiais. Testes: `testar-posicao-livre.ts` (vídeo real), `conferir-palco-no-navegador.mjs` (toque em 375px), testes do CRM. `next build` passa. Nada publicado. Próximo: P7a/b/c.
- **18/09/2026 — Antigravity (Arraste Livre no Palco, Design Elegante de Textos e Dropzone na Timeline):**
  - **Movimentação Livre de Textos e Elementos no Palco:**
    - Adicionadas coordenadas livres `x` e `y` (%) em `TextoCena` e `ElementoCena` em `web/src/lib/video.ts` com saneamento completo em `limparTextos` e `limparElementos`.
    - Suporte a clique e arraste livre para qualquer ponto do vídeo/foto usando Pointer Events no palco (`editor-video.tsx` e `elementos-no-palco.tsx`), tanto no desktop (mouse) quanto no celular (touch).
  - **Edição de Texto In-place Elegante e Fiel ao Design (Sem Laranja):**
    - Eliminado o fundo laranja `rgba(240,107,79,0.88)` e inputs destrutivos durante a edição de texto no palco.
    - Preservação de 100% da fonte, textura, acabamentos e efeitos SVG de `TextoComEfeito` com digitação e atualização em tempo real, sobreposta por interface dark blur refinada (`backdrop-blur-md` e bordas translúcidas elegantes).
    - Remoção de contornos laranjas estáticos na seleção de elementos, substituídos por contornos sutis de alto contraste (`outline-white/90`).
  - **Arrastar Arquivos e Vídeos Diretamente para a Timeline:**
    - Miniaturas da aba Vídeos tornadas arrastáveis (`draggable` com `text/encena-video`).
    - Dropzone na `LinhaDoTempo` aceitando arquivos externos do computador/SO (imagens e vídeos mp4/mov/jpg/png via `enviarArquivos`), vídeos já gerados e fotos da biblioteca de materiais.
  - Validações: `npx tsc --noEmit -p .` com 0 erros e `npx eslint` com 0 erros.
- **18/09/2026 — Antigravity (Edição Integrada / Editor de Vídeo intuitivo estilo CapCut):**
  - **Aba Vídeos integrada à Timeline:** Adicionado botão `+ Usar na timeline` em cada vídeo concluído/existente para inseri-lo como clipe na timeline e permitir edição/cortes diretamente, além de botão `Abrir projeto` para reabrir ajustes originais.
  - **Gravação de Voz como Mídia Reutilizável:** Criada seção "Minhas gravações de áudio" na aba de Legendas e Narração, permitindo ouvir, alternar áudio ativo na timeline com um clique (`+ Usar na timeline` / `✓ Ativo`) e excluir gravações.
  - **Menu de Contexto Completo (Botão Direito & Toque Longo 450ms):**
    - Suporte a menu de contexto na régua/blocos da `LinhaDoTempo`, no palco da cena e nos elementos.
    - Ações inteligentes contextuais: Dividir no cabeçote (`S`), Cortar início/fim no cabeçote, Copiar cena, Colar cena copiada, Duplicar cena, Silenciar/melhorar áudio de clipe, Ajustar velocidade (0.5x, 1x, 1.5x, 2x), Congelar quadro, Mover pra trás/frente, Girar 90°, Espelhar horizontalmente, Usar como capa, Inserir texto e Excluir cena.
    - Suporte a divisores estilizados e atalhos de teclado no componente `MenuContexto`.
    - Duplicação e reordenação de camadas (trazer pra frente / enviar pra trás) em `ElementosNoPalco`.
  - Commits:
    - `e579c18`: `menu-contexto.tsx` (divisores, atalhos, tema escuro)
    - `af9cb05`: `elementos-no-palco.tsx` (duplicação e camadas)
    - `bd9344b`: `linha-do-tempo.tsx` (aoMenuContexto na timeline)
    - `4322160`: `editor-video.tsx` (vídeos na timeline, gravações de voz e menu contextual)
  - Validações: `npx tsc --noEmit -p .` zerado (0 erros) e `npx eslint` zerado (0 erros).
- **18/09/2026 — Antigravity:** corrigiu os 6 erros de lint pré-existentes de `react-hooks` sem alterar comportamento em 3 commits separados no branch `antigravity`:
  - `fec0160` em `web/src/app/imoveis/[id]/page.tsx` (memoização/carregamento);
  - `c1a3132` em `web/src/app/editor/material/[id]/page.tsx` (lazy init do relatório e imutabilidade de `urls`);
  - `7abd495` em `web/src/app/materiais/page.tsx` (lazy init de URL/seleção, remoção de ref durante render e reset de progresso).
  Validações: `tsc --noEmit` e `eslint` zerados (0 erros, 0 avisos).
- **18/09/2026 — Claude Code:** escreveu este arquivo (commit 29b0eb5). Antes dele, o último commit de código foi `ec13c01`.
