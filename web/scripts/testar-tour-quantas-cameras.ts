// QUANTAS CENAS GANHAM A CÂMERA DE IA -- e por que o TOUR não usa este teto.
//
// Esta regra existe pra MONTAGEM AUTOMÁTICA, que mistura de propósito: "pegaram as imagens
// mais importantes e gastaram o tour mais caro, outras fizeram aproximação", como ele mesmo
// descreveu olhando o concorrente. Quatro é o teto, e cai junto em vídeo pequeno.
//
// EM 12/10/2026 EU APLIQUEI ESTE TETO TAMBÉM AO BOTÃO "Tour pela casa", e foi erro.
// O raciocínio parecia bom: o tour dele saiu com 11 cenas animadas (22 créditos) e a maioria
// "só parece que a imagem está passando de lado", então cortar pra 4 baratearia e tiraria as
// cenas fracas. Gerei o vídeo pra mostrar e ele respondeu:
//
//     "isso não é tour, é opção padrão; tour é igual o primeiro take do vídeo"
//
// A régua é simples e eu não tinha enxergado: se 7 de 11 cenas usam o movimento grátis,
// aquilo É a opção padrão com quatro exceções. Baratear um produto tirando o que ele promete
// não é melhorar o produto -- é vender outro. O teto voltou pro lugar onde nasceu.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-tour-quantas-cameras.ts

import { quantasComCamera } from "../src/lib/video-automatico.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- o teto da MONTAGEM ----
conferir(quantasComCamera(11) === 4, "a montagem gasta 4 câmeras em 11 fotos", String(quantasComCamera(11)));
for (const n of [12, 20, 40]) conferir(quantasComCamera(n) === 4, `e continua em 4 com ${n} fotos`, String(quantasComCamera(n)));
conferir(quantasComCamera(1) === 1, "foto única ganha câmera: ela É a capa");
conferir(quantasComCamera(2) === 2, "duas fotos, as duas ganham");
conferir(quantasComCamera(5) === 2, "cinco fotos dão 2", String(quantasComCamera(5)));
conferir(quantasComCamera(8) === 3, "oito dão 3", String(quantasComCamera(8)));
conferir(quantasComCamera(0) === 0, "nenhuma foto, nenhuma câmera");

// ---- o teto nunca passa do que existe ----
for (const n of [0, 1, 2, 3, 5, 7, 11, 25]) {
  conferir(quantasComCamera(n) <= n, `${n} fotos: o teto não promete mais câmeras que fotos`, String(quantasComCamera(n)));
}

// ---- e nunca é zero quando há foto: um vídeo todo parado não é produto ----
for (const n of [1, 2, 3, 7, 30]) {
  conferir(quantasComCamera(n) >= 1, `${n} fotos: pelo menos uma cena ganha câmera`, String(quantasComCamera(n)));
}

// ---- O QUE O TOUR FAZ, que é outra coisa ----
//
// Aqui não há função a chamar: o botão de estilo marca TODAS as cenas animáveis. O que este
// caso guarda é a DECISÃO, pra ninguém reintroduzir o teto achando que economiza.
{
  const cenasDoTour = (total: number) => total; // o tour anima todas
  conferir(cenasDoTour(11) === 11, "o TOUR anima as 11, não 4 — é o que o botão promete", `${cenasDoTour(11)}`);
  conferir(cenasDoTour(11) !== quantasComCamera(11), "e por isso ele NÃO usa o teto da montagem", `tour ${cenasDoTour(11)} · montagem ${quantasComCamera(11)}`);
  conferir(cenasDoTour(11) * 2 === 22, "o custo é o que é: 22 créditos em 11 fotos", "2 por cena");
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
