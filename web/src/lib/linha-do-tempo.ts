// A LINHA DO TEMPO EM FAIXAS, sem React (docs/planos/linha-do-tempo-spec.md, seção C; pacote P3).
//
// Tudo o que o editor põe no vídeo vira BLOCO numa faixa: cenas, Você, voz, música, textos,
// adesivos e legendas. Esta biblioteca é a conta por trás disso -- onde cada bloco começa e
// termina, o que um gesto (mover, aparar, deslizar o trecho, dividir, apagar) faz com o
// estado, e quais botões a barra mostra pra coisa selecionada.
//
// Pura de propósito: sem DOM, sem fetch, sem relógio nem sorteio (o id novo vem de fora).
// É o que deixa o teste (scripts/testar-linha-gestos.ts) rodar 2000 sequências de gestos e
// conferir que o que se vê na linha do tempo é o que sai do saneador e volta ao reabrir.
//
// Toda função é genérica na cena (`C`) e só ESPALHA a cena que já existe ({...cena, ...}):
// os campos que só o editor conhece (miniatura, rótulo, animação guardada) atravessam
// qualquer operação sem esta biblioteca saber que existem.

import {
  LIMITES,
  MUSICA_POR_ID,
  VOZ_PADRAO,
  canonizarAudio,
  itensDeAudioDoEspec,
  relogioDoEspec,
  temVideoCorrendo,
  vozDeIA,
  type Apresentador,
  type Cena,
  type EfeitoSonoroId,
  type EspecVideo,
  type ItemAudio,
  type Legendas,
  type MusicaId,
  type Narracao,
  type PosicaoTexto,
  type RelogioDoVideo,
  type TrechoLegenda,
  type TransicaoId,
  type VozId,
} from "./video";
import { SEGUNDOS_MUSICA } from "./segundos-do-catalogo";

// ---------- tipos ----------

export const ORDEM_DAS_FAIXAS = ["voce", "voz", "musica", "textos", "adesivos", "legendas"] as const;
export type FaixaId = (typeof ORDEM_DAS_FAIXAS)[number];
export type TrilhaId = "cenas" | FaixaId;

export type RefItem =
  | { faixa: "cenas"; chave: string }
  | { faixa: "telaFinal" }
  | { faixa: "voce" }
  | { faixa: "voz"; id: string }
  | { faixa: "musica"; id: string }
  /** `indice` −1 = a legenda da cena (`cena.legenda`). */
  | { faixa: "textos"; chave: string; indice: number }
  | { faixa: "titulo" }
  | { faixa: "adesivos"; chave: string; indice: number }
  /** Os trechos estão sempre em ordem (`normalizarLegendas`). */
  | { faixa: "legendas"; indice: number };

export type CenaBase = Cena & { chave: string };

export type EstadoLinha<C extends CenaBase = CenaBase> = {
  cenas: C[];
  transicao: TransicaoId;
  telaFinal: boolean;
  titulo: string;
  audios: ItemAudio[];
  narracao: Narracao | null;
  musicaVolume: number;
  efeitoSonoro: EfeitoSonoroId;
  apresentador: Apresentador | null;
  legendas: Legendas | null;
};

export type Medidas = {
  /** Duração do arquivo de voz, quando já se sabe (gravada, enviada, ou de IA já gerada). */
  segundosDaVoz: number | null;
  /** Voz de IA ainda não gerada: o tamanho é chute pelo roteiro. */
  vozEstimada: boolean;
  /** `roteiro.length / 15`. */
  segundosEstimadosDaVoz: number;
  /** Duração do vídeo do Você, quando o navegador já leu. */
  segundosDoVoce: number | null;
};

export type Ctx<C extends CenaBase = CenaBase> = { estado: EstadoLinha<C>; relogio: RelogioDoVideo; medidas: Medidas };
export type Opcoes = { pontos: number[]; limiarSeg: number; novoId: () => string };

export type Gesto =
  | { tipo: "mover"; delta: number }
  | { tipo: "aparaInicio"; para: number }
  | { tipo: "aparaFim"; para: number }
  | { tipo: "deslizarTrecho"; delta: number }
  | { tipo: "reordenar"; paraIndice: number };

export type ResultadoGesto<C extends CenaBase = CenaBase> = {
  estado: EstadoLinha<C>;
  selecao: RefItem | null;
  de: number;
  ate: number;
  corte?: number;
  /** Onde desenhar a guia tracejada do encaixe; null = não encaixou. */
  guia: number | null;
  /** O gesto parou num limite do ARQUIVO (começo ou fim do som, ou do Você). */
  parouNaBorda: boolean;
  mudou: boolean;
  narracaoDesligada?: boolean;
};

export type BlocoLinha = {
  ref: RefItem;
  trilha: TrilhaId;
  de: number;
  ate: number;
  rotulo: string;
  /** Preso à foto: texto e adesivo andam com a cena. */
  preso?: true;
  contagem?: number;
  itens?: RefItem[];
  /** Faixa fina (o título, no alto da faixa de textos). */
  fina?: true;
  /** O tamanho é chute (voz de IA ainda não gerada, Você sem duração lida). */
  estimado?: true;
  /** Começa depois do fim do vídeo: sai fora na montagem. */
  foraDoVideo?: true;
  semSom?: true;
  alcas: { inicio: boolean; fim: boolean };
  movel: boolean;
  onda?: { musica: MusicaId; corte: number; duracao: number; laco: boolean };
  fades?: { entrada: number; saida: number };
};

export type FaixasDaLinha = { trilhas: Record<TrilhaId, BlocoLinha[]>; marcasDeEfeito: number[]; total: number };

export type AcaoBarra = { id: string; rotulo: string; icone: string; ativo: boolean; motivo?: string; perigo?: true };

// ---------- números ----------

const c2 = (x: number) => Math.round(x * 100) / 100;
const c1 = (x: number) => Math.round(x * 10) / 10;
const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const quase = (a: number, b: number) => Math.abs(a - b) < 0.005;
const GERANDO = "Espere o vídeo terminar de gerar";

/** Duração do arquivo da música (contagem de amostras). 45s é o que todas medem hoje. */
export function segundosDaMusica(id: MusicaId): number {
  return SEGUNDOS_MUSICA[id] ?? MUSICA_POR_ID[id]?.segundos ?? 45;
}

// ---------- estado <-> espec ----------

/** Os campos de `Cena`, na lista explícita: o resto do objeto é do editor e não vai pro servidor. */
const CAMPOS_DA_CENA = [
  "tipo", "jobId", "arquivo", "efeito", "animacao", "movimento", "legenda", "textos", "elementos", "duracao", "melhorar",
  "inicio", "transicao", "filtro", "intensidade", "ajustes", "luz", "giro", "espelho", "velocidade", "congelar",
] as const satisfies readonly (keyof Cena)[];

function soCena(c: CenaBase): Cena {
  const r: Record<string, unknown> = {};
  for (const k of CAMPOS_DA_CENA) if (c[k] !== undefined) r[k] = c[k];
  return r as Cena;
}

/**
 * Os trechos que VALEM: sem narração, voz não toca; narração ligada sem trecho de voz
 * ganha o trecho padrão (é o que o editor mostra assim que a pessoa liga a voz).
 * Derivado, nunca guardado assim.
 */
export function audiosEfetivos(audios: ItemAudio[], narracao: Narracao | null): ItemAudio[] {
  if (!narracao) return audios.filter((a) => a.fonte.tipo !== "voz");
  if (audios.some((a) => a.fonte.tipo === "voz")) return audios;
  return [...audios, { ...VOZ_PADRAO, fonte: { tipo: "voz" } }];
}

/** O estado da linha a partir de um espec (reabrir um vídeo). `chaves` dá a identidade de cada cena. */
export function estadoDoEspec(e: EspecVideo, chaves?: string[]): EstadoLinha<CenaBase> {
  return {
    cenas: e.cenas.map((c, i) => ({ ...c, chave: chaves?.[i] ?? `cena${i}` })),
    transicao: e.transicao,
    telaFinal: e.telaFinal,
    titulo: e.titulo,
    audios: itensDeAudioDoEspec(e),
    narracao: e.narracao,
    musicaVolume: e.musicaVolume ?? LIMITES.musicaVolumePadrao,
    efeitoSonoro: e.efeitoSonoro ?? "nenhum",
    apresentador: e.apresentador ?? null,
    legendas: e.legendas ?? null,
  };
}

/** O espec a salvar: o `base` com o que a linha do tempo mexe por cima, áudio já na forma canônica. */
export function especDoEstado<C extends CenaBase>(base: EspecVideo, s: EstadoLinha<C>): EspecVideo {
  const { audios: _a, versao: _v, ...resto } = base;
  void _a;
  void _v;
  return {
    ...resto,
    cenas: s.cenas.map(soCena),
    transicao: s.transicao,
    telaFinal: s.telaFinal,
    titulo: s.titulo,
    efeitoSonoro: s.efeitoSonoro,
    apresentador: s.apresentador,
    legendas: s.legendas,
    ...canonizarAudio({ itens: audiosEfetivos(s.audios, s.narracao), narracao: s.narracao, musicaVolume: s.musicaVolume }),
  };
}

/**
 * A voz de IA já gravada volta com o `arquivo` -- não roda o TTS de novo e não cobra -- só
 * quando roteiro e voz são EXATAMENTE os que a gravaram. Texto mudou, voz nova.
 */
export function narracaoComReuso(n: Narracao | null, guardada: { caminho: string; roteiro: string; voz: VozId } | null): Narracao | null {
  if (!n || !vozDeIA(n) || !guardada) return n;
  if (n.roteiro !== guardada.roteiro || n.voz !== guardada.voz) return n;
  return { ...n, arquivo: guardada.caminho };
}

/** Trechos em ordem de início (e de fim, no empate), sem trocar os iguais de lugar. */
export function normalizarLegendas(l: Legendas | null): Legendas | null {
  if (!l) return null;
  const trechos = l.trechos.map((t, i) => ({ t, i })).sort((a, b) => a.t.inicio - b.t.inicio || a.t.fim - b.t.fim || a.i - b.i).map((x) => x.t);
  return { ...l, trechos };
}

export function ctxDoEstado<C extends CenaBase>(estado: EstadoLinha<C>, medidas: Medidas): Ctx<C> {
  return { estado, relogio: relogioDoEspec({ cenas: estado.cenas, telaFinal: estado.telaFinal, transicao: estado.transicao }), medidas };
}

// ---------- geometria de cada coisa ----------

type Geo = { de: number; ate: number; estimado: boolean; /** onde o arquivo acaba no vídeo; Infinity em laço */ fimDoArquivo: number; len: number | null };

function geoAudio(ctx: Ctx<CenaBase>, a: ItemAudio): Geo {
  const total = ctx.relogio.total;
  const N = a.noVideo;
  const C = a.corteArquivo;
  if (a.fonte.tipo === "musica") {
    const seg = segundosDaMusica(a.fonte.id);
    const laco = a.laco !== false;
    const D = Math.max(0, a.duracao ?? (laco ? total - N : seg - C));
    return { de: N, ate: Math.max(N, Math.min(total, N + D)), estimado: false, fimDoArquivo: laco ? Infinity : Math.max(N, N + seg - C), len: seg };
  }
  // Corte depois do fim do arquivo (voz trocada por uma mais curta): o trecho não tem som e
  // vira bloco de largura zero -- nunca largura NEGATIVA, que jogava o "mover" pra −588s.
  const m = ctx.medidas;
  const len = m.vozEstimada ? m.segundosEstimadosDaVoz : m.segundosDaVoz;
  const D = Math.max(0, a.duracao ?? (len != null ? len - C : 5));
  return { de: N, ate: Math.max(N, Math.min(total, N + D)), estimado: m.vozEstimada || len == null, fimDoArquivo: len != null ? Math.max(N, N + len - C) : Infinity, len };
}

function geoVoce(ctx: Ctx<CenaBase>, a: Apresentador) {
  const total = ctx.relogio.total;
  const entra = a.entra ?? 0;
  const inicio = a.inicio ?? 0;
  const disp = (ctx.medidas.segundosDoVoce ?? inicio + 8) - inicio;
  const dur = Math.max(0, Math.min(a.duracao ?? disp, disp, total - entra));
  return { de: entra, ate: entra + dur, disp, inicio, estimado: ctx.medidas.segundosDoVoce == null };
}

/** Onde a cena k aparece: do início do clipe dela ao início do próximo (a emenda já mostra o seguinte). */
function spanDaCena(r: RelogioDoVideo, k: number) {
  return { de: r.clipes[k]?.inicio ?? 0, ate: r.clipes[k + 1]?.inicio ?? r.total };
}

/** Onde o carimbo do título some: no fim da emenda pra tela final (VP:654), ou no fim do vídeo. */
function fimDoTitulo(ctx: Ctx<CenaBase>): number {
  const r = ctx.relogio;
  if (!ctx.estado.telaFinal || r.clipes.length <= ctx.estado.cenas.length) return r.total;
  const ultima = r.emendas[r.emendas.length - 1]?.segundos ?? 0;
  return r.total - LIMITES.telaFinalSegundos + ultima;
}

function itemDoRef(ctx: Ctx<CenaBase>, ref: RefItem): ItemAudio | null {
  if (ref.faixa !== "musica" && ref.faixa !== "voz") return null;
  return audiosEfetivos(ctx.estado.audios, ctx.estado.narracao).find((a) => a.id === ref.id && a.fonte.tipo === (ref.faixa === "musica" ? "musica" : "voz")) ?? null;
}

export function trilhaDoRef(ref: RefItem): TrilhaId {
  if (ref.faixa === "telaFinal") return "cenas";
  if (ref.faixa === "titulo") return "textos";
  return ref.faixa;
}

export function mesmoRef(a: RefItem | null, b: RefItem | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- os blocos ----------

export function blocosDoEstado(ctx: Ctx<CenaBase>): FaixasDaLinha {
  const { estado: s, relogio: r } = ctx;
  const total = r.total;
  const trilhas: Record<TrilhaId, BlocoLinha[]> = { cenas: [], voce: [], voz: [], musica: [], textos: [], adesivos: [], legendas: [] };
  const semAlca = { inicio: false, fim: false };

  s.cenas.forEach((c, k) => {
    const { de, ate } = spanDaCena(r, k);
    // As bordas da cena se arrastam (aparaCena). Cena animada não: cada duração é outro
    // pedido ao modelo -- ela muda pelo seletor de duração, que mostra as que existem.
    const alcas = c.tipo === "animada" ? semAlca : { inicio: true, fim: true };
    trilhas.cenas.push({ ref: { faixa: "cenas", chave: c.chave }, trilha: "cenas", de, ate, rotulo: `Foto ${k + 1}`, alcas, movel: true });
  });
  if (s.telaFinal && r.clipes.length > s.cenas.length) {
    trilhas.cenas.push({ ref: { faixa: "telaFinal" }, trilha: "cenas", de: r.clipes[s.cenas.length].inicio, ate: total, rotulo: "Tela final", alcas: semAlca, movel: false });
  }

  if (s.apresentador) {
    const g = geoVoce(ctx, s.apresentador);
    trilhas.voce.push({
      ref: { faixa: "voce" },
      trilha: "voce",
      de: g.de,
      ate: g.ate,
      rotulo: "Você",
      ...(g.estimado ? { estimado: true as const } : {}),
      ...(g.de >= total - 1 ? { foraDoVideo: true as const } : {}),
      alcas: { inicio: true, fim: true },
      movel: true,
    });
  }

  for (const a of audiosEfetivos(s.audios, s.narracao)) {
    const g = geoAudio(ctx, a);
    const fora = a.noVideo >= total - LIMITES.audioMin;
    if (a.fonte.tipo === "voz") {
      trilhas.voz.push({
        ref: { faixa: "voz", id: a.id },
        trilha: "voz",
        de: g.de,
        ate: Math.max(g.de, g.ate),
        rotulo: "Voz",
        ...(g.estimado ? { estimado: true as const } : {}),
        ...(fora ? { foraDoVideo: true as const } : {}),
        alcas: { inicio: !g.estimado, fim: !g.estimado },
        movel: true,
        fades: { entrada: a.fadeEntrada, saida: a.fadeSaida },
      });
    } else {
      const laco = a.laco !== false;
      trilhas.musica.push({
        ref: { faixa: "musica", id: a.id },
        trilha: "musica",
        de: g.de,
        ate: Math.max(g.de, g.ate),
        rotulo: MUSICA_POR_ID[a.fonte.id]?.rotulo ?? "Música",
        ...(fora ? { foraDoVideo: true as const } : {}),
        alcas: { inicio: true, fim: true },
        movel: true,
        onda: { musica: a.fonte.id, corte: a.corteArquivo, duracao: Math.max(0, g.ate - g.de), laco },
        fades: { entrada: a.fadeEntrada, saida: a.fadeSaida },
      });
    }
  }
  trilhas.voz.sort((a, b) => a.de - b.de);
  trilhas.musica.sort((a, b) => a.de - b.de);

  if (s.titulo.trim()) {
    trilhas.textos.push({ ref: { faixa: "titulo" }, trilha: "textos", de: 0, ate: fimDoTitulo(ctx), rotulo: s.titulo, fina: true, alcas: semAlca, movel: false });
  }
  s.cenas.forEach((c, k) => {
    const { de, ate } = spanDaCena(r, k);
    const textos: RefItem[] = [
      ...(c.legenda ? [{ faixa: "textos" as const, chave: c.chave, indice: -1 }] : []),
      ...(c.textos ?? []).map((_, i) => ({ faixa: "textos" as const, chave: c.chave, indice: i })),
    ];
    if (textos.length) {
      const primeiro = c.legenda || c.textos?.[0]?.texto || "Texto";
      trilhas.textos.push({ ref: textos[0], trilha: "textos", de, ate, rotulo: textos.length > 1 ? `${textos.length} textos` : primeiro, preso: true, contagem: textos.length, itens: textos, alcas: semAlca, movel: false });
    }
    const pecas = (c.elementos ?? []).map((_, i) => ({ faixa: "adesivos" as const, chave: c.chave, indice: i }));
    if (pecas.length) {
      trilhas.adesivos.push({ ref: pecas[0], trilha: "adesivos", de, ate, rotulo: pecas.length > 1 ? `${pecas.length} adesivos` : "Adesivo", preso: true, contagem: pecas.length, itens: pecas, alcas: semAlca, movel: false });
    }
  });

  (s.legendas?.trechos ?? []).forEach((t, i) => {
    trilhas.legendas.push({
      ref: { faixa: "legendas", indice: i },
      trilha: "legendas",
      de: t.inicio,
      ate: Math.max(t.inicio, Math.min(t.fim, total)),
      rotulo: t.texto || "Legenda",
      ...(t.inicio >= total ? { foraDoVideo: true as const } : {}),
      alcas: semAlca,
      movel: true,
    });
  });

  return { trilhas, marcasDeEfeito: s.efeitoSonoro !== "nenhum" ? r.emendas.map((e) => e.de) : [], total };
}

// ---------- encaixe ----------

/** Pontos em que um arraste gruda: 0, o fim, o cursor, o começo de cada cena e as bordas dos outros blocos. */
export function pontosDeEncaixe(ctx: Ctx<CenaBase>, excluir: RefItem | null, cursor: number): number[] {
  const f = blocosDoEstado(ctx);
  const pontos = [0, f.total, cursor, ...ctx.relogio.clipes.map((c) => c.inicio)];
  for (const t of ORDEM_DAS_FAIXAS) {
    for (const b of f.trilhas[t]) {
      if (mesmoRef(b.ref, excluir) || b.preso || b.fina) continue;
      pontos.push(b.de, b.ate);
    }
  }
  return [...new Set(pontos.map(c2))].sort((a, b) => a - b);
}

export function encaixar(t: number, pontos: number[], limiar: number): { t: number; guia: number | null } {
  let melhor: number | null = null;
  for (const p of pontos) if (Math.abs(p - t) <= limiar && (melhor === null || Math.abs(p - t) < Math.abs(melhor - t))) melhor = p;
  return melhor === null ? { t, guia: null } : { t: melhor, guia: melhor };
}

/** Entre que pontos o item pode ficar: fim do vizinho de trás, começo do da frente (na mesma faixa). */
export function limitesDoItem(ctx: Ctx<CenaBase>, ref: RefItem): { antes: number; depois: number } {
  const total = ctx.relogio.total;
  const item = itemDoRef(ctx, ref);
  if (!item) return { antes: 0, depois: total };
  let antes = 0;
  let depois = total;
  for (const o of audiosEfetivos(ctx.estado.audios, ctx.estado.narracao)) {
    if (o.id === item.id || o.fonte.tipo !== item.fonte.tipo) continue;
    if (o.noVideo <= item.noVideo) antes = Math.max(antes, geoAudio(ctx, o).ate);
    else depois = Math.min(depois, o.noVideo);
  }
  return { antes, depois };
}

// ---------- gestos ----------

/** O trecho com as chaves na ordem do saneador (A2): id, fonte, noVideo, corte, duracao?, volume, fades, laco?. */
function trecho(a: ItemAudio, m: { noVideo: number; corteArquivo: number; duracao: number | undefined; fadeEntrada?: number; fadeSaida?: number; id?: string }): ItemAudio {
  const duracao = m.duracao === undefined ? undefined : c2(m.duracao);
  let fi = m.fadeEntrada ?? a.fadeEntrada;
  let fo = m.fadeSaida ?? a.fadeSaida;
  // Mesma conta do saneador: fades que não cabem no trecho encolhem na proporção.
  if (duracao !== undefined && fi + fo > duracao) {
    const k = duracao / (fi + fo);
    fi = Math.floor(fi * k * 100) / 100;
    fo = Math.floor(fo * k * 100) / 100;
  }
  return {
    id: m.id ?? a.id,
    fonte: { ...a.fonte },
    noVideo: c2(m.noVideo),
    corteArquivo: c2(m.corteArquivo),
    ...(duracao !== undefined ? { duracao } : {}),
    volume: a.volume,
    fadeEntrada: fi,
    fadeSaida: fo,
    ...(a.fonte.tipo === "musica" ? { laco: a.laco !== false } : {}),
  };
}

/** Corte de música em laço volta pra dentro do arquivo: tocar de 50s num arquivo de 45s em laço é tocar de 5s. */
function corteNoArquivo(a: ItemAudio, corte: number): number {
  if (a.fonte.tipo !== "musica" || a.laco === false) return corte;
  const seg = segundosDaMusica(a.fonte.id);
  return corte >= seg ? c2(corte % seg) : corte;
}

function trocarAudio<C extends CenaBase>(s: EstadoLinha<C>, novo: ItemAudio, extra: ItemAudio[] = []): EstadoLinha<C> {
  const lista = audiosEfetivos(s.audios, s.narracao).map((a) => (a.id === novo.id && a.fonte.tipo === novo.fonte.tipo ? novo : a));
  return { ...s, audios: [...lista, ...extra] };
}

function semMudanca<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, de = 0, ate = 0): ResultadoGesto<C> {
  return { estado: ctx.estado, selecao: ref, de, ate, guia: null, parouNaBorda: false, mudou: false };
}

/** A borda que chegou mais perto de um ponto de encaixe decide: devolve o delta corrigido. */
function encaixarBordas(de: number, ate: number, delta: number, o: Pick<Opcoes, "pontos" | "limiarSeg"> | null): { delta: number; guia: number | null } {
  if (!o || !o.pontos.length) return { delta, guia: null };
  const a = encaixar(de + delta, o.pontos, o.limiarSeg);
  const b = encaixar(ate + delta, o.pontos, o.limiarSeg);
  const da = a.guia === null ? Infinity : Math.abs(a.t - (de + delta));
  const db = b.guia === null ? Infinity : Math.abs(b.t - (ate + delta));
  if (da === Infinity && db === Infinity) return { delta, guia: null };
  return da <= db ? { delta: a.t - de, guia: a.guia } : { delta: b.t - ate, guia: b.guia };
}

function gestoNoAudio<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, item: ItemAudio, g: Gesto, o: Pick<Opcoes, "pontos" | "limiarSeg"> | null): ResultadoGesto<C> {
  const total = ctx.relogio.total;
  const min = LIMITES.audioMin;
  const geo = geoAudio(ctx as Ctx<CenaBase>, item);
  const { antes, depois } = limitesDoItem(ctx as Ctx<CenaBase>, ref);
  const N = item.noVideo;
  const C = item.corteArquivo;
  const laco = item.fonte.tipo === "musica" && item.laco !== false;
  let novo: ItemAudio;
  let guia: number | null = null;
  let borda = false;

  if (g.tipo === "mover") {
    const larg = geo.ate - N;
    const lo = Math.max(antes, 0);
    const hi = Math.max(lo, Math.min(Math.min(depois, total) - larg, total - min));
    const e = encaixarBordas(N, geo.ate, g.delta, o);
    const N2 = c2(limitar(N + e.delta, lo, hi));
    guia = quase(N2, N + e.delta) ? e.guia : null;
    novo = trecho(item, { noVideo: N2, corteArquivo: C, duracao: item.duracao });
  } else if (g.tipo === "aparaInicio") {
    if (geo.estimado) return semMudanca(ctx, ref, geo.de, geo.ate);
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const piso = Math.max(antes, N - C);
    // Trecho menor que o mínimo (sem som, ou espremido): aparar só o deixaria inválido.
    if (geo.ate - N < min || geo.ate - min < piso) return semMudanca(ctx, ref, geo.de, geo.ate);
    const N2 = c2(limitar(e.t, piso, geo.ate - min));
    borda = e.t < piso && quase(N2, N - C) && N - C >= antes;
    guia = quase(N2, e.t) ? e.guia : null;
    const C2 = corteNoArquivo(item, c2(C + (N2 - N)));
    novo = trecho(item, { noVideo: N2, corteArquivo: C2, duracao: item.duracao === undefined ? undefined : geo.ate - N2 });
  } else if (g.tipo === "aparaFim") {
    if (geo.estimado) return semMudanca(ctx, ref, geo.de, geo.ate);
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const fimMax = Math.min(depois, total, geo.fimDoArquivo);
    if (fimMax < N + min) return semMudanca(ctx, ref, geo.de, geo.ate);
    const ate2 = c2(limitar(e.t, N + min, fimMax));
    borda = e.t > fimMax && quase(ate2, geo.fimDoArquivo);
    guia = quase(ate2, e.t) ? e.guia : null;
    const ateONatural = laco ? quase(ate2, total) : quase(ate2, geo.fimDoArquivo);
    novo = trecho(item, { noVideo: N, corteArquivo: C, duracao: ateONatural ? undefined : ate2 - N });
  } else if (g.tipo === "deslizarTrecho") {
    if (item.fonte.tipo !== "musica") return semMudanca(ctx, ref, geo.de, geo.ate);
    const seg = segundosDaMusica(item.fonte.id);
    const D = geo.ate - N;
    const C2 = c2(limitar(C - g.delta, 0, laco ? seg - 0.01 : Math.max(0, seg - D)));
    borda = C2 === 0 && C - g.delta < 0;
    // Deslizar que não sai do lugar não é edição (nem troca "até o fim" por duração fixa).
    if (C2 === C) return { ...semMudanca(ctx, ref, geo.de, geo.ate), corte: C, parouNaBorda: borda };
    // Sem laço e "até o fim do arquivo": deslizar mudaria o tamanho. O tamanho fica fixo.
    novo = trecho(item, { noVideo: N, corteArquivo: C2, duracao: item.duracao ?? (laco ? undefined : D) });
  } else {
    return semMudanca(ctx, ref, geo.de, geo.ate);
  }

  const estado = trocarAudio(ctx.estado, novo);
  const g2 = geoAudio({ ...ctx, estado } as Ctx<CenaBase>, novo);
  const mudou = JSON.stringify(novo) !== JSON.stringify(item) || estado.audios.length !== ctx.estado.audios.length;
  return { estado: mudou ? estado : ctx.estado, selecao: ref, de: g2.de, ate: g2.ate, corte: novo.corteArquivo, guia, parouNaBorda: borda, mudou };
}

function gestoNoVoce<C extends CenaBase>(ctx: Ctx<C>, g: Gesto, o: Pick<Opcoes, "pontos" | "limiarSeg"> | null): ResultadoGesto<C> {
  const ref: RefItem = { faixa: "voce" };
  const a = ctx.estado.apresentador;
  if (!a) return semMudanca(ctx, ref);
  const total = ctx.relogio.total;
  const geo = geoVoce(ctx as Ctx<CenaBase>, a);
  let novo: Apresentador;
  let guia: number | null = null;
  let borda = false;
  if (g.tipo === "mover") {
    const e = encaixarBordas(geo.de, geo.ate, g.delta, o);
    const entra = c1(limitar(geo.de + e.delta, 0, Math.max(0, Math.min(120, total - 1))));
    guia = Math.abs(entra - (geo.de + e.delta)) < 0.051 ? e.guia : null;
    novo = { ...a, entra };
  } else if (g.tipo === "aparaInicio") {
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const dur = geo.ate - geo.de;
    const piso = Math.max(-geo.inicio, -geo.de);
    const d = limitar(e.t - geo.de, piso, Math.min(LIMITES.aparaMax - geo.inicio, dur - 1));
    borda = e.t - geo.de < piso && d === -geo.inicio;
    const inicio = c1(geo.inicio + d);
    const entra = c1(geo.de + (inicio - geo.inicio));
    guia = Math.abs(entra - e.t) < 0.051 ? e.guia : null;
    novo = { ...a, entra, inicio, ...(a.duracao !== undefined ? { duracao: c1(limitar(a.duracao - (entra - geo.de), 1, 60)) } : {}) };
  } else if (g.tipo === "aparaFim") {
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const p = Math.min(e.t, total);
    borda = e.t > geo.de + geo.disp;
    guia = quase(p, e.t) ? e.guia : null;
    if (p >= geo.de + geo.disp - 0.05) {
      const { duracao: _d, ...sem } = a;
      void _d;
      novo = sem;
    } else {
      novo = { ...a, duracao: c1(limitar(p - geo.de, 1, Math.max(1, Math.min(60, geo.disp)))) };
    }
  } else {
    return semMudanca(ctx, ref, geo.de, geo.ate);
  }
  const estado = { ...ctx.estado, apresentador: novo };
  const g2 = geoVoce({ ...ctx, estado } as Ctx<CenaBase>, novo);
  const mudou = JSON.stringify(novo) !== JSON.stringify(a);
  return { estado: mudou ? estado : ctx.estado, selecao: ref, de: g2.de, ate: g2.ate, guia, parouNaBorda: borda, mudou };
}

function gestoNaLegenda<C extends CenaBase>(ctx: Ctx<C>, indice: number, g: Gesto, o: Pick<Opcoes, "pontos" | "limiarSeg"> | null): ResultadoGesto<C> {
  const ref: RefItem = { faixa: "legendas", indice };
  const l = ctx.estado.legendas;
  const t = l?.trechos[indice];
  if (!l || !t) return semMudanca(ctx, ref);
  const total = ctx.relogio.total;
  let novo: TrechoLegenda;
  let guia: number | null = null;
  if (g.tipo === "mover") {
    const e = encaixarBordas(t.inicio, t.fim, g.delta, o);
    const d = limitar(e.delta, -t.inicio, Math.max(-t.inicio, total - t.fim));
    guia = quase(d, e.delta) ? e.guia : null;
    novo = { ...t, inicio: c2(t.inicio + d), fim: c2(t.fim + d) };
  } else if (g.tipo === "aparaInicio") {
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const inicio = c2(limitar(e.t, 0, t.fim - 0.2));
    guia = quase(inicio, e.t) ? e.guia : null;
    novo = { ...t, inicio };
  } else if (g.tipo === "aparaFim") {
    const e = o ? encaixar(g.para, o.pontos, o.limiarSeg) : { t: g.para, guia: null };
    const fim = c2(limitar(e.t, t.inicio + 0.2, Math.max(t.inicio + 0.2, total)));
    guia = quase(fim, e.t) ? e.guia : null;
    novo = { ...t, fim };
  } else {
    return semMudanca(ctx, ref, t.inicio, t.fim);
  }
  const mudou = novo.inicio !== t.inicio || novo.fim !== t.fim;
  if (!mudou) return semMudanca(ctx, ref, t.inicio, t.fim);
  const legendas = normalizarLegendas({ ...l, trechos: l.trechos.map((x, i) => (i === indice ? novo : x)) })!;
  const i2 = legendas.trechos.indexOf(novo);
  return { estado: { ...ctx.estado, legendas }, selecao: { faixa: "legendas", indice: i2 }, de: novo.inicio, ate: Math.min(novo.fim, total), guia, parouNaBorda: false, mudou };
}

/**
 * Um gesto, SEMPRE sobre o estado do começo do gesto: o delta é o total desde que o dedo
 * encostou, então repetir a conta a cada movimento não acumula erro.
 */
export function aplicarGesto<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, gesto: Gesto, opcoes: Pick<Opcoes, "pontos" | "limiarSeg"> | null): ResultadoGesto<C> {
  if (ref.faixa === "musica" || ref.faixa === "voz") {
    const item = itemDoRef(ctx as Ctx<CenaBase>, ref);
    return item ? gestoNoAudio(ctx, ref, item, gesto, opcoes) : semMudanca(ctx, ref);
  }
  if (ref.faixa === "voce") return gestoNoVoce(ctx, gesto, opcoes);
  if (ref.faixa === "legendas") return gestoNaLegenda(ctx, ref.indice, gesto, opcoes);
  if (ref.faixa === "cenas" && (gesto.tipo === "aparaInicio" || gesto.tipo === "aparaFim")) return aparaCena(ctx, ref.chave, gesto);
  if (ref.faixa === "cenas" && gesto.tipo === "reordenar") {
    const lista = ctx.estado.cenas;
    const i = lista.findIndex((c) => c.chave === ref.chave);
    const j = limitar(Math.round(gesto.paraIndice), 0, lista.length - 1);
    if (i < 0 || i === j) return semMudanca(ctx, ref);
    const nova = [...lista];
    const [movida] = nova.splice(i, 1);
    nova.splice(j, 0, movida);
    const estado = { ...ctx.estado, cenas: nova };
    const r = relogioDoEspec({ cenas: nova, telaFinal: estado.telaFinal, transicao: estado.transicao });
    return { estado, selecao: ref, ...spanDaCena(r, j), guia: null, parouNaBorda: false, mudou: true };
  }
  // Textos, adesivos, título e tela final não têm gesto na Entrega 1.
  return semMudanca(ctx, ref);
}

/**
 * Arrastar a BORDA de uma cena, como no CapCut: a de trás muda até onde a cena vai; a da
 * frente tira (ou devolve) tempo do começo -- no clipe, o arquivo passa a começar mais tarde,
 * então o que some é mesmo o começo do vídeo. A cena continua começando onde a anterior
 * termina (a linha das fotos não tem buraco), e as seguintes andam junto.
 *
 * Durações inteiras (o pedido arredonda), entre o mínimo e o teto do tipo. Na emenda, a
 * cena vai além do começo da seguinte (a transição sobrepõe as duas): a borda que a pessoa
 * arrasta é a VISÍVEL, e a duração é ela mais a emenda.
 */
function aparaCena<C extends CenaBase>(ctx: Ctx<C>, chave: string, gesto: { tipo: "aparaInicio" | "aparaFim"; para: number }): ResultadoGesto<C> {
  const ref: RefItem = { faixa: "cenas", chave };
  const lista = ctx.estado.cenas;
  const i = lista.findIndex((c) => c.chave === chave);
  if (i < 0) return semMudanca(ctx, ref);
  const c = lista[i];
  const { de, ate } = spanDaCena(ctx.relogio, i);
  const teto = c.tipo === "tour360" ? LIMITES.duracaoMax360 : LIMITES.duracaoMax;
  const dur = Math.min(Math.max(c.duracao ?? LIMITES.duracaoPadrao, LIMITES.duracaoMin), teto);
  const emenda = Math.max(0, de + dur - ate);
  const video = temVideoCorrendo(c.tipo) && c.tipo !== "animada";
  const vel = c.velocidade ?? 1;
  let nova: number;
  let inicio = c.inicio;
  if (gesto.tipo === "aparaFim") {
    nova = limitar(Math.round(gesto.para - de + emenda), LIMITES.duracaoMin, teto);
  } else {
    const tirar = Math.round(gesto.para - de);
    // Devolver tempo no começo de um clipe só até o começo do arquivo.
    const podeDevolver = video ? Math.floor(((c.inicio ?? 0) / vel) + 1e-6) : Infinity;
    nova = limitar(dur - Math.max(tirar, -podeDevolver), LIMITES.duracaoMin, teto);
    if (video) inicio = Math.round(Math.min(LIMITES.aparaMax, Math.max(0, (c.inicio ?? 0) + (dur - nova) * vel)) * 10) / 10 || undefined;
  }
  if (nova === dur && (inicio ?? 0) === (c.inicio ?? 0)) return { ...semMudanca(ctx, ref, de, ate), parouNaBorda: true };
  const cenas = lista.map((x, k) => (k === i ? { ...x, duracao: nova, inicio: video ? inicio : x.inicio } : x));
  const estado = { ...ctx.estado, cenas };
  const r = relogioDoEspec({ cenas, telaFinal: estado.telaFinal, transicao: estado.transicao });
  return { estado, selecao: ref, ...spanDaCena(r, i), guia: null, parouNaBorda: nova === LIMITES.duracaoMin || nova === teto, mudou: true };
}

/** Os botões "Início aqui", "Fim aqui" e "−/+": o mesmo gesto, sem encaixe. */
export function botaoInicioAqui<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, t: number): ResultadoGesto<C> {
  return aplicarGesto(ctx, ref, { tipo: "aparaInicio", para: t }, null);
}
export function botaoFimAqui<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, t: number): ResultadoGesto<C> {
  return aplicarGesto(ctx, ref, { tipo: "aparaFim", para: t }, null);
}
export function botaoDeslocar<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, delta: number): ResultadoGesto<C> {
  return aplicarGesto(ctx, ref, { tipo: "mover", delta }, null);
}

// ---------- dividir e apagar ----------

export type ResultadoAcao<C extends CenaBase = CenaBase> = { estado: EstadoLinha<C>; selecao: RefItem | null; mudou: boolean; motivo?: string };

function motivoDeDividir(ctx: Ctx<CenaBase>, item: ItemAudio, t: number): string | null {
  const g = geoAudio(ctx, item);
  if (g.estimado) return "Gere o vídeo uma vez para cortar a voz de IA";
  if (t < item.noVideo + LIMITES.audioMin - 1e-6 || t > g.ate - LIMITES.audioMin + 1e-6) return "Leve o cursor para dentro do trecho";
  const lista = audiosEfetivos(ctx.estado.audios, ctx.estado.narracao);
  const mesmos = lista.filter((a) => a.fonte.tipo === item.fonte.tipo).length;
  if (item.fonte.tipo === "musica" && mesmos >= LIMITES.musicaPedacosMax) return `No máximo ${LIMITES.musicaPedacosMax} trechos de música.`;
  if (item.fonte.tipo === "voz" && mesmos >= LIMITES.vozPedacosMax) return `No máximo ${LIMITES.vozPedacosMax} trechos de voz.`;
  if (lista.length >= LIMITES.audiosMax) return `No máximo ${LIMITES.audiosMax} trechos de áudio.`;
  return null;
}

/** Corta o trecho de áudio no cursor. A seleção vai pro pedaço da direita. */
export function dividirNoTempo<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, t: number, novoId: () => string): ResultadoAcao<C> {
  const item = itemDoRef(ctx as Ctx<CenaBase>, ref);
  if (!item) return { estado: ctx.estado, selecao: ref, mudou: false, motivo: "Só música e voz se dividem aqui" };
  const motivo = motivoDeDividir(ctx as Ctx<CenaBase>, item, t);
  if (motivo) return { estado: ctx.estado, selecao: ref, mudou: false, motivo };
  const T = c2(t);
  const N = item.noVideo;
  const esquerda = trecho(item, { noVideo: N, corteArquivo: item.corteArquivo, duracao: T - N, fadeEntrada: Math.min(item.fadeEntrada, c2(T - N)), fadeSaida: 0 });
  const restoDur = item.duracao === undefined ? undefined : item.duracao - (T - N);
  const direita = trecho(item, {
    id: novoId(),
    noVideo: T,
    corteArquivo: corteNoArquivo(item, c2(item.corteArquivo + (T - N))),
    duracao: restoDur,
    fadeEntrada: 0,
    fadeSaida: restoDur === undefined ? item.fadeSaida : Math.min(item.fadeSaida, c2(restoDur)),
  });
  const estado = trocarAudio(ctx.estado, esquerda, [direita]);
  return { estado, selecao: { faixa: ref.faixa as "musica" | "voz", id: direita.id }, mudou: true };
}

export type ResultadoApagar<C extends CenaBase = CenaBase> = { estado: EstadoLinha<C>; selecao: null; legendasApagadas: number; narracaoDesligada: boolean };

export function apagar<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem): ResultadoApagar<C> {
  const s = ctx.estado;
  const fim = (estado: EstadoLinha<C>, legendasApagadas = 0, narracaoDesligada = false): ResultadoApagar<C> => ({ estado, selecao: null, legendasApagadas, narracaoDesligada });
  switch (ref.faixa) {
    case "musica":
      return fim({ ...s, audios: audiosEfetivos(s.audios, s.narracao).filter((a) => !(a.fonte.tipo === "musica" && a.id === ref.id)) });
    case "voz": {
      const item = itemDoRef(ctx as Ctx<CenaBase>, ref);
      if (!item) return fim(s);
      const g = geoAudio(ctx as Ctx<CenaBase>, item);
      const audios = audiosEfetivos(s.audios, s.narracao).filter((a) => !(a.fonte.tipo === "voz" && a.id === ref.id));
      const trechos = s.legendas?.trechos ?? [];
      const ficam = trechos.filter((t) => !(t.inicio >= g.de && t.fim <= g.ate));
      const legendas = s.legendas ? (ficam.length ? { ...s.legendas, trechos: ficam } : null) : null;
      const ultima = !audios.some((a) => a.fonte.tipo === "voz");
      return fim({ ...s, audios, legendas, ...(ultima ? { narracao: null } : {}) }, trechos.length - ficam.length, ultima);
    }
    case "voce":
      return fim({ ...s, apresentador: null });
    case "legendas": {
      if (!s.legendas) return fim(s);
      const trechos = s.legendas.trechos.filter((_, i) => i !== ref.indice);
      return fim({ ...s, legendas: trechos.length ? { ...s.legendas, trechos } : null }, trechos.length < s.legendas.trechos.length ? 1 : 0);
    }
    case "textos":
      return fim({
        ...s,
        cenas: s.cenas.map((c) => (c.chave !== ref.chave ? c : ref.indice < 0 ? { ...c, legenda: "" } : { ...c, textos: (c.textos ?? []).filter((_, i) => i !== ref.indice) })),
      });
    case "adesivos":
      return fim({ ...s, cenas: s.cenas.map((c) => (c.chave === ref.chave ? { ...c, elementos: (c.elementos ?? []).filter((_, i) => i !== ref.indice) } : c)) });
    case "titulo":
      return fim({ ...s, titulo: "" });
    case "cenas":
      return fim({ ...s, cenas: s.cenas.filter((c) => c.chave !== ref.chave) });
    case "telaFinal":
      return fim({ ...s, telaFinal: false });
  }
}

// ---------- textos e adesivos entre fotos ----------

/** Mesma regra do editor ao pôr texto (EV:948-949): lugar ocupado vai pro primeiro livre. */
function lugarLivre(ocupadas: Set<PosicaoTexto>, quer: PosicaoTexto | undefined): PosicaoTexto | undefined {
  return ocupadas.has(quer ?? "base") ? (["centro", "topo", "base"] as const).find((p) => !ocupadas.has(p)) : undefined;
}

export function moverParaFoto<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem, direcao: 1 | -1): ResultadoAcao<C> {
  const s = ctx.estado;
  const nada = (motivo: string): ResultadoAcao<C> => ({ estado: s, selecao: ref, mudou: false, motivo });
  if (ref.faixa !== "textos" && ref.faixa !== "adesivos") return nada("Só texto e adesivo mudam de foto");
  const k = s.cenas.findIndex((c) => c.chave === ref.chave);
  const j = k + direcao;
  if (k < 0) return nada("A foto não existe mais");
  if (j < 0) return nada("Esta já é a primeira cena");
  if (j >= s.cenas.length) return nada("Esta já é a última cena");
  const origem = s.cenas[k];
  const alvo = s.cenas[j];
  const qual = direcao > 0 ? "seguinte" : "anterior";
  let novaOrigem: C;
  let novoAlvo: C;
  let selecao: RefItem;
  if (ref.faixa === "textos" && ref.indice < 0) {
    if (!origem.legenda) return nada("A foto não tem legenda");
    if (alvo.legenda) return nada(`A foto ${qual} já tem legenda`);
    novaOrigem = { ...origem, legenda: "" };
    novoAlvo = { ...alvo, legenda: origem.legenda };
    selecao = { faixa: "textos", chave: alvo.chave, indice: -1 };
  } else if (ref.faixa === "textos") {
    const t = origem.textos?.[ref.indice];
    if (!t) return nada("O texto não existe mais");
    const atuais = alvo.textos ?? [];
    if (atuais.length >= LIMITES.textosPorCena) return nada(`A foto ${qual} já tem ${LIMITES.textosPorCena} textos`);
    const lugar = lugarLivre(new Set(atuais.map((x) => x.posicao ?? "base")), t.posicao);
    novaOrigem = { ...origem, textos: (origem.textos ?? []).filter((_, i) => i !== ref.indice) };
    novoAlvo = { ...alvo, textos: [...atuais, lugar ? { ...t, posicao: lugar } : t] };
    selecao = { faixa: "textos", chave: alvo.chave, indice: atuais.length };
  } else {
    const e = origem.elementos?.[ref.indice];
    if (!e) return nada("O adesivo não existe mais");
    const atuais = alvo.elementos ?? [];
    if (atuais.length >= LIMITES.elementosPorCena) return nada(`A foto ${qual} já tem ${LIMITES.elementosPorCena} elementos`);
    novaOrigem = { ...origem, elementos: (origem.elementos ?? []).filter((_, i) => i !== ref.indice) };
    novoAlvo = { ...alvo, elementos: [...atuais, e] };
    selecao = { faixa: "adesivos", chave: alvo.chave, indice: atuais.length };
  }
  const cenas = s.cenas.map((c, i) => (i === k ? novaOrigem : i === j ? novoAlvo : c));
  return { estado: { ...s, cenas }, selecao, mudou: true };
}

export function duplicarNaFoto<C extends CenaBase>(ctx: Ctx<C>, ref: RefItem): ResultadoAcao<C> {
  const s = ctx.estado;
  const nada = (motivo: string): ResultadoAcao<C> => ({ estado: s, selecao: ref, mudou: false, motivo });
  if ((ref.faixa !== "textos" && ref.faixa !== "adesivos") || ref.indice < 0) return nada("Só texto e adesivo se duplicam aqui");
  const k = s.cenas.findIndex((c) => c.chave === ref.chave);
  const c = s.cenas[k];
  if (!c) return nada("A foto não existe mais");
  let nova: C;
  let selecao: RefItem;
  if (ref.faixa === "textos") {
    const t = c.textos?.[ref.indice];
    const atuais = c.textos ?? [];
    if (!t) return nada("O texto não existe mais");
    if (atuais.length >= LIMITES.textosPorCena) return nada(`Esta foto já tem ${LIMITES.textosPorCena} textos`);
    const lugar = lugarLivre(new Set(atuais.map((x) => x.posicao ?? "base")), t.posicao);
    nova = { ...c, textos: [...atuais, lugar ? { ...t, posicao: lugar } : { ...t }] };
    selecao = { faixa: "textos", chave: c.chave, indice: atuais.length };
  } else {
    const e = c.elementos?.[ref.indice];
    const atuais = c.elementos ?? [];
    if (!e) return nada("O adesivo não existe mais");
    if (atuais.length >= LIMITES.elementosPorCena) return nada(`Esta foto já tem ${LIMITES.elementosPorCena} elementos`);
    nova = { ...c, elementos: [...atuais, { ...e }] };
    selecao = { faixa: "adesivos", chave: c.chave, indice: atuais.length };
  }
  return { estado: { ...s, cenas: s.cenas.map((x, i) => (i === k ? nova : x)) }, selecao, mudou: true };
}

// ---------- legendas que andam com a voz ----------

/** Legendas cujo MEIO cai dentro da janela da voz andam junto com ela. */
export function moverLegendasComVoz(legendas: Legendas | null, janela: { de: number; ate: number }, delta: number, total: number): { legendas: Legendas | null; movidas: number } {
  if (!legendas || !delta) return { legendas, movidas: 0 };
  let movidas = 0;
  const trechos = legendas.trechos.map((t) => {
    const meio = (t.inicio + t.fim) / 2;
    if (meio < janela.de || meio >= janela.ate) return t;
    const d = limitar(delta, -t.inicio, Math.max(-t.inicio, total - t.fim));
    if (!d) return t;
    movidas++;
    return { ...t, inicio: c2(t.inicio + d), fim: c2(t.fim + d) };
  });
  return { legendas: movidas ? normalizarLegendas({ ...legendas, trechos }) : legendas, movidas };
}

/**
 * A transcrição vem no tempo do ARQUIVO de voz; a linha do tempo precisa do tempo do
 * VÍDEO. Cada trecho vai pro pedaço de voz que contém o meio dele, deslocado pelo
 * `noVideo − corte` desse pedaço e aparado nas bordas. O que caiu num pedaço cortado fora
 * não entra (a voz dali não toca).
 */
export function legendasDaTranscricao(trechos: TrechoLegenda[], pecas: ItemAudio[], segundosDaVoz: number | null): TrechoLegenda[] {
  const vozes = pecas.filter((p) => p.fonte.tipo === "voz");
  const saida: TrechoLegenda[] = [];
  for (const t of trechos) {
    const meio = (t.inicio + t.fim) / 2;
    const p = vozes.find((v) => {
      const D = v.duracao ?? (segundosDaVoz != null ? segundosDaVoz - v.corteArquivo : Infinity);
      return meio >= v.corteArquivo && meio < v.corteArquivo + D;
    });
    if (!p) continue;
    const D = p.duracao ?? (segundosDaVoz != null ? segundosDaVoz - p.corteArquivo : Infinity);
    const inicio = c2(p.noVideo + Math.max(t.inicio, p.corteArquivo) - p.corteArquivo);
    const fim = c2(p.noVideo + Math.min(t.fim, p.corteArquivo + D) - p.corteArquivo);
    if (fim - inicio >= 0.05) saida.push({ ...t, inicio, fim });
  }
  return normalizarLegendas({ trechos: saida })!.trechos;
}

// ---------- qual faixa abre, zoom ----------

export type AbaDoEditor = string;

export function faixaAberta(o: { selecao: RefItem | null; aba: AbaDoEditor | null; ultima: FaixaId | null; faixas: FaixasDaLinha }): FaixaId | null {
  const tem = (f: FaixaId) => o.faixas.trilhas[f].length > 0;
  if (o.selecao) {
    const t = trilhaDoRef(o.selecao);
    if (t !== "cenas") return t;
  }
  const daAba: Record<string, FaixaId> = { audio: "musica", legendas: tem("voz") ? "voz" : "legendas", voce: "voce", texto: "textos", elementos: "adesivos" };
  const pelaAba = o.aba ? daAba[o.aba] : undefined;
  if (pelaAba && tem(pelaAba)) return pelaAba;
  if (o.ultima && tem(o.ultima)) return o.ultima;
  return ORDEM_DAS_FAIXAS.find(tem) ?? null;
}

/** Pixels por segundo pro vídeo inteiro caber na largura (com 32px de folga). */
export function zoomParaAjustar(total: number, px: number): number {
  return limitar((px - 32) / Math.max(total, 0.1), 4, 120);
}

// ---------- a barra da seleção ----------

const NAVEGAM = new Set(["editar", "animacao", "frase", "editar_titulo", "trocar"]);

function barra(gerando: boolean, lista: { id: string; rotulo: string; icone: string; motivo?: string | null; perigo?: boolean }[]): AcaoBarra[] {
  return lista.map((a) => {
    const motivo = gerando && !NAVEGAM.has(a.id) ? GERANDO : (a.motivo ?? undefined);
    return { id: a.id, rotulo: a.rotulo, icone: a.icone, ativo: !motivo, ...(motivo ? { motivo } : {}), ...(a.perigo ? { perigo: true as const } : {}) };
  });
}

/** O que a barra mostra pra coisa selecionada, com o motivo de cada botão apagado. */
export function acoesDaSelecao(ctx: Ctx<CenaBase>, ref: RefItem, t: number, gerando: boolean): AcaoBarra[] {
  const s = ctx.estado;
  const total = ctx.relogio.total;
  const min = LIMITES.audioMin;
  const apagarAcao = { id: "apagar", rotulo: "Apagar", icone: "lixeira", perigo: true };

  if (ref.faixa === "musica" || ref.faixa === "voz") {
    const item = itemDoRef(ctx, ref);
    if (!item) return [];
    const g = geoAudio(ctx, item);
    const nome = ref.faixa === "musica" ? "música" : "voz";
    const fora = `Leve o cursor para dentro da ${nome}`;
    const estimada = ref.faixa === "voz" && g.estimado ? "Gere o vídeo uma vez para cortar a voz de IA" : null;
    const inicioAqui = estimada ?? (quase(t, g.de) ? `A ${nome} começa aqui` : t < g.de || t > g.ate - min ? fora : null);
    const fimAqui = estimada ?? (quase(t, g.ate) ? `A ${nome} termina aqui` : t < g.de + min || t > g.ate ? fora : null);
    const dividir = motivoDeDividir(ctx, item, t);
    if (ref.faixa === "musica") {
      return barra(gerando, [
        { id: "trecho", rotulo: "Trecho da música", icone: "trecho" },
        { id: "inicio_aqui", rotulo: "Início aqui", icone: "inicio_aqui", motivo: inicioAqui },
        { id: "fim_aqui", rotulo: "Fim aqui", icone: "fim_aqui", motivo: fimAqui },
        { id: "dividir", rotulo: "Dividir", icone: "dividir", motivo: dividir },
        { id: "volume", rotulo: "Volume", icone: "volume" },
        { id: "fade", rotulo: "Fade", icone: "fade" },
        { id: "trocar", rotulo: "Trocar", icone: "som" },
        apagarAcao,
      ]);
    }
    const { antes, depois } = limitesDoItem(ctx, ref);
    const larg = g.ate - g.de;
    return barra(gerando, [
      { id: "inicio_aqui", rotulo: "Início aqui", icone: "inicio_aqui", motivo: inicioAqui },
      { id: "fim_aqui", rotulo: "Fim aqui", icone: "fim_aqui", motivo: fimAqui },
      { id: "dividir", rotulo: "Dividir", icone: "dividir", motivo: dividir },
      { id: "menos05", rotulo: "−0,5s", icone: "seta_esq", motivo: item.noVideo <= Math.max(antes, 0) + 0.001 ? "A voz já está no começo" : null },
      { id: "mais05", rotulo: "+0,5s", icone: "seta_dir", motivo: item.noVideo >= Math.min(Math.min(depois, total) - larg, total - min) - 0.001 ? "A voz já está no fim" : null },
      { id: "volume", rotulo: "Volume", icone: "volume" },
      apagarAcao,
    ]);
  }

  if (ref.faixa === "voce") {
    const a = s.apresentador;
    if (!a) return [];
    const g = geoVoce(ctx, a);
    const fora = "Leve o cursor para dentro do Você";
    return barra(gerando, [
      { id: "inicio_aqui", rotulo: "Início aqui", icone: "inicio_aqui", motivo: t <= g.de + 0.05 || t > g.ate - 1 ? fora : null },
      { id: "fim_aqui", rotulo: "Fim aqui", icone: "fim_aqui", motivo: t < g.de + 1 || t >= g.ate - 0.05 ? fora : null },
      { id: "menos05", rotulo: "−0,5s", icone: "seta_esq", motivo: g.de <= 0 ? "O Você já entra no começo" : null },
      { id: "mais05", rotulo: "+0,5s", icone: "seta_dir", motivo: g.de >= Math.min(120, total - 1) - 0.05 ? "O Você já está no fim" : null },
      { id: "volume", rotulo: "Volume", icone: "volume" },
      apagarAcao,
    ]);
  }

  if (ref.faixa === "legendas") {
    const trechos = s.legendas?.trechos ?? [];
    const tr = trechos[ref.indice];
    if (!tr) return [];
    const fora = "Leve o cursor para dentro da legenda";
    const ocupado = trechos.some((x) => t >= x.inicio && t < x.fim);
    return barra(gerando, [
      { id: "inicio_aqui", rotulo: "Início aqui", icone: "inicio_aqui", motivo: quase(t, tr.inicio) ? "A legenda começa aqui" : t < tr.inicio || t > tr.fim - 0.2 ? fora : null },
      { id: "fim_aqui", rotulo: "Fim aqui", icone: "fim_aqui", motivo: quase(t, tr.fim) ? "A legenda termina aqui" : t < tr.inicio + 0.2 || t > tr.fim ? fora : null },
      { id: "menos01", rotulo: "−0,1s", icone: "seta_esq", motivo: tr.inicio <= 0 ? "A legenda já está no começo" : null },
      { id: "mais01", rotulo: "+0,1s", icone: "seta_dir", motivo: tr.fim >= total ? "A legenda já está no fim" : null },
      { id: "editar_texto", rotulo: "Editar texto", icone: "editar_prompt" },
      {
        id: "mais_trecho",
        rotulo: "+ trecho aqui",
        icone: "legenda",
        motivo: ocupado ? "Já tem legenda neste ponto" : trechos.length >= LIMITES.trechosMax ? `No máximo ${LIMITES.trechosMax} trechos` : t > total - 0.2 ? "Leve o cursor para antes do fim" : null,
      },
      apagarAcao,
    ]);
  }

  if (ref.faixa === "textos" || ref.faixa === "adesivos") {
    const k = s.cenas.findIndex((c) => c.chave === ref.chave);
    const c = s.cenas[k];
    if (!c) return [];
    const legenda = ref.faixa === "textos" && ref.indice < 0;
    const passo = (d: 1 | -1) => moverParaFoto(ctx, ref, d).motivo ?? null;
    const dup = legenda ? null : (duplicarNaFoto(ctx, ref).motivo ?? null);
    return barra(gerando, [
      { id: "editar", rotulo: "Editar", icone: "editar_prompt" },
      { id: "animacao", rotulo: "Animação", icone: "magica", motivo: legenda ? "Legenda da foto não tem animação" : null },
      { id: "foto_anterior", rotulo: "Foto anterior", icone: "seta_esq", motivo: passo(-1) },
      { id: "proxima_foto", rotulo: "Próxima foto", icone: "seta_dir", motivo: passo(1) },
      ...(legenda ? [] : [{ id: "duplicar", rotulo: "Duplicar", icone: "copiar", motivo: dup }]),
      apagarAcao,
    ]);
  }

  if (ref.faixa === "titulo") {
    return barra(gerando, [{ id: "editar_titulo", rotulo: "Editar título", icone: "editar_prompt" }, apagarAcao]);
  }

  if (ref.faixa === "telaFinal") {
    return barra(gerando, [
      { id: "frase", rotulo: "Frase", icone: "editar_prompt" },
      { id: "tirar", rotulo: "Tirar", icone: "lixeira", perigo: true },
    ]);
  }

  // Cena: as regras da barra antiga (LT:246-316), com o motivo por escrito.
  const k = s.cenas.findIndex((c) => c.chave === ref.chave);
  const c = s.cenas[k];
  if (!c) return [];
  const { de, ate } = spanDaCena(ctx.relogio, k);
  const d = t - de;
  const dentro = d > 0.15 && d < ate - de - 0.15;
  const animada = c.tipo === "animada";
  const eh360 = c.tipo === "tour360";
  const temVideo = temVideoCorrendo(c.tipo);
  const cheio = s.cenas.length >= LIMITES.cenasMax;
  const duracao = c.duracao ?? LIMITES.duracaoPadrao;
  const semVideo = "Só vale onde há vídeo correndo";
  return barra(gerando, [
    {
      id: "dividir",
      rotulo: "Dividir",
      icone: "dividir",
      motivo: animada
        ? "Cena animada não se divide: cada parte seria animada de novo"
        : !dentro
          ? "Leve o cursor para dentro da cena"
          : cheio
            ? `No máximo ${LIMITES.cenasMax} fotos`
            : duracao < LIMITES.duracaoMin * 2
              ? `Cena curta demais: cada parte precisa de ${LIMITES.duracaoMin}s`
              : null,
    },
    { id: "aparar_inicio", rotulo: "Aparar início", icone: "aparar_inicio", motivo: animada ? "Cena animada não se corta: mude a duração no painel" : !dentro ? "Leve o cursor para dentro da cena" : null },
    { id: "aparar_fim", rotulo: "Aparar fim", icone: "aparar_fim", motivo: animada ? "Cena animada não se corta: mude a duração no painel" : !dentro ? "Leve o cursor para dentro da cena" : null },
    { id: "girar", rotulo: "Girar", icone: "girar", motivo: eh360 ? "Foto 360 não gira: use o movimento da câmera" : null },
    { id: "espelhar", rotulo: "Espelhar", icone: "espelhar", motivo: eh360 ? "Foto 360 não espelha" : null },
    { id: "congelar", rotulo: "Congelar", icone: "congelar", motivo: temVideo ? null : semVideo },
    { id: "velocidade", rotulo: "Velocidade", icone: "velocidade", motivo: temVideo ? null : semVideo },
    { id: "duplicar", rotulo: "Duplicar", icone: "copiar", motivo: cheio ? `No máximo ${LIMITES.cenasMax} fotos` : null },
    { id: "mover_esq", rotulo: "Mover ←", icone: "seta_esq", motivo: k === 0 ? "Esta já é a primeira cena" : null },
    { id: "mover_dir", rotulo: "Mover →", icone: "seta_dir", motivo: k === s.cenas.length - 1 ? "Esta já é a última cena" : null },
    { id: "capa", rotulo: "Capa", icone: "estrela" },
    apagarAcao,
  ]);
}

// ---------- seleção depois de uma mudança ----------

/**
 * A seleção continua valendo? Cena que sumiu, texto que saiu, trecho apagado: null. Tempo
 * de áudio, Você e legenda NUNCA muda porque as cenas mudaram -- o bloco que passou do fim
 * fica marcado `foraDoVideo`, sem mexer no dado.
 */
export function realinharSelecao(ctx: Ctx<CenaBase>, sel: RefItem | null): RefItem | null {
  if (!sel) return null;
  const s = ctx.estado;
  switch (sel.faixa) {
    case "cenas":
      return s.cenas.some((c) => c.chave === sel.chave) ? sel : null;
    case "telaFinal":
      return s.telaFinal ? sel : null;
    case "voce":
      return s.apresentador ? sel : null;
    case "musica":
    case "voz":
      return itemDoRef(ctx, sel) ? sel : null;
    case "titulo":
      return s.titulo.trim() ? sel : null;
    case "legendas": {
      const n = s.legendas?.trechos.length ?? 0;
      return n === 0 ? null : sel.indice < n ? sel : { faixa: "legendas", indice: n - 1 };
    }
    case "textos": {
      const c = s.cenas.find((x) => x.chave === sel.chave);
      if (!c) return null;
      if (sel.indice < 0) return c.legenda ? sel : null;
      return sel.indice < (c.textos?.length ?? 0) ? sel : null;
    }
    case "adesivos": {
      const c = s.cenas.find((x) => x.chave === sel.chave);
      return c && sel.indice < (c.elementos?.length ?? 0) ? sel : null;
    }
  }
}
