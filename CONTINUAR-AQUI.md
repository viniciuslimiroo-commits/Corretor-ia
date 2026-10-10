# Continuar o Encena daqui

> **Chegando agora, 28/09/2026?** O trabalho voltou para o Claude Code, na pasta de sempre.
> Trabalhe no branch **`trabalho`** (era `antigravity`; renomeado em 28/09). Tudo até
> `0c01c8e` **já está publicado** — `main` e produção estão no mesmo ponto, não há nada
> represado. `PASSAGEM-ANTIGRAVITY.md` virou histórico: as regras do dono (seção 2) e as
> armadilhas (seção 5) continuam valendo, mas o "onde está o projeto" e o link de teste
> daquele arquivo estão vencidos. O estado de hoje é o [Diário](#diário-de-quem-continuou),
> no fim deste arquivo.

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
  `node scripts/conferir-barra-no-navegador.mjs` (26). Bancadas de desenvolvimento:
  `/dev/linha-do-tempo`, `/dev/barra-da-selecao`, `/dev/previa-audio`.
- **Bancada nova entra em `/dev/<nome>` e já nasce fechada:** quem dá 404 em produção é o
  `notFound()` de `src/app/dev/layout.tsx`, que vale pra toda rota abaixo dele -- as páginas
  NÃO têm trava própria, de propósito. Prova no ar: `node scripts/conferir-bancadas-fechadas.mjs`
  (sem `BASE`, bate no site publicado; com `BASE=http://localhost:3000`, num `next start`).
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
- **Feito e no ar:** P0, P1, P2, P3, P4, P5, P6, **P7a e P7b** (publicado 19/09 -- ver
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
  tem que normalizar (`.replace(/\r\n/g, "\n")`). E o `grep`/`sed` do Git Bash leem em
  modo texto e escondem o `\r`: "grep não achou \r" não prova que o arquivo é LF.
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

- **10/10/2026 — Claude Code (o Supabase estava pausado; e o "Editar", resolvido de verdade):**
  - **O projeto Supabase estava PAUSADO** (`INACTIVE`). Projeto gratuito dorme por
    inatividade, e **pausado também perde o DNS** — o host dava NXDOMAIN, o login não
    funcionava por nenhum método, e tudo atrás de login estava fora do ar. Religado pelo MCP
    (`INACTIVE` → `COMING_UP` → `RESTORING` → `ACTIVE_HEALTHY`, uns 4 min). **Nada se
    perdeu:** 6 usuários, 4 imóveis, 104 fotos, 26 vídeos, 1 cliente no CRM. Conferido com
    `conferir-marca-dagua-na-tela.mjs` contra produção (22/22, com login e escrita reais).
    - **Isso volta a acontecer.** Projeto gratuito pausa a cada poucos dias sem uso, e cada
      pausa derruba o site inteiro. Decisão do dono: subir o plano, ou religar quando
      acontecer (agora são 3 min, com o MCP conectado).
    - **Armadilha:** eu li NXDOMAIN como "apagado" e falei em perda de dados. Pausado perde
      o DNS do mesmo jeito. A medição estava certa; a causa inferida dela, não.
  - **`088b8b3` — o "Editar" do cartão de vídeo. O botão NUNCA esteve quebrado.**
    Olhando o vídeo do print direto no banco (92e16958): status concluído, espec com 10
    cenas, os 10 jobs existem, mp4 e miniatura no storage, `precisaDoEditor()` false —
    **todas as guardas de `editarVideo` passam**. A função funcionava; as cenas entravam no
    formulário. O que não acontecia era o CARTÃO FECHAR: ele é derivado de duas origens
    (`resultadoAberto ?? geracao.pronto`), e `setResultado(null)` apaga só a primeira. Em
    vídeo recém-gerado o cartão vem da segunda. `gerar` e `retomarVideo` já limpavam as
    duas; só `editarVideo` esquecia. Daí ser intermitente: abrindo da lista, fechava normal.
    - Prova: `scripts/testar-fechar-cartao-do-video.ts` — teste de FONTE (a interação de
      estado do React não cabe em teste de unidade), com **controle negativo** que remove a
      linha e confirma que a regra reprova.
    - **Fiquei 11 dias esperando uma mensagem de erro que nunca ia aparecer**, porque eu
      tinha decidido que era falha da chamada. O que destravou foi o MCP do Supabase: três
      consultas mostraram o dado íntegro e derrubaram todas as hipóteses de uma vez.
  - **`e0e2084`** corrige um achado FALSO meu de 29/09 (ver a entrada daquele dia): as
    bancadas `/dev` sempre tiveram trava.

- **30/09/2026 — Claude Code (publicação da marca d'água e do logo na foto):**
  - **PUBLICADO** com o "sim" dele: `6b78aa9` → `af37055` no `main`. Seis commits: o motor e
    a tela da marca d'água, o logo na foto achável, o `.gitattributes`, a normalização do
    `video.ts` e os dois roteiros de conferência no navegador.
  - **Conferido EM PRODUÇÃO**, não só localmente: `conferir-marca-dagua-na-tela.mjs` (22/22)
    e `conferir-aviso-do-logo.mjs` (11/11) com `BASE=https://corretor-ia-gilt.vercel.app`.
    Os dois sobem logo de teste e apagam; a conta voltou sem logo nas duas vezes.
  - **Armadilha (custou 7 minutos):** pra saber se o deploy tinha subido, montei um laço
    comparando o `buildId` do HTML. Esta versão do Next serve por `/_next/static/immutable/`
    e **não expõe `buildId`** — então eu comparei string vazia com string vazia 40 vezes, e
    o laço respondeu "ainda a anterior" 40 vezes. **Um laço de espera que só sabe dizer
    "ainda não" nunca diz "quebrei"**: as duas situações produzem a mesma saída. O deploy
    estava no ar desde o começo. O jeito certo é o que a seção 4 já manda: rodar o
    `conferir-*` contra `BASE=produção` — ele falha por motivo legível.

- **29/09/2026 — Claude Code (publicação, conserto do "Editar" e marca d'água no vídeo, branch `trabalho`):**
  - **PUBLICADO** com o "sim" dele: `0c01c8e` → `6b78aa9` no `main`. A Vercel levou ~1 min.
    Conferido no ar: logo lê "Encena", a string "Encena.ai" não existe mais no HTML, e as
    9 fotos de exemplo respondem 200.
  - **`6b78aa9`** — o "Editar" do cartão de vídeo pronto parecia não fazer nada. O botão
    funcionava: `editarVideo()` falhava e chamava `setErro`, mas o aviso é desenhado no
    **topo da página** e o cartão fica bem abaixo. O caminho de sucesso já rolava pro topo;
    o de falha, não. Agora rola junto, e a mensagem separa as três causas (recusa do
    servidor com código HTTP, vídeo não concluído, vídeo sem espec) em vez de cair todas
    num texto genérico — e um 500 do Next, que vem em HTML, não estoura mais no
    `rr.json()`. **A causa de a chamada falhar continua desconhecida**; isto conserta a
    invisibilidade, não a falha.
  - **`dee09e0`** — `src/lib/video.ts` estava gravado NO GIT com `\r\r\n` (CR duplicado) em
    1600 lugares, efeito de `core.autocrlf=true` sem `.gitattributes`. Único arquivo assim
    em 381 versionados; a convenção do repositório é LF puro. Normalizado em commit
    separado, provado que só o fim de linha mudou (mesmas 1766 linhas). **Era isso que
    impedia ferramenta de edição por casamento de texto de funcionar neste arquivo.**
  - **`7c7b865`** — **MARCA D'ÁGUA**: o logo por cima do vídeo INTEIRO, pedido dele. O logo
    já ia na capa montada e na tela final — as duas pontas —, então quem corta o começo e o
    fim ficava com o imóvel sem nada do corretor. Escolhas: canto, tamanho (10/16/24% da
    largura) e transparência (piso 0,15). O espec guarda só a decisão; o arquivo vem de
    `marcaEfetiva()` na montagem, então trocar de logo não invalida vídeo antigo. Entrada
    com `-loop 1` e sobreposição **depois** do apresentador. `precisaDoEditor()` passou a
    reconhecer a marca — sem isso, reabrir na página rápida e gerar de novo a apagaria
    calado.
  - **Provas:** `scripts/testar-marca-dagua.ts` — **28 conferências com render de verdade**
    no ffmpeg, sem rede e sem crédito. A marca está no começo, **no meio** e no fim; o
    tamanho medido bate (3477 px contra ~3364 esperados); o canto escolhido muda o
    resultado; com opacidade 0,35 a cor média dá 171/82 contra 172/83 da conta teórica.
    `tsc --noEmit` e `eslint` zerados.
  - **Armadilha nova:** teste que roda ffmpeg **não pode ter `await` no topo do arquivo** —
    somado ao `require` dinâmico de `caminhoFfmpeg()`, o Node recusa por formato ambíguo.
    O jeito do projeto é o de `testar-audio-blocos.ts`: `import ffmpegStatic` e
    `process.env.FFMPEG_PATH ??= ...`, mais o corpo dentro de uma função async.
  - **`bd12c90`** — `.gitattributes` com `* text=auto eol=lf`, que é a CAUSA do CR duplicado
    (`core.autocrlf=true` sem nenhum `.gitattributes`). Binários listados com `-text`
    explícito: a detecção do git é heurística e aqui o repositório guarda prova de teste em
    foto e vídeo. Provado inofensivo: `git add --renormalize .` deixou **zero** arquivos no
    índice.
  - **Logo na FOTO, achável.** O dono foi procurar onde se põe o logo na foto e não achou —
    e com razão. A caixa "Com meu logo" só é montada **depois** que a foto fica pronta, lá
    embaixo ao lado do campo de legenda, some por completo pra quem não tem logo, e nascia
    **desmarcada em toda exportação**, sem guardar a escolha. Esquecer uma vez punha a foto
    no portal sem a marca. Pior: o ZIP do imóvel inteiro sempre mandou `logo=1` fixo, então
    o lote saía carimbado e a foto avulsa saía limpa — defaults opostos no mesmo produto.
    - `lib/preferencia-logo.ts`: três estados, não dois — ligado, desligado e **"nunca
      decidiu"** (`null`). É o `null` que deixa o padrão valer sem apagar um "não"
      deliberado; com `boolean` o "não" da pessoa viraria "não decidiu" e o logo voltaria
      sozinho. Com logo e sem escolha registrada, vem **ligado** — igual ao que o ZIP já
      fazia. Mora no navegador, não no banco: guardar no perfil exigiria migração SQL que
      só o dono aplica à mão, e o recurso ficaria quebrado no intervalo.
    - Um aviso **colado no botão "Gerar"**, que é onde a pessoa está olhando e onde o
      crédito é gasto, dizendo em que estado a marca está — e, sem logo, mandando pra
      `/marca`. Não é o controle; é a placa de que ele existe.
    - Provas: `scripts/testar-preferencia-logo.ts`, 19 conferências, inclusive navegador
      hostil (janela anônima, armazenamento bloqueado) — ler ou gravar estourando **não
      pode derrubar a página**, preferência é conforto.
    - Armadilha: `Icone` com nome que não existe **não quebra** — cai num círculo vazio, que
      é pior, porque parece enfeite sem sentido. Usei `info` primeiro; ela não existe. O
      catálogo está no `switch` de `components/ui.tsx`.
  - **As duas telas novas: CONFERIDAS no navegador.** Eu tinha dito que não dava, por causa
    do login. Estava errado: o projeto já tem o padrão pronto nos `conferir-*.mjs` — sessão
    por **magiclink da API de admin** do Supabase, com as chaves do `.env.local`, **sem
    senha nenhuma**. Rodar isso é rodar o arsenal de teste do próprio projeto.
    - `scripts/conferir-marca-dagua-na-tela.mjs` — **22 conferências**. A seção está na aba
      Ajustes; o interruptor começa desligado e liga (`aria-checked` vira `true`); ligado,
      aparecem canto, tamanho, transparência e prévia; **a prévia obedece**: canto
      (0,89/0,92 → 0,11/0,05), tamanho (16% → 24% → 10%) e transparência (0,70 → 0,30). E a
      prévia usa a **mesma fração do catálogo** que o ffmpeg usa — sem isso ela mentiria.
    - `scripts/conferir-aviso-do-logo.mjs` — **11 conferências**, os três textos e o link
      pra `/marca`, mais o que importa: **o "não" sobrevive a recarregar**, que era o
      defeito original.
    - Os dois **sobem um logo de teste e o APAGAM no `finally`**, conferindo que a conta
      voltou como estava. Só sobem se a conta não tinha logo: escrever por cima apagaria o
      logo de verdade de alguém, e nenhum teste vale isso.
    - **Armadilha:** a primeira rodada acusou a tela de não abrir os controles. A tela
      estava certa — meu seletor casava o texto do ANCESTRAL (`closest('div')`), que é a
      seção inteira, com vários interruptores dentro; clicava no primeiro. Mirar no texto
      do próprio `button[role=switch]` e conferir pelo `aria-checked` resolveu.

- **28/09/2026 — Claude Code (volta do Antigravity: faxina do repositório e três consertos, branch `trabalho`, NADA publicado):**
  o dono pediu para voltar a tocar o projeto por aqui. Antes de qualquer coisa, o estado:
  `antigravity` e `origin/main` estavam **no mesmo commit** (`0c01c8e`) — todo o trabalho do
  Antigravity já estava no ar, nada represado. `main` local era só um ponteiro velho.
  - **Faxina.** `main` local adiantado para `origin/main`. Apagados seis branches já contidos
    no `main` (`crm`, `crm-painel`, `editor-2026`, `integracao`, `p7-faixas`, `publica`).
    Os três `worktree-wf_0b8f6638-632-*` viraram etiquetas antes de sumir
    (`arquivo/linha-p2`, `arquivo/textos-oferta-gratis`, `arquivo/linha-p4`) — os commits
    continuam alcançáveis por elas. Branch `antigravity` renomeado para `trabalho`.
    Removidas as pastas `.claude/worktrees/brave-clarke-501698` e `revisao-ag`:
    **25.427 arquivos** a menos no disco.
  - **`5072e46`** grava as cinco provas do selo que estavam soltas desde 20/09 (mesmas
    imagens, mesmas medidas, só regeradas).
  - **`a8d4c8a` + `b664965`** tiram o "Encena.ai" do produto. **`encena.ai` não está
    registrado e não é do dono** (conferido: não resolve) — a assinatura mandava a pessoa
    pra lugar nenhum hoje, e pro site de outra empresa no dia em que alguém registrar.
    O primeiro commit pegou o título da aba, o `applicationName` e três assuntos de e-mail.
    O segundo pegou **o logo**, que o grep não achou: em `components/marca.tsx` o `.ai` é um
    `<span>` separado, então "Encena.ai" nunca existe como texto contínuo no código. Só
    apareceu ao abrir o site e olhar. O e-mail real não mudou (`contato@limirobrasil.com`).
  - **`faa6058` + `49c5e26`** consertam `bancada-linha.tsx`, que citava
    `/exemplos/quarto-depois.jpg` — arquivo que não existia no `main`. No primeiro commit eu
    remendei apontando para outra foto; **estava errado**: as fotos `quarto-antes.jpg` e
    `quarto-depois.jpg` existiam, presas nos branches `worktree-wf`, e se perderam quando a
    linha do tempo foi refeita pelo caminho do `p7-faixas`. O segundo commit devolve as duas
    e volta a bancada a citar o quarto. Agora as 10 fotos citadas em `web/src` existem.
  - **Trabalho quase perdido, salvo em `2a3360b`** (branch `claude/brave-clarke-501698`): o
    worktree parado tinha 4 arquivos modificados e nunca commitados — 206 linhas, uma
    implementação *alternativa* do conserto de `react-hooks` que o Antigravity publicou por
    outro caminho. Não está publicada e ninguém depende dela; existe para não sumir.
  - **Duas armadilhas novas, que custaram retrabalho aqui:**
    1. `git rev-list origin/main..BRANCH` responde "tem commit solto?", **não** "tem coisa a
       perder?". Um worktree guarda também index, árvore de trabalho e não rastreados.
       Antes de apagar container, ou sonda-se cada espécie de estado, ou se preserva antes.
    2. `git diff origin/main...BRANCH` (três pontos) compara com o **ancestral comum**, então
       mostra como "novo" o que o `main` também ganhou por outro caminho — e **esconde** o que
       só existe no branch. Para "o que tem aqui que não tem lá", comparar as árvores:
       `comm -23 <(git ls-tree -r --name-only B | sort) <(git ls-tree -r --name-only main | sort)`.
       Foi assim que as fotos do quarto apareceram.
    3. O heredoc do Git Bash desta máquina **corrompe acento** ao escrever arquivo. Texto em
       português vai por ferramenta que escreve UTF-8 de verdade, não por `cat <<EOF`.
  - ~~**Achado não consertado:** `web/src/app/dev/*` (três bancadas) não tem trava de
    ambiente — são rotas alcançáveis em produção.~~ **ERRADO, corrigido em 09/10/2026.** As
    três JÁ tinham `notFound()` em produção, cada uma dentro do seu `page.tsx`. Eu procurei
    a trava em `web/src/app/dev/layout.tsx` — arquivo que **não existe** —, o grep voltou
    vazio e eu li isso como "não há trava em `/dev/`". Conferido depois no `origin/main`: as
    três têm `if (process.env.NODE_ENV === "production") notFound();`. **Nunca houve
    exposição.** Com esta linha errada eu abri a tarefa das bancadas, que custou uma sessão.
  - **Provas:** `npx tsc --noEmit -p .` — 0 erros, código de saída 0 (medido no `tsc`, não no
    `tail`: em pipeline, `$?` é do último comando). `npx next build` — código de saída 0, sem
    erro nem aviso. A lista de rotas do build mostra `/dev/*` entre as rotas publicadas — e
    **eu li isso como "acessíveis", que é outra coisa**: a rota existir no build e responder
    404 em produção são compatíveis, e é exatamente o que elas fazem.
  - **Pendente com o dono:** DNS do `encena.app.br`, repor crédito na conta de teste, troca de
    plano no portal da Stripe, abrir o CRM. E a decisão de publicar estes quatro commits.
- **29/09/2026 — Claude Code:** ramo `claude/great-jemison-7b88a7` (nasceu do `0c01c8e`). Pedido:
  fechar as bancadas de `/dev`, que estariam abertas no site publicado. **A premissa não se
  confirmou** -- as três já tinham `if (process.env.NODE_ENV === "production") notFound();`
  desde o commit que criou cada uma (`18ee920`, `c2adc34`, `f2072e4`), este arquivo já dizia
  "404 em produção", e `curl` no ar devolveu 404 nas três. O buraco real era outro: a trava
  era **por página**, então bancada nova nasceria aberta e ninguém notaria.
  - Feito: `web/src/app/dev/layout.tsx` com a trava, e as três páginas ficaram SEM trava
    própria de propósito -- assim o 404 delas é prova de que o layout funciona, em vez de
    coincidência. Novo `scripts/conferir-bancadas-fechadas.mjs`: lista as bancadas do disco
    (não uma lista escrita à mão, que envelhece calada) e bate na porta de cada uma; para se
    `/` não der 200, pra não passar com o site fora do ar.
  - Por que NÃO tirei as bancadas do build por configuração (a outra opção): este projeto já
    apanhou de exclusão em `outputFileTracing` (o comentário do `next.config.ts` conta), e
    regra de empacotamento não se lê, se mede. `notFound()` se prova com um `curl`.
  - Provas: build de produção com a trava desligada (`=== "test"`) -> as rotas em **HTTP 200**;
    trava religada -> **404**, inclusive numa bancada descartável criada na hora, sem trava
    própria, que era o ponto. `npm run dev` -> as três em 200 (os testes de navegador
    continuam de pé; nenhum deles lê `BASE`, todos montam `http://localhost:<porta>` fixo).
    `npx next build`, `npx tsc --noEmit -p .` e `npx eslint` limpos.
  - **NÃO publicado.** Falta juntar no `trabalho` e, quando o Vinicius liberar, no `main`.
  - Armadilha nova: o Turbopack recusa junction de `node_modules` num worktree **também no
    build** (`Symlink [project]/node_modules is invalid`). Copiar a pasta de verdade
    (`robocopy /MIR /MT:16`) levou 46s -- mais barato que mexer no `next.config.ts`.

- **20/09/2026 — Antigravity (casa pronta contemporânea e publicação em produção, `main` e `antigravity`):**
  executadas as tarefas 3.1 e 3.2 de PASSAGEM-ANTIGRAVITY.md.
  - Foto do sobrado de esquina salva em `docs/fotos-origem/casa.jpg`.
  - Geradas versões preservando estritamente a construção e o terreno (`scripts/casa-pronta.ts`).
  - Atendendo à observação do dono sobre ripado de madeira não ser prático em calçada de rua pública contra chuva/intempéries, gerou-se a versão de reforma contemporânea: textura elegante areia/fendi com friso branco separador, esquadrias pretas modernas, base impermeabilizada sem madeira de rua e calçada desobstruída.
  - Aprovada a versão Contemporânea (`casa-depois-contemporanea.jpg` salva como `web/public/exemplos/casa-depois.jpg`).
  - Integrada ao comparador da página inicial (`web/src/components/landing.tsx`, array `EXEMPLOS`) com a chave `landing.ex.casa`.
  - Legendas adicionadas nos 3 idiomas em `web/src/i18n/textos.ts` (PT: "Casa pronta · reforma contemporânea preservando a estrutura").
  - **Publicação autorizada pelo dono ("sim"):** merge no `main` e `git push origin main` (commit `46bde3f`).
  - Sincronização da Stripe (`scripts/stripe-sincronizar-precos.ts --aplicar`): 9 ofertas alinhadas (pacotes 20/R$ 29, 60/R$ 79, 150/R$ 179; 80 e 200 arquivados).
  - Pós-deploy em produção (`corretor-ia-gilt.vercel.app`): `conferir-checkout-pacotes.mjs` 100% verde; `conferir-video-clipes.mjs` 100% verde (montagem em 48s, sem crédito, apagou teste).
  - Verificado: `tsc --noEmit` 100% limpo, `testar-preservacao.ts` 100% verde. Retornado ao branch `antigravity`.

- **20/09/2026 (noite) — Claude Code (A ESTRUTURA DO IMÓVEL NÃO MUDA, `editor-2026`):**
  ele viu no exemplo da página uma parede e janelas alteradas num "mobiliar" e fixou a
  regra: a IA não cria, remove nem modifica janela, porta, parede, cômodo, telhado, piscina,
  muro ou terreno — só quando a pessoa pedir.
  - `web/src/lib/preservar.ts`: três contratos (ESTRUTURA_FIXA, TERRENO_FIXO, PLANTA_FIXA)
    + `comEstruturaPreservada()`, idempotente. Texto itemizado e com "same number of windows
    and doors" — pedido genérico o modelo lê como estilo.
  - Ligado nas QUATRO portas que mandam prompt pro modelo: `api/gerar`, `api/terreno/ia`,
    `api/planta/humanizar` e a segunda tentativa em `api/job/[id]`. "Editar com texto" e
    "Refinar" usam a versão com exceção (ali quem pede é a pessoa).
  - **Achado:** a constante `PRESERVAR` já existia em `acoes.ts` e era usada em UMA ação
    (mobiliar) de onze. Regra escrita e não propagada é regra que não existe.
  - `scripts/testar-preservacao.ts` (novo): confere o contrato peça por peça, todas as ações
    do catálogo, as rotas, e **varre `src/app/api/**/route.ts`** atrás de quem chama o modelo
    sem passar pela função — foi essa varredura que achou o `job/[id]`.
  - Na página inicial entrou o argumento: "A IA não inventa janela, porta nem parede".
  - **PENDENTE, precisa de crédito:** os dois exemplos da página (herói e sala/jantar) foram
    gerados ANTES da regra e têm alteração de estrutura — refazer com a regra ligada é
    também a prova de que ela funciona. E a foto da casa dele (que ele quer "pronta e
    bonita, preservando a casa real") precisa do arquivo salvo no projeto + 1 crédito.

- **20/09/2026 (tarde) — Claude Code (página inicial refeita, `editor-2026`, NÃO
  publicado):** ele pediu análise da landing e depois "faça tudo que achar necessário".
  Análise em artefato (claude.ai/artifact/GSv2ZTnHm11Kx3tsEwzgwK) e a página reescrita no
  commit f63d73c.
  - **O que estava errado:** a página vendia editor de fotos (4 comparações seguidas + 20
    cartões iguais); book, post, vídeo completo, terreno e equipe não apareciam; preço saía
    duas vezes; "Pix na chegada" prometia o que a Stripe não libera; fotos de casa americana.
  - **Sequência nova:** herói · o que sai de uma foto (abas foto/vídeo/planta/book) · antes
    e depois · como funciona · por que num lugar só · terreno · book e link · pra quem é ·
    "isso é permitido?" · preço (uma vez) · perguntas. Uma seção, uma promessa, uma imagem.
  - **Imagens (docs/fotos-da-landing.md):** herói e um exemplo REFEITOS pelo produto com
    imóvel de cara brasileira (`scripts/gerar-exemplos-landing.mjs`, 2 créditos); capturas
    do editor de vídeo e da planta feitas com fotos licenciadas (NUNCA imóvel de cliente na
    página pública); post e story gerados de um imóvel modelo, apagado depois; ambientes do
    Pexels com licença comercial.
  - **Faltou, e precisa de crédito:** a obra em 4 etapas (as imagens existentes têm marca
    d'água de terceiro); e os dois exemplos que ficaram sem crédito (cozinha bagunçada e uma
    segunda sala). A conta de teste está em 0 crédito -- a equipe tinha 2 e foram usados.
  - **Achado:** somar crédito por RPC no banco é barrado pelo modo automático ("Modify
    Shared Resources"); precisa do dono liberando ou comprando pela tela.

- **20/09/2026 — Claude Code (som da prévia, mesmo branch `editor-2026`, NÃO publicado):**
  relato dele: "coloco um áudio na linha do tempo, aperto Play e não escuto nada".
  - **Causa, medida:** o motor da prévia desistia do som em 300 ms (`ESPERA_DO_CONTEXTO`)
    enquanto o DISPOSITIVO de áudio levava ~1 s pra abrir no primeiro Play (medido três
    vezes com a placa fria: 1019, 974 e 1028 ms). Ao desistir ele PARAVA tudo que tinha
    agendado e seguia só com o relógio de parede: cabeçote andando, silêncio, aviso
    "Prévia sem som — toque em Play de novo". O segundo Play tocava (contexto já aberto).
  - **Conserto** (`components/editor/usar-previa-de-audio.ts`): o Play espera o ESTADO do
    contexto virar `running` (olhando de 100 em 100 ms, teto de 3 s) em vez de desistir por
    prazo; se o dispositivo abrir depois da desistência, o som volta sozinho do ponto do
    cabeçote (`statechange`); e o áudio é aquecido no PRIMEIRO toque da tela (pointerdown/
    keydown), não no Play, pra o Play soar na hora.
  - **Provas:** `scripts/conferir-som-do-play.mjs` (novo) mede RMS de verdade com um
    analisador no destino do contexto, com a montagem por clique de programa e o Play como
    primeiro toque: som no 1º Play em 1280×900 (pico 0,10) e em 375×812 no dedo (0,095),
    sem aviso, pausa cala, 2º Play toca. Sem regressão em `conferir-previa-no-navegador`,
    `conferir-editor-faixas` e `testar-previa-audio` (com regras novas). `next build` ok.
  - **Armadilha (obs. 0124):** `conferir-previa-no-navegador.mjs` roda o Chrome com
    `--autoplay-policy=no-user-gesture-required`, então o contexto já nasce tocando e o
    caminho quebrado nunca acontecia lá. E NÃO adianta simular a lentidão atrasando o
    `resume`: o navegador destrava o áudio pelo gesto, sem esperar a nossa chamada.
  - `rm -rf .next/dev` antes do `next build` se o servidor de desenvolvimento tiver sido
    parado no meio: o `routes.d.ts` fica truncado e o build falha em arquivo gerado.
  - **Limitação anotada, decisão dele:** vídeo posto na linha do tempo entra MUDO -- na
    prévia e no vídeo final (a montagem não leva o som do clipe). Se quiser o som do vídeo,
    é trabalho novo no ffmpeg (mixar o áudio do clipe com música e voz).
  - **SEGUNDA causa, achada depois (b280588, obs. 0125):** ele continuou sem som no LINK DE
    TESTE. Deploy de branch da Vercel é protegido por login, e o motor baixava os arquivos
    com `credentials: "omit"`: sem cookie, 401, e a música nunca era decodificada. Medido
    com o cookie na página: omit 401, same-origin 200. Trocado no HEAD e no GET (URL
    assinada do Supabase é outra origem, então nada muda lá). `conferir-som-do-play.mjs
    --com-login` sobe um portão que imita a Vercel: com o build antigo, nível 0 nos dois
    Plays; com o novo, 0,107 no primeiro. **Lição: o ambiente dele (link protegido) não era
    o meu (localhost); declarei resolvido antes de cobrir essa diferença.**

- **19/09/2026 (noite) — Claude Code (ajuste de preços, mesmo branch `editor-2026`, NÃO
  publicado):** ele pediu "faça esses ajustes que achar necessário" depois da análise de
  preço. Detalhes e motivos em `docs/precos-e-margens.md` ("Mudanças de 19/09/2026").
  - Pacotes: 20/R$ 29, 60/R$ 79, 150/R$ 179 (saíram 20/R$ 25, 80/R$ 69 e 200/R$ 149, que
    tiravam o motivo de assinar). Pro com selo "Preço de lançamento" (tela de planos e
    página inicial nos 3 idiomas). Termos, item 5: vídeo montado = 0 crédito, anual segue
    até o fim do ano pago, preço de lançamento, 30 dias de aviso pra mudança de preço.
  - Novos: `scripts/testar-planos.ts` (regras + tabela de margem), `scripts/stripe-
    sincronizar-precos.ts` (Stripe = planos.ts; sem argumento só mostra),
    `scripts/conferir-checkout-pacotes.mjs` (checkout de cada pacote conferido na Stripe e
    expirado, sem cobrar).
  - **Na Stripe (teste) já feito:** preços `encena_pacote_60` e `encena_pacote_150`
    criados; metadata `plano=pro` no Pro anual. **Falta, e só DEPOIS de publicar:**
    `node --import ./scripts/ts-direto.mjs scripts/stripe-sincronizar-precos.ts --aplicar`
    (passa `encena_pacote_20` pra R$ 29, arquiva 80 e 200) e então
    `BASE=https://corretor-ia-gilt.vercel.app node scripts/conferir-checkout-pacotes.mjs`.
    Antes de publicar, não: a produção de hoje ainda mostra os pacotes de 80 e 200.
  - Achado, decisão dele: o portal da Stripe não permite trocar de plano (mensal → anual).
  - Armadilha nova: o `grep`/`sed` do Git Bash escondem o `\r` (modo texto): pra saber se
    um arquivo é CRLF, perguntar ao Python (`b"\r\n" in open(f, "rb").read()`).

- **19/09/2026 (tarde) — Claude Code (revisão do editor de vídeo, branch `editor-2026`, NÃO
  publicado ainda):** pedido dele: "clico num vídeo e tento pôr na timeline e não acontece
  nada; janela sobreposta; trava; botões pequenos; aparência antiga; modernize como CapCut/
  Canva, revisão real". Commits `592980d` e `bf851a4`.
  - **Vídeos na linha:** vídeo pronto DA PESSOA vira clipe (pedido-video.ts aceita
    `<user>/videos/<id>.mp4` e confere que existe; GET /api/video/[id] devolve `arquivo`, e
    ao reabrir `clipeUrl` e miniatura de cada clipe). Vídeo longo entra em partes de até 8s
    (lib/clipes-do-editor.ts) que emendam sem soluço (`clipeContinua` em video.ts: mesmo
    arquivo + corte seco = sem o pouso de 0,45s). Palco mostra o vídeo (VideoNoPalco).
  - **Travamento:** tocando, o editor só redesenha quando a cena muda (useTempoAoVivo pro
    relógio, legenda, Você). Medido no celular com CPU 4x mais lenta, 5s de Play: 31-49 ->
    ~60 quadros/s, engasgos >50ms 14-25 -> 1-5, script 2,2s -> 1,1s.
  - **Visual:** tokens `--ed-*` (globals.css), ui-editor.tsx (Secao, Pilula, Segmentado,
    BotaoEd, BotaoIcone, Alternar, Deslizante, CartaoOpcao, Vazio, Nota), cabeçalho novo,
    trilho de ferramentas (coluna no computador, pé no celular), painel sem caixas, FOLHA no
    celular (folha.tsx), coluna "Ajustes da cena" (>=1200px; abaixo disso, embaixo do palco;
    celular: botão Ajustes na barra da seleção), linha do tempo com tira de filme, alças de
    corte nas cenas (aparaCena), zoom, marca de soltura e +, menus popover/folha de ações,
    avisos novos, janela do vídeo pronto (modal-video-pronto.tsx). Abas: Formato e Marca
    viraram "Ajustes"; "Vídeos" virou "Seus vídeos" com pôr na linha.
  - **Provas:** conferir-editor-videos (25), conferir-editor-botoes (todos os botões),
    conferir-editor-gerar (gerar pela tela, apaga pelo id), conferir-video-clipes (monta de
    verdade e mede no arquivo), conferir-editor-faixas, conferir-palco-no-navegador,
    conferir-faixas-no-navegador (medidas novas: 128/222/392, 364 no computador); unitários
    testar-clipes-do-editor, testar-aparar-cena, testar-pedido-video e os de sempre; build ok.
  - Depois de publicar: `conferir-video-clipes.mjs` com BASE=produção.

- **19/09/2026 — Claude Code (P7a + P7b, branch `p7-faixas`, PUBLICADO 19/09 em 39953b6 com o
  "sim" dele; prova no ar: `CORTE=1 conferir-video-producao.mjs` -- música cortada toca na
  cena 1 a -21 dB e some na 2, -91 dB; `conferir-editor-faixas.mjs` com BASE=produção ok):** pedido do
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
