// O MOVIMENTO NA FOTO ANDA O SUFICIENTE PRA NÃO PARECER PARADO?
//
// 24/09/2026, ele: "acho que a opção aproximar está muito lenta, aumentar um pouco a
// velocidade". E logo depois: "todas as opções de fotos passear, subir, descer e etc, muito
// lentas". São todas a mesma constante -- nos passeios laterais o quanto a janela corre É o
// quanto se ampliou --, então é um número só que decide todos.
//
// A RÉGUA é a diferença entre quadros separados por 1 SEGUNDO. Não é detalhe: medindo quadro
// a quadro a 24 fps (que foi o que fiz três vezes antes de acertar), o que se mede é ruído de
// compressão, e o resultado chega a inverter.
//
// O ALVO sai do vídeo que ele tomou como referência, medido cena por cena:
//
//   as 6 cenas mais quietas (as de zoom)      16,4
//   as 3 mais agitadas (câmera de IA)         27,1
//
// O nosso zoom empata com as de ZOOM, não com as de IA -- são técnicas diferentes, e um zoom
// que tentasse alcançar 27 estaria voando na cara de quem assiste.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-velocidade-do-movimento.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegBin from "ffmpeg-static";
import { argsCenaFoto, argsCenaClipe, amplitudeDoZoom, quadrosDeMovimento } from "../src/lib/video-ffmpeg";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "encena-veloc-"));
const FOTO = path.resolve(process.cwd(), "..", "docs", "fotos-origem", "casa.jpg");
const L = 120;
const A = 213;
const PX = L * A;
/** Quantos quadros por segundo o medidor extrai. Comparar i com i-AMOSTRAS = 1 segundo. */
const AMOSTRAS = 4;

/**
 * O alvo medido no vídeo dele, e a faixa que conta como "empatou".
 *
 * A faixa é larga de propósito, e o motivo aparece na tabela que o teste imprime: o medidor
 * pesa mais um movimento que desloca o QUADRO INTEIRO (passeio lateral, de baixo pra cima) do
 * que um que ancora no centro (zoom). Com a mesma amplitude, o passeio vertical mede o dobro
 * do zoom -- e nenhum dos dois está errado.
 *
 * E POR ISSO OS SEIS NAO SAO NIVELADOS. Subir/descer mede 27,8 e aproximar mede 13,8 -- o
 * dobro --, e a tentacao e igualar. Mas medido em FRACAO DO QUADRO os dois ja sao iguais: o
 * zoom amplia 20% e o passeio percorre 20% da largura. A diferenca esta no medidor, que pesa
 * mais deslocar o quadro inteiro do que amplia-lo, e nivelar por ele deixaria o passeio
 * andando 7% da foto -- de volta ao "muito lento" de onde se partiu.
 *
 * Por isso o piso e o que vale como regra: nada pode ficar abaixo do que as cenas quietas da
 * referência andam. O teto existe só pra segurar o exagero -- 28 é o nível das cenas de IA
 * dela (27,1), que é o limite do que um vídeo de imóvel suporta sem enjoar.
 */
const ALVO = 16.4;
const MIN = 12;
const MAX = 28;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Quanto a cena se move por segundo. Mede no arquivo renderizado, não na fórmula. */
function movimento(efeito: "aproximar" | "afastar" | "esquerda" | "direita" | "cima" | "baixo", duracao: number): number {
  const video = path.join(TMP, `${efeito}-${duracao}.mp4`);
  execFileSync(
    String(ffmpegBin),
    ["-y", "-hide_banner", "-loglevel", "error", ...argsCenaFoto({ foto: FOTO, saida: video, W: 540, H: 960, duracao, efeito })],
    { maxBuffer: 1 << 26 }
  );
  const cru = path.join(TMP, `${efeito}-${duracao}.gray`);
  execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vf", `fps=${AMOSTRAS},scale=${L}:${A}`, "-pix_fmt", "gray", "-f", "rawvideo", cru]);
  const todo = fs.readFileSync(cru);
  const q: Buffer[] = [];
  for (let o = 0; o + PX <= todo.length; o += PX) q.push(todo.subarray(o, o + PX));
  const d: number[] = [];
  for (let i = AMOSTRAS; i < q.length; i++) {
    let s = 0;
    for (let k = 0; k < PX; k += 3) s += Math.abs(q[i][k] - q[i - AMOSTRAS][k]);
    d.push(s / (PX / 3));
  }
  if (d.length < 3) throw new Error(`poucos quadros pra medir ${efeito} (${q.length}) — a renderização está quebrada`);
  return d.reduce((a, b) => a + b, 0) / d.length;
}

function main() {
  if (!fs.existsSync(FOTO)) {
    console.log(`não achei a foto em ${FOTO}`);
    process.exit(1);
  }

  console.log(`alvo: ${ALVO} por segundo (as cenas de zoom do vídeo dele)\n`);
  const medidas: Record<string, number> = {};
  // TODOS os seis, e nao quatro com dois assumidos: ele perguntou "esse tempo esta em todas
  // as opcoes, cima baixo, passear?" e a resposta so vale se os seis forem medidos.
  for (const efeito of ["aproximar", "afastar", "esquerda", "direita", "cima", "baixo"] as const) {
    medidas[efeito] = movimento(efeito, 4);
    console.log(`   ${efeito.padEnd(10)} ${medidas[efeito].toFixed(1)}`);
  }
  console.log();

  // O zoom é o movimento mais usado (é o padrão de quase todo ambiente): é ele que decide se
  // o vídeo parece vivo ou parece apresentação de slides.
  conferir(medidas.aproximar >= MIN && medidas.aproximar <= MAX, "o “aproximar” anda como as cenas de zoom da referência", `${medidas.aproximar.toFixed(1)} (alvo ${ALVO})`);
  conferir(medidas.afastar >= MIN && medidas.afastar <= MAX, "o “afastar” também", `${medidas.afastar.toFixed(1)}`);

  // Os passeios laterais dependem da MESMA amplitude -- o quanto a janela corre é o quanto se
  // ampliou. Ele reclamou dos dois grupos junto, e é por isso: é um número só.
  for (const lado of ["esquerda", "direita", "cima", "baixo"] as const) {
    conferir(medidas[lado] >= MIN && medidas[lado] <= MAX, `o passeio “${lado}” anda junto`, `${medidas[lado].toFixed(1)}`);
  }
  // Os pares OPOSTOS tem que andar igual: esquerda e direita sao o mesmo movimento em sentidos
  // contrarios, e uma diferenca ali seria erro de conta, nao escolha.
  conferir(Math.abs(medidas.esquerda - medidas.direita) < 1.5, "esquerda e direita andam o mesmo", `${medidas.esquerda.toFixed(1)} e ${medidas.direita.toFixed(1)}`);
  conferir(Math.abs(medidas.cima - medidas.baixo) < 1.5, "e subir e descer também", `${medidas.cima.toFixed(1)} e ${medidas.baixo.toFixed(1)}`);

  // CONTROLE: com os 10% de antes o movimento ficava bem abaixo do alvo. Se este controle não
  // acusar, os testes acima não sabem reconhecer o defeito que dizem ter consertado.
  const amp4 = amplitudeDoZoom(quadrosDeMovimento(4) / 24);
  conferir(amp4 > 0.15, "controle: a amplitude subiu dos 10% antigos", `${(amp4 * 100).toFixed(1)}%`);

  // E o teto continua valendo: cena longa não pode virar um zoom que corta metade da foto.
  conferir(amplitudeDoZoom(quadrosDeMovimento(10) / 24) <= 0.32, "cena de 10 s ainda tem teto", `${(amplitudeDoZoom(quadrosDeMovimento(10) / 24) * 100).toFixed(1)}%`);

  // A velocidade continua IGUAL entre durações diferentes -- foi um conserto anterior e não
  // pode ter se perdido no aumento.
  const veloc = (d: number) => {
    const m = quadrosDeMovimento(d) / 24;
    return amplitudeDoZoom(m) / m;
  };
  const faixa = [3, 4, 5, 6].map(veloc);
  const dif = (Math.max(...faixa) - Math.min(...faixa)) / Math.max(...faixa);
  conferir(dif < 0.01, "cenas de 3 a 6 s continuam andando na MESMA velocidade", `${(dif * 100).toFixed(2)}% de diferença`);

  // ---- 7. O CLIPE DA IA GANHA MOVIMENTO POR CIMA ----
  //
  // A divisao que saiu de duas geracoes reais em 24/09/2026: a IA da a PARALAXE (pouca, mas
  // real, e sem inventar) e o ffmpeg da a DISTANCIA. Pedir distancia pro modelo fez ele
  // alucinar uma parede nova no meio do comodo -- o ffmpeg, por construcao, nao sabe inventar.
  //
  // Aqui o "clipe da IA" e simulado: uma cena de foto com movimento vira a entrada, que e um
  // clipe que JA se move. E o bastante pra testar o que importa: se o ffmpeg SOMA ou CANCELA.
  const clipeQueJaAnda = path.join(TMP, "clipe-que-anda.mp4");
  execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", ...argsCenaFoto({ foto: FOTO, saida: clipeQueJaAnda, W: 540, H: 960, duracao: 4, efeito: "aproximar" })], { maxBuffer: 1 << 26 });

  const doClipe = (efeito?: "aproximar" | "direita" | "afastar") => {
    const video = path.join(TMP, `clipe-${efeito ?? "sem"}.mp4`);
    execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", ...argsCenaClipe({ clipe: clipeQueJaAnda, saida: video, W: 540, H: 960, duracao: 4, efeito })], { maxBuffer: 1 << 26 });
    const cru = path.join(TMP, `clipe-${efeito ?? "sem"}.gray`);
    execFileSync(String(ffmpegBin), ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vf", `fps=${AMOSTRAS},scale=${L}:${A}`, "-pix_fmt", "gray", "-f", "rawvideo", cru]);
    const todo = fs.readFileSync(cru);
    const q: Buffer[] = [];
    for (let o = 0; o + PX <= todo.length; o += PX) q.push(todo.subarray(o, o + PX));
    const d: number[] = [];
    for (let i = AMOSTRAS; i < q.length; i++) {
      let s = 0;
      for (let k = 0; k < PX; k += 3) s += Math.abs(q[i][k] - q[i - AMOSTRAS][k]);
      d.push(s / (PX / 3));
    }
    return d.reduce((a, b) => a + b, 0) / d.length;
  };

  const semNada = doClipe();
  const comLateral = doClipe("direita");
  const comAfastar = doClipe("afastar");
  console.log(`
   clipe sozinho ${semNada.toFixed(1)} · com passeio lateral ${comLateral.toFixed(1)} · com afastar ${comAfastar.toFixed(1)}`);
  conferir(comLateral > semNada * 1.2, "o passeio lateral SOMA ao movimento que o clipe ja tem", `${semNada.toFixed(1)} -> ${comLateral.toFixed(1)}`);
  // CONTROLE do conserto: no clipe da IA, `afastar` derrubava o total de 16,7 pra 8,1, porque
  // a janela abrindo cancela a camera avancando. `efeitoNoClipe` o traduz pra passeio lateral.
  conferir(Math.abs(comAfastar - comLateral) < 0.5, "e afastar vira passeio lateral, que somava, em vez de cancelar", `${comAfastar.toFixed(1)} contra ${comLateral.toFixed(1)}`);

  console.log(`\narquivos em ${TMP}`);
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
}

main();
