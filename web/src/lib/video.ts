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
// image-to-video. Os presets são o que corretor pede com essas palavras.
export type AnimacaoId = "drone" | "caminhar" | "girar" | "aproximar";

export const ANIMACOES: { id: AnimacaoId; rotulo: string; descricao: string; prompt: string }[] = [
  {
    id: "drone",
    rotulo: "Drone",
    descricao: "Câmera voando devagar sobre a fachada ou o terreno.",
    prompt: "Slow cinematic aerial drone shot gliding forward and gently rising over the property, smooth steady motion, natural daylight, photorealistic, no people, no text.",
  },
  {
    id: "caminhar",
    rotulo: "Caminhar",
    descricao: "Entrar no ambiente andando, como numa visita.",
    prompt: "Slow smooth walking dolly shot moving forward into the room, steady handheld-free camera, natural light, photorealistic, everything stays in place, no people, no text.",
  },
  {
    id: "girar",
    rotulo: "Girar",
    descricao: "A câmera gira devagar mostrando o ambiente.",
    prompt: "Slow smooth camera orbit panning around the space, revealing the room, steady motion, natural light, photorealistic, no people, no text.",
  },
  {
    id: "aproximar",
    rotulo: "Aproximar",
    descricao: "Zoom suave com profundidade de verdade.",
    prompt: "Slow cinematic push-in towards the center of the scene with subtle parallax, steady, natural light, photorealistic, no people, no text.",
  },
];

export type TipoCena = "foto" | "antes_depois" | "clipe" | "animada";

export type Cena = {
  tipo: TipoCena;
  /** Geração do Encena: usa o resultado (foto, animada) ou original + resultado (antes_depois). */
  jobId?: string;
  /** Arquivo enviado pela pessoa (foto ou clipe): caminho no bucket privado. */
  arquivo?: string;
  efeito?: EfeitoId;
  animacao?: AnimacaoId;
  legenda?: string;
  /** Segundos em tela. */
  duracao?: number;
  /** Só clipe: corrige cor e nitidez antes de entrar. */
  melhorar?: boolean;
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

export type EspecVideo = {
  formato: FormatoId;
  cenas: Cena[];
  musica: MusicaId;
  narracao: { roteiro: string; voz: VozId } | null;
  titulo: string;
  preco: string;
  local: string;
  /** Tela final com nome, CRECI, WhatsApp e logo do corretor. */
  telaFinal: boolean;
  transicao: "suave" | "corte";
};

export const LIMITES = {
  cenasMax: 12,
  duracaoMin: 3,
  duracaoMax: 8,
  duracaoPadrao: 4,
  legendaMax: 40,
  tituloMax: 50,
  roteiroMax: 700,
  telaFinalSegundos: 4,
  transicaoSegundos: 0.6,
};

// Créditos: vídeo estático custa 1 (o render é nosso, custa CPU e nada mais); cada
// cena animada soma 2 (sai pro fal, ≈ US$ 0,05-0,10); narração soma 1 (TTS). A Pedra
// cobra 5 por cena animada e 1 por narração.
export const CREDITOS = { base: 1, animada: 2, narracao: 1 };

export function custoDoVideo(e: Pick<EspecVideo, "cenas" | "narracao">): number {
  const animadas = e.cenas.filter((c) => c.tipo === "animada").length;
  return CREDITOS.base + animadas * CREDITOS.animada + (e.narracao ? CREDITOS.narracao : 0);
}

export function duracaoDaCena(c: Cena): number {
  const d = c.duracao ?? LIMITES.duracaoPadrao;
  return Math.min(Math.max(d, LIMITES.duracaoMin), LIMITES.duracaoMax);
}

export function duracaoEstimada(e: Pick<EspecVideo, "cenas" | "telaFinal" | "transicao">): number {
  const cenas = e.cenas.reduce((s, c) => s + duracaoDaCena(c), 0) + (e.telaFinal ? LIMITES.telaFinalSegundos : 0);
  const n = e.cenas.length + (e.telaFinal ? 1 : 0);
  const transicoes = e.transicao === "suave" ? Math.max(0, n - 1) * LIMITES.transicaoSegundos : 0;
  return Math.max(0, cenas - transicoes);
}

const ehId = <T extends string>(lista: { id: T }[], v: unknown): v is T => typeof v === "string" && lista.some((x) => x.id === v);

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
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
    if (tipo !== "foto" && tipo !== "antes_depois" && tipo !== "clipe" && tipo !== "animada") return { espec: null, erro: "Cena com tipo desconhecido." };
    const jobId = typeof c.jobId === "string" && /^[0-9a-f-]{36}$/.test(c.jobId) ? c.jobId : undefined;
    const arquivo = typeof c.arquivo === "string" && /^[\w./-]{1,200}$/.test(c.arquivo) && !c.arquivo.includes("..") ? c.arquivo : undefined;
    if (tipo === "antes_depois" && !jobId) return { espec: null, erro: "Antes e depois precisa de uma geração do Encena." };
    if (tipo === "clipe" && !arquivo) return { espec: null, erro: "Cena de clipe sem arquivo." };
    if ((tipo === "foto" || tipo === "animada") && !jobId && !arquivo) return { espec: null, erro: "Cena sem foto." };
    const duracaoNum = Number(c.duracao);
    cenas.push({
      tipo,
      jobId,
      arquivo,
      efeito: ehId(EFEITOS, c.efeito) ? c.efeito : "aproximar",
      animacao: tipo === "animada" ? (ehId(ANIMACOES, c.animacao) ? c.animacao : "caminhar") : undefined,
      legenda: texto(c.legenda, LIMITES.legendaMax) || undefined,
      duracao: Number.isFinite(duracaoNum) ? Math.min(Math.max(Math.round(duracaoNum), LIMITES.duracaoMin), LIMITES.duracaoMax) : LIMITES.duracaoPadrao,
      melhorar: tipo === "clipe" ? c.melhorar === true : undefined,
    });
  }

  const musica: MusicaId = ehId(MUSICAS, b.musica) ? b.musica : "nenhuma";
  let narracao: EspecVideo["narracao"] = null;
  if (b.narracao && typeof b.narracao === "object") {
    const n = b.narracao as Record<string, unknown>;
    const roteiro = texto(n.roteiro, LIMITES.roteiroMax);
    if (roteiro.length >= 10) narracao = { roteiro, voz: ehId(VOZES, n.voz) ? n.voz : "laura" };
  }

  return {
    espec: {
      formato: b.formato,
      cenas,
      musica,
      narracao,
      titulo: texto(b.titulo, LIMITES.tituloMax),
      preco: texto(b.preco, 30),
      local: texto(b.local, 50),
      telaFinal: b.telaFinal !== false,
      transicao: b.transicao === "corte" ? "corte" : "suave",
    },
    erro: null,
  };
}
