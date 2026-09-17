// OS COMANDOS DA MONTAGEM depois do áudio em trechos (linha do tempo, pacote P2).
//
//   1. byte a byte contra o que foi gravado ANTES (args-antes.json, da fase 1; e
//      args-fase3-antes.json, gravado no HEAD pelo P0): o que não é conserto sai idêntico,
//      e o conserto do áudio do Você é DESFEITO no texto do comando -- tem que sobrar o
//      antes, e o depois tem que ser diferente;
//   2. a cadeia de UM trecho (cadeiaDeAudio): as formas que a medição aprovou, e a ausência
//      das que a medição reprovou (`-stream_loop`, `-ss` na entrada, `atrim` antes de
//      `adelay`, `aresample`/`aformat`, base de silêncio);
//   3. o resolvedor (resolverAudiosDaMontagem): arquivo que falta, trecho fora do vídeo,
//      laço só quando faz falta, fades encolhidos, duração real menor que a estimada,
//      voz inteira descartada.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-montagem-audio.ts

import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
// Só o tipo: some na compilação e não carrega o módulo antes do FFMPEG_PATH.
import type { AudioNaMontagem } from "../src/lib/video-ffmpeg.ts";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;
const { LIMITES } = await import("../src/lib/video.ts");
const { SEGUNDOS_MUSICA } = await import("../src/lib/segundos-do-catalogo.ts");
const { argsMontagem, cadeiaDeAudio } = await import("../src/lib/video-ffmpeg.ts");
const { resolverAudiosDaMontagem } = await import("../src/lib/audio-montagem.ts");
const { casosDeArgs } = await import("./fixtures/casos-de-args.ts");
const { casosDeArgs: casosFase3 } = await import("./fixtures/casos-de-args-fase3.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function primeiraDiferenca(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `antes …${a.slice(Math.max(0, i - 70), i + 70)}… | depois …${b.slice(Math.max(0, i - 70), i + 70)}…`;
}

// ---------- 1. comandos x antes ----------
//
// Consertos da FASE 1 (já gravados no args-fase3-antes.json, ainda não no args-antes.json):
// o tempo do Você no vídeo, o silêncio que segura o som das viradas, e o "só no fim" pela
// duração da cena. Desfeitos aqui do mesmo jeito que em testar-relogio.ts.
const CONSERTOS_FASE1 = new Set(["montagem_efeito_sem_musica", "montagem_voce_circulo_entra_tarde", "montagem_voce_rodape_do_inicio", "cena_clipe_textos", "cena_antes_depois_textos", "cena_360_textos"]);
// Conserto DESTE pacote (B3): o áudio do Você que entra com `inicio` > 0 vinha adiantado.
// São exatamente os casos com fala do Você e `inicio` > 0.
const CONSERTOS_B3 = new Set(["montagem_voce_circulo_entra_tarde", "montagem_narracao_voce_com_audio_inicio_2_5", "montagem_tudo"]);

/**
 * Desfaz o conserto B3 no TEXTO do comando: tira do depois a entrada de áudio separada do
 * apresentador (o último `-i` cujo arquivo já estava entre as entradas) e apaga dos dois
 * lados o trecho `[N:a]…[voz1]`, cuja forma inteira mudou. O resto tem que bater.
 */
function desfazerAudioDoVoce(antes: string[], depois: string[]): { antes: string[]; depois: string[] } {
  const semVoz1 = (args: string[]) => args.map((x) => x.replace(/;\[\d+:a\][^;]*\[voz1\]/, ""));
  const d = [...depois];
  const i = d.lastIndexOf("-i");
  if (i >= 0 && i + 1 < d.length && d.slice(0, i).includes(d[i + 1])) d.splice(i, 2);
  return { antes: semVoz1(antes), depois: semVoz1(d) };
}

function desfazerFase1(nome: string, antes: string[], depois: string[]): { antes: string[]; depois: string[] } {
  let texto = JSON.stringify(depois);
  if (nome.startsWith("montagem_voce")) {
    texto = texto.replace(/setpts=PTS-STARTPTS\+[\d.]+\/TB/g, "setpts=PTS-STARTPTS").replace(/overlay=([^"]*?):eof_action=pass:/g, "overlay=$1:");
  }
  if (nome === "montagem_efeito_sem_musica") {
    texto = texto.replace(/;anullsrc=r=48000:cl=stereo,atrim=0:[\d.]+\[silencio\]/, "").replace("[silencio][ef0]", "[ef0]").replace("amix=inputs=3", "amix=inputs=2");
  }
  if (nome.startsWith("cena_")) {
    const dur = nome === "cena_antes_depois_textos" ? 6 : 8;
    texto = texto.split(`gte(t\\\\,${(dur * 0.62).toFixed(2)})`).join(`gte(t\\\\,${(4 * 0.62).toFixed(2)})`);
  }
  return { antes, depois: JSON.parse(texto) as string[] };
}

for (const [arquivo, gerar, comFase1] of [
  ["args-antes.json", casosDeArgs, true],
  ["args-fase3-antes.json", casosFase3, false],
] as const) {
  const antes = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "fixtures", arquivo), "utf8")) as Record<string, string[]>;
  const depois = gerar();
  let iguais = 0;
  const nomes = Object.keys(antes);
  for (const nome of nomes) {
    const original = antes[nome];
    const novo = depois[nome];
    if (!novo) {
      conferir(false, `${arquivo}: caso sumiu do gerador`, nome);
      continue;
    }
    const ehConserto = CONSERTOS_B3.has(nome) || (comFase1 && CONSERTOS_FASE1.has(nome));
    if (!ehConserto) {
      if (JSON.stringify(original) === JSON.stringify(novo)) iguais++;
      else conferir(false, `${arquivo}: sem mudança: ${nome}`, primeiraDiferenca(JSON.stringify(original), JSON.stringify(novo)));
      continue;
    }
    let par = { antes: original, depois: novo };
    if (comFase1 && CONSERTOS_FASE1.has(nome)) par = desfazerFase1(nome, par.antes, par.depois);
    if (CONSERTOS_B3.has(nome)) par = desfazerAudioDoVoce(par.antes, par.depois);
    const desfeito = JSON.stringify(par.depois);
    const igual = desfeito === JSON.stringify(par.antes);
    conferir(igual && JSON.stringify(novo) !== JSON.stringify(original), `${arquivo}: conserto só onde devia: ${nome}`, igual ? "" : primeiraDiferenca(JSON.stringify(par.antes), desfeito));
  }
  conferir(iguais === nomes.length - [...nomes].filter((n) => CONSERTOS_B3.has(n) || (comFase1 && CONSERTOS_FASE1.has(n))).length, `${arquivo}: todos os casos sem conserto saem idênticos`, `${iguais}/${nomes.length}`);
}

// ---------- 2. a cadeia de um trecho ----------
{
  const trecho = (a: Partial<Omit<AudioNaMontagem, "arquivo" | "tipo">> = {}, total = 20) =>
    cadeiaDeAudio("3:a", { noVideo: 0, corte: 0, dur: total, volume: 1, fadeEntrada: 0, fadeSaida: 0, laco: false, ...a }, total, "ai0");

  const inteiro = trecho();
  conferir(inteiro === "[3:a]apad,atrim=0:20.00[ai0]", "trecho que cobre o vídeo inteiro: só apad e atrim", inteiro);

  const atrasado = trecho({ noVideo: 2, corte: 10, dur: 7, fadeEntrada: 1, fadeSaida: 2 });
  conferir(
    atrasado === "[3:a]adelay=-8000:all=1,afade=t=in:st=2.00:d=1.00,afade=t=out:st=7.00:d=2.00,apad,atrim=0:20.00[ai0]" || atrasado.includes("atrim=start=8.00,asetpts=PTS-STARTPTS"),
    "corte maior que a entrada: corta o começo do arquivo, nunca adelay negativo",
    atrasado
  );
  conferir(atrasado.startsWith("[3:a]atrim=start=8.00,asetpts=PTS-STARTPTS,afade=t=in:st=2.00:d=1.00"), "corte 10 entrando aos 2s: atrim=start=8,00 e fade de entrada em 2,00", atrasado);

  const emLaco = trecho({ noVideo: 3, dur: 17, laco: true });
  conferir(emLaco.startsWith("[3:a]aloop=loop=-1:size=2147483647,adelay=3000:all=1"), "música em laço movida pra 3s: aloop e depois adelay", emLaco);

  const cortado = trecho({ noVideo: 3, corte: 1, dur: 5 });
  conferir(cortado.includes("adelay=2000:all=1") && cortado.includes("afade=t=in:st=3.00:d=0.001") && cortado.includes("afade=t=out:st=7.999:d=0.001"), "trecho no meio: atraso 2s e fades de 1ms nas duas bordas", cortado);

  const comVolume = trecho({ dur: 5, volume: 0.35 });
  conferir(comVolume.includes("volume=0.35") && !trecho({ dur: 5 }).includes("volume="), "volume só quando não é 1");

  // As formas REPROVADAS na medição não podem voltar por descuido.
  const todas = [inteiro, atrasado, emLaco, cortado, comVolume].join(" ");
  conferir(!/aresample|aformat|anullsrc|stream_loop/.test(todas), "sem reamostragem, sem normalização de formato e sem base de silêncio");
  conferir(!/atrim=start=[\d.]+(,asetpts=PTS-STARTPTS)?,adelay/.test(todas), "nunca atrim seguido de adelay (o atraso viraria só carimbo)");

  // O mesmo trecho, agora pelo montador inteiro.
  const cmd = argsMontagem({
    clipes: ["/t/c0.mp4", "/t/c1.mp4"],
    duracoes: [4, 4],
    saida: "/t/final.mp4",
    W: 1080,
    H: 1920,
    emendas: [{ xfade: "fade", segundos: 0.6 }],
    audios: [
      { arquivo: "/t/calma.m4a", tipo: "musica", noVideo: 0, corte: 0, dur: 7.4, volume: 0.8, fadeEntrada: 1, fadeSaida: 2, laco: true },
      { arquivo: "/t/voz.mp3", tipo: "voz", noVideo: 1, corte: 0, dur: 3, volume: 1, fadeEntrada: 0, fadeSaida: 0, laco: false },
    ],
  });
  const grafo = cmd[cmd.indexOf("-filter_complex") + 1];
  conferir(cmd.filter((x) => x === "-i").length === 4 && cmd.indexOf("-stream_loop") === -1, "com audios, uma entrada por trecho e nenhuma entrada em laço", cmd.slice(0, 10).join(" "));
  conferir(grafo.includes("[ai0]anull[m]") && grafo.includes("[ai1]anull[nar]"), "um trecho de cada tipo: barramento com anull", grafo.slice(grafo.indexOf("[ai0]")));
  conferir(grafo.includes("sidechaincompress=threshold=0.03:ratio=8:attack=5:release=350:makeup=1[mduck]"), "o ducking é o mesmo dos vídeos antigos");
  conferir(cmd.includes("-c:a") && cmd.includes("aac"), "o vídeo sai com áudio");

  const soMusica = argsMontagem({
    clipes: ["/t/c0.mp4"],
    duracoes: [4],
    saida: "/t/final.mp4",
    W: 1080,
    H: 1920,
    emendas: [],
    audios: [
      { arquivo: "/t/a.m4a", tipo: "musica", noVideo: 0, corte: 0, dur: 2, volume: 1, fadeEntrada: 0, fadeSaida: 0, laco: false },
      { arquivo: "/t/b.m4a", tipo: "musica", noVideo: 2, corte: 0, dur: 2, volume: 1, fadeEntrada: 0, fadeSaida: 0, laco: false },
    ],
  });
  const grafo2 = soMusica[soMusica.indexOf("-filter_complex") + 1];
  conferir(grafo2.includes("[ai0][ai1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[m]") && grafo2.includes("[m]anull[aout]") && !grafo2.includes("sidechain"), "duas músicas e nenhuma voz: amix e nenhum ducking", grafo2.slice(grafo2.indexOf("[ai0]")));
}

// ---------- 3. o resolvedor ----------
{
  const musica = (extra: Partial<Parameters<typeof resolverAudiosDaMontagem>[0]["itens"][number]> = {}) => ({
    id: "musica00",
    fonte: { tipo: "musica" as const, id: "calma" as const },
    noVideo: 0,
    corteArquivo: 0,
    volume: 0.8,
    fadeEntrada: 1,
    fadeSaida: 2,
    laco: true,
    ...extra,
  });
  const voz = (extra: Partial<Parameters<typeof resolverAudiosDaMontagem>[0]["itens"][number]> = {}) => ({
    id: "voz00000",
    fonte: { tipo: "voz" as const },
    noVideo: 0.7,
    corteArquivo: 0,
    volume: 1,
    fadeEntrada: 0,
    fadeSaida: 0,
    ...extra,
  });
  const base = { caminhoDaMusica: () => "/t/calma.m4a", caminhoDaVoz: "/t/voz.mp3" };
  const SEG = SEGUNDOS_MUSICA.calma as number;

  const semArquivo = resolverAudiosDaMontagem({ itens: [musica(), musica({ id: "musica01", noVideo: 5 })], total: 20, ...base, caminhoDaMusica: () => null });
  conferir(semArquivo.audios.length === 0 && semArquivo.avisos.length === 1 && semArquivo.avisos[0].includes("Calma"), "trilha que falta no servidor: um aviso só, com o rótulo", semArquivo.avisos.join(" | "));

  const foraDoVideo = resolverAudiosDaMontagem({ itens: [musica({ noVideo: 19.9 })], total: 20, ...base });
  conferir(foraDoVideo.audios.length === 0 && foraDoVideo.avisos[0].includes("depois do fim do vídeo"), "trecho que começa a menos de audioMin do fim sai com aviso", foraDoVideo.avisos.join(" | "));
  conferir(resolverAudiosDaMontagem({ itens: [musica({ noVideo: 19.7 })], total: 20, ...base }).audios.length === 1, "exatamente em total − audioMin ainda entra");

  const semLaco = resolverAudiosDaMontagem({ itens: [musica({ laco: false })], total: 120, ...base });
  conferir(semLaco.audios.length === 1 && Math.abs(semLaco.audios[0].dur - SEG) < 1e-9 && semLaco.audios[0].laco === false, "música sem laço num vídeo longo para onde o arquivo acaba", JSON.stringify(semLaco.audios[0]));

  const comLaco = resolverAudiosDaMontagem({ itens: [musica()], total: 120, ...base });
  conferir(comLaco.audios[0].dur === 120 && comLaco.audios[0].laco === true, "música em laço cobre o vídeo inteiro e liga o aloop", JSON.stringify(comLaco.audios[0]));

  const cabeNoArquivo = resolverAudiosDaMontagem({ itens: [musica({ duracao: 10 })], total: 120, ...base });
  conferir(cabeNoArquivo.audios[0].laco === false, "trecho de 10s dentro de um arquivo de 45s não liga o aloop mesmo com laco: true", JSON.stringify(cabeNoArquivo.audios[0]));
  const naBorda = resolverAudiosDaMontagem({ itens: [musica({ corteArquivo: SEG - 5, duracao: 6 })], total: 120, ...base });
  conferir(naBorda.audios[0].laco === true, "trecho que passa do fim do arquivo liga o aloop", JSON.stringify(naBorda.audios[0]));

  const curto = resolverAudiosDaMontagem({ itens: [musica({ laco: false, corteArquivo: SEG - 0.1 })], total: 60, ...base });
  conferir(curto.audios.length === 0 && curto.avisos[0].includes("curto demais"), "sobra de arquivo menor que audioMin sai com aviso", curto.avisos.join(" | "));

  const fades = resolverAudiosDaMontagem({ itens: [musica({ duracao: 2, fadeEntrada: 3, fadeSaida: 5 })], total: 60, ...base });
  conferir(fades.audios[0].fadeEntrada === 0.75 && fades.audios[0].fadeSaida === 1.25, "fades maiores que o trecho encolhem na proporção", JSON.stringify(fades.audios[0]));

  // A duração REAL menor que a estimada pelo saneador (tela final que não saiu).
  const encurtado = resolverAudiosDaMontagem({ itens: [musica({ noVideo: 2, duracao: 30 }), voz({ noVideo: 12 })], total: 11.4, ...base });
  conferir(encurtado.audios.length === 1 && Math.abs(encurtado.audios[0].dur - 9.4) < 1e-9, "vídeo mais curto que o estimado: o trecho é aparado no fim real", JSON.stringify(encurtado.audios));
  conferir(encurtado.vozDescartada === true && encurtado.avisos.some((a) => a.includes("depois do fim do vídeo")), "voz que ficou toda fora do vídeo é sinalizada pra quem cobrou");

  const vozSemArquivo = resolverAudiosDaMontagem({ itens: [voz()], total: 20, ...base, caminhoDaVoz: null });
  conferir(vozSemArquivo.audios.length === 0 && vozSemArquivo.avisos.length === 0 && vozSemArquivo.vozDescartada === true, "voz sem arquivo sai calada (o pipeline já avisou)");

  const vozInteira = resolverAudiosDaMontagem({ itens: [voz()], total: 20, ...base });
  conferir(vozInteira.audios[0].dur === 20 - 0.7 && vozInteira.audios[0].laco === false && vozInteira.vozDescartada === false, "voz sem duração vai até o fim do vídeo, sem laço", JSON.stringify(vozInteira.audios[0]));

  const ordem = resolverAudiosDaMontagem({ itens: [voz({ noVideo: 1 }), musica({ noVideo: 0 })], total: 20, ...base });
  conferir(ordem.audios.map((a) => a.tipo).join(",") === "voz,musica", "a ordem da entrada é mantida (o índice do trecho é o da entrada do ffmpeg)");

  conferir(LIMITES.audioMin === 0.3, "audioMin continua 0,3s (o resolvedor mede contra ele)");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
