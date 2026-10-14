// DÁ PRA CONSERTAR A PLANTA DEPOIS DE PRONTA?
//
// Ele em 13/10/2026, testando a leitura de uma planta pela IA: "não é possível, caso erre na
// leitura automática, arrumar -- ter opção de editar paredes e etc", "quando escolho o lugar
// da porta não é possível pôr certinho a porta onde eu escolhi", "a movimentação é ruim".
//
// O editor sabia CRIAR e APAGAR, e nada no meio. Numa planta desenhada do zero isso passa.
// Numa planta LIDA, que chega quase certa e precisa de ajuste fino, é o que decide se a
// leitura serve pra alguma coisa -- ou se a pessoa apaga tudo e desenha na mão.
//
// O caso que manda em tudo aqui: DOIS CÔMODOS QUE DIVIDEM PAREDE. É o que a leitura entrega
// e é onde a edição ingênua estraga a planta, abrindo um vão entre cômodos que eram colados.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-planta-edicao.ts

import {
  area,
  cantoEm,
  dividirParede,
  cantosJuntos,
  encaixarAbertura,
  moverCanto,
  moverParede,
  paredeEm,
  recolarAberturas,
  retangulo,
  TOLERANCIA_CANTO,
  type Abertura,
  type Comodo,
  type Ponto,
} from "../src/lib/planta.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const perto = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;
const pontoPerto = (p: Ponto, x: number, y: number, tol = 0.011) => perto(p.x, x, tol) && perto(p.y, y, tol);

// Sala 4×3 colada na Cozinha 2×3: dividem a parede em x=4, de y=0 a y=3.
const sala = (): Comodo => ({ id: "sala", nome: "Sala", pontos: retangulo({ x: 0, y: 0 }, { x: 4, y: 3 }) });
const cozinha = (): Comodo => ({ id: "coz", nome: "Cozinha", pontos: retangulo({ x: 4, y: 0 }, { x: 6, y: 3 }) });
const dois = () => [sala(), cozinha()];

// ---- achar o que está debaixo do dedo ----
conferir(!!cantoEm(dois(), { x: 4.05, y: 0.05 }, 0.3), "acha o canto perto do dedo");
conferir(pontoPerto(cantoEm(dois(), { x: 4.05, y: 0.05 }, 0.3)!, 4, 0), "e devolve a posição do CANTO, não a do dedo", "senão o canto pula pro dedo ao pegar");
conferir(cantoEm(dois(), { x: 2, y: 1.5 }, 0.3) === null, "no meio do cômodo não há canto nenhum");
{
  const pr = paredeEm(dois(), { x: 2, y: 0.05 }, 0.3);
  conferir(!!pr, "acha a parede perto do dedo");
  conferir(!!pr && perto(pr.a.y, 0) && perto(pr.b.y, 0), "e é a parede de baixo, não outra", pr ? `(${pr.a.x},${pr.a.y})-(${pr.b.x},${pr.b.y})` : "");
}
conferir(paredeEm(dois(), { x: 2, y: 1.5 }, 0.3) === null, "no meio do cômodo não há parede nenhuma");

// ---- o canto dividido é UM canto em dois cômodos ----
{
  const j = cantosJuntos(dois(), { x: 4, y: 0 });
  conferir(j.length === 2, "o canto em (4,0) pertence aos DOIS cômodos", `${j.length} achado(s)`);
  conferir(cantosJuntos(dois(), { x: 0, y: 0 }).length === 1, "e o canto de fora pertence só a um");
}

// ---- MOVER CANTO: a planta não pode rasgar ----
{
  const depois = moverCanto(dois(), { x: 4, y: 0 }, { x: 4.5, y: 0 });
  const s = depois[0].pontos;
  const c = depois[1].pontos;
  const cantoSala = s.find((p) => perto(p.y, 0) && p.x > 3);
  const cantoCoz = c.find((p) => perto(p.y, 0) && p.x > 3);
  conferir(!!cantoSala && pontoPerto(cantoSala, 4.5, 0), "a sala acompanhou o canto");
  conferir(!!cantoCoz && pontoPerto(cantoCoz, 4.5, 0), "E A COZINHA TAMBÉM -- a parede dividida continua dividida", "é o que impede a planta de rasgar");
  conferir(perto(area(depois[0].pontos) + area(depois[1].pontos), 12 + 6, 0.02), "a área total não mudou: um canto só andou de lado", `${(area(depois[0].pontos) + area(depois[1].pontos)).toFixed(2)} m²`);
}

// mover um canto que ninguém divide mexe só no dono
{
  const depois = moverCanto(dois(), { x: 0, y: 0 }, { x: -1, y: -1 });
  conferir(area(depois[0].pontos) > 12, "canto externo cresceu a sala", `${area(depois[0].pontos).toFixed(2)} m²`);
  conferir(perto(area(depois[1].pontos), 6), "e não encostou na cozinha", `${area(depois[1].pontos).toFixed(2)} m²`);
}

// canto que não existe não inventa nada
conferir(moverCanto(dois(), { x: 99, y: 99 }, { x: 0, y: 0 })[0].pontos.length === 4, "mover canto inexistente não estraga o cômodo");

// ---- MOVER PAREDE: as duas pontas de uma vez ----
{
  // a parede dividida (x=4) empurrada 1 m pra direita: a sala cresce, a cozinha encolhe
  const depois = moverParede(dois(), { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 1, y: 0 });
  conferir(perto(area(depois[0].pontos), 15), "empurrando a parede do meio, a sala virou 5×3", `${area(depois[0].pontos).toFixed(2)} m²`);
  conferir(perto(area(depois[1].pontos), 3), "e a cozinha virou 1×3", `${area(depois[1].pontos).toFixed(2)} m²`);
  conferir(perto(area(depois[0].pontos) + area(depois[1].pontos), 18), "o imóvel inteiro continua com a mesma área: a parede andou, não sumiu");
}
{
  // A PAREDE EXTERNA DE BAIXO PUXADA PRA BAIXO, e aqui mora a decisão de desenho.
  //
  // Essa parede vai de (0,0) a (4,0), e (4,0) é o canto DIVIDIDO com a cozinha. Puxando ela,
  // a cozinha acompanha por aquele canto e a parede de baixo dela fica inclinada. Minha
  // primeira versão deste teste exigia o contrário -- que a cozinha ficasse intacta --, e
  // estava errada: pra isso acontecer, o canto dividido teria que ficar pra trás, que é
  // exatamente RASGAR a planta, o defeito que esta parte do código existe pra evitar.
  //
  // A regra que fica, porque é a única previsível: mover parede move os dois cantos dela, e
  // canto dividido leva o vizinho junto. A pessoa vê acontecer e desfaz se não quis.
  const depois = moverParede(dois(), { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -1 });
  conferir(perto(area(depois[0].pontos), 16), "parede externa puxada: a sala virou 4×4", `${area(depois[0].pontos).toFixed(2)} m²`);
  conferir(perto(area(depois[1].pontos), 7), "a cozinha acompanhou pelo canto dividido, em vez de descolar", `${area(depois[1].pontos).toFixed(2)} m²`);
  const pontaCozinha = depois[1].pontos.find((p) => perto(p.x, 4) && p.y < 0);
  conferir(!!pontaCozinha, "e o canto dividido continua sendo UM canto só nos dois cômodos");
}
{
  // PAREDE CURTA, as duas pontas dentro da tolerância uma da outra: mover a primeira e só
  // depois procurar a segunda acharia o canto JÁ deslocado e colapsaria a parede.
  const curto: Comodo[] = [{ id: "x", nome: "", pontos: [{ x: 0, y: 0 }, { x: 0.05, y: 0 }, { x: 0.05, y: 1 }, { x: 0, y: 1 }] }];
  const depois = moverParede(curto, { x: 0, y: 0 }, { x: 0.05, y: 0 }, { x: 0, y: -1 }, 0.08);
  const ys = depois[0].pontos.map((p) => p.y).sort();
  conferir(perto(ys[0], -1) && perto(ys[1], -1), "parede mais curta que a tolerância move as DUAS pontas", ys.join(" · "));
}

// ---- DIVIDIR A PAREDE: o que faltava pra não "mover tudo" ----
//
// Ele em 14/10/2026: "quando tento tirar uma parte da parede, move tudo". A parede é uma
// aresta com duas pontas -- arrastar qualquer uma move o trecho inteiro. Pra mexer só num
// pedaço tem que existir um canto ali, e não havia como criar.
{
  const depois = dividirParede(dois(), { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0.05 });
  conferir(depois[0].pontos.length === 5, "a sala ganhou um canto: 4 vira 5", String(depois[0].pontos.length));
  const novo = depois[0].pontos.find((p) => perto(p.x, 2) && perto(p.y, 0));
  conferir(!!novo, "e ele está em cima da parede, não onde o dedo caiu", "o dedo estava 5 cm pra dentro");
  conferir(perto(area(depois[0].pontos), 12), "a área não mudou: dividir não deforma", `${area(depois[0].pontos).toFixed(2)} m²`);
}

// a parede DIVIDIDA entre dois cômodos ganha o canto NOS DOIS
{
  const depois = dividirParede(dois(), { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 4, y: 1.5 });
  conferir(depois[0].pontos.length === 5, "a sala ganhou o canto", String(depois[0].pontos.length));
  conferir(depois[1].pontos.length === 5, "E A COZINHA TAMBÉM -- senão os dois deixam de dividir a parede", String(depois[1].pontos.length));
  // e depois de dividir, mover o canto novo mexe só nele
  const movido = moverCanto(depois, { x: 4, y: 1.5 }, { x: 4.8, y: 1.5 });
  conferir(perto(area(movido[0].pontos), 12 + 0.8 * 1.5), "movendo só o canto novo, a sala ganha um bico -- não a parede inteira", `${area(movido[0].pontos).toFixed(2)} m²`);
  conferir(movido[0].pontos.filter((p) => perto(p.x, 4)).length === 2, "as duas pontas originais ficaram onde estavam", "é isto que 'mover tudo' deixa de acontecer");
}

// dividir rente à ponta não cria canto nenhum: criaria dois no mesmo lugar e uma parede de
// comprimento zero, que ninguém consegue pegar depois
for (const quase of [{ x: 0.02, y: 0 }, { x: 3.98, y: 0 }]) {
  conferir(dividirParede(dois(), { x: 0, y: 0 }, { x: 4, y: 0 }, quase)[0].pontos.length === 4, `dividir rente à ponta (${quase.x}) não faz nada`);
}
conferir(dividirParede(dois(), { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 9 })[0].pontos.length === 5, "o ponto longe da parede ainda divide, projetado nela", "é o dedo errando, não intenção diferente");
conferir(dividirParede(dois(), { x: 9, y: 9 }, { x: 9, y: 8 }, { x: 9, y: 8.5 })[0].pontos.length === 4, "parede que não existe não divide nada");

// ---- A PORTA FICA ONDE EU CLIQUEI ----
//
// A queixa literal: "quando escolho o lugar da porta não é possível pôr certinho onde eu
// escolhi". A causa era o ponto passar antes pelo grude de canto (até 0,42 m) e pelo
// arredondamento de 25 em 25 cm ao longo da parede.
{
  const e = encaixarAbertura({ x: 0.37, y: 0.04 }, dois());
  conferir(!!e, "a porta encaixa na parede de baixo");
  conferir(!!e && pontoPerto(e.p, 0.37, 0), "e fica em 0,37 m -- NÃO pula pro canto (0,0) nem pro passo de 0,25", e ? `${e.p.x} m` : "");
  conferir(!!e && perto(e.angulo, 0), "com o ângulo da parede, sem a pessoa girar nada", e ? `${e.angulo}°` : "");
}
{
  // parede vertical: o ângulo tem de sair 90, senão a porta aparece deitada
  const e = encaixarAbertura({ x: 6.03, y: 1.8 }, dois());
  conferir(!!e && pontoPerto(e.p, 6, 1.8), "na parede vertical também fica onde clicou", e ? `(${e.p.x}, ${e.p.y})` : "");
  conferir(!!e && (perto(Math.abs(e.angulo), 90)), "e sai em pé, não deitada", e ? `${e.angulo}°` : "");
}
// vários pontos seguidos ao longo da MESMA parede têm de dar posições diferentes: é isto que
// "não dá pra pôr certinho" quer dizer na prática -- antes, 1,10 e 1,20 caíam no mesmo lugar.
{
  const xs = [1.1, 1.2, 1.3, 1.4].map((x) => encaixarAbertura({ x, y: 0.03 }, dois())?.p.x ?? -1);
  conferir(new Set(xs).size === 4, "quatro toques próximos dão quatro posições diferentes", xs.join(" · "));
}
conferir(encaixarAbertura({ x: 3, y: 9 }, dois()) === null, "longe de qualquer parede, não encaixa nada");

// ---- depois de mexer na parede, a porta volta pra ela ----
{
  const aberturas: Abertura[] = [{ id: "p1", tipo: "porta", p: { x: 2, y: 0 }, angulo: 0, largura: 0.8, lado: 1, giro: 1 }];
  const depois = moverParede(dois(), { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -0.5 });
  const recoladas = recolarAberturas(aberturas, depois);
  conferir(perto(recoladas[0].p.y, -0.5), "a porta acompanhou a parede que foi movida", `y=${recoladas[0].p.y}`);
  conferir(perto(recoladas[0].p.x, 2), "e continuou na mesma posição ao longo dela", `x=${recoladas[0].p.x}`);
}
{
  // abertura longe de tudo fica onde está, em vez de saltar pra uma parede alheia
  const solta: Abertura[] = [{ id: "p2", tipo: "janela", p: { x: 20, y: 20 }, angulo: 0, largura: 1.2 }];
  conferir(pontoPerto(recolarAberturas(solta, dois())[0].p, 20, 20), "abertura perdida no vazio não salta pra parede de outro cômodo");
}

// ---- a tolerância é de CANTO, não de parede ----
conferir(TOLERANCIA_CANTO < 0.1, "a tolerância de canto é centimétrica", `${TOLERANCIA_CANTO} m`);
{
  // dois cantos a 20 cm um do outro são cantos DIFERENTES: a leitura da IA erra assim, e
  // fundir os dois esconderia o erro em vez de deixar a pessoa corrigir
  const quase: Comodo[] = [sala(), { id: "c2", nome: "", pontos: retangulo({ x: 4.2, y: 0 }, { x: 6, y: 3 }) }];
  conferir(cantosJuntos(quase, { x: 4, y: 0 }).length === 1, "canto a 20 cm não é o mesmo canto", "é erro de leitura pra pessoa consertar, não pra gente fundir");
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
