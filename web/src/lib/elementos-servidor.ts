import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ELEMENTO_POR_ID, COR_ELEMENTO_PADRAO, lugarDoElemento, type AncoraElemento } from "./elementos";
import type { PecaNaCena } from "./video-ffmpeg";
import type { ElementoCena } from "./video";

// Rasteriza os ELEMENTOS de uma cena: SVG -> PNG, pra entrarem como sobreposição.
//
// Só servidor. O SVG sai do MESMO catálogo que a galeria usa pra desenhar o cartão, então
// o que a pessoa escolheu vendo é literalmente o que vai pro vídeo.
//
// Duas peças na mesma âncora EMPILHAM. Sem isso, um selo e uma etiqueta escolhidos pro
// mesmo canto sairiam um por cima do outro -- e isso só apareceria no arquivo final.

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
  const lista = (elementos ?? []).filter((e) => ELEMENTO_POR_ID[e.id]);
  if (!lista.length) return [];

  // A cor da peça é a dela, senão a da conta, senão a da casa. Em cascata, e não com um
  // `||` em cima de uma função que já devolve padrão -- isso faria a cor da conta nunca
  // valer, porque a primeira etapa nunca seria falsa.
  const corPadrao = corValida(opcoes.cor) ?? COR_ELEMENTO_PADRAO;
  /**
   * Até onde cada âncora já está ocupada, em pixels.
   *
   * Guarda a BORDA da peça anterior, não quantas peças já entraram. Um passo calculado
   * pela altura da peça NOVA erra sempre que a de baixo é mais alta que a de cima: um
   * selo de 125px seguido de um de 96px empilhava com 115 de passo e as duas se cobriam
   * por 10 pixels -- medido, e invisível em qualquer teste que não olhasse as duas
   * coordenadas juntas.
   */
  const ocupado: Record<string, number> = {};
  const folga = Math.max(4, Math.round(H * 0.012));
  const saida: PecaNaCena[] = [];

  for (let k = 0; k < lista.length; k++) {
    const e = lista[k];
    const modelo = ELEMENTO_POR_ID[e.id];
    const alt = Math.max(12, Math.round(H * (e.tamanho ?? modelo.corpo)));
    const d = modelo.desenhar({ texto: e.texto ?? modelo.exemplo ?? "", itens: e.itens ?? [], cor: corValida(e.cor) ?? corPadrao }, { alt, W, H });

    const arquivo = path.join(pasta, `${prefixo}-el-${k}.png`);
    await sharp(Buffer.from(d.svg)).png().toFile(arquivo);
    if (!fs.existsSync(arquivo)) continue;

    // Moldura vale o quadro inteiro: nasce em (0,0) e não empilha com nada.
    if (modelo.quadroInteiro) {
      saida.push({ arquivo, x: 0, y: 0, largura: d.largura, altura: d.altura, animacao: e.animacao });
      continue;
    }

    const ancora = (e.ancora ?? modelo.ancora) as AncoraElemento;
    const lugar = lugarDoElemento(ancora, W, H, d.largura, d.altura, opcoes.topoOcupado);

    // Empilha PRA CIMA quando a âncora é de baixo e PRA BAIXO nos outros casos: a
    // segunda peça tem que entrar pra dentro do quadro, nunca sair por fora.
    let y = lugar.y;
    const limite = ocupado[ancora];
    if (ancora.startsWith("base")) {
      if (limite !== undefined) y = Math.max(0, limite - folga - d.altura);
      ocupado[ancora] = y;
    } else {
      if (limite !== undefined) y = Math.min(Math.max(0, H - d.altura), limite + folga);
      ocupado[ancora] = y + d.altura;
    }

    saida.push({ arquivo, x: lugar.x, y, largura: d.largura, altura: d.altura, animacao: e.animacao });
  }
  return saida;
}
