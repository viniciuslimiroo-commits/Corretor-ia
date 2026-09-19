"use client";

import { Icone } from "@/components/ui";

// AS FERRAMENTAS: uma coluna de ícones à esquerda no computador (a altura inteira da tela,
// ao lado do painel e da linha do tempo) e uma fileira embaixo no celular (como o CapCut).
//
// Tocar numa ferramenta abre o painel dela; tocar de novo na que está aberta FECHA o
// painel -- no computador o palco ganha a largura, no celular a folha desce.

export type Ferramenta = { id: string; rotulo: string; icone: string; dica: string };

type Props = {
  ferramentas: readonly Ferramenta[];
  ativa: string | null;
  celular: boolean;
  aoEscolher(id: string): void;
};

export default function TrilhoFerramentas({ ferramentas, ativa, celular, aoEscolher }: Props) {
  if (celular) {
    return (
      <nav aria-label="Ferramentas" className="ed-rolagem flex h-[68px] shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-[var(--ed-linha)] bg-[var(--ed-base)] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ferramentas.map((f) => {
          const ok = ativa === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => aoEscolher(f.id)}
              aria-pressed={ok}
              title={f.dica}
              className={`flex min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-medium transition ${ok ? "text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto-2)] active:bg-[var(--ed-elevado)]"}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-lg transition ${ok ? "bg-[var(--ed-acento-suave)]" : ""}`}>
                <Icone nome={f.icone} className="h-[22px] w-[22px]" />
              </span>
              {f.rotulo}
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Ferramentas" className="ed-rolagem flex w-[80px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[var(--ed-linha)] bg-[var(--ed-base)] py-2.5">
      {ferramentas.map((f) => {
        const ok = ativa === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => aoEscolher(f.id)}
            aria-pressed={ok}
            title={ok ? `${f.dica} · clique de novo pra fechar o painel` : f.dica}
            className={`group flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition ${
              ok ? "bg-[var(--ed-acento-suave)] text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto-2)] hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]"
            }`}
          >
            <Icone nome={f.icone} className="h-[22px] w-[22px] transition group-hover:scale-105" />
            <span className="max-w-full truncate px-1">{f.rotulo}</span>
          </button>
        );
      })}
    </nav>
  );
}
