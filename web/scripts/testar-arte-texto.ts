// A ARTE DE TEXTO no arquivo final, medida em pixel.
//
// O modelo de texto é desenhado em SVG, virado PNG e sobreposto pelo ffmpeg. Cada um
// desses três passos tem o seu jeito de falhar em silêncio:
//
//   - o SVG sai vazio (fonte que não existe, caminho errado) e o PNG é transparente;
//   - o PNG entra como `-i` mas o rótulo do overlay não bate, e o ffmpeg usa a entrada 0;
//   - o filtro é montado certo e a entrada nunca é acrescentada ao comando.
//
// Nenhuma delas dá erro. As três dão um vídeo bonito, sem a arte. Então o teste não olha
// para a string do comando: renderiza DUAS vezes a mesma cena -- uma com arte, uma sem --
// extrai um quadro de cada e mede a diferença. A arte só conta como entregue se o quadro
// mudou DENTRO do retângulo onde ela foi posta, e não mudou fora.
//
// Roda em cima de foto REAL de imóvel (docs/testes-reais), nos três tipos de cena.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-arte-texto.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { argsCenaFoto, argsCenaClipe, argsCenaAntesDepois } from "../src/lib/video-ffmpeg.ts";
import { rasterizarArtes } from "../src/lib/texto-arte-servidor.ts";
import { MODELOS_ARTE } from "../src/lib/texto-arte.ts";
import type { TextoCena } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTOS = path.join(RAIZ, "..", "docs", "testes-reais");
const SAIDA = path.join(FOTOS, "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-arte-"));

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

/** Um quadro do vídeo, em RGB cru, pra comparar pixel a pixel. */
async function quadro(video: string, quando: number): Promise<Quadro> {
  const png = path.join(tmp, `q-${path.basename(video, ".mp4")}-${quando}.png`);
  // `-ss` ANTES do `-i` é busca de entrada; `-frames:v` DEPOIS, senão o demuxer de
  // imagem recusa a opção -- foi assim que uma extração já falhou calada neste projeto.
  rodar(["-ss", quando.toFixed(2), "-i", video, "-frames:v", "1", png]);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, largura: info.width, altura: info.height };
}

type Caixa = { x: number; y: number; largura: number; altura: number };

/** Diferença média (0-255) entre dois quadros, dentro e fora de um retângulo. */
function diferenca(a: Quadro, b: Quadro, caixa: Caixa) {
  let somaDentro = 0;
  let nDentro = 0;
  let somaFora = 0;
  let nFora = 0;
  for (let y = 0; y < a.altura; y++) {
    for (let x = 0; x < a.largura; x++) {
      const i = (y * a.largura + x) * 3;
      const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
      if (x >= caixa.x && x < caixa.x + caixa.largura && y >= caixa.y && y < caixa.y + caixa.altura) {
        somaDentro += d;
        nDentro++;
      } else {
        somaFora += d;
        nFora++;
      }
    }
  }
  return { dentro: somaDentro / Math.max(1, nDentro), fora: somaFora / Math.max(1, nFora) };
}

const foto = path.join(FOTOS, "01-mobiliar-depois.jpg");
const antes = path.join(FOTOS, "05-renovar-antes.jpg");
const depois = path.join(FOTOS, "05-renovar-depois.jpg");
for (const f of [foto, antes, depois]) {
  if (!fs.existsSync(f)) {
    console.error(`foto real faltando: ${f}`);
    process.exit(1);
  }
}

// Um clipe REAL, feito da foto real: é o que uma cena "clipe" recebe.
const clipe = path.join(tmp, "clipe.mp4");
rodar([
  "-loop", "1", "-framerate", "30", "-t", String(DUR + 1), "-i", foto,
  "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p`,
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clipe,
]);

console.log(`arte de texto medida no arquivo final · ${W}x${H} · ${DUR}s\n`);

// ---------- 1. cada modelo aparece numa cena de foto ----------
const semArte = path.join(tmp, "foto-sem.mp4");
rodar(argsCenaFoto({ foto, saida: semArte, W, H, duracao: DUR, efeito: "parado", textos: [], topoOcupado: false }));
const qSem = await quadro(semArte, 1.5);

for (const modelo of MODELOS_ARTE) {
  const ts: TextoCena[] = [{ texto: modelo.exemplo, arte: modelo.id, posicao: "centro" }];
  const as = await rasterizarArtes(ts, H, tmp, `m-${modelo.id}`, false);
  if (as.length !== 1) {
    conferir(false, `${modelo.id}: rasterizou`, `${as.length} peças`);
    continue;
  }
  const arte = as[0];
  const saida = path.join(tmp, `foto-${modelo.id}.mp4`);
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: ts, topoOcupado: false, artes: as }));
  const q = await quadro(saida, 1.5);
  const d = diferenca(qSem, q, { x: Math.round((W - arte.largura) / 2), y: arte.y, largura: arte.largura, altura: arte.altura });
  conferir(
    d.dentro > 12 && d.fora < 1.5,
    `${modelo.id} aparece no vídeo`,
    `dentro ${d.dentro.toFixed(1)} · fora ${d.fora.toFixed(2)} · ${arte.largura}x${arte.altura} em y=${arte.y}`
  );
}

// ---------- 2. os outros tipos de cena ----------
const modelo = MODELOS_ARTE.find((m) => m.id === "adesivo") ?? MODELOS_ARTE[0];
const textos: TextoCena[] = [{ texto: "Agende a visita", arte: modelo.id, posicao: "centro" }];
const artes = await rasterizarArtes(textos, H, tmp, "tipo", false);
const arte = artes[0];
const caixa: Caixa = { x: Math.round((W - arte.largura) / 2), y: arte.y, largura: arte.largura, altura: arte.altura };

const casos: { nome: string; com: string[]; sem: string[]; quando: number }[] = [
  {
    nome: "cena de clipe",
    quando: 1.5,
    sem: argsCenaClipe({ clipe, saida: path.join(tmp, "clipe-sem.mp4"), W, H, duracao: DUR, textos: [] }),
    com: argsCenaClipe({ clipe, saida: path.join(tmp, "clipe-com.mp4"), W, H, duracao: DUR, textos, artes }),
  },
  {
    nome: "cena antes/depois",
    // Depois da cortina: os dois vídeos estão na mesma foto, só a arte difere.
    quando: DUR - 0.3,
    sem: argsCenaAntesDepois({ antes, depois, saida: path.join(tmp, "ad-sem.mp4"), W, H, duracao: DUR, textos: [] }),
    com: argsCenaAntesDepois({ antes, depois, saida: path.join(tmp, "ad-com.mp4"), W, H, duracao: DUR, textos, artes }),
  },
];

for (const caso of casos) {
  rodar(caso.sem);
  rodar(caso.com);
  const qa = await quadro(caso.sem[caso.sem.length - 1], caso.quando);
  const qb = await quadro(caso.com[caso.com.length - 1], caso.quando);
  const d = diferenca(qa, qb, caixa);
  conferir(d.dentro > 12 && d.fora < 1.5, `${caso.nome}: a arte entra`, `dentro ${d.dentro.toFixed(1)} · fora ${d.fora.toFixed(2)}`);
}

// ---------- 3. o texto com arte NÃO é desenhado duas vezes ----------
const comandos: [string, string[]][] = [
  ["foto", argsCenaFoto({ foto, saida: path.join(tmp, "x.mp4"), W, H, duracao: DUR, efeito: "parado", textos, artes })],
  ["clipe", argsCenaClipe({ clipe, saida: path.join(tmp, "x.mp4"), W, H, duracao: DUR, textos, artes })],
  ["antes/depois", argsCenaAntesDepois({ antes, depois, saida: path.join(tmp, "x.mp4"), W, H, duracao: DUR, textos, artes })],
];
for (const [nome, args] of comandos) {
  const filtro = args[args.indexOf("-filter_complex") + 1];
  // Procura a FRASE, não a palavra "drawtext": a cena antes/depois desenha os rótulos
  // "Antes" e "Depois" com drawtext de propósito, e eles têm que continuar lá.
  conferir(!filtro.includes("Agende"), `${nome}: o texto com arte não sai também no drawtext`);
}

// ---------- folha de contato do vídeo, pra olhar ----------
const escolhidos = ["adesivo", "brilho", "fita", "degrade", "carimbo"];
const tira = path.join(SAIDA, "arte-no-video.jpg");
rodar([
  ...escolhidos.flatMap((id) => ["-ss", "1.5", "-i", path.join(tmp, `foto-${id}.mp4`)]),
  "-filter_complex",
  `${escolhidos.map((_, i) => `[${i}:v]scale=360:-2,setpts=PTS-STARTPTS[v${i}]`).join(";")};${escolhidos.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${escolhidos.length}[out]`,
  "-map", "[out]", "-frames:v", "1", "-q:v", "3", tira,
]);
console.log(`\nfolha de contato: ${path.relative(path.join(RAIZ, ".."), tira)}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
