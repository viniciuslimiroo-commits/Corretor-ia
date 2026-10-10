// A TELA FINAL: o logo, a chamada, o nome, o CRECI e o WhatsApp sem se atropelarem.
//
// Ele mandou o print em 10/10/2026: "ficou estranho, logo em cima das letras". Medido:
// com logo QUADRADO -- o caso mais comum -- o logo descia até 0,44 da altura e a chamada
// começava em 0,42. **39 px de sobreposição**, e vinha de posições escolhidas à mão
// (0,28 pro logo, 0,42 pra chamada) que não conversavam com o tamanho real do logo.
//
// Agora as peças são medidas, somadas e centradas como um bloco. Este teste RENDERIZA e mede
// o quadro: cálculo de layout que só é conferido lendo o código é cálculo não conferido.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-tela-final.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import { rodarFfmpeg } from "../src/lib/ffmpeg.ts";
import { argsTelaFinal } from "../src/lib/video-ffmpeg.ts";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const W = 1080;
const H = 1920;
const FUNDO: [number, number, number] = [15, 45, 91];

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tela-final-"));
  const local = (n: string) => path.join(dir, n);

  /** Um logo de teste OPACO na forma pedida, pra medir onde ele cai. */
  async function logo(largura: number, altura: number) {
    const f = local(`logo-${largura}x${altura}.png`);
    await sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } })
      .png()
      .toFile(f);
    return f;
  }

  /** As linhas do quadro em que há tinta (verde do logo, ou branco do texto). */
  async function faixas(arquivo: string) {
    const { data, info } = await sharp(arquivo).raw().toBuffer({ resolveWithObject: true });
    const verde: number[] = [];
    const branco: number[] = [];
    for (let y = 0; y < info.height; y++) {
      let v = 0;
      let b = 0;
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        const [r, g, bl] = [data[i], data[i + 1], data[i + 2]];
        if (r < 110 && g > 150 && bl < 110) v++;
        else if (r > 170 && g > 170 && bl > 170) b++;
      }
      if (v > 3) verde.push(y);
      if (b > 3) branco.push(y);
    }
    return { verde, branco, altura: info.height };
  }

  async function render(nome: string, arquivoLogo: string | undefined) {
    const mp4 = local(`${nome}.mp4`);
    const png = local(`${nome}.png`);
    await rodarFfmpeg(
      argsTelaFinal({
        saida: mp4,
        W,
        H,
        duracao: 4,
        cor: "#0F2D5B",
        logo: arquivoLogo,
        chamada: "Agende sua visita",
        nome: "Vinicius Cardoso · Imobiliária J7",
        creci: "XX 00000-F",
        whatsapp: "62994397125",
      }),
      120_000
    );
    await rodarFfmpeg(["-ss", "0.1", "-i", mp4, "-frames:v", "1", "-y", png]);
    return png;
  }

  // ---- O DEFEITO DO PRINT: logo quadrado não pode encostar no texto ----
  {
    const png = await render("quadrado", await logo(447, 447));
    const { verde, branco } = await faixas(png);
    conferir(verde.length > 0, "o logo aparece no quadro", `${verde.length} linhas`);
    conferir(branco.length > 0, "e o texto também");
    const baseDoLogo = Math.max(...verde);
    // O rodapé "Imagens ilustrativas" é branco e fica embaixo: o texto do BLOCO é o branco
    // que vem logo depois do logo, não o do pé.
    const textoDoBloco = branco.filter((y) => y > baseDoLogo && y < H * 0.9);
    const topoDoTexto = Math.min(...textoDoBloco);
    conferir(topoDoTexto > baseDoLogo, "NÃO há sobreposição: o texto começa abaixo do logo", `logo até ${baseDoLogo}, texto a partir de ${topoDoTexto}`);
    conferir(topoDoTexto - baseDoLogo > 30, "e há respiro de verdade entre os dois", `${topoDoTexto - baseDoLogo} px`);
  }

  // ---- logo DEITADO: a conta tem que valer pra qualquer proporção ----
  {
    const png = await render("deitado", await logo(800, 200));
    const { verde, branco } = await faixas(png);
    const baseDoLogo = Math.max(...verde);
    const topoDoTexto = Math.min(...branco.filter((y) => y > baseDoLogo && y < H * 0.9));
    conferir(topoDoTexto > baseDoLogo, "logo deitado também não encosta no texto", `${topoDoTexto - baseDoLogo} px de folga`);
  }

  // ---- o rodapé fica no PÉ, não no topo ----
  {
    // Quando `draw` passou a receber pixel em vez de fração, esta linha ficou com `0.93` e o
    // aviso foi desenhado no pixel 0,93 -- no topo do quadro. O tipo não mudou (`number`
    // continua `number`), então só o render denuncia.
    const png = await render("rodape", await logo(447, 447));
    const { branco } = await faixas(png);
    const noTopo = branco.filter((y) => y < H * 0.08);
    conferir(noTopo.length === 0, "não há texto perdido no TOPO do quadro", noTopo.length ? `${noTopo.length} linhas em ${noTopo[0]}` : "limpo");
    const noPe = branco.filter((y) => y > H * 0.9);
    conferir(noPe.length > 0, "e o aviso “Imagens ilustrativas” está no pé", `linhas ${Math.min(...noPe)}–${Math.max(...noPe)}`);
  }

  // ---- SEM logo: continua equilibrado ----
  {
    const png = await render("sem-logo", undefined);
    const { verde, branco } = await faixas(png);
    conferir(verde.length === 0, "sem logo, nenhum logo aparece");
    const bloco = branco.filter((y) => y < H * 0.9);
    const centro = (Math.min(...bloco) + Math.max(...bloco)) / 2 / H;
    conferir(centro > 0.3 && centro < 0.62, "o bloco de texto fica na metade da tela", `centro em ${centro.toFixed(2)} da altura`);
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
