// AS FAIXAS QUE SAÍRAM DA ESCOLHA CONTINUAM EXISTINDO.
//
// Ele ouviu e pediu em 24/09/2026: "essas músicas acho muito ruins, queria tirar calmo,
// sereno e minimal".
//
// Apagar da lista seria o caminho curto e errado, e este teste existe pra travar isso: 15 dos
// 20 vídeos dele apontam pra "calma", e um espec com música inexistente não dá erro -- sai
// MUDO. O corretor reabriria um vídeo antigo, mandaria gerar de novo e receberia um vídeo sem
// trilha, sem nada na tela explicando por quê.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-musicas.ts

import { MUSICAS, MUSICA_PADRAO, musicasOferecidas } from "../src/lib/video";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const APOSENTADAS = ["calma", "sereno", "minimal"];
const oferecidas = musicasOferecidas().map((m) => m.id);
const todas = MUSICAS.map((m) => m.id);

// ---- 1. saíram da escolha ----
for (const id of APOSENTADAS) {
  conferir(!oferecidas.includes(id as never), `“${id}” não aparece mais pra escolher`);
}

// ---- 2. mas continuam existindo, com arquivo ----
//
// É o ponto todo. Sem isto, os 15 vídeos que apontam pra "calma" sairiam mudos ao serem
// gerados de novo -- e gerar de novo é barato desde que os clipes ficam guardados, então
// acontece.
for (const id of APOSENTADAS) {
  const faixa = MUSICAS.find((m) => m.id === id);
  conferir(!!faixa, `“${id}” continua no catálogo, pros vídeos antigos`);
  conferir(!!faixa?.arquivo, `e continua com arquivo, senão sairia mudo`, faixa?.arquivo ?? "sem arquivo");
}

// ---- 3. o padrão não pode ser uma aposentada ----
//
// Este é o erro que se repete: aposenta a faixa, esquece que ela era o padrão, e todo vídeo
// novo nasce apontando pra algo que ninguém pode escolher.
conferir(!APOSENTADAS.includes(MUSICA_PADRAO), "o padrão não é uma faixa aposentada", MUSICA_PADRAO);
conferir(oferecidas.includes(MUSICA_PADRAO), "e está entre as que dá pra escolher");
// O tipo de MUSICA_PADRAO já exclui "nenhuma", então o teste seria comparação morta.
conferir(!!MUSICAS.find((m) => m.id === MUSICA_PADRAO)?.arquivo, "e tem arquivo: padrão sem arquivo sai mudo");

// ---- 4. sobrou música suficiente ----
conferir(oferecidas.length >= 10, "ainda há pelo menos dez opções", `${oferecidas.length} de ${todas.length}`);
// Cada categoria tem que ter sobrado alguma: a tela do editor agrupa por categoria, e uma
// categoria vazia vira uma aba que não mostra nada.
const categorias = [...new Set(MUSICAS.map((m) => m.categoria).filter(Boolean))];
for (const c of categorias) {
  const quantas = musicasOferecidas().filter((m) => m.categoria === c).length;
  conferir(quantas > 0, `a categoria “${c}” não ficou vazia`, `${quantas} faixa(s)`);
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
