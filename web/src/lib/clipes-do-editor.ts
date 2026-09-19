import { LIMITES, type TransicaoId } from "./video";

// VÍDEO ENTRANDO NA LINHA DO TEMPO como clipe (um vídeo que a pessoa já fez no Encena, ou
// um que ela enviou do celular).
//
// Cada cena tem no máximo 8s (LIMITES.duracaoMax) -- é o que a montagem aguenta por etapa.
// Um vídeo de 26s entra então como PARTES seguidas do mesmo arquivo, cada uma começando
// exatamente onde a anterior parou, com corte seco entre elas. A montagem reconhece a
// continuação (video.ts, `clipeContinua`) e não segura o último quadro ali: o vídeo sai
// inteiro, sem soluço nas emendas. A pessoa vê o vídeo todo na linha, em vez de 6s
// cortados sem aviso.
//
// Puro, sem React. Testado em scripts/testar-clipes-do-editor.ts.

/**
 * O "pouso" do clipe: no fim de uma cena de clipe que NÃO continua na seguinte, a montagem
 * usa o arquivo até 0,45s antes do fim e segura o último quadro (video-ffmpeg.ts,
 * SEGUNDOS_DE_POUSO), pra emenda pousar num quadro limpo.
 */
export const POUSO_DO_CLIPE = 0.45;

export type ParteDoClipe = { inicio: number; duracao: number; transicao?: TransicaoId };

/**
 * As cenas em que um arquivo de `segundos` entra, cabendo em `vagas` cenas livres.
 *
 * Durações inteiras (o pedido arredonda), entre 3 e 8, o mais iguais possível: 26s viram
 * 7+7+6+6, não 8+8+8+2 (uma cena de 2s nem existe). Entre uma parte e a próxima, corte
 * seco (`transicao: "corte"`); a última fica com a emenda do vídeo. `sobrou` diz quantos
 * segundos do arquivo ficaram de fora por falta de vaga ou pelo teto de aparar (aparaMax).
 */
export function partesDoClipe(segundos: number, vagas: number, inicio0 = 0): { partes: ParteDoClipe[]; sobrou: number } {
  if (vagas <= 0 || !(segundos > 0)) return { partes: [], sobrou: Math.max(0, segundos || 0) };
  const min = LIMITES.duracaoMin;
  const max = LIMITES.duracaoMax;
  const disponivel = Math.max(0, segundos - inicio0);
  // Arredonda pro segundo mais perto: 7,4s vira 7s (some o finzinho) e 7,6s vira 8s (o
  // último quadro segura um instante). Nenhum dos dois se nota; cena de fração não existe.
  let total = Math.max(min, Math.round(disponivel));
  let k = Math.ceil(total / max);
  if (k > vagas) {
    k = vagas;
    total = k * max;
  }
  const base = Math.floor(total / k);
  const extra = total - base * k;
  const partes: ParteDoClipe[] = [];
  let inicio = inicio0;
  for (let i = 0; i < k; i++) {
    // Não dá pra começar depois do teto de aparar: dali pra frente o vídeo fica de fora.
    if (inicio > LIMITES.aparaMax) break;
    const duracao = Math.min(max, Math.max(min, base + (i < extra ? 1 : 0)));
    partes.push({ inicio: Math.round(inicio * 10) / 10, duracao });
    inicio += duracao;
  }
  // Corte seco entre as partes: é a condição pra montagem emendar sem pouso.
  for (let i = 0; i < partes.length - 1; i++) partes[i].transicao = "corte";
  const usado = partes.reduce((s, p) => s + p.duracao, 0);
  return { partes, sobrou: Math.max(0, Math.round((disponivel - usado) * 10) / 10) };
}

/**
 * Em que segundo do ARQUIVO a cena está, `t` segundos depois de começar -- o que o palco
 * mostra. Congelada, fica no quadro do início.
 */
export function tempoNoArquivo(cena: { inicio?: number; duracao: number; velocidade?: number; congelar?: boolean }, t: number): number {
  const inicio = Math.max(0, cena.inicio ?? 0);
  if (cena.congelar) return inicio;
  const vel = cena.velocidade ?? 1;
  return inicio + Math.min(Math.max(0, t), cena.duracao) * vel;
}

/**
 * A cena `i` e a seguinte são partes SEGUIDAS do mesmo arquivo (a próxima começa no segundo
 * em que esta termina). Trocar a transição do vídeo inteiro não mexe nessas emendas: elas
 * precisam continuar em corte seco pra montagem emendar sem soluço (video.ts, `clipeContinua`).
 */
export function continuaNaProxima(cenas: { tipo: string; arquivo?: string; inicio?: number; duracao: number; velocidade?: number; congelar?: boolean }[], i: number): boolean {
  const a = cenas[i];
  const b = cenas[i + 1];
  if (!a || !b || a.tipo !== "clipe" || b.tipo !== "clipe" || !a.arquivo || a.arquivo !== b.arquivo || a.congelar || b.congelar) return false;
  return Math.abs((b.inicio ?? 0) - ((a.inicio ?? 0) + a.duracao * (a.velocidade ?? 1))) < 0.15;
}
