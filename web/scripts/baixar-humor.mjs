// Baixa a parte de HUMOR dos Elementos: GIFs animados e adesivos 3D cômicos.
//
// Duas bibliotecas prontas, com licença que permite anúncio (ele pediu "igual ao CapCut",
// e o CapCut usa Giphy -- memes de filme e de gente famosa, que num anúncio de venda viram
// uso comercial de obra e de imagem alheia; ficou de fora por decisão dele):
//
//   GIFs     -> Noto Emoji Animation (Google), licença CC BY 4.0. Vêm em 512px, 33 quadros
//               por segundo e até 1,6 MB cada. Saem daqui em 224px, 12 quadros e 64 cores
//               (~300 KB; medido: 320px com pontilhado dava 1,7 MB, maior que o original),
//               e com miniatura animada em WebP de 96px pra galeria não pesar no celular.
//               224px é o tamanho padrão da peça num vídeo de 1920 (12%): não amplia.
//   Adesivos -> Fluent Emoji 3D (Microsoft), licença MIT, a mesma dos adesivos que já existem.
//
//   node scripts/baixar-humor.mjs            (baixa só o que falta)
//
// Depois de baixar, os ids entram em src/lib/adesivos.ts (a lista é a mesma de cima).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTA = path.join(RAIZ, "public", "adesivos");
const MINI = path.join(PASTA, "mini");
fs.mkdirSync(MINI, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-humor-"));

/** [id, codepoint] do Noto animado. */
export const GIFS = [
  // rindo e zoeira
  ["gif_chorando_de_rir", "1f602"], ["gif_rolando_de_rir", "1f923"], ["gif_gargalhada", "1f606"], ["gif_riso_nervoso", "1f605"],
  ["gif_doidinho", "1f92a"], ["gif_lingua", "1f61d"], ["gif_risadinha", "1f92d"], ["gif_estiloso", "1f60e"],
  ["gif_palhaco", "1f921"], ["gif_morri", "1f480"], ["gif_fantasma", "1f47b"], ["gif_nao_vi", "1f648"],
  ["gif_ponta_cabeca", "1f643"], ["gif_derretendo", "1fae0"], ["gif_gato_rindo", "1f639"],
  // reações
  ["gif_grito", "1f631"], ["gif_cabeca_explodindo", "1f92f"], ["gif_espantado", "1f632"], ["gif_corado", "1f633"],
  ["gif_chorando", "1f62d"], ["gif_pidao", "1f97a"], ["gif_pensando", "1f914"], ["gif_desconfiado", "1f928"],
  ["gif_revirando_olhos", "1f644"], ["gif_espiando", "1fae3"], ["gif_mao_na_boca", "1fae2"], ["gif_olhos", "1f440"],
  ["gif_deslumbrado", "1f929"], ["gif_cifrao", "1f911"], ["gif_festejando", "1f973"],
  // amor
  ["gif_apaixonado", "1f60d"], ["gif_amei", "1f970"], ["gif_beijinho", "1f618"], ["gif_coracao_chamas", "2764_fe0f_200d_1f525"],
  ["gif_coracao_brilhando", "1f496"], ["gif_coracao_maos", "1faf6"],
  // gestos
  ["gif_palmas", "1f44f"], ["gif_joinha", "1f44d"], ["gif_aleluia", "1f64c"], ["gif_tchau", "1f44b"],
  ["gif_forca", "1f4aa"], ["gif_negocio_fechado", "1f91d"], ["gif_por_favor", "1f64f"], ["gif_olha_aqui", "1f449"],
  ["gif_aqui_embaixo", "1f447"], ["gif_me_liga", "1f919"], ["gif_dancando", "1f483"],
  // comemorar e sinais
  ["gif_festa", "1f389"], ["gif_confete", "1f38a"], ["gif_fogo", "1f525"], ["gif_nota_100", "1f4af"],
  ["gif_brilhinhos", "2728"], ["gif_pow", "1f4a5"], ["gif_trofeu", "1f3c6"], ["gif_dinheiro_voando", "1f4b8"],
  ["gif_foguete", "1f680"], ["gif_casinha", "1f3e0"], ["gif_megafone", "1f4e3"], ["gif_despertador", "23f0"],
  ["gif_sirene", "1f6a8"], ["gif_atencao", "26a0_fe0f"],
  // bichos
  ["gif_cachorro", "1f415"], ["gif_gato_assustado", "1f640"], ["gif_patinhas", "1f43e"],
];

/** [id, pasta no repositório do Fluent Emoji]. */
export const CARAS = [
  ["cara_rindo", "Face with tears of joy"], ["cara_rolando", "Rolling on the floor laughing"], ["cara_oculos", "Smiling face with sunglasses"],
  ["cara_explodindo", "Exploding head"], ["cara_deslumbrado", "Star-struck"], ["cara_dinheiro", "Money-mouth face"],
  ["cara_festa", "Partying face"], ["cara_doidinho", "Zany face"], ["cara_grito", "Face screaming in fear"],
  ["cara_pensando", "Thinking face"], ["cara_monoculo", "Face with monocle"], ["cara_nerd", "Nerd face"],
  ["cara_cowboy", "Cowboy hat face"], ["cara_palhaco", "Clown face"], ["fantasma", "Ghost"], ["caveira", "Skull"],
  ["macaco_nao_vejo", "See-no-evil monkey"], ["cara_apaixonado", "Smiling face with heart-eyes"], ["cara_pidao", "Pleading face"],
  ["cara_chorando", "Loudly crying face"], ["cara_calor", "Hot face"], ["cara_frio", "Cold face"], ["cara_derretendo", "Melting face"],
  ["cara_ops", "Face with hand over mouth"], ["cara_continencia", "Saluting face"], ["cara_ponta_cabeca", "Upside-down face"],
  ["cara_lingua", "Winking face with tongue"], ["robo", "Robot"], ["et", "Alien"], ["gato_rindo", "Cat with tears of joy"],
  ["balao_fala", "Speech balloon"], ["balao_pensamento", "Thought balloon"], ["balao_bravo", "Right anger bubble"],
  ["tontura", "Dizzy"], ["moai", "Moai"], ["cartola", "Top hat"], ["olhos", "Eyes"], ["cara_piscando", "Winking face"],
];

const ffmpeg = ffmpegStatic;
const falhas = [];
let bytesGif = 0;
let bytesMini = 0;

async function baixar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

for (const [id, cp] of GIFS) {
  const saida = path.join(PASTA, `${id}.gif`);
  const mini = path.join(MINI, `${id}.webp`);
  try {
    if (!fs.existsSync(saida)) {
      const bruto = path.join(tmp, `${id}.gif`);
      fs.writeFileSync(bruto, await baixar(`https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.gif`));
      // Paleta própria por GIF, com a cor transparente reservada: sem isso o fundo vira preto.
      const r = spawnSync(
        ffmpeg,
        ["-y", "-hide_banner", "-loglevel", "error", "-i", bruto, "-vf", "fps=12,scale=224:224:flags=lanczos,split[a][b];[a]palettegen=reserve_transparent=1:max_colors=64[p];[b][p]paletteuse=dither=none:alpha_threshold=128", "-loop", "0", saida],
        { encoding: "utf8" }
      );
      if (r.status !== 0) throw new Error(r.stderr.slice(0, 200));
    }
    if (!fs.existsSync(mini)) {
      await sharp(saida, { animated: true }).resize(96, 96).webp({ quality: 60, effort: 6 }).toFile(mini);
    }
    bytesGif += fs.statSync(saida).size;
    bytesMini += fs.statSync(mini).size;
  } catch (e) {
    falhas.push(`${id}: ${String(e).slice(0, 120)}`);
  }
}

let bytesCara = 0;
for (const [id, pasta] of CARAS) {
  const saida = path.join(PASTA, `${id}.png`);
  try {
    if (!fs.existsSync(saida)) {
      const nome = pasta.toLowerCase().replace(/ /g, "_") + "_3d.png";
      const base = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${encodeURIComponent(pasta)}/3D/`;
      let png;
      try {
        png = await baixar(base + encodeURIComponent(nome));
      } catch {
        // Nome de arquivo fora do padrão: pergunta à API do GitHub qual é.
        const lista = await (await fetch(`https://api.github.com/repos/microsoft/fluentui-emoji/contents/assets/${encodeURIComponent(pasta)}/3D`)).json();
        const achado = Array.isArray(lista) ? lista.find((f) => f.name.endsWith(".png")) : null;
        if (!achado) throw new Error("sem png 3D");
        png = await baixar(achado.download_url);
      }
      fs.writeFileSync(saida, png);
    }
    bytesCara += fs.statSync(saida).size;
  } catch (e) {
    falhas.push(`${id}: ${String(e).slice(0, 120)}`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
console.log(`GIFs ${GIFS.length}: ${mb(bytesGif)} · miniaturas ${mb(bytesMini)} · adesivos ${CARAS.length}: ${mb(bytesCara)}`);
if (falhas.length) {
  console.log("FALHAS:\n" + falhas.join("\n"));
  process.exit(1);
}
