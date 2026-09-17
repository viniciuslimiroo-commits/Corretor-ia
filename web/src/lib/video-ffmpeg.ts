import fs from "node:fs";
import path from "node:path";
import { caminhoFonte } from "./ffmpeg";
import { anguloDaVinheta } from "./filtros";
import { ESTILO_TEXTO_POR_ID, LIMITES, MOVIMENTOS_360, fovDaPanoramica, type EfeitoId, type Movimento360Id, type Projecao360, type TextoCena, type Legendas, type Apresentador, TAMANHOS_APRESENTADOR } from "./video";

// Monta as linhas de comando do ffmpeg pra cada pedaço do vídeo. Funções puras: recebem
// caminhos locais e devolvem a lista de argumentos; quem roda é rodarFfmpeg (ffmpeg.ts),
// quem baixa/sobe arquivos é a rota. Assim dá pra testar cada receita num script sem
// banco nem storage (scripts/testar-video*.mjs foi de onde as receitas saíram).
//
// Convenções: toda cena sai em WxH, `fps` quadros/s, yuv420p, sem áudio, H.264
// "veryfast" CRF 23 -- o mesmo perfil pra montagem poder emendar sem surpresa.

export const FPS = 24;

/** A barra que escapa vírgula dentro de um filtro. Numa string comum ela vai sozinha. */
const ESC = "\\";
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

/**
 * Giro e espelho -- e eles vêm ANTES do enquadramento, sempre.
 *
 * O `crop` é calculado no tamanho da imagem. Uma foto girada um quarto de volta tem a
 * proporção trocada, então girar DEPOIS do corte recorta o pedaço errado: o vídeo sai
 * com a sala de lado e cortada pela metade.
 *
 * `transpose=1` gira no sentido do relógio, `=2` no contrário; meia volta são dois
 * quartos, que é mais barato que `rotate` (que interpola pixel).
 */
export function geometria(giro?: number, espelho?: boolean): string[] {
  const f: string[] = [];
  const g = ((((Math.round((giro ?? 0) / 90) * 90) % 360) + 360) % 360);
  if (g === 90) f.push("transpose=1");
  else if (g === 180) f.push("transpose=1", "transpose=1");
  else if (g === 270) f.push("transpose=2");
  if (espelho) f.push("hflip");
  return f;
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
/**
 * Onde cada texto fica na cena, em pixels. Serve pro drawtext e pra sobreposição de arte.
 *
 * Textos na mesma posição EMPILHAM: dois preços um por cima do outro é o defeito que só
 * aparece no arquivo e em nenhum teste de string.
 */
export function lugaresDoTexto(textos: TextoCena[], H: number, topoOcupado = false, alturas: number[] = []): { y: number; posicao: string }[] {
  const usadas: Record<string, number> = {};
  return textos.map((t, i) => {
    const posicao = t.posicao ?? "base";
    const nivel = usadas[posicao] ?? 0;
    usadas[posicao] = nivel + 1;
    const alt = alturas[i] ?? Math.round(H * 0.08);
    const passo = Math.round(alt * 1.25);
    const alto = Math.round(H * (topoOcupado ? 0.19 : 0.08)) + nivel * passo;
    const baixo = H - Math.round(H * 0.09) - alt - nivel * passo;
    const meio = Math.round((H - alt) / 2) + nivel * passo;
    return { y: posicao === "topo" ? alto : posicao === "centro" ? meio : baixo, posicao };
  });
}

/**
 * Uma peça já rasterizada, pronta pra entrar por cima da cena.
 *
 * É uma IMAGEM, não uma letra desenhada pelo ffmpeg -- é o que permite contorno duplo,
 * brilho, relevo, ícone e moldura. Serve tanto pra arte de texto quanto pra elemento.
 */
export type ArteNaCena = {
  arquivo: string;
  y: number;
  largura: number;
  altura: number;
  animacao?: string;
  /** GIF animado: entra em laço e é redimensionado aqui pra largura×altura (o PNG já vem no tamanho). */
  animado?: boolean;
  /** Movimento em laço pedido (movimentos.ts). Vira `sequencia` em movimento-servidor.ts. */
  movimento?: string;
  /** `arquivo` é um padrão de quadros (`...-%03d.png`) de UM período, repetido em laço. */
  sequencia?: { quadros: number; fps: number };
  /** `arquivo` é um MP4 curto já no tamanho (clipe do Pexels), repetido em laço. */
  video?: boolean;
};

/** O mesmo, com o canto escolhido: é o que um elemento tem a mais que uma arte. */
export type PecaNaCena = ArteNaCena & { x: number };

/** Junta arte (centrada) e elemento (ancorado) numa lista só, na ordem do desenho. */
function pecasDaCena(W: number, duracao: number, artes?: ArteNaCena[], pecas?: PecaNaCena[]): (PecaNaCena & { duracao: number })[] {
  return [
    ...(artes ?? []).map((a) => ({ ...a, duracao, x: Math.round((W - a.largura) / 2) })),
    ...(pecas ?? []).map((p) => ({ ...p, duracao })),
  ];
}

/**
 * Os textos que o drawtext ainda desenha: os que NAO viraram arte.
 *
 * Sem este filtro o texto sairia duas vezes -- uma desenhada, uma sobreposta. Vale pra
 * toda cena, nao so pra foto: foi exatamente o que faltava em clipe, antes/depois e 360.
 */
export function textosSemArte(textos?: TextoCena[]): TextoCena[] {
  return (textos ?? []).filter((t) => !t.arte);
}

export function sobreporArtes(
  artes: (ArteNaCena & { duracao: number })[],
  W: number,
  idxPrimeiro: number,
  entrada = "v"
): { entradas: string[]; partes: string[]; saida: string } {
  // Arte de texto é sempre centrada na horizontal; a peça gráfica escolhe o canto. As
  // duas viram a mesma coisa aqui: uma imagem com x e y.
  return sobreporPecas(
    artes.map((a) => ({ ...a, x: Math.round((W - a.largura) / 2) })),
    W,
    idxPrimeiro,
    entrada
  );
}

/**
 * Sobrepõe PNGs já prontos numa cena, cada um no seu lugar.
 *
 * Um `-i` por peça e um `overlay` por peça, saindo juntos daqui: o índice da entrada e o
 * rótulo do filtro têm que combinar, e separar as duas coisas é como se acrescenta a
 * entrada sem acrescentar o filtro (ou o contrário) e o vídeo sai sem a peça, sem erro.
 */
export function sobreporPecas(
  pecas: (ArteNaCena & { duracao: number; x: number })[],
  W: number,
  idxPrimeiro: number,
  entrada = "v"
): { entradas: string[]; partes: string[]; saida: string } {
  if (!pecas.length) return { entradas: [], partes: [], saida: entrada };
  const entradas: string[] = [];
  const partes: string[] = [];
  let atual = entrada;
  pecas.forEach((a, i) => {
    // GIF: `-ignore_loop 0` faz o laço do próprio arquivo valer (o padrão do ffmpeg é tocar
    // UMA vez e congelar no último quadro -- a risada parava no primeiro segundo).
    if (a.animado) entradas.push("-ignore_loop", "0", "-i", a.arquivo);
    // Sequência de quadros de um período: `-loop 1` repete a sequência inteira. Sem ele o
    // movimento acontece UMA vez e a peça congela no último quadro.
    else if (a.sequencia) entradas.push("-loop", "1", "-framerate", String(a.sequencia.fps), "-i", a.arquivo);
    // Clipe de vídeo: `-stream_loop -1` repete o arquivo inteiro (o laço de 3s já cortado).
    else if (a.video) entradas.push("-stream_loop", "-1", "-i", a.arquivo);
    else entradas.push("-i", a.arquivo);
    const x = a.x;
    const chegada = "(1-min(t/0.5" + ESC + ",1))";
    const desloc = Math.round(W * 0.25);
    let ex = String(x);
    let ey = String(a.y);
    let enable = "";
    if (a.animacao === "subir") ey = a.y + "+" + chegada + "*" + Math.round(a.altura * 0.8);
    else if (a.animacao === "descer") ey = a.y + "-" + chegada + "*" + Math.round(a.altura * 0.8);
    else if (a.animacao === "entrar_esquerda") ex = x + "-" + chegada + "*" + desloc;
    else if (a.animacao === "entrar_direita") ex = x + "+" + chegada + "*" + desloc;
    else if (a.animacao === "surgir") enable = ":enable='gte(t" + ESC + ",0.5)'";
    else if (a.animacao === "no_fim") enable = ":enable='gte(t" + ESC + "," + (a.duracao * 0.62).toFixed(2) + ")'";
    else if (a.animacao === "piscar") enable = ":enable='lt(mod(t" + ESC + ",0.7)" + ESC + ",0.35)'";
    const proximo = "va" + i;
    let peca = "[" + (idxPrimeiro + i) + ":v]";
    let fim = "";
    if (a.animado) {
      partes.push(peca + "scale=" + a.largura + ":" + a.altura + ":flags=lanczos,format=rgba[ga" + i + "]");
      peca = "[ga" + i + "]";
      // Entrada em laço não acaba nunca. Hoje toda cena já corta com `-t` na saída (medido:
      // sem `shortest` a cena de foto termina igual); o `shortest` é a segunda trava, pra
      // cena nova que esquecer o `-t` não ficar gerando quadro até estourar a função.
      fim = ":shortest=1";
    } else if (a.sequencia || a.video) {
      fim = ":shortest=1";
    }
    partes.push("[" + atual + "]" + peca + "overlay=" + ex + ":" + ey + enable + fim + "[" + proximo + "]");
    atual = proximo;
  });
  return { entradas, partes, saida: atual };
}

export function filtrosDeTexto(textos: TextoCena[], W: number, H: number, topoOcupado = false, duracao = 4): string[] {
  const usadas: Record<string, number> = {};
  return textos.map((t) => {
    const posicao = t.posicao ?? "base";
    const nivel = usadas[posicao] ?? 0;
    usadas[posicao] = nivel + 1;
    const est = ESTILO_TEXTO_POR_ID[t.estilo ?? "faixa"] ?? ESTILO_TEXTO_POR_ID.faixa;
    // O VISUAL do texto vence o estilo base. É o que faz cada modelo da galeria ter cara
    // própria -- e o que faz a prévia no cartão ser verdade, porque os dois lados leem os
    // mesmos campos.
    const v = t.visual ?? {};
    const tamanho = Math.max(18, Math.round(H * (v.tamanho ?? est.tamanho)));
    const passo = Math.round(tamanho * 2.1);
    // O título e o preço do vídeo são carimbados no topo DEPOIS, na montagem. Quando eles
    // existem, o texto de topo começa abaixo da faixa deles -- senão um cobre o outro, e
    // isso só aparece no arquivo final (apareceu: a etiqueta saiu sob o título).
    const alto = Math.round(H * (topoOcupado ? 0.19 : 0.08)) + nivel * passo;
    const baixo = Math.round(H * 0.09) + nivel * passo;
    const paradoY = posicao === "topo" ? `${alto}` : posicao === "centro" ? `(h-text_h)/2+${nivel * passo}` : `h-text_h-${baixo}`;
    const paradoX = `(w-text_w)/2`;

    // ---- a ENTRADA ----
    //
    // Tudo em POSIÇÃO e em QUANDO, nunca em transparência: no drawtext o alpha afeta a
    // letra e não a caixa atrás dela, então um "aparecer suave" deixa a caixa piscando
    // inteira antes do texto. A vírgula dentro de `min` e `gte` vai escapada porque,
    // dentro de um filtro, vírgula separa filtros.
    const deslocY = Math.round(H * 0.035);
    const deslocX = Math.round(W * 0.25);
    const anim = t.animacao ?? "nenhuma";
    const chegada = `(1-min(t/0.5\\,1))`;
    let x = paradoX;
    let y = paradoY;
    let enable: string | undefined;
    if (anim === "subir") y = `${paradoY}+${chegada}*${deslocY}`;
    else if (anim === "descer") y = `${paradoY}-${chegada}*${deslocY}`;
    else if (anim === "entrar_esquerda") x = `${paradoX}-${chegada}*${deslocX}`;
    else if (anim === "entrar_direita") x = `${paradoX}+${chegada}*${deslocX}`;
    else if (anim === "surgir") enable = `gte(t\\,0.5)`;
    // "no fim": entra no último terço da cena, que é onde o preço fecha o argumento.
    else if (anim === "no_fim") enable = `gte(t\\,${(duracao * 0.62).toFixed(2)})`;
    // "piscar": dois pares de acende-apaga de 0,35s. Pra "Vendido", "Reservado".
    else if (anim === "piscar") enable = `lt(mod(t\\,0.7)\\,0.35)`;

    const partes = [
      `fontfile='${caminhoParaFiltro(caminhoFonte())}'`,
      `text=${textoParaFiltro(t.texto)}`,
      `fontsize=${tamanho}`,
      `fontcolor=0x${v.cor ?? "ffffff"}`,
      `x=${x}`,
      `y=${y}`,
    ];

    // ---- o ACABAMENTO ----
    //
    // É o que faz letra branca ser lida sobre parede branca. Sem isso metade dos textos
    // some na foto, e some justamente nos imóveis bem iluminados.
    // A caixa: a do visual quando ele diz, a do estilo quando cala. `caixa: null` no
    // visual é uma ESCOLHA de não ter caixa, e não a ausência de escolha -- por isso o
    // teste é `undefined`, não falsidade.
    const temCaixa = v.caixa !== undefined ? v.caixa !== null : est.fundo === "caixa";
    const corCaixa = v.caixa ?? est.cor.replace("0x", "");
    const temContorno = v.contorno !== undefined ? v.contorno !== null : est.fundo === "contorno";
    if (temCaixa) {
      partes.push(`box=1`, `boxcolor=0x${corCaixa}@0.9`, `boxborderw=${Math.round(tamanho * 0.42)}`);
      if (temContorno) partes.push(`borderw=${Math.max(2, Math.round(tamanho * 0.06))}`, `bordercolor=0x${v.contorno ?? "000000"}@0.9`);
    } else if (temContorno) {
      partes.push(`borderw=${Math.max(2, Math.round(tamanho * 0.1))}`, `bordercolor=0x${v.contorno ?? "000000"}@0.92`);
    } else if (v.sombra || est.fundo === "sombra") {
      const d = Math.max(2, Math.round(tamanho * 0.07));
      partes.push(`shadowcolor=0x000000@0.75`, `shadowx=${d}`, `shadowy=${d}`);
    } else {
      // Sem caixa, sem contorno e sem sombra pedida: uma sombra fina mesmo assim, senão
      // letra branca some em parede branca -- e some justo no imóvel bem iluminado.
      const d = Math.max(2, Math.round(tamanho * 0.05));
      partes.push(`shadowcolor=0x000000@0.6`, `shadowx=${d}`, `shadowy=${d}`);
    }

    if (enable) partes.push(`enable='${enable}'`);
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
export function filtrosDeLegenda(legendas: Legendas | null | undefined, W: number, H: number, subir = false): string[] {
  if (!legendas?.trechos?.length) return [];
  const tamanho = Math.max(20, Math.round(H * 0.034));
  // `subir`: o apresentador em faixa ocupa o pé do vídeo, e legenda atrás de um rosto não
  // é legenda. Ela passa a morar acima da faixa.
  const y = legendas.posicao === "centro" ? `(h-text_h)/2` : `h-text_h-${Math.round(H * (subir ? 0.36 : 0.14))}`;
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
    // Subir é do CHÃO pro teto: a janela começa embaixo (y máximo) e sobe até 0. O
    // ambiente alto se olha assim, e é o movimento que a foto vertical de pé-direito
    // duplo pede -- passear na horizontal ali não mostra nada.
    cima: { z: "1.08", x: centroX, y: `(ih-ih/zoom)*(1-${p})` },
    baixo: { z: "1.08", x: centroX, y: `(ih-ih/zoom)*${p}` },
    parado: { z: "1", x: "0", y: "0" },
  };
  const r = receitas[efeito];
  return `zoompan=z='${r.z}':d=${d}:x='${r.x}':y='${r.y}':s=${W}x${H}:fps=${FPS}`;
}

/**
 * O acabamento de cor da cena: o filtro, os ajustes e a vinheta.
 *
 * Vem ANTES dos textos na cadeia, sempre. Texto é peça gráfica: escurecer a cena não pode
 * escurecer o preço junto, senão "Claro e limpo" deixa a faixa branca cinza.
 *
 * Devolve lista, nunca string com vírgula -- quem emenda isso numa string de filtro com
 * `join(",")` no lugar certo não erra; quem cola à mão erra.
 */
/**
 * A cor de uma cena, já PREPARADA pelo pipeline: o arquivo da LUT escrito em disco e a
 * força da vinheta. Construtor de comando não escreve arquivo -- recebe o caminho pronto.
 */
export type CorDaCena = { lut?: string; vinheta?: number };

/**
 * O filtro e os ajustes viram DOIS filtros do ffmpeg: `lut3d` (a função de cor inteira,
 * amostrada em 33³ pontos) e `vignette` (a borda escura, que é espacial e não cabe numa
 * LUT). A conta dos dois é a mesma que a miniatura faz no navegador -- ver filtros.ts.
 */
export function filtrosDeImagem(cor?: CorDaCena): string[] {
  const lista: string[] = [];
  if (cor?.lut) lista.push(`lut3d=file='${caminhoParaFiltro(cor.lut)}':interp=tetrahedral`);
  if (cor?.vinheta && cor.vinheta > 0) lista.push(`vignette=angle=${anguloDaVinheta(cor.vinheta).toFixed(4)}`);
  return lista;
}

/** Cena de foto parada com movimento de câmera (Ken Burns). Um quadro de entrada. */
export function argsCenaFoto(o: {
  foto: string;
  saida: string;
  W: number;
  H: number;
  duracao: number;
  efeito: EfeitoId;
  textos?: TextoCena[];
  topoOcupado?: boolean;
  cor?: CorDaCena;
  giro?: number;
  espelho?: boolean;
  /** Artes de texto já rasterizadas pelo pipeline. Entram como IMAGEM, não como letra. */
  artes?: ArteNaCena[];
  /** Elementos gráficos já rasterizados, cada um com o canto dele. */
  pecas?: PecaNaCena[];
}): string[] {
  const frames = Math.round(o.duracao * FPS);
  const filtros = [...geometria(o.giro, o.espelho), enquadrar(o.W, o.H, ESCALA_ZOOM), zoompan(o.efeito, frames, o.W, o.H), ...filtrosDeImagem(o.cor), "format=yuv420p"];
  // Só os textos SEM arte passam pelo drawtext; os com arte entram como sobreposição.
  filtros.push(...filtrosDeTexto(textosSemArte(o.textos), o.W, o.H, o.topoOcupado, o.duracao));
  const arte = sobreporPecas(pecasDaCena(o.W, o.duracao, o.artes, o.pecas), o.W, 1);
  return [
    "-i", o.foto,
    ...arte.entradas,
    "-filter_complex", [`[0:v]${filtros.join(",")}[v]`, ...arte.partes].join(";"),
    "-map", `[${arte.saida}]`,
    "-t", o.duracao.toFixed(2),
    ...CODEC_VIDEO,
    o.saida,
  ];
}

/**
 * Antes e depois: mostra a original, uma cortina passa da esquerda pra direita e fica
 * o resultado. As duas ficam paradas de propósito -- o movimento é a cortina.
 */
export function argsCenaAntesDepois(o: { antes: string; depois: string; saida: string; W: number; H: number; duracao: number; textos?: TextoCena[]; topoOcupado?: boolean; cor?: CorDaCena; giro?: number; espelho?: boolean; artes?: ArteNaCena[]; pecas?: PecaNaCena[] }): string[] {
  const trans = 1.4;
  const cada = (o.duracao + trans) / 2;
  const offset = cada - trans;
  // O acabamento vale pras DUAS: comparar antes e depois com cores diferentes seria
  // vender a correção de cor como se fosse a reforma.
  const base = [...geometria(o.giro, o.espelho), enquadrar(o.W, o.H), ...filtrosDeImagem(o.cor), "format=yuv420p"].join(",");
  const rotA = pill({ texto: "Antes", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0x111111" });
  const rotB = pill({ texto: "Depois", W: o.W, H: o.H, tamanho: 0.028, posicao: "alto", cor: "0xf06b4f" });
  // Os textos entram DEPOIS da limpeza entre as duas fotos, senão o "Antes"/"Depois"
  // passaria por cima deles na virada.
  const texto = filtrosDeTexto(textosSemArte(o.textos), o.W, o.H, o.topoOcupado).join(",");
  const filtro = `[0:v]${base},${rotA}[a];[1:v]${base},${rotB}[b];[a][b]xfade=transition=wipeleft:duration=${trans}:offset=${offset.toFixed(2)}${texto ? "[ab];[ab]" + texto : ""}[v]`;
  // As duas fotos ja ocupam as entradas 0 e 1; a peca comeca na 2.
  const arte = sobreporPecas(pecasDaCena(o.W, o.duracao, o.artes, o.pecas), o.W, 2);
  return [
    "-loop", "1", "-framerate", String(FPS), "-t", cada.toFixed(2), "-i", o.antes,
    "-loop", "1", "-framerate", String(FPS), "-t", cada.toFixed(2), "-i", o.depois,
    ...arte.entradas,
    "-filter_complex", [filtro, ...arte.partes].join(";"), "-map", `[${arte.saida}]`, "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida,
  ];
}

/**
 * Clipe de vídeo da pessoa (ou o clipe que a IA animou): enquadra, corta na duração,
 * completa clonando o último quadro se for mais curto, tira o áudio (a música é nossa).
 * `melhorar` é uma correção leve de cor e nitidez, sem IA.
 */
export function argsCenaClipe(o: { clipe: string; saida: string; W: number; H: number; duracao: number; textos?: TextoCena[]; melhorar?: boolean; inicio?: number; topoOcupado?: boolean; cor?: CorDaCena; giro?: number; espelho?: boolean; velocidade?: number; artes?: ArteNaCena[]; pecas?: PecaNaCena[] }): string[] {
  // Velocidade é `setpts`, e vem ANTES do `fps`: primeiro os carimbos de tempo mudam,
  // depois o ffmpeg reamostra pra taxa fixa. Na ordem inversa o vídeo fica aos trancos,
  // porque a reamostragem acontece contra um relógio que ainda vai mudar.
  const vel = Math.min(2, Math.max(0.5, o.velocidade ?? 1));
  const filtros = [...(vel !== 1 ? [`setpts=PTS/${vel}`] : []), `fps=${FPS}`, ...geometria(o.giro, o.espelho), enquadrar(o.W, o.H), ...filtrosDeImagem(o.cor), "format=yuv420p"];
  if (o.melhorar) filtros.push("eq=contrast=1.06:brightness=0.02:saturation=1.12", "unsharp=5:5:0.6:5:5:0.0");
  filtros.push(`tpad=stop_mode=clone:stop_duration=${o.duracao}`);
  filtros.push(...filtrosDeTexto(textosSemArte(o.textos), o.W, o.H, o.topoOcupado));
  // O clipe entra CURTO de propósito e o `tpad` clona o último quadro até fechar a
  // duração: os últimos instantes ficam parados. Vale pro vídeo da pessoa e, sobretudo,
  // pro clipe da IA -- que termina onde o modelo parou, muitas vezes no meio do gesto.
  // A 2x, encher 4 segundos de cena consome 8 segundos de arquivo. Sem esta conta o
  // clipe acelerado acaba na metade e o `tpad` congela o resto -- que é como "velocidade"
  // vira "o vídeo travou".
  const corte = Math.max(0.5, (o.duracao - Math.min(SEGUNDOS_DE_POUSO, o.duracao * 0.25)) * vel);
  // `-ss` ANTES do `-i`: o ffmpeg pula direto pro ponto em vez de decodificar tudo e
  // descartar. É o "aparar o começo" -- o pedaço em que a pessoa ainda estava acertando
  // o celular não entra no vídeo.
  const inicio = Math.max(0, o.inicio ?? 0);
  const arte = sobreporPecas(pecasDaCena(o.W, o.duracao, o.artes, o.pecas), o.W, 1);
  return ["-ss", inicio.toFixed(2), "-t", corte.toFixed(2), "-i", o.clipe, ...arte.entradas, "-an", "-filter_complex", [`[0:v]${filtros.join(",")}[v]`, ...arte.partes].join(";"), "-map", `[${arte.saida}]`, "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
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
  cor?: CorDaCena;
  /** "equirect" (câmera 360) ou "panoramica" (modo panorâmico do celular). */
  projecao?: Projecao360;
  /** Tamanho da imagem de entrada: só usado pra calcular o campo de visão da panorâmica. */
  entradaLargura?: number;
  entradaAltura?: number;
  artes?: ArteNaCena[];
  pecas?: PecaNaCena[];
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
    ...filtrosDeImagem(o.cor),
    "format=yuv420p",
  ];
  filtros.push(...filtrosDeTexto(textosSemArte(o.textos), o.W, o.H, o.topoOcupado));
  const arte = sobreporPecas(pecasDaCena(o.W, o.duracao, o.artes, o.pecas), o.W, 1);

  const entrada = o.ehVideo
    ? ["-t", o.duracao.toFixed(2), "-i", o.entrada]
    : ["-loop", "1", "-framerate", String(FPS), "-t", o.duracao.toFixed(2), "-i", o.entrada];

  return [...entrada, ...arte.entradas, "-an", "-filter_complex", [`[0:v]${filtros.join(",")}[v]`, ...arte.partes].join(";"), "-map", `[${arte.saida}]`, "-t", o.duracao.toFixed(2), ...CODEC_VIDEO, o.saida];
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
  /** Caminho local do efeito sonoro das viradas. */
  efeitoSonoro?: string;
  /** 0,2 a 2. Padrão 1. */
  vozVolume?: number;
  /** Segundos até a voz começar. Padrão 0,7. */
  vozInicio?: number;
  legendas?: Legendas | null;
  /** O corretor por cima do vídeo. `arquivo` é o caminho local já baixado. */
  apresentador?: (Apresentador & { arquivoLocal: string; temAudio: boolean; duracaoClipe: number }) | null;
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
  // O efeito sonoro entra UMA vez como entrada e é copiado pra cada virada com asplit:
  // abrir o mesmo arquivo doze vezes decodifica doze vezes o mesmo som.
  let idxEfeito = -1;
  if (o.efeitoSonoro) {
    args.push("-i", o.efeitoSonoro);
    idxEfeito = idx++;
  }
  // O apresentador entra APARADO no próprio arquivo (`-ss` antes do `-i`) e com a duração
  // que vai ficar na tela: o resto do clipe dele não precisa ser decodificado.
  let idxApre = -1;
  const apre = o.apresentador ?? null;
  const apreDuracao = apre ? Math.min(apre.duracao ?? apre.duracaoClipe, apre.duracaoClipe) : 0;
  const apreEntra = apre ? Math.max(0, apre.entra ?? 0) : 0;
  if (apre && apreDuracao > 0.2) {
    args.push("-ss", (apre.inicio ?? 0).toFixed(2), "-t", apreDuracao.toFixed(2), "-i", apre.arquivoLocal);
    idxApre = idx++;
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
  //
  // Com o apresentador em faixa no pé, elas sobem: as duas coisas moram embaixo, e a
  // legenda por trás de um rosto não é legenda.
  const apreNoPe = idxApre >= 0 && apre?.formato === "rodape";
  const legendas = filtrosDeLegenda(o.legendas, o.W, o.H, apreNoPe);
  partes.push(`[${ultimo}]${["format=yuv420p", ...carimbos, ...legendas].join(",")}[vout]`);

  // ---- apresentador ----
  let saidaVideo = "vout";
  if (idxApre >= 0 && apre) {
    const margem = Math.round(o.W * 0.04);
    const fim = apreEntra + apreDuracao;
    const janela = `enable='between(t\\,${apreEntra.toFixed(2)}\\,${fim.toFixed(2)})'`;
    if (apre.formato === "rodape") {
      const altura = Math.round(o.H * 0.3);
      partes.push(`[${idxApre}:v]scale=${o.W}:${altura}:force_original_aspect_ratio=increase,crop=${o.W}:${altura},setpts=PTS-STARTPTS[pv]`);
      partes.push(`[vout][pv]overlay=0:main_h-overlay_h:${janela}[vfinal]`);
    } else {
      const lado = Math.round(o.W * (TAMANHOS_APRESENTADOR.find((t) => t.id === (apre.tamanho ?? "medio"))?.fracao ?? 0.34));
      const canto = apre.canto ?? "inferior_direito";
      const x = canto.endsWith("direito") ? `main_w-overlay_w-${margem}` : `${margem}`;
      // No pé, o apresentador sobe um pouco mais: embaixo dele moram a legenda e a barra
      // do Instagram.
      const y = canto.startsWith("superior") ? `${margem}` : `main_h-overlay_h-${Math.round(o.H * 0.12)}`;
      if (apre.formato === "circulo") {
        // Recorta quadrado e apaga o que está fora do círculo pelo canal alfa. As vírgulas
        // do `if` e do `hypot` vão escapadas: dentro de um filtro, vírgula separa filtros.
        const r = Math.round(lado / 2);
        partes.push(
          `[${idxApre}:v]scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado},setpts=PTS-STARTPTS,format=rgba,` +
            `geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='if(lte(hypot(X-${r}\\,Y-${r})\\,${r - 2})\\,255\\,0)'[pv]`
        );
      } else {
        partes.push(`[${idxApre}:v]scale=${lado}:-2,setpts=PTS-STARTPTS[pv]`);
      }
      partes.push(`[vout][pv]overlay=${x}:${y}:${janela}[vfinal]`);
    }
    saidaVideo = "vfinal";
  }

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

  // A VOZ do vídeo pode vir de dois lugares: a narração e o apresentador falando. Os dois
  // juntos viram uma faixa só -- e é essa faixa que faz a música abaixar. Tratar o
  // apresentador como "outro som" deixaria a música por cima da fala dele.
  const volApre = Math.min(2, Math.max(0, apre?.volume ?? 1));
  const temVozApre = idxApre >= 0 && !!apre?.temAudio && volApre > 0;
  const fontesDeVoz: string[] = [];
  if (idxNarracao >= 0) {
    // `apad` antes do atrim: voz curta num vídeo longo terminava o amix cedo.
    partes.push(`[${idxNarracao}:a]adelay=${msInicio}|${msInicio},volume=${volVoz.toFixed(2)},apad,atrim=0:${total.toFixed(2)}[voz0]`);
    fontesDeVoz.push("voz0");
  }
  if (temVozApre) {
    const msApre = Math.round(apreEntra * 1000);
    partes.push(`[${idxApre}:a]adelay=${msApre}|${msApre},volume=${volApre.toFixed(2)},apad,atrim=0:${total.toFixed(2)}[voz1]`);
    fontesDeVoz.push("voz1");
  }
  if (fontesDeVoz.length === 2) {
    partes.push(`[voz0][voz1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[nar]`);
  } else if (fontesDeVoz.length === 1) {
    partes.push(`[${fontesDeVoz[0]}]anull[nar]`);
  }
  const temVoz = fontesDeVoz.length > 0;

  if (idxMusica >= 0 && temVoz) {
    partes.push(`${musicaBase}[m]`);
    partes.push(`[nar]asplit=2[nar1][gatilho]`);
    // threshold em amplitude (0-1), não em dB. ratio 8 e release 350ms: a música volta
    // entre as frases sem "bombear" a cada sílaba.
    partes.push(`[m][gatilho]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=350:makeup=1[mduck]`);
    partes.push(`[mduck][nar1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
  } else if (idxMusica >= 0) {
    partes.push(`${musicaBase}[aout]`);
  } else if (temVoz) {
    partes.push(`[nar]anull[aout]`);
  }

  // ---- efeito sonoro nas viradas ----
  //
  // Uma cópia por emenda, atrasada pro instante em que a virada acontece. O tempo da
  // virada é a soma das durações até ali MENOS as emendas já gastas -- a mesma conta que
  // posiciona o carimbo, porque a transição sobrepõe os dois clipes.
  let saidaAudio = "aout";
  const viradas: number[] = [];
  if (idxEfeito >= 0 && n > 1) {
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      acc += o.duracoes[i];
      const gasto = Array.from({ length: i + 1 }, (_, k) => emenda(k).segundos).reduce((x, y) => x + y, 0);
      viradas.push(Math.max(0, acc - gasto));
    }
  }
  if (viradas.length > 0) {
    const rotulos = viradas.map((_, i) => `ef${i}`);
    partes.push(`[${idxEfeito}:a]volume=0.8,asplit=${viradas.length}${rotulos.map((r) => `[${r}c]`).join("")}`);
    viradas.forEach((t, i) => {
      const ms = Math.round(t * 1000);
      partes.push(`[${rotulos[i]}c]adelay=${ms}|${ms}[${rotulos[i]}]`);
    });
    const entradas = [...(idxMusica >= 0 || temVoz ? ["[aout]"] : []), ...rotulos.map((r) => `[${r}]`)];
    partes.push(`${entradas.join("")}amix=inputs=${entradas.length}:duration=first:dropout_transition=0:normalize=0[afinal]`);
    saidaAudio = "afinal";
  }

  const temAudio = idxMusica >= 0 || temVoz || viradas.length > 0;
  return [
    ...args,
    "-filter_complex", partes.join(";"),
    "-map", `[${saidaVideo}]`, ...(temAudio ? ["-map", `[${saidaAudio}]`] : []),
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

/**
 * A CAPA MONTADA: a FOTO da cena escolhida, com o nome do imóvel, o preço e o logo.
 *
 * É a imagem que aparece ANTES de alguém tocar no play -- no feed, no WhatsApp, na lista
 * de vídeos. Um quadro cru vende o cômodo; a capa montada vende o anúncio, e é o único
 * lugar em que o preço é lido por quem ainda não decidiu assistir.
 *
 * Sai da FOTO e não de um quadro do vídeo, e essa é a decisão que importa: o vídeo
 * carimba título e preço no alto de TODA a duração (`fimDoCarimbo` só some na tela
 * final), então uma capa tirada dele traria os dois escritos duas vezes -- em cima pelo
 * carimbo, embaixo pela capa. Foi o que apareceu no primeiro render, e nenhum teste de
 * string mostraria.
 *
 * Tudo aqui é fração da altura, e o enquadramento repete o do vídeo, então a capa vale
 * igual em 9:16, 1:1 e 4:5 e nunca sai com barra preta no feed.
 */
export function argsCapaMontada(o: { foto: string; saida: string; W: number; H: number; titulo?: string; preco?: string; local?: string; cor: string; logo?: string }): string[] {
  const fonte = caminhoParaFiltro(caminhoFonte());
  const corHex = /^#[0-9a-fA-F]{6}$/.test(o.cor) ? "0x" + o.cor.slice(1) : "0x0f2d5b";
  const titulo = (o.titulo ?? "").trim();
  const preco = (o.preco ?? "").trim();
  const onde = (o.local ?? "").trim();

  // A faixa cobre o pé do quadro. Alta o bastante pra caber nome e preço, e escura o
  // bastante pra letra branca ser lida sobre qualquer foto.
  // Enquadrada como o vídeo e reduzida pra 720 de largura: a capa tem a MESMA proporção
  // do vídeo, senão a miniatura aparece com barra preta no feed.
  const larguraCapa = 720;
  const alturaCapa = Math.round((larguraCapa * o.H) / o.W / 2) * 2;
  const filtros = [`scale=${larguraCapa}:${alturaCapa}:force_original_aspect_ratio=increase`, `crop=${larguraCapa}:${alturaCapa}`, `drawbox=x=0:y=ih*0.66:w=iw:h=ih*0.34:color=black@0.55:t=fill`];

  const desenhar = (texto: string, tamanho: number, y: number, cor: string, negrito = false) =>
    `drawtext=fontfile='${fonte}':text=${textoParaFiltro(quebrarLinhas(texto, 640, tamanho, 2), true)}:fontsize=${tamanho}:fontcolor=${cor}:x=40:y=h*${y}${negrito ? ":borderw=0" : ""}`;

  // De baixo pra cima: preço, local, título. Assim o título sobe quando há preço e
  // desce quando não há, sem uma conta de altura acumulada.
  if (preco) filtros.push(desenhar(preco, 46, 0.845, "white", true));
  if (onde) filtros.push(desenhar(onde, 22, 0.788, "0xd8dee8"));
  if (titulo) filtros.push(desenhar(titulo, 30, onde ? 0.723 : 0.75, "white", true));
  // Um traço na cor da marca ancora a faixa e diz de quem é o anúncio, mesmo sem logo.
  filtros.push(`drawbox=x=40:y=ih*0.66+8:w=64:h=6:color=${corHex}@1:t=fill`);

  // `-frames:v 1` fica nas opções de SAÍDA, nunca antes de um `-i`. Antes do `-i` ele é
  // opção de entrada, e o demuxer de imagem do logo recusa ("Error parsing options for
  // input file") -- a capa inteira falhava e caía no quadro cru, calada.
  const entrada = ["-i", o.foto];
  if (o.logo) {
    return [
      ...entrada,
      "-i", o.logo,
      "-filter_complex",
      `[0:v]${filtros.join(",")}[base];[1:v]scale=180:-1[lg];[base][lg]overlay=main_w-overlay_w-36:34[v]`,
      "-map", "[v]", "-frames:v", "1", "-q:v", "3", o.saida,
    ];
  }
  return [...entrada, "-frames:v", "1", "-vf", filtros.join(","), "-q:v", "3", o.saida];
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
