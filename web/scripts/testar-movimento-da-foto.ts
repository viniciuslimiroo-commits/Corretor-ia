// A JANELINHA MOSTRA O MESMO MOVIMENTO QUE O VÍDEO FAZ?
//
// A demonstração ao passar o mouse (pedido dele em 10/10/2026) só vale se o que ela mostra
// for o que sai no vídeo. Como ela anima por CSS e o vídeo anima por `zoompan`, são duas
// linguagens pra uma conta só -- e duas linguagens é onde elas divergem calada.
//
// Por isso a conta mora em `movimento-da-foto.ts` e aqui se prova que os quadros-chave da
// animação RECOLOCAM a mesma janela que `janelaDaFoto` descreve, que é a mesma que o
// `zoompan` escreve. A volta é por inversão: de `scale(z) translate(u)` se extrai de novo
// onde a janela começa, e compara.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-movimento-da-foto.ts

import {
  amplitudeDoZoom,
  andamentoSuave,
  janelaDaFoto,
  quadrosChaveDaFoto,
  segundosDeMovimento,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/lib/movimento-da-foto.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const perto = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

/** De `scale(z) translateX(u%)` de volta pra z e pra borda da janela, em fração da foto. */
function lerQuadro(q: Keyframe): { z: number; inicio: number; eixo: "x" | "y" | null } {
  const t = String(q.transform ?? "");
  const z = Number(/scale\(([-0-9.]+)\)/.exec(t)?.[1] ?? NaN);
  const mx = /translateX\(([-0-9.]+)%\)/.exec(t);
  const my = /translateY\(([-0-9.]+)%\)/.exec(t);
  const eixo = mx ? ("x" as const) : my ? ("y" as const) : null;
  const u = Number((mx ?? my)?.[1] ?? 0) / 100;
  // A ida é u = 1/2 − inicio − 1/(2z); a volta é esta.
  return { z, inicio: eixo ? 0.5 - u - 1 / (2 * z) : 0, eixo };
}

function main() {
  // ---- a amplitude respeita piso e teto ----
  conferir(perto(amplitudeDoZoom(0.5), ZOOM_MIN), "cena curtíssima não fica parada: amplitude no piso", `${amplitudeDoZoom(0.5)}`);
  conferir(perto(amplitudeDoZoom(30), ZOOM_MAX), "cena longa não vira zoom absurdo: amplitude no teto", `${amplitudeDoZoom(30)}`);
  const a4 = amplitudeDoZoom(segundosDeMovimento(4));
  const a8 = amplitudeDoZoom(segundosDeMovimento(8));
  conferir(a8 > a4, "cena mais longa anda MAIS (mesma velocidade, não mesma distância)", `4s→${a4.toFixed(3)} · 8s→${a8.toFixed(3)}`);

  // ---- a curva em S: começa e termina devagar ----
  conferir(andamentoSuave(0) === 0 && perto(andamentoSuave(1), 1), "o andamento vai de 0 a 1");
  conferir(perto(andamentoSuave(0.5), 0.5), "e é simétrico no meio");
  const arranque = andamentoSuave(0.1) - andamentoSuave(0);
  const miolo = andamentoSuave(0.55) - andamentoSuave(0.45);
  conferir(miolo > arranque * 2, "o miolo anda bem mais que o arranque (não é linear)", `${arranque.toFixed(4)} vs ${miolo.toFixed(4)}`);

  // ---- O ESSENCIAL: a animação recoloca a janela que a receita descreve ----
  for (const efeito of ["aproximar", "afastar", "esquerda", "direita", "cima", "baixo"] as const) {
    const duracao = 4;
    const quadros = quadrosChaveDaFoto(efeito, duracao, 20);
    const mov = segundosDeMovimento(duracao);
    const amplitude = amplitudeDoZoom(mov);
    const fatia = mov / duracao;
    let pior = 0;
    for (const q of quadros) {
      const p = andamentoSuave((q.offset as number) / fatia);
      const esperado = janelaDaFoto(efeito, amplitude, p);
      const lido = lerQuadro(q);
      pior = Math.max(pior, Math.abs(lido.z - esperado.z), Math.abs(lido.inicio - esperado.inicio));
    }
    conferir(pior < 2e-3, `“${efeito}”: a animação põe a janela onde a receita manda`, `pior erro ${pior.toExponential(1)} da foto`);
  }

  // ---- cada efeito faz o que o nome diz ----
  {
    const q = quadrosChaveDaFoto("aproximar", 4, 10).map(lerQuadro);
    conferir(perto(q[0].z, 1) && q[q.length - 1].z > 1, "“aproximar” começa no tamanho da foto e cresce", `${q[0].z} → ${q[q.length - 1].z}`);
    conferir(q.every((x) => x.eixo === null), "e não desliza pro lado");
  }
  {
    const q = quadrosChaveDaFoto("afastar", 4, 10).map(lerQuadro);
    conferir(q[0].z > q[q.length - 1].z && perto(q[q.length - 1].z, 1), "“afastar” começa perto e abre até a foto inteira", `${q[0].z} → ${q[q.length - 1].z}`);
  }
  {
    const dir = quadrosChaveDaFoto("direita", 4, 10).map(lerQuadro);
    const esq = quadrosChaveDaFoto("esquerda", 4, 10).map(lerQuadro);
    conferir(dir.every((x) => perto(x.z, dir[0].z)), "“direita” mantém o zoom parado: só a janela corre");
    conferir(dir[dir.length - 1].inicio > dir[0].inicio, "“direita” vai do começo da foto pro fim");
    conferir(esq[esq.length - 1].inicio < esq[0].inicio, "“esquerda” vai no sentido contrário");
    conferir(perto(dir[0].inicio, esq[esq.length - 1].inicio) && perto(dir[dir.length - 1].inicio, esq[0].inicio), "e os dois percorrem exatamente o mesmo trecho");
  }
  {
    const q = quadrosChaveDaFoto("cima", 4, 10).map(lerQuadro);
    conferir(q.every((x) => x.eixo === "y"), "“cima” anda no eixo vertical, não no horizontal");
  }
  {
    const q = quadrosChaveDaFoto("parado", 4, 10).map(lerQuadro);
    conferir(q.every((x) => perto(x.z, 1) && x.eixo === null), "“parado” não mexe em nada");
  }

  // ---- a janela NUNCA sai da foto (o que apareceria como borda preta) ----
  for (const efeito of ["esquerda", "direita", "cima", "baixo", "aproximar", "afastar"] as const) {
    const q = quadrosChaveDaFoto(efeito, 8, 30).map(lerQuadro);
    const fora = q.filter((x) => x.inicio < -1e-6 || x.inicio + 1 / x.z > 1 + 1e-6 || x.z < 1 - 1e-6);
    conferir(fora.length === 0, `“${efeito}”: a janela não passa da borda da foto em nenhum instante`, fora.length ? `${fora.length} de ${q.length} quadros` : "");
  }

  // ---- O POUSO: o movimento termina ANTES do fim e a imagem fica quieta ----
  {
    const duracao = 4;
    const q = quadrosChaveDaFoto("direita", duracao, 40).map(lerQuadro);
    const fim = q[q.length - 1].inicio;
    const fatia = segundosDeMovimento(duracao) / duracao;
    const noPouso = q.slice(Math.ceil(fatia * 40));
    conferir(noPouso.length > 1, "há quadros depois do pouso pra conferir", `${noPouso.length}`);
    conferir(noPouso.every((x) => perto(x.inicio, fim, 1e-6)), "depois do pouso a imagem fica PARADA até o corte", `${noPouso.length} quadros iguais no fim`);
  }

  // ---- duração mínima não estoura a conta ----
  {
    const q = quadrosChaveDaFoto("direita", 0.2, 6);
    conferir(q.length === 7 && q.every((x) => Number.isFinite(lerQuadro(x).z)), "cena muito curta ainda gera quadros válidos");
  }
}

main();
console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
