// MONTAR O VÍDEO SOZINHO: as regras, sem rede e sem banco.
//
// Aqui mora a parte que NÃO pode variar entre execuções: ordem, descarte, capa, movimento e
// duração. A IA só diz o que é cada foto; se a decisão também fosse dela, o mesmo conjunto de
// fotos daria uma ordem hoje e outra amanhã, e o corretor veria o vídeo mudar sem ter mexido.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-video-automatico.ts

import { sugerirMontagem, efeitoDe, legendaDe, ORDEM_DO_PASSEIO, type Olhada } from "../src/lib/video-automatico";

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
conferir(semFachada.capa === "b", "sem fachada, a capa é a foto de maior nota", `${semFachada.capa} (cozinha, nota 9)`);

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

// ---- 7. a capa segura mais tempo ----
const capa = s.cenas.find((c) => c.chave === s.capa)!;
const outra = s.cenas.find((c) => c.chave !== s.capa)!;
conferir(capa.duracao > outra.duracao, "a capa fica mais tempo que as outras", `${capa.duracao}s contra ${outra.duracao}s`);

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

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
