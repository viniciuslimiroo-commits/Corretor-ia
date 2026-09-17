"use client";

import { ELEMENTO_POR_ID, FICHA_EXEMPLO, ANCORAS, posicionarPecas, type AncoraElemento, type IconeFicha } from "@/lib/elementos";
import { ADESIVO_POR_ID, idDoAdesivo, urlDoAdesivo } from "@/lib/adesivos";
import type { ElementoCena } from "@/lib/video";
import type { ItemMenu, useMenuContexto } from "@/components/editor/menu-contexto";
import { useRef, type ReactNode } from "react";
import { useMovimento } from "@/components/editor/com-movimento";

// AS PEÇAS NO PALCO, no lugar em que vão sair no vídeo.
//
// Antes os elementos só apareciam no vídeo gerado: a pessoa punha uma chave "no canto de
// cima" e só descobria onde era esse canto depois de esperar o render. Agora o palco
// mostra -- e mostra no lugar CERTO porque usa a mesma `posicionarPecas` que o servidor,
// num quadro de referência de 1000 de altura convertido em porcentagem.
//
// Botão direito (ou dedo segurado) numa peça: tirar, maior, menor, trocar de canto.

/** O conteúdo da peça, balançando com os números do vídeo. A caixa de clique fica parada. */
function ComMovimento({ movimento, aspecto, children }: { movimento?: string; aspecto: number; children: ReactNode }) {
  const alvo = useRef<HTMLSpanElement | null>(null);
  useMovimento(alvo, movimento, aspecto);
  return (
    <span ref={alvo} className="block h-full w-full">
      {children}
    </span>
  );
}

const H_REF = 1000;
const TAMANHO_ADESIVO = 0.12;

/** A sequência de cantos do "trocar de canto": gira pelos quatro cantos e o meio de baixo. */
const GIRO_DE_CANTOS: AncoraElemento[] = ["topo_dir", "topo_esq", "base_esq", "base_dir", "base", "centro"];

export default function ElementosNoPalco({
  elementos,
  proporcao,
  topoOcupado,
  cor,
  itensDaFicha,
  gatilho,
  aoMudar,
  aoTirar,
}: {
  elementos: ElementoCena[];
  /** Largura ÷ altura do vídeo. */
  proporcao: number;
  topoOcupado: boolean;
  cor: string;
  itensDaFicha: { icone: IconeFicha; texto: string }[];
  gatilho: ReturnType<typeof useMenuContexto>["gatilho"];
  aoMudar: (i: number, mudanca: Partial<ElementoCena>) => void;
  aoTirar: (i: number) => void;
}) {
  const W_REF = Math.round(H_REF * proporcao);

  // Desenha cada peça no quadro de referência pra saber o tamanho, igual ao servidor.
  const pecas = elementos.map((e) => {
    const adesivo = idDoAdesivo(e.id);
    if (adesivo) {
      const lado = Math.round(H_REF * (e.tamanho ?? TAMANHO_ADESIVO));
      return { e, adesivo, svg: null as string | null, largura: lado, altura: lado, ancora: (e.ancora ?? "topo_dir") as AncoraElemento, quadroInteiro: false };
    }
    const m = ELEMENTO_POR_ID[e.id];
    if (!m) return null;
    const alt = Math.round(H_REF * (e.tamanho ?? m.corpo));
    const d = m.desenhar({ texto: e.texto ?? m.exemplo ?? "", itens: e.itens?.length ? e.itens : itensDaFicha.length ? itensDaFicha : FICHA_EXEMPLO, cor: e.cor ?? cor }, { alt, W: W_REF, H: H_REF });
    return { e, adesivo: null, svg: d.svg, largura: d.largura, altura: d.altura, ancora: (e.ancora ?? m.ancora) as AncoraElemento, quadroInteiro: !!m.quadroInteiro };
  });

  const validas = pecas.map((p, i) => (p ? { ...p, i } : null)).filter(Boolean) as (NonNullable<(typeof pecas)[number]> & { i: number })[];
  const lugares = posicionarPecas(validas, W_REF, H_REF, topoOcupado);

  return (
    <>
      {validas.map((p, k) => {
        const { x, y } = lugares[k];
        const rotulo = p.adesivo ? ADESIVO_POR_ID[p.adesivo].rotulo : ELEMENTO_POR_ID[p.e.id]?.rotulo ?? "peça";
        const tamanhoAtual = p.e.tamanho ?? (p.adesivo ? TAMANHO_ADESIVO : ELEMENTO_POR_ID[p.e.id]?.corpo ?? 0.1);
        const cantoAtual = GIRO_DE_CANTOS.indexOf(p.ancora);
        // GIF tem 224px: acima de 20% da altura o vídeo amplia e borra.
        const maximo = p.adesivo && ADESIVO_POR_ID[p.adesivo].animado ? 0.2 : 0.3;
        const itens: ItemMenu[] = [
          { rotulo: `Tirar ${rotulo.toLowerCase()}`, icone: "lixeira", perigo: true, aoEscolher: () => aoTirar(p.i) },
          ...(p.quadroInteiro
            ? []
            : [
                { rotulo: "Maior", icone: "mais", desligado: tamanhoAtual >= maximo, aoEscolher: () => aoMudar(p.i, { tamanho: Math.min(maximo, Math.round((tamanhoAtual * 1.25) * 1000) / 1000) }) },
                { rotulo: "Menor", icone: "baixo", desligado: tamanhoAtual <= 0.05, aoEscolher: () => aoMudar(p.i, { tamanho: Math.max(0.05, Math.round((tamanhoAtual / 1.25) * 1000) / 1000) }) },
                {
                  rotulo: "Trocar de canto",
                  icone: "girar",
                  dica: ANCORAS.find((a) => a.id === GIRO_DE_CANTOS[(cantoAtual + 1) % GIRO_DE_CANTOS.length])?.rotulo,
                  aoEscolher: () => aoMudar(p.i, { ancora: GIRO_DE_CANTOS[(cantoAtual + 1) % GIRO_DE_CANTOS.length] }),
                },
              ] as ItemMenu[]),
        ];
        const estilo: React.CSSProperties = {
          left: `${(x / W_REF) * 100}%`,
          top: `${(y / H_REF) * 100}%`,
          width: `${(p.largura / W_REF) * 100}%`,
          height: `${(p.altura / H_REF) * 100}%`,
        };
        return (
          <span
            key={`${p.e.id}-${p.i}`}
            role="button"
            tabIndex={0}
            title={`${rotulo} · botão direito pra mexer`}
            {...gatilho(itens)}
            className={
              "absolute cursor-context-menu select-none transition hover:outline hover:outline-2 hover:outline-white/70 " +
              // Moldura cobre o quadro inteiro: não pode roubar o clique do palco.
              (p.quadroInteiro ? "pointer-events-none" : "pointer-events-auto")
            }
            style={estilo}
          >
            <ComMovimento movimento={p.e.movimento} aspecto={p.largura / Math.max(1, p.altura)}>
              {p.adesivo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlDoAdesivo(p.adesivo)} alt="" className="h-full w-full" draggable={false} />
              ) : (
                <span
                  className="block h-full w-full"
                  // SVG do catálogo do próprio produto; o texto do corretor passa por `escaparSvg`.
                  dangerouslySetInnerHTML={{ __html: (p.svg ?? "").replace("<svg ", `<svg style="width:100%;height:100%" `) }}
                />
              )}
            </ComMovimento>
          </span>
        );
      })}
    </>
  );
}
