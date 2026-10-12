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
conferir(animacaoDe(foto("sala", 9)) === "caminhar", "sala com fundo (9): a câmera anda", animacaoDe(foto("sala", 9)));
conferir(animacaoDe(foto("sala", 2)) === "aproximar", "MESMA sala sem fundo (2): troca pro zoom com profundidade", animacaoDe(foto("sala", 2)));
conferir(animacaoDe(foto("sala", 5)) === "aproximar", "cômodo fechado (5) também não avança", animacaoDe(foto("sala", 5)));
conferir(animacaoDe(foto("sala", PROFUNDIDADE_PRA_AVANCAR)) === "caminhar", `na borda (${PROFUNDIDADE_PRA_AVANCAR}) já avança`);
conferir(animacaoDe(foto("sala", PROFUNDIDADE_PRA_AVANCAR - 1)) === "aproximar", "e um abaixo da borda, não");

// ---- o sobrevoo também avança, e também depende de fundo ----
conferir(animacaoDe(foto("fachada", 8)) === "drone", "fachada com fundo continua sobrevoo");
conferir(animacaoDe(foto("fachada", 1)) === "aproximar", "fachada colada na parede vira zoom", animacaoDe(foto("fachada", 1)));

// ---- quem NÃO avança não é afetado: não há o que proteger ----
for (const p of [0, 3, 5, 9]) {
  conferir(animacaoDe(foto("banheiro", p)) === "aproximar", `banheiro com profundidade ${p} segue em aproximar`);
}

// ---- a pergunta que a TELA faz pra avisar antes de gastar ----
conferir(daPraAndar(foto("sala", 9)) === true, "a tela sabe que esta foto vira tour");
conferir(daPraAndar(foto("sala", 2)) === false, "e que esta não vira");

// ---- a borda é a mesma dos dois lados: regra e aviso não podem discordar ----
for (let p = 0; p <= 10; p++) {
  const anda = daPraAndar(foto("sala", p));
  const avanca = animacaoDe(foto("sala", p)) === "caminhar";
  conferir(anda === avanca, `profundidade ${p}: o aviso e a escolha concordam`, `aviso=${anda} escolha=${avanca}`);
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
