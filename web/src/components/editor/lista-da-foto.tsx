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
      className="ed-subir fixed left-1/2 z-40 w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 overflow-hidden rounded-2xl bg-[rgb(20_35_65/0.97)] p-1.5 text-[var(--ed-texto,#eef2f8)] shadow-[0_24px_60px_-12px_rgb(0_0_0/0.75)] ring-1 ring-white/10 backdrop-blur-xl"
      style={{ bottom: "calc(var(--acima-da-linha, var(--altura-linha, 0px)) + 10px)" }}
    >
      <div className="flex h-10 items-center justify-between pl-2.5 text-[12px] font-semibold text-[var(--ed-texto-2,#a9b7d0)]">
        <span className="truncate">{titulo}</span>
        <button type="button" onClick={aoFechar} aria-label="Fechar a lista" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/[0.08]">
          <Icone nome="fechar" className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[176px] overflow-y-auto">
        {itens.map((it, i) => {
          const sel = mesmoRef(it.ref, selecao);
          return (
            <li key={i}>
              <button
                type="button"
                data-item-lista="1"
                onClick={() => aoEscolher(it.ref)}
                className={`flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] transition ${sel ? "bg-[rgb(240_107_79/.16)] text-[var(--marca-coral,#f06b4f)]" : "hover:bg-white/[0.07]"}`}
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
