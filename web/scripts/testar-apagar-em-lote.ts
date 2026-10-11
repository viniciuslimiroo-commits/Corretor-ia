// APAGAR VÁRIOS: o que saiu, o que ficou, e o recado que a pessoa lê.
//
// O perigo deste pedaço não é falhar -- é ter sucesso por fora. Dez pedidos disparados, um
// `await` que não estoura, e a tela diz "apagados" enquanto três continuam lá. Por isso cada
// caso aqui confere as DUAS listas, e não só a de sucesso.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-apagar-em-lote.ts

import { apagarVideosEmLote, recadoDoLote } from "../src/lib/apagar-em-lote.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Um servidor de mentira que obedece a um roteiro por id. */
function servidor(roteiro: Record<string, "ok" | "erro" | "cai" | number>, registro?: { ids: string[]; tokens: string[] }) {
  return async (id: string, token: string): Promise<Response> => {
    registro?.ids.push(id);
    registro?.tokens.push(token);
    const r = roteiro[id] ?? "ok";
    if (r === "cai") throw new Error("falhou a conexão");
    if (r === "ok") return new Response(null, { status: 204 });
    if (r === "erro") return new Response(JSON.stringify({ error: "esse vídeo está num book" }), { status: 409 });
    return new Response("isto não é json", { status: r });
  };
}

async function main() {
  // ---- tudo sai ----
  {
    const reg = { ids: [] as string[], tokens: [] as string[] };
    const r = await apagarVideosEmLote(["a", "b", "c"], "tok", servidor({}, reg));
    conferir(r.apagados.length === 3 && r.falharam.length === 0, "três ids, três apagados", `${r.apagados.join(",")}`);
    conferir(recadoDoLote(r) === null, "sem recado quando tudo saiu — a lista já conta");
    conferir(reg.tokens.every((t) => t === "tok"), "o token foi em todos os pedidos");
  }

  // ---- um falha: o resto SAI, e o que ficou é dito ----
  {
    const r = await apagarVideosEmLote(["a", "b", "c"], "tok", servidor({ b: "erro" }));
    conferir(r.apagados.join(",") === "a,c", "os outros dois saíram mesmo com um erro no meio", r.apagados.join(","));
    conferir(r.falharam.length === 1 && r.falharam[0].id === "b", "o que ficou é nomeado pelo id");
    conferir(r.falharam[0].motivo === "esse vídeo está num book", "e com o motivo que o servidor deu", r.falharam[0].motivo);
    const recado = recadoDoLote(r) ?? "";
    conferir(recado.includes("2 vídeos") && recado.includes("um ficou"), "o recado conta os dois lados", recado);
  }

  // ---- todos falham ----
  {
    const r = await apagarVideosEmLote(["a", "b"], "tok", servidor({ a: "erro", b: "erro" }));
    conferir(r.apagados.length === 0, "nenhum apagado quando todos falham");
    const recado = recadoDoLote(r) ?? "";
    conferir(recado.startsWith("Não consegui apagar 2 vídeos"), "o recado não finge sucesso nenhum", recado);
    conferir((recado.match(/book/g) ?? []).length === 1, "motivo repetido aparece UMA vez", recado);
  }

  // ---- a conexão cair não estoura a função ----
  {
    const r = await apagarVideosEmLote(["a", "b"], "tok", servidor({ a: "cai" }));
    conferir(r.apagados.join(",") === "b", "a queda de um não leva o lote junto");
    conferir(r.falharam[0]?.motivo === "falhou a conexão", "a queda vira motivo legível", r.falharam[0]?.motivo);
  }

  // ---- resposta sem json: o número responde ----
  {
    const r = await apagarVideosEmLote(["a"], "tok", servidor({ a: 500 }));
    conferir(r.falharam[0]?.motivo === "o servidor respondeu 500", "corpo ilegível não vira 'undefined'", r.falharam[0]?.motivo);
  }

  // ---- id repetido vai uma vez só ----
  {
    const reg = { ids: [] as string[], tokens: [] as string[] };
    const r = await apagarVideosEmLote(["a", "a", "b", ""], "tok", servidor({}, reg));
    conferir(reg.ids.length === 2, "id repetido (e vazio) não vira pedido a mais", `${reg.ids.length} pedido(s)`);
    conferir(r.apagados.length === 2, "e a contagem não conta duas vezes");
  }

  // ---- lista vazia: nenhum pedido ----
  {
    const reg = { ids: [] as string[], tokens: [] as string[] };
    const r = await apagarVideosEmLote([], "tok", servidor({}, reg));
    conferir(reg.ids.length === 0 && r.apagados.length === 0, "lista vazia não fala com o servidor");
    conferir(recadoDoLote(r) === null, "e não inventa recado");
  }

  // ---- mais que um bloco (são 4 por vez): ninguém fica pra trás ----
  {
    const ids = Array.from({ length: 11 }, (_, i) => `v${i}`);
    const reg = { ids: [] as string[], tokens: [] as string[] };
    const r = await apagarVideosEmLote(ids, "tok", servidor({ v5: "erro" }, reg));
    conferir(reg.ids.length === 11, "os 11 foram pedidos, apesar de irem de 4 em 4", `${reg.ids.length}`);
    conferir(r.apagados.length === 10 && r.falharam.length === 1, "10 saíram e 1 ficou, sem perder ninguém", `${r.apagados.length}+${r.falharam.length}`);
    conferir(r.apagados.length + r.falharam.length === ids.length, "toda entrada tem um desfecho");
  }

  // ---- motivos diferentes aparecem, não viram um só ----
  {
    const r = await apagarVideosEmLote(["a", "b"], "tok", servidor({ a: "erro", b: 500 }));
    const recado = recadoDoLote(r) ?? "";
    conferir(recado.includes("book") && recado.includes("500"), "dois motivos diferentes, os dois ditos", recado);
  }

  // ---- a palavra combina com a tela que chama ----
  {
    const r = await apagarVideosEmLote(["a"], "tok", servidor({ a: "erro" }));
    conferir((recadoDoLote(r, "imagem", "imagens") ?? "").includes("1 imagem"), "o recado usa a palavra de quem chamou");
  }
}

main().then(
  () => {
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  },
  (e) => {
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
);
