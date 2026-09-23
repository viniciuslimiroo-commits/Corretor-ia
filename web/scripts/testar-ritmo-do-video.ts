// O VÍDEO SE MOVE NO MESMO RITMO DO COMEÇO AO FIM?
//
// 23/09/2026. Ele mandou um vídeo do concorrente feito com as mesmas fotos e disse que a
// movimentação era melhor. Medindo os dois quadro a quadro, achei duas coisas:
//
//   1. o dele fica entre 0,001 e 0,006 do começo ao fim; o nosso pulava de 0,000 a 0,013,
//      porque a amplitude do zoom era FIXA (10%) e a duração da cena, variável -- a cena de
//      5 s andava os mesmos 10% em mais tempo, ou seja, 27% mais devagar que a de 4 s;
//   2. os últimos 4 segundos do nosso davam 0,000: a tela final congelava.
//
// Este teste renderiza de verdade e mede o pixel. As duas afirmações acima são o CONTROLE:
// se a conta antiga não for medida como desigual, o teste não sabe reconhecer o defeito que
// diz ter consertado.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-ritmo-do-video.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegBin from "ffmpeg-static";
import { argsTelaFinal, amplitudeDoZoom, quadrosDeMovimento } from "../src/lib/video-ffmpeg";
import { relogioDoVideo, emendasDoVideo, TRANSICAO_POR_ID } from "../src/lib/video";

const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), "encena-ritmo-"));
const FOTO = path.resolve(process.cwd(), "..", "docs", "fotos-origem", "casa.jpg");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function correr(args: string[]) {
  execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 1 << 26 });
}

/** Quanto o quadro muda em relação ao anterior, quadro a quadro. É a régua do movimento. */
function movimento(video: string): number[] {
  const saida = execFileSync(
    String(ffmpegBin),
    ["-hide_banner", "-i", video, "-vf", "select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-", "-an", "-f", "null", "-"],
    { encoding: "buffer", maxBuffer: 1 << 28 }
  ).toString();
  return [...saida.matchAll(/scene_score=([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

async function main() {
  if (!fs.existsSync(FOTO)) {
    console.log(`não achei a foto em ${FOTO}`);
    process.exit(1);
  }
  const W = 1080;
  const H = 1920;

  // ---- 1. cenas de durações diferentes andam na MESMA velocidade ----
  //
  // Medido na FÓRMULA, não no vídeo renderizado, e por um motivo que custou duas rodadas:
  // o `scene_score` do ffmpeg mistura a VELOCIDADE do movimento com o NÍVEL de ampliação --
  // a cena de 7 s chega a z=1,16 e a de 3 s a z=1,07, e o quadro mais ampliado difere mais
  // do anterior mesmo andando devagar. O medidor acusava 30% de diferença onde a velocidade
  // era a mesma. Aqui a régua é a conta: amplitude dividida pelo tempo de movimento.
  const velocidade = (duracao: number) => {
    const m = quadrosDeMovimento(duracao) / 24;
    return amplitudeDoZoom(m) / m;
  };
  // A faixa SEM trava vai de ~2,6 s a ~6,1 s. É onde vive quase toda cena (o padrão é 4 s), e
  // é onde a velocidade tem que ser idêntica.
  const faixa = [3, 4, 5, 6];
  const semTrava = faixa.map((d) => velocidade(d));
  const vMax = Math.max(...semTrava);
  const vMin = Math.min(...semTrava);
  console.log(`   velocidade por cena: ${[2, 3, 4, 5, 6, 10].map((d) => `${d}s=${(velocidade(d) * 100).toFixed(2)}%/s`).join("  ")}`);
  conferir((vMax - vMin) / vMax < 0.01, "cenas de 3 a 6 s andam na MESMA velocidade", `${(((vMax - vMin) / vMax) * 100).toFixed(2)}% de diferença`);

  // As DUAS travas existem de propósito, e cada uma tem o seu motivo:
  conferir(velocidade(10) < velocidade(4), "cena muito longa anda mais devagar (teto): sem ele, 10 s viraria um zoom de 28%", `${(velocidade(10) * 100).toFixed(2)}%/s contra ${(velocidade(4) * 100).toFixed(2)}%/s`);
  conferir(velocidade(2) > velocidade(4), "cena muito curta anda mais rápido (piso): 4% de zoom em 2 s é quase parado", `${(velocidade(2) * 100).toFixed(2)}%/s contra ${(velocidade(4) * 100).toFixed(2)}%/s`);
  conferir(amplitudeDoZoom(quadrosDeMovimento(10) / 24) <= 0.16, "e o zoom nunca passa de 16% do quadro");

  // A cena padrão de 4 s NÃO pode ter mudado: quem já gostava do ritmo dela não deve notar.
  const amp4 = amplitudeDoZoom(quadrosDeMovimento(4) / 24);
  conferir(Math.abs(amp4 - 0.1) < 0.005, "e a cena padrão de 4 s continua com os mesmos 10% de antes", `${(amp4 * 100).toFixed(1)}%`);

  // CONTROLE: com a amplitude FIXA de antes, 4 s e 7 s andavam bem diferente. Se este
  // controle não acusar, o teste acima não sabe reconhecer o defeito que diz ter consertado.
  const velhaRapida = 0.1 / (quadrosDeMovimento(4) / 24);
  const velhaLenta = 0.1 / (quadrosDeMovimento(7) / 24);
  conferir(
    (velhaRapida - velhaLenta) / velhaRapida > 0.3,
    "controle: com a amplitude fixa de antes, 4 s e 7 s andavam bem diferente",
    `${(velhaRapida * 100).toFixed(1)}%/s contra ${(velhaLenta * 100).toFixed(1)}%/s`
  );

  // ---- 1b. o RELÓGIO bate com o do vídeo que ele tomou como referência ----
  //
  // Medido no arquivo dele em 23/09/2026, quadro a quadro (a régua é a diferença contra o
  // quadro de 1 s antes, porque a transição é suave demais pra aparecer entre vizinhos):
  //
  //   10 fotos · 37,33 s · cortes em 4,1 · 7,5 · 11,3 · 15,0 · 19,0 · 22,5 · 26,2 · 30,0 · 33,7
  //   ou seja ~3,7 s por cena, sem nenhuma segurando mais, e a troca dura 7 quadros = 0,29 s.
  //
  // Ele: "quero que fique parecido... em todos os sentidos, tempo de vídeo, cortes pra outra
  // foto, achei aquele ideal". Isto trava esses dois números.
  const REF_TOTAL = 37.33;
  const REF_TRANSICAO = 0.29;
  const dissolver = TRANSICAO_POR_ID.dissolver;
  conferir(Math.abs(dissolver.segundos - REF_TRANSICAO) < 0.1, "a troca de foto dura o mesmo que a da referência", `${dissolver.segundos}s contra ${REF_TRANSICAO}s`);

  const dezCenas = Array.from({ length: 10 }, () => ({ tipo: "animada" as const, duracao: 4 }));
  const relogio = relogioDoVideo(
    dezCenas.map((c) => c.duracao),
    emendasDoVideo({ cenas: dezCenas as never, transicao: "dissolver", telaFinal: null })
  );
  conferir(Math.abs(relogio.total - REF_TOTAL) < 1, "10 fotos no estilo Tour dão o mesmo tempo TOTAL da referência", `${relogio.total.toFixed(2)}s contra ${REF_TOTAL}s`);

  // E cada cena tem o mesmo tempo: na referência nenhuma segura mais que a outra, nem a capa.
  const tempos = relogio.clipes.map((c, i) => (i === 0 ? c.fim : c.fim - relogio.clipes[i - 1].fim));
  const iguais = Math.max(...tempos.slice(1)) - Math.min(...tempos.slice(1));
  conferir(iguais < 0.05, "e todas as cenas duram igual — inclusive a primeira", `variação de ${iguais.toFixed(3)}s`);

  // CONTROLE: com a transição de 0,6 s de antes, o mesmo vídeo ficava quase 3 s mais curto
  // do que a referência, e cada passagem demorava o dobro pra entregar a foto nova.
  const comAntiga = 10 * 4 - 9 * 0.6;
  conferir(Math.abs(comAntiga - REF_TOTAL) > Math.abs(relogio.total - REF_TOTAL), "controle: com a transição antiga de 0,6 s o total ficava mais longe da referência", `${comAntiga.toFixed(2)}s contra ${relogio.total.toFixed(2)}s`);

  // ---- 2. a tela final não pode mais congelar ----
  const final = path.join(SAIDA, "final.mp4");
  correr(
    argsTelaFinal({
      saida: final,
      W,
      H,
      duracao: 4,
      cor: "#0F2D5B",
      chamada: "Agende sua visita",
      nome: "Vinicius Cardoso · Imobiliária J7",
      creci: "XX 00000-F",
      whatsapp: "62994397125",
    })
  );
  const vf = movimento(final);
  const parados = vf.filter((x) => x === 0).length;
  console.log(`   tela final: ${vf.length} quadros medidos, média ${media(vf).toFixed(4)}, ${parados} parados`);
  conferir(media(vf) > 0.0005, "a tela final se move (não congela mais)", `média ${media(vf).toFixed(4)}`);
  conferir(parados / Math.max(1, vf.length) < 0.25, "e a maior parte dos quadros tem movimento", `${parados} de ${vf.length} parados`);
  // Discreto: movimento demais na tela de contato tira a leitura do WhatsApp.
  conferir(media(vf) < 0.01, "mas discreto — dá pra ler o telefone", `média ${media(vf).toFixed(4)}`);

  console.log(`\narquivos em ${SAIDA}`);
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
}

main();
