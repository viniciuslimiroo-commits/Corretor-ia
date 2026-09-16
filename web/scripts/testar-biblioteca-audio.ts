// A BIBLIOTECA DE ÁUDIO: cada faixa do catálogo tem arquivo, e cada arquivo tem som.
//
// Já aconteceu aqui: a fila do fal travou em dois efeitos, o catálogo continuou listando
// os seis, e a tela passou a oferecer dois botões que apontavam pra arquivo inexistente.
// Ninguém viu, porque `<audio>` com src 404 simplesmente não toca -- sem erro, sem aviso.
//
// E o defeito irmão, mais escorregadio: o arquivo EXISTE e é silêncio. O modelo devolve
// os segundos pedidos cheios de nada quando o pedido sai torto, e o botão "Brilho" vira
// um botão que não faz nada.
//
// Então aqui se confere o catálogo inteiro contra o disco, e o pico de volume de cada
// arquivo. É barato (não chama IA nenhuma) e é a rede que faltava.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-biblioteca-audio.ts

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { MUSICAS, EFEITOS_SONOROS } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Pico e duração de um arquivo de áudio, lidos do próprio ffmpeg. */
function medir(arquivo: string): { pico: number; segundos: number } {
  const r = spawnSync(ffmpeg, ["-i", arquivo, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const saida = r.stderr ?? "";
  const pico = saida.match(/max_volume: (-?\d+(?:\.\d+)?) dB/);
  const dur = saida.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return {
    pico: pico ? Number(pico[1]) : -Infinity,
    segundos: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0,
  };
}

/**
 * `-91 dB` é o que o ffmpeg reporta pra silêncio digital. Um som de verdade, mesmo
 * discreto, passa bem disso -- o mais baixo desta biblioteca hoje é -4,3.
 */
const SILENCIO = -50;

console.log("biblioteca de áudio: catálogo contra disco\n");

const grupos: { nome: string; pasta: string; itens: { id: string; rotulo: string; arquivo: string | null }[]; minimoSegundos: number }[] = [
  { nome: "música", pasta: "musica", itens: MUSICAS, minimoSegundos: 10 },
  { nome: "efeito", pasta: "efeitos", itens: EFEITOS_SONOROS, minimoSegundos: 0.4 },
];

for (const g of grupos) {
  for (const item of g.itens) {
    // "Sem música" e "Sem efeito" são escolhas de verdade, e não têm arquivo de propósito.
    if (!item.arquivo) {
      conferir(true, `${g.nome} "${item.rotulo}" não precisa de arquivo`);
      continue;
    }
    const caminho = path.join(RAIZ, "public", g.pasta, item.arquivo);
    if (!fs.existsSync(caminho)) {
      conferir(false, `${g.nome} "${item.rotulo}" tem arquivo`, `faltando: public/${g.pasta}/${item.arquivo}`);
      continue;
    }
    const m = medir(caminho);
    conferir(
      m.pico > SILENCIO && m.segundos >= g.minimoSegundos,
      `${g.nome} "${item.rotulo}" tem som`,
      `pico ${m.pico.toFixed(1)} dB · ${m.segundos.toFixed(2)}s`
    );
  }
}

// E o contrário: arquivo no disco que ninguém lista é peso morto no deploy.
for (const g of grupos) {
  const pasta = path.join(RAIZ, "public", g.pasta);
  const noDisco = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((f) => /\.(m4a|mp3|wav)$/i.test(f)) : [];
  const noCatalogo = new Set(g.itens.map((i) => i.arquivo).filter(Boolean) as string[]);
  const sobrando = noDisco.filter((f) => !noCatalogo.has(f));
  conferir(sobrando.length === 0, `nenhum arquivo de ${g.nome} sobrando em public/${g.pasta}`, sobrando.join(", "));
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
