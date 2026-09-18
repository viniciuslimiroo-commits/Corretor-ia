"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "@/components/ui";

// MENU DE CONTEXTO: mexer na coisa, em cima da coisa.
//
// O editor tinha tudo certo e tudo LONGE. Pra tirar um texto do vídeo era preciso achar
// a aba Texto, achar a linha daquele texto na lista e apertar a lixeira -- três passos e
// um mapa mental, pra uma ação que a pessoa já estava apontando com o dedo.
//
// Aqui o alvo é o próprio elemento no palco: clique com o botão direito (ou segure o
// dedo, no celular) e o que dá pra fazer com AQUELE elemento aparece ali.
//
// Duas coisas que parecem detalhe e não são:
//
//   - o menu é `position: fixed` e se ENCOSTA na borda quando não cabe. Sem isso, um
//     clique perto do rodapé abre um menu metade fora da tela, e no celular metade da
//     tela é rodapé;
//   - no toque, segurar meio segundo é o equivalente do botão direito. Sem isso o
//     recurso existiria só pra quem edita no computador -- e ele edita no celular.

export type ItemMenu = {
  rotulo?: string;
  icone?: string;
  /** Linha de explicação, pra ação que não se entende só pelo nome. */
  dica?: string;
  /** Texto curto do atalho de teclado (ex: "Del", "Ctrl+D"). */
  atalho?: string;
  perigo?: boolean;
  desligado?: boolean;
  /** Adiciona uma linha divisória antes deste item ou atua como divisor puro. */
  divisor?: boolean;
  aoEscolher?: () => void;
};

/** Quanto tempo o dedo fica parado até valer como botão direito. */
const TOQUE_LONGO = 450;

type Aberto = { x: number; y: number; itens: ItemMenu[] };

export function useMenuContexto() {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const relogio = useRef<number | null>(null);

  const fechar = useCallback(() => setAberto(null), []);

  const cancelarToque = useCallback(() => {
    if (relogio.current !== null) {
      window.clearTimeout(relogio.current);
      relogio.current = null;
    }
  }, []);

  useEffect(() => cancelarToque, [cancelarToque]);

  /** Abre o menu num ponto da tela. Pra quem precisa do LUGAR do clique pra decidir
   *  os itens -- "pôr um texto aqui" depende de onde é "aqui". */
  const abrir = useCallback((x: number, y: number, itens: ItemMenu[]) => setAberto({ x, y, itens }), []);

  /**
   * O que se espalha no elemento-alvo.
   *
   * Devolve os manipuladores prontos pra `{...gatilho(itens)}` -- assim a página não
   * repete oito vezes a mesma dança de `preventDefault` e temporizador.
   */
  const gatilho = useCallback(
    (itens: ItemMenu[]) => ({
      onContextMenu: (ev: React.MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        setAberto({ x: ev.clientX, y: ev.clientY, itens });
      },
      onTouchStart: (ev: React.TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;
        const { clientX, clientY } = t;
        cancelarToque();
        relogio.current = window.setTimeout(() => setAberto({ x: clientX, y: clientY, itens }), TOQUE_LONGO);
      },
      onTouchMove: cancelarToque,
      onTouchEnd: cancelarToque,
      onTouchCancel: cancelarToque,
    }),
    [cancelarToque]
  );

  return { aberto, fechar, gatilho, abrir };
}

export default function MenuContexto({ aberto, aoFechar }: { aberto: Aberto | null; aoFechar: () => void }) {
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (ev: Event) => {
      if (ev.type === "keydown" && (ev as KeyboardEvent).key !== "Escape") return;
      if (ev.type === "pointerdown" && caixa.current?.contains(ev.target as Node)) return;
      aoFechar();
    };
    // `scroll` na captura: o menu fica preso à tela, então rolar a página deixaria ele
    // apontando pro lugar errado.
    document.addEventListener("pointerdown", foraOuEsc);
    document.addEventListener("keydown", foraOuEsc);
    window.addEventListener("scroll", foraOuEsc, true);
    window.addEventListener("resize", foraOuEsc);
    return () => {
      document.removeEventListener("pointerdown", foraOuEsc);
      document.removeEventListener("keydown", foraOuEsc);
      window.removeEventListener("scroll", foraOuEsc, true);
      window.removeEventListener("resize", foraOuEsc);
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  // Encosta na borda em vez de vazar. 232px de largura e ~40px por linha é a medida real.
  const largura = 232;
  const altura = Math.min(aberto.itens.length * 42 + 20, 380);
  const x = Math.max(8, Math.min(aberto.x, (typeof window !== "undefined" ? window.innerWidth : 400) - largura - 8));
  const y = Math.max(8, Math.min(aberto.y, (typeof window !== "undefined" ? window.innerHeight : 800) - altura - 8));

  return (
    <div
      ref={caixa}
      role="menu"
      style={{ left: x, top: y, width: largura }}
      className="fixed z-50 overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900/95 py-1.5 text-neutral-200 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      {aberto.itens.map((item, i) => {
        if (item.divisor && !item.rotulo) {
          return <div key={i} className="my-1 border-t border-neutral-800" />;
        }
        return (
          <div key={i}>
            {item.divisor && <div className="my-1 border-t border-neutral-800" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.desligado}
              onClick={() => {
                item.aoEscolher?.();
                aoFechar();
              }}
              className={`flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left text-xs transition disabled:opacity-30 ${
                item.perigo
                  ? "text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  : "text-neutral-200 hover:bg-neutral-800/90 hover:text-white"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {item.icone ? (
                  <Icone nome={item.icone} className={`h-4 w-4 shrink-0 ${item.perigo ? "text-red-400" : "text-neutral-400"}`} />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium truncate">{item.rotulo}</span>
                  {item.dica ? <span className="block text-[10px] leading-tight text-neutral-400 truncate">{item.dica}</span> : null}
                </span>
              </div>
              {item.atalho && (
                <span className="shrink-0 text-[10px] text-neutral-500 font-mono tracking-wider">{item.atalho}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
