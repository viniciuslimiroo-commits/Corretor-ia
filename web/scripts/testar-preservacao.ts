// A ESTRUTURA DO IMÓVEL NÃO MUDA (lib/preservar.ts): o teste da regra que o dono fixou em
// 20/09/2026, depois de ver uma parede e umas janelas mudarem num "mobiliar".
//
// O que se prova aqui: (1) o contrato fala o nome de cada peça que não pode mexer; (2) toda
// ação do catálogo sai com ele colado no fim; (3) as TRÊS portas que geram imagem passam o
// prompt pela função -- foto, terreno e planta; (4) quem pede a mudança (editar com texto,
// refinar) ganha a versão com exceção; (5) colar duas vezes não duplica. Sem rede.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-preservacao.ts

import fs from "node:fs";
import path from "node:path";
import { ACOES, limparParametros } from "../src/lib/acoes.ts";
import { comEstruturaPreservada, ESTRUTURA_FIXA, ESTRUTURA_FIXA_SALVO_PEDIDO, PLANTA_FIXA, TERRENO_FIXO } from "../src/lib/preservar.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ler = (...p: string[]) => fs.readFileSync(path.join(RAIZ, "src", ...p), "utf8").replace(/\r\n/g, "\n");

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- 1. o contrato diz o nome de cada peça ----------
{
  // A lista que ele escreveu: janelas, portas, paredes, cômodos, telhado, piscina, muros, terreno.
  const pecas: [string, string[]][] = [
    ["janela", ["window"]],
    ["porta", ["door"]],
    ["parede", ["wall", "partition"]],
    ["cômodo", ["room outline", "room"]],
    ["teto e telhado", ["ceiling", "roof"]],
    ["piscina", ["pool"]],
    ["muro e portão", ["fence", "gate"]],
    ["escada", ["staircase"]],
  ];
  for (const [nome, termos] of pecas) {
    conferir(termos.some((t) => ESTRUTURA_FIXA.toLowerCase().includes(t)), `o contrato proíbe mexer em ${nome}`);
  }
  conferir(/same number of windows and doors/i.test(ESTRUTURA_FIXA), "e manda conferir a QUANTIDADE de janelas e portas (foi o que a IA inventou)");
  conferir(/camera angle|perspective/i.test(ESTRUTURA_FIXA), "e o ângulo da câmera");
  conferir(TERRENO_FIXO.includes("boundaries") && /slope|terrain/i.test(TERRENO_FIXO), "no terreno, os limites e o relevo do lote também são fixos");
  conferir(/do not add, remove, merge, resize or move any room/i.test(PLANTA_FIXA), "na planta humanizada, nenhum cômodo some, nasce ou muda de tamanho");
}

// ---------- 2. toda ação do catálogo sai com o contrato ----------
{
  for (const acao of ACOES) {
    const p = limparParametros(acao, {});
    const bruto = acao.prompt(p as never);
    const final = comEstruturaPreservada(bruto, acao.id === "editar_prompt" || acao.id === "refinar" ? ESTRUTURA_FIXA_SALVO_PEDIDO : ESTRUTURA_FIXA);
    if (!bruto.trim()) {
      conferir(final === "", `${acao.id}: sem prompt (upscale puro), nada a colar`);
      continue;
    }
    conferir(final.includes("STRUCTURE IS FIXED"), `${acao.id}: o pedido ao modelo termina com o contrato`);
  }
  const comExcecao = comEstruturaPreservada("Edit: paint the wall blue.", ESTRUTURA_FIXA_SALVO_PEDIDO);
  conferir(/single exception is what this instruction explicitly asks/i.test(comExcecao), "quem pede a mudança (editar com texto, refinar) ganha a exceção");
  const duas = comEstruturaPreservada(comEstruturaPreservada("Furnish this room.", ESTRUTURA_FIXA), ESTRUTURA_FIXA);
  conferir((duas.match(/STRUCTURE IS FIXED/g) ?? []).length === 1, "colar duas vezes não duplica o contrato");
}

// ---------- 3. as três portas que geram imagem passam pela função ----------
{
  const rotas: [string, string[], string][] = [
    ["foto", ["app", "api", "gerar", "route.ts"], "ESTRUTURA_FIXA"],
    ["terreno", ["app", "api", "terreno", "ia", "route.ts"], "TERRENO_FIXO"],
    ["planta humanizada", ["app", "api", "planta", "humanizar", "route.ts"], "PLANTA_FIXA"],
  ];
  for (const [nome, caminho, contrato] of rotas) {
    const fonte = ler(...caminho);
    conferir(fonte.includes("comEstruturaPreservada("), `${nome}: o prompt passa por comEstruturaPreservada`);
    conferir(fonte.includes(contrato), `${nome}: com o contrato certo (${contrato})`);
  }
  const gerar = ler("app", "api", "gerar", "route.ts");
  conferir(gerar.includes("ESTRUTURA_FIXA_SALVO_PEDIDO") && gerar.includes("editar_prompt"), "e a foto separa quem pediu a mudança de quem não pediu");
}

// ---------- 4. nenhuma outra chamada ao modelo escapa ----------
{
  // Qualquer arquivo que monte `prompt` e chame `despachar` tem que passar pela função.
  const dir = path.join(RAIZ, "src", "app", "api");
  const rotas: string[] = [];
  const andar = (p: string) => {
    for (const nome of fs.readdirSync(p)) {
      const alvo = path.join(p, nome);
      if (fs.statSync(alvo).isDirectory()) andar(alvo);
      else if (nome === "route.ts") rotas.push(alvo);
    }
  };
  andar(dir);
  const escapando = rotas.filter((r) => {
    const fonte = fs.readFileSync(r, "utf8");
    return /corpoRequisicao\(/.test(fonte) && /prompt/.test(fonte) && !fonte.includes("comEstruturaPreservada(");
  });
  conferir(escapando.length === 0, "nenhuma rota manda prompt pro modelo sem o contrato", escapando.map((r) => path.relative(RAIZ, r)).join(" · ") || "todas cobertas");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
