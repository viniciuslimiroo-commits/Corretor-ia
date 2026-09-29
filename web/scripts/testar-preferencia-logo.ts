// A PREFERÊNCIA "minhas fotos saem com o meu logo" (lib/preferencia-logo.ts).
//
// A regra parece trivial e não é: ela tem TRÊS estados, não dois -- ligado, desligado e
// "nunca decidiu" --, e o terceiro é o que faz o padrão valer sem apagar um "não" que
// alguém tenha dito de propósito. Um `boolean` no lugar do `null` e o "não" da pessoa
// viraria "não decidiu" no dia seguinte, com o logo voltando sozinho.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-preferencia-logo.ts

import { guardarLogoNaFoto, logoNaFotoGuardado, logoNaFotoPadrao } from "../src/lib/preferencia-logo.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// O navegador não existe aqui. Um localStorage de mentira, com o mesmo contrato, deixa
// testar a regra sem abrir Chrome -- e o primeiro bloco confere justamente o que acontece
// ANTES dele existir, que é o caso do servidor renderizando a página.
{
  conferir(logoNaFotoGuardado() === null, "sem navegador, não há escolha guardada");
  conferir(logoNaFotoPadrao(true) === true, "sem navegador e COM logo, vem ligado");
  conferir(logoNaFotoPadrao(false) === false, "sem navegador e sem logo, vem desligado");
  // Guardar sem navegador não pode estourar: a tela seguiria quebrada por causa de uma
  // preferência, que é conforto, não função.
  let estourou = false;
  try {
    guardarLogoNaFoto(true);
  } catch {
    estourou = true;
  }
  conferir(!estourou, "guardar sem navegador não estoura");
}

type Loja = { [k: string]: string };
function instalarNavegador(inicial: Loja = {}, quebrado = false) {
  const dados: Loja = { ...inicial };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem(k: string) {
        if (quebrado) throw new Error("acesso negado");
        return k in dados ? dados[k] : null;
      },
      setItem(k: string, v: string) {
        if (quebrado) throw new Error("acesso negado");
        dados[k] = v;
      },
    },
  };
  return dados;
}
const desinstalarNavegador = () => {
  delete (globalThis as unknown as { window?: unknown }).window;
};

// ---- os três estados ----
{
  instalarNavegador();
  conferir(logoNaFotoGuardado() === null, "navegador limpo: ninguém decidiu ainda");
  conferir(logoNaFotoPadrao(true) === true, "quem tem logo e nunca decidiu recebe LIGADO", "subir logo é o ato de quem quer usá-lo");
  conferir(logoNaFotoPadrao(false) === false, "quem não tem logo recebe desligado, decidindo ou não");

  const dados = instalarNavegador();
  guardarLogoNaFoto(false);
  conferir(logoNaFotoGuardado() === false, "o 'não' fica guardado");
  conferir(logoNaFotoPadrao(true) === false, "O 'NÃO' VENCE O PADRÃO — é o ponto do null", "senão o logo voltaria sozinho");
  conferir(Object.keys(dados).length === 1, "grava uma chave só", Object.keys(dados).join(","));

  guardarLogoNaFoto(true);
  conferir(logoNaFotoGuardado() === true, "o 'sim' também fica guardado");
  conferir(logoNaFotoPadrao(true) === true, "com 'sim' guardado, vem ligado");
  conferir(logoNaFotoPadrao(false) === false, "mas sem logo nenhum continua desligado, mesmo com 'sim' guardado", "não há o que carimbar");
  desinstalarNavegador();
}

// ---- lixo e navegador hostil ----
{
  instalarNavegador({ "encena.logo-na-foto": "talvez" });
  conferir(logoNaFotoGuardado() === null, "valor estranho é tratado como 'não decidiu'", "não como false");
  conferir(logoNaFotoPadrao(true) === true, "e aí o padrão volta a valer");

  // Janela anônima, dados de site bloqueados: o acesso ESTOURA, não devolve null.
  instalarNavegador({}, true);
  let estourouLer = false;
  try {
    conferir(logoNaFotoGuardado() === null, "leitura que estoura vira 'não decidiu'");
    conferir(logoNaFotoPadrao(true) === true, "e a tela continua funcionando");
  } catch {
    estourouLer = true;
  }
  conferir(!estourouLer, "ler num navegador hostil não derruba a página");

  let estourouGravar = false;
  try {
    guardarLogoNaFoto(true);
  } catch {
    estourouGravar = true;
  }
  conferir(!estourouGravar, "gravar num navegador hostil não derruba a página", "a exportação segue igual");
  desinstalarNavegador();
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
