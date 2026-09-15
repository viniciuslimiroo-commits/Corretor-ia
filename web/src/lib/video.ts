// Catálogo e contrato do vídeo (Fase C). Importado pelo navegador e pelo servidor: aqui
// mora o que a tela oferece (formatos, efeitos, músicas, vozes), o que o pedido pode
// conter (EspecVideo) e quanto custa. Nada de segredo nem de ffmpeg -- isso é
// video-ffmpeg.ts, só servidor.
//
// Decisão de arquitetura (12/09/2026, medido): o vídeo é montado com ffmpeg dentro da
// própria Vercel, em etapas curtas -- uma cena por chamada (4s de vídeo = 4-5s de
// render local), e a montagem final numa chamada só (≈1x o tempo do vídeo). Cabe nos
// 300s do plano Hobby e não exige servidor novo. Cena animada é o único pedaço que sai
// pra IA (image-to-video no fal), e por isso é o único que custa crédito extra.

/** Bucket privado onde os uploads do vídeo entram por URL assinada (mesmo dos resultados). */
export const BUCKET_UPLOADS = "resultados";

export type FormatoId = "9:16" | "16:9" | "1:1" | "4:5";

export const FORMATOS: { id: FormatoId; rotulo: string; largura: number; altura: number; dica: string }[] = [
  { id: "9:16", rotulo: "Vertical", largura: 1080, altura: 1920, dica: "Reels, Stories, TikTok e WhatsApp" },
  { id: "16:9", rotulo: "Horizontal", largura: 1920, altura: 1080, dica: "YouTube, site e TV da imobiliária" },
  { id: "1:1", rotulo: "Quadrado", largura: 1080, altura: 1080, dica: "Feed do Instagram e do Facebook" },
  { id: "4:5", rotulo: "Retrato", largura: 1080, altura: 1350, dica: "Feed do Instagram, ocupa mais tela" },
];

export const FORMATOS_POR_ID = Object.fromEntries(FORMATOS.map((f) => [f.id, f])) as Record<FormatoId, (typeof FORMATOS)[number]>;

export type EfeitoId = "aproximar" | "afastar" | "esquerda" | "direita" | "parado";

export const EFEITOS: { id: EfeitoId; rotulo: string }[] = [
  { id: "aproximar", rotulo: "Aproximar" },
  { id: "afastar", rotulo: "Afastar" },
  { id: "esquerda", rotulo: "Passear ←" },
  { id: "direita", rotulo: "Passear →" },
  { id: "parado", rotulo: "Parado" },
];

// Cena animada: a foto vira um clipe de câmera em movimento por um modelo de
// image-to-video.
//
// TUDO AQUI É MOVIMENTO DE CÂMERA. Nenhum preset pede ação, personagem ou mudança de
// cena -- e isso precisa estar dito no prompt com todas as letras, porque o modelo lê
// "walking" e é capaz de desenhar alguém andando. Foi o que aconteceu: "Caminhar" gerou
// uma pessoa dentro do ambiente. O nome do preset fala com o corretor; o prompt fala com
// o modelo, e o modelo só entende "the CAMERA moves".
//
// O que segura de verdade é o NEGATIVO. Proibição dentro do prompt positivo é sugestão;
// `negative_prompt` é instrução -- e o campo existe na API do wan desde sempre, só não
// estava sendo usado.

/**
 * O que NENHUM vídeo de imóvel pode inventar. Vale para todos os presets.
 *
 * Duas famílias: gente e bicho (que não existiam na foto e viram problema jurídico num
 * anúncio), e mudança estrutural -- parede, porta, janela, móvel que aparece ou some.
 * O corretor está vendendo aquele imóvel, não uma variação dele.
 */
export const NEGATIVO_VIDEO = [
  "people, person, human, man, woman, child, family, realtor, agent, crowd, silhouette, reflection of a person",
  "animals, pets, dog, cat",
  "new furniture, furniture appearing or disappearing, moving furniture, new doors, new windows, new walls",
  "changing architecture, morphing walls, warping geometry, distorted perspective, floating objects",
  "text, captions, subtitles, watermark, logo, price tag, phone number, call to action, end card, title card",
  "cartoon, illustration, painting, oversaturated, flicker, jitter",
].join(", ");

/** O que TODO preset repete: é câmera, e o imóvel fica como está. */
const REGRA_CAMERA =
  "Only the camera moves. The room, the architecture, the furniture, the walls, doors, windows, floor and ceiling stay exactly as in the original photo, unchanged and undistorted. Consistent natural lighting. Photorealistic real-estate footage. The shot ends by decelerating smoothly to a still frame.";

export type AnimacaoId = "drone" | "caminhar" | "girar" | "aproximar";

export const ANIMACOES: { id: AnimacaoId; rotulo: string; descricao: string; prompt: string }[] = [
  {
    id: "drone",
    rotulo: "Sobrevoo",
    descricao: "A câmera sobe e avança devagar sobre a fachada ou o terreno.",
    prompt: `Slow cinematic aerial drone shot: the camera glides forward and rises gently over the property, smooth and steady. ${REGRA_CAMERA}`,
  },
  {
    id: "caminhar",
    rotulo: "Entrar no ambiente",
    descricao: "A câmera avança pelo cômodo, como quem entra. Não entra ninguém na cena.",
    // "as if the camera operator were walking" e não "a person walking": a diferença entre
    // descrever o MOVIMENTO e pedir um PERSONAGEM.
    prompt: `Simulate a smooth forward camera movement through the room, as if the camera operator were slowly walking into the space, steady dolly-in, no camera shake. ${REGRA_CAMERA}`,
  },
  {
    id: "girar",
    rotulo: "Girar em volta",
    descricao: "A câmera gira devagar no próprio eixo, mostrando o ambiente.",
    prompt: `Slow smooth camera orbit panning around the space to reveal the room, steady motion. ${REGRA_CAMERA}`,
  },
  {
    id: "aproximar",
    rotulo: "Aproximar com profundidade",
    descricao: "Zoom lento com parallax de verdade, como se a câmera avançasse.",
    prompt: `Slow cinematic push-in towards the centre of the scene with subtle parallax and real depth. ${REGRA_CAMERA}`,
  },
];

// Tour 360: a foto (ou o vídeo) equirretangular tem a cena inteira, então dá pra mover
// uma câmera de verdade dentro dela -- giro e inclinação reais, com a perspectiva
// correta em cada quadro. É o único jeito honesto de fazer "câmera passeando pelo
// ambiente" sem IA: numa foto comum não existe o que está atrás do sofá.
//
// Velocidade importa: 45°/s embrulha o estômago. Estes presets ficam entre 8 e 20°/s,
// que é o ritmo de tour imobiliário.
// Duas entradas diferentes, e confundir as duas entorta a imagem:
//   equirect     câmera 360 de verdade: 2:1, cobre 360°×180°.
//   panoramica   modo panorâmico do celular: projeção CILÍNDRICA, 3:1 ou mais, cobre
//                uns 180-220° na horizontal e pouco na vertical.
// Quase nenhum corretor tem câmera 360; todo celular tem modo panorâmico. Suportar os
// dois é o que faz esta função existir de verdade.
export type Projecao360 = "equirect" | "panoramica";

/** Pela proporção: 2:1 é equirretangular; acima de 2,6:1 é panorâmica de celular. */
export function projecaoPelaProporcao(largura: number, altura: number): Projecao360 | null {
  const r = largura / altura;
  if (r > 1.85 && r < 2.15 && largura >= 1800) return "equirect";
  if (r >= 2.6 && largura >= 1200) return "panoramica";
  return null;
}

/**
 * Campo de visão da panorâmica e o que cabe na saída.
 *
 * Uma panorâmica cilíndrica de largura W cobrindo `ihFov` graus tem raio
 * R = W / rad(ihFov); a altura H cobre então 2·atan(H/2R) graus. Pedir mais do que
 * isso devolve faixa cinza em cima e embaixo -- foi o que apareceu no primeiro teste
 * com a panorâmica real do Vinicius (12/09/2026).
 */
export function fovDaPanoramica(largura: number, altura: number, larguraSaida: number, alturaSaida: number, ihFov = 200) {
  const raio = largura / ((ihFov * Math.PI) / 180);
  const ivFov = (2 * Math.atan(altura / 2 / raio) * 180) / Math.PI;
  // Deixa 6% de margem pra não raspar a borda, e deriva o horizontal pelo formato.
  const vFov = Math.max(20, ivFov * 0.94);
  const hFov = (2 * Math.atan(Math.tan((vFov * Math.PI) / 360) * (larguraSaida / alturaSaida)) * 180) / Math.PI;
  return { ihFov, ivFov, hFov: Math.min(hFov, ihFov * 0.9), vFov };
}

export type Movimento360Id = "olhar_volta" | "giro_completo" | "entrar" | "panoramica" | "revelar";

export const MOVIMENTOS_360: { id: Movimento360Id; rotulo: string; descricao: string; yaw: [number, number]; pitch: [number, number]; fov: [number, number] }[] = [
  { id: "olhar_volta", rotulo: "Olhar em volta", descricao: "Vira devagar da esquerda pra direita.", yaw: [-70, 70], pitch: [0, 0], fov: [95, 95] },
  { id: "giro_completo", rotulo: "Giro completo", descricao: "Mostra o ambiente inteiro, 360°.", yaw: [-180, 180], pitch: [0, 0], fov: [100, 100] },
  { id: "entrar", rotulo: "Entrar no ambiente", descricao: "Abre o campo de visão como quem entra.", yaw: [-15, 15], pitch: [4, 0], fov: [110, 72] },
  { id: "panoramica", rotulo: "Panorâmica lenta", descricao: "Movimento suave e curto, bom pra fundo.", yaw: [-35, 35], pitch: [0, 0], fov: [90, 90] },
  { id: "revelar", rotulo: "Do piso ao ambiente", descricao: "Começa olhando pra baixo e levanta.", yaw: [-20, 20], pitch: [-35, 5], fov: [100, 92] },
];

/**
 * As emendas entre uma cena e a seguinte.
 *
 * Cinco, e nenhuma delas chama atenção pra si. Vídeo de imóvel com transição de
 * apresentação de colégio queima o imóvel -- o que vende é o ambiente, não o efeito.
 * Cada uma vira um `xfade` do ffmpeg, com a duração que faz sentido pra ela: o corte é
 * um xfade tão curto (0,08s) que o olho lê como corte seco, e isso deixa a montagem com
 * um caminho só em vez de dois.
 */
export type TransicaoId = "corte" | "dissolver" | "deslizar" | "aproximar" | "desfoque";

export const TRANSICOES: { id: TransicaoId; rotulo: string; xfade: string; segundos: number }[] = [
  { id: "corte", rotulo: "Corte", xfade: "fade", segundos: 0.08 },
  { id: "dissolver", rotulo: "Dissolver", xfade: "dissolve", segundos: 0.6 },
  { id: "deslizar", rotulo: "Deslizar", xfade: "slideleft", segundos: 0.6 },
  { id: "aproximar", rotulo: "Aproximar", xfade: "zoomin", segundos: 0.7 },
  { id: "desfoque", rotulo: "Desfoque", xfade: "hblur", segundos: 0.5 },
];

export const TRANSICAO_POR_ID = Object.fromEntries(TRANSICOES.map((t) => [t.id, t])) as Record<TransicaoId, (typeof TRANSICOES)[number]>;

/** "suave" era o nome antigo do dissolver, e ainda está gravado em vídeos do banco. */
export function ehTransicao(v: unknown): TransicaoId {
  if (v === "suave") return "dissolver";
  return TRANSICOES.some((t) => t.id === v) ? (v as TransicaoId) : "dissolver";
}

// ---- texto sobre a cena ----
//
// Não é um editor de texto livre, e isso é escolha. Posição livre (arrastar o texto pra
// qualquer ponto) exige uma tela de canvas, e o resultado quase sempre fica torto: o
// corretor põe o preço em cima da janela, o Instagram corta a borda, e o vídeo sai pior
// do que sairia sem. Três posições, três estilos e três animações cobrem o que um Reel de
// imóvel usa, e todas as combinações ficam boas.

export type PosicaoTexto = "topo" | "centro" | "base";
export type EstiloTexto = "faixa" | "destaque" | "etiqueta";
export type AnimacaoTexto = "nenhuma" | "surgir" | "subir";

export type TextoCena = {
  texto: string;
  posicao?: PosicaoTexto;
  estilo?: EstiloTexto;
  animacao?: AnimacaoTexto;
};

export const POSICOES_TEXTO: { id: PosicaoTexto; rotulo: string }[] = [
  { id: "topo", rotulo: "Em cima" },
  { id: "centro", rotulo: "No meio" },
  { id: "base", rotulo: "Embaixo" },
];

export const ESTILOS_TEXTO: { id: EstiloTexto; rotulo: string; tamanho: number; cor: string; dica: string }[] = [
  { id: "faixa", rotulo: "Faixa", tamanho: 0.03, cor: "0x0f2d5b", dica: "Branco sobre a cor da marca. É a legenda de sempre." },
  { id: "destaque", rotulo: "Destaque", tamanho: 0.052, cor: "0x0f2d5b", dica: "Grande, pro preço e pros números." },
  { id: "etiqueta", rotulo: "Etiqueta", tamanho: 0.026, cor: "0xf06b4f", dica: "Pequena e coral, pra “Lançamento”, “Vendido”." },
];

export const ESTILO_TEXTO_POR_ID = Object.fromEntries(ESTILOS_TEXTO.map((e) => [e.id, e])) as Record<EstiloTexto, (typeof ESTILOS_TEXTO)[number]>;

export const ANIMACOES_TEXTO: { id: AnimacaoTexto; rotulo: string }[] = [
  { id: "nenhuma", rotulo: "Parado" },
  { id: "surgir", rotulo: "Surgir" },
  { id: "subir", rotulo: "Subir" },
];

/**
 * As etiquetas que o mercado imobiliário usa, prontas.
 *
 * Existem porque ninguém abre um editor pra digitar "Lançamento" — abre pra terminar o
 * vídeo. Cada uma já vem com o estilo e o lugar em que costuma ficar boa.
 */
export const SELOS_IMOVEL: { id: string; texto: string; estilo: EstiloTexto; posicao: PosicaoTexto }[] = [
  { id: "lancamento", texto: "Lançamento", estilo: "etiqueta", posicao: "topo" },
  { id: "novo", texto: "Novo no mercado", estilo: "etiqueta", posicao: "topo" },
  { id: "oportunidade", texto: "Oportunidade", estilo: "etiqueta", posicao: "topo" },
  { id: "alto_padrao", texto: "Alto padrão", estilo: "etiqueta", posicao: "topo" },
  { id: "venda", texto: "À venda", estilo: "etiqueta", posicao: "topo" },
  { id: "aluguel", texto: "Para alugar", estilo: "etiqueta", posicao: "topo" },
  { id: "vendido", texto: "Vendido", estilo: "etiqueta", posicao: "centro" },
  { id: "reservado", texto: "Reservado", estilo: "etiqueta", posicao: "centro" },
  { id: "visita", texto: "Agende sua visita", estilo: "faixa", posicao: "base" },
  { id: "whats", texto: "Chame no WhatsApp", estilo: "faixa", posicao: "base" },
];

export type TipoCena = "foto" | "antes_depois" | "clipe" | "animada" | "tour360";

export type Cena = {
  tipo: TipoCena;
  /** Geração do Encena: usa o resultado (foto, animada) ou original + resultado (antes_depois). */
  jobId?: string;
  /** Arquivo enviado pela pessoa (foto ou clipe): caminho no bucket privado. */
  arquivo?: string;
  efeito?: EfeitoId;
  animacao?: AnimacaoId;
  /** Só tour360: como a câmera se move dentro da esfera. */
  movimento?: Movimento360Id;
  legenda?: string;
  /** Textos por cima da cena, além da legenda. Até `LIMITES.textosPorCena`. */
  textos?: TextoCena[];
  /** Segundos em tela. */
  duracao?: number;
  /** Só clipe: corrige cor e nitidez antes de entrar. */
  melhorar?: boolean;
  /** Só clipe e vídeo 360: de que segundo do arquivo a cena começa (aparar o começo). */
  inicio?: number;
  /** A emenda DESTA cena pra próxima. Ausente = a do vídeo. */
  transicao?: TransicaoId;
};

export type MusicaId = "nenhuma" | "calma" | "elegante" | "moderna" | "alegre" | "cinematografica";

// Faixas geradas uma vez (stable-audio-25 no fal, instrumentais, 45s) e guardadas em
// assets/musica. Sem licença de terceiros pra se preocupar.
export const MUSICAS: { id: MusicaId; rotulo: string; descricao: string; arquivo: string | null }[] = [
  { id: "nenhuma", rotulo: "Sem música", descricao: "", arquivo: null },
  { id: "calma", rotulo: "Calma", descricao: "Piano e cordas suaves", arquivo: "calma.m4a" },
  { id: "elegante", rotulo: "Elegante", descricao: "Lounge leve, alto padrão", arquivo: "elegante.m4a" },
  { id: "moderna", rotulo: "Moderna", descricao: "Eletrônica discreta", arquivo: "moderna.m4a" },
  { id: "alegre", rotulo: "Alegre", descricao: "Violão e palmas, clima de família", arquivo: "alegre.m4a" },
  { id: "cinematografica", rotulo: "Cinematográfica", descricao: "Orquestra crescente, lançamento", arquivo: "cinematografica.m4a" },
];

export type VozId = "laura" | "sarah" | "daniel" | "george";

export const VOZES: { id: VozId; rotulo: string; genero: "feminina" | "masculina"; elevenlabs: string }[] = [
  { id: "laura", rotulo: "Laura", genero: "feminina", elevenlabs: "Laura" },
  { id: "sarah", rotulo: "Sarah", genero: "feminina", elevenlabs: "Sarah" },
  { id: "daniel", rotulo: "Daniel", genero: "masculina", elevenlabs: "Daniel" },
  { id: "george", rotulo: "George", genero: "masculina", elevenlabs: "George" },
];

/**
 * Frases prontas pra tela final. Três, porque a pessoa escolhe entre poucas e escreve a
 * sua se nenhuma serve -- um campo em branco sem sugestão fica em branco.
 */
export const CHAMADAS = ["Agende sua visita", "Chame no WhatsApp", "Quero saber mais"];

/**
 * De onde vem a voz do vídeo.
 *
 * "ia" é a narração do ElevenLabs e custa crédito. "gravada" (microfone do navegador) e
 * "enviada" (MP3/M4A/WAV que a pessoa já tem) não custam nada: é o arquivo dela, e o
 * servidor só mistura. A voz própria é o motivo nº 1 de alguém gerar aqui e terminar no
 * CapCut, e era o buraco mais caro do produto.
 */
export type OrigemVoz = "ia" | "gravada" | "enviada";

export type Narracao = {
  origem: OrigemVoz;
  /** Só "ia". */
  roteiro?: string;
  voz?: VozId;
  /** "gravada" e "enviada": caminho no bucket privado. */
  arquivo?: string;
  /** 0,2 a 2. 1 = como veio. */
  volume?: number;
  /** Segundos de silêncio antes de a voz começar. */
  inicio?: number;
};

/** Narração que a IA grava -- a única que custa crédito. Espec antigo não tem `origem`. */
export function vozDeIA(n: Narracao | null | undefined): boolean {
  return !!n && (n.origem ?? "ia") === "ia";
}

// ---- legendas ----
//
// Reel de imóvel circula no Instagram com o som desligado: sem legenda, a narração que
// custou crédito não é ouvida por metade de quem vê. Os trechos saem da transcrição do
// ÁUDIO DE VOZ (não da música) e ficam guardados no espec, editáveis -- transcrição
// erra nome de bairro e de rua, e corrigir tem que ser possível.

export type TrechoLegenda = { inicio: number; fim: number; texto: string };
export type EstiloLegenda = "faixa" | "contorno";

export type Legendas = {
  trechos: TrechoLegenda[];
  estilo?: EstiloLegenda;
  posicao?: "base" | "centro";
};

export const ESTILOS_LEGENDA: { id: EstiloLegenda; rotulo: string; dica: string }[] = [
  { id: "faixa", rotulo: "Com fundo", dica: "Caixa escura atrás da frase. Lê em qualquer imagem." },
  { id: "contorno", rotulo: "Sem fundo", dica: "Letra branca com contorno preto, estilo Reels." },
];

export type EspecVideo = {
  formato: FormatoId;
  cenas: Cena[];
  musica: MusicaId;
  /** 0 a 1. Quando há voz, é o volume ANTES da redução automática. */
  musicaVolume?: number;
  narracao: Narracao | null;
  titulo: string;
  preco: string;
  local: string;
  /** Tela final com nome, CRECI, WhatsApp e logo do corretor. */
  telaFinal: boolean;
  /** Frase da tela final ("Agende sua visita"). Vazia = sem frase. Ausente em vídeos antigos. */
  chamada?: string;
  transicao: TransicaoId;
  /** Índice da cena que vira a miniatura (capa). Ausente ou inválido = a primeira. */
  capa?: number;
  /** Legendas queimadas no vídeo, com o tempo de cada trecho. */
  legendas?: Legendas | null;
};

/**
 * A duração de cada EMENDA, na ordem. Uma por par de clipes -- e a tela final é o
 * último clipe, então a emenda que leva até ela sai da última cena.
 *
 * Existe porque a transição deixou de ser uma só pro vídeo inteiro: cada cena escolhe a
 * sua, e a conta do tempo total e das posições depende disso.
 */
export function emendasDoVideo(e: Pick<EspecVideo, "cenas" | "transicao" | "telaFinal">): { xfade: string; segundos: number }[] {
  const clipes = e.cenas.length + (e.telaFinal ? 1 : 0);
  const lista: { xfade: string; segundos: number }[] = [];
  for (let i = 0; i < clipes - 1; i++) {
    lista.push(TRANSICAO_POR_ID[ehTransicao(e.cenas[i]?.transicao ?? e.transicao)]);
  }
  return lista;
}

export const LIMITES = {
  cenasMax: 12,
  duracaoMin: 3,
  /** Tour 360 pode ser mais longo (tem cena de verdade pra mostrar), mas cada segundo
   *  custa ~7s de render local e mais no servidor; 10s é o teto que cabe na função. */
  duracaoMax360: 10,
  duracaoMax: 8,
  duracaoPadrao: 4,
  legendaMax: 40,
  tituloMax: 50,
  chamadaMax: 40,
  roteiroMax: 700,
  /** Quanto a voz pode atrasar. Mais que isso e a pessoa quer cortar o áudio, não atrasar. */
  vozInicioMax: 10,
  /** Voz gravada no navegador: acima disso o arquivo fica grande e a espera, longa. */
  vozSegundosMax: 180,
  musicaVolumePadrao: 0.8,
  /** Teto de quanto dá pra aparar do começo de um clipe. */
  aparaMax: 60,
  /** Três já é muito numa tela de celular; a quarta linha vira poluição. */
  textosPorCena: 3,
  textoMax: 44,
  /** Um vídeo de 60s narrado dá ~25 trechos; 120 é teto de segurança, não de uso. */
  trechosMax: 120,
  trechoMax: 90,
  telaFinalSegundos: 4,
  transicaoSegundos: 0.6,
};

// Créditos: SÓ onde há IA de verdade.
//
// O vídeo montado, o tour 360 e o terreno rodam no nosso servidor: custam CPU, não
// modelo pago. Cobrar por eles era desvantagem de percepção sem justificativa de custo
// -- a Pedra anuncia "vídeos, tours e plantas ilimitados" e cobra crédito só na imagem
// (varredura de 12/09/2026, docs/pedra-varredura-12-09.md). Aqui é igual, e a cena
// animada custa 2 contra os 5 deles.
export const CREDITOS = { base: 0, animada: 2, narracao: 1 };

export function custoDoVideo(e: Pick<EspecVideo, "cenas" | "narracao">): number {
  const animadas = e.cenas.filter((c) => c.tipo === "animada").length;
  // A voz da pessoa (gravada ou enviada) não passa por modelo nenhum: não cobra.
  return CREDITOS.base + animadas * CREDITOS.animada + (vozDeIA(e.narracao) ? CREDITOS.narracao : 0);
}

export function duracaoDaCena(c: Cena): number {
  const teto = c.tipo === "tour360" ? LIMITES.duracaoMax360 : LIMITES.duracaoMax;
  const d = c.duracao ?? (c.tipo === "tour360" ? 10 : LIMITES.duracaoPadrao);
  return Math.min(Math.max(d, LIMITES.duracaoMin), teto);
}

export function duracaoEstimada(e: Pick<EspecVideo, "cenas" | "telaFinal" | "transicao">): number {
  const cenas = e.cenas.reduce((s, c) => s + duracaoDaCena(c), 0) + (e.telaFinal ? LIMITES.telaFinalSegundos : 0);
  // Cada emenda come o tempo da sobreposição: duas cenas de 4s com 0,6s de dissolver
  // dão 7,4s de vídeo, não 8.
  const transicoes = emendasDoVideo(e).reduce((s, t) => s + t.segundos, 0);
  return Math.max(0, cenas - transicoes);
}

const ehId = <T extends string>(lista: { id: T }[], v: unknown): v is T => typeof v === "string" && lista.some((x) => x.id === v);

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
}

/** Os textos de uma cena, limpos. Tudo que vier torto vira o padrão; vazio some. */
function limparTextos(bruto: unknown): TextoCena[] | undefined {
  if (!Array.isArray(bruto)) return undefined;
  const lista: TextoCena[] = [];
  for (const b of bruto.slice(0, LIMITES.textosPorCena)) {
    const t = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const conteudo = texto(t.texto, LIMITES.textoMax);
    if (!conteudo) continue;
    lista.push({
      texto: conteudo,
      posicao: POSICOES_TEXTO.some((p) => p.id === t.posicao) ? (t.posicao as PosicaoTexto) : "base",
      estilo: ESTILOS_TEXTO.some((e) => e.id === t.estilo) ? (t.estilo as EstiloTexto) : "faixa",
      animacao: ANIMACOES_TEXTO.some((a) => a.id === t.animacao) ? (t.animacao as AnimacaoTexto) : "nenhuma",
    });
  }
  return lista.length ? lista : undefined;
}

/**
 * Os trechos de legenda, limpos e em ordem.
 *
 * Trecho sem texto, com tempo invertido ou de duração zero é descartado: um deles
 * sozinho já derruba o filtro do ffmpeg, e a transcrição às vezes devolve exatamente
 * isso no fim do áudio.
 */
export function limparLegendas(bruto: unknown): Legendas | null {
  const b = (bruto && typeof bruto === "object" ? bruto : null) as Record<string, unknown> | null;
  if (!b) return null;
  const crus = Array.isArray(b.trechos) ? b.trechos : [];
  const trechos: TrechoLegenda[] = [];
  for (const c of crus.slice(0, LIMITES.trechosMax)) {
    const t = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const inicio = Number(t.inicio);
    const fim = Number(t.fim);
    const conteudo = texto(t.texto, LIMITES.trechoMax);
    if (!conteudo || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio || inicio < 0) continue;
    trechos.push({ inicio: Math.round(inicio * 100) / 100, fim: Math.round(fim * 100) / 100, texto: conteudo });
  }
  if (!trechos.length) return null;
  trechos.sort((x, y) => x.inicio - y.inicio);
  return {
    trechos,
    estilo: ESTILOS_LEGENDA.some((e) => e.id === b.estilo) ? (b.estilo as EstiloLegenda) : "faixa",
    posicao: b.posicao === "centro" ? "centro" : "base",
  };
}

/**
 * Os textos que a cena desenha, na ordem: a legenda primeiro, depois os outros.
 *
 * A legenda continua sendo um campo só dela porque é o texto que quase toda cena tem, e
 * pedir "adicione um texto" pra escrever "Sala de estar" seria burocracia. Mas ela é
 * DESENHADA pelo mesmo caminho dos outros -- um motor de texto só, não dois.
 */
export function textosDaCena(c: Pick<Cena, "legenda" | "textos">): TextoCena[] {
  const daLegenda: TextoCena[] = c.legenda ? [{ texto: c.legenda, posicao: "base", estilo: "faixa", animacao: "nenhuma" }] : [];
  return [...daLegenda, ...(c.textos ?? [])].slice(0, LIMITES.textosPorCena + 1);
}

/**
 * Valida e limpa o pedido vindo do navegador. Devolve o espec pronto ou uma mensagem
 * de erro em português. Nunca confia no que veio: os textos vão pro drawtext e o
 * roteiro vai pro TTS.
 */
export function limparEspec(bruto: unknown): { espec: EspecVideo; erro: null } | { espec: null; erro: string } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  if (!ehId(FORMATOS, b.formato)) return { espec: null, erro: "Escolha o formato do vídeo." };
  const cenasBrutas = Array.isArray(b.cenas) ? b.cenas : [];
  if (cenasBrutas.length === 0) return { espec: null, erro: "Adicione pelo menos uma foto." };
  if (cenasBrutas.length > LIMITES.cenasMax) return { espec: null, erro: `No máximo ${LIMITES.cenasMax} cenas por vídeo.` };

  const cenas: Cena[] = [];
  for (const cb of cenasBrutas) {
    const c = (cb && typeof cb === "object" ? cb : {}) as Record<string, unknown>;
    const tipo = c.tipo;
    if (tipo !== "foto" && tipo !== "antes_depois" && tipo !== "clipe" && tipo !== "animada" && tipo !== "tour360") return { espec: null, erro: "Cena com tipo desconhecido." };
    const jobId = typeof c.jobId === "string" && /^[0-9a-f-]{36}$/.test(c.jobId) ? c.jobId : undefined;
    const arquivo = typeof c.arquivo === "string" && /^[\w./-]{1,200}$/.test(c.arquivo) && !c.arquivo.includes("..") ? c.arquivo : undefined;
    if (tipo === "antes_depois" && !jobId) return { espec: null, erro: "Antes e depois precisa de uma geração do Encena." };
    if (tipo === "clipe" && !arquivo) return { espec: null, erro: "Cena de clipe sem arquivo." };
    if (tipo === "tour360" && !arquivo) return { espec: null, erro: "Cena 360 sem arquivo. Envie a foto ou o vídeo 360." };
    if ((tipo === "foto" || tipo === "animada") && !jobId && !arquivo) return { espec: null, erro: "Cena sem foto." };
    const duracaoNum = Number(c.duracao);
    const teto = tipo === "tour360" ? LIMITES.duracaoMax360 : LIMITES.duracaoMax;
    const padrao = tipo === "tour360" ? 10 : LIMITES.duracaoPadrao;
    const inicioNum = Number(c.inicio);
    cenas.push({
      tipo,
      jobId,
      arquivo,
      inicio: Number.isFinite(inicioNum) && inicioNum > 0 ? Math.min(LIMITES.aparaMax, Math.round(inicioNum * 10) / 10) : undefined,
      transicao: c.transicao === undefined || c.transicao === null ? undefined : ehTransicao(c.transicao),
      efeito: ehId(EFEITOS, c.efeito) ? c.efeito : "aproximar",
      animacao: tipo === "animada" ? (ehId(ANIMACOES, c.animacao) ? c.animacao : "caminhar") : undefined,
      movimento: tipo === "tour360" ? (ehId(MOVIMENTOS_360, c.movimento) ? c.movimento : "olhar_volta") : undefined,
      legenda: texto(c.legenda, LIMITES.legendaMax) || undefined,
      textos: limparTextos(c.textos),
      duracao: Number.isFinite(duracaoNum) ? Math.min(Math.max(Math.round(duracaoNum), LIMITES.duracaoMin), teto) : padrao,
      melhorar: tipo === "clipe" ? c.melhorar === true : undefined,
    });
  }

  const musica: MusicaId = ehId(MUSICAS, b.musica) ? b.musica : "nenhuma";
  const volumeMusica = Number(b.musicaVolume);
  const musicaVolume = Number.isFinite(volumeMusica) ? Math.min(1, Math.max(0, volumeMusica)) : LIMITES.musicaVolumePadrao;

  let narracao: EspecVideo["narracao"] = null;
  if (b.narracao && typeof b.narracao === "object") {
    const n = b.narracao as Record<string, unknown>;
    // Espec gravado antes da voz própria não tem `origem`, e era sempre IA.
    const origem: OrigemVoz = n.origem === "gravada" || n.origem === "enviada" ? n.origem : "ia";
    const vol = Number(n.volume);
    const ini = Number(n.inicio);
    const comum = {
      volume: Number.isFinite(vol) ? Math.min(2, Math.max(0.2, vol)) : 1,
      inicio: Number.isFinite(ini) ? Math.min(LIMITES.vozInicioMax, Math.max(0, Math.round(ini * 10) / 10)) : 0.7,
    };
    if (origem === "ia") {
      const roteiro = texto(n.roteiro, LIMITES.roteiroMax);
      if (roteiro.length >= 10) narracao = { origem, roteiro, voz: ehId(VOZES, n.voz) ? n.voz : "laura", ...comum };
    } else {
      // Mesma regra dos arquivos de cena: só caminho do bucket, sem subir de pasta.
      const arquivo = typeof n.arquivo === "string" && /^[\w./-]{1,200}$/.test(n.arquivo) && !n.arquivo.includes("..") ? n.arquivo : undefined;
      if (arquivo) narracao = { origem, arquivo, ...comum };
    }
  }

  // Capa fora da lista (cena removida depois de escolhida) volta pra primeira, sem erro:
  // é o que a pessoa esperaria, e não vale travar o vídeo por isso.
  const capaNum = Number(b.capa);
  const capa = Number.isInteger(capaNum) && capaNum >= 0 && capaNum < cenas.length ? capaNum : 0;

  return {
    espec: {
      formato: b.formato,
      cenas,
      musica,
      musicaVolume,
      narracao,
      titulo: texto(b.titulo, LIMITES.tituloMax),
      preco: texto(b.preco, 30),
      local: texto(b.local, 50),
      telaFinal: b.telaFinal !== false,
      chamada: texto(b.chamada, LIMITES.chamadaMax),
      transicao: ehTransicao(b.transicao),
      capa,
      legendas: limparLegendas(b.legendas),
    },
    erro: null,
  };
}
