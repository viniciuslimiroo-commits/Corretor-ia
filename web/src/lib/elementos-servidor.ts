import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ELEMENTO_POR_ID, COR_ELEMENTO_PADRAO, posicionarPecas, type AncoraElemento } from "./elementos";
import { ADESIVO_POR_ID, arquivoDeAdesivo, idDoAdesivo } from "./adesivos";
import { TAMANHO_CLIPE, idDoPexels } from "./pexels";
import { prepararClipePexels } from "./pexels-servidor";
import type { PecaNaCena } from "./video-ffmpeg";
import type { ElementoCena } from "./video";

// Rasteriza os ELEMENTOS de uma cena: SVG -> PNG, pra entrarem como sobreposição.
//
// Só servidor. O SVG sai do MESMO catálogo que a galeria usa pra desenhar o cartão, então
// o que a pessoa escolheu vendo é literalmente o que vai pro vídeo.
//
// Duas peças na mesma âncora EMPILHAM. Sem isso, um selo e uma etiqueta escolhidos pro
// mesmo canto sairiam um por cima do outro -- e isso só apareceria no arquivo final.

/**
 * Tamanho padrão de um adesivo, em fração da altura do vídeo. 12% de 1920 são 230px -- o
 * arquivo da biblioteca tem 256px, então não amplia além do que a imagem aguenta.
 */
export const TAMANHO_ADESIVO = 0.12;

/** O arquivo do adesivo no disco (PNG, ou GIF se animado). Na Vercel o cwd é a raiz da função; `public/adesivos` entra no pacote. */
export function arquivoDoAdesivo(id: string): string {
  return path.join(process.cwd(), "public", "adesivos", arquivoDeAdesivo(id));
}

/** "#rrggbb", ou nada. Devolve `null` em vez de um padrão pra quem chama poder recuar. */
function corValida(bruta?: string | null): string | null {
  return typeof bruta === "string" && /^#[0-9a-fA-F]{6}$/.test(bruta) ? bruta : null;
}

export async function rasterizarElementos(
  elementos: ElementoCena[] | undefined,
  W: number,
  H: number,
  pasta: string,
  prefixo: string,
  opcoes: { cor?: string | null; topoOcupado?: boolean } = {}
): Promise<PecaNaCena[]> {
  const lista = (elementos ?? []).filter((e) => ELEMENTO_POR_ID[e.id] || idDoAdesivo(e.id) || idDoPexels(e.id));
  if (!lista.length) return [];

  // A cor da peça é a dela, senão a da conta, senão a da casa. Em cascata, e não com um
  // `||` em cima de uma função que já devolve padrão -- isso faria a cor da conta nunca
  // valer, porque a primeira etapa nunca seria falsa.
  const corPadrao = corValida(opcoes.cor) ?? COR_ELEMENTO_PADRAO;
  // Primeiro desenha tudo (o tamanho de cada peça só existe depois de desenhada); depois
  // posiciona todas de uma vez, com a MESMA função que o palco da tela usa.
  const desenhadas: { arquivo: string; largura: number; altura: number; ancora: AncoraElemento; quadroInteiro?: boolean; animacao?: string; animado?: boolean; movimento?: string; video?: boolean }[] = [];

  for (let k = 0; k < lista.length; k++) {
    const e = lista[k];
    let arquivo = path.join(pasta, `${prefixo}-el-${k}.png`);
    const adesivo = idDoAdesivo(e.id);
    const pexels = idDoPexels(e.id);
    const modelo = adesivo || pexels ? null : ELEMENTO_POR_ID[e.id];

    if (pexels) {
      // O clipe é baixado AQUI, só o escolhido, e cortado no laço curto já na altura da
      // cena. Sem chave, sem rede ou com o vídeo removido do Pexels, a peça some -- o resto
      // do vídeo sai.
      const clipe = await prepararClipePexels(pexels, Math.round(H * (e.tamanho ?? TAMANHO_CLIPE)), pasta, `${prefixo}-el-${k}`).catch(() => null);
      if (!clipe) continue;
      desenhadas.push({ arquivo: clipe.arquivo, largura: clipe.largura, altura: clipe.altura, ancora: (e.ancora ?? "base_dir") as AncoraElemento, animacao: e.animacao, video: true });
      continue;
    }
    const animado = !!(adesivo && ADESIVO_POR_ID[adesivo].animado);
    let d: { largura: number; altura: number };

    if (adesivo) {
      // O adesivo é a imagem pronta da biblioteca, só redimensionada. Quadrado, e o lado
      // sai da ALTURA do vídeo pelo mesmo motivo dos outros elementos: a peça tem que ter
      // o mesmo peso visual no 9:16 e no 16:9.
      const lado = Math.max(24, Math.round(H * (e.tamanho ?? TAMANHO_ADESIVO)));
      const origem = arquivoDoAdesivo(adesivo);
      if (!fs.existsSync(origem)) continue;
      if (animado) {
        // GIF entra INTEIRO no ffmpeg, que redimensiona e repete o laço lá: passar pelo
        // sharp aqui guardaria só o primeiro quadro, e o GIF sairia parado no vídeo.
        arquivo = origem;
      } else {
        await sharp(origem).resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(arquivo);
      }
      d = { largura: lado, altura: lado };
    } else {
      const m = modelo!;
      const alt = Math.max(12, Math.round(H * (e.tamanho ?? m.corpo)));
      const desenho = m.desenhar({ texto: e.texto ?? m.exemplo ?? "", itens: e.itens ?? [], cor: corValida(e.cor) ?? corPadrao }, { alt, W, H });
      await sharp(Buffer.from(desenho.svg)).png().toFile(arquivo);
      d = desenho;
    }
    if (!fs.existsSync(arquivo)) continue;

    desenhadas.push({
      arquivo,
      largura: d.largura,
      altura: d.altura,
      ancora: (e.ancora ?? modelo?.ancora ?? "topo_dir") as AncoraElemento,
      // Moldura vale o quadro inteiro: nasce em (0,0) e não empilha com nada.
      quadroInteiro: modelo?.quadroInteiro,
      animacao: e.animacao,
      animado,
      movimento: e.movimento,
    });
  }

  const lugares = posicionarPecas(desenhadas, W, H, opcoes.topoOcupado);
  return desenhadas.map((d, k) => ({ arquivo: d.arquivo, x: lugares[k].x, y: lugares[k].y, largura: d.largura, altura: d.altura, animacao: d.animacao, animado: d.animado, movimento: d.movimento, video: d.video }));
}
