"use client";

import { memo } from "react";
import { Icone } from "@/components/ui";
import { mesmoRef, type RefItem } from "@/lib/linha-do-tempo";

// A LISTA DA FOTO (docs/planos/linha-do-tempo-spec.md, D1 e D4; pacote P6).
//
// Na linha do tempo, os textos (e os adesivos) de uma foto são UM bloco com um número em
// cima: três textos de 1s de largura cada não caberiam na faixa nem no dedo. Tocar no
// bloco abre esta lista, logo acima da linha do tempo: uma linha de 44px por item, no
// máximo três à vista (164px com o cabeçalho) e o resto rolando por dentro.

export type ItemDaLista = { ref: RefItem; rotulo: string; icone: string };

type Props = {
  titulo: string;
  itens: ItemDaLista[];
  selecao: RefItem | null;
  aoEscolher(ref: RefItem): void;
  aoFechar(): void;
};

function ListaDaFoto({ titulo, itens, selecao, aoEscolher, aoFechar }: Props) {
  return (
    <div
      data-lista="1"
      className="fixed left-1/2 z-40 w-[calc(100%-32px)] max-w-[343px] -translate-x-1/2 overflow-hidden rounded-xl bg-[#0d1e3a] text-[var(--letra-editor,#e9eef7)] shadow-[0_6px_24px_rgba(0,0,0,.45)] ring-1 ring-white/10"
      style={{ bottom: "calc(var(--altura-linha, 0px) + 8px)" }}
    >
      <div className="flex h-8 items-center justify-between pl-3 text-[11px] font-semibold text-[var(--letra-fraca,#94a6c4)]">
        <span className="truncate">{titulo}</span>
        <button type="button" onClick={aoFechar} aria-label="Fechar a lista" className="grid h-8 w-11 place-items-center">
          <Icone nome="fechar" className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[132px] overflow-y-auto">
        {itens.map((it, i) => {
          const sel = mesmoRef(it.ref, selecao);
          return (
            <li key={i}>
              <button
                type="button"
                data-item-lista="1"
                onClick={() => aoEscolher(it.ref)}
                className={`flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] ${sel ? "bg-[rgb(240_107_79/.16)] text-[var(--marca-coral,#f06b4f)]" : ""}`}
              >
                <Icone nome={it.icone} className="h-4 w-4 shrink-0" />
                <span className="truncate">{it.rotulo}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(ListaDaFoto);
