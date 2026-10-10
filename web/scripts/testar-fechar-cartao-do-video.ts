// FECHAR O CARTÃO DO VÍDEO PRONTO pelas DUAS pontas (app/videos/page.tsx).
//
// Em `/videos`, o cartão "Seu vídeo está pronto" é DERIVADO de duas origens:
//
//   const resultado = resultadoAberto ?? (geracao.pronto ? {...} : null);
//
// `setResultado(null)` apaga só a primeira. Quem quiser FECHAR o cartão tem que apagar as
// duas -- `setResultado(null)` e `geracao.limpar()`. `editarVideo` esquecia a segunda, e
// num vídeo recém-gerado (cujo cartão vem de `geracao.pronto`) o cartão continuava na tela
// depois de a edição ter aberto de verdade. O dono relatou como "clico em Editar e não
// acontece nada" em 29/09/2026, e o defeito sobreviveu porque o sintoma é indistinguível
// de um botão morto.
//
// Isto é um teste de FONTE, como `testar-clipes-do-editor.ts` faz com o pouso do clipe: o
// defeito é uma interação de estado do React que nenhum teste de unidade alcança, mas a
// regra é estrutural e dá pra ler no arquivo.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-fechar-cartao-do-video.ts

import fs from "node:fs";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const CAMINHO = new URL("../src/app/videos/page.tsx", import.meta.url);
const fonte = fs.readFileSync(CAMINHO, "utf8");

// 1. A premissa do teste continua valendo? Se a derivação sumir, esta regra perde o sentido
//    e o teste tem que falhar RUIDOSAMENTE em vez de seguir conferindo coisa que não existe.
{
  const derivado = /const resultado[^=]*=\s*\n?\s*resultadoAberto \?\? \(geracao\.pronto/.test(fonte);
  conferir(derivado, "o cartão continua DERIVADO de duas origens (resultadoAberto ?? geracao.pronto)", derivado ? "" : "a derivação mudou: reveja esta regra inteira");
  if (!derivado) {
    console.log("\n1 FALHA(S)");
    process.exit(1);
  }
}

/** O corpo de uma função nomeada do arquivo, por contagem de chaves. */
function corpoDaFuncao(nome: string): string | null {
  const m = new RegExp(`(?:async )?function ${nome}\\s*\\(`).exec(fonte);
  if (!m) return null;
  const abre = fonte.indexOf("{", m.index + m[0].length - 1);
  if (abre < 0) return null;
  let n = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === "{") n++;
    else if (fonte[i] === "}" && --n === 0) return fonte.slice(abre, i + 1);
  }
  return null;
}

// 2. Toda função que FECHA o cartão tem que apagar as duas origens.
//
//    `trocarMusica` fica de fora de propósito: ela não fecha o cartão, ela o SUBSTITUI
//    (setResultado com um objeto novo). É por isso que a lista é explícita em vez de
//    "qualquer função que chame setResultado(null)" -- essa segunda forma pegaria o caso
//    legítimo de quem apaga só uma origem por outro motivo.
for (const nome of ["gerar", "retomarVideo", "editarVideo"]) {
  const corpo = corpoDaFuncao(nome);
  conferir(!!corpo, `achei a função ${nome}`);
  if (!corpo) continue;
  const apaga = /setResultado\(null\)/.test(corpo);
  const limpa = /geracao\.limpar\(\)/.test(corpo);
  conferir(apaga && limpa, `${nome} fecha o cartão pelas DUAS pontas`, `setResultado(null): ${apaga ? "sim" : "NÃO"} · geracao.limpar(): ${limpa ? "sim" : "NÃO"}`);
}

// 3. Controle NEGATIVO: a regra sabe reprovar? Sem isto, um teste que só vê código correto
//    não prova nada -- é o mesmo "guarda que nada exercita" das bancadas.
{
  // A simulação tem que mirar no corpo de `editarVideo`, não no arquivo inteiro: um
  // `replace` solto pega a PRIMEIRA ocorrência, que está em `gerar()`, e aí o controle
  // reprova por mira errada em vez de por regra fraca. (Foi o que aconteceu ao escrever
  // isto -- e é a terceira vez nesta série que uma busca casa o alvo errado.)
  const corpoReal = corpoDaFuncao("editarVideo") ?? "";
  const corpoQuebrado = corpoReal.replace(/\n\s*geracao\.limpar\(\);/, "");
  conferir(corpoQuebrado !== corpoReal, "consegui simular a regressão DENTRO de editarVideo (controle)");
  const passa = /setResultado\(null\)/.test(corpoQuebrado) && /geracao\.limpar\(\)/.test(corpoQuebrado);
  conferir(!passa, "com a linha removida, a regra REPROVA", "o teste não passa por qualquer coisa");
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
