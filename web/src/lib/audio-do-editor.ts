import { EFEITO_SONORO_POR_ID, LIMITES, MUSICA_POR_ID, VOZ_PADRAO, type Apresentador, type EfeitoSonoroId, type ItemAudio, type MusicaId } from "./video";
import type { FaixasDaLinha, RefItem } from "./linha-do-tempo";
import type { ItemPrevia, MarcaPrevia } from "./previa-audio";

// O ÁUDIO DO EDITOR como trechos na linha do tempo (docs/planos/linha-do-tempo-spec.md, D6 e D8).
//
// Puro, sem React: o que o editor faz quando a pessoa escolhe uma música, liga a voz ou troca
// a gravação, e como os blocos da linha do tempo viram o que a prévia toca. Testado em
// scripts/testar-audio-do-editor.ts.
//
// Antes, escolher uma música só trocava um valor escondido (`musica`): a linha do tempo
// desenhava só as fotos e o Play não tocava nada. Agora a música é um TRECHO, que aparece na
// faixa Música, se corta e soa.

/** 8 letras minúsculas ou dígitos, como o saneador exige (video.ts, `limparAudios`). */
export function novoIdDeAudio(existentes: Iterable<string> = []): string {
  const ja = new Set(existentes);
  for (;;) {
    let id = "";
    while (id.length < 8) id += Math.random().toString(36).slice(2);
    id = id.slice(0, 8);
    if (/^[a-z0-9]{8}$/.test(id) && !ja.has(id)) return id;
  }
}

/** Um trecho de música novo: do começo do vídeo até o fim, em laço, com os fades de sempre (1s/2s). */
export function musicaNova(id: Exclude<MusicaId, "nenhuma">, volume: number, idTrecho: string): ItemAudio {
  return { id: idTrecho, fonte: { tipo: "musica", id }, noVideo: 0, corteArquivo: 0, volume, fadeEntrada: 1, fadeSaida: 2, laco: true };
}

export type MudancaDeAudio = { audios: ItemAudio[]; selecao: RefItem | null; aviso: string | null; abrir: "musica" | "voz" | null };

/**
 * Escolheu uma música na aba Áudio (D6, "Song pick rules"):
 *   - um trecho de música selecionado: troca só a música dele;
 *   - nenhum trecho de música: cria um, seleciona e abre a faixa ("Música adicionada");
 *   - trechos sem seleção: troca a música de todos;
 *   - "Sem música": tira todos.
 */
export function escolherMusica(audios: ItemAudio[], selecao: RefItem | null, id: MusicaId, volume: number): MudancaDeAudio {
  const musicas = audios.filter((a) => a.fonte.tipo === "musica");
  if (id === "nenhuma" || !MUSICA_POR_ID[id]?.arquivo) {
    if (!musicas.length) return { audios, selecao, aviso: null, abrir: null };
    return { audios: audios.filter((a) => a.fonte.tipo !== "musica"), selecao: selecao?.faixa === "musica" ? null : selecao, aviso: "Música tirada", abrir: null };
  }
  const fonte = { tipo: "musica" as const, id: id as Exclude<MusicaId, "nenhuma"> };
  if (selecao?.faixa === "musica" && musicas.some((a) => a.id === selecao.id)) {
    return { audios: audios.map((a) => (a.id === selecao.id ? { ...a, fonte } : a)), selecao, aviso: "Música trocada", abrir: "musica" };
  }
  if (!musicas.length) {
    const novo = musicaNova(fonte.id, volume, novoIdDeAudio(audios.map((a) => a.id)));
    return { audios: [...audios, novo], selecao: { faixa: "musica", id: novo.id }, aviso: "Música adicionada — toque para cortar", abrir: "musica" };
  }
  return { audios: audios.map((a) => (a.fonte.tipo === "musica" ? { ...a, fonte } : a)), selecao, aviso: "Música trocada", abrir: "musica" };
}

/**
 * Gravou ou enviou uma voz (D6): sem trecho de voz, entra o padrão (no mesmo lugar da voz de
 * antes, 0,7s) e fica selecionado; com trechos, eles viram UM de novo (o arquivo mudou: os
 * cortes da gravação velha não servem pra nova), guardando onde começava e o volume.
 */
export function vozNova(audios: ItemAudio[]): MudancaDeAudio {
  const vozes = audios.filter((a) => a.fonte.tipo === "voz");
  const outros = audios.filter((a) => a.fonte.tipo !== "voz");
  if (!vozes.length) {
    const v: ItemAudio = { ...VOZ_PADRAO, fonte: { tipo: "voz" } };
    return { audios: [...outros, v], selecao: { faixa: "voz", id: v.id }, aviso: "Voz adicionada — toque para cortar", abrir: "voz" };
  }
  const p = vozes.reduce((a, b) => (b.noVideo < a.noVideo ? b : a));
  const v: ItemAudio = { id: p.id, fonte: { tipo: "voz" }, noVideo: p.noVideo, corteArquivo: 0, volume: p.volume, fadeEntrada: 0, fadeSaida: 0 };
  return { audios: [...outros, v], selecao: { faixa: "voz", id: v.id }, aviso: vozes.length > 1 ? "Voz trocada: os cortes da gravação anterior foram desfeitos" : "Voz trocada", abrir: "voz" };
}

/** Volume da música (0 a 1) em todos os trechos de música. O controle da aba Áudio. */
export function volumeDaMusica(audios: ItemAudio[], volume: number): ItemAudio[] {
  const v = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
  return audios.map((a) => (a.fonte.tipo === "musica" ? { ...a, volume: v } : a));
}

/** Volume da voz (0,2 a 2) em todos os trechos de voz. O controle da aba Legendas. */
export function volumeDaVoz(audios: ItemAudio[], volume: number): ItemAudio[] {
  const v = Math.min(2, Math.max(0.2, Math.round(volume * 100) / 100));
  return audios.map((a) => (a.fonte.tipo === "voz" ? { ...a, volume: v } : a));
}

/**
 * "Começa em" da voz: a voz INTEIRA vai pra outro ponto -- todos os trechos andam juntos, o
 * primeiro passa a começar em `inicio`. Devolve quanto andou (pras legendas acompanharem).
 */
export function inicioDaVoz(audios: ItemAudio[], inicio: number, total: number): { audios: ItemAudio[]; delta: number } {
  const vozes = audios.filter((a) => a.fonte.tipo === "voz");
  if (!vozes.length) return { audios, delta: 0 };
  const primeiro = Math.min(...vozes.map((a) => a.noVideo));
  const alvo = Math.min(Math.max(0, inicio), Math.max(0, total - LIMITES.audioMin));
  const delta = Math.round((alvo - primeiro) * 100) / 100;
  if (!delta) return { audios, delta: 0 };
  return { audios: audios.map((a) => (a.fonte.tipo === "voz" ? { ...a, noVideo: Math.max(0, Math.round((a.noVideo + delta) * 100) / 100) } : a)), delta };
}

/** Os arquivos que a prévia toca. `voz` é a narração (gravada, enviada ou de IA já gerada). */
export type FontesDoEditor = {
  voz: { chave: string; url: string } | null;
  voce: { chave: string; url: string; bytes?: number } | null;
};

/** A URL da cópia de 48 kHz que o navegador toca (public/musica/previa; D8). */
export const urlDaPreviaDaMusica = (id: MusicaId) => {
  const arq = MUSICA_POR_ID[id]?.arquivo;
  return arq ? `/musica/previa/${arq}` : null;
};

/**
 * O que a prévia toca, a partir dos BLOCOS da linha do tempo -- o mesmo tempo resolvido que a
 * tela mostra (onde entra, até onde vai). Voz de IA ainda não gerada não tem arquivo: fica de
 * fora (o bloco é só estimativa). O Você toca pelo barramento da voz (a música abaixa sob ele,
 * como na montagem).
 */
export function itensDaPrevia(faixas: FaixasDaLinha, audios: ItemAudio[], apresentador: Apresentador | null, fontes: FontesDoEditor): ItemPrevia[] {
  const porId = new Map(audios.map((a) => [a.id, a]));
  const itens: ItemPrevia[] = [];
  for (const b of faixas.trilhas.musica) {
    if (b.ref.faixa !== "musica") continue;
    const a = porId.get(b.ref.id);
    if (!a || a.fonte.tipo !== "musica") continue;
    const url = urlDaPreviaDaMusica(a.fonte.id);
    if (!url || b.foraDoVideo) continue;
    itens.push({ id: a.id, fonte: { chave: `musica/${a.fonte.id}`, url }, barramento: "musica", noVideo: b.de, corte: a.corteArquivo, dur: Math.max(0, b.ate - b.de), volume: a.volume, fadeEntrada: a.fadeEntrada, fadeSaida: a.fadeSaida, laco: a.laco !== false });
  }
  if (fontes.voz) {
    for (const b of faixas.trilhas.voz) {
      if (b.ref.faixa !== "voz" || b.estimado || b.foraDoVideo) continue;
      const a = porId.get(b.ref.id);
      if (!a) continue;
      itens.push({ id: a.id, fonte: { chave: fontes.voz.chave, url: fontes.voz.url }, barramento: "voz", noVideo: b.de, corte: a.corteArquivo, dur: Math.max(0, b.ate - b.de), volume: a.volume, fadeEntrada: a.fadeEntrada, fadeSaida: a.fadeSaida, laco: false });
    }
  }
  if (fontes.voce && apresentador) {
    const b = faixas.trilhas.voce[0];
    if (b && !b.foraDoVideo) {
      itens.push({
        id: "voce",
        fonte: { chave: fontes.voce.chave, url: fontes.voce.url, ...(fontes.voce.bytes ? { bytes: fontes.voce.bytes } : {}) },
        barramento: "voz",
        noVideo: b.de,
        corte: apresentador.inicio ?? 0,
        dur: Math.max(0, b.ate - b.de),
        volume: apresentador.volume ?? 1,
        fadeEntrada: 0,
        fadeSaida: 0,
        laco: false,
      });
    }
  }
  return itens;
}

/** Os sons das viradas de cena (um por emenda), da cópia de 48 kHz (public/efeitos/previa). */
export function marcasDaPrevia(faixas: FaixasDaLinha, efeito: EfeitoSonoroId): MarcaPrevia[] {
  const arq = EFEITO_SONORO_POR_ID[efeito]?.arquivo;
  if (!arq) return [];
  return faixas.marcasDeEfeito.map((t, i) => ({ id: `marca${i}`, tempo: t, fonte: { chave: `efeitos/${efeito}`, url: `/efeitos/previa/${arq}` } }));
}
