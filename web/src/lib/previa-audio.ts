// A CONTA DA PRÉVIA DE ÁUDIO, sem navegador (docs/planos/linha-do-tempo-spec.md, D8).
//
// Tocar a linha do tempo no navegador é agendar, num instante só, tudo que vai soar dali
// pra frente: cada trecho vira um nó que começa em `base + atraso`, parte do segundo
// `offset` do arquivo e dura `duracao`, com o ganho subindo e descendo nos fades.
//
// Essa conta mora AQUI, fora do React e fora do Web Audio, por um motivo prático: erro de
// agendamento não aparece na tela, aparece no ouvido -- e som é a coisa mais cara de
// depurar num teste de navegador. Aqui ela roda no Node, em milissegundos, com número
// exato: `agendaDaPrevia` é uma função pura de (trechos, instante, duração dos arquivos).
//
// O que ela resolve e o motivo de cada regra:
//
//   - tocar do MEIO: quem aperta Play no segundo 12 não ouve o trecho do começo de novo;
//     o pedaço já passado é descontado do offset, não do atraso;
//   - LAÇO: a música em laço volta pro começo do arquivo, então o offset é `off % dur`.
//     Sem laço, `off` além do fim do arquivo não é som nenhum -- o trecho sai da agenda,
//     em vez de virar um nó que começa depois do fim e nunca soa;
//   - FADE no meio do fade: começar a tocar dentro da subida exige o ganho INICIAL certo
//     (`setValueAtTime`) e só depois a rampa; sem isso a música entra no volume cheio e
//     dá um estalo;
//   - DUCK: a música abaixa enquanto a voz fala. As janelas de voz vêm juntas (`juntar`),
//     porque subir e abaixar entre duas frases coladas é pior que ficar abaixado.

/** De onde vem o som de um trecho na prévia. `chave` é o que identifica o arquivo no cache. */
export type FontePrevia = { chave: string; url: string; bytes?: number };

export type BarramentoPrevia = "musica" | "voz";

/** Como a fonte vai tocar: decodificada na memória, ou por um `<video>` escondido. */
export type ModoDaFonte = "buffer" | "elemento";

/** Um trecho da linha do tempo, já com o tempo RESOLVIDO (o que o bloco mostra na tela). */
export type ItemPrevia = {
  id: string;
  fonte: FontePrevia;
  barramento: BarramentoPrevia;
  /** Segundo do vídeo em que o trecho entra. */
  noVideo: number;
  /** Segundo do arquivo de onde o trecho parte. */
  corte: number;
  /** Quanto o trecho ocupa na linha do tempo (já limitado ao total do vídeo). */
  dur: number;
  volume: number;
  fadeEntrada: number;
  fadeSaida: number;
  laco: boolean;
  modo?: ModoDaFonte;
};

/** Um som de uma virada de cena: toca uma vez, no instante da emenda. */
export type MarcaPrevia = { id: string; tempo: number; fonte: FontePrevia };

export type Janela = { de: number; ate: number };

/** Um ponto da automação de ganho, em segundos depois do início da reprodução. */
export type PontoDeGanho = { em: number; ganho: number };

export type EntradaDaAgenda = {
  id: string;
  fonte: FontePrevia;
  barramento: BarramentoPrevia;
  modo: ModoDaFonte;
  /** Segundos depois de `base` em que o nó começa. */
  atraso: number;
  /** Segundo do ARQUIVO de onde o nó parte. */
  offset: number;
  /** Quanto o nó toca, em segundos. */
  duracao: number;
  laco: boolean;
  /**
   * O ganho ao longo do trecho. O primeiro ponto é `setValueAtTime` (o ganho no instante
   * em que o nó começa, que pode ser o meio de um fade); os seguintes são rampas lineares.
   */
  rampas: PontoDeGanho[];
};

/** Quantos segundos tem o arquivo de uma fonte. `undefined` = ainda não se sabe. */
export type DuracaoDaFonte = (chave: string) => number | undefined;

/** Ganho durante o duck, e os tempos de reação. 0.54 ≈ −5,3 dB (spec D8). */
export const DUQUE = { ganho: 0.54, ataque: 0.005, alivio: 0.35 } as const;

/** Volume dos sons de virada de cena (FF:966). */
export const GANHO_DA_MARCA = 0.8;

/** Acima disso o arquivo da voz não é decodificado na memória: toca por um `<video>`. */
export const BYTES_PARA_ELEMENTO = 25 * 1024 * 1024;

/** Arredonda pra microssegundo: a conta de tempo não pode carregar lixo de ponto flutuante. */
function arred(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * O ganho do trecho no segundo `t` do VÍDEO, já com o volume dentro.
 *
 * Fora do trecho é 0. Dentro, o volume multiplicado pela subida (fade de entrada) e pela
 * descida (fade de saída) -- os dois ao mesmo tempo quando o trecho é mais curto que a
 * soma dos fades, que é o caso que o saneador já encurta mas a prévia não pode supor.
 */
export function ganhoNoTempo(item: Pick<ItemPrevia, "noVideo" | "dur" | "volume" | "fadeEntrada" | "fadeSaida">, t: number): number {
  if (item.dur <= 0) return 0;
  const x = t - item.noVideo;
  if (x < 0 || x > item.dur) return 0;
  let g = Math.max(0, item.volume);
  const entrada = Math.min(Math.max(0, item.fadeEntrada), item.dur);
  const saida = Math.min(Math.max(0, item.fadeSaida), item.dur);
  if (entrada > 0 && x < entrada) g *= x / entrada;
  if (saida > 0 && x > item.dur - saida) g *= (item.dur - x) / saida;
  return arred(Math.max(0, g));
}

/** Os instantes (em tempo de vídeo) em que o ganho muda de inclinação. */
function marcosDoGanho(item: ItemPrevia, tIni: number, tFim: number): number[] {
  const marcos = [tIni];
  const fimDaEntrada = item.noVideo + Math.min(Math.max(0, item.fadeEntrada), item.dur);
  const inicioDaSaida = item.noVideo + item.dur - Math.min(Math.max(0, item.fadeSaida), item.dur);
  for (const m of [fimDaEntrada, inicioDaSaida]) if (m > tIni && m < tFim) marcos.push(m);
  marcos.push(tFim);
  marcos.sort((a, b) => a - b);
  return marcos.filter((m, i) => i === 0 || m - marcos[i - 1] > 1e-6);
}

/**
 * O que precisa ser agendado pra tocar a linha do tempo a partir do segundo `t0`.
 *
 * `dur` responde quantos segundos tem o ARQUIVO de cada fonte (o que já foi decodificado).
 * Sem essa resposta o trecho entra assim mesmo: é melhor tocar de mais que ficar mudo
 * enquanto o arquivo termina de carregar, e o motor reagenda quando souber.
 */
export function agendaDaPrevia(itens: ItemPrevia[], t0: number, dur: DuracaoDaFonte): EntradaDaAgenda[] {
  const agenda: EntradaDaAgenda[] = [];
  for (const item of itens) {
    if (!(item.dur > 0)) continue;
    const fim = item.noVideo + item.dur;
    if (fim <= t0) continue;

    // O pedaço já passado sai do OFFSET (o arquivo já andou), não do atraso.
    const pulado = Math.max(0, t0 - item.noVideo);
    const atraso = Math.max(0, item.noVideo - t0);
    let duracao = item.dur - pulado;
    if (!(duracao > 0)) continue;

    let offset = item.corte + pulado;
    const segundos = dur(item.fonte.chave);
    if (segundos !== undefined && segundos > 0) {
      if (item.laco) {
        offset = offset % segundos;
      } else {
        if (offset >= segundos - 1e-6) continue; // depois do fim do arquivo: não é som nenhum
        duracao = Math.min(duracao, segundos - offset);
        if (!(duracao > 1e-6)) continue;
      }
    }

    const tIni = t0 + atraso;
    const tFim = tIni + duracao;
    agenda.push({
      id: item.id,
      fonte: item.fonte,
      barramento: item.barramento,
      modo: item.modo ?? "buffer",
      atraso: arred(atraso),
      offset: arred(offset),
      duracao: arred(duracao),
      laco: item.laco,
      rampas: marcosDoGanho(item, tIni, tFim).map((t) => ({ em: arred(t - t0), ganho: ganhoNoTempo(item, t) })),
    });
  }
  agenda.sort((a, b) => a.atraso - b.atraso || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return agenda;
}

/**
 * Quando a música tem que abaixar: as janelas de voz (e as do Você) juntas.
 *
 * Duas falas separadas por menos que o alívio viram UMA janela. Subir o volume por 200 ms
 * entre duas frases é audível e soa como defeito; ficar abaixado, não.
 */
export function janelasDeVoz(itens: ItemPrevia[], extras: Janela[] = [], o?: { juntar?: number }): Janela[] {
  const juntar = o?.juntar ?? DUQUE.alivio;
  const brutas: Janela[] = [];
  for (const i of itens) if (i.barramento === "voz" && i.dur > 0) brutas.push({ de: i.noVideo, ate: i.noVideo + i.dur });
  for (const e of extras) if (e.ate > e.de) brutas.push({ de: e.de, ate: e.ate });
  brutas.sort((a, b) => a.de - b.de || a.ate - b.ate);

  const juntas: Janela[] = [];
  for (const j of brutas) {
    const ultima = juntas[juntas.length - 1];
    if (ultima && j.de <= ultima.ate + juntar) ultima.ate = Math.max(ultima.ate, j.ate);
    else juntas.push({ de: arred(j.de), ate: arred(j.ate) });
  }
  for (const j of juntas) j.ate = arred(j.ate);
  return juntas;
}

/**
 * A automação do barramento da música: 1 fora das janelas, `DUQUE.ganho` dentro.
 *
 * Os pontos saem em segundos DEPOIS do início da reprodução (o mesmo eixo das rampas da
 * agenda), já descontando o que ficou pra trás de `t0`.
 */
export function automacaoDoDuque(janelas: Janela[], t0: number, total: number, o?: { ganho?: number; ataque?: number; alivio?: number }): PontoDeGanho[] {
  const ganho = o?.ganho ?? DUQUE.ganho;
  const ataque = o?.ataque ?? DUQUE.ataque;
  const alivio = o?.alivio ?? DUQUE.alivio;
  const pontos: PontoDeGanho[] = [{ em: 0, ganho: 1 }];
  for (const j of janelas) {
    if (j.ate <= t0) continue;
    if (j.de >= total) break;
    const de = Math.max(j.de, t0);
    const ate = Math.min(j.ate, total);
    if (de <= t0) {
      // Play caiu DENTRO da fala: já começa abaixado, sem rampa de ataque.
      pontos[0] = { em: 0, ganho };
    } else {
      pontos.push({ em: arred(Math.max(0, de - t0 - ataque)), ganho: 1 });
      pontos.push({ em: arred(de - t0), ganho });
    }
    if (ate < total) {
      pontos.push({ em: arred(ate - t0), ganho });
      pontos.push({ em: arred(ate - t0 + alivio), ganho: 1 });
    }
  }
  return pontos;
}
