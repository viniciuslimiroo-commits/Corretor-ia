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

export default function MenuContexto({ aberto, aoFechar, celular = false }: { aberto: Aberto | null; aoFechar: () => void; celular?: boolean }) {
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (ev: Event) => {
      if (ev.type === "keydown" && (ev as KeyboardEvent).key !== "Escape") return;
      if (ev.type === "pointerdown" && caixa.current?.contains(ev.target as Node)) return;
      aoFechar();
    };
    // `scroll` na captura: o menu fica preso à tela, então rolar a página deixaria ele
    // apontando pro lugar errado. (Na folha do celular, rolar a própria folha não fecha.)
    const aoRolar = (ev: Event) => {
      if (caixa.current?.contains(ev.target as Node)) return;
      aoFechar();
    };
    document.addEventListener("pointerdown", foraOuEsc);
    document.addEventListener("keydown", foraOuEsc);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", foraOuEsc);
    return () => {
      document.removeEventListener("pointerdown", foraOuEsc);
      document.removeEventListener("keydown", foraOuEsc);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", foraOuEsc);
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const linha = (item: ItemMenu, i: number) => {
    if (item.divisor && !item.rotulo) return <div key={i} className="my-1 h-px bg-[var(--ed-linha,rgb(255_255_255/0.1))]" />;
    return (
      <div key={i}>
        {item.divisor && <div className="my-1 h-px bg-[var(--ed-linha,rgb(255_255_255/0.1))]" />}
        <button
          type="button"
          role="menuitem"
          disabled={item.desligado}
          onClick={() => {
            item.aoEscolher?.();
            aoFechar();
          }}
          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition disabled:opacity-35 ${celular ? "min-h-[52px] py-2 text-[15px]" : "min-h-10 py-1.5 text-[13.5px]"} ${
            item.perigo ? "text-[#ff9480] hover:bg-[rgb(255_110_90/0.14)]" : "text-[var(--ed-texto,#eef2f8)] hover:bg-white/[0.07]"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            {item.icone ? (
              <Icone nome={item.icone} className={`shrink-0 ${celular ? "h-5 w-5" : "h-[18px] w-[18px]"} ${item.perigo ? "text-[#ff9480]" : "text-[var(--ed-texto-2,#a9b7d0)]"}`} />
            ) : (
              <span className={`shrink-0 ${celular ? "w-5" : "w-[18px]"}`} />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.rotulo}</span>
              {item.dica ? <span className={`block leading-snug text-[var(--ed-texto-3,#7687a8)] ${celular ? "text-[12.5px]" : "text-[11.5px]"}`}>{item.dica}</span> : null}
            </span>
          </div>
          {item.atalho && <span className="shrink-0 font-mono text-[11px] tracking-wider text-[var(--ed-texto-3,#7687a8)]">{item.atalho}</span>}
        </button>
      </div>
    );
  };

  // No celular, o menu é uma FOLHA DE AÇÕES que sobe de baixo: linhas de 52px, o polegar
  // alcança todas, e "Cancelar" no pé. Um menu flutuante perto do dedo ficava embaixo dele.
  if (celular) {
    return (
      <div className="fixed inset-0 z-50 bg-black/45" role="presentation">
        <div ref={caixa} role="menu" className="ed-folha absolute inset-x-0 bottom-0 max-h-[78svh] overflow-y-auto overscroll-contain rounded-t-[22px] bg-[var(--ed-painel,#0e1b33)] px-2 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
          <div className="mb-1 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
          </div>
          {aberto.itens.map(linha)}
          <div className="my-1 h-px bg-white/10" />
          <button type="button" onClick={aoFechar} className="min-h-[52px] w-full rounded-xl text-[15px] font-semibold text-[var(--ed-texto,#eef2f8)] hover:bg-white/[0.07]">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // Encosta na borda em vez de vazar. 248px de largura e ~42px por linha é a medida real.
  // O menu da cena de clipe tem ~20 itens: sem teto, passava da altura da tela e "Capa" e
  // "Apagar" ficavam fora. Com teto, ele rola por dentro.
  const largura = 248;
  const teto = Math.min(420, (typeof window !== "undefined" ? window.innerHeight : 800) - 16);
  const altura = Math.min(aberto.itens.length * 42 + 16, teto);
  const x = Math.max(8, Math.min(aberto.x, (typeof window !== "undefined" ? window.innerWidth : 400) - largura - 8));
  const y = Math.max(8, Math.min(aberto.y, (typeof window !== "undefined" ? window.innerHeight : 800) - altura - 8));

  return (
    <div
      ref={caixa}
      role="menu"
      style={{ left: x, top: y, width: largura, maxHeight: teto }}
      className="ed-surgir fixed z-50 overflow-y-auto overscroll-contain rounded-2xl bg-[rgb(20_35_65/0.96)] p-1.5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.75)] ring-1 ring-white/10 backdrop-blur-xl"
    >
      {aberto.itens.map(linha)}
    </div>
  );
}
