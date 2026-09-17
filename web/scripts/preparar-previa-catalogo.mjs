// AS CÓPIAS DE PRÉVIA da biblioteca de áudio (docs/planos/linha-do-tempo-spec.md, D8).
//
// Os arquivos que o SERVIDOR usa (public/musica, public/efeitos) são AAC a 96 kHz. O
// ffmpeg lida bem com isso; o navegador, não: `decodeAudioData` reamostra 96 kHz pra taxa
// do contexto (48 kHz) na hora, e num iPhone isso é meio segundo de trava antes de a
// prévia começar -- por faixa, toda vez que a pessoa troca de música.
//
// Então a prévia toca uma CÓPIA a 48 kHz, gravada aqui, em public/musica/previa/ e
// public/efeitos/previa/. Os arquivos do servidor não são tocados: recodificar o que o
// vídeo final usa pra ganhar tempo no navegador seria pagar a conta no lugar errado. A
// medida da onda e a duração (`segundos-do-catalogo.ts`) continuam saindo dos arquivos do
// servidor, que são a verdade.
//
// O PORTÃO, e por que ele existe: uma cópia com o áudio errado e o tamanho certo passa
// despercebida. Quatro medidas independentes, e a cópia só entra se as quatro passarem:
//
//   1. taxa da cópia = 48 kHz (o motivo de ela existir);
//   2. duração DECLARADA no contêiner igual à do original ±0,01 s (é o que o navegador lê
//      em `media.duration`, e é o número da spec D8);
//   3. comprimento decodificado: a cópia nunca é mais CURTA, sobra no máximo um quadro de
//      AAC, e o que sobra é silêncio (< −60 dBFS);
//   4. correlação da forma de onda > 0,97, e no ATRASO 0 -- maior que nos atrasos vizinhos.
//
// Por que a 3 não é "mesma contagem de amostras": o AAC codifica em quadros de 1024
// amostras, então um arquivo de 45,0027 s a 48 kHz (2.160.128 amostras = 2109,5 quadros) SÓ
// pode sair com 2110 quadros. MEDIDO: as cópias das músicas saem com exatamente 512
// amostras a mais (0,0107 s) e essas 512 amostras são silêncio digital (pico 0,000000 em
// calma, urbano e brilho). Comparar a contagem crua com ±0,01 s reprovaria toda cópia AAC
// possível, inclusive a perfeita.
//
// E por que não "onde o som acaba": tentado, e é instrumento ruim. O fim é um decaimento,
// então o cruzamento do piso anda com qualquer diferença de nível do codec -- deu 0,0129 s
// em `familia` a −90 dBFS e 0,0105 s em `passagem` a −60 dBFS, em cópias que as outras
// quatro medidas aprovam com correlação 0,999. Medida que muda de veredito conforme o piso
// escolhido não é portão, é sorteio.
//
//   node scripts/preparar-previa-catalogo.mjs            grava (e confere) as cópias
//   node scripts/preparar-previa-catalogo.mjs --conferir só confere o que já existe
//
// Não chama rede nem IA: lê e escreve dentro de public/.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { PICOS_POR_SEGUNDO, correlacaoDePicos, picosDoBuffer } from "../src/lib/picos-audio.ts";

const ffmpeg = /** @type {string} */ (/** @type {unknown} */ (ffmpegStatic));
const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTAS = ["musica", "efeitos"];
const TAXA = 48000;
const KBPS = "128k";
const SO_CONFERIR = process.argv.includes("--conferir");

/** Diferença tolerada entre o fim do som da cópia e o do original, em segundos. */
const TOLERANCIA_SEGUNDOS = 0.01;
/** Correlação mínima da forma de onda entre a cópia e o original. */
const CORRELACAO_MINIMA = 0.97;
/** Um quadro de AAC. O enchimento do codificador nunca passa disso. */
const QUADRO_AAC = 1024;
/**
 * Abaixo disso o que sobra no fim não é som: −60 dBFS.
 *
 * O piso do PCM (1/32768) não serve: o decodificador de AAC devolve lixo de até ±4 LSB
 * (−78 dBFS) no rabo do arquivo, e reprovava `impacto` por causa dele.
 */
const PISO = 0.001;

/**
 * PCM s16le do primeiro áudio do arquivo.
 *
 * É a mesma ideia do `decodificar` de gerar-picos-audio.ts, e está escrita de novo aqui de
 * propósito: quem GERA a onda não pode ser o mesmo instrumento que CONFERE a cópia, senão
 * um erro na medição aparece dos dois lados e o portão fica verde por construção.
 *
 * @param {string} arquivo
 * @param {{ taxa?: number; canais: 1 | 2 }} o
 * @returns {{ canais: Float32Array[]; taxa: number; quadros: number; segundos: number }}
 */
function decodificar(arquivo, o) {
  const args = ["-hide_banner", "-nostdin", "-i", arquivo, "-map", "0:a:0", "-ac", String(o.canais), ...(o.taxa ? ["-ar", String(o.taxa)] : []), "-f", "s16le", "-acodec", "pcm_s16le", "-"];
  const r = spawnSync(ffmpeg, args, { maxBuffer: 1 << 30 });
  const erro = r.stderr?.toString("utf8") ?? "";
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg falhou em ${path.basename(arquivo)}: ${erro.slice(-400)}`);
  const saida = erro.slice(erro.indexOf("Output #0"));
  const taxa = Number(saida.match(/Audio: pcm_s16le, (\d+) Hz/)?.[1]);
  if (!Number.isFinite(taxa) || taxa <= 0) throw new Error(`taxa ilegível em ${path.basename(arquivo)}`);
  const bytesPorQuadro = 2 * o.canais;
  if (r.stdout.length % bytesPorQuadro !== 0) throw new Error(`PCM torto em ${path.basename(arquivo)}: ${r.stdout.length} bytes`);
  const quadros = r.stdout.length / bytesPorQuadro;
  const canais = Array.from({ length: o.canais }, () => new Float32Array(quadros));
  for (let q = 0; q < quadros; q++) {
    for (let c = 0; c < o.canais; c++) canais[c][q] = r.stdout.readInt16LE((q * o.canais + c) * 2) / 32768;
  }
  return { canais, taxa, quadros, segundos: quadros / taxa };
}

/**
 * A duração DECLARADA no contêiner, lida do `mvhd` do MP4 -- o número que o navegador
 * devolve em `media.duration`, e o da spec D8.
 *
 * Lida dos bytes, e não do "Duration:" do log do ffmpeg, porque o log tem duas casas: com
 * ele, `clique` (2,005 s nos dois arquivos) aparecia como 2,00 contra 2,01 e a diferença
 * MEDIDA era 0,01 s -- exatamente o limite do portão, por arredondamento e não por defeito.
 * Portão que depende da casa decimal do log reprova arquivo bom e aprova arquivo ruim.
 *
 * @param {string} arquivo @returns {number}
 */
function duracaoDeclarada(arquivo) {
  const buf = fs.readFileSync(arquivo);
  const achar = (de, ate, nome) => {
    let p = de;
    while (p + 8 <= ate) {
      const tam = buf.readUInt32BE(p);
      const tipo = buf.toString("latin1", p + 4, p + 8);
      if (tipo === nome) return { de: p + 8, ate: tam === 0 ? ate : p + tam };
      if (tam < 8) break;
      p += tam;
    }
    return null;
  };
  const moov = achar(0, buf.length, "moov");
  const mvhd = moov && achar(moov.de, moov.ate, "mvhd");
  if (!mvhd) throw new Error(`${path.basename(arquivo)}: sem moov/mvhd -- não é um MP4 que o navegador vá ler`);
  const versao = buf.readUInt8(mvhd.de);
  const base = mvhd.de + 4 + (versao === 1 ? 16 : 8);
  const escala = buf.readUInt32BE(base);
  const dur = versao === 1 ? Number(buf.readBigUInt64BE(base + 4)) : buf.readUInt32BE(base + 4);
  if (!(escala > 0)) throw new Error(`${path.basename(arquivo)}: timescale zerado no mvhd`);
  return dur / escala;
}

/**
 * Correlação no atraso `d` (em janelas de pico), pelo trecho comum.
 *
 * Correlação alta só no atraso 0 é o que separa "a mesma música" de "a mesma música
 * deslocada": uma cópia com meio segundo a mais no começo ainda correlaciona bem se o
 * atraso não for medido.
 *
 * @param {Uint8Array} a @param {Uint8Array} b @param {number} d
 */
function correlacaoNoAtraso(a, b, d) {
  return d >= 0 ? correlacaoDePicos(a.subarray(d), b) : correlacaoDePicos(a, b.subarray(-d));
}

/** O maior pico depois do quadro `de`. Perto de zero = o que sobra no fim é silêncio.
 * @param {Float32Array[]} canais @param {number} de */
function picoDaCauda(canais, de) {
  let maior = 0;
  const quadros = Math.min(...canais.map((c) => c.length));
  for (let q = Math.max(0, de); q < quadros; q++) {
    for (const canal of canais) maior = Math.max(maior, Math.abs(canal[q]));
  }
  return maior;
}

/** @param {string} origem @param {string} destino */
function gravarCopia(origem, destino) {
  const args = ["-hide_banner", "-nostdin", "-y", "-i", origem, "-vn", "-map", "0:a:0", "-ar", String(TAXA), "-c:a", "aac", "-b:a", KBPS, destino];
  const r = spawnSync(ffmpeg, args, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg falhou gravando ${path.basename(destino)}: ${(r.stderr?.toString("utf8") ?? "").slice(-400)}`);
}

let falhas = 0;
let gravadas = 0;
for (const pasta of PASTAS) {
  const dir = path.join(RAIZ, "public", pasta);
  const destinoDir = path.join(dir, "previa");
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".m4a")).sort();
  if (arquivos.length === 0) throw new Error(`public/${pasta} não tem nenhum .m4a: a pasta ou o caminho estão errados`);
  if (!SO_CONFERIR) fs.mkdirSync(destinoDir, { recursive: true });

  for (const nome of arquivos) {
    const origem = path.join(dir, nome);
    const destino = path.join(destinoDir, nome);
    if (!SO_CONFERIR) {
      gravarCopia(origem, destino);
      gravadas++;
    }
    if (!fs.existsSync(destino)) {
      console.log(`FALHA ${pasta}/${nome} · cópia de prévia ausente`);
      falhas++;
      continue;
    }

    // Os dois na MESMA taxa: comparar contagens e janelas medidas em taxas diferentes é
    // comparar coisas diferentes -- e é a taxa da cópia, que é a do navegador.
    const a = decodificar(origem, { taxa: TAXA, canais: 2 });
    const b = decodificar(destino, { taxa: TAXA, canais: 2 });
    const declaradaA = duracaoDeclarada(origem);
    const declaradaB = duracaoDeclarada(destino);
    const dif = Math.abs(declaradaA - declaradaB);
    const sobra = b.quadros - a.quadros;
    const cauda = picoDaCauda(b.canais, a.quadros);
    const pa = picosDoBuffer(a.canais, a.taxa, PICOS_POR_SEGUNDO);
    const pb = picosDoBuffer(b.canais, b.taxa, PICOS_POR_SEGUNDO);
    const cor = correlacaoDePicos(pa, pb);
    // O atraso 0 tem que ser o MELHOR: cópia deslocada correlaciona bem noutro atraso.
    const alinhada = [-2, -1, 1, 2].every((d) => correlacaoNoAtraso(pa, pb, d) < cor);
    const ok = dif <= TOLERANCIA_SEGUNDOS && cor > CORRELACAO_MINIMA && alinhada && b.taxa === TAXA && sobra >= 0 && sobra <= QUADRO_AAC && cauda <= PISO;
    if (!ok) falhas++;
    console.log(
      `${ok ? "ok   " : "FALHA"} ${pasta}/previa/${nome.padEnd(20)} ${b.taxa} Hz · ${declaradaB.toFixed(4)} s (dif ${dif.toFixed(4)} s)` +
        ` · sobra ${String(sobra).padStart(4)} amostras, pico ${cauda.toFixed(6)} · correlação ${cor.toFixed(4)}${alinhada ? "" : " DESALINHADA"} · ${(fs.statSync(destino).size / 1024).toFixed(0)} KB`,
    );
  }
}

console.log(falhas ? `\n${falhas} falha(s)` : `\ntudo certo${gravadas ? ` · ${gravadas} cópias gravadas` : ""}`);
process.exit(falhas ? 1 : 0);
