import { LIMITES, MUSICA_POR_ID, type ItemAudio, type MusicaId } from "./video";
import { SEGUNDOS_MUSICA } from "./segundos-do-catalogo";
import type { AudioNaMontagem } from "./video-ffmpeg";

// DE TRECHO DA LINHA DO TEMPO PRA TRECHO NO COMANDO.
//
// O saneador (video.ts) aceita o que a pessoa desenhou usando a duração ESTIMADA do vídeo;
// aqui o vídeo já foi renderizado e a duração é a de verdade, medida nos clipes. As duas
// quase sempre batem, mas não sempre: a tela final pode não ter sido renderizada (sem marca
// no perfil) e o vídeo sai mais curto. Então tudo é reconferido contra o total real, e o
// trecho que não cabe mais SAI COM AVISO -- nunca calado, e nunca com o comando estourando
// o fim do vídeo.
//
// Também é aqui que a duração AUSENTE ("até o fim") vira um número: música em laço vai até o
// fim do vídeo, música sem laço até onde o arquivo acaba, voz até o fim do vídeo (o `apad`
// cobre o silêncio se o arquivo de voz for mais curto).

export type AudiosResolvidos = {
  audios: AudioNaMontagem[];
  avisos: string[];
  /** Havia trecho de voz e nenhum sobreviveu: quem cobrou a narração precisa saber. */
  vozDescartada: boolean;
};

export function resolverAudiosDaMontagem(o: {
  itens: ItemAudio[];
  /** A duração REAL do vídeo montado, não a estimada pelo saneador. */
  total: number;
  caminhoDaMusica: (id: Exclude<MusicaId, "nenhuma">) => string | null;
  caminhoDaVoz: string | null;
}): AudiosResolvidos {
  const audios: AudioNaMontagem[] = [];
  const avisos: string[] = [];
  const faltando = new Set<string>();
  let tinhaVoz = false;
  let vozQueFicou = 0;

  for (const item of o.itens) {
    // `null` = trecho de voz. Guardado assim porque o id da música é o que abre o catálogo.
    const idMusica = item.fonte.tipo === "musica" ? item.fonte.id : null;
    const ehMusica = idMusica !== null;
    if (!ehMusica) tinhaVoz = true;

    // ---- o arquivo ----
    let arquivo: string | null;
    if (idMusica !== null) {
      arquivo = o.caminhoDaMusica(idMusica);
      if (!arquivo) {
        // Uma vez por faixa: oito trechos da mesma música não viram oito avisos iguais.
        if (!faltando.has(idMusica)) {
          faltando.add(idMusica);
          avisos.push(`A trilha ${MUSICA_POR_ID[idMusica]?.rotulo ?? idMusica} não foi encontrada no servidor; o trecho saiu sem música.`);
        }
        continue;
      }
    } else {
      // Voz sem arquivo: o pipeline já avisou que a narração não pôde ser gravada.
      arquivo = o.caminhoDaVoz;
      if (!arquivo) continue;
    }

    // ---- onde entra ----
    const N = Math.min(item.noVideo, o.total);
    if (N > o.total - LIMITES.audioMin) {
      avisos.push("Um trecho de áudio começava depois do fim do vídeo e ficou de fora.");
      continue;
    }

    // ---- quanto dura ----
    // `seg` é a duração do arquivo de música (contada em amostras, segundos-do-catalogo.ts).
    // Zero = faixa sem duração conhecida; aí o trecho sem laço não tem como saber onde para
    // e cai no descarte com aviso, em vez de sair com uma duração inventada.
    const seg = idMusica !== null ? (SEGUNDOS_MUSICA[idMusica] ?? 0) : 0;
    const C = item.corteArquivo;
    const emLaco = ehMusica && item.laco !== false;
    let D = item.duracao ?? (ehMusica ? (emLaco ? o.total - N : seg - C) : o.total - N);
    D = Math.min(D, o.total - N);
    if (ehMusica && !emLaco) D = Math.min(D, seg - C);
    if (D < LIMITES.audioMin) {
      avisos.push("Um trecho de áudio ficou curto demais e saiu.");
      continue;
    }

    // ---- fades ----
    let fadeEntrada = item.fadeEntrada;
    let fadeSaida = item.fadeSaida;
    if (fadeEntrada + fadeSaida > D) {
      const k = D / (fadeEntrada + fadeSaida);
      fadeEntrada = Math.floor(fadeEntrada * k * 100) / 100;
      fadeSaida = Math.floor(fadeSaida * k * 100) / 100;
    }

    // ---- laço ----
    // `aloop` guarda o arquivo inteiro descomprimido na memória (~35 MB por 45s a 96 kHz
    // estéreo): só vai quando o trecho REALMENTE passa do fim do arquivo.
    const laco = ehMusica && item.laco !== false && C + D > seg - 0.01;

    if (!ehMusica) vozQueFicou++;
    audios.push({ arquivo, tipo: ehMusica ? "musica" : "voz", noVideo: N, corte: C, dur: D, volume: item.volume, fadeEntrada, fadeSaida, laco });
  }

  return { audios, avisos, vozDescartada: tinhaVoz && vozQueFicou === 0 };
}
