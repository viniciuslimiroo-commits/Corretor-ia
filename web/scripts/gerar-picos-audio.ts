// Mede os arquivos da biblioteca de áudio e grava o que a linha do tempo precisa saber
// deles SEM baixar nada no navegador (docs/planos/linha-do-tempo-spec.md, A1 e P4).
//
// Hoje grava uma coisa só:
//
//   src/lib/segundos-do-catalogo.ts   SEGUNDOS_MUSICA e SEGUNDOS_EFEITO, a duração exata
//                                     de cada arquivo de public/musica e public/efeitos,
//                                     pelo id do catálogo (MUSICAS e EFEITOS_SONOROS).
//
// A duração sai da CONTAGEM de amostras decodificadas (bytes de PCM ÷ 2 ÷ taxa), não do
// "Duration:" do cabeçalho: o cabeçalho arredonda a centésimo e conta o atraso do
// codificador AAC, e é desse número que dependem o laço da música e o fim do trecho na
// linha do tempo. A taxa é a do próprio arquivo (sem reamostrar): reamostrar acrescenta ou
// come amostras na borda, e aí a conta deixa de ser exata.
//
// Estrutura pensada pra crescer (P4): `decodificar` devolve as amostras; cada SAÍDA é uma
// função que recebe as medidas e escreve um arquivo. Os picos da forma de onda
// (public/musica/picos.json, decodificados a 48 kHz em estéreo) entram como mais uma
// saída, sem mexer na medição.
//
//   node --import ./scripts/ts-direto.mjs scripts/gerar-picos-audio.ts
//
// Não chama rede nem IA: lê os arquivos que já estão em public/.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const ARQUIVO_SEGUNDOS = path.join(RAIZ, "src", "lib", "segundos-do-catalogo.ts");

// video.ts importa o arquivo gerado. Numa cópia sem ele, o import do catálogo quebraria
// antes de a medição começar: um arquivo vazio basta pra carregar, e é sobrescrito no fim.
if (!fs.existsSync(ARQUIVO_SEGUNDOS)) {
  fs.writeFileSync(ARQUIVO_SEGUNDOS, "export const SEGUNDOS_MUSICA = {};\nexport const SEGUNDOS_EFEITO = {};\n");
}
const { MUSICAS, EFEITOS_SONOROS } = await import("../src/lib/video.ts");

type Decodificado = { amostras: Buffer; taxa: number; canais: 1 | 2; quadros: number };

/**
 * PCM s16le do primeiro áudio do arquivo. `taxa` ausente = a do próprio arquivo (a única
 * em que a contagem de quadros é exata). `canais` não muda a contagem: mistura, não corta.
 */
function decodificar(arquivo: string, o: { taxa?: number; canais: 1 | 2 }): Decodificado {
  const args = ["-hide_banner", "-nostdin", "-i", arquivo, "-map", "0:a:0", "-ac", String(o.canais), ...(o.taxa ? ["-ar", String(o.taxa)] : []), "-f", "s16le", "-acodec", "pcm_s16le", "-"];
  const r = spawnSync(ffmpeg, args, { maxBuffer: 1 << 30 });
  const erro = r.stderr?.toString("utf8") ?? "";
  if (r.status !== 0 || !r.stdout) throw new Error(`ffmpeg falhou em ${path.basename(arquivo)}: ${erro.slice(-400)}`);
  // A taxa lida da SAÍDA (o que foi contado), não da entrada.
  const saida = erro.slice(erro.indexOf("Output #0"));
  const taxa = Number(saida.match(/Audio: pcm_s16le, (\d+) Hz/)?.[1]);
  if (!Number.isFinite(taxa) || taxa <= 0) throw new Error(`taxa de amostragem ilegível em ${path.basename(arquivo)}`);
  const bytesPorQuadro = 2 * o.canais;
  if (r.stdout.length === 0 || r.stdout.length % bytesPorQuadro !== 0) throw new Error(`PCM torto em ${path.basename(arquivo)}: ${r.stdout.length} bytes`);
  return { amostras: r.stdout, taxa, canais: o.canais, quadros: r.stdout.length / bytesPorQuadro };
}

type Medida = { id: string; arquivo: string; taxa: number; quadros: number; segundos: number };

/** Cada arquivo do catálogo, na ordem do catálogo, conferido contra a pasta. */
function medirPasta(pasta: string, catalogo: { id: string; arquivo: string | null }[]): Medida[] {
  const dir = path.join(RAIZ, "public", pasta);
  const noDisco = fs.readdirSync(dir).filter((f) => f.endsWith(".m4a")).sort();
  const noCatalogo = catalogo.filter((c): c is { id: string; arquivo: string } => !!c.arquivo);
  // Duas contagens por caminhos diferentes: arquivo sem id some da linha do tempo calado, e
  // id sem arquivo vira um trecho que o servidor não acha.
  const semId = noDisco.filter((f) => !noCatalogo.some((c) => c.arquivo === f));
  const semArquivo = noCatalogo.filter((c) => !noDisco.includes(c.arquivo));
  if (semId.length || semArquivo.length) {
    throw new Error(`public/${pasta} e o catálogo não batem · sem id: ${semId.join(", ") || "-"} · sem arquivo: ${semArquivo.map((c) => c.id).join(", ") || "-"}`);
  }
  return noCatalogo.map((c) => {
    const d = decodificar(path.join(dir, c.arquivo), { canais: 1 });
    return { id: c.id, arquivo: c.arquivo, taxa: d.taxa, quadros: d.quadros, segundos: Math.round((d.quadros / d.taxa) * 1000) / 1000 };
  });
}

// ---------- saídas ----------

function gravarSegundos(musicas: Medida[], efeitos: Medida[]) {
  const mapa = (l: Medida[]) => l.map((m) => `  ${m.id}: ${m.segundos},`).join("\n");
  const conteudo = `// GERADO por scripts/gerar-picos-audio.ts -- não editar à mão; rode o script de novo.
//
// Duração exata (em segundos, com 3 casas) de cada arquivo da biblioteca de áudio, pela
// contagem de amostras decodificadas. A linha do tempo usa pra saber onde a música acaba
// sem laço e quanto dá pra deslizar o trecho, sem baixar o arquivo no navegador.

import type { EfeitoSonoroId, MusicaId } from "./video";

export const SEGUNDOS_MUSICA: Readonly<Partial<Record<MusicaId, number>>> = {
${mapa(musicas)}
};

export const SEGUNDOS_EFEITO: Readonly<Partial<Record<EfeitoSonoroId, number>>> = {
${mapa(efeitos)}
};
`;
  fs.writeFileSync(ARQUIVO_SEGUNDOS, conteudo);
}

const SAIDAS: { nome: string; gravar: (musicas: Medida[], efeitos: Medida[]) => void }[] = [
  { nome: path.relative(RAIZ, ARQUIVO_SEGUNDOS).replace(/\\/g, "/"), gravar: gravarSegundos },
];

// ---------- execução ----------

const musicas = medirPasta("musica", MUSICAS);
const efeitos = medirPasta("efeitos", EFEITOS_SONOROS);
for (const m of [...musicas, ...efeitos]) {
  console.log(`${m.arquivo.padEnd(22)} ${String(m.taxa).padStart(6)} Hz · ${String(m.quadros).padStart(8)} quadros · ${m.segundos.toFixed(3)} s`);
}
if (musicas.length === 0 || efeitos.length === 0) throw new Error("nenhum arquivo medido: a pasta ou o catálogo vieram vazios");
for (const s of SAIDAS) {
  s.gravar(musicas, efeitos);
  console.log(`gravado ${s.nome}`);
}
