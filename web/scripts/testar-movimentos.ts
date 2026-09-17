// MOVIMENTO EM LAÇO (o "GIF" de texto e adesivo): da pose ao quadro do vídeo.
//
// Os jeitos de sumir calado, cada um com uma conferência:
//   pose      -> laço que não fecha dá um tranco na emenda (pose(0) != pose(período));
//   folga     -> pose que sai do quadro desenhado vira peça cortada reta na borda;
//   saneador  -> `movimento` jogado fora (já aconteceu com `arte`): balança no palco,
//                sai parado no vídeo;
//   laço      -> sem `-loop 1` a sequência toca uma vez e CONGELA -- por isso a
//                comparação é feita DEPOIS do primeiro período;
//   cena      -> entrada em laço que não deixa a cena terminar.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-movimentos.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { FPS_MOVIMENTO, MOVIMENTOS, folgaDoMovimento, periodoDoMovimento, poseDoMovimento, quadrosChaveDoMovimento, quadrosDoMovimento, type MovimentoId } from "../src/lib/movimentos.ts";
import { animarPecas } from "../src/lib/movimento-servidor.ts";
import { rasterizarArtes } from "../src/lib/texto-arte-servidor.ts";
import { rasterizarElementos } from "../src/lib/elementos-servidor.ts";
import { argsCenaFoto } from "../src/lib/video-ffmpeg.ts";
import { limparEspec, type TextoCena } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTO = path.join(RAIZ, "..", "docs", "testes-reais", "01-mobiliar-depois.jpg");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-mov-"));
const W = 540;
const H = 960;
const DUR = 4; // o flutuar tem período de 2s, e a conta olha até meio período depois do 1º

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const rodar = (a: string[], timeout = 90_000) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...a], { encoding: "utf8", timeout });
  if (r.status !== 0) throw new Error(`status ${r.status} ${r.error ?? ""} ${(r.stderr ?? "").slice(0, 300)}`);
};
const quadro = async (video: string, em: number) => {
  const png = path.join(tmp, `q-${path.basename(video)}-${em}.png`);
  rodar(["-ss", em.toFixed(3), "-i", video, "-frames:v", "1", png]);
  return sharp(png).removeAlpha().raw().toBuffer();
};
/** Fração de pixels que mudaram forte, dentro e fora de uma caixa. */
function mudanca(a: Buffer, b: Buffer, cx: { x: number; y: number; largura: number; altura: number }) {
  let dentro = 0, nd = 0, fora = 0, nf = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 > 40 ? 1 : 0;
    if (x >= cx.x && x < cx.x + cx.largura && y >= cx.y && y < cx.y + cx.altura) { dentro += d; nd++; } else { fora += d; nf++; }
  }
  return { dentro: dentro / Math.max(1, nd), fora: fora / Math.max(1, nf) };
}

const ativos = MOVIMENTOS.filter((m) => m.id !== "nenhum").map((m) => m.id as MovimentoId);

// ---------- 1. pose: fecha o laço, e o palco recebe a mesma ----------
for (const id of ativos) {
  const p = periodoDoMovimento(id);
  const a = poseDoMovimento(id, 0.123);
  const b = poseDoMovimento(id, 0.123 + p);
  const fecha = Math.abs(a.escala - b.escala) < 1e-9 && Math.abs(a.angulo - b.angulo) < 1e-9 && Math.abs(a.dx - b.dx) < 1e-9 && Math.abs(a.dy - b.dy) < 1e-9;
  const inteiro = Math.abs(p * FPS_MOVIMENTO - quadrosDoMovimento(id)) < 1e-9;
  const k = quadrosChaveDoMovimento(id, 3);
  const mexe = new Set(k.map((q) => q.transform)).size > 3;
  conferir(fecha && inteiro && k[0].transform === k[k.length - 1].transform && mexe, `${id}: laço fecha, período em quadros inteiros, palco com o mesmo começo e fim`, `${quadrosDoMovimento(id)} quadros`);
}

// ---------- 2. saneador ----------
{
  const { espec } = limparEspec({
    formato: "9:16",
    cenas: [{
      tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4,
      textos: [
        { texto: "UAU!", arte: "gibi_pop", movimento: "tremer" },
        { texto: "Simples", movimento: "pulsar" },
        { texto: "Torto", arte: "gibi_pop", movimento: "rodopiar" },
      ],
      elementos: [
        { id: "adesivo:chave", movimento: "balancar" },
        { id: "adesivo:gif_palmas", movimento: "balancar" },
        { id: "cantos", movimento: "pulsar" },
      ],
    }],
  });
  const ts = espec?.cenas[0].textos ?? [];
  const els = espec?.cenas[0].elementos ?? [];
  conferir(ts[0]?.movimento === "tremer", "saneador: texto com efeito guarda o movimento", String(ts[0]?.movimento));
  conferir(ts[1] && ts[1].movimento === undefined, "saneador: texto simples (drawtext) não leva movimento que não conseguiria fazer");
  conferir(ts[2] && ts[2].movimento === undefined, "saneador: movimento inventado é recusado");
  const porId = Object.fromEntries(els.map((e) => [e.id, e]));
  conferir(porId["adesivo:chave"]?.movimento === "balancar", "saneador: adesivo guarda o movimento");
  conferir(porId["adesivo:gif_palmas"] && porId["adesivo:gif_palmas"].movimento === undefined, "saneador: GIF não leva movimento (já se mexe)");
  conferir(!porId["cantos"] || porId["cantos"].movimento === undefined, "saneador: moldura de quadro inteiro não balança");
}

// ---------- 3. quadros desenhados: nada encosta na borda ----------
const textoBase: TextoCena = { texto: "Vendido!", arte: "pop_vermelho", posicao: "centro", animacao: "nenhuma" };
for (const id of ativos) {
  const artes = await rasterizarArtes([{ ...textoBase, movimento: id }], H, tmp, `borda-${id}`, false, W);
  const [animada] = await animarPecas(artes, tmp, `borda-${id}`);
  if (!animada?.sequencia) {
    conferir(false, `${id}: vira sequência de quadros`);
    continue;
  }
  let encosta = 0;
  for (let f = 0; f < animada.sequencia.quadros; f++) {
    const arq = animada.arquivo.replace("%03d", String(f).padStart(3, "0"));
    const { data, info } = await sharp(arq).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let x = 0; x < info.width; x++) {
      if (data[x * 4 + 3] > 8 || data[((info.height - 1) * info.width + x) * 4 + 3] > 8) encosta++;
    }
    for (let y = 0; y < info.height; y++) {
      if (data[y * info.width * 4 + 3] > 8 || data[(y * info.width + info.width - 1) * 4 + 3] > 8) encosta++;
    }
  }
  const f = folgaDoMovimento(id, artes[0].largura, artes[0].altura);
  conferir(encosta === 0, `${id}: nenhuma pose sai do quadro desenhado`, `${animada.sequencia.quadros} quadros ${animada.largura}x${animada.altura} (folga ${f.horizontal}/${f.vertical}) · ${encosta} px na borda`);
}

// ---------- 4. no vídeo: termina, mexe, e continua mexendo DEPOIS do 1º período ----------
{
  const controle = path.join(tmp, "controle.mp4");
  rodar(argsCenaFoto({ foto: FOTO, saida: controle, W, H, duracao: DUR, efeito: "parado", textos: [] }));
  const base = await quadro(controle, 2.4);
  for (const id of ativos) {
    const artes = await animarPecas(await rasterizarArtes([{ ...textoBase, movimento: id }], H, tmp, `v-${id}`, false, W), tmp, `v-${id}`);
    const a = artes[0];
    const saida = path.join(tmp, `${id}.mp4`);
    const t0 = Date.now();
    try {
      rodar(argsCenaFoto({ foto: FOTO, saida, W, H, duracao: DUR, efeito: "parado", textos: [{ ...textoBase, movimento: id }], artes }));
    } catch (e) {
      conferir(false, `${id}: a cena termina`, String(e).slice(0, 160));
      continue;
    }
    const info = spawnSync(ffmpeg, ["-hide_banner", "-i", saida], { encoding: "utf8" }).stderr ?? "";
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
    const dur = m ? Number(m[3]) + Number(m[2]) * 60 : -1;
    const caixa = { x: Math.round((W - a.largura) / 2), y: a.y, largura: a.largura, altura: a.altura };
    // TRÊS instantes depois do primeiro período (o flutuar tem 2s): se o laço congelou,
    // os três são iguais. Três, e não dois: o quicar é simétrico em volta do pouso, e dois
    // instantes a igual distância dele têm a mesma altura -- o teste reprovou um quicar
    // que estava mexendo (medido: coluna do texto em 455/465/455 px ao longo da cena).
    const p = periodoDoMovimento(id);
    const t1 = 2.05;
    const t2 = t1 + p / 4;
    const [q1, q2, q3] = [await quadro(saida, t1), await quadro(saida, t2), await quadro(saida, t1 + p / 2)];
    const pares = [mudanca(q1, q2, caixa), mudanca(q1, q3, caixa), mudanca(q2, q3, caixa)];
    const mexe = { dentro: Math.max(...pares.map((x) => x.dentro)), fora: Math.max(...pares.map((x) => x.fora)) };
    const presenca = mudanca(base, q1, caixa);
    conferir(
      Math.abs(dur - DUR) < 0.2 && presenca.dentro > 0.05 && presenca.fora < 0.002 && mexe.dentro > 0.01 && mexe.fora < 0.002,
      `${id}: aparece, continua mexendo depois do 1º período e a cena termina no tempo`,
      `${dur.toFixed(2)}s em ${((Date.now() - t0) / 1000).toFixed(1)}s · pintado ${(presenca.dentro * 100).toFixed(1)}% · mudou até ${(mexe.dentro * 100).toFixed(1)}% entre ${t1}s e ${(t1 + p / 2).toFixed(2)}s · fora ${(Math.max(presenca.fora, mexe.fora) * 100).toFixed(3)}%`
    );
  }

  // Adesivo balançando no canto: o mesmo caminho, pelas peças com `x`.
  const pecas = await animarPecas(await rasterizarElementos([{ id: "adesivo:chave", ancora: "topo_dir", tamanho: 0.14, animacao: "nenhuma", movimento: "balancar" }], W, H, tmp, "ad", {}), tmp, "ad");
  const pc = pecas[0];
  const saida = path.join(tmp, "adesivo.mp4");
  rodar(argsCenaFoto({ foto: FOTO, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas }));
  const q1 = await quadro(saida, 2.05);
  const q2 = await quadro(saida, 2.35);
  const caixa = { x: pc.x, y: pc.y, largura: pc.largura, altura: pc.altura };
  const mexe = mudanca(q1, q2, caixa);
  conferir(!!pc.sequencia && mexe.dentro > 0.01 && mexe.fora < 0.002, "adesivo balançando no canto: mexe e fica no canto", `mudou ${(mexe.dentro * 100).toFixed(1)}% · (${pc.x},${pc.y}) ${pc.largura}x${pc.altura}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
