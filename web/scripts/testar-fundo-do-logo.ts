// TIRAR O FUNDO DO LOGO (lib/fundo-do-logo.ts), pra ele virar marca d'água de verdade.
//
// Ele subiu o logo da imobiliária em 10/10/2026 -- dourado sobre fundo escuro, quadrado,
// sem transparência -- e a marca d'água saiu como um selo retangular por cima do imóvel.
// Perguntou: "não pode ter opção de você transformar no SaaS a logo em marca d'água?".
//
// O que importa travar aqui não é "funciona no caso bom": é que a regra RECUSA quando não
// dá. Oferecer e entregar um buraco no meio da letra é pior que não oferecer, e é o jeito
// fácil de um recurso assim nascer errado.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-fundo-do-logo.ts

import sharp from "sharp";
import { fundoDosCantos, valeTirarFundo, tirarFundo, distancia } from "../src/lib/fundo-do-logo.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Monta um logo de teste: fundo da cor pedida, com um quadrado de desenho no meio. */
async function logo(opcoes: { fundo: [number, number, number]; desenho: [number, number, number]; lado?: number; degrade?: boolean; alfa?: boolean }) {
  const L = opcoes.lado ?? 200;
  const base = Buffer.alloc(L * L * 4);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const i = (y * L + x) * 4;
      // Degradê vertical: é o caso do logo dele, e o que faz os quatro cantos discordarem.
      const f = opcoes.degrade ? 1 - (y / L) * 0.8 : 1;
      const dentro = x > L * 0.3 && x < L * 0.7 && y > L * 0.35 && y < L * 0.65;
      const c = dentro ? opcoes.desenho : (opcoes.fundo.map((v) => Math.round(v * f)) as [number, number, number]);
      base[i] = c[0];
      base[i + 1] = c[1];
      base[i + 2] = c[2];
      base[i + 3] = opcoes.alfa && !dentro ? 0 : 255;
    }
  }
  const png = await sharp(base, { raw: { width: L, height: L, channels: 4 } }).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transp = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < 40) transp++;
  return { data, info, jaTransparente: transp / (info.width * info.height) };
}

async function main() {
  // ---- o caso que o pedido descreve: desenho claro sobre fundo escuro chapado ----
  {
    const l = await logo({ fundo: [20, 24, 32], desenho: [212, 175, 55] });
    const { cor, desvio } = fundoDosCantos(l.data, l.info.width, l.info.height, l.info.channels);
    conferir(distancia(cor, [20, 24, 32]) < 6, "lê a cor do fundo dos cantos", `rgb(${cor.join(",")})`);
    conferir(desvio < 5, "fundo chapado: os cantos concordam", desvio.toFixed(1));
    const v = valeTirarFundo(l.data, l.info.width, l.info.height, l.info.channels, l.jaTransparente);
    conferir(v.vale, "e a regra diz que VALE tirar", v.vale ? `tolerância ${v.tolerancia}, fundo ${Math.round(v.fracao * 100)}%` : v.motivo);

    if (v.vale) {
      const limpo = tirarFundo(l.data, l.info.channels, v.cor, v.tolerancia);
      // O que importa: o FUNDO sumiu e o DESENHO ficou. Contar só "quantos viraram
      // transparentes" não separa as duas coisas.
      const emCima = (x: number, y: number) => limpo[(y * l.info.width + x) * l.info.channels + 3];
      conferir(emCima(3, 3) === 0, "o canto virou transparente");
      conferir(emCima(l.info.width - 4, l.info.height - 4) === 0, "o canto oposto também");
      conferir(emCima(Math.round(l.info.width / 2), Math.round(l.info.height / 2)) === 255, "e o DESENHO continua opaco", "é isto que separa limpar de apagar");
    }
  }

  // ---- degradê: o caso real dele, que quase reprova ----
  {
    const l = await logo({ fundo: [60, 68, 86], desenho: [212, 175, 55], degrade: true });
    const { desvio } = fundoDosCantos(l.data, l.info.width, l.info.height, l.info.channels);
    conferir(desvio > 20, "degradê: os cantos DISCORDAM, como no logo real", desvio.toFixed(1));
    const v = valeTirarFundo(l.data, l.info.width, l.info.height, l.info.channels, l.jaTransparente);
    conferir(v.vale, "mesmo assim vale, porque a tolerância cresce com o desvio", v.vale ? `tolerância ${v.tolerancia}` : v.motivo);
    if (v.vale) {
      const limpo = tirarFundo(l.data, l.info.channels, v.cor, v.tolerancia);
      const meio = limpo[(Math.round(l.info.height / 2) * l.info.width + Math.round(l.info.width / 2)) * l.info.channels + 3];
      conferir(meio === 255, "e o desenho sobrevive ao degradê");
    }
  }

  // ---- os casos em que tem que RECUSAR ----
  {
    const jaLimpo = await logo({ fundo: [20, 24, 32], desenho: [212, 175, 55], alfa: true });
    const v1 = valeTirarFundo(jaLimpo.data, jaLimpo.info.width, jaLimpo.info.height, jaLimpo.info.channels, jaLimpo.jaTransparente);
    conferir(!v1.vale, "RECUSA logo que já tem fundo transparente", v1.vale ? "aceitou" : v1.motivo);

    // Fundo quase da cor do desenho: tirar comeria a letra.
    const quaseIgual = await logo({ fundo: [200, 170, 60], desenho: [212, 175, 55] });
    const v2 = valeTirarFundo(quaseIgual.data, quaseIgual.info.width, quaseIgual.info.height, quaseIgual.info.channels, quaseIgual.jaTransparente);
    conferir(!v2.vale, "RECUSA quando fundo e desenho têm quase a mesma cor", v2.vale ? "ACEITOU — comeria a letra" : v2.motivo);

    // Cantos muito diferentes entre si: não é fundo, é imagem.
    const foto = Buffer.alloc(200 * 200 * 4);
    for (let i = 0; i < foto.length; i += 4) {
      const p = i / 4;
      foto[i] = (p % 200) * 1.2;
      foto[i + 1] = Math.floor(p / 200);
      foto[i + 2] = 200 - Math.floor(p / 200);
      foto[i + 3] = 255;
    }
    const v3 = valeTirarFundo(foto, 200, 200, 4, 0);
    conferir(!v3.vale, "RECUSA quando os cantos são imagem, não fundo", v3.vale ? "aceitou" : v3.motivo);
  }

  // ---- a borda: sem meio-tom o logo fica serrilhado ----
  {
    // Um CÍRCULO desenhado em SVG, não o quadrado dos casos acima: quadrado tem borda dura
    // e todo pixel dele é exatamente fundo ou exatamente desenho, então não existe meio-tom
    // pra medir -- o teste reprovaria por falta de caso, não por falta de código. Logo real
    // tem borda suavizada, e é esse o caso que a faixa de meio-tom existe pra atender.
    const svg = Buffer.from(
      `<svg width="200" height="200"><rect width="200" height="200" fill="rgb(20,24,32)"/><circle cx="100" cy="100" r="55" fill="rgb(212,175,55)"/></svg>`
    );
    const png = await sharp(svg).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const l = { data, info, jaTransparente: 0 };
    const v = valeTirarFundo(l.data, l.info.width, l.info.height, l.info.channels, l.jaTransparente);
    if (v.vale) {
      const limpo = tirarFundo(l.data, l.info.channels, v.cor, v.tolerancia);
      let meios = 0;
      for (let i = 3; i < limpo.length; i += l.info.channels) if (limpo[i] > 10 && limpo[i] < 245) meios++;
      conferir(meios > 0, "existe faixa de MEIO-TOM na borda", `${meios} px — sem ela o recorte sai serrilhado`);
    }
  }
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
