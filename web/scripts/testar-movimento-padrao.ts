// O MOVIMENTO PADRÃO DA MONTAGEM: toda foto passeia pro lado, alternando a direção.
//
// Pedido dele em 10/10/2026: "que todos os movimentos fossem passear pro lado, não importa
// se direito ou esquerdo, e a parte de tour pela casa não fosse mais padrão". Antes o
// movimento seguia o ambiente (fachada afastava, cozinha aproximava).
//
// Duas coisas que um teste de "o padrão é X" costuma deixar escapar, e que estão travadas
// aqui: que a montagem é DETERMINÍSTICA (o mesmo conjunto dá o mesmo vídeo amanhã), e que
// 360 e clipe continuam PARADOS -- eles já têm movimento próprio, e empurrar outro briga.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-movimento-padrao.ts

import fs from "node:fs";
import { efeitoDe } from "../src/lib/video-automatico.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

type Olhada = Parameters<typeof efeitoDe>[0];
const foto = (ambiente: string): Olhada => ({ chave: ambiente, ambiente, legenda: "", nota: 5 }) as Olhada;

const LADOS = new Set(["esquerda", "direita"]);

// ---- toda foto passeia pro lado, qualquer que seja o ambiente ----
{
  // Os ambientes que ANTES afastavam e os que aproximavam, de propósito nos dois grupos:
  // se a regra velha sobrevivesse em qualquer um deles, aparece aqui.
  const antesAfastavam = ["fachada", "entrada", "sala", "piscina", "quintal", "varanda", "gourmet", "salao"];
  const antesAproximavam = ["cozinha", "banheiro", "quarto", "closet", "escritorio", "jantar", "infantil"];
  for (const a of [...antesAfastavam, ...antesAproximavam]) {
    const e = efeitoDe(foto(a), 0);
    conferir(LADOS.has(e), `“${a}” passeia pro lado`, e);
  }
  // Ambiente que a visão não reconheceu também: o padrão antigo era "aproximar".
  conferir(LADOS.has(efeitoDe({ chave: "x", legenda: "", nota: 5 } as Olhada, 0)), "ambiente desconhecido também passeia pro lado");
}

// ---- alterna, e alterna pela POSIÇÃO (não por sorteio) ----
{
  const seq = [0, 1, 2, 3, 4, 5].map((i) => efeitoDe(foto("sala"), i));
  conferir(seq.every((e) => LADOS.has(e)), "a sequência inteira é de lado", seq.join(" · "));
  conferir(new Set(seq).size === 2, "ela ALTERNA, em vez de repetir o mesmo lado", `${new Set(seq).size} direções`);
  conferir(seq[0] !== seq[1] && seq[1] !== seq[2], "troca a cada cena");

  // Determinismo: duas montagens do mesmo conjunto têm que dar o MESMO vídeo. Se isto virar
  // sorteio, a pessoa gera de novo e vê outro vídeo sem ter mexido em nada.
  const outra = [0, 1, 2, 3, 4, 5].map((i) => efeitoDe(foto("sala"), i));
  conferir(seq.join() === outra.join(), "duas montagens iguais dão o mesmo resultado", "determinística");
  // E o lado depende da POSIÇÃO, não do ambiente: mesma posição, ambientes diferentes, mesmo lado.
  conferir(efeitoDe(foto("cozinha"), 3) === efeitoDe(foto("fachada"), 3), "o lado vem da posição, não do ambiente");
}

// ---- 360 e clipe ficam parados ----
{
  conferir(efeitoDe({ chave: "a", legenda: "", nota: 5, eh360: true } as Olhada, 0) === "parado", "foto 360 continua PARADA", "já tem movimento próprio");
  conferir(efeitoDe({ chave: "b", legenda: "", nota: 5, ehClipe: true } as Olhada, 1) === "parado", "clipe continua PARADO");
  // A panorâmica ANTES tinha uma regra própria ("direita"); agora ela cai na regra geral,
  // que também é de lado -- então o resultado dela não piorou.
  conferir(LADOS.has(efeitoDe({ chave: "c", legenda: "", nota: 5, ehPanoramica: true } as Olhada, 0)), "panorâmica passeia pro lado, como sempre fez");
}

// ---- o padrão da tela é "Movimento na foto" ----
{
  // Teste de FONTE: o padrão é um `useState` dentro do componente, e o selo "padrão" é JSX.
  // Os dois têm que apontar pro MESMO estilo -- a tela anunciar um e o código usar outro é
  // o tipo de divergência que ninguém vê até gerar um vídeo cobrado sem querer.
  const fonte = fs.readFileSync(new URL("../src/app/videos/page.tsx", import.meta.url), "utf8");
  const m = /useState<"recomendado" \| "tour" \| "meu">\("([a-z]+)"\)/.exec(fonte);
  conferir(m?.[1] === "recomendado", "o estilo começa em “Movimento na foto”", m?.[1] ?? "não achei o useState");
  const selo = /\{o\.id === "([a-z]+)" && <span[^>]*>padrão<\/span>\}/.exec(fonte);
  conferir(selo?.[1] === "recomendado", "o selo “padrão” está no mesmo estilo", selo?.[1] ?? "não achei o selo");
  conferir(m?.[1] === selo?.[1], "a tela ANUNCIA o padrão que o código usa");
  // O Tour continua existindo, a um toque: tirar o padrão não é tirar o recurso.
  conferir(/id: "tour" as const, titulo: "Tour pela casa"/.test(fonte), "o Tour continua oferecido na tela");
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
