"use client";

import { memo, type ReactNode } from "react";
import { tempoCurto, type Medidas } from "./comum";

// A FILEIRA DE CONTROLES (D2): Play, tempo, Desfazer, Refazer, Ajustar, Faixas.
//
// No celular: 16 + 5×44 + 112 = 348px, cabe em 375 com sobra. Todo botão tem 44×44 (a
// bancada mede). No computador a barra da seleção entra entre o tempo e o Ajustar.
//
// `aoTocar` é chamado DIRETO do clique: o iOS só libera o som dentro do gesto, então nada
// de estado intermediário entre o dedo e a prévia de áudio.

type Props = {
  tocando: boolean;
  tempo: number;
  total: number;
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
  aoAlternarFaixas(): void;
};

function Botao({ rotulo, ativo, desligado, onClick, children }: { rotulo: string; ativo?: boolean; desligado?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo}
      disabled={desligado}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg transition disabled:opacity-30 ${ativo ? "bg-marca-coral/20 text-marca-coral" : "text-[var(--letra-editor)] hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

const traco = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Controles(p: Props) {
  return (
    <div className="flex items-center gap-0 px-2" style={{ height: p.medidas.controles }}>
      <Botao rotulo={p.tocando ? "Pausar" : "Tocar"} onClick={() => p.aoTocar(!p.tocando)}>
        {p.tocando ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" /></svg>
        )}
      </Botao>
      <span className="w-[112px] shrink-0 text-center text-[11px] tabular-nums text-[var(--letra-fraca)]" aria-live="off">
        <span className="text-[var(--letra-editor)]">{tempoCurto(p.tempo)}</span>/{tempoCurto(p.total)}
      </span>
      {!p.celular && <div className="flex min-w-0 flex-1 items-center overflow-x-auto">{p.barra}</div>}
      {p.celular && <div className="flex-1" />}
      <Botao rotulo="Desfazer" desligado={!p.podeDesfazer} onClick={p.aoDesfazer}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
      </Botao>
      <Botao rotulo="Refazer" desligado={!p.podeRefazer} onClick={p.aoRefazer}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...traco} aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
      </Botao>
      <Botao rotulo="Ajustar à tela" onClick={p.aoAjustar}>
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
