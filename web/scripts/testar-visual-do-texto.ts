// CORES E TAMANHO PRÓPRIOS do texto da cena (`visual` em video.ts → video-ffmpeg.ts).
//
// Queixa do dono em 10/10/2026: "adiciono etiquetas e depois não é possível editar elas,
// queria que tudo que apareça no vídeo seja editável — cores, fontes". O motor já lia
// `visual` (cor da letra, fundo, contorno, sombra, tamanho); faltava controle na tela.
//
// O que este teste trava:
//   1. a semântica de TRÊS estados de `caixa`/`contorno` — ausente (o estilo decide),
//      `null` (escolha de NÃO ter) e uma cor. É o detalhe que se perde numa refatoração,
//      porque em JavaScript `null` e `undefined` parecem a mesma coisa até não parecerem.
//   2. que o saneador não deixa passar cor inventada.
//   3. que a cor escolhida chega NO PIXEL, com render de verdade. Filtro que o ffmpeg
//      recusa passa em qualquer teste que só leia a string de argumentos.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-visual-do-texto.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import { rodarFfmpeg } from "../src/lib/ffmpeg.ts";
import { filtrosDeTexto } from "../src/lib/video-ffmpeg.ts";
import { limparEspec, ESTILO_TEXTO_POR_ID, type TextoCena } from "../src/lib/video.ts";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const W = 360;
const H = 640;
const filtro = (t: Partial<TextoCena>) => filtrosDeTexto([{ texto: "VENDIDO", ...t } as TextoCena], W, H)[0] ?? "";

// ------------------------------------------------- a cor da letra

{
  conferir(/fontcolor=0xffffff/.test(filtro({})), "sem `visual`, a letra é branca (o padrão de sempre)");
  conferir(/fontcolor=0xff0000/.test(filtro({ visual: { cor: "ff0000" } })), "com `visual.cor`, a letra sai na cor pedida");
  // O estilo não some quando o visual fala: ele só perde nos campos que o visual preenche.
  const so = filtro({ estilo: "etiqueta", visual: { cor: "00ff00" } });
  conferir(/fontcolor=0x00ff00/.test(so), "a cor do visual VENCE a do estilo");
  conferir(/box=1/.test(so), "e a caixa do estilo continua, porque o visual não falou dela");
}

// ------------------------------------- os TRÊS estados de caixa e contorno

{
  const estilo = ESTILO_TEXTO_POR_ID.faixa;
  const semVisual = filtro({ estilo: "faixa" });
  conferir(/box=1/.test(semVisual) && new RegExp(`boxcolor=0x${estilo.cor.replace("0x", "")}`).test(semVisual), "caixa AUSENTE: vale a do estilo", estilo.cor);

  const caixaNula = filtro({ estilo: "faixa", visual: { caixa: null } });
  conferir(!/box=1/.test(caixaNula), "caixa `null`: NÃO desenha caixa, mesmo o estilo pedindo", "é escolha, não ausência");

  const caixaCor = filtro({ estilo: "faixa", visual: { caixa: "123456" } });
  conferir(/boxcolor=0x123456/.test(caixaCor), "caixa com cor: usa a cor pedida");

  // Contorno: o estilo "contorno" desenha borda; `null` tira; uma cor manda.
  conferir(/borderw=/.test(filtro({ estilo: "contorno" })), "contorno AUSENTE no estilo 'contorno': desenha borda");
  conferir(!/borderw=/.test(filtro({ estilo: "contorno", visual: { contorno: null } })), "contorno `null`: tira a borda que o estilo poria");
  conferir(/bordercolor=0xabcdef/.test(filtro({ estilo: "contorno", visual: { contorno: "abcdef" } })), "contorno com cor: usa a cor pedida");
}

// ------------------------------------------------- sombra e tamanho

{
  conferir(/shadowcolor/.test(filtro({ estilo: "faixa", visual: { caixa: null, sombra: true } })), "sombra ligada aparece quando não há caixa nem contorno");
  const base = Math.round(H * ESTILO_TEXTO_POR_ID.faixa.tamanho);
  conferir(new RegExp(`fontsize=${base}\\b`).test(filtro({ estilo: "faixa" })), "sem tamanho próprio, vale o do estilo", `${base}px`);
  conferir(/fontsize=64\b/.test(filtro({ estilo: "faixa", visual: { tamanho: 0.1 } })), "tamanho próprio manda", "0,1 x 640 = 64px");
}

// ------------------------------------------------- o saneador

{
  const comEspec = (visual: unknown) => {
    const r = limparEspec({
      formato: "9:16",
      musica: "nenhuma",
      narracao: null,
      titulo: "",
      preco: "",
      local: "",
      telaFinal: false,
      transicao: "corte",
      cenas: [{ tipo: "foto", arquivo: "a/b.jpg", duracao: 4, textos: [{ texto: "oi", visual }] }],
    });
    return r.espec?.cenas?.[0]?.textos?.[0]?.visual;
  };
  conferir(comEspec({ cor: "ff0000" })?.cor === "ff0000", "saneador aceita cor hexa de 6 dígitos");
  conferir(comEspec({ cor: "vermelho" })?.cor === undefined, "saneador DESCARTA cor inventada");
  conferir(comEspec({ cor: "#ff0000" })?.cor === undefined, "saneador descarta cor com # (o espec guarda sem)");
  conferir(comEspec({ caixa: null })?.caixa === null, "saneador PRESERVA `caixa: null`", "se virasse undefined, 'sem fundo' sumiria ao salvar");
  conferir(comEspec({ tamanho: 5 })?.tamanho === undefined, "saneador descarta tamanho fora da faixa");
}

// ------------------------------------------------- render de verdade

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-texto-"));
  const local = (n: string) => path.join(dir, n);

  /** Quantos pixels da cor pedida existem no quadro, com folga pra compressão. */
  async function pixels(arquivo: string, [r, g, b]: [number, number, number]) {
    const { data, info } = await sharp(arquivo).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (Math.abs(data[i] - r) < 60 && Math.abs(data[i + 1] - g) < 60 && Math.abs(data[i + 2] - b) < 60) n++;
    }
    return n;
  }

  /** Desenha o texto sobre fundo cinza e devolve o quadro. */
  async function render(nome: string, t: Partial<TextoCena>) {
    const saida = local(`${nome}.png`);
    const f = filtrosDeTexto([{ texto: "VENDIDO", ...t } as TextoCena], W, H);
    await rodarFfmpeg(["-f", "lavfi", "-i", `color=c=0x808080:s=${W}x${H}:d=1`, "-vf", f.join(","), "-frames:v", "1", "-y", saida], 60_000);
    return saida;
  }

  // Letra VERDE PURO sobre cinza, sem caixa: se o controle funciona, há verde no quadro.
  const verde = await render("verde", { estilo: "faixa", visual: { cor: "00ff00", caixa: null } });
  const nVerde = await pixels(verde, [0, 255, 0]);
  conferir(nVerde > 150, "RENDER: a letra sai VERDE quando se pede verde", `${nVerde} px`);

  // A mesma coisa em vermelho: prova que o controle CONTROLA, e não que verde aparece sempre.
  const vermelho = await render("vermelho", { estilo: "faixa", visual: { cor: "ff0000", caixa: null } });
  conferir((await pixels(vermelho, [255, 0, 0])) > 150, "RENDER: e sai VERMELHO quando se pede vermelho");
  conferir((await pixels(vermelho, [0, 255, 0])) < 20, "RENDER: e aí não sobra verde", "o controle controla");

  // Caixa com cor escolhida: muito mais pixels que a letra, porque é um retângulo.
  const caixa = await render("caixa", { estilo: "faixa", visual: { cor: "ffffff", caixa: "0000ff" } });
  const nAzul = await pixels(caixa, [0, 0, 255]);
  conferir(nAzul > 1500, "RENDER: a CAIXA sai na cor pedida", `${nAzul} px de azul`);

  // Tamanho: o dobro da fração tem que pintar bem mais letra.
  const pequeno = await pixels(await render("peq", { visual: { cor: "00ff00", caixa: null, tamanho: 0.03 } }), [0, 255, 0]);
  const grande = await pixels(await render("gra", { visual: { cor: "00ff00", caixa: null, tamanho: 0.08 } }), [0, 255, 0]);
  conferir(grande > pequeno * 2, "RENDER: tamanho maior pinta mais letra", `${pequeno} px → ${grande} px`);

  fs.rmSync(dir, { recursive: true, force: true });
}

main().then(
  () => {
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exit(falhas === 0 ? 0 : 1);
  },
  (e) => {
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
);
