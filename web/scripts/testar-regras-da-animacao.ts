// O QUE A IA NÃO PODE FAZER COM O IMÓVEL.
//
// Pedido dele em 24/09/2026, depois de assistir aos vídeos prontos:
//
//   "Não quero que as gerações de vídeo inventem, adicionem ou alterem elementos que não
//    existem nas fotos originais. [...] a IA acaba criando janelas, portas, cômodos, entradas,
//    corredores ou outros espaços que não existem no imóvel. [...] Também não quero efeitos ou
//    animações artificiais, como janelas abrindo, portas abrindo [...] gerei um vídeo de
//    aproximação e o resultado parecia uma pessoa segurando uma câmera na mão, com tremores."
//
// Este teste não olha vídeo nenhum -- olha o TEXTO que vai pro modelo. É um guarda-corpo, e
// tem um motivo forte pra existir: o prompt é a única coisa que segura o modelo, mudar uma
// palavra dele é barato, e o estrago só aparece num vídeo gerado dias depois, com crédito
// gasto. Um teste que lê o prompt custa milissegundos e falha na hora.
//
// O que ele NÃO garante, e é importante não confundir: que o modelo obedeça. Isso só se
// confere gerando de verdade, e gerar custa crédito.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-regras-da-animacao.ts

import { ANIMACOES, NEGATIVO_VIDEO } from "../src/lib/video";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const neg = NEGATIVO_VIDEO.toLowerCase();
const todos = ANIMACOES.map((a) => a.prompt.toLowerCase());
// A frase PROPRIA de cada preset, sem a regra que todos repetem. A separacao importa: a regra
// comum contem "nothing opens", e procurar "opens" no prompt inteiro acusaria justamente a
// proibicao que se quer garantir.
const soDoPreset = todos.map((p) => p.split("only the camera moves")[0]);

// ---- 1. o imóvel não pode ganhar cômodo ----
//
// A pior das três: mostrar um corredor que a casa não tem é propaganda enganosa, e quem
// responde por ela é o corretor que postou.
for (const proibido of ["new room", "new corridor", "new hallway", "new doorway", "new entrance", "revealing unseen space", "invented architecture"]) {
  conferir(neg.includes(proibido), `o negativo proíbe “${proibido}”`);
}

// ---- 2. nada do imóvel se anima ----
for (const proibido of ["door opening", "window opening", "curtain moving", "blinds opening", "objects animating"]) {
  conferir(neg.includes(proibido), `o negativo proíbe “${proibido}”`);
}

// ---- 3. a câmera é de tripé, não de mão ----
for (const proibido of ["handheld camera", "camera shake", "unstable camera", "wobble", "erratic motion", "camera rotation"]) {
  conferir(neg.includes(proibido), `o negativo proíbe “${proibido}”`);
}

// ---- 4. e o POSITIVO diz a mesma coisa, em todos os presets ----
//
// Proibição só no negativo deixa o modelo sem saber o que fazer NO LUGAR. O positivo tem que
// descrever o movimento certo: constante, numa direção só, pequeno, dentro da foto.
for (const [i, p] of todos.entries()) {
  const nome = ANIMACOES[i].id;
  conferir(p.includes("constant speed") || p.includes("constant slow speed"), `“${nome}” pede velocidade constante`);
  conferir(p.includes("stabilised") || p.includes("rails") || p.includes("motorised") || p.includes("tripod"), `“${nome}” pede câmera montada, não na mão`);
  conferir(p.includes("no shake") || p.includes("no wobble") || p.includes("smooth"), `“${nome}” pede movimento liso`);
  conferir(p.includes("already visible in the photograph") || p.includes("never travels far enough") || p.includes("beyond what the photograph already shows"), `“${nome}” proíbe mostrar o que a foto não tem`);
  conferir(p.includes("nothing opens, nothing closes"), `“${nome}” diz que nada abre e nada fecha`);
}

// ---- 5. nenhum preset pode PEDIR o que o negativo proibe ----
//
// Foi por isso que "Caminhar" gerou uma pessoa andando: o positivo pedia "walking". O mesmo
// erro agora seria pedir a camera atravessar o comodo, que e o que faz o modelo inventar o
// corredor do outro lado.
//
// Aqui a busca e so na frase PROPRIA do preset: a regra comum contem "nothing opens", e
// procurar "opens" no prompt inteiro acusaria justamente a proibicao que se quer garantir.
for (const [i, p] of soDoPreset.entries()) {
  const nome = ANIMACOES[i].id;
  conferir(!p.includes("through the room"), `“${nome}” não manda a câmera atravessar o cômodo`);
  conferir(!/walking|person|walks/.test(p), `“${nome}” não cita gente`);
  conferir(!/opens?|opening/.test(p), `“${nome}” não pede nada abrindo`);
}

// ---- 6. e a PARALAXE, que e o que separa tour de foto deslizando ----
//
// Ele: "a ideia e que o resultado passe a sensacao de uma camera profissional se movimentando
// pelo ambiente, e nao de uma imagem simplesmente sendo ampliada ou deslocada para os lados".
conferir(todos.every((p) => p.includes("parallax")), "todo preset pede paralaxe de verdade");
const lateral = ANIMACOES.find((a) => a.id === "lateral");
conferir(!!lateral, "existe um preset de movimento LATERAL", lateral?.rotulo ?? "não existe");
conferir(!!lateral && /trucks sideways|lateral tracking/.test(lateral.prompt), "e ele pede a câmera andando de lado, não a foto deslizando");

console.log(`\nnegativo com ${NEGATIVO_VIDEO.split(", ").length} proibições`);
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
