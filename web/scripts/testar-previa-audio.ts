// A PRÉVIA DE ÁUDIO no Node: a agenda, os picos e as cópias do catálogo
// (docs/planos/linha-do-tempo-spec.md, D8 e P4).
//
//   1. agendaDaPrevia: tocar do meio, laço com módulo, sem laço além do fim, fade cortado
//      pelo fim do arquivo, ganho no meio do fade, t0 dentro do fade, ordem estável;
//   2. ganhoNoTempo e automacaoDoDuque: janelas de voz juntas, duque com ataque e alívio,
//      Play caindo dentro da fala;
//   3. picos: brilho > 60 a 48 kHz (e o quanto 8 kHz o achata), sino = 255, correlação da
//      cópia > 0,97 -- e a margem do instrumento contra faixa trocada e contra deslocamento;
//   4. picos.json: formato, tamanho, uma faixa por música, ida e volta pelo decodificador;
//   5. segundos-do-catalogo.ts bate com a contagem de amostras (±0,01 s);
//   6. o portão das cópias de prévia roda e passa;
//   7. a ligação: a prévia e a biblioteca de áudio pedem a vez uma pra outra por evento.
//
// Usa ÁUDIO REAL: os arquivos de public/musica e public/efeitos, os mesmos que o servidor
// monta no vídeo. Não chama rede, banco nem IA.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-previa-audio.ts
//   node --import ./scripts/ts-direto.mjs scripts/testar-previa-audio.ts --sem-portao

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { PICOS_POR_SEGUNDO, caminhoDaOnda, correlacaoDePicos, decodificarPicos, picosDeBase64, picosDoBuffer } from "../src/lib/picos-audio.ts";
import { DUQUE, agendaDaPrevia, automacaoDoDuque, ganhoNoTempo, janelasDeVoz, type ItemPrevia } from "../src/lib/previa-audio.ts";
import { SEGUNDOS_EFEITO, SEGUNDOS_MUSICA } from "../src/lib/segundos-do-catalogo.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---------- 1. a agenda ----------

const MUSICA: ItemPrevia = {
  id: "mus001",
  fonte: { chave: "musica/calma", url: "/musica/previa/calma.m4a" },
  barramento: "musica",
  noVideo: 2,
  corte: 10,
  dur: 7,
  volume: 0.8,
  fadeEntrada: 1,
  fadeSaida: 2,
  laco: false,
};
const VOZ: ItemPrevia = {
  id: "voz0001",
  fonte: { chave: "voz/uma", url: "blob:uma" },
  barramento: "voz",
  noVideo: 3,
  corte: 0,
  dur: 4,
  volume: 1,
  fadeEntrada: 0,
  fadeSaida: 0,
  laco: false,
};
/** 45,003 s é a duração real das faixas do catálogo (segundos-do-catalogo.ts). */
const DURACOES: Record<string, number> = { "musica/calma": 45.003, "voz/uma": 30 };
const dur = (chave: string) => DURACOES[chave];

{
  const a = agendaDaPrevia([MUSICA], 0, dur);
  conferir(a.length === 1 && perto(a[0].atraso, 2) && perto(a[0].offset, 10) && perto(a[0].duracao, 7), "do zero: entra em 2 s, parte do segundo 10 do arquivo, dura 7", JSON.stringify(a[0] && { atraso: a[0].atraso, offset: a[0].offset, duracao: a[0].duracao }));

  // Tocar do MEIO do trecho: o que passou sai do offset, não do atraso.
  const meio = agendaDaPrevia([MUSICA], 5, dur)[0];
  conferir(perto(meio.atraso, 0) && perto(meio.offset, 13) && perto(meio.duracao, 4), "tocando de 5 s: atraso 0, offset 13, dura 4", JSON.stringify({ atraso: meio.atraso, offset: meio.offset, duracao: meio.duracao }));

  conferir(agendaDaPrevia([MUSICA], 9, dur).length === 0, "trecho que já acabou não entra na agenda");
  conferir(agendaDaPrevia([{ ...MUSICA, dur: 0 }], 0, dur).length === 0, "trecho de duração zero não entra");

  // Módulo SÓ com laço.
  const comLaco = agendaDaPrevia([{ ...MUSICA, laco: true, corte: 44, dur: 6 }], 0, dur)[0];
  conferir(perto(comLaco.offset, 44) && comLaco.laco, "laço: offset dentro do arquivo fica como está", String(comLaco.offset));
  const voltou = agendaDaPrevia([{ ...MUSICA, laco: true, corte: 44, dur: 6 }], 4, dur)[0];
  conferir(perto(voltou.offset, (44 + 2) % 45.003, 1e-9), "laço: offset além do fim volta pelo módulo", String(voltou.offset));
  // O MESMO trecho, mesmo instante, só mudando o laço: com laço volta pelo módulo, sem
  // laço o offset cai depois do fim do arquivo e o trecho sai da agenda.
  const semLaco = agendaDaPrevia([{ ...MUSICA, corte: 44, dur: 6 }], 4, dur);
  conferir(semLaco.length === 0, "sem laço, o mesmo trecho no mesmo instante some (offset 46 num arquivo de 45,003 s)", JSON.stringify(semLaco));
  // off >= dur, sem laço: o trecho some (um nó que começa depois do fim não é som nenhum).
  conferir(agendaDaPrevia([{ ...MUSICA, corte: 50 }], 0, dur).length === 0, "sem laço e offset além do arquivo: some da agenda");
  conferir(agendaDaPrevia([{ ...MUSICA, laco: true, corte: 50 }], 0, dur).length === 1, "com laço, o mesmo offset entra (volta pelo módulo)");

  // Sem saber a duração do arquivo, o trecho entra assim mesmo.
  const semSaber = agendaDaPrevia([{ ...MUSICA, corte: 50 }], 0, () => undefined);
  conferir(semSaber.length === 1 && perto(semSaber[0].offset, 50), "arquivo ainda não medido: o trecho entra e o motor reagenda depois");

  // Corte pelo fim do arquivo.
  const cortado = agendaDaPrevia([{ ...MUSICA, corte: 42, dur: 7 }], 0, dur)[0];
  conferir(perto(cortado.duracao, 3.003, 1e-9), "sem laço: a duração para no fim do arquivo", String(cortado.duracao));

  // Ordem estável: por atraso, depois por id.
  const ordem = agendaDaPrevia([{ ...VOZ, id: "zzz", noVideo: 5 }, MUSICA, { ...VOZ, id: "aaa", noVideo: 5 }], 0, dur).map((e) => e.id);
  conferir(JSON.stringify(ordem) === JSON.stringify(["mus001", "aaa", "zzz"]), "agenda ordenada por atraso e depois por id", ordem.join(","));
}

// ---------- 2. ganho, fades e duque ----------

{
  conferir(perto(ganhoNoTempo(MUSICA, 1.9), 0) && perto(ganhoNoTempo(MUSICA, 9.1), 0), "fora do trecho o ganho é zero");
  conferir(perto(ganhoNoTempo(MUSICA, 2.5), 0.4), "meio do fade de entrada: metade do volume", String(ganhoNoTempo(MUSICA, 2.5)));
  conferir(perto(ganhoNoTempo(MUSICA, 3), 0.8), "acabado o fade, volume cheio", String(ganhoNoTempo(MUSICA, 3)));
  conferir(perto(ganhoNoTempo(MUSICA, 8), 0.4), "meio do fade de saída: metade do volume", String(ganhoNoTempo(MUSICA, 8)));
  conferir(perto(ganhoNoTempo(MUSICA, 9), 0), "no fim do fade de saída o ganho é zero");
  // Fades maiores que o trecho: os dois valem ao mesmo tempo, sem estourar o volume.
  const curto = { ...MUSICA, dur: 1, fadeEntrada: 1, fadeSaida: 1 };
  conferir(ganhoNoTempo(curto, 2.5) > 0 && ganhoNoTempo(curto, 2.5) < 0.8, "trecho mais curto que os fades: ganho entre zero e o volume", String(ganhoNoTempo(curto, 2.5)));

  const rampas = agendaDaPrevia([MUSICA], 0, dur)[0].rampas;
  conferir(JSON.stringify(rampas.map((r) => [r.em, r.ganho])) === JSON.stringify([[2, 0], [3, 0.8], [7, 0.8], [9, 0]]), "as rampas são os quatro cantos do envelope", JSON.stringify(rampas));

  // Play no meio da subida: o primeiro ponto é o ganho DE AGORA, não o volume cheio.
  const noFade = agendaDaPrevia([MUSICA], 2.5, dur)[0].rampas;
  conferir(perto(noFade[0].em, 0) && perto(noFade[0].ganho, 0.4), "t0 dentro do fade: começa no ganho certo", JSON.stringify(noFade[0]));
  conferir(perto(noFade[1].em, 0.5) && perto(noFade[1].ganho, 0.8), "e sobe até o fim da subida", JSON.stringify(noFade[1]));

  // Janelas de voz.
  const duas = janelasDeVoz([VOZ, { ...VOZ, id: "voz0002", noVideo: 7.2, dur: 2 }]);
  conferir(duas.length === 1 && perto(duas[0].de, 3) && perto(duas[0].ate, 9.2), "duas falas coladas viram uma janela só", JSON.stringify(duas));
  const longe = janelasDeVoz([VOZ, { ...VOZ, id: "voz0002", noVideo: 20, dur: 2 }]);
  conferir(longe.length === 2, "falas separadas continuam duas janelas", JSON.stringify(longe));
  const semJuntar = janelasDeVoz([VOZ, { ...VOZ, id: "voz0002", noVideo: 7.2, dur: 2 }], [], { juntar: 0 });
  conferir(semJuntar.length === 2, "sem alívio, só sobreposição junta");
  conferir(janelasDeVoz([MUSICA]).length === 0, "música não abre janela de voz");
  const comExtra = janelasDeVoz([], [{ de: 1, ate: 2 }]);
  conferir(comExtra.length === 1 && perto(comExtra[0].de, 1), "a janela do Você entra pelas extras", JSON.stringify(comExtra));

  // Duque.
  const pontos = automacaoDoDuque(janelasDeVoz([VOZ]), 0, 12);
  const ganhos = pontos.map((p) => p.ganho);
  conferir(perto(pontos[0].em, 0) && perto(pontos[0].ganho, 1), "o duque começa aberto", JSON.stringify(pontos[0]));
  conferir(ganhos.includes(DUQUE.ganho), `a música abaixa pra ${DUQUE.ganho} durante a fala`, JSON.stringify(pontos));
  const desce = pontos.find((p) => p.ganho === DUQUE.ganho);
  conferir(!!desce && perto(desce.em, 3), "abaixa exatamente quando a voz entra", JSON.stringify(desce));
  const sobe = pontos[pontos.length - 1];
  conferir(perto(sobe.em, 7 + DUQUE.alivio) && perto(sobe.ganho, 1), "e volta depois do alívio", JSON.stringify(sobe));
  conferir(pontos.every((p, i) => i === 0 || p.em >= pontos[i - 1].em), "os pontos do duque saem em ordem de tempo");
  // Play caindo DENTRO da fala: já começa abaixado, sem rampa de ataque.
  const dentro = automacaoDoDuque(janelasDeVoz([VOZ]), 4, 12);
  conferir(perto(dentro[0].em, 0) && perto(dentro[0].ganho, DUQUE.ganho), "Play dentro da fala já começa abaixado", JSON.stringify(dentro[0]));
}

// ---------- 3. os picos, medidos no áudio real ----------

type Decodificado = { canais: Float32Array[]; taxa: number; quadros: number };

function decodificar(arquivo: string, o: { taxa?: number; canais: 1 | 2 }): Decodificado {
  const args = ["-hide_banner", "-nostdin", "-i", arquivo, "-map", "0:a:0", "-ac", String(o.canais), ...(o.taxa ? ["-ar", String(o.taxa)] : []), "-f", "s16le", "-acodec", "pcm_s16le", "-"];
  const r = spawnSync(ffmpeg, args, { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg falhou em ${path.basename(arquivo)}: ${(r.stderr?.toString("utf8") ?? "").slice(-300)}`);
  const erro = r.stderr.toString("utf8");
  const taxa = Number(erro.slice(erro.indexOf("Output #0")).match(/Audio: pcm_s16le, (\d+) Hz/)?.[1]);
  const quadros = r.stdout.length / (2 * o.canais);
  const canais = Array.from({ length: o.canais }, () => new Float32Array(quadros));
  for (let q = 0; q < quadros; q++) for (let c = 0; c < o.canais; c++) canais[c][q] = r.stdout.readInt16LE((q * o.canais + c) * 2) / 32768;
  return { canais, taxa, quadros };
}

const picosDe = (arquivo: string, taxa: number) => {
  const d = decodificar(arquivo, { taxa, canais: 2 });
  return picosDoBuffer(d.canais, d.taxa, PICOS_POR_SEGUNDO);
};

{
  const brilho48 = picosDe(path.join(RAIZ, "public", "efeitos", "brilho.m4a"), 48000);
  const brilho8 = picosDe(path.join(RAIZ, "public", "efeitos", "brilho.m4a"), 8000);
  const maxBrilho = Math.max(...brilho48);
  conferir(maxBrilho > 60, "brilho a 48 kHz tem pico acima de 60", `48 kHz: ${maxBrilho}`);
  // A MARGEM: rodar contra o defeito que a decisão de 48 kHz evita (spec D8, "8 kHz
  // achata o som agudo"). Sem esta linha, "> 60" passaria sem provar que a taxa importa.
  conferir(Math.max(...brilho8) < maxBrilho, "e a 8 kHz o mesmo arquivo fica mais baixo (é o que a taxa resolve)", `8 kHz: ${Math.max(...brilho8)} contra ${maxBrilho}`);

  const sino = picosDe(path.join(RAIZ, "public", "efeitos", "sino.m4a"), 48000);
  conferir(Math.max(...sino) === 255, "sino bate no teto: pico 255", String(Math.max(...sino)));

  // Correlação da cópia de prévia contra o arquivo do servidor.
  const servidor = picosDe(path.join(RAIZ, "public", "musica", "calma.m4a"), 48000);
  const copia = picosDe(path.join(RAIZ, "public", "musica", "previa", "calma.m4a"), 48000);
  const cor = correlacaoDePicos(servidor, copia);
  conferir(cor > 0.97, "a cópia de prévia é o mesmo som do arquivo do servidor", `correlação ${cor.toFixed(4)}`);
  // A margem do instrumento: contra outra faixa e contra deslocamento.
  const outra = picosDe(path.join(RAIZ, "public", "musica", "urbano.m4a"), 48000);
  const corOutra = correlacaoDePicos(servidor, outra);
  conferir(corOutra < 0.97, "faixa trocada reprova no mesmo portão", `correlação ${corOutra.toFixed(4)}`);
  const deslocada = correlacaoDePicos(servidor.subarray(2), copia);
  conferir(deslocada < cor, "cópia deslocada correlaciona menos que alinhada", `${deslocada.toFixed(4)} contra ${cor.toFixed(4)}`);

  // Silêncio dá pico zero e correlação zero (série constante não tem variância).
  const mudo = picosDoBuffer([new Float32Array(48000)], 48000, PICOS_POR_SEGUNDO);
  conferir(mudo.length === 20 && Math.max(...mudo) === 0, "um segundo de silêncio dá 20 picos zerados", String(mudo.length));
  conferir(correlacaoDePicos(mudo, servidor) === 0, "correlação com série constante é zero, não NaN");
  conferir(picosDoBuffer([], 48000).length === 0 && picosDoBuffer([new Float32Array(10)], 0).length === 0, "entrada vazia ou taxa zero não quebra");
}

// ---------- 4. picos.json ----------

{
  const caminho = path.join(RAIZ, "public", "musica", "picos.json");
  const bruto = JSON.parse(fs.readFileSync(caminho, "utf8"));
  const bytes = fs.statSync(caminho).size;
  conferir(bruto.v === 1 && bruto.porSeg === PICOS_POR_SEGUNDO, "picos.json é v1 com 20 picos por segundo", `v=${bruto.v} porSeg=${bruto.porSeg}`);
  conferir(bytes < 30_000, "o arquivo inteiro cabe em menos de 30 KB", `${(bytes / 1024).toFixed(1)} KB`);

  const mapa = decodificarPicos(bruto);
  const ids = Object.keys(mapa);
  const comArquivo = Object.keys(SEGUNDOS_MUSICA);
  conferir(ids.length === comArquivo.length, "uma entrada por música do catálogo", `${ids.length} de ${comArquivo.length}`);
  conferir(comArquivo.every((id) => ids.includes(id)), "nenhuma música ficou de fora", ids.join(","));

  const calma = mapa.calma;
  conferir(!!calma && calma.picos.length === Math.ceil(calma.segundos * PICOS_POR_SEGUNDO), "o número de picos bate com a duração", `${calma?.picos.length} para ${calma?.segundos} s`);
  conferir(!!calma && calma.max === Math.max(...calma.picos), "o max guardado é o max de verdade", String(calma?.max));
  conferir(!!calma && calma.picos instanceof Uint8Array, "os picos voltam como Uint8Array");

  // Ida e volta pelo base64.
  const cru = picosDeBase64(bruto.faixas.calma.picos);
  conferir(cru.length === calma!.picos.length && cru.every((v, i) => v === calma!.picos[i]), "base64 vai e volta sem perder byte");

  // Entrada torta não derruba o editor: some a faixa, não a tela.
  conferir(Object.keys(decodificarPicos(null)).length === 0, "picos nulos viram mapa vazio");
  conferir(Object.keys(decodificarPicos({ v: 2, porSeg: 20, faixas: {} })).length === 0, "versão desconhecida vira mapa vazio");
  conferir(Object.keys(decodificarPicos({ v: 1, porSeg: 20, faixas: { calma: { segundos: 1, max: 1, picos: 5 } } })).length === 0, "faixa com picos que não é texto some sem quebrar");

  // O caminho da onda.
  const caminhoSvg = caminhoDaOnda(new Uint8Array([0, 255, 0]));
  conferir(caminhoSvg.startsWith("M") && caminhoSvg.endsWith("Z") && caminhoSvg.includes("1 0") && caminhoSvg.includes("1 255"), "a onda desenha do topo ao pé no pico cheio", caminhoSvg);
  const uma = caminhoDaOnda(calma!.picos);
  const duas = caminhoDaOnda(calma!.picos, { voltas: 2 });
  conferir(duas.split("L").length === uma.split("L").length * 2, "duas voltas do laço têm o dobro de pontos", `${uma.split("L").length} → ${duas.split("L").length}`);
  conferir(caminhoDaOnda(new Uint8Array(0)) === "", "faixa sem picos não desenha nada");
}

// ---------- 5. segundos-do-catalogo.ts contra a contagem de amostras ----------

{
  for (const [pasta, tabela] of [["musica", SEGUNDOS_MUSICA] as const, ["efeitos", SEGUNDOS_EFEITO] as const]) {
    let pior = 0;
    let piorId = "";
    for (const [id, segundos] of Object.entries(tabela)) {
      const d = decodificar(path.join(RAIZ, "public", pasta, `${id}.m4a`), { canais: 1 });
      const dif = Math.abs(d.quadros / d.taxa - (segundos as number));
      if (dif > pior) {
        pior = dif;
        piorId = id;
      }
    }
    conferir(pior <= 0.01, `${pasta}: a duração da tabela bate com a contagem de amostras`, `pior: ${piorId} ${pior.toFixed(5)} s`);
  }
}

// ---------- 6. o portão das cópias de prévia ----------

if (process.argv.includes("--sem-portao")) {
  console.log("pulo  o portão das cópias (--sem-portao)");
} else {
  const comeco = Date.now();
  const r = spawnSync(process.execPath, [path.join(RAIZ, "scripts", "preparar-previa-catalogo.mjs"), "--conferir"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 });
  const linhas = (r.stdout ?? "").trim().split("\n");
  conferir(r.status === 0, "o portão das cópias de prévia passa em todos os arquivos", `${linhas[linhas.length - 1]?.trim()} · ${((Date.now() - comeco) / 1000).toFixed(0)}s`);
  if (r.status !== 0) console.log((r.stdout ?? "").split("\n").filter((l) => l.startsWith("FALHA")).join("\n"));
  const quantas = linhas.filter((l) => l.startsWith("ok ")).length;
  conferir(quantas === 21, "as 15 músicas e os 6 efeitos têm cópia conferida", String(quantas));
}

// ---------- 7. a ligação ----------

{
  const ler = (...p: string[]) => fs.readFileSync(path.join(RAIZ, "src", ...p), "utf8");
  const ba = ler("components", "editor", "biblioteca-audio.tsx");
  conferir(/window\.dispatchEvent\(new Event\("encena:parar-previa"\)\)/.test(ba), "ouvir uma faixa manda a prévia parar");
  conferir(/addEventListener\("encena:parar-audio"/.test(ba) && /removeEventListener\("encena:parar-audio"/.test(ba), "e a biblioteca para quando a prévia começa, sem vazar o ouvinte");

  const hook = ler("components", "editor", "usar-previa-de-audio.ts");
  conferir(/function tocar\(t: number\) \{\n\s*const c = contexto\(\);\n(\s*\/\/[^\n]*\n)*\s*if \(c\) void c\.resume\(\)/.test(hook), "resume() é a primeira coisa de tocar, sem await antes");
  conferir(/window\.dispatchEvent\(new Event\("encena:parar-audio"\)\)/.test(hook), "a prévia avisa os outros tocadores ao começar");
  conferir(/addEventListener\("encena:parar-previa"/.test(hook), "e para quando a biblioteca pede a vez");
  const semComentarios = hook.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
  conferir(/method: "HEAD"/.test(hook) && /headers\.get\("content-length"\)/.test(hook), "o tamanho vem do Content-Length de um HEAD");
  conferir(!/content-range/i.test(semComentarios), "e nunca de Content-Range, que o Supabase não expõe (medido no P0)");
  conferir(/useState<MotorDePrevia>\(criarMotorDePrevia\)/.test(hook) && !/\buseRef\b/.test(semComentarios), "o motor mora num useState com inicializador, sem ref lido no render");
  conferir(/useSyncExternalStore\(motor\.assinarEstado, motor\.instantaneo, motor\.instantaneo\)/.test(hook), "o estado sai por useSyncExternalStore, com instantâneo de servidor");

  const pagina = ler("app", "dev", "previa-audio", "page.tsx");
  conferir(/process\.env\.NODE_ENV === "production"/.test(pagina) && /notFound\(\)/.test(pagina), "a bancada responde 404 em produção");
  conferir(!/"use client"/.test(pagina), "a página é componente de servidor (notFound no caminho do render)");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
