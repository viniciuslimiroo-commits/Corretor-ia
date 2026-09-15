// A paleta da logo, testada com pixels montados na mão -- sem sharp, sem rede, sem canvas.
//
// O que importa aqui não é achar cor: é NÃO achar. Fundo branco, contorno preto e cinza de
// sombra são a maior parte de qualquer logo, e uma paleta que os devolve é pior que paleta
// nenhuma, porque a pessoa clica em "usar estas cores" e o material sai cinza.

import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..");
const { coresDaLogo, progressoDaMarca } = await import(pathToFileURL(path.join(RAIZ, "src/lib/cores-da-logo.ts")).href);

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

/** Monta RGBA cru a partir de uma lista [ [r,g,b,a], quantos ]. */
function pixels(...grupos) {
  const saida = [];
  for (const [[r, g, b, a], n] of grupos) {
    for (let i = 0; i < n; i++) saida.push(r, g, b, a);
  }
  return new Uint8Array(saida);
}

const CORAL = [240, 107, 79, 255];
const INDIGO = [15, 45, 91, 255];
const TEAL = [44, 177, 163, 255];
const BRANCO = [255, 255, 255, 255];
const PRETO = [8, 8, 8, 255];
const CINZA = [136, 136, 136, 255];
const TRANSPARENTE = [240, 107, 79, 0];

console.log("--- o que NÃO é cor de marca ---");
conferir(coresDaLogo(pixels([BRANCO, 1000])).length === 0, "logo só branca não devolve cor");
conferir(coresDaLogo(pixels([PRETO, 1000])).length === 0, "logo só preta não devolve cor");
conferir(coresDaLogo(pixels([CINZA, 1000])).length === 0, "cinza puro não vira cor de marca");
conferir(coresDaLogo(pixels([TRANSPARENTE, 1000])).length === 0, "pixel transparente não conta, mesmo colorido");
conferir(coresDaLogo(pixels([BRANCO, 900], [PRETO, 100])).length === 0, "logo preto-e-branco: nenhuma cor sugerida");

console.log("\n--- o que É ---");
const umaCor = coresDaLogo(pixels([BRANCO, 900], [CORAL, 100]));
conferir(umaCor.length === 1, "coral no meio do branco é achado", JSON.stringify(umaCor));
conferir(umaCor[0] === "#f06b4f", "e sai com o valor exato, não o centro do balde", umaCor[0]);

const tres = coresDaLogo(pixels([BRANCO, 700], [CORAL, 150], [INDIGO, 100], [TEAL, 50]));
conferir(tres.length === 3, "três cores distintas saem as três", JSON.stringify(tres));
conferir(tres[0] === "#f06b4f", "e na ordem de quem ocupa mais pixel", tres.join(" "));

console.log("\n--- tons da mesma cor não ocupam três vagas ---");
const azuis = coresDaLogo(pixels([BRANCO, 600], [[15, 45, 91, 255], 150], [[20, 52, 100, 255], 140], [[12, 40, 84, 255], 110]));
conferir(azuis.length === 1, "três tons do mesmo azul viram uma cor só", JSON.stringify(azuis));

const azulMaisCoral = coresDaLogo(pixels([BRANCO, 600], [[15, 45, 91, 255], 200], [[20, 52, 100, 255], 100], [CORAL, 100]));
conferir(azulMaisCoral.length === 2, "mas azul + coral continuam sendo duas", JSON.stringify(azulMaisCoral));

console.log("\n--- respingo de anti-aliasing ---");
const respingo = coresDaLogo(pixels([BRANCO, 1000], [CORAL, 500], [TEAL, 5]));
conferir(respingo.length === 1 && respingo[0] === "#f06b4f", "cor com menos de 2% do total é descartada", JSON.stringify(respingo));

console.log("\n--- entradas estranhas ---");
conferir(coresDaLogo(new Uint8Array(0)).length === 0, "imagem vazia não quebra");
conferir(coresDaLogo(new Uint8Array([255, 0])).length === 0, "pixel cortado ao meio não quebra");
conferir(coresDaLogo(pixels([CORAL, 100]), 1).length === 1, "o teto de cores é respeitado");
// O canvas do navegador manda Uint8ClampedArray; o servidor manda Buffer. Os dois entram.
conferir(coresDaLogo(new Uint8ClampedArray(pixels([BRANCO, 900], [CORAL, 100])))[0] === "#f06b4f", "aceita Uint8ClampedArray (canvas do navegador)");

console.log("\n--- progresso da marca ---");
conferir(progressoDaMarca({}) === 0, "marca vazia = 0%");
conferir(progressoDaMarca({ nome: "Horizonte", logo: "x" }) === 40, "nome + logo = 40%", String(progressoDaMarca({ nome: "Horizonte", logo: "x" })));
conferir(progressoDaMarca({ nome: " ", logo: null }) === 0, "espaço em branco não conta como nome");
conferir(progressoDaMarca({ nome: "A", logo: "x", cor: "#fff", whatsapp: "62999999999", creci: "123" }) === 100, "tudo preenchido = 100%");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTUDO PASSOU");
process.exitCode = falhas ? 1 : 0;
