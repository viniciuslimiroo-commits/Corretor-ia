import fs from "node:fs";
import path from "node:path";
import { caminhoFonte } from "./ffmpeg";
import { ESTILO_TEXTO_POR_ID, LIMITES, MOVIMENTOS_360, fovDaPanoramica, type EfeitoId, type Movimento360Id, type Projecao360, type TextoCena, type Legendas } from "./video";

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

/**
 * Texto seguro pro drawtext, já entre aspas simples. Apóstrofo vira ’ pra não brigar com
 * a citação.
 *
 * `multilinha` mantém as quebras de linha. E elas vão como QUEBRA DE VERDADE dentro do
 * argumento, não como `\n`: medido (scripts/testar-video-edicao.mjs e um render de
 * controle) -- com `\n` o parser come a barra e sobra um "n" grudado no meio da palavra
 * ("no" + "nsetor" = "nonsetor"), e com `\\n` acontece o mesmo. Só o caractere de nova
 * linha faz o drawtext pular a linha.
 *
 * Serve pra legenda: frase de transcrição não cabe na largura do vídeo e, sem quebrar,
 * sai cortada nas duas pontas -- foi o que apareceu no primeiro render legendado.
 */
export function textoParaFiltro(t: string, multilinha = false): string {
  const limpo = t
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/[\r\n]+/g, multilinha ? "\n" : " ");
  return `'${limpo}'`;
}

/**
 * Quebra a frase em linhas que cabem na largura, sem partir palavra.
 *
 * O `drawtext` não quebra sozinho: escreve tudo numa linha e o que passa da borda some.
 * A largura de um caractere fica em torno de 0,52 do tamanho da fonte nesta família --
 * o mesmo número que o selo usa pra calcular a caixa dele.
 */
export function quebrarLinhas(texto: string, larguraUtil: number, tamanhoFonte: number, maxLinhas = 4): string {
  const porLinha = Math.max(12, Math.floor(larguraUtil / (tamanhoFonte * 0.52)));
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length > porLinha && atual) {
      linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas) break;
    } else {
      atual = tentativa;
    }
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);
  return linhas.join("\n");
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

/**
 * Os textos de uma cena, virados em filtros de desenho.
 *
 * Um motor só: a legenda de sempre e os textos que a pessoa acrescenta passam por aqui.
 * Textos na mesma posição EMPILHAM em vez de se sobrepor -- dois preços um por cima do
 * outro é o defeito que aparece no arquivo final e em nenhum teste de string.
 *
 * As animações não mexem em transparência de propósito: no `drawtext`, `alpha` afeta o
 * texto e não a caixa atrás dele, então um "aparecer suave" deixaria a caixa piscando
 * inteira antes da letra. Mexer em POSIÇÃO e em QUANDO aparece é o que funciona igual em
 * todos os estilos.
 */
export function filtrosDeTexto(textos: TextoCena[], W: number, H: number, topoOcupado = false): string[] {
  const usadas: Record<string, number> = {};
  return textos.map((t) => {
    const posicao = t.posicao ?? "base";
    const nivel = usadas[posicao] ?? 0;
    usadas[posicao] = nivel + 1;
    const est = ESTILO_TEXTO_POR_ID[t.estilo ?? "faixa"] ?? ESTILO_TEXTO_POR_ID.faixa;
    const tamanho = Math.max(18, Math.round(H * est.tamanho));
    const passo = Math.round(tamanho * 2.1);
    // O título e o preço do vídeo são carimbados no topo DEPOIS, na montagem. Quando eles
    // existem, o texto de topo começa abaixo da faixa deles -- senão um cobre o outro, e
    // isso só aparece no arquivo final (apareceu: a etiqueta saiu sob o título).
    const alto = Math.round(H * (topoOcupado ? 0.19 : 0.08)) + nivel * passo;
    const baixo = Math.round(H * 0.09) + nivel * passo;
    const parado = posicao === "topo" ? `${alto}` : posicao === "centro" ? `(h-text_h)/2+${nivel * passo}` : `h-text_h-${baixo}`;

    // "subir": entra deslocado e chega no lugar em 0,5s. A vírgula do `min` é escapada
    // porque, dentro de um filtro, vírgula separa filtros.
    const desloc = Math.round(H * 0.035);
    const y = t.animacao === "subir" ? `${parado}+(1-min(t/0.5\\,1))*${desloc}` : parado;

    const partes = [
      `fontfile='${caminhoParaFiltro(caminhoFonte())}'`,
      `text=${textoParaFiltro(t.texto)}`,
      `fontsize=${tamanho}`,
      `fontcolor=white`,
      `x=(w-text_w)/2`,
      `y=${y}`,
      `box=1`,
      `boxcolor=${est.cor}@0.85`,
      `boxborderw=${Math.round(tamanho * 0.45)}`,
    ];
    // "surgir": a cena começa sem ele e ele entra depois de meio segundo.
    if (t.animacao === "surgir") partes.push(`enable='gte(t\\,0.5)'`);
    return `drawtext=${partes.join(":")}`;
  });
}

/**
 * As legendas queimadas no vídeo montado, uma por trecho.
 *
 * `drawtext` com `enable=between(...)` em vez do filtro `subtitles`: o `subtitles` quer
 * um ARQUIVO, e caminho de arquivo dentro de filtro já deu problema nesta base (o
 * fontfile do Windows caindo em fallback silencioso). Aqui não há arquivo intermediário,
 * o estilo é o nosso, e cada trecho é uma linha independente -- se um vier torto, some
 * só ele.
 *
 * O contorno ("sem fundo") usa borda preta grossa: é o que deixa letra branca legível
 * sobre parede clara sem tapar a foto com uma caixa.
 */
export function filtrosDeLegenda(legendas: Legendas | null | undefined, W: number, H: number): string[] {
  if (!legendas?.trechos?.length) return [];
  const tamanho = Math.max(20, Math.round(H * 0.034));
  const y = legendas.posicao === "centro" ? `(h-text_h)/2` : `h-text_h-${Math.round(H * 0.14)}`;
  const comFundo = (legendas.estilo ?? "faixa") === "faixa";
  // 86% da largura: sobra margem dos dois lados, e é dentro dela que a frase quebra.
  const util = W * 0.86;
  return legendas.trechos.map((t) => {
    const partes = [
      `fontfile='${caminhoParaFiltro(caminhoFonte())}'`,
      `text=${textoParaFiltro(quebrarLinhas(t.texto, util, tamanho, 4), true)}`,
      `line_spacing=${Math.round(tamanho * 0.25)}`,
      `fontsize=${tamanho}`,
      `fontcolor=white`,
      `x=(w-text_w)/2`,
      `y=${y}`,
      // A vírgula do `between` é escapada: dentro de um filtro, vírgula separa filtros.
      `enable='between(t\\,${t.inicio.toFixed(2)}\\,${t.fim.toFixed(2)})'`,
    ];
    if (comFundo) partes.push(`box=1`, `boxcolor=0x000000@0.6`, `boxborderw=${Math.round(tamanho * 0.4)}`);
    else partes.push(`borderw=${Math.max(2, Math.round(tamanho * 0.09))}`, `bordercolor=0x000000@0.9`);
    return `drawtext=${partes.join(":")}`;
  });
}

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

/**
 * O POUSO: os últimos quadros de todo take ficam parados.
 *
 * Take que termina com a câmera ainda em movimento corta em falso -- e, na montagem, ou
 * a transição come o movimento ou o corte fica seco. Com o movimento terminando um pouco
 * antes do fim, sobram quadros limpos e estabilizados: o mesmo que um operador faz ao
 * encostar a câmera antes de cortar.
 *
 * A duração da cena NÃO muda: o movimento é que se completa mais cedo. Assim nada precisa
 * ser recalculado na montagem, na narração ou no custo.
 */
const SEGUNDOS_DE_POUSO = 0.45;

/** Quantos quadros de movimento a cena tem, já descontado o pouso. */
function quadrosDeMovimento(duracao: number): number {
  const total = Math.round(duracao * FPS);
  return Math.max(2, total - Math.round(Math.min(SEGUNDOS_DE_POUSO, duracao * 0.25) * FPS));
}

function zoompan(efeito: EfeitoId, frames: number, W: number, H: number): string {
  const d = frames;
  const centroX = `iw/2-(iw/zoom/2)`;
  const centroY = `ih/2-(ih/zoom/2)`;

  // `p` é o andamento do movimento: vai de 0 a 1 ANTES do fim da cena (o resto é o pouso)
  // e segue uma curva em S -- começa devagar, acelera, desacelera. Era linear, e linear
  // significa velocidade máxima no último quadro: o movimento parava de supetão.
  const m = quadrosDeMovimento(d / FPS);
  const t = `min(on/${m},1)`;
  const p = `(${t}*${t}*(3-2*${t}))`;

  const receitas: Record<EfeitoId, { z: string; x: string; y: string }> = {
    aproximar: { z: `1+0.10*${p}`, x: centroX, y: centroY },
    afastar: { z: `1.10-0.10*${p}`, x: centroX, y: centroY },
    esquerda: { z: "1.08", x: `(iw-iw/zoom)*(1-${p})`, y: centroY },
    direita: { z: "1.08", x: `(iw-iw/zoom)*${p}`, y: centroY },
    parado: { z: "1", x: "0", y: "0" },
  };
  const r = receitas[efeito];
  return `zoompan=z='${r.z}':d=${d}:x='${r.x}':y='${r.y}':s=${W}x${H}:fps=${FPS}`;
}

/** Cena de foto parada com movimento de câmera (Ken Burns). Um quadro de entrada. */
export function argsCenaFoto(o: { foto: string; saida: string; W: number; H: number; duracao: number; efeito: EfeitoId; textos?: TextoCena[]; topoOcupado?: boolean }): string[] {
  const frames = Math.round(o.duracao * FPS);
  const filtros = [enquadrar(o.W, o.H, ESCALA_ZOOM), zoompan(o.efeito, frames, o.W, o.H), "format=yuv420p"];
  filtros.push(...filtrosDeTexto(o.textos ?? [], o.W, o.H, o.topoOcupado));
  return ["-i", o.foto, "-filter_complex", `[0:v]${filtros.join(",")}[v]`, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

/**
 * Antes e depois: mostra a original, uma cortina passa da esquerda pra direita e fica
 * o resultado. As duas ficam paradas de propósito -- o movimento é a cortina.
 */
export function argsCenaAntesDepois(o: { antes: string; depois: string; saida: string; W: number; H: number; duracao: number; textos?: TextoCena[]; topoOcupado?: boolean }): string[] {
  const trans = 1.4;
  const cada = (o.duracao + trans) / 2;
  const offset = cada - trans;
  const base = `${enquadrar(o.W, o.H)},format=yuv420p`;
  const rotA = pill({ texto: "Antes", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0x111111" });
  const rotB = pill({ texto: "Depois", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0xf06b4f" });
  // Os textos entram DEPOIS da limpeza entre as duas fotos, senão o "Antes"/"Depois"
  // passaria por cima deles na virada.
  const texto = filtrosDeTexto(o.textos ?? [], o.W, o.H, o.topoOcupado).join(",");
  const filtro = `[0:v]${base},${rotA}[a];[1:v]${base},${rotB}[b];[a][b]xfade=transition=wipeleft:duration=${trans}:offset=${offset.toFixed(2)}${texto ? "[ab];[ab]" + texto : ""}[v]`;
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
export function argsCenaClipe(o: { clipe: string; saida: string; W: number; H: number; duracao: number; textos?: TextoCena[]; melhorar?: boolean; inicio?: number; topoOcupado?: boolean }): string[] {
  const filtros = [`fps=${FPS}`, enquadrar(o.W, o.H), "format=yuv420p"];
  if (o.melhorar) filtros.push("eq=contrast=1.06:brightness=0.02:saturation=1.12", "unsharp=5:5:0.6:5:5:0.0");
  filtros.push(`tpad=stop_mode=clone:stop_duration=${o.duracao}`);
  filtros.push(...filtrosDeTexto(o.textos ?? [], o.W, o.H, o.topoOcupado));
  // O clipe entra CURTO de propósito e o `tpad` clona o último quadro até fechar a
  // duração: os últimos instantes ficam parados. Vale pro vídeo da pessoa e, sobretudo,
  // pro clipe da IA -- que termina onde o modelo parou, muitas vezes no meio do gesto.
  const corte = Math.max(0.5, o.duracao - Math.min(SEGUNDOS_DE_POUSO, o.duracao * 0.25));
  // `-ss` ANTES do `-i`: o ffmpeg pula direto pro ponto em vez de decodificar tudo e
  // descartar. É o "aparar o começo" -- o pedaço em que a pessoa ainda estava acertando
  // o celular não entra no vídeo.
  const inicio = Math.max(0, o.inicio ?? 0);
  return ["-ss", inicio.toFixed(2), "-t", corte.toFixed(2), "-i", o.clipe, "-an", "-filter_complex", `[0:v]${filtros.join(",")}[v]`, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

/** Suavização em S: começa e termina devagar, como uma câmera de verdade. */
function suave(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Cena de TOUR 360: move uma câmera dentro da foto (ou do vídeo) equirretangular.
 *
 * O `v360` converte a esfera em perspectiva plana a cada quadro; `yaw`, `pitch` e
 * `h_fov` aceitam comando em tempo de execução, então o movimento vem de um arquivo de
 * comandos gerado aqui, um por quadro. É câmera de verdade: a perspectiva muda, as
 * linhas se curvam certo, não é recorte deslizando.
 *
 * Escreve o arquivo de comandos em `dirTrabalho` e devolve os argumentos.
 */
export function argsCena360(o: {
  entrada: string;
  ehVideo: boolean;
  saida: string;
  dirTrabalho: string;
  W: number;
  H: number;
  duracao: number;
  movimento: Movimento360Id;
  textos?: TextoCena[];
  topoOcupado?: boolean;
  /** "equirect" (câmera 360) ou "panoramica" (modo panorâmico do celular). */
  projecao?: Projecao360;
  /** Tamanho da imagem de entrada: só usado pra calcular o campo de visão da panorâmica. */
  entradaLargura?: number;
  entradaAltura?: number;
}): string[] {
  const projecao = o.projecao ?? "equirect";
  const presetBase = MOVIMENTOS_360.find((m) => m.id === o.movimento) ?? MOVIMENTOS_360[0];

  // Panorâmica de celular não é uma esfera: é uma faixa cilíndrica de ~200° na
  // horizontal e ~55° na vertical. O campo de visão da saída tem que caber dentro
  // disso, senão sobra faixa cinza (visto com a panorâmica real do Vinicius). E o giro
  // só pode varrer o que existe: nada de 360°.
  const pan = projecao === "panoramica" ? fovDaPanoramica(o.entradaLargura ?? 3000, o.entradaAltura ?? 900, o.W, o.H) : null;
  const preset = pan
    ? (() => {
        const limite = Math.max(6, ((pan.ihFov - pan.hFov) / 2) * 0.9);
        const alcance = Math.min(1, Math.abs(presetBase.yaw[1] - presetBase.yaw[0]) / 140);
        const meio = limite * alcance;
        return { ...presetBase, yaw: [-meio, meio] as [number, number], pitch: [0, 0] as [number, number], fov: [pan.hFov, pan.hFov] as [number, number] };
      })()
    : presetBase;

  const quadros = Math.max(2, Math.round(o.duracao * FPS));

  // Custo medido (12/09/2026, 6s em 9:16): cúbico em 1080 = 65s; linear em 720 e
  // ampliado = 27s; mudar o fov a cada quadro dobra o tempo, a cada 6 quadros quase
  // não pesa e o olho não percebe. Yaw continua por quadro, que é o que dá suavidade.
  const PASSO_LENTO = 6;
  const linhas: string[] = [];
  const emMovimento = quadrosDeMovimento(o.duracao);
  for (let f = 0; f < quadros; f++) {
    // Depois de `emMovimento` a câmera fica onde chegou: é o pouso. `suave` já dava a
    // curva em S; o que faltava era o instante parado no fim.
    const t = suave(Math.min(f / Math.max(1, emMovimento - 1), 1));
    const yaw = preset.yaw[0] + (preset.yaw[1] - preset.yaw[0]) * t;
    const pitch = preset.pitch[0] + (preset.pitch[1] - preset.pitch[0]) * t;
    const fov = preset.fov[0] + (preset.fov[1] - preset.fov[0]) * t;
    const quando = (f / FPS).toFixed(4);
    // reset_rot ANTES de cada quadro: sem ele os comandos de rotação do v360 se
    // acumulam (cada yaw soma ao anterior) e a câmera gira feito pião, chegando a
    // ficar de cabeça pra baixo -- visto no teste de 12/09/2026. Com o reset, yaw e
    // pitch passam a ser absolutos.
    linhas.push(`${quando} v360 reset_rot 1;`);
    linhas.push(`${quando} v360 yaw ${yaw.toFixed(3)};`);
    if (preset.pitch[0] !== preset.pitch[1] || preset.pitch[0] !== 0) linhas.push(`${quando} v360 pitch ${pitch.toFixed(3)};`);
    if ((f % PASSO_LENTO === 0 || f === quadros - 1) && preset.fov[0] !== preset.fov[1]) {
      linhas.push(`${quando} v360 h_fov ${fov.toFixed(3)};`);
    }
  }
  const arquivoCmd = path.join(o.dirTrabalho, `cmd360-${Math.random().toString(36).slice(2, 8)}.txt`);
  fs.writeFileSync(arquivoCmd, linhas.join("\n"));

  // Render interno a 2/3 do tamanho e ampliação com lanczos: metade do tempo, nitidez
  // que passa despercebida em celular. v_fov proporcional ao formato, senão o vertical
  // (9:16) fica achatado.
  const wi = Math.round((o.W * 2) / 3 / 2) * 2;
  const hi = Math.round((o.H * 2) / 3 / 2) * 2;
  const vFov = pan ? pan.vFov : Math.min(120, Math.max(40, (preset.fov[0] * o.H) / o.W));
  const entradaFiltro = pan
    ? `input=cylindrical:ih_fov=${pan.ihFov}:iv_fov=${pan.ivFov.toFixed(2)}`
    : "input=e";
  const filtros = [
    `sendcmd=f='${caminhoParaFiltro(arquivoCmd)}'`,
    `v360=${entradaFiltro}:output=flat:h_fov=${preset.fov[0].toFixed(2)}:v_fov=${vFov.toFixed(2)}:w=${wi}:h=${hi}:interp=line`,
    `scale=${o.W}:${o.H}:flags=lanczos`,
    "format=yuv420p",
  ];
  filtros.push(...filtrosDeTexto(o.textos ?? [], o.W, o.H, o.topoOcupado));

  const entrada = o.ehVideo
    ? ["-t", o.duracao.toFixed(2), "-i", o.entrada]
    : ["-loop", "1", "-framerate", String(FPS), "-t", o.duracao.toFixed(2), "-i", o.entrada];

  return [...entrada, "-an", "-filter_complex", `[0:v]${filtros.join(",")}[v]`, "-map", "[v]", "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
}

/** Tela final: cor da marca, logo (se houver), frase de chamada, nome, CRECI e WhatsApp. */
export function argsTelaFinal(o: { saida: string; W: number; H: number; duracao: number; cor: string; logo?: string; chamada?: string; nome: string; creci?: string; whatsapp?: string }): string[] {
  const corHex = /^#[0-9a-fA-F]{6}$/.test(o.cor) ? "0x" + o.cor.slice(1) : "0x0f2d5b";
  const fonte = caminhoParaFiltro(caminhoFonte());
  const args = ["-f", "lavfi", "-i", `color=c=${corHex}:s=${o.W}x${o.H}:d=${o.duracao}:r=${FPS}`];
  const linhas: string[] = [];
  const grande = Math.round(o.H * 0.042);
  const medio = Math.round(o.H * 0.028);
  let y = o.logo ? 0.5 : 0.42;
  const draw = (t: string, tam: number, yy: number, alpha = "1") =>
    `drawtext=fontfile='${fonte}':text=${textoParaFiltro(t)}:fontsize=${tam}:fontcolor=white@${alpha}:x=(w-text_w)/2:y=${Math.round(o.H * yy)}`;
  // A chamada fica logo acima do nome: é o pedido; o nome e o WhatsApp são o como.
  if (o.chamada) linhas.push(draw(o.chamada, Math.round(o.H * 0.034), y - 0.08));
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
  /** Uma por emenda (clipes − 1): qual xfade e quanto dura. */
  emendas: { xfade: string; segundos: number }[];
  musica?: string;
  narracao?: string;
  titulo?: string;
  subtitulo?: string;
  /** Segundos de vídeo em que o carimbo de título fica visível (antes da tela final). */
  fimDoCarimbo?: number;
  /** 0 a 1, antes da redução automática. Padrão 0,8. */
  musicaVolume?: number;
  /** 0,2 a 2. Padrão 1. */
  vozVolume?: number;
  /** Segundos até a voz começar. Padrão 0,7. */
  vozInicio?: number;
  legendas?: Legendas | null;
}): string[] {
  const n = o.clipes.length;
  // Uma emenda por par, cada uma com a sua duração: a cena escolhe a transição.
  const emenda = (i: number) => o.emendas[i] ?? { xfade: "dissolve", segundos: LIMITES.transicaoSegundos };
  const somaEmendas = Array.from({ length: Math.max(0, n - 1) }, (_, i) => emenda(i).segundos).reduce((s, d) => s + d, 0);
  const total = o.duracoes.reduce((s, d) => s + d, 0) - somaEmendas;
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
  } else {
    // Um caminho só pra todas as transições, inclusive o corte -- que é um xfade de
    // 0,08s. Ter `concat` pro corte e `xfade` pro resto significaria dois caminhos, e
    // nenhum dos dois serviria pra um vídeo que mistura as duas coisas.
    let ant = "0:v";
    let acumulado = 0;
    for (let i = 1; i < n; i++) {
      const e = emenda(i - 1);
      acumulado += o.duracoes[i - 1] - e.segundos;
      const saida = i === n - 1 ? "vx" : `x${i}`;
      partes.push(`[${ant}][${i}:v]xfade=transition=${e.xfade}:duration=${e.segundos.toFixed(2)}:offset=${acumulado.toFixed(2)}[${saida}]`);
      ant = saida;
    }
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
  // As legendas vão por ÚLTIMO: elas acompanham a voz, que corre sobre o vídeo inteiro,
  // e por isso o tempo delas é o da linha do tempo final -- não o de uma cena.
  const legendas = filtrosDeLegenda(o.legendas, o.W, o.H);
  partes.push(`[${ultimo}]${["format=yuv420p", ...carimbos, ...legendas].join(",")}[vout]`);

  // ---- áudio ----
  //
  // A música abaixa SOZINHA quando há voz e volta quando a voz para: é o `sidechaincompress`,
  // o mesmo recurso que o rádio chama de ducking. Antes a música ficava num volume fixo
  // baixo (0,22) o vídeo inteiro -- o que resolve a voz sumindo, mas entrega um vídeo com
  // trilha quase inaudível nos trechos sem narração, que é metade do vídeo.
  //
  // A voz é dividida em duas (`asplit`): uma cópia vai pro mix e a outra serve só de
  // GATILHO do compressor. Sem isso não dá pra ouvir a voz e usá-la como controle ao mesmo
  // tempo -- o sidechaincompress consome a entrada que recebe.
  const fadeOut = Math.max(0, total - 2).toFixed(2);
  const volMusica = Math.min(1, Math.max(0, o.musicaVolume ?? 0.8));
  const volVoz = Math.min(2, Math.max(0.2, o.vozVolume ?? 1));
  const msInicio = Math.round(Math.min(10, Math.max(0, o.vozInicio ?? 0.7)) * 1000);
  const musicaBase = `[${idxMusica}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2,volume=${volMusica.toFixed(2)}`;

  if (idxMusica >= 0 && idxNarracao >= 0) {
    partes.push(`${musicaBase}[m]`);
    // `apad` antes do atrim: voz curta num vídeo longo terminava o amix cedo.
    partes.push(`[${idxNarracao}:a]adelay=${msInicio}|${msInicio},volume=${volVoz.toFixed(2)},apad,atrim=0:${total.toFixed(2)}[nar]`);
    partes.push(`[nar]asplit=2[nar1][gatilho]`);
    // threshold em amplitude (0-1), não em dB. ratio 8 e release 350ms: a música volta
    // entre as frases sem "bombear" a cada sílaba.
    partes.push(`[m][gatilho]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=350:makeup=1[mduck]`);
    partes.push(`[mduck][nar1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
  } else if (idxMusica >= 0) {
    partes.push(`${musicaBase}[aout]`);
  } else if (idxNarracao >= 0) {
    partes.push(`[${idxNarracao}:a]adelay=${msInicio}|${msInicio},volume=${volVoz.toFixed(2)},apad,atrim=0:${total.toFixed(2)}[aout]`);
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
/** Um quadro do vídeo, no segundo pedido (a capa escolhida), reduzido pra miniatura. */
export function argsMiniatura(video: string, saida: string, segundo = 1): string[] {
  const s = Number.isFinite(segundo) && segundo >= 0 ? segundo : 1;
  return ["-ss", s.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", saida];
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
