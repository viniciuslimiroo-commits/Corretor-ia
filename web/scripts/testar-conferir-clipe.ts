// O CONFERENTE PEGA A INVENÇÃO? -- e, mais importante, ele APROVA quando ele mesmo falha?
//
// Duas metades, e só a primeira custa dinheiro:
//
//   1. a decisão (de graça, sempre): formato quebrado, visão caída, JSON sem sentido, tudo
//      isso tem de APROVAR. É a parte que eu não quero ver quebrar num refactor, porque um
//      conferente que reprova quando ELE falha vira "todo vídeo saiu como foto" numa pane
//      do fal -- em cima de clipe que a pessoa já pagou.
//
//   2. a pontaria (só com `--real`): os seis clipes que eu julguei olhando quadro a quadro
//      em 12/10/2026. Três têm invenção que eu vi (vulto no chão do quintal, equipamento de
//      ginástica, tripé com celular num quarto) e três estão limpos. Gastou US$0,01 e deu
//      6 de 6, com ela nomeando o achado em cada um dos três.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-conferir-clipe.ts
//   node --import ./scripts/ts-direto.mjs scripts/testar-conferir-clipe.ts --real

import ffmpegStatic from "ffmpeg-static";
import { REFAZER_NO_MAXIMO } from "../src/lib/video-pipeline.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { avisoDeReprovado, conferirClipe, destinoDoReprovado, refeitasJaFeitas, instantesDosQuadros, vereditoDaResposta, PERGUNTA_DO_CONFERENTE, QUADROS_CONFERIDOS, FRACAO_DO_SEGUNDO_QUADRO } from "../src/lib/conferir-clipe.ts";

// O carregador dos testes não resolve o `require("ffmpeg-static")` que vive dentro de
// `caminhoFfmpeg()`, e sem isto TODA chamada ao ffmpeg estoura aqui -- o conferente cai no
// caminho de segurança e aprova tudo, calado. FFMPEG_PATH ganha do require e é a mesma porta
// que produção aceita, então o teste segue rodando o `rodarFfmpeg` do servidor, não uma cópia.
process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- a reprovação só sai do "true" ----
conferir(vereditoDaResposta('{"inventou":true,"o_que":"tripé apareceu"}').aprovado === false, "inventou:true reprova");
conferir(vereditoDaResposta('{"inventou":true,"o_que":"tripé apareceu"}').achado === "tripé apareceu", "e o achado chega pro aviso");
conferir(vereditoDaResposta('{"inventou":false,"o_que":"câmera andou"}').aprovado === true, "inventou:false aprova");
conferir(vereditoDaResposta('{"inventou":false}').achado === "", "quem aprova não tem achado");

// ---- markdown em volta, que é o que ela faz quando esquece a instrução ----
conferir(vereditoDaResposta('```json\n{"inventou":true,"o_que":"robô"}\n```').aprovado === false, "JSON dentro de cerca ainda reprova");
conferir(vereditoDaResposta('Claro! Aqui está: {"inventou":true,"o_que":"x"} Espero ter ajudado.').aprovado === false, "JSON no meio de conversa também");

// ---- APROVA NA DÚVIDA: a regra que protege o vídeo da pane ----
//
// Cada linha aqui é uma forma de a visão falhar. Nenhuma pode custar a cena da pessoa.
for (const [texto, oque] of [
  ["", "resposta vazia"],
  ["   ", "só espaço"],
  ["erro 503 upstream", "erro do provedor em texto"],
  ["{isso não é json}", "chave sem JSON dentro"],
  ['{"inventou":"true"}', "true como TEXTO -- formato mudou, eu não sei mais ler"],
  ['{"inventou":1}', "1 em vez de booleano"],
  ['{"inventou":"sim"}', '"sim" em vez de booleano'],
  ['{"inventou":null}', "nulo"],
  ['{"o_que":"tripé"}', "achado sem veredito"],
  ['{"inventou":{"valor":true}}', "objeto no lugar do booleano"],
] as const) {
  conferir(vereditoDaResposta(texto).aprovado === true, `aprova na dúvida: ${oque}`);
}

// ---- e o `respondeu` separa "ela disse que está limpo" de "ela não disse nada" ----
conferir(vereditoDaResposta('{"inventou":false}').respondeu === true, "ela respondeu limpo: respondeu=true");
conferir(vereditoDaResposta("503").respondeu === false, "ela não respondeu: respondeu=false", "é o que vai pro registro, não pra decisão");
conferir(vereditoDaResposta('{"inventou":"true"}').respondeu === false, "formato estranho conta como não respondido");

// ---- o achado não pode estourar o aviso da tela ----
{
  const v = vereditoDaResposta(JSON.stringify({ inventou: true, o_que: "x".repeat(400) }));
  conferir(v.achado.length <= 90, "achado comprido é cortado", `${v.achado.length} letras`);
}

// ---- DOIS QUADROS, e o segundo em 80% ----
//
// Guarda duas medições que contrariam a intuição, as duas feitas nos seis clipes reais.
//
// Acrescentar um quadro no MEIO, pra pegar invenção que aparece e some, fez ela APROVAR os
// ruins. E o ÚLTIMO quadro NÃO é o melhor segundo quadro: em 80% ela acerta 6 de 6, no fim
// do clipe cai pra 5 -- lá a câmera já andou tanto que a diferença passa a ser explicada
// por ela, que é a saída que a própria pergunta concede pra não acusar clipe bom.
//
// Quem mexer na quantidade ou na fração roda `--real` antes de acreditar em si mesmo.
conferir(QUADROS_CONFERIDOS === 2, "são dois quadros", String(QUADROS_CONFERIDOS));
conferir(FRACAO_DO_SEGUNDO_QUADRO === 0.8, "e o segundo sai em 80% do clipe", String(FRACAO_DO_SEGUNDO_QUADRO));
for (const d of [1, 2.5, 4, 8]) {
  const [a, b] = instantesDosQuadros(d);
  conferir(a < b && b < d, `duração ${d}s: os dois instantes cabem no clipe e estão em ordem`, `${a} · ${b}`);
  conferir(Math.abs(b / d - 0.8) < 0.001, `e o segundo cai mesmo em 80% de ${d}s`, String(b));
}
// Duração que não dá pra usar não pode virar instante negativo nem zero: ffmpeg devolveria
// quadro vazio, e dois quadros "iguais a nada" se leem como clipe limpo -- reprovação
// silenciosamente desligada, que é pior do que reprovar errado.
for (const d of [0, -4, NaN, Infinity]) {
  const [a, b] = instantesDosQuadros(d);
  conferir(a > 0 && b >= 0.3 && b > a, `duração inválida (${d}) ainda dá dois instantes válidos`, `${a} · ${b}`);
}

// ---- a pergunta tem de conter a frase que evita o falso positivo ----
conferir(/PRIMEIRO e o ÚLTIMO/.test(PERGUNTA_DO_CONFERENTE), "a pergunta diz que são as duas PONTAS do clipe", "foi assim que deu 6 de 6");
conferir(/SAIU do quadro/.test(PERGUNTA_DO_CONFERENTE), "a pergunta avisa que objeto saindo do quadro não é invenção");
conferir(/câmera se moveu/i.test(PERGUNTA_DO_CONFERENTE), "e que a câmera pode ter se movido");

async function main() {
// ---- o teto da refeita: uma vez, e NUNCA pra sempre ----
//
// O erro que esta parte esconde não aparece na tela: a cena reprova, refaz, reprova e refaz,
// e cada volta paga outro clipe no fal. Pra quem olha, o vídeo só está demorando.
conferir(destinoDoReprovado(0, REFAZER_NO_MAXIMO) === "refazer", "primeira reprovação: refaz uma vez");
conferir(destinoDoReprovado(1, REFAZER_NO_MAXIMO) === "foto", "segunda: desiste e vira foto");
for (const n of [2, 3, 10, 99]) {
  conferir(destinoDoReprovado(n, REFAZER_NO_MAXIMO) === "foto", `com ${n} refeitas já feitas, não refaz de novo`);
}
conferir(REFAZER_NO_MAXIMO === 1, "o teto é UM -- com dois, o clipe custa mais que a cena cobra", String(REFAZER_NO_MAXIMO));

// CONTAGEM ESTRAGADA NÃO PODE VIRAR REFEITA INFINITA.
//
// O pipeline grava `jaRefeitas + 1`. Se o guardado for NaN ou infinito, a soma devolve a
// mesma coisa ilegível -- e tratar isso como zero faz a cena refazer pra sempre, pagando um
// clipe por volta, enquanto a tela só mostra o vídeo demorando. Tem de cair em "foto".
for (const n of [NaN, Infinity, -Infinity]) {
  conferir(destinoDoReprovado(n, REFAZER_NO_MAXIMO) === "foto", `contagem ilegível (${n}) desiste em vez de gastar`);
}
conferir(destinoDoReprovado(-1, REFAZER_NO_MAXIMO) === "refazer", "contagem negativa conta como zero", "e a próxima já soma certo");
conferir(destinoDoReprovado(1.5, REFAZER_NO_MAXIMO) === "foto", "contagem quebrada arredonda pra baixo");

// e a leitura do JSON devolve sempre número que dá pra somar
for (const [v, esperado] of [[0, 0], [1, 1], [2.7, 2], [-5, 0], [null, 0], [undefined, 0], ["1", 1], ["abc", 0], [NaN, 0], [Infinity, 0]] as const) {
  conferir(refeitasJaFeitas(v) === esperado, `refeitasJaFeitas(${String(v)}) = ${esperado}`, String(refeitasJaFeitas(v)));
}
// o que o pipeline grava na volta tem de ser somável, senão a próxima volta repete o erro
for (const v of [null, undefined, NaN, Infinity, "abc"]) {
  const proxima = refeitasJaFeitas(v) + 1;
  conferir(Number.isFinite(proxima) && proxima > 0, `depois de ${String(v)}, o pipeline grava número somável`, String(proxima));
}
conferir(destinoDoReprovado(0, 0) === "foto", "teto zero desliga a refeita, sem travar");
conferir(destinoDoReprovado(0, NaN) === "foto", "teto inválido também");

// ---- o recado que a pessoa lê ----
{
  const a = avisoDeReprovado(4, "tripé com câmera no chão");
  conferir(/^Cena 5:/.test(a), "a cena é contada de 1, como na tela", a);
  conferir(/crédito voltou/.test(a), "e o aviso diz que o crédito voltou -- senão vira reclamação");
  conferir(/tripé com câmera no chão/.test(a), "com o que a visão viu, pra não soar genérico");
  conferir(!/apareceu coisa/.test(avisoDeReprovado(0, "banco flutuando")), "sem achado genérico quando há achado");
  conferir(/apareceu coisa que não está na foto/.test(avisoDeReprovado(0, "   ")), "e com texto de reserva quando ela não disse o quê");
}

// ---- clipe que não existe: aprova, sem explodir ----
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conf-"));
    const v = await conferirClipe({ clipe: path.join(tmp, "nao-existe.mp4"), duracao: 3, falKey: "x", pasta: tmp, perguntar: async () => '{"inventou":true,"o_que":"nunca chega aqui"}' });
    conferir(v.aprovado === true && v.respondeu === false, "clipe ilegível aprova sem nem perguntar");
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ---- a pontaria, nos clipes reais ----
  if (process.argv.includes("--real")) {
    const S = path.join(
      process.env.LOCALAPPDATA ?? os.tmpdir(),
      "Temp/claude/C--Users-Vinicius-Cardoso-Lim-Desktop-Saas-Ia-de-Corretor-e-imobili-ria/7dfd3962-a224-4fb8-8df2-abc6c9f86d27/scratchpad"
    );
    const env = Object.fromEntries(
      fs
        .readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
    );
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conf-real-"));
    // nome · arquivo · duração · tem invenção?
    //
    // O "cena2 barato" está marcado como RUIM e eu o tinha marcado como bom. A visão discordou
    // de mim, fui olhar os quadros do fim -- que eu não tinha olhado, parei em 2,6 s de um
    // clipe de 4,02 s -- e o banco de madeira que começa PRESO na parede de tijolo se solta,
    // vira laje no ar e termina como mesa pairando no meio do quintal. É literalmente o que
    // ele relatou em 12/10/2026: "a churrasqueira anda".
    const CASOS: [string, string, number, boolean][] = [
      ["cena2 a14b (vulto no chão)", "cena2/cena2-a14b.mp4", 4.02, true],
      ["cena2 a14b+neg (ginástica)", "cena2/cena2-a14b-mais.mp4", 4.02, true],
      ["quarto a14b (tripé)", "modelos/a14b.mp4", 4.02, true],
      ["cena2 barato (banco solta da parede)", "cena2/cena2-5b.mp4", 4.02, true],
      ["área gourmet a14b (limpo)", "geometria/a14b.mp4", 2.0, false],
      ["quarto cena5 barato (limpo)", "adaptar/frente.mp4", 4.02, false],
    ];
    for (const [nome, rel, dur, euVi] of CASOS) {
      const mp4 = path.join(S, rel);
      if (!fs.existsSync(mp4)) {
        conferir(true, `${nome}: clipe não está mais no rascunho, pulado`);
        continue;
      }
      const v = await conferirClipe({ clipe: mp4, duracao: dur, falKey: env.FAL_KEY, pasta: tmp });
      // PRIMEIRO: ela chegou a olhar? Aprovar por estar limpo e aprovar por não ter conseguido
      // perguntar dão o mesmo `aprovado`, e sem esta linha um conferente quebrado passa no
      // teste fingindo que todo clipe está bom. Foi exatamente o que aconteceu antes dela.
      conferir(v.respondeu === true, `${nome}: a visão respondeu`, v.respondeu ? "" : "aprovou por não ter conseguido olhar");
      conferir(v.aprovado === !euVi, `${nome}`, `eu=${euVi ? "inventou" : "limpo"} · ela=${v.aprovado ? "limpo" : "inventou"}${v.achado ? ` (${v.achado})` : ""}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  } else {
    console.log("\n(a pontaria nos clipes reais só com --real: gasta ~US$0,01 na visão)");
  }

    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  }

  // SEM `await` DE TOPO. Com ele, o carregador dos testes nao consegue decidir o formato de
  // `ffmpeg.ts` (que usa `require`) e TODA chamada ao ffmpeg estoura -- o conferente cai no
  // caminho de seguranca e aprova tudo, calado. Foi o que aconteceu aqui em 12/10/2026: o teste
  // passou a "reprovar" os seis casos sem nunca ter olhado um quadro.
  main();
