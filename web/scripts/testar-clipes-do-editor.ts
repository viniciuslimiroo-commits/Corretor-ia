// VÍDEO ENTRANDO NA LINHA DO TEMPO (lib/clipes-do-editor.ts): em quantas cenas um arquivo
// entra, de onde cada uma começa, se as partes emendam sem soluço na montagem, e o que o
// palco mostra em cada instante. Sem rede.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-clipes-do-editor.ts

import fs from "node:fs";
import { continuaNaProxima, partesDoClipe, POUSO_DO_CLIPE, tempoNoArquivo } from "../src/lib/clipes-do-editor.ts";
import { clipeContinua, LIMITES, type Cena } from "../src/lib/video.ts";
import { argsCenaClipe } from "../src/lib/video-ffmpeg.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const soma = (l: { duracao: number }[]) => l.reduce((s, p) => s + p.duracao, 0);

// O pouso é o MESMO número da montagem: se um mudar sozinho, as partes pulam ou repetem.
{
  const fonte = fs.readFileSync(new URL("../src/lib/video-ffmpeg.ts", import.meta.url), "utf8");
  const m = fonte.match(/const SEGUNDOS_DE_POUSO = ([\d.]+);/);
  conferir(!!m && Number(m[1]) === POUSO_DO_CLIPE, "o pouso do editor é o da montagem (video-ffmpeg.ts)", m?.[1] ?? "não achei");
}

// ---------- partes ----------
{
  const r = partesDoClipe(26.4, 12);
  conferir(r.partes.length === 4 && soma(r.partes) === 26 && r.partes.every((p) => p.duracao >= 3 && p.duracao <= 8), "26,4s: quatro partes (7+7+6+6), nenhuma curta demais, o vídeo quase todo", JSON.stringify(r.partes.map((p) => p.duracao)));
  const continuo = r.partes.every((p, i) => i === 0 || Math.abs(p.inicio - (r.partes[i - 1].inicio + r.partes[i - 1].duracao)) < 0.06);
  conferir(r.partes[0].inicio === 0 && continuo, "cada parte começa no segundo em que a anterior termina", r.partes.map((p) => p.inicio).join(" → "));
  conferir(r.partes.slice(0, -1).every((p) => p.transicao === "corte") && r.partes.at(-1)!.transicao === undefined, "corte seco entre as partes; a última fica com a emenda do vídeo");
}
{
  conferir(partesDoClipe(7.4, 12).partes[0]?.duracao === 7 && partesDoClipe(7.6, 12).partes[0]?.duracao === 8, "arredonda pro segundo mais perto: 7,4s → 7s; 7,6s → 8s");
  const r = partesDoClipe(7.02, 12);
  conferir(r.partes.length === 1 && r.partes[0].duracao === 7 && r.partes[0].transicao === undefined, "7s: uma cena só, com a duração do vídeo", JSON.stringify(r.partes));
}
{
  const r = partesDoClipe(1.6, 12);
  conferir(r.partes.length === 1 && r.partes[0].duracao === LIMITES.duracaoMin, "vídeo de 1,6s: uma cena do mínimo (3s; a montagem segura o último quadro)");
}
{
  const r = partesDoClipe(40, 2);
  conferir(r.partes.length === 2 && r.partes.every((p) => p.duracao === 8) && r.sobrou === 24, "só 2 vagas: entra o que cabe (8+8) e diz quanto ficou de fora", `sobrou ${r.sobrou}s`);
}
{
  const r = partesDoClipe(20, 0);
  conferir(r.partes.length === 0 && r.sobrou === 20, "sem vaga: nada entra, e diz");
}
{
  const r = partesDoClipe(200, 12);
  conferir(r.partes.every((p) => p.inicio <= LIMITES.aparaMax) && r.sobrou > 0, "vídeo longo: nenhuma parte começa depois do teto de aparar", `${r.partes.length} partes, sobrou ${r.sobrou}s`);
}

// ---------- a montagem reconhece a continuação ----------
{
  const arq = "u/videos/a.mp4";
  const r = partesDoClipe(20, 12);
  const cenas = r.partes.map((p) => ({ tipo: "clipe", arquivo: arq, inicio: p.inicio, duracao: p.duracao, transicao: p.transicao })) as Cena[];
  const espec = { cenas, transicao: "dissolver" as const };
  conferir(cenas.slice(0, -1).every((_, i) => clipeContinua(espec, i)) && !clipeContinua(espec, cenas.length - 1), "as partes do mesmo vídeo continuam umas nas outras (a última não)");
  conferir(!clipeContinua({ ...espec, cenas: cenas.map((c, i) => (i === 0 ? { ...c, transicao: "dissolver" as const } : c)) }, 0), "com dissolver entre elas NÃO é continuação (ali a emenda pousa)");
  conferir(!clipeContinua({ ...espec, cenas: cenas.map((c, i) => (i === 1 ? { ...c, inicio: (c.inicio ?? 0) + 2 } : c)) }, 0), "pulando 2s do arquivo NÃO é continuação");
  conferir(!clipeContinua({ ...espec, cenas: cenas.map((c, i) => (i === 1 ? { ...c, arquivo: "u/videos/b.mp4" } : c)) }, 0), "outro arquivo NÃO é continuação");
  const base = { clipe: "x.mp4", saida: "y.mp4", W: 720, H: 1280, duracao: 7 };
  const tDe = (args: string[]) => Number(args[args.indexOf("-t") + 1]);
  conferir(tDe(argsCenaClipe({ ...base, semPouso: true })) === 7 && Math.abs(tDe(argsCenaClipe(base)) - (7 - POUSO_DO_CLIPE)) < 0.01, "montagem: continuação usa o arquivo até o fim da cena; sem continuação, pousa 0,45s", `${tDe(argsCenaClipe({ ...base, semPouso: true }))}s / ${tDe(argsCenaClipe(base))}s`);
}

// ---------- trocar a transição do vídeo não quebra as partes ----------
{
  const r = partesDoClipe(20, 12);
  const cenas = r.partes.map((p) => ({ tipo: "clipe", arquivo: "u/videos/a.mp4", inicio: p.inicio, duracao: p.duracao }));
  conferir(cenas.slice(0, -1).every((_, i) => continuaNaProxima(cenas, i)) && !continuaNaProxima(cenas, cenas.length - 1), "o editor reconhece as partes seguidas (pra manter o corte seco entre elas)");
  conferir(!continuaNaProxima([{ tipo: "foto", duracao: 4 }, { tipo: "foto", duracao: 4 }], 0), "foto com foto não é continuação");
}

// ---------- palco ----------
{
  const cena = { inicio: 5, duracao: 6 };
  conferir(tempoNoArquivo(cena, 0) === 5 && Math.abs(tempoNoArquivo(cena, 2) - 7) < 1e-9, "palco: a cena mostra o arquivo a partir do início dela");
  conferir(Math.abs(tempoNoArquivo(cena, 9) - 11) < 1e-9, "palco: depois do fim da cena não anda mais");
  conferir(Math.abs(tempoNoArquivo({ ...cena, velocidade: 2 }, 1) - 7) < 1e-9, "palco: 2x anda o dobro no arquivo");
  conferir(tempoNoArquivo({ ...cena, congelar: true }, 3) === 5, "palco: congelada fica no quadro do início");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
