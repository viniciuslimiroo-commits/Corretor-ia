"use client";

import { memo, type ReactNode } from "react";
import { Icone } from "@/components/ui";
import type { AcaoBarra } from "@/lib/linha-do-tempo";

// A BARRA DA SELEÇÃO (docs/planos/linha-do-tempo-spec.md, D5; pacote P6).
//
// No celular ela toma o lugar da fileira de abas enquanto há algo selecionado: 44px, o ✕
// fixo à esquerda (tira a seleção) e os botões do tipo selecionado rolando de lado quando
// não cabem. Cada botão tem 44 de altura e 56 de largura mínima -- é dedo, não mouse.
//
// Botão apagado NÃO é `disabled`: continua tocável e diz o porquê (`aoMotivo`). "Leve o
// cursor para dentro da música" ensina o gesto; um botão cinza calado só frustra.
//
// Sub-barra (Volume, Fade, Trecho da música...) troca a fileira de botões inteira, com o
// ✕ ainda no lugar. Campo de texto lá dentro usa 16px: abaixo disso o iOS dá zoom na tela
// ao focar e a pessoa perde o palco.

type Props = {
  titulo: string;
  /** Texto e adesivo presos à foto: o elo aparece no título. */
  preso?: boolean;
  acoes: AcaoBarra[];
  aoAcao(id: string): void;
  aoFechar(): void;
  /** Toque num botão apagado: o motivo, pra mostrar num aviso. */
  aoMotivo?(texto: string): void;
  subBarra?: ReactNode;
  /** Computador: sem o ✕ e sem o título (a barra entra na fileira de controles). */
  compacta?: boolean;
};

function BarraDaSelecao({ titulo, preso, acoes, aoAcao, aoFechar, aoMotivo, subBarra, compacta }: Props) {
  return (
    <div data-area="barra" className="flex h-11 w-full min-w-0 items-stretch" role="toolbar" aria-label={`Ações: ${titulo}`}>
      {!compacta && (
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Tirar a seleção"
          title="Tirar a seleção"
          data-fechar="1"
          className="grid w-11 shrink-0 place-items-center border-r border-[var(--borda-editor)] text-[var(--letra-editor)]"
        >
          <Icone nome="fechar" className="h-5 w-5" />
        </button>
      )}
      <div data-rolagem-barra="1" className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {subBarra ? (
          <div data-sub-barra="1" className="flex min-w-0 flex-1 items-center gap-2 px-2 [&_input:not([type=range])]:text-base [&_select]:text-base [&_textarea]:text-base">
            {subBarra}
          </div>
        ) : (
          <>
            {!compacta && (
              <div className="flex shrink-0 items-center gap-1 pl-2 pr-1 text-[11px] font-semibold text-[var(--letra-fraca)]">
                {preso && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-label="Preso à foto">
                    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                  </svg>
                )}
                <span className="max-w-[9rem] truncate">{titulo}</span>
              </div>
            )}
            {acoes.map((a) => (
              <button
                key={a.id}
                type="button"
                data-acao={a.id}
                aria-disabled={!a.ativo || undefined}
                title={a.motivo ?? a.rotulo}
                onClick={() => (a.ativo ? aoAcao(a.id) : a.motivo && aoMotivo?.(a.motivo))}
                className={`flex min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5 text-[10px] leading-none transition ${
                  a.ativo ? (a.perigo ? "text-[#ff9a84]" : "text-[var(--letra-editor)]") : "text-[var(--letra-fraca)] opacity-45"
                }`}
              >
                <Icone nome={a.icone} className="h-5 w-5" />
                <span className="whitespace-nowrap">{a.rotulo}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(BarraDaSelecao);

/** Controle deslizante da sub-barra, com a área de toque de 44px. */
export function DeslizanteDaSubBarra({ rotulo, valor, min, max, passo, formatar, aoMudar }: { rotulo: string; valor: number; min: number; max: number; passo: number; formatar(v: number): string; aoMudar(v: number): void }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-[var(--letra-fraca)]">
      <span className="shrink-0">{rotulo}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="h-11 min-w-0 flex-1 accent-[var(--marca-coral)]"
      />
      <span className="w-10 shrink-0 text-right tabular-nums text-[var(--letra-editor)]">{formatar(valor)}</span>
    </label>
  );
}
