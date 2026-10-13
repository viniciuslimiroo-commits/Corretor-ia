// AS ANIMAÇÕES SAEM TODAS DE UMA VEZ, E A TELA DIZ ISSO.
//
// Antes o pipeline despachava uma cena animada, voltava, esperava ela ficar pronta e só então
// despachava a próxima. Medido em 24/09/2026, com a MESMA foto e o mesmo modelo, duas gerações
// levaram 29 s e 678 s -- a fila do fal varia mais de vinte vezes. Em série essa variação se
// SOMA, e uma cena azarada segura todas as outras que já poderiam estar prontas.
//
// Este teste não chama o fal (custaria dinheiro a cada execução). Ele confere o que dá pra
// conferir de graça e é onde o erro moraria: o estado que diz quais animações estão em voo, e
// a frase que a tela mostra em cima dele.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-animacoes-em-paralelo.ts

import { progressoDe, type PipelineVideo } from "../src/lib/video-pipeline";
import type { EspecVideo } from "../src/lib/video";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const espec = {
  formato: "9:16",
  cenas: [
    { tipo: "animada", jobId: "a", duracao: 4 },
    { tipo: "animada", jobId: "b", duracao: 4 },
    { tipo: "foto", jobId: "c", duracao: 3 },
    { tipo: "animada", jobId: "d", duracao: 4 },
  ],
} as unknown as EspecVideo;

const base: PipelineVideo = { etapa: "cena", cenaAtual: 0, clipes: [], duracoes: [], temporarios: [], avisos: [] };
const emVoo = (quantas: number) => Object.fromEntries(Array.from({ length: quantas }, (_, k) => [String(k), { statusUrl: "s", responseUrl: "r" }]));

// ---- 1. com várias na fila, a tela diz VÁRIAS ----
//
// Não é preciosismo: com o lote, a barra fica parada um tempo e depois anda várias casas de
// uma vez. "Animando a cena 1" faria isso parecer travamento -- que foi exatamente a queixa
// dele sobre o contador, num outro lugar do mesmo fluxo.
const tres = progressoDe(espec, { ...base, animadas: emVoo(3) });
conferir(/3 cenas com IA ao mesmo tempo/.test(tres.mensagem), "com três na fila, a tela diz que são três ao mesmo tempo", tres.mensagem);

const uma = progressoDe(espec, { ...base, animadas: emVoo(1) });
conferir(/Animando a cena 1 com IA/.test(uma.mensagem), "com uma só, volta a falar no singular", uma.mensagem);

// ---- 2. sem nenhuma na fila, é montagem comum ----
const nenhuma = progressoDe(espec, { ...base, animadas: {} });
conferir(/Montando a cena/.test(nenhuma.mensagem), "sem animação em voo, a mensagem é a de montar", nenhuma.mensagem);
const semCampo = progressoDe(espec, base);
conferir(/Montando a cena/.test(semCampo.mensagem), "e um vídeo sem o campo (dos antigos) também", semCampo.mensagem);

// ---- 2b. a cena que está sendo REFEITA diz isso ----
//
// Quando a conferência reprova um clipe (lib/conferir-clipe.ts), a cena é refeita uma vez. Isso
// custa outra rodada da fila do fal -- 30 s a 11 minutos, medido. Repetir "Animando a cena 2 com
// IA…" faria essa espera parecer travamento, que é exatamente a queixa dele sobre o contador em
// outro lugar do fluxo. Dizendo o motivo, a mesma espera vira o produto trabalhando a favor dela.
const refazendo = progressoDe(espec, { ...base, cenaAtual: 1, animadas: { "1": { statusUrl: "s", responseUrl: "r" } }, refeitas: { "1": 1 } });
conferir(/A cena 2 saiu com defeito; refazendo/.test(refazendo.mensagem), "a cena refeita avisa que está sendo refeita", refazendo.mensagem);

// e NÃO contamina as outras cenas do mesmo vídeo
const outraCena = progressoDe(espec, { ...base, cenaAtual: 3, animadas: { "3": { statusUrl: "s", responseUrl: "r" } }, refeitas: { "1": 1 } });
conferir(/Animando a cena 4 com IA/.test(outraCena.mensagem), "a cena 4 do mesmo vídeo volta à frase normal", outraCena.mensagem);

// nem fica pendurada depois que a refeita voltou e saiu da fila
const jaVoltou = progressoDe(espec, { ...base, cenaAtual: 1, animadas: {}, refeitas: { "1": 1 } });
conferir(/Montando a cena 2/.test(jaVoltou.mensagem), "com a refeita já na mão, a frase é de montar", jaVoltou.mensagem);

// vídeo sem refeita nenhuma (o caso comum) não muda nada
const semRefeita = progressoDe(espec, { ...base, cenaAtual: 1, animadas: { "1": { statusUrl: "s", responseUrl: "r" } } });
conferir(/Animando a cena 2 com IA/.test(semRefeita.mensagem), "vídeo sem reprovação segue como antes", semRefeita.mensagem);

// ---- 3. o vídeo que começou no modelo antigo continua entendido ----
//
// `animada` (uma só) ainda existe pra isso: um vídeo que já estava rodando quando o código
// mudou não pode virar "Montando a cena 1" enquanto a IA trabalha.
const antigo = progressoDe(espec, { ...base, animada: { cena: 0, statusUrl: "s", responseUrl: "r" } });
conferir(/Animando a cena 1 com IA/.test(antigo.mensagem), "vídeo do modelo antigo continua dizendo que está animando", antigo.mensagem);

// ---- 4. o total de etapas não mudou ----
//
// O lote acrescenta uma ida ao servidor, mas não uma ETAPA: a conta de progresso é a mesma, e
// quem depende dela (a barra, o "faltam X") continua batendo.
conferir(tres.total === nenhuma.total && tres.total === antigo.total, "o total de etapas é o mesmo em todos os casos", `${tres.total}`);
conferir(tres.total === espec.cenas.length + 2, "e continua sendo cenas + montar + finalizar", `${tres.total} para ${espec.cenas.length} cenas`);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
