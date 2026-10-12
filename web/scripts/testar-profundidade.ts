// A CÂMERA SÓ AVANÇA ONDE A FOTO TEM PARA ONDE AVANÇAR.
//
// Ele em 12/10/2026, sobre um tour de onze cenas: "só a primeira imagem ficou boa, as outras
// só parece que a imagem está passando de lado". E a condição que ele deu: "se não tiver
// informações do ambiente não inventar, dar jeito de andar até onde a imagem possibilita".
//
// A causa não era o modelo nem o ajuste. Medido, mesma configuração nas duas: a área gourmet
// dele -- espaço que se estende em corredor -- andou 72,8; uma sala larga, 31,2. O que decide
// é a foto ter fundo. Numa parede de azulejo a dois metros não existe nada atrás pra revelar,
// e o modelo que "andasse" ali estaria inventando cômodo.
//
// A regra antiga escolhia por AMBIENTE (sala→caminhar, banheiro→aproximar) e acerta no geral.
// Ela erra no caso dele: duas fotos da MESMA sala, uma da porta e outra de frente pra parede,
// recebiam o mesmo "caminhar" -- e só uma tinha para onde caminhar.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-profundidade.ts

import { animacaoDe, daPraAndar, PROFUNDIDADE_PRA_AVANCAR, type Olhada } from "../src/lib/video-automatico.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const foto = (ambiente: string | null, profundidade?: number | null): Olhada => ({ chave: "k", ambiente, qualidade: 7, legenda: "", profundidade });

// ---- SEM resposta da visão, NADA muda ----
//
// É a garantia que faz esta mudança poder ir ao ar sem mexer em vídeo nenhum: toda foto já
// vista antes da migração 19 tem profundidade nula.
conferir(animacaoDe(foto("sala")) === "caminhar", "sala sem profundidade medida: segue a regra antiga", animacaoDe(foto("sala")));
conferir(animacaoDe(foto("fachada")) === "drone", "fachada idem", animacaoDe(foto("fachada")));
conferir(animacaoDe(foto("banheiro")) === "aproximar", "banheiro idem", animacaoDe(foto("banheiro")));
conferir(animacaoDe(foto(null)) === "caminhar", "ambiente desconhecido idem");
conferir(animacaoDe(foto("sala", null)) === "caminhar", "profundidade explicitamente nula também não muda nada");
conferir(daPraAndar(foto("sala")) === null, "e a tela sabe que ainda não foi perguntado", String(daPraAndar(foto("sala"))));

// ---- COM profundidade: a foto manda ----
// A NOTA NÃO MANDA NO MOVIMENTO, e isto aqui é o que guarda essa decisão.
//
// Medido em 12/10/2026, gerando de verdade: o quarto da cena 5 recebeu nota 4 e ANDOU 14,3;
// o da cena 9 recebeu 3 e andou 1,0. A nota não separa o que precisa separar, e a mesma foto
// recebeu 4 numa pergunta e 7 noutra. Deixar ela decidir tiraria a câmera de um quarto que
// dá tour. Ela fica no aviso da tela, onde errar custa uma frase.
for (const p of [0, 2, 4, 6, 9]) {
  conferir(animacaoDe(foto("sala", p)) === "caminhar", `sala com nota ${p}: o movimento NÃO muda por causa da nota`, animacaoDe(foto("sala", p)));
}

conferir(animacaoDe(foto("fachada", 8)) === "drone", "fachada continua sobrevoo, com nota alta");
conferir(animacaoDe(foto("fachada", 1)) === "drone", "e com nota baixa também: a nota não decide", animacaoDe(foto("fachada", 1)));

// ---- quem NÃO avança não é afetado: não há o que proteger ----
for (const p of [0, 3, 5, 9]) {
  conferir(animacaoDe(foto("banheiro", p)) === "aproximar", `banheiro com profundidade ${p} segue em aproximar`);
}

// ---- a pergunta que a TELA faz pra avisar antes de gastar ----
conferir(daPraAndar(foto("sala", 9)) === true, "a tela sabe que esta foto vira tour");
conferir(daPraAndar(foto("sala", 2)) === false, "e que esta não vira");

// ---- o AVISO continua funcionando: é pra isso que a nota serve ----
for (let p = 0; p <= 10; p++) {
  conferir(daPraAndar(foto("sala", p)) === p >= PROFUNDIDADE_PRA_AVANCAR, `nota ${p}: o aviso responde pela borda`, String(daPraAndar(foto("sala", p))));
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
