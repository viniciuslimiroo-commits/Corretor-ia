// DESFAZER E REFAZER (components/editor/usar-historico.ts; docs/planos/linha-do-tempo-spec.md,
// D7 e P6): a conta pura, sem React.
//
//   rajada de 600ms vira UM passo; novoPasso separa; limite de 50; mudança nova apaga o
//   refazer; restaurar não vira passo; retrato igual não prende a bandeira; limpar zera e o
//   estado novo que chega logo depois (abrir outro vídeo) é o ponto de partida, não passo.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-historico.ts

import { historicoPuro as H, iguaisPorCampo, type Pilha } from "../src/components/editor/usar-historico.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

type Doc = { cenas: string[]; titulo: string; volume: number };
const cenas = ["a", "b"];
const d0: Doc = { cenas, titulo: "", volume: 0.8 };

/** Simula o editor: cada mudança de estado gera um doc novo (memo), e o efeito chama `mudou`. */
function mudar(p: Pilha<Doc>, doc: Doc, t: number) {
  return H.mudou(p, doc, t);
}
/** Desfazer: a pilha devolve o retrato, o editor chama os setters, o doc volta e o efeito vê. */
function desfazer(p: Pilha<Doc>, t: number): [Pilha<Doc>, Doc | undefined] {
  const r = H.desfazer(p);
  if (r.restaurar === undefined) return [r.pilha, undefined];
  return [H.mudou(r.pilha, { ...r.restaurar }, t), r.restaurar];
}
function refazer(p: Pilha<Doc>, t: number): [Pilha<Doc>, Doc | undefined] {
  const r = H.refazer(p);
  if (r.restaurar === undefined) return [r.pilha, undefined];
  return [H.mudou(r.pilha, { ...r.restaurar }, t), r.restaurar];
}

// ---------- rajada ----------
{
  let p = mudar(H.criar<Doc>(), d0, 0);
  // Controle deslizante: 0,8 -> 0,7 -> 0,6 -> 0,5 com 100ms entre cada.
  for (const [i, v] of [0.7, 0.6, 0.5].entries()) p = mudar(p, { ...d0, volume: v }, 1000 + i * 100);
  conferir(p.desfazer.length === 1 && p.desfazer[0].volume === 0.8, "rajada de mudanças coladas (< 600ms) vira UM passo", `${p.desfazer.length} passo(s)`);
  p = mudar(p, { ...d0, volume: 0.4 }, 1000 + 200 + 700);
  conferir(p.desfazer.length === 2 && p.desfazer[1].volume === 0.5, "depois de 600ms parado, a mudança seguinte é passo novo");
  let de: Doc | undefined;
  [p, de] = desfazer(p, 5000);
  conferir(de?.volume === 0.5 && p.atual?.volume === 0.5, "desfazer volta pro fim da rajada anterior");
  [p, de] = desfazer(p, 5100);
  conferir(de?.volume === 0.8, "e de novo, pro começo de tudo");
  conferir(p.desfazer.length === 0 && p.refazer.length === 2, "restaurar não vira passo novo (a pilha só troca de lado)", `${p.desfazer.length}/${p.refazer.length}`);
  [p, de] = refazer(p, 5200);
  conferir(de?.volume === 0.5 && p.refazer.length === 1 && p.desfazer.length === 1, "refazer anda pra frente");
  p = mudar(p, { ...d0, volume: 0.2 }, 6000);
  conferir(p.refazer.length === 0, "mudança nova depois de desfazer apaga o refazer");
}

// ---------- novoPasso ----------
{
  let p = mudar(H.criar<Doc>(), d0, 0);
  p = mudar(p, { ...d0, titulo: "A" }, 1000);
  p = H.novoPasso(p);
  p = mudar(p, { ...d0, titulo: "A", volume: 0.3 }, 1050);
  conferir(p.desfazer.length === 2, "novoPasso separa mesmo colado na anterior (botão, gesto confirmado)", `${p.desfazer.length}`);
}

// ---------- limite ----------
{
  let p = mudar(H.criar<Doc>(), d0, 0);
  for (let i = 1; i <= 60; i++) p = mudar(p, { ...d0, volume: i / 100 }, i * 1000);
  conferir(p.desfazer.length === 50 && p.desfazer[0].volume === 0.1, "no máximo 50 passos; o mais velho sai", `${p.desfazer.length}, primeiro ${p.desfazer[0].volume}`);
}

// ---------- retrato igual não prende a bandeira ----------
{
  let p = mudar(H.criar<Doc>(), d0, 0);
  const a = { ...d0, titulo: "A" };
  p = mudar(p, a, 1000);
  // O retrato no topo é IGUAL campo a campo ao atual (ex.: duas mudanças que se desfizeram).
  p = { ...p, desfazer: [...p.desfazer, { ...a }] };
  const r = H.desfazer(p);
  conferir(r.restaurar?.titulo === "", "retrato igual ao atual é descartado; desfazer vai pro anterior de verdade");
  const r2 = H.desfazer({ ...H.criar<Doc>(d0), desfazer: [{ ...d0 }] });
  conferir(r2.restaurar === undefined && !r2.pilha.restaurando, "se só sobra retrato igual, nada é restaurado e a bandeira NÃO fica presa");
  let q = r2.pilha;
  q = mudar(q, { ...d0, volume: 0.1 }, 9000);
  conferir(q.desfazer.length === 1, "e a edição seguinte continua desfazível");
}

// ---------- limpar ----------
{
  let p = mudar(H.criar<Doc>(), d0, 0);
  p = mudar(p, { ...d0, titulo: "vídeo antigo" }, 1000);
  p = H.limpar(p, p.atual as Doc, 2000);
  conferir(p.desfazer.length === 0 && p.refazer.length === 0, "limpar zera as duas pilhas");
  // Abrir outro vídeo: o estado inteiro troca no mesmo clique (dois renders).
  p = mudar(p, { cenas: ["x", "y", "z"], titulo: "vídeo novo", volume: 0.8 }, 2010);
  p = mudar(p, { cenas: ["x", "y", "z"], titulo: "vídeo novo", volume: 0.6 }, 2030);
  conferir(p.desfazer.length === 0, "o estado que chega logo depois de limpar é o ponto de partida, não passo (Desfazer não volta pro vídeo anterior)");
  p = mudar(p, { cenas: ["x", "y", "z"], titulo: "vídeo novo!", volume: 0.6 }, 4000);
  conferir(p.desfazer.length === 1 && p.desfazer[0].titulo === "vídeo novo", "e a primeira edição de verdade já é desfazível");
  const p2 = mudar(H.limpar(mudar(H.criar<Doc>(), d0, 0), d0, 100), { ...d0, titulo: "B" }, 3000);
  conferir(p2.desfazer.length === 1, "se nada mudou logo depois de limpar, a próxima edição continua desfazível");
}

// ---------- comparação ----------
conferir(iguaisPorCampo({ a: cenas, b: 1 }, { a: cenas, b: 1 }) && !iguaisPorCampo({ a: cenas }, { a: [...cenas] }), "igualdade campo a campo é por referência (o doc memorizado)");

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
