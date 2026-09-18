"use client";

import { memo } from "react";
import { mesmoRef, type BlocoLinha, type RefItem } from "@/lib/linha-do-tempo";
import type { Medidas } from "./comum";
import { chaveDoBloco } from "./faixa";

// A TRILHA DAS FOTOS (D3): miniatura, número, ★ na capa, ✨ na cena animada, e a tela
// final como bloco próprio que também se toca. As emendas com som ganham um risquinho de
// 2px com um alto-falante pequeno -- são marcas automáticas, não blocos.
//
// Arrastar uma foto da biblioteca pra cá (computador) continua valendo: `aoSoltarFoto`.

type Props = {
  blocos: BlocoLinha[];
  marcas: number[];
  medidas: Medidas;
  selecao: RefItem | null;
  miniaturas: Record<string, string | null>;
  capa: string | null;
  animadas?: Set<string>;
  celular: boolean;
  aoSoltarFoto?(chaveAlvo: string | null, ev: React.DragEvent): void;
};

function TrilhaDeCenas({ blocos, marcas, medidas, selecao, miniaturas, capa, animadas, celular, aoSoltarFoto }: Props) {
  return (
    <div className="relative flex" style={{ height: medidas.cenas }}>
      {!celular && (
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center border-r border-[var(--borda-editor)] bg-[var(--painel-editor)] px-2 text-[11px] font-medium text-[var(--letra-fraca)]"
          style={{ width: medidas.rotulos }}
        >
          Fotos
        </div>
      )}
      <div
        data-alvo="cenas-fundo"
        className="relative flex-1"
        style={{ touchAction: "pan-x" }}
        onDragOver={aoSoltarFoto ? (e) => e.preventDefault() : undefined}
        onDrop={aoSoltarFoto ? (e) => aoSoltarFoto(null, e) : undefined}
      >
        {blocos.map((b, i) => {
          const chave = chaveDoBloco("cenas", i);
          const selecionado = mesmoRef(b.ref, selecao);
          const chaveCena = b.ref.faixa === "cenas" ? b.ref.chave : null;
          const mini = chaveCena ? miniaturas[chaveCena] : null;
          const final = b.ref.faixa === "telaFinal";
          return (
            <div
              key={chave}
              data-alvo="bloco"
              data-chave={chave}
              data-selecionado={selecionado ? "1" : undefined}
              data-largura={0}
              className={`absolute top-[3px] bottom-[3px] overflow-hidden rounded-md border ${final ? "border-dashed border-[var(--letra-fraca)] bg-[#0d1e3a]" : "border-[#081227] bg-[#1a3159]"}`}
              style={{
                left: `calc(var(--pxs) * ${b.de})`,
                width: `calc(var(--pxs) * ${Math.max(0, b.ate - b.de)} - 2px)`,
                backgroundImage: mini ? `url("${mini}")` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                touchAction: selecionado ? "none" : "pan-x",
                outline: selecionado ? "2px solid var(--marca-coral)" : undefined,
                outlineOffset: selecionado ? 1 : undefined,
                zIndex: selecionado ? 3 : 1,
              }}
              onDragOver={aoSoltarFoto && chaveCena ? (e) => e.preventDefault() : undefined}
              onDrop={aoSoltarFoto && chaveCena ? (e) => { e.stopPropagation(); aoSoltarFoto(chaveCena, e); } : undefined}
            >
              <div className="pointer-events-none flex h-full items-start gap-1 bg-gradient-to-b from-black/45 to-transparent p-1 text-[10px] font-bold leading-none text-white">
                {final ? (
                  <span className="text-[var(--letra-fraca)]">Tela final</span>
                ) : (
                  <>
                    <span>{i + 1}</span>
                    {chaveCena && chaveCena === capa && <span aria-label="Capa">★</span>}
                    {chaveCena && animadas?.has(chaveCena) && <span aria-label="Cena animada">✨</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {marcas.map((t, i) => (
          <div key={i} className="pointer-events-none absolute top-0 bottom-0 z-[4]" style={{ left: `calc(var(--pxs) * ${t} - 1px)` }} aria-hidden="true">
            <div className="h-full w-[2px] bg-[var(--letra-editor)]/70" />
            <svg viewBox="0 0 24 24" className="absolute -left-[5px] -top-[1px] h-3 w-3 text-[var(--letra-editor)]" fill="currentColor">
              <path d="M11 5 6 9H3v6h3l5 4z" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(TrilhaDeCenas);
