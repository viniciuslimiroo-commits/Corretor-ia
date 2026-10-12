// A COR ESCOLHIDA PRA TELA FINAL chega no vídeo -- e só ela chega.
//
// Ele em 12/10/2026: "poderia ter uma opção de personalizar esta tela? cores, logo, texto".
// A cor saía sempre da marca; agora o vídeo pode ter a dele (`telaFinalCor`).
//
// Duas coisas se provam aqui, e a segunda é a que importa de verdade:
//   1. o valor atravessa o saneador e vira o fundo do quadro;
//   2. o que NÃO é hex de 6 dígitos é descartado. `color=c=` do ffmpeg aceita nome ("red")
//      e expressão: deixar passar texto do navegador seria mandar coisa de fora pra dentro
//      do filtro. Com o campo recusado, a tela final volta pra cor da marca.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-tela-final-cor.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import { rodarFfmpeg } from "../src/lib/ffmpeg.ts";
import { argsTelaFinal } from "../src/lib/video-ffmpeg.ts";
import { contrasteComBranco, CORES_TELA_FINAL, ehCorDeFundo, limparEspec } from "../src/lib/video.ts";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Um espec mínimo que o saneador aceita, com a cor que se quer provar. */
const especCom = (cor: unknown) => ({
  formato: "9:16",
  cenas: [{ tipo: "foto", arquivo: "uploads/x/y.jpg", duracao: 4, efeito: "parado" }],
  musica: "nenhuma",
  titulo: "",
  preco: "",
  local: "",
  telaFinal: true,
  chamada: "Agende sua visita",
  transicao: "corte",
  telaFinalCor: cor,
});

async function main() {
  // ---- o saneador: passa o que é hex, recusa o resto ----
  for (const bom of ["#0F2D5B", "#1c1c1e", "#FFFFFF"]) {
    const r = limparEspec(especCom(bom));
    conferir(r.espec?.telaFinalCor === bom, `hex válido atravessa o saneador: ${bom}`, String(r.espec?.telaFinalCor));
  }
  for (const ruim of ["red", "0F2D5B", "#0F2D5", "#0F2D5BB", "rgb(0,0,0)", "", null, 42, "#0F2D5B;drawbox=1", "black@0.5"]) {
    const r = limparEspec(especCom(ruim));
    conferir(r.espec !== null && r.espec.telaFinalCor === undefined, `recusado e volta pra cor da marca: ${JSON.stringify(ruim)}`, String(r.espec?.telaFinalCor));
  }

  // ---- as cores oferecidas são legíveis com letra BRANCA ----
  for (const c of CORES_TELA_FINAL) {
    const r = contrasteComBranco(c.hex);
    conferir(r >= 4.5, `“${c.rotulo}” dá pra ler em branco`, `contraste ${r.toFixed(1)}:1`);
  }
  conferir(contrasteComBranco("#FFFFFF") < 4.5, "e a conta ACUSA um fundo claro (o aviso não é decorativo)", `branco em branco: ${contrasteComBranco("#FFFFFF").toFixed(1)}:1`);
  conferir(ehCorDeFundo("#abcdef") && !ehCorDeFundo("#abcde"), "o guarda de hex é o mesmo pros dois lados");

  // ---- E O QUADRO DE VERDADE: o fundo sai na cor pedida ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telafinal-cor-"));
  for (const { hex, esperado } of [
    { hex: "#6B1D2B", esperado: [107, 29, 43] },
    { hex: "#14532D", esperado: [20, 83, 45] },
  ]) {
    const mp4 = path.join(dir, `${hex.slice(1)}.mp4`);
    const png = path.join(dir, `${hex.slice(1)}.png`);
    await rodarFfmpeg(argsTelaFinal({ saida: mp4, W: 288, H: 512, duracao: 2, cor: hex, chamada: "Agende sua visita", nome: "Fulano", creci: "XX 1", whatsapp: "62900000000" }), 120_000);
    await rodarFfmpeg(["-ss", "0.1", "-i", mp4, "-frames:v", "1", "-y", png]);
    // O canto de cima à esquerda é fundo puro: o bloco de texto é centrado.
    const { data } = await sharp(png).extract({ left: 2, top: 2, width: 8, height: 8 }).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = [data[0], data[1], data[2]];
    const perto = Math.abs(r - esperado[0]) < 12 && Math.abs(g - esperado[1]) < 12 && Math.abs(b - esperado[2]) < 12;
    conferir(perto, `o quadro sai NA COR pedida (${hex})`, `medido rgb(${r},${g},${b})`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

main().then(
  () => {
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  },
  (e) => {
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
);
