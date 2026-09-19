// ARRASTAR A BORDA DE UMA CENA na linha do tempo (lib/linha-do-tempo.ts, `aparaCena`), como
// no CapCut: a borda de trás muda a duração; a da frente corta o começo (no clipe, o arquivo
// passa a começar mais tarde). Sem rede, sem navegador.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-aparar-cena.ts

import { aplicarGesto, blocosDoEstado, ctxDoEstado, type EstadoLinha, type Medidas } from "../src/lib/linha-do-tempo.ts";
import { LIMITES, type Cena } from "../src/lib/video.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

type C = Cena & { chave: string };
const medidas: Medidas = { segundosDaVoz: null, vozEstimada: false, segundosEstimadosDaVoz: 0, segundosDoVoce: null };
const estado = (cenas: C[], transicao: EstadoLinha<C>["transicao"] = "corte"): EstadoLinha<C> => ({ cenas, transicao, telaFinal: false, titulo: "", audios: [], narracao: null, musicaVolume: 0.8, efeitoSonoro: "nenhum", apresentador: null, legendas: null });
const foto = (chave: string, duracao = 4): C => ({ chave, tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao, efeito: "parado" }) as C;
const clipe = (chave: string, duracao = 6, inicio?: number): C => ({ chave, tipo: "clipe", arquivo: "uploads/u/a.mp4", duracao, inicio }) as C;

{
  const ctx = ctxDoEstado(estado([foto("a"), foto("b"), foto("c")]), medidas);
  const f = blocosDoEstado(ctx);
  conferir(f.trilhas.cenas.every((b) => b.alcas.inicio && b.alcas.fim), "toda foto tem as duas bordas arrastáveis");
  // "corte" também tem uma emenda de 2 quadros (0,08s): as bordas vêm dos blocos, não de conta de cabeça.
  const b1 = f.trilhas.cenas[1];
  const r = aplicarGesto(ctx, { faixa: "cenas", chave: "b" }, { tipo: "aparaFim", para: b1.de + 5.8 }, null);
  conferir(r.mudou && r.estado.cenas[1].duracao === 6 && r.ate > b1.ate + 1.9, "borda de trás arrastada 2s pra frente: a foto 2 passa a ter 6s (arredonda) e as seguintes andam", `${r.estado.cenas[1].duracao}s, fim ${r.ate.toFixed(2)}`);
  const longe = aplicarGesto(ctx, { faixa: "cenas", chave: "b" }, { tipo: "aparaFim", para: 40 }, null);
  conferir(longe.estado.cenas[1].duracao === LIMITES.duracaoMax && longe.parouNaBorda, "passou do teto: para em 8s e avisa que parou na borda");
  const curto = aplicarGesto(ctx, { faixa: "cenas", chave: "b" }, { tipo: "aparaFim", para: 4.5 }, null);
  conferir(curto.estado.cenas[1].duracao === LIMITES.duracaoMin && curto.parouNaBorda, "encolheu demais: para no mínimo (3s)");
  const frente = aplicarGesto(ctx, { faixa: "cenas", chave: "b" }, { tipo: "aparaInicio", para: b1.de + 1 }, null);
  conferir(frente.mudou && frente.estado.cenas[1].duracao === 3 && Math.abs(frente.de - b1.de) < 1e-9 && frente.estado.cenas[1].inicio === undefined, "borda da frente na FOTO: tira 1s do começo; a foto continua começando onde a anterior acaba", `${frente.estado.cenas[1].duracao}s de ${frente.de.toFixed(2)}`);
}
{
  const ctx = ctxDoEstado(estado([clipe("a", 6, 2)]), medidas);
  const r = aplicarGesto(ctx, { faixa: "cenas", chave: "a" }, { tipo: "aparaInicio", para: 2 }, null);
  conferir(r.mudou && r.estado.cenas[0].duracao === 4 && r.estado.cenas[0].inicio === 4, "borda da frente no CLIPE: corta 2s do começo do arquivo (começa no segundo 4)", `${r.estado.cenas[0].duracao}s, arquivo em ${r.estado.cenas[0].inicio}s`);
  const volta = aplicarGesto(ctx, { faixa: "cenas", chave: "a" }, { tipo: "aparaInicio", para: -5 }, null);
  conferir(volta.estado.cenas[0].duracao === 8 && volta.estado.cenas[0].inicio === undefined, "puxar pra trás devolve só o que havia antes no arquivo (2s), até o começo dele", `${volta.estado.cenas[0].duracao}s, arquivo em ${volta.estado.cenas[0].inicio ?? 0}s`);
}
{
  const ctx = ctxDoEstado(estado([foto("a"), foto("b")], "dissolver"), medidas);
  const b0 = blocosDoEstado(ctx).trilhas.cenas[0];
  const r = aplicarGesto(ctx, { faixa: "cenas", chave: "a" }, { tipo: "aparaFim", para: b0.ate + 1 }, null);
  conferir(r.estado.cenas[0].duracao === 5, "com emenda (dissolver), a borda é a VISÍVEL: +1s nela = +1s na cena", `${r.estado.cenas[0].duracao}s`);
}
{
  const animada = { chave: "x", tipo: "animada", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4 } as C;
  const f = blocosDoEstado(ctxDoEstado(estado([animada]), medidas));
  conferir(!f.trilhas.cenas[0].alcas.inicio && !f.trilhas.cenas[0].alcas.fim, "cena animada não tem borda arrastável (cada duração é outro pedido ao modelo)");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
