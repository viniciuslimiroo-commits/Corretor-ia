// A MARCA D'ÁGUA no vídeo inteiro (video-ffmpeg.ts + video.ts). Renderiza de verdade com
// o ffmpeg e MEDE o pixel: um filtro que o ffmpeg recusa passa em qualquer teste que só
// olhe a lista de argumentos. Sem rede, sem banco, sem crédito.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-marca-dagua.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import { rodarFfmpeg, sondarMidia } from "../src/lib/ffmpeg.ts";
import { argsMontagem } from "../src/lib/video-ffmpeg.ts";
import { limparMarcaDagua, precisaDoEditor, TAMANHOS_MARCA_DAGUA, OPACIDADE_MARCA_DAGUA_PADRAO } from "../src/lib/video.ts";

// O MESMO arranjo de testar-audio-blocos.ts: rodado por `node --import ts-direto`, o
// arquivo vira ESM, e aí o `require("ffmpeg-static")` dentro de caminhoFfmpeg() não existe.
// Apontando FFMPEG_PATH, aquela função devolve o caminho antes de chegar no require.
process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marca-dagua-"));
const local = (n: string) => path.join(dir, n);
const W = 360;
const H = 640;

// ---------------------------------------------------------------- saneador

{
  conferir(limparMarcaDagua(null) === null, "sem pedido, não há marca d'água");
  conferir(limparMarcaDagua(undefined) === null, "indefinido também não vira marca");
  const padrao = limparMarcaDagua({});
  conferir(padrao?.canto === "inferior_direito", "canto padrão é o inferior direito", padrao?.canto);
  conferir(padrao?.tamanho === "media", "tamanho padrão é médio", padrao?.tamanho);
  conferir(padrao?.opacidade === OPACIDADE_MARCA_DAGUA_PADRAO, "opacidade padrão", String(padrao?.opacidade));
  conferir(limparMarcaDagua({ canto: "coisa" })?.canto === "inferior_direito", "canto inventado cai no padrão");
  // O centro só existe na lista da marca d'água. Se o saneador validasse contra a lista
  // do apresentador (que não tem centro), ele apagaria em silêncio a opção que a tela
  // oferece -- e a pessoa escolheria "No meio" e receberia o canto.
  conferir(limparMarcaDagua({ canto: "centro" })?.canto === "centro", "o CENTRO sobrevive ao saneador");
  conferir(limparMarcaDagua({ tamanho: "gigante" })?.tamanho === "media", "tamanho inventado cai no padrão");
  // O piso da opacidade: abaixo dele a marca não se enxerga e o vídeo sai "sem marca" com
  // a pessoa achando que pôs uma.
  conferir(limparMarcaDagua({ opacidade: 0 })?.opacidade === 0.15, "opacidade 0 sobe pro piso de 0,15");
  conferir(limparMarcaDagua({ opacidade: -5 })?.opacidade === 0.15, "opacidade negativa sobe pro piso");
  conferir(limparMarcaDagua({ opacidade: 9 })?.opacidade === 1, "opacidade acima de 1 é limitada");
  conferir(limparMarcaDagua({ opacidade: "abc" })?.opacidade === OPACIDADE_MARCA_DAGUA_PADRAO, "opacidade não-numérica cai no padrão");
}

// ------------------------------------------------- a trava da página rápida

{
  // Sem esta trava, reabrir na página rápida um vídeo com marca e gerar de novo devolveria
  // o vídeo SEM ela, calado. É o mesmo buraco que textos e legendas já tinham.
  conferir(precisaDoEditor({ marcaDagua: { canto: "inferior_direito", tamanho: "media", opacidade: 0.7 } }) === true, "vídeo COM marca d'água exige o editor");
  conferir(precisaDoEditor({ cenas: [] }) === false, "vídeo sem nada continua cabendo na página rápida");
  conferir(precisaDoEditor({ marcaDagua: null }) === false, "marca nula não prende no editor");
}

// O corpo que renderiza mora numa FUNÇÃO. `await` no topo do arquivo, somado ao `require`
// dinâmico dentro de ffmpeg.ts (caminhoFfmpeg), faz o Node recusar o módulo por formato
// ambíguo: ERR_AMBIGUOUS_MODULE_SYNTAX. Dentro de uma função async não há ambiguidade.
async function main() {
  // ---------------------------------------------------------------- render real

  // Um logo de teste: quadrado VERMELHO PURO, que não existe em nenhum lugar do fundo.
  // É isso que torna a medição possível -- procurar "algo vermelho" só funciona porque o
  // fundo é cinza.
  const logo = local("logo.png");
  await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toFile(logo);

  // Dois clipes cinza de 2s, pra haver emenda -- a marca tem que atravessar a transição.
  const clipes: string[] = [];
  for (let i = 0; i < 2; i++) {
    const c = local(`clipe${i}.mp4`);
    await rodarFfmpeg(["-f", "lavfi", "-i", `color=c=0x808080:s=${W}x${H}:d=2:r=30`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", c]);
    clipes.push(c);
  }

  const fracaoMedia = TAMANHOS_MARCA_DAGUA.find((t) => t.id === "media")!.fracao;
  const saida = local("com-marca.mp4");
  await rodarFfmpeg(
    argsMontagem({
      clipes,
      duracoes: [2, 2],
      saida,
      W,
      H,
      emendas: [{ xfade: "dissolve", segundos: 0.6 }],
      marcaDagua: { arquivo: logo, canto: "inferior_direito", fracao: fracaoMedia, opacidade: 1 },
    }),
    120_000
  );
  conferir(fs.existsSync(saida) && fs.statSync(saida).size > 1000, "o ffmpeg aceitou o filtro e gerou o arquivo", `${Math.round(fs.statSync(saida).size / 1024)} KB`);

  const sonda = await sondarMidia(saida);
  conferir(Math.abs((sonda.duracao ?? 0) - 3.4) < 0.4, "a duração é a dos clipes menos a emenda", `${sonda.duracao}s`);

  /** Quantos pixels claramente vermelhos existem no quadro do segundo `s`. */
  async function vermelhosNoSegundo(s: number): Promise<number> {
    const quadro = local(`q${s}.png`);
    await rodarFfmpeg(["-ss", s.toFixed(2), "-i", saida, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) n++;
    }
    return n;
  }

  // O PONTO DA FUNCIONALIDADE: no começo, no meio E NO FIM. A capa e a tela final já
  // levavam o logo antes -- o que não existia era ele no meio, que é justamente o trecho que
  // sobra quando alguém corta as pontas do vídeo pra reusar.
  const inicio = await vermelhosNoSegundo(0.3);
  const meio = await vermelhosNoSegundo(1.7);
  const fim = await vermelhosNoSegundo(3.1);
  conferir(inicio > 200, "a marca está no começo", `${inicio} px`);
  conferir(meio > 200, "a marca está NO MEIO (o que não existia antes)", `${meio} px`);
  conferir(fim > 200, "a marca está no fim", `${fim} px`);

  // O tamanho pedido é o tamanho entregue: 16% de 360 = ~58px de largura, logo quadrado,
  // então ~58x58 = ~3364 px. Com folga de 35% pra reamostragem e compressão.
  const esperado = Math.round(W * fracaoMedia) ** 2;
  conferir(meio > esperado * 0.65 && meio < esperado * 1.35, "o tamanho na tela é o pedido", `${meio} px, esperado ~${esperado}`);

  // A marca fica no canto pedido, não no meio da tela.
  {
    const quadro = local("canto.png");
    await rodarFfmpeg(["-ss", "1.70", "-i", saida, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    let somaX = 0, somaY = 0, n = 0;
    for (let p = 0; p < info.width * info.height; p++) {
      const i = p * info.channels;
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) {
        somaX += p % info.width;
        somaY += Math.floor(p / info.width);
        n++;
      }
    }
    const cx = somaX / n / info.width;
    const cy = somaY / n / info.height;
    conferir(cx > 0.6, "o centro da marca está na METADE DIREITA", `x=${cx.toFixed(2)}`);
    conferir(cy > 0.6, "o centro da marca está na METADE DE BAIXO", `y=${cy.toFixed(2)}`);
  }

  // NO MEIO: pedido dele em 10/10/2026. Não é "mais um canto" -- é outra conta no ffmpeg,
  // e só o render diz se ela está certa.
  {
    const meio = local("meio.mp4");
    await rodarFfmpeg(
      argsMontagem({
        clipes,
        duracoes: [2, 2],
        saida: meio,
        W,
        H,
        emendas: [{ xfade: "dissolve", segundos: 0.6 }],
        marcaDagua: { arquivo: logo, canto: "centro", fracao: fracaoMedia, opacidade: 1 },
      }),
      120_000
    );
    const quadro = local("q-meio.png");
    await rodarFfmpeg(["-ss", "1.70", "-i", meio, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    let somaX = 0, somaY = 0, n = 0;
    for (let p = 0; p < info.width * info.height; p++) {
      const i = p * info.channels;
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) {
        somaX += p % info.width;
        somaY += Math.floor(p / info.width);
        n++;
      }
    }
    const cx = somaX / n / info.width;
    const cy = somaY / n / info.height;
    conferir(Math.abs(cx - 0.5) < 0.04, "RENDER: no meio, a marca fica CENTRADA na horizontal", `x=${cx.toFixed(3)}`);
    conferir(Math.abs(cy - 0.5) < 0.04, "RENDER: e centrada na vertical", `y=${cy.toFixed(3)}`);
  }

  // Canto oposto: a escolha muda mesmo o resultado, não é enfeite na tela.
  {
    const outro = local("canto-oposto.mp4");
    await rodarFfmpeg(
      argsMontagem({
        clipes,
        duracoes: [2, 2],
        saida: outro,
        W,
        H,
        emendas: [{ xfade: "dissolve", segundos: 0.6 }],
        marcaDagua: { arquivo: logo, canto: "superior_esquerdo", fracao: fracaoMedia, opacidade: 1 },
      }),
      120_000
    );
    const quadro = local("q-oposto.png");
    await rodarFfmpeg(["-ss", "1.70", "-i", outro, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    let somaX = 0, somaY = 0, n = 0;
    for (let p = 0; p < info.width * info.height; p++) {
      const i = p * info.channels;
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) {
        somaX += p % info.width;
        somaY += Math.floor(p / info.width);
        n++;
      }
    }
    conferir(somaX / n / info.width < 0.4, "no superior esquerdo, a marca vai pra ESQUERDA", `x=${(somaX / n / info.width).toFixed(2)}`);
    conferir(somaY / n / info.height < 0.4, "no superior esquerdo, a marca vai pra CIMA", `y=${(somaY / n / info.height).toFixed(2)}`);
  }

  // A transparência chega no arquivo: meia opacidade sobre fundo cinza dá um vermelho
  // misturado, não o vermelho puro. Sem esta medida, `colorchannelmixer` podia estar sendo
  // ignorado e ninguém notaria.
  {
    const meia = local("meia.mp4");
    await rodarFfmpeg(
      argsMontagem({
        clipes,
        duracoes: [2, 2],
        saida: meia,
        W,
        H,
        emendas: [{ xfade: "dissolve", segundos: 0.6 }],
        marcaDagua: { arquivo: logo, canto: "inferior_direito", fracao: fracaoMedia, opacidade: 0.35 },
      }),
      120_000
    );
    const quadro = local("q-meia.png");
    await rodarFfmpeg(["-ss", "1.70", "-i", meia, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    // O LIMIAR AQUI É ESTRITO de propósito. O frouxo usado acima ("é vermelho o bastante
    // pra eu achar a marca") casa com 35% também: 0,35 de vermelho puro sobre o cinza 128
    // dá (172, 83, 83), que passa em `r>150, g<90, b<90`. Medindo assim, o teste dizia que
    // a opacidade não tinha entrado quando ela tinha -- o defeito era do teste.
    let puros = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 230 && data[i + 1] < 50 && data[i + 2] < 50) puros++;
    }
    conferir(puros < esperado * 0.1, "com opacidade 0,35 não sobra vermelho PURO", `${puros} px de ${esperado}`);

    // E a cor média da marca fica entre o vermelho e o cinza do fundo, que é o que
    // "transparente" quer dizer. Só contar pixel não provaria isso.
    let somaR = 0, somaG = 0, n2 = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 110) {
        somaR += data[i];
        somaG += data[i + 1];
        n2++;
      }
    }
    const mediaR = Math.round(somaR / n2);
    const mediaG = Math.round(somaG / n2);
    // Esperado: 0,35·255 + 0,65·128 = 172 no vermelho, e 0,35·0 + 0,65·128 = 83 no verde.
    conferir(Math.abs(mediaR - 172) < 25, "o vermelho médio bate com a mistura de 35%", `${mediaR}, esperado ~172`);
    conferir(Math.abs(mediaG - 83) < 25, "o verde médio bate com a mistura de 35%", `${mediaG}, esperado ~83`);
  }

  // Sem marca pedida, o vídeo sai limpo -- a funcionalidade não vaza pra quem não pediu.
  {
    const limpo = local("sem-marca.mp4");
    await rodarFfmpeg(argsMontagem({ clipes, duracoes: [2, 2], saida: limpo, W, H, emendas: [{ xfade: "dissolve", segundos: 0.6 }] }), 120_000);
    const quadro = local("q-limpo.png");
    await rodarFfmpeg(["-ss", "1.70", "-i", limpo, "-frames:v", "1", "-y", quadro]);
    const { data, info } = await sharp(quadro).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) n++;
    }
    conferir(n === 0, "sem marca pedida, nenhum pixel dela aparece", `${n} px`);
  }
}

main().then(
  () => {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exit(falhas === 0 ? 0 : 1);
  },
  (e) => {
    fs.rmSync(dir, { recursive: true, force: true });
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
);
