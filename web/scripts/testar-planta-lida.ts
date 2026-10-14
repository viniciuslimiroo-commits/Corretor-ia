// O QUE A LEITURA JOGA FORA — e por que isso é perigoso em silêncio.
//
// `limparLeitura` descarta rótulo que não é cômodo. Nasceu de um caso real (21/09/2026): o
// balão "Laje técnica", que aponta de fora pra dentro do desenho numa planta de lançamento,
// virava um cômodo de 4 m². Pedir no prompt pro modelo ignorar não resolveu -- lista no
// código é determinística e sobrevive a troca de modelo.
//
// SÓ QUE A LISTA PEGAVA CÔMODO JUNTO. Achado em 13/10/2026 pela bancada de leitura
// (scripts/bancada-area-escrita.ts): numa planta de 7 cômodos a ÁREA DE SERVIÇO não voltava.
// A regra começava em "área", e levava também Área gourmet, Área de lazer e Churrasqueira --
// que não são balão nenhum: são cômodo, e dos que vendem imóvel no Brasil.
//
// O descarte é SILENCIOSO: some um cômodo do rascunho e ninguém sabe por quê. Por isso tem
// teste próprio, com as duas listas explícitas.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-planta-lida.ts

import { avisoDaLeitura, limparLeitura, plantaDaLeitura, LIMITES_LEITURA } from "../src/lib/planta-lida.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Monta a resposta do modelo com um cômodo só, pra testar o filtro de nome. */
const comNome = (nome: string) => limparLeitura({ comodos: [{ nome, x: 0, y: 0, largura: 3, altura: 2, medida_lida: true }], tem_cotas: true });
const passa = (nome: string) => comNome(nome).comodos.length === 1;

// ---- CÔMODO DE VERDADE NÃO PODE SUMIR ----
//
// Cada um destes estava sendo descartado antes de 13/10/2026.
for (const nome of [
  "Área de serviço",
  "Area de servico",
  "Área gourmet",
  "Área de lazer",
  "Área de festas",
  "Área externa",
  "Espaço gourmet",
  "Churrasqueira",
]) {
  conferir(passa(nome), `"${nome}" é cômodo e continua no rascunho`);
}

// e os óbvios, que nunca estiveram em risco
for (const nome of ["Sala", "Cozinha", "Quarto 1", "Suíte", "Banheiro", "Varanda", "Garagem", "Closet", "Lavabo", "Quintal"]) {
  conferir(passa(nome), `"${nome}" passa`);
}

// ---- BALÃO TÉCNICO CONTINUA BARRADO ----
//
// O caso que fez a lista existir, e os vizinhos dele. Se algum destes voltar a passar, a
// planta ganha cômodo que não existe -- e área que não existe no anúncio.
for (const nome of [
  "Laje técnica",
  "Laje impermeabilizada",
  "Ponto de ar condicionado",
  "Infra para persiana",
  "Shaft",
  "Duto de ventilação",
  "Prumada hidráulica",
  "Poço de ventilação",
  "Projeção do pavimento",
  "Acesso de serviço",
  "Tomada 220v",
  "Guarda-corpo",
  "Piso elevado",
  "Área técnica",
]) {
  conferir(!passa(nome), `"${nome}" NÃO é cômodo e é barrado`);
}

// ---- a exceção vem ANTES do bloqueio ----
//
// Exceção que roda depois do bloqueio não é exceção. Esta linha guarda a ordem.
conferir(passa("Área de serviço") && !passa("Área técnica"), "a exceção é cirúrgica: libera 'de serviço' sem liberar 'técnica'");

// ---- o resto do saneamento continua de pé ----
conferir(limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 0, altura: 2 }] }).comodos.length === 0, "cômodo sem largura é descartado");
conferir(limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 999, altura: 2 }] }).comodos.length === 0, "cômodo maior que o possível é descartado", `teto ${LIMITES_LEITURA.ladoMax} m`);
conferir(limparLeitura({ comodos: [] }).comodos.length === 0, "resposta vazia não quebra");
conferir(limparLeitura("isto não é objeto").comodos.length === 0, "resposta que não é objeto não quebra");
conferir(limparLeitura({ comodos: [{ nome: "", x: 0, y: 0, largura: 3, altura: 2 }] }).comodos[0]?.nome === "Cômodo", "cômodo sem nome vira 'Cômodo' em vez de sumir");

// ---- centímetros viram metros, mas só se TODOS estiverem absurdos ----
{
  const cm = limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 420, altura: 350 }, { nome: "Cozinha", x: 0, y: 0, largura: 300, altura: 250 }] });
  conferir(cm.comodos.length === 2 && Math.abs(cm.comodos[0].largura - 4.2) < 0.01, "planta inteira em centímetros é convertida", `${cm.comodos[0]?.largura} m`);
  conferir(/cent[íi]metros/i.test(cm.observacao ?? ""), "e a pessoa é avisada da conversão");
}
{
  // meia conversão é pior que nenhuma: um absurdo no meio de medidas normais é erro daquele
  // cômodo, não unidade trocada da planta
  const meio = limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4.2, altura: 3.5 }, { nome: "Cozinha", x: 0, y: 0, largura: 300, altura: 250 }] });
  conferir(meio.comodos.length === 1, "um cômodo absurdo no meio de medidas normais sai, sem converter a planta toda", `sobrou ${meio.comodos.length}`);
}

// ---- PORTAS E JANELAS ----
//
// Antes de 13/10/2026 a leitura devolvia os cômodos e NENHUMA abertura: numa planta de seis
// cômodos a pessoa repunha umas dez na mão. O pedido dele foi direto: "ao ler a planta, ele
// não consegue diferenciar onde acaba a parede, tem portas janelas".
{
  const l = limparLeitura({
    comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4, altura: 3, medida_lida: true }],
    aberturas: [
      { tipo: "porta", x: 2, y: 0.05, largura: 0.9 },
      { tipo: "janela", x: 0.03, y: 1.5, largura: 1.4 },
      { tipo: "porta", x: 50, y: 50, largura: 0.8 },
    ],
    tem_cotas: true,
  });
  conferir(l.aberturas.length === 3, "as três aberturas passam pelo saneamento", String(l.aberturas.length));

  const planta = plantaDaLeitura(l);
  conferir(planta.aberturas.length === 2, "a que está longe de qualquer parede NÃO entra na planta", `${planta.aberturas.length} entraram`);
  const porta = planta.aberturas.find((a) => a.tipo === "porta");
  conferir(!!porta && Math.abs(porta.p.y) < 0.01, "a porta ENCOSTA na parede (y=0), em vez de ficar 5 cm dentro do cômodo", porta ? `y=${porta.p.y}` : "");
  conferir(!!porta && Math.abs(porta.angulo % 180) < 0.01, "e ganha o ângulo da parede, sem a pessoa girar", porta ? `${porta.angulo}°` : "");
  const janela = planta.aberturas.find((a) => a.tipo === "janela");
  conferir(!!janela && Math.abs(Math.abs(janela.angulo) - 90) < 0.01, "a janela na parede vertical sai em pé", janela ? `${janela.angulo}°` : "");
}

// largura fora do humano é erro de leitura, não porta exótica
{
  const l = limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4, altura: 3 }], aberturas: [{ tipo: "porta", x: 1, y: 0, largura: 12 }] });
  conferir(l.aberturas[0]?.largura === 0.8, "porta de 12 m vira porta de 0,8 m em vez de entrar assim", String(l.aberturas[0]?.largura));
}
conferir(limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4, altura: 3 }] }).aberturas.length === 0, "resposta sem aberturas não quebra");

// ---- o aviso não promete mais do que foi medido ----
//
// Medido na bancada: 10 das 21 portas e janelas desenhadas chegam a menos de 80 cm do lugar
// certo. As outras caem numa parede -- o código encosta elas --, às vezes na errada. É muito
// melhor que o que havia antes (nenhuma), e está longe de exato. Quem descobre esse limite
// sozinho passa a conferir tudo, inclusive o que está certo.
{
  const com = avisoDaLeitura(
    limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4, altura: 3, medida_lida: true }], aberturas: [{ tipo: "porta", x: 2, y: 0, largura: 0.8 }], tem_cotas: true })
  );
  conferir(/palpite/.test(com ?? ""), "com aberturas, o aviso as chama de palpite", String(com).slice(-70));
  conferir(/arraste/.test(com ?? ""), "e diz o que fazer com elas: arrastar");
  const sem = avisoDaLeitura(limparLeitura({ comodos: [{ nome: "Sala", x: 0, y: 0, largura: 4, altura: 3, medida_lida: true }], tem_cotas: true }));
  conferir(!/palpite/.test(sem ?? ""), "sem aberturas, o aviso não fala delas", String(sem).slice(0, 55));
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
