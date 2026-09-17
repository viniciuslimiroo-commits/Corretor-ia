// O ÁUDIO EM TRECHOS, MEDIDO NO ARQUIVO QUE SAI (spec P2, testes 3, 4 e 6).
//
// Render de verdade, com fotos reais, a música real do catálogo, o efeito real das viradas e
// a voz real gravada no celular. Sem banco, sem storage, sem crédito: só o ffmpeg local.
//
// O critério é sempre o ARQUIVO FINAL, medido em janelas de 0,25s com `astats` -- nunca o
// texto do comando. Um comando "certo" que põe o som no segundo 0 foi exatamente o defeito
// do áudio do Você, e ele passou anos porque o teste comparava strings.
//
//   (a)  música cortada em 10s, entrando aos 2s por 7s, com fades 1/2;
//   (a') música em laço movida pra 3s (aloop → adelay), a composição que o servidor usa;
//   (b)  voz dividida em [3,5) e [6,8) -- com tom de 1 kHz, que dá pra separar por filtro;
//   (c)  o ducking: quanto a música abaixa durante a voz, no caminho novo e no antigo;
//   (d)  espec ANTIGO pelos dois caminhos: cada janela dentro de 0,5 dB;
//   (e)  o som da virada no instante da emenda;
//   (f)  o Você que entra aos 6,8s com `inicio` 1 -- e o comando ANTIGO tem que FALHAR
//        a mesma medida, senão a medida não enxerga o defeito;
//   (g)  a versão com a voz real, gravada em docs/testes-reais/editor/audio-blocos/ pra ouvir;
//   (4)  grafo acima de 20 KB (120 legendas + 16 trechos) vai pra arquivo e renderiza;
//   (6)  quanto a montagem com trechos custa a mais que a de hoje, com 1 e 2 linhas de trabalho.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-audio-blocos.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import type { AudioNaMontagem } from "../src/lib/video-ffmpeg.ts";

const FF = ffmpegStatic as unknown as string;
process.env.FFMPEG_PATH ??= FF;
const { itensDeAudioDoEspec, limparEspec } = await import("../src/lib/video.ts");
const { argsCenaFoto, argsMontagem } = await import("../src/lib/video-ffmpeg.ts");
const { resolverAudiosDaMontagem } = await import("../src/lib/audio-montagem.ts");
const { rodarFfmpeg, versaoDoFfmpeg, LIMITE_DO_GRAFO } = await import("../src/lib/ffmpeg.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
const REAIS = path.join(RAIZ, "..", "docs", "testes-reais");
const PROVAS = path.join(REAIS, "editor", "audio-blocos");
fs.mkdirSync(PROVAS, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-audio-blocos-"));
const t = (nome: string) => path.join(tmp, nome);

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- medida ----------

/** Roda o ffmpeg e devolve o stderr/stdout inteiro (as medidas do astats saem por lá). */
function medir(args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(FF, ["-y", "-hide_banner", "-nostdin", ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (erro, saida, stderr) => {
      if (erro && !String(stderr).includes("lavfi.astats")) reject(new Error(`ffmpeg: ${String(stderr).slice(-400)}`));
      else resolve(String(saida) + String(stderr));
    });
  });
}

type Janela = { t: number; rms: number; pico: number };

/**
 * Nível por janela do arquivo. `filtro` entra ANTES do astats (é onde mora o passa-faixa que
 * separa o tom do resto). `-inf` vira −120 dB, que é o que "silêncio" quer dizer numa conta.
 *
 * MEDIDO AQUI, e vale escrever: o `reset` do astats conta QUADROS, não amostras. Com
 * `reset=12000` num arquivo de 500 quadros ele nunca reseta, e o que sai é a média
 * ACUMULADA desde o começo -- uma curva que sobe suave e esconde qualquer fade. O jeito
 * certo é cortar o áudio em quadros do tamanho da janela (`asetnsamples`) e resetar a cada
 * quadro. O instrumento errado passa despercebido porque os números são plausíveis.
 */
async function janelas(arquivo: string, segundos: number, filtro = ""): Promise<Janela[]> {
  const amostras = Math.round(48000 * segundos);
  const cadeia = [
    "aresample=48000",
    ...(filtro ? [filtro] : []),
    `asetnsamples=n=${amostras}:p=0`,
    "astats=metadata=1:reset=1",
    "ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=-",
  ];
  const texto = await medir(["-i", arquivo, "-af", cadeia.join(","), "-f", "null", "-"]);
  const numero = (v: string) => (v === "-inf" || v === "nan" ? -120 : Number(v));
  // Os dois `ametadata` imprimem o MESMO quadro, um com cada chave: junta pelo número do quadro.
  const porQuadro = new Map<number, Janela>();
  let atual = -1;
  for (const linha of texto.split("\n")) {
    const mQuadro = linha.match(/^frame:(\d+)\s+pts:\S+\s+pts_time:(\S+)/);
    if (mQuadro) {
      atual = Number(mQuadro[1]);
      if (!porQuadro.has(atual)) porQuadro.set(atual, { t: Number(mQuadro[2]), rms: -120, pico: -120 });
      continue;
    }
    const j = porQuadro.get(atual);
    if (!j) continue;
    const mRms = linha.match(/lavfi\.astats\.Overall\.RMS_level=(\S+)/);
    if (mRms) j.rms = numero(mRms[1]);
    const mPico = linha.match(/lavfi\.astats\.Overall\.Peak_level=(\S+)/);
    if (mPico) j.pico = numero(mPico[1]);
  }
  return [...porQuadro.values()].sort((a, b) => a.t - b.t);
}

const em = (js: Janela[], segundo: number) => js.reduce((melhor, j) => (Math.abs(j.t - segundo) < Math.abs(melhor.t - segundo) ? j : melhor), js[0]);
const entre = (js: Janela[], de: number, ate: number) => js.filter((j) => j.t >= de - 1e-9 && j.t < ate - 1e-9);
const maior = (js: Janela[]) => js.reduce((m, j) => Math.max(m, j.rms), -120);
const menor = (js: Janela[]) => js.reduce((m, j) => Math.min(m, j.rms), 0);
/** O primeiro instante em que o som aparece: a primeira janela acima do limiar. */
const entrada = (js: Janela[], limiar = -50) => js.find((j) => j.rms > limiar)?.t ?? Infinity;

// ---------- material real ----------

const W = 360;
const H = 640;
const FOTOS = ["01-mobiliar-depois.jpg", "02-mobiliar-depois.jpg", "03-mobiliar-depois.jpg"].map((f) => path.join(REAIS, f));
const MUSICA = path.join(RAIZ, "public", "musica", "calma.m4a");
const CLIQUE = path.join(RAIZ, "public", "efeitos", "clique.m4a");
const VOZ_MP4 = path.join(REAIS, "voz", "com-voz-propria.mp4");
for (const f of [...FOTOS, MUSICA, CLIQUE, VOZ_MP4]) {
  if (!fs.existsSync(f)) {
    console.log(`FALHA falta material real: ${f}`);
    process.exit(1);
  }
}
conferir(true, "material real presente", `${FOTOS.length} fotos, ${path.basename(MUSICA)}, ${path.basename(CLIQUE)}, ${path.basename(VOZ_MP4)}`);
conferir(versaoDoFfmpeg() >= 6, "versão do ffmpeg lida do binário", `maior ${versaoDoFfmpeg()} · limite do grafo ${LIMITE_DO_GRAFO}`);

// A voz real, sem o vídeo e sem recodificar (é a mesma faixa que o pipeline baixa do bucket).
const VOZ = t("voz.m4a");
await rodarFfmpeg(["-i", VOZ_MP4, "-vn", "-c:a", "copy", VOZ], 60_000);
// O tom de 1 kHz: sinal de MEDIDA, nunca no lugar de áudio real.
const TOM = t("tom.m4a");
await rodarFfmpeg(["-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=12", "-c:a", "aac", "-b:a", "128k", TOM], 60_000);

// ---------- controle da MEDIDA ----------
// Antes de medir render nenhum: a régua mede o que se espera dela? Um sinal conhecido
// (tom contínuo, −3 dBFS de RMS) e um silêncio conhecido. Sem isto, um astats configurado
// errado devolve números plausíveis a vida inteira (foi o que aconteceu na primeira volta:
// `reset` conta quadros, e a medida virou média acumulada).
{
  const controle = t("controle.m4a");
  await rodarFfmpeg(["-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=2", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-c:a", "aac", "-b:a", "128k", controle], 60_000);
  const js = await janelas(controle, 0.25);
  const daFonte = await janelas(TOM, 0.25);
  const nivelDoTom = em(daFonte, 1).rms;
  const comSom = entre(js, 0.25, 1.75);
  const semSom = entre(js, 2.25, 3.75);
  conferir(js.length >= 15 && Math.abs(js[1].t - js[0].t - 0.25) < 0.01, "controle: uma janela de 0,25s por medida", `${js.length} janelas, passo ${(js[1].t - js[0].t).toFixed(3)}s`);
  conferir(maior(comSom) - menor(comSom) < 0.5 && Math.abs(menor(comSom) - nivelDoTom) < 0.5, "controle: um tom contínuo mede o mesmo nível em toda janela", `${menor(comSom).toFixed(2)} … ${maior(comSom).toFixed(2)} dB · fonte ${nivelDoTom.toFixed(2)} dB`);
  conferir(maior(semSom) < -80, "controle: o silêncio mede silêncio", `máx ${maior(semSom).toFixed(1)} dB`);
}

// Três cenas de 4s com as fotos reais, emendadas com dissolver de 0,6s.
const DUR = [4, 4, 4];
const EMENDAS = [
  { xfade: "fade", segundos: 0.6 },
  { xfade: "fade", segundos: 0.6 },
];
const TOTAL = DUR.reduce((s, d) => s + d, 0) - EMENDAS.reduce((s, e) => s + e.segundos, 0);
const CLIPES = FOTOS.map((_, i) => t(`c${i}.mp4`));
for (let i = 0; i < FOTOS.length; i++) {
  await rodarFfmpeg(argsCenaFoto({ foto: FOTOS[i], saida: CLIPES[i], W, H, duracao: DUR[i], efeito: i === 1 ? "direita" : "aproximar" }), 120_000);
}

const base = { clipes: CLIPES, duracoes: DUR, W, H, emendas: EMENDAS };
const montar = async (nome: string, extra: Parameters<typeof argsMontagem>[0] extends infer T ? Partial<T> : never, timeoutMs = 180_000) => {
  const saida = t(`${nome}.mp4`);
  await rodarFfmpeg(argsMontagem({ ...base, saida, ...(extra as object) } as Parameters<typeof argsMontagem>[0]), timeoutMs);
  return saida;
};
const item = (a: Partial<AudioNaMontagem> & Pick<AudioNaMontagem, "arquivo" | "tipo">): AudioNaMontagem => ({ noVideo: 0, corte: 0, dur: TOTAL, volume: 1, fadeEntrada: 0, fadeSaida: 0, laco: false, ...a });

// ---------- (a) música cortada, entrando aos 2s ----------
{
  const arquivo = await montar("a_musica_cortada", { audios: [item({ arquivo: MUSICA, tipo: "musica", noVideo: 2, corte: 10, dur: 7, volume: 0.8, fadeEntrada: 1, fadeSaida: 2 })] });
  const js = await janelas(arquivo, 0.25);
  conferir(maior(entre(js, 0, 2)) < -50, "(a) silêncio antes de 2,0s", `máx ${maior(entre(js, 0, 2)).toFixed(1)} dB`);
  conferir(em(js, 2.75).rms > em(js, 2).rms + 3, "(a) o fade de entrada sobe entre 2 e 3s", `${em(js, 2).rms.toFixed(1)} → ${em(js, 2.75).rms.toFixed(1)} dB`);
  conferir(em(js, 8.75).rms < em(js, 6.75).rms - 3, "(a) o fade de saída desce entre 7 e 9s", `${em(js, 6.75).rms.toFixed(1)} → ${em(js, 8.75).rms.toFixed(1)} dB`);
  conferir(maior(entre(js, 9.25, TOTAL + 1)) < -50, "(a) silêncio depois de 9,25s", `máx ${maior(entre(js, 9.25, TOTAL + 1)).toFixed(1)} dB`);
}

// ---------- (a') música em laço movida pra 3s ----------
{
  // `laco: true` de propósito: é a composição aloop → adelay que o servidor emite quando o
  // trecho passa do fim do arquivo, e ela precisa ser medida em cada binário.
  const arquivo = await montar("a2_musica_laco", { audios: [item({ arquivo: MUSICA, tipo: "musica", noVideo: 3, corte: 0, dur: TOTAL - 3, volume: 0.8, laco: true })] });
  const js = await janelas(arquivo, 0.25);
  conferir(maior(entre(js, 0, 3)) < -50, "(a') silêncio antes de 3,0s com aloop → adelay", `máx ${maior(entre(js, 0, 3)).toFixed(1)} dB`);
  conferir(em(js, 3).rms > -50, "(a') o som já está na janela de 3,00s", `${em(js, 3).rms.toFixed(1)} dB`);
  conferir(Math.abs(entrada(js) - 3) < 0.26, "(a') a entrada cai na janela certa", `entrada ${entrada(js).toFixed(2)}s`);
}

// ---------- (b) voz dividida em dois trechos ----------
{
  const arquivo = await montar("b_voz_dividida", {
    audios: [item({ arquivo: TOM, tipo: "voz", noVideo: 3, corte: 0, dur: 2 }), item({ arquivo: TOM, tipo: "voz", noVideo: 6, corte: 3, dur: 2 })],
  });
  const js = await janelas(arquivo, 0.25, "bandpass=f=1000:width_type=h:w=120");
  const dentro = [...entre(js, 3.25, 4.75), ...entre(js, 6.25, 7.75)];
  const fora = [...entre(js, 0, 2.75), ...entre(js, 5.25, 5.75), ...entre(js, 8.25, TOTAL)];
  conferir(menor(dentro) > -35, "(b) 1 kHz presente dentro de [3,5) e [6,8)", `mín ${menor(dentro).toFixed(1)} dB`);
  conferir(maior(fora) < -50, "(b) e ausente fora, com uma janela de folga", `máx ${maior(fora).toFixed(1)} dB`);
}

// ---------- (c) e (d) o caminho novo contra o antigo ----------
{
  // O espec ANTIGO, tal como o navegador manda hoje: música do catálogo + voz de IA aos 0,7s.
  const bruto = { formato: "9:16", cenas: [{ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4 }], musica: "calma", musicaVolume: 0.8, narracao: { origem: "gravada", arquivo: "uploads/x/y.m4a", volume: 1, inicio: 0.7 }, telaFinal: false };
  const { espec } = limparEspec(bruto);
  if (!espec) throw new Error("fixture não passou no saneador");
  const itens = itensDeAudioDoEspec(espec);
  const { audios } = resolverAudiosDaMontagem({ itens, total: TOTAL, caminhoDaMusica: () => MUSICA, caminhoDaVoz: VOZ });
  conferir(audios.length === 2 && audios[0].tipo === "musica" && audios[1].tipo === "voz", "(d) o espec antigo vira dois trechos", JSON.stringify(audios.map((a) => ({ ...a, arquivo: path.basename(a.arquivo) }))));

  const antigo = await montar("d_antigo", { musica: MUSICA, narracao: VOZ, musicaVolume: espec.musicaVolume, vozVolume: espec.narracao?.volume, vozInicio: espec.narracao?.inicio });
  const novo = await montar("d_novo", { audios });
  const ja = await janelas(antigo, 0.25);
  const jn = await janelas(novo, 0.25);
  let pior = 0;
  let onde = 0;
  for (const j of ja) {
    const par = em(jn, j.t);
    if (Math.abs(par.rms - j.rms) > pior) {
      pior = Math.abs(par.rms - j.rms);
      onde = j.t;
    }
  }
  conferir(pior <= 0.5, "(d) cada janela do caminho novo fica a 0,5 dB do antigo", `pior ${pior.toFixed(2)} dB em ${onde.toFixed(2)}s`);

  // (c) o ducking, medido com o tom no lugar da música (dá pra separar por filtro) e a voz
  // REAL como gatilho: é a fala que manda a música abaixar.
  const duckNovo = await montar("c_duck_novo", { audios: [item({ arquivo: TOM, tipo: "musica", noVideo: 0, corte: 0, dur: TOTAL, volume: 0.8, laco: true }), item({ arquivo: VOZ, tipo: "voz", noVideo: 0.7, corte: 0, dur: TOTAL - 0.7 })] });
  const duckAntigo = await montar("c_duck_antigo", { musica: TOM, narracao: VOZ, musicaVolume: 0.8, vozVolume: 1, vozInicio: 0.7 });
  const passa = "bandpass=f=1000:width_type=h:w=120";
  const dn = await janelas(duckNovo, 0.25, passa);
  const da = await janelas(duckAntigo, 0.25, passa);
  // Sem voz, o mesmo tom: é o nível de referência da música.
  const soTom = await montar("c_duck_so_tom", { audios: [item({ arquivo: TOM, tipo: "musica", noVideo: 0, corte: 0, dur: TOTAL, volume: 0.8, laco: true })] });
  const ds = await janelas(soTom, 0.25, passa);
  const quedaDe = (js: Janela[]) => {
    const meio = entre(js, 1.5, TOTAL - 1.5);
    const ref = entre(ds, 1.5, TOTAL - 1.5);
    let maiorQueda = 0;
    for (const j of meio) maiorQueda = Math.max(maiorQueda, em(ref, j.t).rms - j.rms);
    return maiorQueda;
  };
  const qn = quedaDe(dn);
  const qa = quedaDe(da);
  conferir(qn >= 4, "(c) a música abaixa pelo menos 4 dB durante a voz", `${qn.toFixed(2)} dB`);
  conferir(Math.abs(qn - qa) <= 0.5, "(c) e abaixa o mesmo tanto que no caminho antigo", `novo ${qn.toFixed(2)} dB · antigo ${qa.toFixed(2)} dB`);
}

// ---------- (e) o som da virada ----------
{
  // Onde está o pico DENTRO do arquivo do efeito: o som da virada é o arquivo inteiro, e o
  // "clique" não começa no primeiro sample.
  const noArquivo = await janelas(CLIQUE, 0.005);
  const picoNoArquivo = noArquivo.reduce((m, j) => (j.pico > m.pico ? j : m), noArquivo[0]).t;
  const arquivo = await montar("e_virada", { audios: [], efeitoSonoro: CLIQUE });
  const js = await janelas(arquivo, 0.005);
  const emenda = DUR[0] - EMENDAS[0].segundos;
  const perto = js.filter((j) => Math.abs(j.t - (emenda + picoNoArquivo)) < 0.4);
  const pico = perto.reduce((m, j) => (j.pico > m.pico ? j : m), perto[0]);
  conferir(Math.abs(pico.t - (emenda + picoNoArquivo)) <= 0.05, "(e) o clique bate no instante da emenda", `pico em ${pico.t.toFixed(3)}s · esperado ${(emenda + picoNoArquivo).toFixed(3)}s`);
  const segundaEmenda = DUR[0] + DUR[1] - EMENDAS[0].segundos - EMENDAS[1].segundos;
  const perto2 = js.filter((j) => Math.abs(j.t - (segundaEmenda + picoNoArquivo)) < 0.4);
  conferir(perto2.reduce((m, j) => Math.max(m, j.pico), -120) > -40, "(e) a segunda virada também tem som (sem música e sem voz)", `máx ${perto2.reduce((m, j) => Math.max(m, j.pico), -120).toFixed(1)} dB`);
}

// ---------- (f) o Você que entra aos 6,8s ----------
{
  const apresentador = { arquivo: "x", formato: "circulo" as const, canto: "inferior_direito" as const, tamanho: "medio" as const, entra: 6.8, inicio: 1, duracao: 4, volume: 1, arquivoLocal: VOZ_MP4, temAudio: true, duracaoClipe: 4 };
  const args = argsMontagem({ ...base, saida: t("f_voce.mp4"), apresentador });
  await rodarFfmpeg(args, 180_000);
  const js = await janelas(t("f_voce.mp4"), 0.25);
  conferir(maior(entre(js, 0, 6.5)) < -50, "(f) nada de som antes de 6,8s: só o Você tem áudio neste vídeo", `máx ${maior(entre(js, 0, 6.5)).toFixed(1)} dB`);
  // Presença na janela não prova CONTEÚDO no tempo certo (obs 0065): a fala é comparada,
  // janela a janela, com a mesma fala recortada do arquivo a partir de `inicio`.
  const referencia = t("f_referencia.m4a");
  await rodarFfmpeg(["-ss", "1.00", "-t", "4.00", "-i", VOZ_MP4, "-vn", "-c:a", "aac", "-b:a", "128k", referencia], 60_000);
  const jr = await janelas(referencia, 0.25);
  const distancia = (js2: Janela[], atraso: number) => {
    const pares = jr.filter((r) => r.t >= 0.25 && r.t <= 3.5).map((r) => Math.abs(em(js2, r.t + atraso).rms - r.rms));
    return pares.reduce((s, d) => s + d, 0) / pares.length;
  };
  const dNovo = distancia(js, 6.8);
  conferir(dNovo <= 1.5, "(f) e a FALA é a mesma, janela a janela, a partir de 6,8s", `${dNovo.toFixed(2)} dB de diferença média`);

  // CONTROLE NEGATIVO: a mesma medida contra um render deliberadamente errado -- a fala sem
  // atraso e sem o portão do fade, que é exatamente o defeito que a spec descreve (som no
  // segundo 0). Sem isto, "passou" não distingue "está certo" de "a régua não enxerga".
  const quebrado = [...args];
  const jq = quebrado.indexOf("-filter_complex");
  quebrado[jq + 1] = quebrado[jq + 1].replace(/adelay=\d+:all=1,afade=t=in:st=[\d.]+:d=0\.001,/, "");
  quebrado[quebrado.length - 1] = t("f_voce_sem_atraso.mp4");
  await rodarFfmpeg(quebrado, 180_000);
  const jsQuebrado = await janelas(t("f_voce_sem_atraso.mp4"), 0.25);
  const silencioQuebrado = maior(entre(jsQuebrado, 0, 6.5));
  const dQuebrado = distancia(jsQuebrado, 6.8);
  conferir(silencioQuebrado > -50 && dQuebrado > 3, "(f) controle negativo: a mesma medida REPROVA a fala no segundo 0", `máx antes ${silencioQuebrado.toFixed(1)} dB · fala ${dQuebrado.toFixed(2)} dB fora`);

  // O comando ANTIGO, reconstruído no texto: entrada aparada (`-ss`) e `adelay` sobre ela.
  // A spec o descreve devolvendo o som em 0,00-5,20s (medido pela revisão em 6.1.1). AQUI,
  // com ffmpeg-static 6.1.1 e este arquivo, ele NÃO reproduziu: o número medido vai pro
  // relatório em vez de virar um "ok" que ninguém checou.
  const antigos = [...args];
  const iUltimo = antigos.lastIndexOf("-i");
  antigos.splice(iUltimo, 2);
  const j = antigos.indexOf("-filter_complex");
  const idxApre = CLIPES.length;
  const ms = Math.round(6.8 * 1000);
  antigos[j + 1] = antigos[j + 1].replace(/;\[\d+:a\][^;]*\[voz1\]/, `;[${idxApre}:a]adelay=${ms}|${ms},volume=1.00,apad,atrim=0:${TOTAL.toFixed(2)}[voz1]`);
  antigos[antigos.length - 1] = t("f_voce_antigo.mp4");
  await rodarFfmpeg(antigos, 180_000);
  const jsAntigo = await janelas(t("f_voce_antigo.mp4"), 0.25);
  const dAntigo = distancia(jsAntigo, 6.8);
  const silencioAntigo = maior(entre(jsAntigo, 0, 6.5));
  const antigoFalha = silencioAntigo > -50 || dAntigo > 3;
  console.log(`      (f) comando ANTIGO neste binário: antes de 6,8s máx ${silencioAntigo.toFixed(1)} dB · fala ${dAntigo.toFixed(2)} dB fora · ${antigoFalha ? "REPROVA (o defeito da spec reproduziu)" : "passa (o defeito da spec NÃO reproduziu em ffmpeg-static 6.1.1)"}`);
  fs.writeFileSync(
    path.join(PROVAS, "voce-inicio-maior-que-zero.txt"),
    `ffmpeg-static 6.1.1 (maior ${versaoDoFfmpeg()})\nentra 6,8s · inicio 1s · duracao 4s · total ${TOTAL}s\nnovo:    antes de 6,8s max ${maior(entre(js, 0, 6.5)).toFixed(1)} dB · fala ${dNovo.toFixed(2)} dB fora\nantigo:  antes de 6,8s max ${silencioAntigo.toFixed(1)} dB · fala ${dAntigo.toFixed(2)} dB fora\ncontrole negativo (sem atraso e sem portao): antes de 6,8s max ${silencioQuebrado.toFixed(1)} dB · fala ${dQuebrado.toFixed(2)} dB fora\n\nO defeito descrito na spec (som em 0,00-5,20s com a entrada aparada) NAO reproduziu neste\nbinario com este arquivo. O conserto B3 fica: ele nao depende do defeito reproduzir, e o\nguarda de byte-identidade cobre a mudanca de comando.\n`
  );
}

// ---------- (g) a versão pra ouvir, com a voz real ----------
{
  const audios: AudioNaMontagem[] = [
    item({ arquivo: MUSICA, tipo: "musica", noVideo: 0, corte: 12, dur: TOTAL, volume: 0.8, fadeEntrada: 1, fadeSaida: 2 }),
    item({ arquivo: VOZ, tipo: "voz", noVideo: 1, corte: 0.5, dur: 3.5 }),
    item({ arquivo: VOZ, tipo: "voz", noVideo: 6, corte: 5, dur: 4 }),
  ];
  const saida = path.join(PROVAS, "voz-real-em-dois-trechos.mp4");
  await rodarFfmpeg(argsMontagem({ ...base, saida, audios, efeitoSonoro: CLIQUE, titulo: "Apto 302", subtitulo: "R$ 690.000 · Setor Bueno" }), 180_000);
  const js = await janelas(saida, 0.25);
  conferir(fs.existsSync(saida) && menor(entre(js, 1, TOTAL - 1)) > -60, "(g) a prova com voz real ficou gravada e tem som do começo ao fim", saida);
}

// ---------- (4) grafo acima de 20 KB ----------
{
  const trechos = Array.from({ length: 120 }, (_, i) => ({ inicio: (i * TOTAL) / 120, fim: ((i + 1) * TOTAL) / 120, texto: `Trecho ${i + 1} da narração deste imóvel` }));
  const audios: AudioNaMontagem[] = Array.from({ length: 16 }, (_, i) =>
    i < 8
      ? item({ arquivo: MUSICA, tipo: "musica", noVideo: i * 1.2, corte: i, dur: 1, volume: 0.5, fadeEntrada: 0.1, fadeSaida: 0.1 })
      : item({ arquivo: VOZ, tipo: "voz", noVideo: (i - 8) * 1.2 + 0.4, corte: i - 8, dur: 1, volume: 1 })
  );
  const args = argsMontagem({ ...base, saida: t("grafo_grande.mp4"), audios, legendas: { trechos, estilo: "faixa", posicao: "base" } });
  const grafo = args[args.indexOf("-filter_complex") + 1];
  conferir(grafo.length > LIMITE_DO_GRAFO, "(4) 120 legendas + 16 trechos passam de 20 KB de grafo", `${grafo.length} caracteres`);

  // Espiona o `writeFileSync` pra provar que o grafo foi PRO ARQUIVO -- não dá pra ver isso
  // no resultado do render, e sem a prova o teste passaria mesmo se o desvio não existisse.
  const original = fs.writeFileSync;
  const escritos: string[] = [];
  (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((arquivo: unknown, dados: unknown, opcoes: unknown) => {
    if (typeof arquivo === "string" && arquivo.includes("encena-grafo-")) escritos.push(arquivo);
    return (original as (a: unknown, b: unknown, c: unknown) => void)(arquivo, dados, opcoes);
  }) as typeof fs.writeFileSync;
  try {
    await rodarFfmpeg(args, 280_000);
  } finally {
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
  }
  conferir(escritos.length === 1, "(4) o grafo foi escrito num arquivo temporário", escritos.join(" "));
  conferir(escritos.every((a) => !fs.existsSync(a)), "(4) e o arquivo foi apagado no fim");
  const js = await janelas(t("grafo_grande.mp4"), 0.25);
  conferir(fs.existsSync(t("grafo_grande.mp4")) && maior(js) > -60, "(4) o vídeo com grafo grande renderiza e tem som", `máx ${maior(js).toFixed(1)} dB`);
}

// ---------- (6) quanto custa a mais ----------
{
  // Doze cenas, que é o teto do produto. As mesmas fotos, repetidas.
  const doze = Array.from({ length: 12 }, (_, i) => t(`d${i}.mp4`));
  for (let i = 0; i < 12; i++) fs.copyFileSync(CLIPES[i % 3], doze[i]);
  const duracoes = Array.from({ length: 12 }, () => 4);
  const emendas = Array.from({ length: 11 }, () => ({ xfade: "fade", segundos: 0.6 }));
  const total12 = 12 * 4 - 11 * 0.6;
  const doisBase = { clipes: doze, duracoes, W, H, emendas };
  // Pelo resolvedor, como o servidor faz: num vídeo de 41s com música de 45s ele NÃO liga o
  // `aloop` -- medir com o laço ligado à força mediria um caso que a produção não produz.
  const { audios } = resolverAudiosDaMontagem({
    itens: [
      { id: "musica00", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 0, volume: 0.8, fadeEntrada: 1, fadeSaida: 2, laco: true },
      { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 0.7, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 },
    ],
    total: total12,
    caminhoDaMusica: () => MUSICA,
    caminhoDaVoz: VOZ,
  });
  // Windows não tem `taskset`; o que dá pra limitar aqui são as linhas de trabalho do ffmpeg.
  //
  // E a medida é TEMPO DE CPU (`-benchmark` do próprio ffmpeg), não relógio de parede: esta
  // máquina roda outras coisas ao mesmo tempo, e num relógio de parede a mesma comparação
  // deu +37% e −25% em duas passadas seguidas. Tempo de CPU não depende de quem mais está
  // rodando; o relógio, sim (obs 0054, 0064).
  const comNucleos = (args: string[], n: number) => ["-filter_complex_threads", String(n), "-filter_threads", String(n), ...args.slice(0, -1), "-threads", String(n), "-benchmark", args[args.length - 1]];
  const cpuDe = async (args: string[], n: number) => {
    const texto = await medir(comNucleos(args, n), 280_000);
    const m = texto.match(/bench:\s*utime=([\d.]+)s\s+stime=([\d.]+)s\s+rtime=([\d.]+)s/);
    if (!m) throw new Error("o ffmpeg não devolveu o `bench:` do -benchmark");
    return { cpu: Number(m[1]) + Number(m[2]), relogio: Number(m[3]) };
  };
  const linhas: string[] = [];
  let piorFolga = -Infinity;
  for (const n of [1, 2]) {
    const antigo = await cpuDe(argsMontagem({ ...doisBase, saida: t(`t_antigo_${n}.mp4`), musica: MUSICA, narracao: VOZ, musicaVolume: 0.8, vozVolume: 1, vozInicio: 0.7 }), n);
    const novo = await cpuDe(argsMontagem({ ...doisBase, saida: t(`t_novo_${n}.mp4`), audios }), n);
    const folga = (novo.cpu / antigo.cpu - 1) * 100;
    piorFolga = Math.max(piorFolga, folga);
    linhas.push(`${n} linha(s): antigo ${antigo.cpu.toFixed(2)}s de CPU (relógio ${antigo.relogio.toFixed(1)}s) · novo ${novo.cpu.toFixed(2)}s (relógio ${novo.relogio.toFixed(1)}s) · ${folga >= 0 ? "+" : ""}${folga.toFixed(1)}%`);
  }
  conferir(piorFolga <= 15, "(6) a montagem com trechos custa no máximo +15% de CPU", linhas.join(" | "));
  fs.writeFileSync(path.join(PROVAS, "tempos.txt"), `${new Date().toISOString()}\nffmpeg maior ${versaoDoFfmpeg()} · ${os.cpus().length} núcleos na máquina · medida: tempo de CPU (-benchmark)\n12 cenas de 4s em ${W}x${H}, música do catálogo + voz real\n${linhas.join("\n")}\n`);
}

console.log("\nBinário de produção (7.x ou master, Linux): NÃO VERIFICADO -- sem WSL, sem Docker e sem baixar binário (spec P0).");
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
