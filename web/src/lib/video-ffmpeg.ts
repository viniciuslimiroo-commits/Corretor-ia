import path from "node:path";
import { caminhoFonte } from "./ffmpeg";
import { LIMITES, type EfeitoId } from "./video";

// Monta as linhas de comando do ffmpeg pra cada pedaço do vídeo. Funções puras: recebem
// caminhos locais e devolvem a lista de argumentos; quem roda é rodarFfmpeg (ffmpeg.ts),
// quem baixa/sobe arquivos é a rota. Assim dá pra testar cada receita num script sem
// banco nem storage (scripts/testar-video*.mjs foi de onde as receitas saíram).
//
// Convenções: toda cena sai em WxH, `fps` quadros/s, yuv420p, sem áudio, H.264
// "veryfast" CRF 23 -- o mesmo perfil pra montagem poder emendar sem surpresa.

export const FPS = 24;
export const PRESET_X264 = "veryfast";
export const CRF = "23";

// Zoompan trepida quando a entrada tem o mesmo tamanho da saída; 2x resolve e ainda
// cabe no tempo (medido: 4-5s por cena de 4s em 1080x1920).
const ESCALA_ZOOM = 2;

const CODEC_VIDEO = ["-c:v", "libx264", "-preset", PRESET_X264, "-crf", CRF, "-pix_fmt", "yuv420p", "-r", String(FPS)];

/**
 * Caminho de arquivo dentro de um filtro, SEM aspas: barra normal, e ':' e espaço
 * escapados com barra invertida. Entre aspas simples o ffmpeg não processa escapes, e
 * o "C\:" do Windows ia literal pro freetype -- foi por isso que o título saiu em fonte
 * de fallback nos primeiros testes.
 */
export function caminhoParaFiltro(p: string): string {
  // Testado (scripts/testar-fonte.mjs): caminho absoluto do Windows, mesmo escapado,
  // faz o freetype cair na fonte de fallback em silêncio; relativo ao cwd carrega.
  // Na Vercel o cwd é a raiz da função e os assets entram com o mesmo caminho relativo.
  const rel = path.relative(process.cwd(), p);
  const usado = rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : p;
  return usado.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/ /g, "\\ ");
}

/** Texto seguro pro drawtext, já entre aspas simples. Apóstrofo vira ’ pra não brigar com a citação. */
export function textoParaFiltro(t: string): string {
  const limpo = t
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/[\r\n]+/g, " ");
  return `'${limpo}'`;
}

/** Escala pra cobrir WxH e corta o excesso, mantendo o centro. */
export function enquadrar(W: number, H: number, escala = 1): string {
  const w = W * escala;
  const h = H * escala;
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
}

type OpcoesPill = {
  texto: string;
  W: number;
  H: number;
  /** Fração da altura do vídeo. */
  tamanho: number;
  /** "alto" fica abaixo do carimbo de título/preço, que ocupa o topo. */
  posicao: "topo" | "alto" | "base" | "centro";
  cor?: string;
  enable?: string;
  fonte?: string;
};

/** Um "pill": texto branco sobre caixa arredondada índigo, como as legendas do export. */
export function pill(o: OpcoesPill): string {
  const fonte = o.fonte ?? caminhoFonte();
  const tamanho = Math.max(18, Math.round(o.H * o.tamanho));
  const borda = Math.round(tamanho * 0.45);
  const y =
    o.posicao === "topo"
      ? `${Math.round(o.H * 0.06)}`
      : o.posicao === "alto"
        ? `${Math.round(o.H * 0.2)}`
        : o.posicao === "centro"
          ? "(h-text_h)/2"
          : `h-text_h-${Math.round(o.H * 0.09)}`;
  const partes = [
    `fontfile='${caminhoParaFiltro(fonte)}'`,
    `text=${textoParaFiltro(o.texto)}`,
    `fontsize=${tamanho}`,
    `fontcolor=white`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `box=1`,
    `boxcolor=${o.cor ?? "0x0f2d5b"}@0.85`,
    `boxborderw=${borda}`,
  ];
  if (o.enable) partes.push(`enable='${o.enable}'`);
  return `drawtext=${partes.join(":")}`;
}

function zoompan(efeito: EfeitoId, frames: number, W: number, H: number): string {
  const d = frames;
  const centroX = `iw/2-(iw/zoom/2)`;
  const centroY = `ih/2-(ih/zoom/2)`;
  const receitas: Record<EfeitoId, { z: string; x: string; y: string }> = {
    aproximar: { z: `min(1+0.10*on/${d},1.10)`, x: centroX, y: centroY },
    afastar: { z: `max(1.10-0.10*on/${d},1)`, x: centroX, y: centroY },
    esquerda: { z: "1.08", x: `(iw-iw/zoom)*(1-on/${d})`, y: centroY },
    direita: { z: "1.08", x: `(iw-iw/zoom)*(on/${d})`, y: centroY },
    parado: { z: "1", x: "0", y: "0" },
  };
  const r = receitas[efeito];
  return `zoompan=z='${r.z}':d=${d}:x='${r.x}':y='${r.y}':s=${W}x${H}:fps=${FPS}`;
}

/** Cena de foto parada com movimento de câmera (Ken Burns). Um quadro de entrada. */
export function argsCenaFoto(o: { foto: string; saida: string; W: number; H: number; duracao: number; efeito: EfeitoId; legenda?: string }): string[] {
  const frames = Math.round(o.duracao * FPS);
  const filtros = [enquadrar(o.W, o.H, ESCALA_ZOOM), zoompan(o.efeito, frames, o.W, o.H), "format=yuv420p"];
  if (o.legenda) filtros.push(pill({ texto: o.legenda, W: o.W, H: o.H, tamanho: 0.03, posicao: "base" }));
  return ["-i", o.foto, "-filter_complex", `[0:v]${filtros.join(",")}[v]`, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

/**
 * Antes e depois: mostra a original, uma cortina passa da esquerda pra direita e fica
 * o resultado. As duas ficam paradas de propósito -- o movimento é a cortina.
 */
export function argsCenaAntesDepois(o: { antes: string; depois: string; saida: string; W: number; H: number; duracao: number; legenda?: string }): string[] {
  const trans = 1.4;
  const cada = (o.duracao + trans) / 2;
  const offset = cada - trans;
  const base = `${enquadrar(o.W, o.H)},format=yuv420p`;
  const rotA = pill({ texto: "Antes", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0x111111" });
  const rotB = pill({ texto: "Depois", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0xf06b4f" });
  const legenda = o.legenda ? "," + pill({ texto: o.legenda, W: o.W, H: o.H, tamanho: 0.03, posicao: "base" }) : "";
  const filtro = `[0:v]${base},${rotA}[a];[1:v]${base},${rotB}[b];[a][b]xfade=transition=wipeleft:duration=${trans}:offset=${offset.toFixed(2)}${legenda ? "[ab];[ab]" + legenda.slice(1) : ""}[v]`;
  return [
    "-loop", "1", "-framerate", String(FPS), "-t", cada.toFixed(2), "-i", o.antes,
    "-loop", "1", "-framerate", String(FPS), "-t", cada.toFixed(2), "-i", o.depois,
    "-filter_complex", filtro, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida,
  ];
}

/**
 * Clipe de vídeo da pessoa (ou o clipe que a IA animou): enquadra, corta na duração,
 * completa clonando o último quadro se for mais curto, tira o áudio (a música é nossa).
 * `melhorar` é uma correção leve de cor e nitidez, sem IA.
 */
export function argsCenaClipe(o: { clipe: string; saida: string; W: number; H: number; duracao: number; legenda?: string; melhorar?: boolean }): string[] {
  const filtros = [`fps=${FPS}`, enquadrar(o.W, o.H), "format=yuv420p"];
  if (o.melhorar) filtros.push("eq=contrast=1.06:brightness=0.02:saturation=1.12", "unsharp=5:5:0.6:5:5:0.0");
  filtros.push(`tpad=stop_mode=clone:stop_duration=${o.duracao}`);
  if (o.legenda) filtros.push(pill({ texto: o.legenda, W: o.W, H: o.H, tamanho: 0.03, posicao: "base" }));
  return ["-ss", "0", "-t", o.duracao.toFixed(2), "-i", o.clipe, "-an", "-filter_complex", `[0:v]${filtros.join(",")}[v]`, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

/** Tela final: cor da marca, logo (se houver), nome, CRECI e WhatsApp. */
export function argsTelaFinal(o: { saida: string; W: number; H: number; duracao: number; cor: string; logo?: string; nome: string; creci?: string; whatsapp?: string }): string[] {
  const corHex = /^#[0-9a-fA-F]{6}$/.test(o.cor) ? "0x" + o.cor.slice(1) : "0x0f2d5b";
  const fonte = caminhoParaFiltro(caminhoFonte());
  const args = ["-f", "lavfi", "-i", `color=c=${corHex}:s=${o.W}x${o.H}:d=${o.duracao}:r=${FPS}`];
  const linhas: string[] = [];
  const grande = Math.round(o.H * 0.042);
  const medio = Math.round(o.H * 0.028);
  let y = o.logo ? 0.5 : 0.42;
  const draw = (t: string, tam: number, yy: number, alpha = "1") =>
    `drawtext=fontfile='${fonte}':text=${textoParaFiltro(t)}:fontsize=${tam}:fontcolor=white@${alpha}:x=(w-text_w)/2:y=${Math.round(o.H * yy)}`;
  if (o.nome) {
    linhas.push(draw(o.nome, grande, y));
    y += 0.07;
  }
  if (o.creci) {
    linhas.push(draw(`CRECI ${o.creci}`, medio, y, "0.85"));
    y += 0.055;
  }
  if (o.whatsapp) {
    linhas.push(draw(`WhatsApp ${formatarWhatsapp(o.whatsapp)}`, medio, y));
  }
  linhas.push(draw("Imagens ilustrativas · feito com Encena", Math.round(o.H * 0.018), 0.93, "0.6"));
  let filtro: string;
  if (o.logo) {
    args.push("-i", o.logo);
    const maxL = Math.round(o.W * 0.42);
    const maxA = Math.round(o.H * 0.16);
    filtro = `[1:v]scale=${maxL}:${maxA}:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:${Math.round(o.H * 0.28)}[base];[base]${["format=yuv420p", ...linhas].join(",")}[v]`;
  } else {
    filtro = `[0:v]${["format=yuv420p", ...linhas].join(",")}[v]`;
  }
  return [...args, "-filter_complex", filtro, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

function formatarWhatsapp(d: string): string {
  const n = d.replace(/\D/g, "");
  const local = n.length > 11 ? n.slice(-11) : n;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d;
}

/**
 * Montagem: emenda os clipes (transição suave = xfade, corte = concat), mixa música e
 * narração, carimba título/preço/local no topo enquanto as cenas passam. Sai o mp4
 * final com faststart pra tocar antes de baixar inteiro.
 */
export function argsMontagem(o: {
  clipes: string[];
  duracoes: number[];
  saida: string;
  W: number;
  H: number;
  transicao: "suave" | "corte";
  musica?: string;
  narracao?: string;
  titulo?: string;
  subtitulo?: string;
  /** Segundos de vídeo em que o carimbo de título fica visível (antes da tela final). */
  fimDoCarimbo?: number;
}): string[] {
  const n = o.clipes.length;
  const trans = o.transicao === "suave" ? LIMITES.transicaoSegundos : 0;
  const total = o.duracoes.reduce((s, d) => s + d, 0) - trans * (n - 1);
  const args: string[] = [];
  for (const c of o.clipes) args.push("-i", c);
  let idx = n;
  let idxMusica = -1;
  let idxNarracao = -1;
  if (o.musica) {
    args.push("-stream_loop", "-1", "-i", o.musica);
    idxMusica = idx++;
  }
  if (o.narracao) {
    args.push("-i", o.narracao);
    idxNarracao = idx++;
  }

  const partes: string[] = [];
  let ultimo: string;
  if (n === 1) {
    ultimo = "0:v";
  } else if (o.transicao === "suave") {
    let ant = "0:v";
    let acumulado = 0;
    for (let i = 1; i < n; i++) {
      acumulado += o.duracoes[i - 1] - trans;
      const saida = i === n - 1 ? "vx" : `x${i}`;
      partes.push(`[${ant}][${i}:v]xfade=transition=fade:duration=${trans}:offset=${acumulado.toFixed(2)}[${saida}]`);
      ant = saida;
    }
    ultimo = "vx";
  } else {
    partes.push(`${o.clipes.map((_, i) => `[${i}:v]`).join("")}concat=n=${n}:v=1:a=0[vx]`);
    ultimo = "vx";
  }

  const carimbos: string[] = [];
  if (o.titulo) {
    const enable = o.fimDoCarimbo != null ? `lt(t,${o.fimDoCarimbo.toFixed(2)})` : undefined;
    carimbos.push(pill({ texto: o.titulo, W: o.W, H: o.H, tamanho: 0.032, posicao: "topo", enable }));
    if (o.subtitulo) {
      const tamanho = Math.max(16, Math.round(o.H * 0.024));
      carimbos.push(
        `drawtext=fontfile=${caminhoParaFiltro(caminhoFonte())}:text=${textoParaFiltro(o.subtitulo)}:fontsize=${tamanho}:fontcolor=white:x=(w-text_w)/2:y=${Math.round(o.H * 0.06) + Math.round(o.H * 0.032 * 1.9) + Math.round(o.H * 0.012)}:box=1:boxcolor=0xf06b4f@0.9:boxborderw=${Math.round(tamanho * 0.45)}${enable ? `:enable='${enable}'` : ""}`
      );
    }
  }
  partes.push(`[${ultimo}]${["format=yuv420p", ...carimbos].join(",")}[vout]`);

  const fadeOut = Math.max(0, total - 2).toFixed(2);
  if (idxMusica >= 0 && idxNarracao >= 0) {
    partes.push(`[${idxMusica}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2,volume=0.22[m]`);
    partes.push(`[${idxNarracao}:a]adelay=700|700,volume=1.0[nar]`);
    partes.push(`[m][nar]amix=inputs=2:duration=first:dropout_transition=3:normalize=0[aout]`);
  } else if (idxMusica >= 0) {
    partes.push(`[${idxMusica}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2,volume=0.8[aout]`);
  } else if (idxNarracao >= 0) {
    partes.push(`[${idxNarracao}:a]adelay=700|700,apad,atrim=0:${total.toFixed(2)}[aout]`);
  }

  const temAudio = idxMusica >= 0 || idxNarracao >= 0;
  return [
    ...args,
    "-filter_complex", partes.join(";"),
    "-map", "[vout]", ...(temAudio ? ["-map", "[aout]"] : []),
    "-t", total.toFixed(2),
    ...CODEC_VIDEO,
    ...(temAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-movflags", "+faststart",
    o.saida,
  ];
}

/** Miniatura do vídeo: um quadro do primeiro segundo, 720px de largura. */
export function argsMiniatura(video: string, saida: string): string[] {
  return ["-ss", "1", "-i", video, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", saida];
}

/** Onde os clipes intermediários de um vídeo ficam no bucket. */
export function caminhoTemporario(userId: string, videoId: string, nome: string) {
  return `tmp/videos/${userId}/${videoId}/${nome}`;
}

export function caminhoVideoFinal(userId: string, videoId: string) {
  return `${userId}/videos/${videoId}.mp4`;
}

export function caminhoMiniatura(userId: string, videoId: string) {
  return `${userId}/videos/${videoId}.jpg`;
}

export function nomeLocal(dir: string, nome: string) {
  return path.join(dir, nome);
}
