// A TELA FINAL CABE NO QUADRO? Medido no PIXEL, não no código.
//
// 22/09/2026. Ele mandou a foto do vídeo pronto: "Vinicius Cardoso · Imobiliária J7" saiu
// cortado dos dois lados no 9:16. O `drawtext` centraliza com x=(w-text_w)/2 -- quando o
// texto é mais largo que o quadro, essa conta dá NEGATIVO e a frase sangra pelas bordas.
//
// Este teste renderiza a tela final de verdade, lê o PNG e procura a coluna mais à esquerda
// e a mais à direita com pixel claro. Se o texto couber, sobra margem dos dois lados.
//
// O controle negativo é o que dá valor ao "ok": o mesmo nome desenhado com o tamanho fixo
// de antes TEM que falhar. Um teste que não sabe reprovar não sabe aprovar.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-tela-final.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import ffmpegBin from "ffmpeg-static";
import { argsTelaFinal, caberNaLargura } from "../src/lib/video-ffmpeg";
import { larguraDoTexto } from "../src/lib/texto-svg";

const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), "encena-telafinal-"));
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** A primeira e a última coluna com pixel claro (o texto é branco sobre a cor da marca). */
async function margens(png: string): Promise<{ esq: number; dir: number; W: number }> {
  const img = sharp(png);
  const { width = 0, height = 0 } = await img.metadata();
  const bruto = await img.raw().toBuffer();
  const canais = bruto.length / (width * height);
  let esq = width;
  let dir = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * canais;
      // Branco do texto contra o azul da marca: o verde é o que separa melhor os dois.
      if (bruto[i] > 200 && bruto[i + 1] > 200 && bruto[i + 2] > 200) {
        if (x < esq) esq = x;
        if (x > dir) dir = x;
      }
    }
  }
  return { esq, dir, W: width };
}

/** Chama o mesmo ffmpeg que o produto usa. (rodarFfmpeg não carrega fora do Next: usa require.) */
function correr(args: string[]) {
  execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

async function desenhar(nome: string, arquivo: string, W: number, H: number) {
  const saida = path.join(SAIDA, arquivo);
  correr(
    argsTelaFinal({
      saida,
      W,
      H,
      duracao: 1,
      cor: "#0F2D5B",
      chamada: "Agende sua visita",
      nome,
      creci: "XX 00000-F",
      whatsapp: "62994397125",
    })
  );
  const png = saida.replace(/\.mp4$/, ".png");
  correr(["-i", saida, "-frames:v", "1", "-y", png]);
  return png;
}

async function main() {
  if (!fs.existsSync(path.join(process.cwd(), "assets", "fontes", "Geist-SemiBold.ttf"))) {
    console.log("a fonte do drawtext não está em assets/fontes; nada foi medido");
    process.exit(1);
  }

  const NOME = "Vinicius Cardoso · Imobiliária J7";

  // ---- 1. o que ele viu: 9:16, nome longo ----
  for (const [rotulo, W, H] of [
    ["9:16 (o do defeito)", 1080, 1920],
    ["16:9", 1920, 1080],
    ["1:1", 1080, 1080],
  ] as const) {
    const png = await desenhar(NOME, `final-${W}x${H}.mp4`, W, H);
    const m = await margens(png);
    const margemMin = Math.round(W * 0.03);
    conferir(m.esq >= margemMin && m.dir <= W - margemMin, `${rotulo}: o texto fica dentro do quadro`, `esquerda ${m.esq}px, direita ${W - m.dir}px do fim (mínimo ${margemMin})`);
  }

  // ---- 2. nome absurdo: tem que caber ou quebrar, nunca sangrar ----
  const ENORME = "Maria Aparecida do Nascimento Albuquerque · Imobiliária Recanto dos Pássaros";
  const pngE = await desenhar(ENORME, "final-enorme.mp4", 1080, 1920);
  const mE = await margens(pngE);
  conferir(mE.esq >= 30 && mE.dir <= 1050, "nome muito longo cabe (encolhendo ou quebrando)", `esquerda ${mE.esq}px, direita ${1080 - mE.dir}px do fim`);

  // ---- 3. CONTROLE NEGATIVO: o tamanho fixo de antes tem que estourar ----
  // Sem isto, os "ok" acima não valem nada: um medidor cego aprova qualquer coisa.
  const tamAntigo = Math.round(1920 * 0.042);
  const larguraAntiga = larguraDoTexto(NOME, tamAntigo);
  conferir(larguraAntiga > 1080 * 0.88, "controle: com o tamanho fixo de antes, o nome ERA mais largo que o quadro", `${Math.round(larguraAntiga)}px de texto em ${1080}px de quadro`);
  const ajustado = caberNaLargura(NOME, tamAntigo, 1080 * 0.88);
  conferir(ajustado.tam < tamAntigo, "e o ajuste encolhe a fonte", `${tamAntigo} -> ${ajustado.tam}`);
  conferir(larguraDoTexto(ajustado.texto.split("\n")[0], ajustado.tam) <= 1080 * 0.88, "até caber de verdade na largura útil");

  // Nome curto não pode ser mexido: encolher quem já cabia seria estragar o que funcionava.
  const curto = caberNaLargura("Ana Souza", tamAntigo, 1080 * 0.88);
  conferir(curto.tam === tamAntigo && curto.linhas === 1, "controle: nome curto sai do jeito que era", `${curto.tam}px, ${curto.linhas} linha`);

  console.log(`\nimagens em ${SAIDA}`);
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);

}

main();
