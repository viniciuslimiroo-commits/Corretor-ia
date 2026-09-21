// TEXTO DESENHADO PELO SERVIDOR PRECISA DE UMA FONTE QUE O SERVIDOR TENHA.
//
// Em 21/09/2026 as medidas do Terreno saíam como quadradinhos na imagem gerada -- e o selo
// da mesma foto saía perfeito. A diferença estava só na lista de fontes: o selo pedia
// "DejaVu Sans" (que existe no Linux da Vercel) e o terreno pedia "Segoe UI, Arial,
// Helvetica, sans-serif" (nenhuma existe, e o genérico não resolve sem os arquivos de alias
// do fontconfig). Sobrou nada, e o Pango desenhou o glifo vazio pra cada letra.
//
// Erro assim não aparece em teste de tipo nem de lint, não aparece na máquina de quem
// programa (Windows tem Segoe UI) e não quebra a requisição: a imagem sai, com quadradinhos.
// Só aparece olhando o resultado em produção. Por isso a varredura: qualquer `font-family`
// escrito em arquivo que o SERVIDOR desenha tem que citar a família que o servidor tem.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-fontes-svg.ts

import fs from "node:fs";
import path from "node:path";
import { FAMILIA_QUE_O_SERVIDOR_TEM, FONTE_SVG_SERVIDOR } from "../src/lib/fonte-svg.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

conferir(FONTE_SVG_SERVIDOR.startsWith(FAMILIA_QUE_O_SERVIDOR_TEM), `a lista começa por "${FAMILIA_QUE_O_SERVIDOR_TEM}"`, FONTE_SVG_SERVIDOR);
conferir(!/^\s*(Geist|Segoe)/.test(FONTE_SVG_SERVIDOR), "e não por uma fonte que só existe na máquina de quem programa");

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...arquivos(p));
    else if (/\.tsx?$/.test(e.name)) saida.push(p);
  }
  return saida;
}

// Quem desenha no servidor: as rotas e os módulos de lib que importam o sharp.
const candidatos = [...arquivos(path.join(RAIZ, "src", "app", "api")), ...arquivos(path.join(RAIZ, "src", "lib"))];
const doServidor = candidatos.filter((f) => /from "sharp"|require\("sharp"\)/.test(fs.readFileSync(f, "utf8")));
conferir(doServidor.length > 0, "achei os arquivos que desenham com o sharp", `${doServidor.length}`);

// O SVG pode nascer num módulo sem sharp (planta-svg monta a string, a rota rasteriza), então
// a varredura do texto vale pra TODA a lib e as rotas -- não só pra quem importa o sharp.
// Linha de comentário não desenha nada: `nucleo.ts` CONTA no comentário que os modelos
// antigos pediam "Geist, Segoe UI" -- é história, não código, e travar nela ensinaria a
// apagar o comentário em vez de arrumar a fonte.
const comentario = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);
const ruins: string[] = [];
for (const f of candidatos) {
  for (const linha of fs.readFileSync(f, "utf8").split("\n")) {
    if (comentario(linha)) continue;
    for (const m of linha.matchAll(/font-family="([^"]*)"/g)) {
      const lista = m[1];
      const ok = lista.includes("FONTE_SVG_SERVIDOR") || lista.includes("FONTE_SVG") || lista.includes("FONTE_ARTE") || lista.includes(FAMILIA_QUE_O_SERVIDOR_TEM);
      if (!ok) ruins.push(`${path.relative(RAIZ, f)}: ${lista}`);
    }
  }
}
conferir(ruins.length === 0, "nenhum texto de servidor pede fonte que o servidor não tem", ruins.join(" · ") || "todas cobertas");

// As constantes que sobraram em outros módulos também precisam citar a família.
for (const [arquivo, nome] of [
  ["src/lib/texto-arte.ts", "FONTE_ARTE"],
  ["src/lib/book-imagem.ts", "FONTE_SVG"],
] as const) {
  const fonte = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  const linha = fonte.split("\n").find((l) => l.includes(`${nome} =`)) ?? "";
  conferir(linha.includes(FAMILIA_QUE_O_SERVIDOR_TEM) || linha.includes("FONTE_SVG_SERVIDOR"), `${nome} cita a família do servidor`, linha.trim().slice(0, 90));
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
