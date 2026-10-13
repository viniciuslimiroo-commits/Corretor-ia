// QUANTAS CENAS DE UM TOUR DE VERDADE REPROVAM NA CONFERÊNCIA?
//
// Ele pediu em 12/10/2026, logo depois de a conferência ficar pronta: "testa com um tour
// real pra ver quantas cenas reprovam". A pergunta é de preço, não de curiosidade -- se
// reprovar muito, cada cena reprovada paga um clipe a mais (a refeita) e pode terminar em
// foto, que é a queixa de onde tudo nasceu.
//
// NÃO GERA NADA. Os clipes dos tours que ele já fez estão guardados no cache (animadas/),
// e é exatamente em cima deles que a conferência rodaria. Custa umas chamadas de visão
// (frações de centavo cada) em vez de US$ 0,15 por cena.
//
//   node --import ./scripts/ts-direto.mjs scripts/medir-reprovacao-no-tour.ts          (lista)
//   node --import ./scripts/ts-direto.mjs scripts/medir-reprovacao-no-tour.ts <id>     (mede)

import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { conferirClipe } from "../src/lib/conferir-clipe.ts";
import { caminhoAnimacao, chaveDaAnimacao } from "../src/lib/video-pipeline.ts";
import { duracaoDaCena } from "../src/lib/video.ts";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

type Linha = { id: string; user_id: string; titulo: string | null; espec: { formato?: string; cenas?: unknown[] } | null; status: string; criado_em: string };

async function listar(): Promise<Linha[]> {
  const r = await fetch(`${SUPA}/rest/v1/videos?select=id,user_id,titulo,espec,status,criado_em&order=criado_em.desc&limit=60`, { headers: admin });
  if (!r.ok) throw new Error(`videos: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Linha[];
}

const VEZES = 3;

const animadas = (l: Linha) => (l.espec?.cenas ?? []).filter((c) => (c as { tipo?: string }).tipo === "animada");

async function main() {
  const linhas = await listar();
  const alvoId = process.argv[2];

  if (!alvoId) {
    console.log("vídeos com cenas animadas (mais novos primeiro):\n");
    for (const l of linhas) {
      const n = animadas(l).length;
      if (n === 0) continue;
      console.log(`  ${l.id}  ${String(n).padStart(2)} animadas · ${l.status.padEnd(9)} · ${l.criado_em.slice(0, 16).replace("T", " ")} · ${l.titulo ?? "(sem título)"}`);
    }
    console.log("\npasse um id pra medir.");
    return;
  }

  const l = linhas.find((x) => x.id === alvoId) ?? ((await (await fetch(`${SUPA}/rest/v1/videos?select=id,user_id,titulo,espec,status,criado_em&id=eq.${alvoId}`, { headers: admin })).json()) as Linha[])[0];
  if (!l) throw new Error(`vídeo ${alvoId} não achado`);

  const cenas = l.espec?.cenas ?? [];
  const formato = l.espec?.formato ?? "9:16";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tour-"));
  console.log(`${l.titulo ?? "(sem título)"} · ${cenas.length} cenas, ${animadas(l).length} animadas · formato ${formato}\n`);

  let conferidas = 0;
  let reprovadas = 0;
  let semClipe = 0;
  let naoOlhou = 0;

  for (const [i, cRaw] of cenas.entries()) {
    const c = cRaw as Parameters<typeof chaveDaAnimacao>[0] & { tipo?: string };
    if (c.tipo !== "animada") continue;
    const chave = chaveDaAnimacao(c, formato);
    const caminho = caminhoAnimacao(l.user_id, chave);
    const r = await fetch(`${SUPA}/storage/v1/object/resultados/${caminho}`, { headers: admin });
    if (!r.ok) {
      semClipe++;
      console.log(`cena ${String(i + 1).padStart(2)}  — clipe não está guardado (${r.status})`);
      continue;
    }
    const mp4 = path.join(tmp, `c${i}.mp4`);
    fs.writeFileSync(mp4, Buffer.from(await r.arrayBuffer()));
    // TRÊS VEZES, porque o veredito já se mostrou instável: o flash-lite deu REPROVA, limpo,
    // REPROVA pro MESMO clipe com temperatura zero. Medir uma vez por cena mediria sorteio.
    const votos = [];
    for (let k = 0; k < VEZES; k++) votos.push(await conferirClipe({ clipe: mp4, duracao: duracaoDaCena(c), falKey: env.FAL_KEY, pasta: tmp }));
    conferidas++;
    const reprovas = votos.filter((v) => !v.aprovado).length;
    if (votos.some((v) => !v.respondeu)) naoOlhou++;
    if (reprovas > VEZES / 2) reprovadas++;
    const achado = votos.find((v) => v.achado)?.achado ?? "";
    const selo = reprovas === 0 ? "ok        " : reprovas === VEZES ? "REPROVOU  " : `oscilou ${reprovas}/${VEZES}`;
    console.log(`cena ${String(i + 1).padStart(2)}  ${selo} ${achado}`);
    fs.rmSync(mp4, { force: true });
  }

  console.log(`\n${reprovadas} de ${conferidas} reprovaram${semClipe ? ` · ${semClipe} sem clipe guardado` : ""}${naoOlhou ? ` · ${naoOlhou} a visão não conseguiu olhar` : ""}`);
  if (conferidas) {
    const taxa = reprovadas / conferidas;
    // O que isso custa: cada reprovada paga uma refeita (US$ 0,15). Se a refeita também
    // reprovar, a cena vira foto e o crédito volta -- aí foram dois clipes pagos e nada
    // cobrado. A conta de cima assume o pior caso (toda reprovada refaz uma vez).
    console.log(`taxa ${(taxa * 100).toFixed(0)}% · custo extra no pior caso: US$ ${(reprovadas * 0.15).toFixed(2)} neste vídeo`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
