// CLIPES DO PEXELS: da busca ao quadro do vídeo.
//
//   saneador  -> id torto, prévia de outro domínio (o palco tocaria URL qualquer);
//   busca     -> a chave funciona, vem clipe com capa e prévia do Pexels, e a 2ª busca
//                igual sai do cache (cota de 200/hora);
//   preparo   -> baixa SÓ o escolhido e corta o laço de 3s sem som, na altura da cena;
//   vídeo     -> o clipe aparece no canto, MEXE e continua mexendo depois do laço
//                (`-stream_loop -1`), e a cena termina no tempo.
//
// Lê PEXELS_API_KEY do web/.env.local sem imprimir. Sem chave, testa só o saneador.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-pexels.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^(PEXELS_API_KEY)=(.+)$/.exec(linha.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// `caminhoFfmpeg` acha o binário com `require`, que não existe num script ESM fora do Next:
// aqui ele vem do ffmpeg-static pela variável que a própria função respeita.
process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;

const { limparEspec } = await import("../src/lib/video.ts");
const { prepararClipePexels } = await import("../src/lib/pexels-servidor.ts");
const { buscarClipesPexels, temChavePexels } = await import("../src/lib/pexels-busca.ts");
const { rasterizarElementos } = await import("../src/lib/elementos-servidor.ts");
const { argsCenaFoto } = await import("../src/lib/video-ffmpeg.ts");
const { LOOP_CLIPE_S } = await import("../src/lib/pexels.ts");

const ffmpeg = ffmpegStatic as unknown as string;
const FOTO = path.join(RAIZ, "..", "docs", "testes-reais", "01-mobiliar-depois.jpg");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-pexels-"));
const W = 540;
const H = 960;
const DUR = 5;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const duracao = (arq: string) => {
  const s = spawnSync(ffmpeg, ["-hide_banner", "-i", arq], { encoding: "utf8" }).stderr ?? "";
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(s);
  return m ? Number(m[2]) * 60 + Number(m[3]) : -1;
};
const quadro = async (video: string, em: number) => {
  const png = path.join(tmp, `q-${path.basename(video)}-${em}.png`);
  spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", em.toFixed(3), "-i", video, "-frames:v", "1", png]);
  return sharp(png).removeAlpha().raw().toBuffer();
};
function mudanca(a: Buffer, b: Buffer, cx: { x: number; y: number; largura: number; altura: number }) {
  let dentro = 0, nd = 0, fora = 0, nf = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 > 30 ? 1 : 0;
    if (x >= cx.x && x < cx.x + cx.largura && y >= cx.y && y < cx.y + cx.altura) { dentro += d; nd++; } else { fora += d; nf++; }
  }
  return { dentro: dentro / Math.max(1, nd), fora: fora / Math.max(1, nf) };
}

// ---------- 1. saneador ----------
{
  const previaBoa = "https://videos.pexels.com/video-files/123/x.mp4";
  const { espec } = limparEspec({
    formato: "9:16",
    cenas: [{
      tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4,
      elementos: [
        { id: "pexels:3195394", tamanho: 0.3, clipe: { previa: previaBoa, largura: 640, altura: 360, autor: "Fulano" } },
        { id: "pexels:12ab", clipe: { previa: previaBoa, largura: 640, altura: 360 } },
        { id: "pexels:99", clipe: { previa: "https://malicioso.example/x.mp4", largura: 640, altura: 360 } },
      ],
    }],
  });
  const els = espec?.cenas[0].elementos ?? [];
  conferir(els[0]?.id === "pexels:3195394" && els[0].clipe?.previa === previaBoa && els[0].tamanho === 0.3, "saneador: clipe do Pexels passa com prévia e tamanho");
  conferir(!els.some((e) => e.id === "pexels:12ab"), "saneador: id que não é número é recusado");
  const torto = els.find((e) => e.id === "pexels:99");
  conferir(!!torto && torto.clipe === undefined, "saneador: prévia fora do domínio do Pexels é descartada (o id fica; o servidor busca pelo id)");
}

if (!temChavePexels()) {
  console.log("\n(sem PEXELS_API_KEY: busca e vídeo não conferidos)");
} else {
  // ---------- 2. busca ----------
  const t0 = Date.now();
  const r = await buscarClipesPexels("person laughing", 1);
  const ms1 = Date.now() - t0;
  const t1 = Date.now();
  await buscarClipesPexels("person laughing", 1);
  const ms2 = Date.now() - t1;
  const doPexels = (u: string) => /^https:\/\/([a-z0-9-]+\.)*pexels\.com\//.test(u);
  conferir(r.clipes.length >= 6, "busca real devolve clipes", `${r.clipes.length} clipes em ${ms1}ms`);
  conferir(r.clipes.every((c) => doPexels(c.capa) && doPexels(c.previa) && c.largura > 0 && c.altura > 0), "todo clipe tem capa e prévia do Pexels, com tamanho");
  conferir(r.clipes.every((c) => c.duracao <= 30), "só clipes curtos (até 30s)", r.clipes.map((c) => c.duracao).join(","));
  conferir(ms2 < 20, "a mesma busca de novo sai do cache", `${ms2}ms`);
  const leve = r.clipes.map((c) => Math.min(c.largura, c.altura));
  conferir(leve.every((l) => l <= 1080), "prévia leve (menor lado até 1080px)", leve.join(","));

  // ---------- 3. preparo + vídeo ----------
  const escolhido = r.clipes[0];
  if (escolhido) {
    const alt = Math.round(H * 0.3);
    const prep = await prepararClipePexels(escolhido.id, alt, tmp, "prova");
    conferir(!!prep && Math.abs(duracao(prep.arquivo) - LOOP_CLIPE_S) < 0.2 && prep.altura === Math.round(alt / 2) * 2, "o clipe escolhido vira laço de 3s na altura da cena", prep ? `${prep.largura}x${prep.altura} · ${duracao(prep.arquivo).toFixed(2)}s` : "falhou");
    if (prep) {
      const semSom = !/Audio:/.test(spawnSync(ffmpeg, ["-hide_banner", "-i", prep.arquivo], { encoding: "utf8" }).stderr ?? "");
      conferir(semSom, "o laço não tem som");
    }

    const elementos = limparEspec({
      formato: "9:16",
      cenas: [{ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: DUR, elementos: [{ id: `pexels:${escolhido.id}`, ancora: "base_dir", tamanho: 0.3, animacao: "nenhuma", clipe: { previa: escolhido.previa, largura: escolhido.largura, altura: escolhido.altura, autor: escolhido.autor } }] }],
    }).espec?.cenas[0].elementos ?? [];
    const pecas = await rasterizarElementos(elementos, W, H, tmp, "cena", {});
    conferir(pecas.length === 1 && !!pecas[0].video, "o clipe vira peça de vídeo na montagem", `${pecas.length} peça(s)`);
    if (pecas.length === 1) {
      const p = pecas[0];
      const controle = path.join(tmp, "controle.mp4");
      spawnSync(ffmpeg, ["-y", "-loglevel", "error", ...argsCenaFoto({ foto: FOTO, saida: controle, W, H, duracao: DUR, efeito: "parado", textos: [] })]);
      const saida = path.join(tmp, "com-clipe.mp4");
      const run = spawnSync(ffmpeg, ["-y", "-loglevel", "error", ...argsCenaFoto({ foto: FOTO, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas })], { encoding: "utf8", timeout: 120_000 });
      conferir(run.status === 0 && Math.abs(duracao(saida) - DUR) < 0.2, "a cena com clipe termina no tempo", run.status === 0 ? `${duracao(saida).toFixed(2)}s` : `status ${run.status} ${(run.stderr ?? "").slice(0, 160)}`);
      if (run.status === 0) {
        const caixa = { x: p.x, y: p.y, largura: p.largura, altura: p.altura };
        const base = await quadro(controle, 1);
        const q1 = await quadro(saida, 1);
        const presenca = mudanca(base, q1, caixa);
        conferir(presenca.dentro > 0.3 && presenca.fora < 0.002 && p.x + p.largura <= W && p.y + p.altura <= H, "o clipe aparece no canto de baixo à direita, sem vazar", `pintado ${(presenca.dentro * 100).toFixed(0)}% · fora ${(presenca.fora * 100).toFixed(3)}% · (${p.x},${p.y}) ${p.largura}x${p.altura}`);
        // Depois do laço de 3s: se o `-stream_loop` faltasse, o clipe congelaria aqui.
        const [a, b, c] = [await quadro(saida, 3.5), await quadro(saida, 4.0), await quadro(saida, 4.5)];
        const mexe = Math.max(mudanca(a, b, caixa).dentro, mudanca(b, c, caixa).dentro, mudanca(a, c, caixa).dentro);
        conferir(mexe > 0.01, "e continua se mexendo depois do primeiro laço", `mudou até ${(mexe * 100).toFixed(1)}% entre 3,5s e 4,5s`);
      }
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
