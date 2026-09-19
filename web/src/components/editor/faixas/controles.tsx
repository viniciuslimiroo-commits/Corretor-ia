"use client";

import { memo, type CSSProperties, type ReactNode } from "react";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";
import { useTempoAoVivo } from "@/components/editor/usar-tempo-ao-vivo";
import { posicaoDoZoom, tempoCurto, zoomDaPosicao, type Medidas } from "./comum";

// A FILEIRA DE CONTROLES da linha do tempo (D2, revista em 2026-09).
//
// Computador: Play grande e o tempo à esquerda; no meio, a barra do que está selecionado
// (ou uma dica, quando nada está); à direita, Desfazer/Refazer e o ZOOM -- um controle
// deslizante com − e +, e o Ajustar (a linha inteira na tela). Antes o zoom só existia na
// pinça e no Ctrl+roda, que quase ninguém descobre.
// Celular: Play, tempo, Desfazer, Refazer, Ajustar e Faixas, todos com 44×44.
//
// `aoTocar` é chamado DIRETO do clique: o iOS só libera o som dentro do gesto.

type Props = {
  tocando: boolean;
  tempo: number;
  /** O relógio da prévia: tocando, o tempo da barra anda por ele (o editor não redesenha). */
  relogio?: RelogioDaPrevia;
  total: number;
  zoom: number;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  todasAbertas: boolean;
  medidas: Medidas;
  celular: boolean;
  barra?: ReactNode;
  aoTocar(tocar: boolean): void;
  aoDesfazer(): void;
  aoRefazer(): void;
  aoAjustar(): void;
  aoZoom(px: number): void;
  aoAlternarFaixas(): void;
};

function Botao({ rotulo, dica, ativo, desligado, onClick, children }: { rotulo: string; dica?: string; ativo?: boolean; desligado?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={dica ?? rotulo}
      aria-pressed={ativo}
      disabled={desligado}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition disabled:opacity-30 md:h-10 md:w-10 ${ativo ? "bg-[var(--ed-acento-suave)] text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto-2)] hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]"}`}
    >
      {children}
    </button>
  );
}

const traco = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Controles(p: Props) {
  const tempo = useTempoAoVivo(p.relogio, p.tempo, p.tocando);
  const posZoom = posicaoDoZoom(p.zoom);
  return (
    <div className="flex items-center gap-1 px-2 md:gap-1.5 md:px-3" style={{ height: p.medidas.controles }}>
      <button
        type="button"
        aria-label={p.tocando ? "Pausar" : "Tocar"}
        title={p.tocando ? "Pausar (espaço)" : "Tocar (espaço)"}
        onClick={() => p.aoTocar(!p.tocando)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ffffff] text-[#0a1529] shadow-[0_4px_14px_-4px_rgb(255_255_255/0.35)] transition hover:scale-105 active:scale-95 md:h-10 md:w-10"
      >
        {p.tocando ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" /></svg>
        )}
      </button>
      <span className="w-[108px] shrink-0 pl-1.5 text-[12.5px] tabular-nums text-[var(--ed-texto-3)] md:w-[118px] md:text-[13px]" aria-live="off" data-tempo-linha="1">
        <span className="font-semibold text-[var(--ed-texto)]">{tempoCurto(tempo)}</span> / {tempoCurto(p.total)}
      </span>
      {!p.celular && (
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto border-l border-[var(--ed-linha)] pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {p.barra ?? <span className="truncate px-2 text-[12.5px] text-[var(--ed-texto-3)]">Clique num bloco pra editar · arraste pra mover · puxe a borda pra cortar</span>}
        </div>
      )}
      {p.celular && <div className="flex-1" />}
      <Botao rotulo="Desfazer" dica="Desfazer (Ctrl+Z)" desligado={!p.podeDesfazer} onClick={p.aoDesfazer}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
      </Botao>
      <Botao rotulo="Refazer" dica="Refazer (Ctrl+Shift+Z)" desligado={!p.podeRefazer} onClick={p.aoRefazer}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
      </Botao>
      {!p.celular && (
        <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-[var(--ed-linha)] pl-2" role="group" aria-label="Zoom da linha do tempo">
          <Botao rotulo="Afastar" onClick={() => p.aoZoom(zoomDaPosicao(posZoom - 12))}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...traco} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></svg>
          </Botao>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={posZoom}
            onChange={(e) => p.aoZoom(zoomDaPosicao(Number(e.target.value)))}
            aria-label="Zoom da linha do tempo"
            title="Zoom da linha do tempo"
            className="w-24 lg:w-32"
            style={{ "--pct": `${posZoom}%` } as CSSProperties}
          />
          <Botao rotulo="Aproximar" onClick={() => p.aoZoom(zoomDaPosicao(posZoom + 12))}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...traco} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M20 20l-4-4" /></svg>
          </Botao>
        </div>
      )}
      <Botao rotulo="Ajustar à tela" dica="Ajustar à tela: a linha inteira à vista" onClick={p.aoAjustar}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>
      </Botao>
      {p.celular && (
        <Botao rotulo="Todas as faixas" ativo={p.todasAbertas} onClick={p.aoAlternarFaixas}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </Botao>
      )}
    </div>
  );
}

export default memo(Controles);
