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
  rotulo: string;
  icone?: string;
  /** Linha de explicação, pra ação que não se entende só pelo nome. */
  dica?: string;
  perigo?: boolean;
  desligado?: boolean;
  aoEscolher: () => void;
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

  return { aberto, fechar, gatilho };
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

  // Encosta na borda em vez de vazar. 224px de largura e ~40px por linha é a medida real
  // do que está desenhado aqui embaixo.
  const largura = 224;
  const altura = Math.min(aberto.itens.length * 40 + 12, 320);
  const x = Math.max(8, Math.min(aberto.x, (typeof window !== "undefined" ? window.innerWidth : 400) - largura - 8));
  const y = Math.max(8, Math.min(aberto.y, (typeof window !== "undefined" ? window.innerHeight : 800) - altura - 8));

  return (
    <div
      ref={caixa}
      role="menu"
      style={{ left: x, top: y, width: largura }}
      className="fixed z-50 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl"
    >
      {aberto.itens.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={item.desligado}
          onClick={() => {
            item.aoEscolher();
            aoFechar();
          }}
          className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition disabled:opacity-30 ${
            item.perigo ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {item.icone ? <Icone nome={item.icone} className="mt-px h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
          <span className="min-w-0">
            <span className="block font-medium">{item.rotulo}</span>
            {item.dica ? <span className="block text-[10px] leading-tight text-neutral-400">{item.dica}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
