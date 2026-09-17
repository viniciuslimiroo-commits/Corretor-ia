# Plano: linha do tempo com faixas (estilo CapCut)

> Gerado em 17/09/2026 por mapeamento do codigo + duas propostas + juiz tecnico (workflow wf_5c321b34-53f).

# Juiz técnico: linha do tempo no estilo CapCut (proposta A x proposta B)

As linhas citadas são do commit `45fcc70`, com a árvore limpa. Conferi no código tudo o que pesa na decisão. Também rodei dois testes de render com as fotos reais `docs/testes-reais/01` e `03-mobiliar-depois.jpg`, usando o ffmpeg de desenvolvimento, `ffmpeg-static` 6.1.1. A evidência fica no scratchpad desta sessão, em `.../scratchpad/juiz-recorte/`, e se perde quando a sessão acabar. Por isso o comando está descrito no teste da Fase 4.

## 1. Decisão: híbrido, com a base da B

- **Compatibilidade.** A regra "reabrir e gerar igual" derruba o centro da A. A converte os textos que já estão presos à cena para a passada final, e aí o texto deixa de dissolver ou deslizar junto com a cena. A própria A admite isso. A B mantém `cena.textos`/`cena.elementos` como estão e só grava campo novo quando alguém mexe.
- **Custo de render.** A põe as camadas na etapa `montar`. Essa é a única etapa que não retoma do meio, e ela já está no limite: ffmpeg com 280s em `video-pipeline.ts:577`, mais a capa (`:621`) e a miniatura (`:629`) na mesma chamada. A B põe as camadas na etapa por cena, que é retomável e roda uma chamada por cena.
- **Medi a afirmação central da B, com PSNR quadro a quadro.** Comparei o texto recortado nos dois clipes contra o texto desenhado depois do xfade:

  | Transição | PSNR na sobreposição | Resultado |
  |---|---|---|
  | Dissolver | 69 dB | igual ao de fora |
  | Corte | 64 dB | igual |
  | Deslizar | 23 dB | quebra |
  | Aproximar | 11 dB | quebra |
  | Desfoque | 26 dB | quebra |

  A B estava certa nas duas primeiras e honesta sobre as outras três.
- **Achado novo: a borda erra 1 quadro.** O xfade põe o quadro 0 do clipe seguinte no quadro `ceil(offset×24)`, e não em `offset`. Um item que terminava no meio da emenda saiu com 1 quadro errado (26,9 dB no quadro 89). Medi com offsets 3,4, 3,3 e 3,92 (fracionários) e 3,5 (exato): em todos, o quadro 0 cai em `ceil`. O relógio precisa usar essa conta.
- **Da A entram:**
  - o conserto do Você. Hoje é `setpts=PTS-STARTPTS` sem o deslocamento (`video-ffmpeg.ts:864, 878, 882`), com a janela `between(entra, …)` (`:861`). O Você sai adiantado e congela. O teste de "presença" da B não pegaria isso;
  - a etapa `finalizar`;
  - `p.tempos`;
  - erro com mensagem em vez de corte calado;
  - a prévia com Web Audio.
- **Troquei a "regra do solo" da B pela regra de interseção por quadro.** A regra do solo só existia para proteger os textos presos, que agora não passam pelo recorte. Com ela, um item com a borda dentro da emenda aparece ou some junto com o dissolver.

## 2. Plano final

### Fase 1: um relógio só, consertos que já aparecem hoje, /videos sem perda

**Objetivo para o corretor:** "o tempo que vejo embaixo é o tempo do vídeo, e o Você e o som das viradas saem certos."

**Tipos e campos:**
- Nenhum campo salvo novo.
- `Etapa` ganha `"finalizar"`.
- `PipelineVideo` ganha `tempos?: Partial<Record<Etapa, number>>` e `nucleos?: number` (`os.availableParallelism()`).
- `video.ts` ganha `FPS`, `relogioDoVideo`, `relogioDoEspec` e `precisaDoEditor`.

**Arquivos e funções:**
- `video.ts:856` `duracaoEstimada` passa a ser `relogioDoEspec(e).total`, com os mesmos números.
- `editor-video.tsx:1209-1220`: `iniciosDasCenas` e `duracaoDaLinha` passam a ler o relógio.
- `editor-video.tsx:1405-1420`, laço da prévia:
  - grava `tempoRef` a cada tique e ao pausar;
  - `duracaoDaLinha` sai das dependências e vai para uma ref.
- `linha-do-tempo.tsx`:
  - `:144-163`: os inícios vêm do relógio, e o bloco k tem largura `inicio[k+1] − inicio[k]`;
  - `:187`: `irPara` desconta o padding de 12px.
- Seletor de duração: mostra o valor quando ele não está em `DURACOES_CENA` (`video.ts:842`). Dividir cena animada fica bloqueado (hoje cobra em dobro, `video.ts:826-830`).
- `editor-video.tsx:804`: legenda nova sai deslocada por `vozInicio`. As legendas já salvas não mudam.
- `video-ffmpeg.ts`:
  - Você: `setpts=PTS-STARTPTS+${entra}/TB` em `:864`, `:878` e `:882`, e `eof_action=pass` em `:865` e `:884`;
  - efeito sonoro: base `anullsrc` com a duração total como primeira entrada do `amix` em `:963-964`;
  - `filtrosDeTexto` recebe a `duracao` em `:555`, `:580` e `:694`.
- `video-pipeline.ts`:
  - `:499-655` vira duas etapas. `montar` roda o ffmpeg e sobe o mp4 final. `finalizar` faz capa, miniatura, grava a linha como concluída e roda `apagarEntradas`;
  - `progressoDe` (`:124-143`) conta a etapa nova.
- `videos/page.tsx:633` `editarVideo`: `if (precisaDoEditor(e)) { router.replace(\`/editor/video?editar=${id}\`); return; }`. O editor já lê `?editar=` (`editor-video.tsx:560`).

**Na tela:**
- Desktop: a régua e o relógio batem com o vídeo, e as cenas ficam encostadas com a largura real.
- 375px: igual a hoje, só que sem o cabeçote voltar ao retomar.

**Teste que prova:**
- **`web/scripts/testar-relogio.ts`**
  - 300 especs aleatórios, passando por `limparEspec` (1 a 12 cenas, 5 transições, com e sem tela final). `total` igual à `duracaoEstimada` antiga (±0,001), e `clipes[k].inicio === ceil(Σ(d−e)·24 − 1e-6)/24`.
  - Args de 6 especs fixos iguais a `scripts/fixtures/args-antes.json`, **gravado no HEAD antes de mexer**. Você, efeito e `no_fim` ganham snapshot novo, revisado à mão.
- **`web/scripts/testar-consertos-montagem.mjs`** (pela API, fotos `01..05-mobiliar-depois.jpg`, clipe real do apresentador):
  1. **Você:** `entra = inicios[2]`, `inicio 1`. SSIM ≥ 0,9 da região do Você no quadro `inicios[2]+0,5` contra o quadro de 1,5s da origem, **e** em `+2,5` contra 3,5s (prova que anda, não só que aparece). Rodar primeiro no HEAD para ver falhar.
  2. **Efeito sonoro:** só "clique", sem música e sem voz. Áudio com a duração total ±0,05 e pico em cada emenda ±0,05.
  3. **`no_fim`:** num clipe de 8s, entra em 4,96s ±1 quadro.
  4. **Duração:** o ffprobe dá `relogio.total` ±0,05, e `p.tempos.montar` e `p.tempos.finalizar` ficam gravados.
- **Navegador a 375×812:**
  - tocar 2s, pausar e tocar de novo: o relógio não volta;
  - tocar na régua em x: tempo = x/zoom ±0,05;
  - `/videos?editar=<vídeo do editor com textos>` termina em `/editor/video?editar=`;
  - `scrollWidth === clientWidth`, **e** os retângulos de barra, linha do tempo e painel não se sobrepõem (observação 59).

**Não entra:** faixa nova, gesto novo, campo salvo novo.

### Fase 2: faixas com o que já existe, sem formato novo

**Objetivo para o corretor:** "tudo que pus no vídeo aparece embaixo, e mexo no Você, nas legendas e nas cenas com o dedo."

**Tipos e campos:** nenhum campo salvo novo. O Você já tem `entra`, `inicio` e `duracao` (`video.ts:688-708`), e as legendas já têm `inicio` e `fim` (`video.ts:660`). No editor entram `Faixa`, `BlocoLinha`, `Selecao` e o histórico (seção 3).

**Arquivos:**
- **Novo `web/src/lib/linha-do-tempo.ts`**, só funções puras: `blocosDoEstado`, `aplicarGesto`, `dividirNoTempo`, `duplicar`, `apagar`, `pontosDeEncaixe`, `empacotarLinhas`, `realinharAoMudarCenas`.
- **`linha-do-tempo.tsx`** reescrito, genérico:
  - Pointer Events no lugar do `draggable` (`:356`);
  - o toque posiciona o cabeçote, e não o início da cena (`:360-364`);
  - apagar o comentário "uma trilha só" (`:18-22`).
- **Novos:** `barra-da-selecao.tsx` e `usar-historico.ts` (até 50 passos).
- **`editor-video.tsx`:** `selecionada` vira `selecao`, e o palco mostra a cena que está sob o cabeçote.
- **`apresentador-no-palco.tsx`:**
  - sai `muted autoPlay loop` (`:121-123`);
  - `currentTime = inicio + (t − entra)`;
  - visível e com som só dentro da janela;
  - ressincroniza quando desvia mais de 0,15s.
- **Palco:** mostra o trecho de legenda que está sob o cabeçote.

**Faixas, de cima para baixo:**
- **Você:** editável.
  - Mover muda `entra`.
  - A alça esquerda move `entra` e `inicio` juntos.
  - A alça direita muda `duracao`.
  - Teto de `entra`: 120, que é o limite do saneador (`video.ts:1025`).
- **Legendas:** mover, aparar, dividir, "+ trecho no cabeçote" e apagar.
- **Peças / Textos presos:** bloco da largura da cena, com ícone de corrente. Tocar abre a aba no item. Aparar só vem na Fase 4.
- **Cenas:** aparar pela borda em segundos inteiros (mínimo 3); segurar e arrastar reordena, com ímã sempre ligado.
- **Voz, Música e Efeitos:** só leitura. Tocar abre a aba Áudio. O efeito aparece como marca em cada emenda.
- Faixa vazia fica escondida.

**Na tela:**
- **Desktop:** faixas de 28px e principal de 52px; cabeçote arrastável; Ctrl+roda dá zoom; Espaço, Delete, Ctrl+B, Ctrl+D e Ctrl+Z.
- **375px:**
  - linha do tempo com no máximo 150px: barra 36 + régua 14 + área de 100 com rolagem vertical própria (principal fixa de 36, faixas de 22);
  - cabeçote fixo no centro, com a trilha correndo embaixo. Confirmar no CapCut do aparelho do dono, porque não há fonte escrita;
  - pinça de 8 a 120 px/s;
  - alças com 20px de área de toque;
  - com item selecionado, a fileira de abas (69px) vira a barra do item (44px).

**Teste que prova:**
- **`web/scripts/testar-linha-gestos.ts`:**
  - `aplicarGesto`, `dividirNoTempo` e `realinharAoMudarCenas`;
  - abrir e salvar sem mexer: `limparEspec(especDoEstado(estadoDoEspec(e))).espec` igual a `limparEspec(e).espec` em 30 fixtures.
- **Vídeo real** (feito pela interface a 375px):
  - Você arrastado para 5,0s e aparado para 4s; legenda movida para 6 a 8s; gerar.
  - **Você:** SSIM do conteúdo em 5,5s e 8,5s contra a origem em `inicio+0,5` e `inicio+3,5`; ausente em 4,8s e 9,2s.
  - **Legenda:** presente em 6,5s e ausente em 8,2s.
- **Navegador a 375×812:**
  - altura da linha do tempo ≤ 150px;
  - retângulos sem sobreposição;
  - arrastar e aparar com toque emulado;
  - desfazer volta o estado.

**Não entra:** cortar áudio, texto com tempo próprio, dividir o Você.

### Fase 3: áudio em blocos (o pedido literal)

**Objetivo para o corretor:** "corto o começo e o fim da música e da minha voz, mudo de lugar, ponho fade e ouço na prévia."

**Tipos e campos:**
- `EspecVideo.audios?`, `versao?: 2`;
- `Apresentador.fadeEntrada?` e `fadeSaida?`;
- `segundos` em `MUSICAS` e `EFEITOS_SONOROS`;
- `Narracao.arquivo` aceito também em IA (**decisão do dono**, seção 5);
- `limparEspec` passa a devolver `avisos`.

**Arquivos:**
- **`video.ts`:**
  - `limparAudios` e mudanças em `:1137-1160` e `:1187`;
  - `limparApresentador` (`:1011`) aceita os fades;
  - `custoDoVideo` (`:826`) passa a `vozDeIA(n) && !n.arquivo`.
- **`video-ffmpeg.ts`:**
  - `argsMontagem` ganha o ramo `audios`, com a função nova `argsAudioItens`.
  - Receita por item: entrada com `[-stream_loop -1] -ss corte -t dur`, depois `aformat=48000:stereo`, `volume`, `afade in`, `afade out` em `dur−Fo`, `adelay=ms:all=1`, `apad`, `atrim=0:total`.
  - Barramento de voz como gatilho do `sidechaincompress` de `:933`; `anullsrc` como primeira entrada.
  - O ramo antigo (`:889-966`) fica intacto, só com a base silenciosa da Fase 1.
  - Grafo por arquivo quando passar de 20 KB.
- **`video-pipeline.ts`:**
  - `:463`: arquivo presente pula o TTS, também em IA;
  - a montagem monta as entradas por item e corta contra o total real.
- **`api/video/route.ts`:** repassa `avisos` para `p.avisos`.
- **Editor:**
  - estado `audios`, com a canonicalização da seção 4;
  - `usar-previa-de-audio.ts`: `AudioContext`, um `AudioBuffer` por fonte, `GainNode` com rampas, destravado no toque do Play;
  - forma de onda: `public/musica/*.picos.json` gerado por script, e a voz decodificada no navegador;
  - mover um pedaço de voz leva junto as legendas da janela dele. Transcrição nova sai deslocada por `noVideo − corteArquivo`.

**Na tela:**
- Voz, Música e Efeitos editáveis.
- Barra do áudio: volume, fade de entrada e saída, repetir (só música), dividir, duplicar, apagar.
- Botões "+ Música" e "+ Efeito aqui".
- Efeitos automáticos aparecem tracejados até alguém mexer.
- Voz de IA ainda não gerada: bloco hachurado com tamanho estimado (caracteres ÷ 15 segundos), sem aparar nem dividir.
- A 375px: mesma área, e o painel mostra os três controles.

**Teste que prova:**
- **Antes de começar:** conferir se as URLs assinadas do Supabase mandam `Access-Control-Allow-Origin`. Sem isso, `decodeAudioData` falha.
- **`web/scripts/testar-saneador-linha.ts`:**
  - idempotência de `limparEspec` em 50 especs com `audios`;
  - cada campo novo sobrevive;
  - espec sem campo novo sai igual ao snapshot do HEAD;
  - `audios` junto com `musica` resulta em `musica: "nenhuma"`;
  - arquivo de outro usuário dá 400.
- **`web/scripts/testar-audio-blocos.mjs`** (pela API, 3 fotos reais):
  - Montagem:
    - `calma.m4a` com corte 10, noVideo 2, duração 7 e fades 1/2;
    - voz como tom de 1 kHz (o método de `testar-video-audio.mjs`), dividida em [3,5) e [6,8);
    - efeito em 4,0s.
  - Conferir com `astats` em janelas de 0,25s:
    - abaixo de −50 dBFS antes de 2s;
    - música subindo entre 2 e 3s;
    - tom só dentro das janelas;
    - música ao menos 6 dB mais baixa durante o tom;
    - pico em 4,0 ±0,05.
  - Equivalência: um espec antigo gerado pelo ramo antigo e pelo ramo novo (depois de convertido) tem diferença de RMS ≤ 1 dB por janela.
  - Uma versão com voz real fica em `docs/testes-reais/editor/audio-blocos/` para ouvir.
- **Navegador a 375:**
  - aparar a música de 9s para 7s pela alça; desfazer volta;
  - depois do Play, `ctx.state === "running"`, e a posição = `corte + (t − noVideo)` ±0,1.
- **Celular:** o som no iOS o dono testa no iPhone dele, porque a emulação não reproduz o iOS.

**Não entra:** velocidade e tom, pontos de volume, música enviada pela pessoa, segunda gravação de voz, dividir o Você, som do clipe da cena.

### Fase 4: texto e peça com início e fim próprios (recorte por cena)

**Objetivo para o corretor:** "o preço entra no segundo 5 e sai no 12, atravessando as fotos."

**Tipos e campos:** `EspecVideo.visuais?` e os limites novos em `LIMITES`.

**Arquivos:**
- **`video.ts`:**
  - `recortarPorClipe(itens, relogio)`: o item entra no clipe k se `[a,b)` cruza `[clipes[k].inicio, clipes[k].fim)` por mais de meio quadro. O pedaço é `{de: max(0, a−ini_k), ate: min(d_k, b−ini_k), origem: a−ini_k, duracaoItem: b−a}`;
  - `limparVisuais`: um item por chamada de `limparTextos` (`:984`) e `limparElementos` (`:909`), para o `slice(0,3)` de `:912` e `:987` não cortar a lista;
  - `excessoPorClipe` vira erro com mensagem.
- **`video-pipeline.ts:240-247`:**
  - `pecasDoClipe(espec, i)` junta presos e pedaços;
  - falha de rasterização vira aviso com o nome do item (hoje é `.catch(() => [])` calado).
- **`video-ffmpeg.ts`:**
  - `filtrosDeTexto` (`:282`) e `sobreporPecas` (`:230`) ganham janela opcional. **Sem janela, a string sai idêntica.**
  - Com janela:
    - `enable='gte(t,de−1/48)*lt(t,ate−1/48)'`;
    - todas as expressões com `(t−origem)`;
    - `no_fim` sobre `duracaoItem`;
    - laço com `trim=start=fase,setpts=PTS-STARTPTS`.
  - O `shortest=1` fica, porque a entrada continua infinita e o clipe continua cortado com `-t`.
- **`lugaresDoTexto`** (`:149`): o `y` dos itens soltos é calculado uma vez, no tempo do vídeo, contra os presos de todos os clipes que o item atravessa.
- **Pexels:** baixado uma vez por vídeo, não uma vez por cena.
- **Editor:**
  - aparar, mover ou dividir um preso o solta: ele sai de `cena.textos` e vai para `visuais`;
  - o palco mostra os soltos pela janela de tempo;
  - aviso no bloco que atravessa uma emenda Deslizar, Aproximar ou Desfoque, com o botão "Usar Dissolver nesta virada";
  - `aplicarTemplateVideo` (`video-templates.ts:267`) realinha os soltos.

**Na tela:**
- Faixas Textos e Peças com até 3 sub-linhas.
- A corrente some quando o item é solto.
- A 375px, a mesma área rolável.

**Teste que prova:**
- **`web/scripts/testar-recorte-emenda.mjs`** (local, fotos reais, é a versão ampliada do que rodei):
  - Para cada transição, gerar uma referência (xfade limpo, texto desenhado depois) e o recortado.
  - PSNR quadro a quadro ≥ 50 dB em Corte e Dissolver, **incluindo bordas dentro da emenda** com offset fracionário (3,4) e exato (3,5).
  - Registrar menos de 30 dB em Deslizar, Aproximar e Desfoque, que é a prova de que o aviso é necessário.
  - Rodar também com `FFMPEG_PATH` apontando para o binário de produção (`scripts/ffmpeg-linux.mjs:21`), que não é o 6.1.1 de desenvolvimento.
- **`web/scripts/testar-visuais-video.mjs`** (pela API, sempre passando por `limparEspec`, observação 48):
  - texto com caixa em [2, 9], com "subir", mais um adesivo "pulsar" atravessando uma emenda Dissolver;
  - presente e ausente nas bordas ±1 quadro;
  - diferença da máscara opaca do adesivo < 3 entre os dois clipes no trecho sobreposto.
- **Custo:**
  - bancada no pior caso (12 cenas de 8s, 6 textos + 6 peças por clipe, 3 animadas), limitada a 1 e 2 núcleos (observação 64): cada chamada de cena ≤ 200s;
  - depois, uma geração na Vercel lendo `p.tempos.cena`.
- **Navegador a 375:**
  - um modelo tocado cria bloco preso;
  - aparar para 1,5s solta o item;
  - o texto aparece e some no palco (`read_page`);
  - mover a cena 1 para depois da 2 realinha o solto.

**Não entra:** item sobre a tela final, item por cima do Você ou da legenda, posição livre, texto em emenda não linear sem aviso.

### Fase 5: acabamento e decisões com dado

**Objetivo para o corretor:** "o título sai quando eu quero, e o texto não estraga as viradas com efeito."

**Tipos e campos:** `tituloAte?: number`. Ausente = como hoje, até a tela final (`video-pipeline.ts:554`).

**Arquivos e entregas:**
- `argsMontagem`: o `lt(t, fimDoCarimbo)` de `:838` passa a usar `tituloAte`.
- Bloco do título na faixa Textos.
- Copiar e colar.
- **Condicional, com critério escrito:**
  - Se mais de 10% dos vídeos com `visuais` gerarem o aviso de emenda não linear em 2 semanas (contado em `p.avisos`): desenhar na montagem só a janela `[de, ate)` dessas emendas, com a receita da A (`setpts+ini/TB`, `eof_action=pass`, entrada aparada).
  - Se `p.tempos.cena` somado passar de 120s em reedições: cache de clipe de cena por hash.

**Teste que prova:**
- Título com `tituloAte 3`: presente em 2,9s e ausente em 3,1s.
- Se a janela de emenda entrar: PSNR ≥ 50 dB contra a referência em Deslizar, e `p.tempos.montar` ≤ +10% contra a Fase 4.

**Não entra:** seleção múltipla, travar ou ocultar faixa, buraco na principal.

## 3. Modelo de dados final

```ts
// ===== web/src/lib/video.ts — só acréscimos; nenhum campo existente muda de sentido =====

export const FPS = 24; // o mesmo -r da montagem

/** Um relógio só: régua, palco, saneador, recorte e ffmpeg leem daqui. */
export type RelogioDoVideo = {
  /** Cenas e, se entrar, a tela final. inicio[k] = ceil(Σ_{i<k}(d_i − e_i)·FPS − 1e-6)/FPS
   *  — é onde o xfade põe o quadro 0 do clipe (medido em 6.1.1). fim = inicio + d. */
  clipes: { inicio: number; fim: number }[];
  /** Sobreposição de cada emenda: [clipes[k+1].inicio, clipes[k].fim). linear = corte|dissolver. */
  emendas: { transicao: TransicaoId; xfade: string; segundos: number; de: number; ate: number; linear: boolean }[];
  /** Fim da última cena: teto de texto e peça (tela final não recebe item visual). */
  fimDasCenas: number;
  /** Σd − Σe: igual a duracaoEstimada (video.ts:856) e ao -t de argsMontagem (:973). */
  total: number;
};
export function relogioDoVideo(duracoes: number[], emendas: { xfade: string; segundos: number; transicao?: TransicaoId }[]): RelogioDoVideo;
export function relogioDoEspec(e: Pick<EspecVideo, "cenas" | "transicao" | "telaFinal">, telaFinalEntra?: boolean): RelogioDoVideo;

/** Texto ou peça SOLTO da cena. Presos continuam em cena.legenda/textos/elementos. */
export type ItemVisual = {
  id: string;        // /^[a-z0-9]{8}$/, estável
  noVideo: number;   // segundo do VÍDEO FINAL, arredondado ao quadro
  duracao: number;   // >= LIMITES.itemVisualMin, arredondada ao quadro; noVideo+duracao <= fimDasCenas
  linha: 0 | 1 | 2;  // sub-faixa; maior desenha por cima dentro do clipe
} & ({ tipo: "texto"; texto: TextoCena } | { tipo: "peca"; peca: ElementoCena });

export type FonteAudio =
  | { tipo: "musica"; id: Exclude<MusicaId, "nenhuma"> }
  | { tipo: "efeito"; id: Exclude<EfeitoSonoroId, "nenhum"> }
  | { tipo: "voz" }; // o arquivo de espec.narracao (gravada, enviada ou IA já gerada)

export type ItemAudio = {
  id: string;
  fonte: FonteAudio;
  noVideo: number;       // segundo do VÍDEO em que começa; 0..total, passo 0,01
  corteArquivo: number;  // segundo do ARQUIVO de onde sai; 0..LIMITES.corteAudioMax
  duracao?: number;      // ausente = até o arquivo acabar (música com laço: até o fim do vídeo); >= audioMin
  volume: number;        // música 0..1; voz e efeito 0..2
  fadeEntrada: number;   // 0..fadeMax
  fadeSaida: number;     // 0..fadeMax; fadeEntrada + fadeSaida <= duração
  laco?: boolean;        // só música
  linha: 0 | 1;          // música pode usar 2; voz e efeito 0
};

export type Apresentador = {
  /* ...video.ts:688-708, sem mudança de sentido */
  fadeEntrada?: number;  // 0..5
  fadeSaida?: number;    // 0..5
};

export type Narracao = {
  /* ...video.ts:635-647 */
  /** Agora também em origem "ia": voz já gerada (uploads/{user}/voz-{videoId}.mp3), reaproveitada
   *  sem TTS e sem crédito. O editor apaga quando roteiro ou voz mudam. DECISÃO DO DONO. */
  arquivo?: string;
};

export type EspecVideo = {
  /* ...video.ts:729-760 */
  /** Presente só quando visuais, audios, fades do Você ou tituloAte existem. */
  versao?: 2;
  visuais?: ItemVisual[];
  /** Quando existe, TODO o áudio mora aqui: musica = "nenhuma", efeitoSonoro = "nenhum",
   *  e narracao.inicio/volume são ignorados (o item "voz" manda). */
  audios?: ItemAudio[];
  /** Fase 5. Ausente = até a tela final (video-pipeline.ts:554). */
  tituloAte?: number;
};

// catálogos: segundos medidos por script com ffprobe
// MUSICAS[i].segundos: number; EFEITOS_SONOROS[i].segundos: number | null

// LIMITES (video.ts:778) +=
//   itemVisualMin 0.5, visuaisMax 24, textosPorClipe 6 (conta legenda e presos),
//   pecasPorClipe 6, animadasPorClipe 3, audiosMax 24, musicasMax 4, vozPedacosMax 8,
//   audioMin 0.3, fadeMax 5, corteAudioMax 600

// limparEspec: { espec: EspecVideo; erro: null; avisos: string[] } | { espec: null; erro: string }

// PipelineVideo (video-pipeline.ts:45) += tempos?: Partial<Record<Etapa, number>>; nucleos?: number
// Etapa += "finalizar"

// ===== só no editor (não é salvo) =====
export type Faixa = "voce" | "legendas" | "pecas" | "textos" | "cenas" | "voz" | "musica" | "efeitos";
export type Vinculo = { cena: string /* CenaUI.chave */; tipo: "legenda" | "texto" | "elemento"; indice: number } | null;
export type BlocoLinha = { faixa: Faixa; id: string; de: number; ate: number; linha: number; vinculo: Vinculo; automatico?: boolean };
export type Selecao = { faixa: Faixa; id: string } | null;
export type EstadoLinha = { cenas: CenaUI[]; visuais: ItemVisual[]; audios: ItemAudio[]; efeitosAutomaticos: boolean; apresentador: Apresentador | null; legendas: Legendas | null };
```

Os nomes `visuais` e `audios`, e não `faixas`, são de propósito: "faixa" já quer dizer quatro coisas no projeto.
- o estilo de texto e de legenda `"faixa"`;
- o Você "Faixa embaixo";
- `scripts/testar-faixas.mjs`, que são faixas de mercado;
- `const faixa` da música em `video-pipeline.ts:508`.

## 4. Regras de compatibilidade

```text
SERVIDOR: nunca converte (avancarVideo lê o espec cru, [id]/route.ts:38,133)
  pecasDoClipe(espec,k) = presos de hoje + (espec.visuais ? recortarPorClipe(...)[k] : [])
    sem visuais -> filtrosDeTexto/sobreporPecas sem janela -> strings de hoje (snapshot)
  audio = espec.audios ? argsAudioItens(...) : ramo atual (video-ffmpeg.ts:889-966, + base silenciosa)
  linha já em "montar" no deploy -> monta e segue para "finalizar"; em "cena" sem campo novo -> caminho de hoje

SANEADOR (limparEspec), nesta ordem
  1 cenas como hoje (duracao inteira, video.ts:1119)
  2 r = relogioDoEspec({cenas, transicao, telaFinal})
  3 visuais: id por regex (senão "v"+i, idempotente); texto/peça limpos UM por chamada;
      noVideo e duracao arredondados ao quadro; fim > r.fimDasCenas -> corta + aviso;
      < itemVisualMin -> sai + aviso; excessoPorClipe -> ERRO "Aos 12,4s há 7 textos na tela; o máximo é 6."
  4 audios: fonte no catálogo; limites e arredondamentos; ordenar por noVideo/id
      se audios: musica = "nenhuma"; efeitoSonoro = "nenhum"
      se narracao && nenhum item voz -> narracao = null (sem TTS, sem crédito) + aviso
      se item voz && !narracao -> item sai + aviso
  5 narracao IA: arquivo só se /^uploads\/[0-9a-f-]{36}\/voz-[0-9a-f-]{36}\.mp3$/ (POST confere o dono, route.ts:80)
  6 apresentador: fadeEntrada/fadeSaida 0..5
  7 versao = (visuais||audios||apresentador.fade*||tituloAte) ? 2 : AUSENTE
  => espec sem campo novo sai IDÊNTICO ao de hoje (snapshot do HEAD)

EDITOR — abrir (estadoDoEspec)
  cena.legenda/textos/elementos -> blocos PRESOS (vinculo), largura = bloco da cena
  visuais -> blocos soltos
  se audios: blocos direto; efeitosAutomaticos = false
  senão:
    musica != "nenhuma" -> {musica, noVideo 0, corte 0, duracao AUSENTE, laco, volume musicaVolume ?? 0.8, fades 1/2, linha 0}  // video-ffmpeg.ts:903
    efeitoSonoro != "nenhum" -> efeitosAutomaticos = true; um bloco por r.emendas[k].de, volume 0.8  // :947-962
    narracao -> {voz, noVideo inicio ?? 0.7, corte 0, duracao AUSENTE, volume volume ?? 1, fades 0}   // :902, :913
  apresentador, legendas -> blocos (os campos já existem)

EDITOR — salvar (especDoEstado): sempre a forma mais antiga que diga a mesma coisa, sem tolerância numérica
  bloco com vinculo intocado -> volta para cena.* na mesma ordem
  bloco com vinculo e mexido (aparar/mover/dividir) -> vinculo = null -> vai para visuais
  áudio é ANTIGO se TODAS:
    <=1 música: noVideo 0, corte 0, sem duracao, laco, fades exatamente 1/2, linha 0
    efeitosAutomaticos === true
    <=1 voz: corte 0, sem duracao, fades 0, 0 <= noVideo <= 10, 0.2 <= volume <= 2
    -> musica/musicaVolume, efeitoSonoro, narracao.inicio/volume; audios AUSENTE
  senão -> audios com TUDO
  roteiro ou voz de IA mudou -> apaga narracao.arquivo
  TESTE: limparEspec(especDoEstado(estadoDoEspec(e))).espec deepEqual limparEspec(e).espec

PÁGINA /videos (videos/page.tsx:633)
  precisaDoEditor(e) = e.versao === 2 || e.visuais || e.audios || e.legendas || e.apresentador
    || e.efeitoSonoro !== "nenhum" || (e.filtro && e.filtro !== "natural") || e.ajustes
    || e.cenas.some(c => c.textos || c.elementos || c.transicao || c.giro || c.espelho
         || c.velocidade || c.congelar || c.inicio || c.filtro || c.ajustes || c.luz)
  editarVideo: if (precisaDoEditor(e)) { router.replace(`/editor/video?editar=${id}`); return }
  a página nunca cria campo novo (videos/page.tsx:250-274 continua igual)
```

## 5. Riscos e proteção por fase

1. **Texto solto em emenda Deslizar, Aproximar ou Desfoque sai errado** (medido: 23, 11 e 26 dB).
   - Fase 4: aviso no bloco com o botão, e o teste registra o defeito.
   - Fase 5: a correção na montagem só entra pelo critério escrito.
   - A transição padrão é Dissolver (`video.ts:1179`).
2. **Borda errada em 1 quadro.**
   - Fase 1: o relógio usa `ceil` por quadro.
   - Fase 4: o saneador arredonda ao quadro, `enable` tem meio quadro de folga e o teste compara quadro a quadro em offset fracionário e exato.
   - Desenvolvimento (6.1.1) e produção (release baixado) são binários diferentes, e os testes rodam nos dois.
3. **Etapa `montar` sem folga nos 300s.**
   - Fase 1 separa `finalizar`, tirando até 70s de capa e miniatura mais os uploads, e grava `p.tempos`.
   - Fase 3 só acrescenta entradas de áudio, com grafo por arquivo.
   - Fase 4 nunca põe camada visual na montagem.
4. **Saneador por lista branca** (já perdeu arte e movimento, `video.ts:996-1003`).
   - Fases 3 e 4: teste de idempotência, lista explícita de campos que precisam sobreviver, e snapshot de espec sem campo novo gravado no HEAD antes.
   - Excesso vira erro com mensagem, não corte calado.
5. **Consertos mudam vídeos antigos ao gerar de novo** (Você com `entra` maior que 0, efeito sem música nem voz, `no_fim` em clipe, antes/depois e 360).
   - **O dono decide.** Recomendo consertar, porque hoje o Você congela e as viradas ficam mudas.
   - Na Fase 1, o snapshot novo é revisado à mão e o teste roda antes no HEAD para mostrar a falha.
6. **Voz de IA reaproveitada sem cobrar de novo.**
   - **Envolve dinheiro, então é decisão do dono.** É a mesma política da animada (`video-pipeline.ts:80-88`).
   - Sem isso, a voz de IA só pode ser movida inteira. Reabrir e gerar refaz o TTS com outro tempo e invalida os cortes.
7. **Som da prévia no iOS e CORS das URLs assinadas.**
   - Fase 3 começa conferindo o CORS; `AudioContext` destravado no toque; teste no iPhone do dono.
8. **`editor-video.tsx` com 2965 linhas, que outras sessões editam.**
   - Toda a lógica vai para `lib/linha-do-tempo.ts` e componentes novos, com commits pequenos por fase e linhas citadas presas ao commit.
9. **A canonicalização pode esconder item mexido.**
   - O vínculo é explícito, sem tolerância numérica (a B usava ±0,05), e o teste de ida e volta está na Fase 2.
10. **Modelo aplicado desalinha os soltos** (`video-templates.ts:267` apaga textos e muda durações).
    - Fase 4: `realinharAoMudarCenas` também roda ao aplicar modelo, com teste.
11. **Espaço a 375px** (hoje: painel 175px, linha do tempo 138px).
    - Fase 2: teto de 150px, rolagem própria, barra do item no lugar das abas, e teste de retângulos sem sobreposição.
12. **Custo por clipe com até 12 camadas** (≈ 0,11s de CPU por camada-segundo a 1 núcleo, pela bancada do mapa).
    - Fase 4: bancada no pior caso limitada a 1 e 2 núcleos, Pexels baixado uma vez, e `p.tempos.cena` medido na Vercel.

## 6. Para o dono

- **Fase 1:** você não vê nada novo, mas o tempo embaixo passa a bater com o vídeo pronto. Três defeitos de hoje somem:
  - o vídeo do Você que congelava quando entrava depois do começo;
  - o som de virada que sumia depois da primeira troca quando não havia música nem voz;
  - o botão Editar da página rápida, que apagava coisas feitas no editor. Agora ele abre o editor.
- **Fase 2:** a linha do tempo ganha faixas, como no CapCut. Aparecem o Você, as legendas, os textos, a música e a voz, e dá para arrastar e aparar o Você, as legendas e as cenas com o dedo, com botão de desfazer.
- **Fase 3:** é o seu pedido: cortar o começo e o fim da música e da voz, mudar de lugar, pôr volume e fade, e ouvir na prévia.

  **Decisão sua, porque envolve crédito:** quando alguém reabre um vídeo com voz de IA e gera de novo, reaproveitar a voz que já existe, sem cobrar outra vez. É o que já fazemos com a cena animada.
- **Fase 4:** texto e adesivo passam a ter início e fim próprios e podem atravessar fotos. Nas viradas Deslizar, Aproximar e Desfoque aparece um aviso com um botão para trocar por Dissolver.
- **Fase 5:** acabamento, como o título que some quando você quiser.

**Outra decisão sua:** os consertos da Fase 1 mudam vídeos antigos quando forem gerados de novo. Mudam para melhor, e eu recomendo aceitar.

Task-observer: registrei a 0067, "Item de tempo dividido entre segmentos emendados em offset fracionário: a borda cai no quadro quantizado; provar contra render de referência quadro a quadro". A revisão do log nunca rodou, e há observações abertas; vale oferecer a revisão ao dono.