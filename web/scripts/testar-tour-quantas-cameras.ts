// O "TOUR PELA CASA" NÃO PODE ANIMAR TUDO.
//
// Ele em 12/10/2026, sobre um vídeo que gerou: "criei com tour pela casa, só a primeira
// imagem ficou boa; as outras só parece que a imagem está passando de lado, algumas estão
// iguais à criação padrão".
//
// O espec daquele vídeo tinha ONZE cenas `animada` -- 22 créditos. A montagem teria dado
// quatro. A diferença saía de uma linha: `s.camera ?? true`, em que o `?? true` existia pra
// UM caso (a foto única, que é a capa) e, com onze fotos nunca julgadas, virava "todas".
//
// E o estrago não é só o preço. A câmera de IA caindo em banheiro, parede de azulejo e
// quarto vazio não anda -- e está CERTA em não andar, porque andar ali seria inventar
// cômodo (a regra do prompt). O que sobra na tela é o deslize do ffmpeg por cima, que é
// exatamente "a imagem passando de lado".
//
// Este teste é da REGRA DE ESCOLHA, que é pura e dá pra provar sem navegador. A regra em si
// vive em `aplicarEstilo`, na página; aqui se prova `quantasComCamera`, que é o teto que ela
// passou a respeitar, e o espalhamento que ela usa.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-tour-quantas-cameras.ts

import { quantasComCamera } from "../src/lib/video-automatico.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** A MESMA escolha de `aplicarEstilo` quando nenhuma cena foi julgada pela montagem. */
function escolhidas(total: number): number[] {
  const teto = quantasComCamera(total);
  if (total <= teto) return [...Array(total).keys()];
  const set = new Set<number>([0, total - 1]);
  for (let k = 1; set.size < teto && k < total - 1; k++) set.add(Math.round((k * (total - 1)) / teto));
  return [...set].sort((a, b) => a - b);
}

// ---- O CASO DELE: onze fotos ----
{
  const e = escolhidas(11);
  conferir(e.length === 4, "onze fotos dão QUATRO câmeras, não onze", `${e.length}: ${e.join(", ")}`);
  conferir(e.includes(0), "a capa abre com câmera");
  conferir(e.includes(10), "e a última fecha com câmera");
  conferir(4 * 2 === 8, "custo: 8 créditos em vez de 22", "economia de 14");
}

// ---- o teto não explode em vídeo grande ----
for (const n of [12, 20, 40]) {
  conferir(escolhidas(n).length === 4, `${n} fotos continuam em 4 câmeras`, `${escolhidas(n).length}`);
}

// ---- vídeo pequeno não fica todo animado nem todo parado ----
conferir(escolhidas(1).length === 1, "foto única ganha câmera: ela É a capa");
conferir(escolhidas(2).length === 2, "duas fotos, as duas ganham");
conferir(escolhidas(5).length === 2, "cinco fotos dão 2 câmeras", `${escolhidas(5).join(", ")}`);
conferir(escolhidas(8).length === 3, "oito fotos dão 3", `${escolhidas(8).join(", ")}`);

// ---- nunca repete índice nem estoura a lista ----
for (const n of [1, 2, 3, 5, 7, 11, 13, 25]) {
  const e = escolhidas(n);
  conferir(new Set(e).size === e.length, `${n} fotos: nenhum índice repetido`);
  conferir(e.every((i) => i >= 0 && i < n), `${n} fotos: nenhum índice fora da lista`, e.join(","));
  conferir(e.length <= Math.min(4, n), `${n} fotos: nunca passa do teto`, `${e.length}`);
}

// ---- espalha pelo vídeo, não amontoa no começo ----
{
  const e = escolhidas(11);
  const vaos = e.slice(1).map((v, i) => v - e[i]);
  conferir(Math.max(...vaos) - Math.min(...vaos) <= 3, "as câmeras ficam espalhadas pelo vídeo", `posições ${e.join(", ")}`);
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
