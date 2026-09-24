// O CONTADOR DA GERAÇÃO NÃO PODE PARECER DEFEITO.
//
// A tela que ele fotografou em 24/09/2026 dizia "9min 16s de cerca de 9 min esperados" com a
// barra na etapa 1 de 15, e o "cerca de N min" pulava de 9 pra 8 pra 11. Ele: "ajustar isso
// pra não parecer ruim, senão o cliente vai achar ruim e não entender".
//
// Este teste trava as duas regras que saíram daí: o número só desce, e antes da primeira
// etapa fechar não existe número nenhum.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-espera-da-geracao.ts

import { restanteDaGeracao, falta } from "../src/lib/espera-da-geracao";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- 1. sem etapa fechada, não se inventa número ----
conferir(restanteDaGeracao(0, 15, 30, Infinity) === null, "na etapa 0 não há previsão nenhuma");
conferir(restanteDaGeracao(0, 15, 600, Infinity) === null, "e dez minutos depois continua sem previsão, se nada fechou");

// ---- 2. com etapa fechada, a previsão sai do ritmo medido ----
// Uma etapa em 120 s, faltam 14: 28 minutos. É muito, e é a verdade daquela fila.
const r1 = restanteDaGeracao(1, 15, 120, Infinity);
conferir(r1 !== null && Math.abs(r1 - 14 * 120) < 1, "uma etapa em 2 min prevê 28 min pras outras 14", `${Math.round((r1 ?? 0) / 60)} min`);
// Quatro etapas em 120 s: o ritmo é outro, e a previsão cai junto.
const r2 = restanteDaGeracao(4, 15, 120, Infinity);
conferir(r2 !== null && Math.abs(r2 - 11 * 30) < 1, "quatro etapas em 2 min preveem 5,5 min", `${Math.round((r2 ?? 0) / 60)} min`);

// ---- 3. O NÚMERO SÓ DESCE. É a regra que resolve a queixa dele. ----
//
// Simula uma geração em que a fila PIORA no meio: as duas primeiras etapas voam, a terceira
// trava. Sem a trava, o "faltam" subiria na cara do corretor no pior momento possível.
let menor = Infinity;
const linha: number[] = [];
for (const [feitas, decorrido] of [[1, 60], [2, 120], [3, 600], [4, 700], [5, 780]] as const) {
  const r = restanteDaGeracao(feitas, 10, decorrido, menor);
  if (r !== null) menor = r;
  linha.push(Math.round(menor / 60));
}
console.log(`   faltam, minuto a minuto: ${linha.join(" → ")}`);
conferir(
  linha.every((v, i) => i === 0 || v <= linha[i - 1]),
  "com a fila piorando no meio, o “faltam” nunca sobe",
  linha.join(" → ")
);

// CONTROLE: sem a trava, a mesma geração faria o número subir -- que é exatamente o
// "fala 9 minutos, 8, depois 11" que ele viu. Se este controle não acusar, o teste acima não
// sabe reconhecer o defeito que diz ter consertado.
const semTrava = ([[1, 60], [2, 120], [3, 600]] as const).map(([f, d]) => Math.round(((10 - f) * (d / f)) / 60));
conferir(semTrava.some((v, i) => i > 0 && v > semTrava[i - 1]), "controle: sem a trava o número subiria", semTrava.join(" → "));

// ---- 4. o texto é grosso, pra não piscar ----
conferir(falta(10) === "menos de 1 min", "10 s vira “menos de 1 min”", falta(10));
conferir(falta(44) === "menos de 1 min", "44 s ainda é “menos de 1 min”");
conferir(falta(120) === "cerca de 2 min", "2 min", falta(120));
conferir(falta(3600) === "mais de 10 min", "uma hora vira “mais de 10 min”", falta(3600));
// Entre duas consultas seguidas (2,5 s de diferença) o texto NÃO pode mudar.
const perto = [200, 202.5, 205, 207.5].map(falta);
conferir(new Set(perto).size === 1, "quatro consultas seguidas dão o MESMO texto", perto.join(" | "));
// E nunca aparece "0 min", que soaria como "já era pra ter acabado".
conferir(!falta(50).includes("0 min"), "não existe “cerca de 0 min”", falta(50));

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
