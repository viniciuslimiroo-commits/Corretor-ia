// EFEITOS DE TEXTO: do catálogo ao quadro do vídeo, e a tela junto.
//
// O efeito passa por cinco lugares, e cada um tem o seu jeito de perder a peça calado:
//
//   catálogo  -> lista.ts gerada à mão diverge (a galeria oferece um id que o servidor
//                não desenha);
//   cartão    -> PNG que falta vira quadrado vazio na galeria;
//   saneador  -> id novo recusado e o texto sai sem efeito (já aconteceu com `arte`);
//   largura   -> frase longa em fonte larga passa da borda do vídeo;
//   vídeo     -> a peça não entra no quadro.
//
// E a rota do palco, se o servidor de desenvolvimento estiver de pé (BASE).
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-efeitos-texto.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { EFEITOS_TEXTO, LARGURA_MAXIMA, desenharEfeitoNoVideo } from "../src/lib/efeitos-texto/catalogo.ts";
import { LISTA_EFEITOS_TEXTO } from "../src/lib/efeitos-texto/lista.ts";
import { rasterizarArtes } from "../src/lib/texto-arte-servidor.ts";
import { argsCenaFoto } from "../src/lib/video-ffmpeg.ts";
import { limparEspec, type TextoCena } from "../src/lib/video.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTO = path.join(RAIZ, "..", "docs", "testes-reais", "01-mobiliar-depois.jpg");
const BASE = process.env.BASE ?? "http://localhost:3000";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-efeitos-"));

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const rodar = (a: string[]) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...a], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr ?? "").slice(0, 400));
};

console.log(`efeitos de texto: ${EFEITOS_TEXTO.length} no catálogo\n`);

// ---------- 1. catálogo, lista e cartões ----------
const ids = EFEITOS_TEXTO.map((e) => e.id);
conferir(new Set(ids).size === ids.length, "nenhum id repetido no catálogo");
const listaIgual =
  LISTA_EFEITOS_TEXTO.length === EFEITOS_TEXTO.length &&
  LISTA_EFEITOS_TEXTO.every((l, k) => {
    const e = EFEITOS_TEXTO[k];
    return l.id === e.id && l.rotulo === e.rotulo && l.categoria === e.categoria && l.amostra === e.amostra;
  });
conferir(listaIgual, "lista.ts (o que a tela lê) é igual ao catálogo do servidor", listaIgual ? "" : "rode scripts/gerar-cartoes-efeitos.ts");
const pastaCartoes = path.join(RAIZ, "public", "efeitos-texto");
const semCartao = ids.filter((id) => !fs.existsSync(path.join(pastaCartoes, `${id}.png`)));
const sobrando = fs.existsSync(pastaCartoes) ? fs.readdirSync(pastaCartoes).filter((f) => f.endsWith(".png") && !ids.includes(f.replace(/\.png$/, ""))) : [];
conferir(semCartao.length === 0, "todo efeito tem cartão na galeria", semCartao.join(", "));
conferir(sobrando.length === 0, "nenhum cartão de efeito que não existe", sobrando.join(", "));
const categorias = new Set(EFEITOS_TEXTO.map((e) => e.categoria));
conferir(categorias.size >= 4, "a galeria tem prateleiras de verdade (4 categorias ou mais)", [...categorias].join(", "));

// ---------- 2. cada efeito: contorno, prefixo, tinta, e a frase longa cabe ----------
const FRASE = "Aceita financiamento FGTS"; // 25 caracteres, perto do teto de 26
const FORMATOS: [string, number, number][] = [
  ["9:16", 1080, 1920],
  ["16:9", 1920, 1080],
  ["1:1", 1080, 1080],
  ["4:5", 1080, 1350],
];
for (const e of EFEITOS_TEXTO) {
  const d = desenharEfeitoNoVideo(e, e.amostra, 1080, 1920, { prefixo: "t" });
  const idsSvg = [...d.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const erros: string[] = [];
  if (/<text[\s>]/.test(d.svg)) erros.push("tem <text>");
  if (idsSvg.some((i) => !i.startsWith(`t-${e.id}`))) erros.push("id sem prefixo");
  let largas = 0;
  for (const [, W, H] of FORMATOS) {
    const f = desenharEfeitoNoVideo(e, FRASE, W, H, { prefixo: "t" });
    if (f.largura > W * LARGURA_MAXIMA + 1) largas++;
  }
  if (largas) erros.push(`frase longa passa da largura em ${largas} formato(s)`);
  const png = await sharp(Buffer.from(d.svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opacos = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 128) opacos++;
  if (opacos / (png.info.width * png.info.height) < 0.05) erros.push("quase sem tinta");
  conferir(erros.length === 0, `${e.rotulo}`, erros.join(" · ") || `${Math.round(d.largura)}x${Math.round(d.altura)} em corpo ${d.corpo}`);
}

// ---------- 3. saneador ----------
{
  const um = EFEITOS_TEXTO[0].id;
  const { espec } = limparEspec({
    formato: "9:16",
    cenas: [{ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4, textos: [{ texto: "Vista mar", arte: um }, { texto: "Outro", arte: "efeito_inventado" }] }],
  });
  const ts = espec?.cenas[0].textos ?? [];
  conferir(ts[0]?.arte === um, "saneador: o efeito novo sobrevive", `arte=${ts[0]?.arte ?? "sumiu"}`);
  conferir(ts[1] && ts[1].arte === undefined, "saneador: efeito inventado é recusado (o texto fica, sem efeito)");
}

// ---------- 4. no quadro do vídeo ----------
{
  const W = 540;
  const H = 960;
  const familias = [...new Set(EFEITOS_TEXTO.map((e) => e.categoria))].map((c) => EFEITOS_TEXTO.find((e) => e.categoria === c)!);
  const semTexto = path.join(tmp, "base.mp4");
  rodar(argsCenaFoto({ foto: FOTO, saida: semTexto, W, H, duracao: 2, efeito: "parado", textos: [] }));
  rodar(["-ss", "1", "-i", semTexto, "-frames:v", "1", path.join(tmp, "base.png")]);
  const base = await sharp(path.join(tmp, "base.png")).removeAlpha().raw().toBuffer();

  for (const e of familias) {
    const textos: TextoCena[] = [{ texto: "Pronto pra morar", arte: e.id, posicao: "centro", animacao: "nenhuma" }];
    const artes = await rasterizarArtes(textos, H, tmp, `v-${e.id}`, false, W);
    if (artes.length !== 1) {
      conferir(false, `${e.rotulo} vira peça no vídeo`, `${artes.length} peças`);
      continue;
    }
    const a = artes[0];
    const saida = path.join(tmp, `${e.id}.mp4`);
    rodar(argsCenaFoto({ foto: FOTO, saida, W, H, duracao: 2, efeito: "parado", textos, artes }));
    rodar(["-ss", "1", "-i", saida, "-frames:v", "1", path.join(tmp, `${e.id}.png`)]);
    const q = await sharp(path.join(tmp, `${e.id}.png`)).removeAlpha().raw().toBuffer();
    const x0 = Math.round((W - a.largura) / 2);
    let dentro = 0;
    let nDentro = 0;
    let fora = 0;
    let nFora = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const dd = (Math.abs(base[i] - q[i]) + Math.abs(base[i + 1] - q[i + 1]) + Math.abs(base[i + 2] - q[i + 2])) / 3 > 40 ? 1 : 0;
        if (x >= x0 && x < x0 + a.largura && y >= a.y && y < a.y + a.altura) {
          dentro += dd;
          nDentro++;
        } else {
          fora += dd;
          nFora++;
        }
      }
    }
    conferir(
      dentro / nDentro > 0.05 && fora / nFora < 0.002 && a.largura <= W * LARGURA_MAXIMA + 1,
      `${e.rotulo} (${e.categoria}) aparece no vídeo, dentro da largura`,
      `pintado ${((dentro / nDentro) * 100).toFixed(1)}% · fora ${((fora / nFora) * 100).toFixed(3)}% · ${a.largura}px de ${W}`
    );
  }
}

// ---------- 5. a rota do palco (se o servidor estiver de pé) ----------
try {
  const e = EFEITOS_TEXTO[0];
  const r = await fetch(`${BASE}/api/editor/efeito-texto?id=${encodeURIComponent(e.id)}&texto=${encodeURIComponent("À venda")}&formato=9:16&n=2`);
  if (r.status === 404 || r.status >= 500) throw new Error(String(r.status));
  const d = (await r.json()) as { svg: string; largura: number; altura: number; W: number; H: number };
  conferir(!/<text[\s>]/.test(d.svg) && d.H === 1000 && d.largura > 0, "rota do palco devolve contorno num quadro de 1000", `${Math.round(d.largura)}x${Math.round(d.altura)} de ${d.W}x${d.H}`);
  const mesma = desenharEfeitoNoVideo(e, "À venda", d.W, d.H, { prefixo: "palco2" });
  conferir(Math.abs(mesma.largura - d.largura) < 0.5, "o palco recebe a MESMA largura que a montagem do vídeo calcula");
  const ruim = await fetch(`${BASE}/api/editor/efeito-texto?id=nao_existe&texto=x`);
  conferir(ruim.status === 404, "rota recusa efeito que não existe");
} catch (err) {
  console.log(`(rota do palco não conferida: servidor em ${BASE} não respondeu -- ${String(err).slice(0, 60)})`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
