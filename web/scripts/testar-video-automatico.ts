// MONTAR O VÍDEO SOZINHO: as regras, sem rede e sem banco.
//
// Aqui mora a parte que NÃO pode variar entre execuções: ordem, descarte, capa, movimento e
// duração. A IA só diz o que é cada foto; se a decisão também fosse dela, o mesmo conjunto de
// fotos daria uma ordem hoje e outra amanhã, e o corretor veria o vídeo mudar sem ter mexido.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-video-automatico.ts

import { sugerirMontagem, efeitoDe, animacaoDe, legendaDe, duracaoDaPosicao, ORDEM_DO_PASSEIO, type Olhada } from "../src/lib/video-automatico";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const foto = (chave: string, ambiente: string | null, qualidade = 8, extra: Partial<Olhada> = {}): Olhada => ({
  chave,
  ambiente,
  qualidade,
  legenda: "",
  ...extra,
});

// As dez fotos do teste dele, na ordem BAGUNÇADA em que saíram do celular.
const DEZ: Olhada[] = [
  foto("a", "banheiro", 7),
  foto("b", "cozinha", 9),
  foto("c", "quarto", 6),
  foto("d", "fachada", 9),
  foto("e", "quarto", 8),
  foto("f", "gourmet", 8),
  foto("g", "sala", 8),
  foto("h", "banheiro", 5),
  foto("i", "quintal", 7),
  foto("j", "entrada", 7),
];

const s = sugerirMontagem(DEZ, 4);
console.log(`ordem: ${s.ordem.join(" ")}`);

// ---- 1. a ordem é a da visita ----
const pos = (c: string) => s.ordem.indexOf(c);
conferir(pos("d") === 0, "a fachada abre o vídeo", `posição ${pos("d")}`);

// O VÍDEO SE APRESENTA ANTES DE ENTRAR. Ele viu um conjunto sem fachada abrir numa cozinha
// e reclamou: "acho estranho a sequência começar pela parte interna". A primeira cena é a
// CAPA -- quem foi escolhido pra abrir -- e o resto segue a visita.
const semFora = sugerirMontagem([foto("ban", "banheiro", 9), foto("coz", "cozinha", 9), foto("qui", "quintal", 6)], 4);
conferir(semFora.ordem[0] === "qui", "sem fachada, abre pela área externa e não pela cozinha", `abriu em ${semFora.ordem[0]}`);
conferir(semFora.ordem[0] === semFora.capa, "a primeira cena é sempre a capa");
const soDentro = sugerirMontagem([foto("ban2", "banheiro", 9), foto("qua", "quarto", 7), foto("sal", "sala", 6)], 4);
conferir(soDentro.ordem[0] === "sal", "só com fotos internas, abre pela sala e não pelo banheiro", `abriu em ${soDentro.ordem[0]}`);
conferir(s.ordem[s.ordem.length - 1] === "i", "e o encerramento cai na área externa", `terminou em ${s.ordem[s.ordem.length - 1]} (quintal)`);
conferir(pos("j") < pos("g"), "a entrada vem antes da sala");
conferir(pos("g") < pos("b"), "a sala vem antes da cozinha");
conferir(pos("b") < pos("e"), "a cozinha vem antes dos quartos");
conferir(pos("e") < pos("a"), "os quartos vêm antes dos banheiros");
conferir(pos("a") < pos("f") && pos("f") < pos("i"), "e a área externa fecha", "banheiro < gourmet < quintal");
conferir(s.ordem.length === DEZ.length, "as dez entraram", `${s.ordem.length}`);

// ---- 2. desempate pela nota, dentro do mesmo ambiente ----
conferir(pos("e") < pos("c"), "entre dois quartos, o de nota melhor vem primeiro", "nota 8 antes da 6");

// ---- 3. a capa ----
conferir(s.capa === "d", "a capa é a melhor fachada", String(s.capa));
const semFachada = sugerirMontagem(DEZ.filter((f) => f.ambiente !== "fachada"), 4);
conferir(semFachada.capa === "f", "sem fachada, a capa é a área externa, não a nota mais alta", `${semFachada.capa} (gourmet, nota 8) em vez de b (cozinha, nota 9)`);

// O QUE MOTIVOU A REGRA: num teste com fotos REAIS dele, a maior nota era um BANHEIRO, e o
// automático escolheu banheiro como capa de um anúncio de imóvel.
const soBanheiroEQuintal = sugerirMontagem([foto("ban", "banheiro", 10), foto("qui", "quintal", 6)], 4);
conferir(soBanheiroEQuintal.capa === "qui", "banheiro nota 10 NÃO vira capa na frente de um quintal nota 6", String(soBanheiroEQuintal.capa));
const doisQuintais = sugerirMontagem([foto("q1", "quintal", 5), foto("q2", "quintal", 9)], 4);
conferir(doisQuintais.capa === "q2", "mas dentro do MESMO ambiente, a nota manda", String(doisQuintais.capa));

// ---- 4. o descarte, e o AVISO do descarte ----
const comRuim = sugerirMontagem([...DEZ, foto("x", "sala", 1), foto("p", "planta", 9)], 4);
conferir(!comRuim.ordem.includes("x"), "foto escura fica de fora");
conferir(!comRuim.ordem.includes("p"), "planta baixa não entra no passeio");
conferir(comRuim.fora.length === 2 && comRuim.fora.every((f) => !!f.motivo), "e as duas saem COM MOTIVO, pra tela poder dizer", comRuim.fora.map((f) => `${f.chave}: ${f.motivo}`).join(" · "));

// ---- 5. o movimento segue o ambiente ----
conferir(efeitoDe(foto("_", "fachada")) === "afastar", "fachada abre o quadro (afastar)");
conferir(efeitoDe(foto("_", "cozinha")) === "aproximar", "cozinha fecha no acabamento (aproximar)");
conferir(efeitoDe(foto("_", "sala")) === "afastar", "sala abre");
conferir(efeitoDe(foto("_", null)) === "aproximar", "ambiente desconhecido tem movimento mesmo assim");
conferir(efeitoDe(foto("_", "sala", 8, { ehPanoramica: true })) === "direita", "panorâmica desliza em vez de aproximar (aproximar cortaria as pontas)");
conferir(efeitoDe(foto("_", "sala", 8, { eh360: true })) === "parado", "360 não ganha movimento de cima: já tem o próprio");

// ---- 6. a legenda ----
conferir(legendaDe(foto("_", "gourmet")) === "Área gourmet", "a legenda é o nome do ambiente");
conferir(legendaDe(foto("_", null, 8, { legenda: "sala com lareira" })) === "sala com lareira", "sem ambiente, vale a legenda da IA");
conferir(legendaDe(foto("_", null, 8, { legenda: "sala de 32 m2" })) === "", "legenda com NÚMERO é cortada: número é afirmação sobre o imóvel");
conferir(legendaDe(foto("_", "sala", 8, { ehClipe: true })) === "", "clipe não ganha legenda automática");

// ---- 7. o RITMO: abertura e fim seguram, o miolo corre ----
//
// Medido no vídeo que ele tomou como referência em 23/09/2026, e confirmado pela tela do
// concorrente, que declara foto por foto: 4 · 4 · 4 · 3 · 3 · 3 · 3 · 4 · 4 · 4 = 36 s.
//
// Antes era a CAPA que segurava mais (4 × 1,25 = 5 s) e o resto igual. Aquilo dava uma
// abertura longa e um corpo de slides; isto dá a curva que quem edita vídeo usa: tempo pra
// prender, velocidade pra não cansar, ar pra assentar antes da tela de contato.
const RITMO = Array.from({ length: 10 }, (_, i) => duracaoDaPosicao(i, 10, 4));
conferir(JSON.stringify(RITMO) === JSON.stringify([4, 4, 4, 3, 3, 3, 3, 4, 4, 4]), "10 cenas seguem o ritmo 4-4-4-3-3-3-3-4-4-4", RITMO.join("·"));
conferir(RITMO.reduce((a, b) => a + b, 0) === 36, "e somam os mesmos 36 s da referência", `${RITMO.reduce((a, b) => a + b, 0)}s`);
// CONTROLE: com a conta antiga (tudo igual, capa 25% maior) davam 41 s -- 5 s a mais, e
// nenhuma cena curta. Se este controle não acusar, o teste acima não sabe o que mudou.
const ANTIGO = 4 * 1.25 + 9 * 4;
conferir(ANTIGO > 36, "controle: a conta antiga dava um vídeo mais longo", `${ANTIGO}s contra 36s`);
// Vídeo curto não tem miolo pra correr: seis cenas são todas abertura e fim.
conferir(Array.from({ length: 6 }, (_, i) => duracaoDaPosicao(i, 6, 4)).every((d) => d === 4), "vídeo de até 6 cenas fica todo no tempo cheio");
// E o piso: a duração mínima da cena é 3 s, nunca menos, mesmo com padrão baixo.
conferir(duracaoDaPosicao(4, 10, 3) === 3, "com padrão de 3 s o miolo não cai pra 2 s");

// ---- 7b. o MOTIVO de cada cena, que é o que a tela mostra ----
const comMotivo = sugerirMontagem(DEZ, 4);
const motivos = comMotivo.cenas.map((c) => c.motivo);
conferir(motivos.every((m) => m.length > 0), "toda cena sai com um motivo escrito");
conferir(/Abre o vídeo/.test(motivos[0] ?? ""), "a primeira diz que abre o vídeo", motivos[0]);
conferir(/Fecha o vídeo/.test(motivos[motivos.length - 1] ?? ""), "a última diz que fecha", motivos[motivos.length - 1]);
// Duas fotos do mesmo ambiente não podem repetir a mesma frase: é o que denuncia texto de molde.
// A piscina vira capa e abre; o banheiro entra DEPOIS dos quartos, pra que o segundo quarto
// nao caia na ultima posicao -- la quem manda e a funcao de fechar, nao a repeticao.
const doisQuartos = sugerirMontagem([foto("a", "sala"), foto("q1", "quarto", 9), foto("q2", "quarto", 7), foto("b", "banheiro", 6), foto("p", "piscina")], 4);
const q2 = doisQuartos.cenas.find((c) => c.chave === "q2")!;
conferir(/Segundo quarto/.test(q2.motivo), "o segundo quarto se apresenta como segundo", q2.motivo);
conferir(doisQuartos.cenas.find((c) => c.chave === "q1")!.motivo !== q2.motivo, "e nao repete a frase do primeiro");

// GENERO. A tela escreveu "Segundo cozinha" no teste com as fotos reais dele, e esse e o tipo
// de erro que um corretor brasileiro le como "robo escreveu isto".
const duasCozinhas = sugerirMontagem([foto("f", "fachada"), foto("c1", "cozinha", 9), foto("c2", "cozinha", 7), foto("p", "piscina")], 4);
const c2 = duasCozinhas.cenas.find((c) => c.chave === "c2")!;
conferir(/Segunda cozinha/.test(c2.motivo), "duas cozinhas dao SEGUNDA cozinha, no feminino", c2.motivo);
// E o ordinal nao pode colidir com o nome: a quarta foto de quarto seria "Quarto quarto".
const quatroQuartos = sugerirMontagem([foto("f", "fachada"), foto("q1", "quarto", 9), foto("q2", "quarto", 8), foto("q3", "quarto", 7), foto("q4", "quarto", 6), foto("p", "piscina")], 4);
const frases = quatroQuartos.cenas.filter((c) => c.chave.startsWith("q")).map((c) => c.motivo);
conferir(!frases.some((m) => /Quarto quarto/i.test(m)), "e nunca sai \"Quarto quarto\"", frases.join(" | "));

// A POSICAO manda na frase, mesmo quando a foto e repetida: quem fecha o video diz que fecha.
const doisFundos = sugerirMontagem([foto("f", "fachada"), foto("s", "sala"), foto("x1", "quintal", 9), foto("x2", "quintal", 7)], 4);
const ultima = doisFundos.cenas[doisFundos.cenas.length - 1];
conferir(/Fecha o v/.test(ultima.motivo), "a ultima cena diz que fecha, e nao que e a segunda", ultima.motivo);
// O motivo NUNCA pode inventar número: número é afirmação sobre o imóvel.
conferir(!motivos.some((m) => /\d/.test(m)), "nenhum motivo cita número", motivos.find((m) => /\d/.test(m)) ?? "");

// ---- 8. o que NÃO pode acontecer ----
const vazio = sugerirMontagem([], 4);
conferir(vazio.ordem.length === 0 && vazio.capa === null, "sem foto, não inventa nada");
const todasRuins = sugerirMontagem([foto("r1", "sala", 1), foto("r2", "cozinha", 0)], 4);
conferir(todasRuins.ordem.length === 2, "se TODAS reprovam, devolve todas em vez de deixar a pessoa sem vídeo", `${todasRuins.ordem.length} cenas`);
const soClipes = sugerirMontagem([foto("v", null, 0, { ehClipe: true })], 4);
conferir(soClipes.ordem.includes("v"), "clipe enviado de propósito não é descartado por nota");

// ---- 9. duas vezes o mesmo conjunto dá o MESMO resultado ----
// É a razão de a decisão ser do código e não da IA. Sem isto, refazer o vídeo muda a ordem.
const a1 = sugerirMontagem(DEZ, 4);
const a2 = sugerirMontagem([...DEZ].reverse(), 4);
conferir(JSON.stringify(a1.ordem) === JSON.stringify(a2.ordem), "a ordem não depende da ordem em que as fotos chegaram");

conferir(ORDEM_DO_PASSEIO.indexOf("salao") > ORDEM_DO_PASSEIO.indexOf("quarto"), "área comum vem depois do imóvel");

// ---- 10. a DIREÇÃO da câmera na cena animada ----
//
// 23/09/2026, comparando com o vídeo do concorrente: "tempo de caminhada, DIREÇÃO QUE VAI".
// Antes o estilo Tour punha "caminhar" em tudo -- inclusive na fachada, onde avançar a pé
// contra uma casa não é o que uma câmera faz, e no banheiro, onde andar pra frente bate na
// parede. A direção agora sai do ambiente.
conferir(animacaoDe(foto("_", "fachada")) === "drone", "a fachada é sobrevoo, não caminhada: de fora a câmera não entra andando");
conferir(animacaoDe(foto("_", "piscina")) === "drone", "a piscina também abre de cima");
conferir(animacaoDe(foto("_", "sala")) === "caminhar", "na sala a câmera entra andando");
conferir(animacaoDe(foto("_", "cozinha")) === "caminhar", "na cozinha também");
conferir(animacaoDe(foto("_", "banheiro")) === "aproximar", "banheiro aproxima com profundidade: andar 2 m ali bate na parede");
conferir(animacaoDe(foto("_", "closet")) === "aproximar", "closet idem");
conferir(animacaoDe(foto("_", null)) === "caminhar", "ambiente desconhecido entra andando, que é o movimento mais seguro");

// E a montagem entrega essa direção junto com o resto, senão a tela não teria de onde tirar.
const comDirecao = sugerirMontagem([foto("f", "fachada"), foto("q", "banheiro")], 4);
conferir(comDirecao.cenas.find((c) => c.chave === "f")?.animacao === "drone", "a montagem devolve a direção de cada cena");
conferir(comDirecao.cenas.find((c) => c.chave === "q")?.animacao === "aproximar", "e ela é diferente por ambiente");


// ---- 7c. A MESCLA: a camera cara so nas fotos que vendem ----
//
// 24/09/2026, ele observando o concorrente: "vi que nem todos eles usaram o efeito mais caro
// de tour, mesclam com aproximacao que da pra enganar; pegaram as imagens mais importantes e
// gastaram o tour mais caro, outras fizeram aproximacao".
//
// Eu tinha desaconselhado a mescla dizendo que o video ficaria remendado. A prova de que eu
// estava errado e o proprio video que ele chamou de ideal: metade dele e zoom, e ele nao
// percebeu. Isto trava a regra que saiu dai.
const mescla = sugerirMontagem(DEZ, 4);
const comCamera = mescla.cenas.filter((c) => c.camera);
conferir(comCamera.length === 4, "de 10 fotos, so 4 ganham a camera de IA", `${comCamera.length} de ${mescla.cenas.length}`);
conferir(mescla.cenas[0].camera, "a capa sempre ganha: e ela que decide se a pessoa assiste");
conferir(mescla.cenas[mescla.cenas.length - 1].camera, "e a ultima tambem: e a imagem que fica");

// Repeticao NUNCA ganha camera: o segundo quarto animado custa o mesmo e mostra a mesma coisa.
const repetido = mescla.cenas.find((c) => /mantem a sequencia|mant.m a sequ.ncia/.test(c.motivo));
conferir(!repetido || !repetido.camera, "foto repetida do MIOLO nao gasta camera", repetido ? repetido.motivo : "(sem repetida neste conjunto)");
// Mas a POSICAO manda: num conjunto com dois quintais, a ultima cena e o SEGUNDO quintal e
// mesmo assim leva a camera. Sem isto o video acabava num zoom e a camera cara ia pra cena 9,
// que ninguem lembra.
const fechaRepetida = sugerirMontagem([foto("f", "fachada"), foto("s", "sala"), foto("c", "cozinha"), foto("x1", "quintal", 9), foto("x2", "quintal", 7)], 4);
const ultimaCena = fechaRepetida.cenas[fechaRepetida.cenas.length - 1];
conferir(ultimaCena.camera, "a que FECHA leva camera mesmo sendo repetida do mesmo ambiente", ultimaCena.motivo);

// Banheiro nao gasta camera na frente de sala ou cozinha, por melhor que esteja a foto.
const comBanheiroBom = sugerirMontagem([foto("f", "fachada", 7), foto("s", "sala", 6), foto("c", "cozinha", 6), foto("b", "banheiro", 10), foto("q", "quarto", 6), foto("x", "quintal", 6)], 4);
const banheiro = comBanheiroBom.cenas.find((c) => c.chave === "b")!;
conferir(!banheiro.camera, "banheiro nota 10 nao toma a camera da sala nota 6", `banheiro camera=${banheiro.camera}`);

// O TETO segura o preco: nem 20 fotos passam de 4 cenas com camera.
const vinte = sugerirMontagem(Array.from({ length: 20 }, (_, i) => foto(`v${i}`, ORDEM_DO_PASSEIO[i % ORDEM_DO_PASSEIO.length], 8)), 4);
conferir(vinte.cenas.filter((c) => c.camera).length === 4, "20 fotos tambem param em 4 cenas com camera", `${vinte.cenas.filter((c) => c.camera).length}`);

// E video curto nao vira todo animado: seria mais caro POR FOTO que o de dez.
const tres = sugerirMontagem([foto("a", "fachada"), foto("b", "sala"), foto("c", "quintal")], 4);
conferir(tres.cenas.filter((c) => c.camera).length === 2, "video de 3 fotos gasta 2 cameras, nao 3", `${tres.cenas.filter((c) => c.camera).length}`);

// CONTROLE: animar TUDO custaria 20 creditos; a mescla custa 8. Se este controle nao acusar,
// os testes acima nao sabem o que mudou.
conferir(mescla.cenas.length * 2 === 20 && comCamera.length * 2 === 8, "controle: 20 creditos animando tudo contra 8 com a mescla");
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
