// As regras da obra, conferidas no texto que vai pro modelo.
//
// Prompt não tem tipo: se uma restrição cair fora, nada quebra -- só volta uma imagem
// errada, meses depois, no anúncio de alguém. Por isso as regras que importam são
// afirmadas aqui, sobre a string final.
//
// A que mais importa: a etapa final NUNCA leva gente, nem quando a pessoa pediu equipe.
// Pessoa em obra é operário; pessoa em casa pronta é morador, e morador inventado num
// anúncio é personagem vendendo um imóvel onde ele não mora.
//
// A segunda que mais importa: o prompt não pode mandar apagar marca d'água. A primeira
// foto real que entrou aqui tinha a marca da imobiliária que fotografou o lote.

import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..");
const { ETAPAS_OBRA, ETAPA_OBRA_POR_ID, CUSTO_OBRA, proximaEtapa } = await import(
  pathToFileURL(path.join(RAIZ, "src/lib/obra-etapas.ts")).href
);

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const COM = { tipo: "sobrado", estilo: "colonial", equipe: "1" };
const SEM = { tipo: "sobrado", estilo: "colonial", equipe: "" };

console.log("--- a sequência ---");
conferir(ETAPAS_OBRA.length === 4, "quatro etapas", String(ETAPAS_OBRA.length));
conferir(
  ETAPAS_OBRA.every((e, i) => e.ordem === i + 1),
  "em ordem, sem buraco",
  ETAPAS_OBRA.map((e) => `${e.ordem}:${e.id}`).join(" ")
);
conferir(CUSTO_OBRA === ETAPAS_OBRA.length, "o custo é uma imagem por etapa", `${CUSTO_OBRA} créditos`);
conferir(proximaEtapa(null).id === "obra_fundacao", "a obra começa na fundação");
conferir(proximaEtapa("obra_cobertura").id === "obra_pronta", "cobertura leva a casa pronta");
conferir(proximaEtapa("obra_pronta") === null, "depois de pronta não tem próxima");
conferir(proximaEtapa("nao_existe") === null, "id desconhecido não inventa etapa");

console.log("\n--- gente na obra ---");
const fundacaoCom = ETAPA_OBRA_POR_ID.obra_fundacao.prompt(COM, "nenhuma");
const fundacaoSem = ETAPA_OBRA_POR_ID.obra_fundacao.prompt(SEM, "nenhuma");
conferir(/construction workers/.test(fundacaoCom), "com equipe ligada, a fundação tem operários");
conferir(/no recognizable faces/.test(fundacaoCom), "e eles não têm rosto reconhecível");
conferir(/seen from a distance/.test(fundacaoCom), "e aparecem de longe");
conferir(/Do not include any people/.test(fundacaoSem), "com equipe desligada, ninguém aparece");

const prontaCom = ETAPA_OBRA_POR_ID.obra_pronta.prompt(COM, "nenhuma");
conferir(!/construction workers/.test(prontaCom), "a casa PRONTA não leva operário nem com equipe ligada");
conferir(/Do not include any people/.test(prontaCom), "a casa PRONTA proíbe pessoas explicitamente");

console.log("\n--- o lugar não pode mudar ---");
for (const etapa of ETAPAS_OBRA) {
  const p = etapa.prompt(COM, "nenhuma");
  const mantem = /Keep the plot, the terrain shape and slope/.test(p) && /same camera position/.test(p) && /same sunlight direction/.test(p);
  conferir(mantem, `${etapa.id}: mantém terreno, câmera e luz`);
}

console.log("\n--- marca d'água dos outros ---");
for (const etapa of ETAPAS_OBRA) {
  const p = etapa.prompt(COM, "nenhuma");
  conferir(/Do not add any text/.test(p), `${etapa.id}: proíbe INVENTAR texto`);
  conferir(/do not remove or alter the photographer's or the agency's watermark/.test(p), `${etapa.id}: e proíbe apagar a marca de quem fotografou`);
  // Distinção que o primeiro teste real obrigou a fazer: o selo "Imagem ilustrativa" é
  // nosso e volta sozinho a cada etapa; a marca d'água da imobiliária é de terceiro.
  conferir(/Imagem ilustrativa" sits along the bottom edge/.test(p), `${etapa.id}: e manda não copiar o NOSSO selo da etapa anterior`);
  // A frase antiga. Numa foto com marca d'água de terceiro, ela vira ordem de apagar.
  conferir(!/no watermark\b/.test(p), `${etapa.id}: não manda "no watermark" (isso apagaria a marca alheia)`);
}

console.log("\n--- é a MESMA casa subindo ---");
for (const id of ["obra_estrutura", "obra_cobertura", "obra_pronta"]) {
  const p = ETAPA_OBRA_POR_ID[id].prompt(COM, "nenhuma");
  conferir(/same house, (one stage later|completed)/.test(p), `${id}: diz ao modelo que é a mesma casa da imagem`);
  conferir(/same footprint/.test(p), `${id}: trava a planta baixa da etapa anterior`);
}

console.log("\n--- o projeto viaja em todas as etapas ---");
for (const etapa of ETAPAS_OBRA) {
  const p = etapa.prompt(COM, "nenhuma");
  conferir(/two-storey house/.test(p) && /colonial/.test(p), `${etapa.id}: carrega tipo e estilo escolhidos`);
}
conferir(
  ETAPAS_OBRA.every((e) => (e.campos ?? []).some((c) => c.chave === "tipo") && (e.campos ?? []).some((c) => c.chave === "estilo")),
  "e as quatro pedem os mesmos campos"
);

console.log("\n--- o selo ---");
conferir(
  ETAPAS_OBRA.every((e) => /Imagem ilustrativa/.test(e.selo)),
  "toda etapa sai carimbada como ilustração"
);
conferir(
  /não existe no terreno|não incluída no terreno/.test(ETAPA_OBRA_POR_ID.obra_pronta.selo),
  "e a casa pronta avisa que não vem com o lote",
  ETAPA_OBRA_POR_ID.obra_pronta.selo
);

console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exitCode = falhas ? 1 : 0;
