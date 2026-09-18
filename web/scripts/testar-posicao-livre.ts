// POSIÇÃO LIVRE (arrastar texto e peça no palco) medida no ARQUIVO FINAL.
//
// O arraste entrou primeiro só na prévia: a pessoa soltava o texto no meio da foto e o vídeo
// saía com ele no rodapé, sem erro nenhum. Aqui a promessa é medida no quadro que saiu:
//
//   peça (selo)          -> a tinta nova fica em volta do ponto soltado, não no canto dela
//   texto simples        -> idem (drawtext)
//   texto com arte       -> idem (PNG por cima)
//   perto da borda       -> a peça fica INTEIRA dentro do quadro
//   prévia = vídeo       -> a conta da prévia (posicionarPecas) dá o mesmo lugar que o servidor
//   saneador             -> x/y sobrevivem; fora de 0..100 é cortado; um só não vale
//
// Foto REAL de imóvel (docs/testes-reais).
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-posicao-livre.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { argsCenaFoto } from "../src/lib/video-ffmpeg.ts";
import { rasterizarElementos } from "../src/lib/elementos-servidor.ts";
import { rasterizarArtes } from "../src/lib/texto-arte-servidor.ts";
import { posicionarPecas } from "../src/lib/elementos.ts";
import { LISTA_EFEITOS_TEXTO } from "../src/lib/efeitos-texto/lista.ts";
import { limparEspec, type TextoCena } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
// As fotos reais não vão pro git: numa worktree, estão na pasta principal do repositório.
const principal = path.dirname(path.resolve(RAIZ, execSync("git rev-parse --git-common-dir", { cwd: RAIZ, encoding: "utf8" }).trim()));
const foto = [process.env.FOTOS_REAIS, path.join(RAIZ, "..", "docs", "testes-reais"), path.join(principal, "docs", "testes-reais")]
  .filter((d): d is string => !!d)
  .map((d) => path.join(d, "01-mobiliar-depois.jpg"))
  .find((f) => fs.existsSync(f)) ?? "docs/testes-reais/01-mobiliar-depois.jpg";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-livre-"));
const W = 540;
const H = 960;
const DUR = 3;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function rodar(args: string[]) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr ?? "").trim().slice(0, 500) || "ffmpeg falhou");
}

type Quadro = { data: Buffer; largura: number; altura: number };
async function quadro(video: string, nome: string): Promise<Quadro> {
  const png = path.join(tmp, `${nome}.png`);
  rodar(["-ss", "1.5", "-i", video, "-frames:v", "1", png]);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, largura: info.width, altura: info.height };
}

/** Onde entrou tinta nova (diferença forte contra o quadro sem nada): centro e caixa. */
function tinta(a: Quadro, b: Quadro) {
  let n = 0, sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < a.altura; y++) {
    for (let x = 0; x < a.largura; x++) {
      const i = (y * a.largura + x) * 3;
      const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
      if (d <= 40) continue;
      n++;
      sx += x;
      sy += y;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { n, cx: sx / Math.max(1, n), cy: sy / Math.max(1, n), x0, y0, x1, y1 };
}
const perto = (t: ReturnType<typeof tinta>, px: number, py: number) => Math.abs(t.cx - (W * px) / 100) < W * 0.06 && Math.abs(t.cy - (H * py) / 100) < H * 0.05;
const onde = (t: ReturnType<typeof tinta>) => `centro da tinta em ${Math.round((t.cx / W) * 100)}%,${Math.round((t.cy / H) * 100)}%`;

if (!fs.existsSync(foto)) {
  console.error(`foto real faltando: ${foto}`);
  process.exit(1);
}
console.log(`posição livre medida no arquivo final · ${W}x${H}\n`);

const controle = path.join(tmp, "controle.mp4");
rodar(argsCenaFoto({ foto, saida: controle, W, H, duracao: DUR, efeito: "parado", textos: [] }));
const q0 = await quadro(controle, "controle");

// ---------- peça: selo solto no meio-esquerda, embaixo ----------
{
  const pecas = await rasterizarElementos([{ id: "selo_redondo", texto: "À VENDA", ancora: "topo_dir", x: 25, y: 70 }], W, H, tmp, "selo", {});
  const saida = path.join(tmp, "selo.mp4");
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas }));
  const t = tinta(q0, await quadro(saida, "selo"));
  conferir(t.n > 500 && perto(t, 25, 70), "peça: sai onde foi solta (25%, 70%), não no canto de cima", onde(t));
  conferir(t.y0 > H * 0.4, "peça: nada dela ficou no canto de cima (a âncora antiga)", `topo da tinta em ${Math.round((t.y0 / H) * 100)}%`);
  // A prévia usa posicionarPecas com o mesmo `livre`: tem que dar o mesmo retângulo.
  const [lugar] = posicionarPecas([{ ancora: "topo_dir", largura: pecas[0].largura, altura: pecas[0].altura, livre: { x: 25, y: 70 } }], W, H);
  conferir(lugar.x === pecas[0].x && lugar.y === pecas[0].y, "prévia = vídeo: a conta da prévia dá o mesmo lugar que o servidor", `(${lugar.x},${lugar.y})`);
}

// ---------- peça perto da borda: fica inteira ----------
{
  const pecas = await rasterizarElementos([{ id: "selo_redondo", texto: "À VENDA", x: 99, y: 2 }], W, H, tmp, "borda", {});
  const p = pecas[0];
  conferir(p.x >= 0 && p.x + p.largura <= W && p.y >= 0 && p.y + p.altura <= H, "peça no canto extremo: continua inteira dentro do quadro", `(${p.x},${p.y}) ${p.largura}x${p.altura}`);
}

// ---------- texto simples (drawtext) ----------
{
  const textos: TextoCena[] = [{ texto: "Sala ampla", posicao: "base", estilo: "faixa", animacao: "nenhuma", x: 70, y: 25 }];
  const saida = path.join(tmp, "texto.mp4");
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos }));
  const t = tinta(q0, await quadro(saida, "texto"));
  conferir(t.n > 300 && perto(t, 70, 25), "texto simples: sai onde foi solto (70%, 25%), não no rodapé", onde(t));
}

// ---------- texto simples SEM posição livre continua no rodapé (nada mudou pra quem não arrastou) ----------
{
  const saida = path.join(tmp, "texto-base.mp4");
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [{ texto: "Sala ampla", posicao: "base", estilo: "faixa", animacao: "nenhuma" }] }));
  const t = tinta(q0, await quadro(saida, "texto-base"));
  conferir(t.cy > H * 0.8, "texto sem arraste: continua no rodapé, como antes", onde(t));
}

// ---------- texto com arte (PNG por cima) ----------
{
  const efeito = LISTA_EFEITOS_TEXTO[0];
  const textos: TextoCena[] = [{ texto: "Vista mar", posicao: "base", estilo: "faixa", animacao: "nenhuma", arte: efeito.id, x: 35, y: 40 }];
  const artes = await rasterizarArtes(textos, H, tmp, "arte", false, W);
  const saida = path.join(tmp, "arte.mp4");
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos, artes }));
  const t = tinta(q0, await quadro(saida, "arte"));
  conferir(artes.length === 1 && t.n > 300 && perto(t, 35, 40), `texto com arte (${efeito.id}): sai onde foi solto (35%, 40%)`, onde(t));
}

// ---------- saneador ----------
{
  const bruto = {
    formato: "9:16",
    cenas: [
      {
        tipo: "foto",
        jobId: "00000000-0000-0000-0000-000000000000",
        textos: [
          { texto: "livre", x: 12.34, y: 88 },
          { texto: "fora", x: 150, y: -3 },
          { texto: "um só", x: 40 },
        ],
        elementos: [{ id: "selo_redondo", texto: "Novo", x: 60, y: 30 }],
      },
    ],
  };
  const r = limparEspec(bruto);
  if (!r.espec) console.log(`     (saneador recusou o espec de teste: ${r.erro})`);
  const e = r.espec as unknown as { cenas?: { textos?: TextoCena[]; elementos?: { x?: number; y?: number }[] }[] } | null;
  const tx = e?.cenas?.[0]?.textos ?? [];
  const el = e?.cenas?.[0]?.elementos ?? [];
  conferir(tx[0]?.x === 12.3 && tx[0]?.y === 88, "saneador: x/y do texto sobrevivem (arredondados a 0,1)", JSON.stringify(tx[0]));
  conferir(tx[1]?.x === 100 && tx[1]?.y === 0, "saneador: fora de 0..100 é cortado pro limite", JSON.stringify(tx[1]));
  conferir(tx[2] && tx[2].x === undefined && tx[2].y === undefined, "saneador: só um dos dois não vale (fica na posição normal)");
  conferir(el[0]?.x === 60 && el[0]?.y === 30, "saneador: x/y da peça sobrevivem");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
