// AS PEÇAS DE EDIÇÃO DA LINHA DO TEMPO no navegador (docs/planos/linha-do-tempo-spec.md, P6).
//
//   1. Retrato dos quatro componentes que já existem (Você no palco, galeria de texto,
//      galeria de elementos, peças no palco) com as propriedades que o editor passa HOJE:
//      o HTML tem que ser o MESMO antes e depois de ganharem as propriedades novas.
//      `--gravar-antes` grava o retrato (uma vez, antes de mexer; recusa sobrescrever).
//   2. As peças novas a 375px: barra da seleção (botões com 44 de altura e 56+ de largura,
//      sem sobrepor, rola de lado com o ✕ fixo), campo da sub-barra em 16px (o iOS não dá
//      zoom), aviso acima da linha do tempo sem cobrir, linhas da lista com 44px; Você só
//      dentro da janela dele e no tempo do relógio (±0,15s); animação da galeria no texto
//      certo (`indiceAlvo`).
//
//   node scripts/conferir-barra-no-navegador.mjs [--porta 3000] [--gravar-antes]
//
// Precisa do servidor de desenvolvimento. Não toca banco, storage nem IA.

import fs from "node:fs";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const args = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const PORTA = Number(valor("--porta", "3000"));
const BASE = `http://localhost:${PORTA}/dev/barra-da-selecao`;
const RETRATO = path.join(import.meta.dirname, "fixtures", "dom-antigos-p6.json");

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra !== "" ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const ANTIGOS = ["elementos-no-palco", "apresentador-no-palco", "galeria-texto", "galeria-elementos"];

const c = await abrirChrome({ prefixo: "encena-barra-" });
async function retrato() {
  await c.abrir(`${BASE}?parte=antigos`, { largura: 375, altura: 812, celular: true, pronto: "!!document.querySelector('[data-antigo=galeria-elementos] button')" });
  await esperar(800);
  return c.avaliar(`Object.fromEntries(${JSON.stringify(ANTIGOS)}.map(n => [n, document.querySelector('[data-antigo="' + n + '"]').innerHTML]))`);
}

/**
 * O retrato só vale quando se repete: a primeira carga depois de compilar (servidor de
 * desenvolvimento) já saiu diferente da segunda. Captura até duas seguidas darem iguais.
 */
async function retratoEstavel() {
  let anterior = await retrato();
  for (let i = 0; i < 4; i++) {
    const atual = await retrato();
    if (ANTIGOS.every((n) => anterior[n] === atual[n])) return { r: atual, estavel: true, tentativas: i + 2 };
    anterior = atual;
  }
  return { r: anterior, estavel: false, tentativas: 5 };
}

try {
  if (args.includes("--gravar-antes")) {
    if (fs.existsSync(RETRATO)) throw new Error(`${RETRATO} já existe: o retrato de ANTES não se regrava.`);
    const { r: a, estavel, tentativas } = await retratoEstavel();
    conferir(estavel, "o retrato é estável (duas capturas seguidas do mesmo código dão o mesmo HTML)", `${tentativas} capturas · ` + ANTIGOS.map((n) => `${n} ${a[n].length}`).join(" · "));
    if (estavel) {
      fs.mkdirSync(path.dirname(RETRATO), { recursive: true });
      fs.writeFileSync(RETRATO, JSON.stringify(a, null, 1));
      console.log(`gravado ${RETRATO}`);
    }
  } else {
    const antes = JSON.parse(fs.readFileSync(RETRATO, "utf8"));
    const { r: agora, estavel } = await retratoEstavel();
    conferir(estavel, "o retrato de agora é estável");
    for (const n of ANTIGOS) {
      const igual = antes[n] === agora[n];
      let onde = "";
      if (!igual) {
        let i = 0;
        while (i < antes[n].length && antes[n][i] === agora[n][i]) i++;
        onde = `primeira diferença no caractere ${i}: antes «${antes[n].slice(Math.max(0, i - 40), i + 60)}» agora «${agora[n].slice(Math.max(0, i - 40), i + 60)}»`;
      }
      conferir(igual, `${n} com as propriedades de hoje: HTML igual ao de antes do P6`, onde);
    }
    if (process.env.SO_RETRATO !== "1") await import("./conferir-barra-novos.mjs").then((m) => m.conferirNovos(c, BASE, conferir));
  }
} catch (e) {
  console.log("FALHA", e instanceof Error ? e.message : e);
  falhas++;
} finally {
  c.fechar();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
