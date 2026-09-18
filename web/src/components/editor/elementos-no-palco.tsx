"use client";

import { ELEMENTO_POR_ID, FICHA_EXEMPLO, ANCORAS, posicionarPecas, type AncoraElemento, type IconeFicha } from "@/lib/elementos";
import { ADESIVO_POR_ID, idDoAdesivo, urlDoAdesivo } from "@/lib/adesivos";
import { LOOP_CLIPE_S, TAMANHO_CLIPE, TAMANHO_CLIPE_MAX, TAMANHO_CLIPE_MIN, idDoPexels } from "@/lib/pexels";
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
  aoDuplicar,
  aoMoverCamada,
  selecionado,
  aoSelecionar,
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
  aoDuplicar?: (i: number) => void;
  aoMoverCamada?: (i: number, direcao: "frente" | "tras") => void;
  /**
   * Linha do tempo (P6), opcional: a peça selecionada ganha o contorno tracejado coral, e
   * um toque numa peça a seleciona. O dedo segurado continua abrindo o menu.
   */
  selecionado?: number;
  aoSelecionar?: (i: number) => void;
}) {
  const W_REF = Math.round(H_REF * proporcao);

  // Desenha cada peça no quadro de referência pra saber o tamanho, igual ao servidor.
  const pecas = elementos.map((e) => {
    // Clipe do Pexels: a altura sai do tamanho, a largura da proporção do vídeo -- a mesma
    // conta de `prepararClipePexels`, que corta o clipe nessa altura.
    if (idDoPexels(e.id)) {
      if (!e.clipe) return null;
      const alt = Math.round(H_REF * (e.tamanho ?? TAMANHO_CLIPE));
      const larg = Math.round((alt * e.clipe.largura) / e.clipe.altura);
      return { e, adesivo: null, svg: null as string | null, largura: larg, altura: alt, ancora: (e.ancora ?? "base_dir") as AncoraElemento, quadroInteiro: false };
    }
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
        const ehClipe = !!p.e.clipe && !!idDoPexels(p.e.id);
        const rotulo = ehClipe ? "clipe" : p.adesivo ? ADESIVO_POR_ID[p.adesivo].rotulo : ELEMENTO_POR_ID[p.e.id]?.rotulo ?? "peça";
        const tamanhoAtual = p.e.tamanho ?? (ehClipe ? TAMANHO_CLIPE : p.adesivo ? TAMANHO_ADESIVO : ELEMENTO_POR_ID[p.e.id]?.corpo ?? 0.1);
        const cantoAtual = GIRO_DE_CANTOS.indexOf(p.ancora);
        // GIF tem 224px: acima de 20% da altura o vídeo amplia e borra.
        const maximo = ehClipe ? TAMANHO_CLIPE_MAX : p.adesivo && ADESIVO_POR_ID[p.adesivo].animado ? 0.2 : 0.3;
        const minimo = ehClipe ? TAMANHO_CLIPE_MIN : 0.05;
        const itens: ItemMenu[] = [
          ...(aoDuplicar
            ? [
                {
                  rotulo: "Duplicar peça",
                  icone: "copiar",
                  desligado: elementos.length >= 4,
                  aoEscolher: () => aoDuplicar(p.i),
                },
              ]
            : []),
          ...(p.quadroInteiro
            ? []
            : [
                { rotulo: "Aumentar", icone: "mais", desligado: tamanhoAtual >= maximo, aoEscolher: () => aoMudar(p.i, { tamanho: Math.min(maximo, Math.round((tamanhoAtual * 1.25) * 1000) / 1000) }) },
                { rotulo: "Diminuir", icone: "baixo", desligado: tamanhoAtual <= minimo, aoEscolher: () => aoMudar(p.i, { tamanho: Math.max(minimo, Math.round((tamanhoAtual / 1.25) * 1000) / 1000) }) },
                {
                  rotulo: "Trocar de canto",
                  icone: "girar",
                  dica: ANCORAS.find((a) => a.id === GIRO_DE_CANTOS[(cantoAtual + 1) % GIRO_DE_CANTOS.length])?.rotulo,
                  aoEscolher: () => aoMudar(p.i, { ancora: GIRO_DE_CANTOS[(cantoAtual + 1) % GIRO_DE_CANTOS.length] }),
                },
              ] as ItemMenu[]),
          ...(aoMoverCamada && elementos.length > 1
            ? [
                {
                  rotulo: "Trazer para frente",
                  icone: "cima",
                  divisor: true,
                  desligado: p.i === elementos.length - 1,
                  aoEscolher: () => aoMoverCamada(p.i, "frente"),
                },
                {
                  rotulo: "Enviar para trás",
                  icone: "baixo",
                  desligado: p.i === 0,
                  aoEscolher: () => aoMoverCamada(p.i, "tras"),
                },
              ]
            : []),
          {
            rotulo: `Excluir ${rotulo.toLowerCase()}`,
            icone: "lixeira",
            perigo: true,
            divisor: true,
            atalho: "Del",
            aoEscolher: () => aoTirar(p.i),
          },
        ];
        const estiloLivre = typeof p.e.x === "number" && typeof p.e.y === "number";
        const estilo: React.CSSProperties = estiloLivre
          ? {
              left: `${p.e.x}%`,
              top: `${p.e.y}%`,
              width: `${(p.largura / W_REF) * 100}%`,
              height: `${(p.altura / H_REF) * 100}%`,
              transform: "translate(-50%, -50%)",
            }
          : {
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
            title={`${rotulo} · clique e arraste para mover · botão direito para opções`}
            {...gatilho(itens)}
            onPointerDown={(e) => {
              if (p.quadroInteiro) return;
              if (e.button !== 0) return;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const inicioX = e.clientX;
              const inicioY = e.clientY;
              const pai = el.parentElement;
              if (!pai) return;
              const rectPai = pai.getBoundingClientRect();
              const rectEl = el.getBoundingClientRect();
              const atualX = estiloLivre ? (p.e.x as number) : (((rectEl.left + rectEl.width / 2) - rectPai.left) / rectPai.width) * 100;
              const atualY = estiloLivre ? (p.e.y as number) : (((rectEl.top + rectEl.height / 2) - rectPai.top) / rectPai.height) * 100;
              let arrastou = false;

              const onMove = (me: PointerEvent) => {
                const dx = me.clientX - inicioX;
                const dy = me.clientY - inicioY;
                if (!arrastou && Math.hypot(dx, dy) > 4) arrastou = true;
                if (arrastou) {
                  const px = Math.min(95, Math.max(5, atualX + (dx / rectPai.width) * 100));
                  const py = Math.min(95, Math.max(5, atualY + (dy / rectPai.height) * 100));
                  aoMudar(p.i, { x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10 });
                }
              };

              const onUp = () => {
                el.removeEventListener("pointermove", onMove);
                el.removeEventListener("pointerup", onUp);
                el.removeEventListener("pointercancel", onUp);
                if (!arrastou && aoSelecionar) aoSelecionar(p.i);
              };

              el.addEventListener("pointermove", onMove);
              el.addEventListener("pointerup", onUp);
              el.addEventListener("pointercancel", onUp);
            }}
            className={
              "absolute cursor-grab active:cursor-grabbing select-none transition-shadow hover:outline hover:outline-2 hover:outline-white/70 " +
              // Moldura cobre o quadro inteiro: não pode roubar o clique do palco.
              (p.quadroInteiro ? "pointer-events-none" : "pointer-events-auto") +
              (selecionado === p.i ? " outline-2 outline-offset-2 outline-dashed outline-white/90 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "")
            }
            style={estilo}
          >
            <ComMovimento movimento={p.e.movimento} aspecto={p.largura / Math.max(1, p.altura)}>
              {ehClipe && p.e.clipe ? (
                // Laço curto como no vídeo: volta pro começo aos LOOP_CLIPE_S segundos.
                <video
                  src={p.e.clipe.previa}
                  muted
                  autoPlay
                  playsInline
                  loop
                  preload="auto"
                  onTimeUpdate={(ev) => {
                    if (ev.currentTarget.currentTime >= LOOP_CLIPE_S) ev.currentTarget.currentTime = 0;
                  }}
                  className="h-full w-full border-[2px] border-white object-cover"
                />
              ) : p.adesivo ? (
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
