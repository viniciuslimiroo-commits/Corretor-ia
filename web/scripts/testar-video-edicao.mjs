// Editar um vídeo pronto (Fase 1 do editor): o que dá pra provar sem servidor e sem IA.
//
//   1. o espec aceita capa e frase da tela final, e limpa o que vier errado;
//   2. a chave do clipe animado guardado muda com o que muda o resultado (imagem,
//      movimento, duração, proporção) e NÃO muda com o que é ffmpeg (legenda, formato
//      de saída com a mesma proporção) -- é o que decide "cobra de novo ou não";
//   3. a miniatura sai do segundo pedido; a tela final desenha a frase;
//   4. o resumo da ficha respeita o limite e não inventa campo vazio.
//
//   node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-video-edicao.mjs

import { CHAMADAS, LIMITES, limparEspec } from "../src/lib/video.ts";
import { argsMiniatura, argsTelaFinal } from "../src/lib/video-ffmpeg.ts";
import { resumoDaFicha } from "../src/lib/ficha-imovel.ts";

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const JOB = "11111111-2222-4333-8444-555555555555";
const base = { formato: "9:16", cenas: [{ tipo: "foto", jobId: JOB }, { tipo: "foto", jobId: JOB }, { tipo: "animada", jobId: JOB, animacao: "drone", duracao: 4 }], musica: "calma", telaFinal: true };

console.log("--- 1. espec: capa e chamada ---");
{
  const { espec, erro } = limparEspec({ ...base, capa: 2, chamada: "Agende sua visita" });
  conferir(!erro && espec.capa === 2, "capa válida é guardada", String(espec?.capa));
  conferir(espec.chamada === "Agende sua visita", "chamada é guardada");
}
{
  const { espec } = limparEspec({ ...base, capa: 7 });
  conferir(espec.capa === 0, "capa fora da lista volta pra primeira, sem erro", String(espec.capa));
}
{
  const { espec } = limparEspec({ ...base, capa: -1 });
  conferir(espec.capa === 0, "capa negativa volta pra primeira");
}
{
  const { espec } = limparEspec({ ...base, capa: "banana" });
  conferir(espec.capa === 0, "capa que não é número volta pra primeira");
}
{
  const { espec } = limparEspec({ ...base });
  conferir(espec.capa === 0 && espec.chamada === "", "sem capa nem chamada: primeira cena, sem frase");
}
{
  const { espec } = limparEspec({ ...base, chamada: "x".repeat(200) });
  conferir(espec.chamada.length === LIMITES.chamadaMax, `chamada é cortada em ${LIMITES.chamadaMax}`, String(espec.chamada.length));
}
{
  const { espec } = limparEspec({ ...base, chamada: "linha 1\nlinha 2\tfim" });
  conferir(!/[\r\n\t]/.test(espec.chamada), "chamada não leva quebra de linha pro drawtext", JSON.stringify(espec.chamada));
}
conferir(CHAMADAS.length === 3 && CHAMADAS.every((f) => f.length <= LIMITES.chamadaMax), "três frases prontas, todas dentro do limite");

console.log("\n--- 2. chave do clipe animado guardado ---");
// O pipeline importa fal/supabase; aqui só a parte pura. Se a importação falhar por
// falta de ambiente, o teste diz isso em vez de fingir que passou.
let chaveDaAnimacao = null;
try {
  ({ chaveDaAnimacao } = await import("../src/lib/video-pipeline.ts"));
} catch (e) {
  console.log(`(pipeline não importável fora do servidor: ${e instanceof Error ? e.message.slice(0, 80) : e})`);
}
if (chaveDaAnimacao) {
  const cena = { tipo: "animada", jobId: JOB, animacao: "drone", duracao: 4 };
  const k = chaveDaAnimacao(cena, "9:16");
  conferir(/^[0-9a-f]{24}$/.test(k), "chave é hex curto", k);
  conferir(chaveDaAnimacao({ ...cena }, "9:16") === k, "mesma cena, mesma chave");
  conferir(chaveDaAnimacao({ ...cena, legenda: "Sala" }, "9:16") === k, "legenda NÃO muda a chave (é ffmpeg, grátis)");
  conferir(chaveDaAnimacao(cena, "4:5") === chaveDaAnimacao(cena, "1:1"), "4:5 e 1:1 pedem a mesma proporção ao modelo: mesma chave");
  conferir(chaveDaAnimacao({ ...cena, animacao: "girar" }, "9:16") !== k, "movimento diferente muda a chave");
  conferir(chaveDaAnimacao({ ...cena, duracao: 5 }, "9:16") !== k, "duração diferente muda a chave");
  conferir(chaveDaAnimacao(cena, "16:9") !== k, "proporção diferente muda a chave");
  conferir(chaveDaAnimacao({ ...cena, jobId: JOB.replace("1", "9") }, "9:16") !== k, "imagem diferente muda a chave");
  conferir(chaveDaAnimacao({ ...cena, jobId: undefined, arquivo: "uploads/u/x.jpg" }, "9:16") !== k, "arquivo enviado em vez de job muda a chave");
}

console.log("\n--- 3. miniatura e tela final ---");
{
  const a = argsMiniatura("v.mp4", "t.jpg", 7.4);
  conferir(a[0] === "-ss" && a[1] === "7.40", "miniatura no segundo pedido", a.slice(0, 2).join(" "));
  const b = argsMiniatura("v.mp4", "t.jpg");
  conferir(b[1] === "1.00", "sem segundo: 1s, como sempre foi");
  const c = argsMiniatura("v.mp4", "t.jpg", -3);
  conferir(c[1] === "1.00", "segundo negativo cai no padrão");
}
{
  const args = argsTelaFinal({ saida: "f.mp4", W: 1080, H: 1920, duracao: 4, cor: "#0F2D5B", chamada: "Agende sua visita", nome: "Ana", whatsapp: "62999990000" });
  const filtro = args[args.indexOf("-filter_complex") + 1];
  conferir(filtro.includes("Agende sua visita"), "a frase entra no filtro da tela final");
  conferir(filtro.indexOf("Agende sua visita") < filtro.indexOf("Ana"), "e vem antes do nome");
  const sem = argsTelaFinal({ saida: "f.mp4", W: 1080, H: 1920, duracao: 4, cor: "#0F2D5B", nome: "Ana" });
  conferir(!sem[sem.indexOf("-filter_complex") + 1].includes("drawtext=fontfile='undefined'"), "sem frase não desenha linha vazia");
}

console.log("\n--- 4. resumo da ficha ---");
conferir(resumoDaFicha({ dormitorios: 3, vagas: 2, area_util: 120 }) === "3 quartos · 2 vagas · 120 m²", "quartos · vagas · área", resumoDaFicha({ dormitorios: 3, vagas: 2, area_util: 120 }));
conferir(resumoDaFicha({ dormitorios: 1, vagas: 1, suites: 1 }) === "1 quarto · 1 vaga · 1 suíte", "singular certo", resumoDaFicha({ dormitorios: 1, vagas: 1, suites: 1 }));
conferir(resumoDaFicha({ area_total: 300 }) === "300 m²", "área total quando não há útil");
conferir(resumoDaFicha({ area_util: 96.5 }) === "96,5 m²", "decimal com vírgula", resumoDaFicha({ area_util: 96.5 }));
conferir(resumoDaFicha({}) === "" && resumoDaFicha(null) === "", "ficha vazia: linha vazia, nada inventado");
conferir(resumoDaFicha({ dormitorios: 0, vagas: null, preco: "R$ 1" }) === "", "zero e nulo não entram; preço não é resumo");
{
  const longa = resumoDaFicha({ dormitorios: 4, vagas: 3, area_util: 250, suites: 2, banheiros: 5 }, 40);
  conferir(longa.length <= 40 && !longa.endsWith("·"), "respeita o limite sem cortar palavra", `${longa} (${longa.length})`);
}

console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
