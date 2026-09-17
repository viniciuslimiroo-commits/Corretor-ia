"use client";

import { useState } from "react";
import { CATEGORIAS_FILTRO, CONTROLES_AJUSTE, MODELOS_FILTRO, type Ajustes, type CategoriaFiltro } from "@/lib/filtros";
import { Chip } from "@/components/ui";

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
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
        {(["video", "cena"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => aoEscopo(e)}
            disabled={e === "cena" && !temCena}
            className={
              "rounded-lg px-2 py-1.5 text-xs font-medium transition disabled:opacity-30 " +
              (escopo === e ? "bg-white text-marca-indigo shadow-sm" : "text-neutral-500")
            }
          >
            {e === "video" ? "Vídeo inteiro" : "Só esta cena"}
          </button>
        ))}
      </div>
      {escopo === "cena" && cenaTemCorPropria && (
        <button type="button" onClick={aoVoltarProVideo} className="mb-3 text-[11px] text-neutral-500 underline">
          Tirar a cor própria desta cena (volta a seguir o vídeo)
        </button>
      )}

      {/* ---------- gavetas ---------- */}
      <div className="mb-3 flex gap-4 border-b border-neutral-200 text-sm">
        {(["filtros", "ajustes"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGaveta(g)}
            className={"-mb-px border-b-2 pb-1.5 font-medium transition " + (gaveta === g ? "border-marca-coral text-neutral-800" : "border-transparent text-neutral-500")}
          >
            {g === "filtros" ? "Filtros" : `Ajustes${mexidos ? ` · ${mexidos}` : ""}`}
          </button>
        ))}
      </div>

      {gaveta === "filtros" ? (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            <Chip ativo={categoria === "todos"} onClick={() => setCategoria("todos")}>
              Todos
            </Chip>
            {CATEGORIAS_FILTRO.map((c) => (
              <Chip key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.rotulo}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
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
                    "overflow-hidden rounded-lg border-2 text-left transition disabled:opacity-40 " +
                    (escolhido ? "border-marca-coral" : "border-transparent hover:border-neutral-400")
                  }
                >
                  <span className="block aspect-[4/5] overflow-hidden bg-neutral-800">
                    {/* O filtro INTEIRO, sem os ajustes: é a cara do filtro que se escolhe. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/filtros/${f.id}.jpg`} alt="" className="h-full w-full object-cover" draggable={false} />
                  </span>
                  <span className={"block truncate px-1 py-1 text-[11px] " + (escolhido ? "font-medium text-marca-indigo" : "text-neutral-600")}>{f.rotulo}</span>
                </button>
              );
            })}
          </div>

          {filtro !== "natural" && (
            <label className="mt-3 block text-xs text-neutral-600">
              Intensidade · {Math.round(intensidade * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={intensidade}
                onChange={(e) => aoIntensidade(Number(e.target.value))}
                disabled={desligado}
                className="mt-1 w-full accent-marca-coral"
              />
            </label>
          )}
        </>
      ) : (
        <div className="grid gap-3">
          {CONTROLES_AJUSTE.map((c) => {
            const v = ajustes[c.id] ?? 0;
            return (
              <label key={c.id} className="block text-xs text-neutral-600" title={c.dica}>
                <span className="flex items-baseline justify-between">
                  <span>{c.rotulo}</span>
                  <span className="tabular-nums text-neutral-400">{v > 0 && c.min < 0 ? "+" : ""}{Math.round(v * 100)}</span>
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
                  className="mt-1 w-full accent-marca-coral"
                />
              </label>
            );
          })}
          <button type="button" onClick={aoZerar} disabled={desligado || mexidos === 0} className="justify-self-start text-xs text-neutral-500 underline disabled:opacity-30">
            Zerar os ajustes
          </button>
        </div>
      )}
    </div>
  );
}
