"use client";

import { useState } from "react";
import { CATEGORIAS_FILTRO, CONTROLES_AJUSTE, MODELOS_FILTRO, type Ajustes, type CategoriaFiltro } from "@/lib/filtros";
import { BotaoEd, Deslizante, Pilula, Segmentado } from "@/components/editor/ui-editor";

// A ABA FILTROS: duas gavetas, como em qualquer editor de foto.
//
//   Filtros -- o resultado com nome. O cartão é uma FOTO GENÉRICA já pronta
//              (public/filtros, scripts/gerar-miniaturas-filtros.ts, mesma conta de cor
//              do vídeo): desenhar vinte e um cartões na foto da cena deixava todos pretos
//              por um ou dois segundos. A foto da cena com o filtro aparece no palco.
//   Ajustes -- os controles soltos, pra quem sabe o que quer mexer.
//
// E um interruptor em cima: vale pro vídeo inteiro, ou só pra esta cena. É a mesma regra
// da transição: o normal é o vídeo ter UMA cor; a cena só sai da linha quando a pessoa
// quer (a fachada em preto e branco no meio de um vídeo claro).

export type EscopoCor = "video" | "cena";

export default function PainelFiltros({
  escopo,
  temCena,
  cenaTemCorPropria,
  filtro,
  intensidade,
  ajustes,
  desligado,
  aoEscopo,
  aoFiltro,
  aoIntensidade,
  aoAjuste,
  aoZerar,
  aoVoltarProVideo,
}: {
  escopo: EscopoCor;
  temCena: boolean;
  /** A cena aberta já saiu da linha do vídeo (tem filtro ou ajustes próprios). */
  cenaTemCorPropria: boolean;
  /** O que vale no escopo escolhido. */
  filtro: string;
  intensidade: number;
  ajustes: Ajustes;
  desligado: boolean;
  aoEscopo: (e: EscopoCor) => void;
  aoFiltro: (id: string) => void;
  aoIntensidade: (v: number) => void;
  aoAjuste: (k: keyof Ajustes, v: number) => void;
  aoZerar: () => void;
  aoVoltarProVideo: () => void;
}) {
  const [gaveta, setGaveta] = useState<"filtros" | "ajustes">("filtros");
  const [categoria, setCategoria] = useState<CategoriaFiltro | "todos">("todos");

  const lista = categoria === "todos" ? MODELOS_FILTRO : MODELOS_FILTRO.filter((f) => f.categoria === categoria || f.id === "natural");
  const mexidos = CONTROLES_AJUSTE.filter((c) => ajustes[c.id]).length;

  return (
    <div>
      {/* ---------- vale pra quê ---------- */}
      <Segmentado
        rotulo="Vale pra quê"
        className="mb-3"
        opcoes={[
          { id: "video", rotulo: "Vídeo inteiro" },
          { id: "cena", rotulo: temCena ? "Só esta cena" : "Só esta cena (escolha uma)" },
        ]}
        valor={escopo}
        aoMudar={(e) => (e === "cena" && !temCena ? undefined : aoEscopo(e as EscopoCor))}
      />
      {escopo === "cena" && cenaTemCorPropria && (
        <BotaoEd variante="fantasma" tamanho="p" onClick={aoVoltarProVideo} className="mb-3 -ml-2">
          Tirar a cor própria desta cena
        </BotaoEd>
      )}

      {/* ---------- gavetas ---------- */}
      <Segmentado
        rotulo="Filtros ou ajustes"
        className="mb-4"
        opcoes={[
          { id: "filtros", rotulo: "Filtros" },
          { id: "ajustes", rotulo: `Ajustes${mexidos ? ` · ${mexidos}` : ""}` },
        ]}
        valor={gaveta}
        aoMudar={(v) => setGaveta(v as typeof gaveta)}
      />

      {gaveta === "filtros" ? (
        <>
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Pilula ativo={categoria === "todos"} onClick={() => setCategoria("todos")}>
              Todos
            </Pilula>
            {CATEGORIAS_FILTRO.map((c) => (
              <Pilula key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.rotulo}
              </Pilula>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {lista.map((f) => {
              const escolhido = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => aoFiltro(f.id)}
                  disabled={desligado}
                  title={f.dica}
                  className={
                    "overflow-hidden rounded-xl text-left transition active:scale-[0.98] disabled:opacity-40 " +
                    (escolhido ? "bg-[var(--ed-acento-suave)] ring-2 ring-[var(--ed-acento)]" : "bg-[var(--ed-elevado)] ring-1 ring-transparent hover:ring-[var(--ed-linha-forte)]")
                  }
                >
                  <span className="block aspect-[4/5] overflow-hidden bg-[#0b1426]">
                    {/* O filtro INTEIRO, sem os ajustes: é a cara do filtro que se escolhe. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/filtros/${f.id}.jpg`} alt="" className="h-full w-full object-cover" draggable={false} />
                  </span>
                  <span className={"block truncate px-2 py-1.5 text-[12px] " + (escolhido ? "font-semibold text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto-2)]")}>{f.rotulo}</span>
                </button>
              );
            })}
          </div>

          {filtro !== "natural" && (
            <div className="mt-4 rounded-2xl bg-[var(--ed-elevado)] p-4">
              <Deslizante rotulo="Intensidade" valor={intensidade} min={0} max={1} passo={0.05} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={aoIntensidade} disabled={desligado} />
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-4">
          {CONTROLES_AJUSTE.map((c) => {
            const v = ajustes[c.id] ?? 0;
            return (
              <label key={c.id} className="block text-[12.5px] text-[var(--ed-texto-2)]" title={c.dica}>
                <span className="flex items-baseline justify-between">
                  <span>{c.rotulo}</span>
                  <span className="tabular-nums font-medium text-[var(--ed-texto)]">{v > 0 && c.min < 0 ? "+" : ""}{Math.round(v * 100)}</span>
                </span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={0.02}
                  value={v}
                  onChange={(e) => aoAjuste(c.id, Number(e.target.value))}
                  // Dois toques voltam o controle pro zero: arrastar exatamente até o meio
                  // no celular é quase impossível.
                  onDoubleClick={() => aoAjuste(c.id, 0)}
                  disabled={desligado}
                  className="mt-1 w-full"
                  style={{ "--pct": `${((v - c.min) / Math.max(1e-6, c.max - c.min)) * 100}%` } as React.CSSProperties}
                />
              </label>
            );
          })}
          <BotaoEd variante="fantasma" tamanho="p" onClick={aoZerar} disabled={desligado || mexidos === 0} className="-ml-2 justify-self-start">
            Zerar os ajustes
          </BotaoEd>
        </div>
      )}
    </div>
  );
}
