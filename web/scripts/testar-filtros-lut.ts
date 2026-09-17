// FILTROS: a miniatura da tela é o que sai no vídeo -- medido, não prometido.
//
// A promessa da aba Filtros é uma só: o quadradinho que a pessoa olha pra escolher é a
// mesma cor do arquivo final. Então o teste compara as duas pontas do produto de verdade:
//
//   TELA   -- a tabela 3D da grade (`tabelaDaGrade` + `lerTabela`, exatamente o que o
//             componente FotoComCor roda no canvas) aplicada ao quadro SEM filtro;
//   VÍDEO  -- o quadro que sai do `argsCenaFoto` com a LUT escrita por `lutCube`,
//             depois de passar pelo saneador (`limparEspec`) e pela resolução da cena
//             (`gradeDaCena`) -- o caminho que o pipeline faz.
//
// E três provas de que o teste não é enfeite (observação 0049):
//
//   - o filtro MUDA o quadro (senão "tela = vídeo" passaria com os dois desligados);
//   - trocar a grade da tela por OUTRA dá erro grande (senão a métrica não separa nada);
//   - a ordem do .cube invertida (azul variando mais rápido) dá erro grande -- é o
//     defeito que troca azul por vermelho sem nenhuma mensagem.
//
// Foto REAL de imóvel (docs/testes-reais).
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-filtros-lut.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { argsCenaFoto } from "../src/lib/video-ffmpeg.ts";
import { gradeDaCena, limparEspec } from "../src/lib/video.ts";
import {
  MODELOS_FILTRO,
  anguloDaVinheta,
  escurecerComVinheta,
  fatorDaVinheta,
  lerTabela,
  lutCube,
  tabelaDaGrade,
  vinhetaDaGrade,
  type Grade,
} from "../src/lib/filtros.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTOS = path.join(RAIZ, "..", "docs", "testes-reais");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-lut-"));

const W = 360;
const H = 640;
const DUR = 2;

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function rodar(args: string[]) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr ?? "").trim().slice(0, 500) || "ffmpeg falhou");
}

async function quadro(video: string): Promise<Buffer> {
  const png = video.replace(/\.mp4$/, ".png");
  rodar(["-ss", "1.00", "-i", video, "-frames:v", "1", png]);
  return sharp(png).removeAlpha().raw().toBuffer();
}

/** O que a TELA mostraria: a tabela da grade (e a vinheta) sobre o quadro sem filtro. */
function naTela(base: Buffer, grade: Grade, n = 33): Buffer {
  const t = tabelaDaGrade(grade, n);
  const ang = anguloDaVinheta(vinhetaDaGrade(grade));
  const out = Buffer.alloc(base.length);
  const s = new Float32Array(3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      lerTabela(t, n, base[i] / 255, base[i + 1] / 255, base[i + 2] / 255, s);
      const f = ang > 0 ? fatorDaVinheta(x, y, W, H, ang) : 1;
      out[i] = Math.round(Math.min(255, (ang > 0 ? escurecerComVinheta(s[0], f) : s[0]) * 255));
      out[i + 1] = Math.round(Math.min(255, (ang > 0 ? escurecerComVinheta(s[1], f) : s[1]) * 255));
      out[i + 2] = Math.round(Math.min(255, (ang > 0 ? escurecerComVinheta(s[2], f) : s[2]) * 255));
    }
  }
  return out;
}

const dist = (a: Buffer, b: Buffer) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

/**
 * Desvio MÉDIO COM SINAL por canal (vídeo − tela). É o número que diz se a prévia mente:
 * erro absoluto grande com viés zero é ruído de compressão espalhado; viés de 3 níveis
 * no vermelho é a miniatura mais fria que o vídeo, e isso a pessoa vê.
 */
const vies = (tela: Buffer, video: Buffer) => {
  const s = [0, 0, 0];
  for (let i = 0; i < tela.length; i++) s[i % 3] += video[i] - tela[i];
  return s.map((v) => v / (tela.length / 3));
};

const foto = path.join(FOTOS, "01-mobiliar-depois.jpg");
if (!fs.existsSync(foto)) {
  console.error(`foto real faltando: ${foto}`);
  process.exit(1);
}

console.log(`filtros: tela contra vídeo · ${W}x${H}\n`);

// O quadro SEM filtro -- é sobre ele que a tela aplica a tabela.
const semFiltro = path.join(tmp, "base.mp4");
rodar(argsCenaFoto({ foto, saida: semFiltro, W, H, duracao: DUR, efeito: "parado", textos: [] }));
const base = await quadro(semFiltro);

/** Renderiza uma cena passando pelo CAMINHO do produto: saneador, grade da cena, LUT. */
async function video(bruto: Record<string, unknown>, nome: string): Promise<{ q: Buffer; grade: Grade }> {
  const { espec, erro } = limparEspec({
    formato: "9:16",
    cenas: [{ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4, ...((bruto.cena as object) ?? {}) }],
    ...((bruto.video as object) ?? {}),
  });
  if (!espec) throw new Error(erro ?? "espec recusado");
  const grade = gradeDaCena(espec.cenas[0], espec);
  const lut = path.join(tmp, `${nome}.cube`);
  fs.writeFileSync(lut, lutCube(grade));
  const v = vinhetaDaGrade(grade);
  const saida = path.join(tmp, `${nome}.mp4`);
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], cor: { lut, vinheta: v || undefined } }));
  return { q: await quadro(saida), grade };
}

// ---------- 0. o piso de ruído do próprio caminho ----------
//
// Uma LUT que praticamente não muda nada, pelo mesmo caminho: conversão RGB/YUV, 4:2:0 e
// h264. O erro que sobra aqui não é da prévia -- é do vídeo -- e é ele que diz quanto
// erro é aceitável. Número escolhido no papel reprovou treze filtros certos na primeira
// rodada; o piso medido é a régua honesta.
const ident = await video({ video: { ajustes: { exposicao: 0.001 } } }, "identidade");
const piso = dist(naTela(base, ident.grade), ident.q);
console.log(`piso de ruído do caminho do vídeo: ${piso.toFixed(2)}
`);

const bate = (tela: Buffer, q: Buffer) => {
  const e = dist(tela, q);
  const v = vies(tela, q);
  return { ok: e < piso * 2 && v.every((x) => Math.abs(x) < 1.2), texto: `erro ${e.toFixed(2)} · viés R ${v[0].toFixed(2)} G ${v[1].toFixed(2)} B ${v[2].toFixed(2)}` };
};

// ---------- 1. cada filtro: tela = vídeo ----------
for (const m of MODELOS_FILTRO.filter((f) => f.id !== "natural")) {
  const { q, grade } = await video({ video: { filtro: m.id } }, m.id);
  const r = bate(naTela(base, grade), q);
  const efeito = dist(base, q);
  conferir(r.ok && efeito > 3, `${m.rotulo}: tela = vídeo`, `${r.texto} · o filtro muda ${efeito.toFixed(1)}`);
}

// ---------- 2. intensidade, ajustes e cena própria, pelo caminho inteiro ----------
{
  const { q, grade } = await video({ video: { filtro: "quente", intensidadeFiltro: 0.5, ajustes: { exposicao: 0.3, contraste: 0.2 } } }, "misto");
  const r = bate(naTela(base, grade), q);
  conferir(r.ok, "filtro pela metade + ajustes do vídeo: tela = vídeo", r.texto);
  conferir(grade.intensidade === 0.5 && grade.ajustes.exposicao === 0.3, "intensidade e ajustes sobrevivem ao saneador");
}
{
  // A cena com ajustes VAZIOS explícitos não herda os do vídeo. Era o desencontro entre
  // tela e vídeo que o saneador antigo criaria.
  const { grade } = await video({ video: { ajustes: { exposicao: 0.6 } }, cena: { ajustes: {} } }, "vazio");
  conferir(grade.ajustes.exposicao === 0, "cena com ajustes zerados NÃO herda a exposição do vídeo", `exposição da cena ${grade.ajustes.exposicao}`);
}
{
  const { grade } = await video({ video: { filtro: "pb" }, cena: { filtro: "quente", intensidade: 0.4 } }, "propria");
  conferir(grade.filtro === "quente" && grade.intensidade === 0.4, "filtro próprio da cena vence o do vídeo");
}
{
  // Vídeo feito antes dos Ajustes: `luz` continua clareando.
  const { grade } = await video({ cena: { luz: 0.2 } }, "luz");
  conferir(grade.ajustes.exposicao > 0.3, "a `luz` antiga vira exposição", `exposição ${grade.ajustes.exposicao}`);
}

// ---------- 3. o teste separa o certo do errado ----------
{
  const { q, grade } = await video({ video: { filtro: "cinema" } }, "prova");
  const certa = dist(naTela(base, grade), q);
  const outra = dist(naTela(base, { ...grade, filtro: "quente" }), q);
  conferir(outra > certa * 4 && outra > piso * 2, "com a grade ERRADA na tela, o erro dispara", `certa ${certa.toFixed(2)} · errada ${outra.toFixed(2)}`);

  // .cube com azul variando mais rápido: o defeito de ordem que troca canais em silêncio.
  const n = 33;
  const t = tabelaDaGrade({ ...grade, filtro: "quente" }, n);
  const linhas = ["LUT_3D_SIZE 33"];
  for (let ri = 0; ri < n; ri++) for (let gi = 0; gi < n; gi++) for (let bi = 0; bi < n; bi++) {
    const p = ((bi * n + gi) * n + ri) * 3;
    linhas.push(`${t[p].toFixed(5)} ${t[p + 1].toFixed(5)} ${t[p + 2].toFixed(5)}`);
  }
  const lutErrada = path.join(tmp, "invertida.cube");
  fs.writeFileSync(lutErrada, linhas.join("\n") + "\n");
  const saida = path.join(tmp, "invertida.mp4");
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], cor: { lut: lutErrada } }));
  const qErrado = await quadro(saida);
  const erroOrdem = dist(naTela(base, { ...grade, filtro: "quente" }), qErrado);
  conferir(erroOrdem > piso * 2, "LUT com a ordem dos canais trocada é pega", `erro ${erroOrdem.toFixed(2)}`);
}

// ---------- 4. a vinheta da tela segue a conta do ffmpeg ----------
{
  const { q, grade } = await video({ video: { filtro: "noite" } }, "vinheta");
  const nova = bate(naTela(base, grade), q);
  // A conta ANTIGA: multiplicar o RGB direto, sem o piso de 16 do YUV.
  const t = tabelaDaGrade(grade, 33);
  const ang = anguloDaVinheta(vinhetaDaGrade(grade));
  const antiga = Buffer.alloc(base.length);
  const s = new Float32Array(3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    lerTabela(t, 33, base[i] / 255, base[i + 1] / 255, base[i + 2] / 255, s);
    const f = fatorDaVinheta(x, y, W, H, ang);
    for (let c = 0; c < 3; c++) antiga[i + c] = Math.round(Math.min(255, s[c] * 255 * f));
  }
  const velha = bate(antiga, q);
  conferir(nova.ok && !velha.ok, "vinheta: a conta com o piso do YUV passa, a de RGB puro é reprovada", `nova ${nova.texto} | antiga ${velha.texto}`);
}

// ---------- miniaturas da aba Filtros ----------
// Cartão que falta vira quadrado escuro na galeria; cartão velho mostra um filtro que já
// mudou. Todo filtro tem o seu, nenhum sobra, e o cartão de um filtro não é o do natural.
{
  const pasta = path.join(RAIZ, "public", "filtros");
  const ids = MODELOS_FILTRO.map((f) => f.id);
  const noDisco = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, "")) : [];
  const faltam = ids.filter((id) => !noDisco.includes(id));
  const sobram = noDisco.filter((id) => !ids.includes(id));
  conferir(faltam.length === 0 && sobram.length === 0, "todo filtro tem miniatura pronta, e nenhuma sobra", [...faltam.map((i) => "falta " + i), ...sobram.map((i) => "sobra " + i)].join(", ") || `${ids.length}`);
  if (!faltam.length) {
    const natural = await sharp(path.join(pasta, "natural.jpg")).raw().toBuffer();
    const iguais: string[] = [];
    for (const id of ids.filter((i) => i !== "natural")) {
      const m = await sharp(path.join(pasta, `${id}.jpg`)).raw().toBuffer();
      let soma = 0;
      for (let i = 0; i < m.length; i++) soma += Math.abs(m[i] - natural[i]);
      if (soma / m.length < 4) iguais.push(id);
    }
    conferir(iguais.length === 0, "cada miniatura mostra o seu filtro (não é cópia do natural)", iguais.join(", "));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
