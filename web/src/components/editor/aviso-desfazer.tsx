"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

// O AVISO COM DESFAZER (docs/planos/linha-do-tempo-spec.md, D1 e D5; pacote P6).
//
// Todo corte, divisão ou exclusão pela barra avisa o que fez, com Desfazer ao lado: é o
// que deixa a pessoa experimentar no celular sem medo ("apaguei a voz?" -- Desfazer).
//
// Fixo, centralizado, logo ACIMA da linha do tempo (`--acima-da-linha`, que o editor mede --
// no celular inclui a fileira de ferramentas): nunca cobre o bloco que acabou de mudar.
// 48px de altura, com um ✓, texto que quebra em vez de cortar, e Desfazer à direita. Some
// em 4s. Aviso novo substitui o anterior.

type Aviso = { id: number; texto: string; desfazer?: () => void; ms: number };

export function useAvisos(): { avisar(texto: string, o?: { desfazer?: () => void; ms?: number }): void; elemento: ReactNode } {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const avisar = useCallback((texto: string, o?: { desfazer?: () => void; ms?: number }) => {
    setAviso((a) => ({ id: (a?.id ?? 0) + 1, texto, desfazer: o?.desfazer, ms: o?.ms ?? 4000 }));
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso((a) => (a?.id === aviso.id ? null : a)), aviso.ms);
    return () => clearTimeout(t);
  }, [aviso]);

  const elemento = aviso ? (
    <div
      key={aviso.id}
      role="status"
      aria-live="polite"
      data-aviso="1"
      className="ed-subir fixed left-1/2 z-50 flex min-h-12 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 items-center gap-2 rounded-2xl bg-[rgb(27_45_82/0.96)] py-1 pr-1 pl-3.5 text-[13.5px] text-[var(--ed-texto,#eef2f8)] shadow-[0_18px_40px_-10px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-xl"
      style={{ bottom: "var(--aviso-base, calc(var(--acima-da-linha, var(--altura-linha, 0px)) + 10px))" }}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(44_177_163/0.18)] text-[#7fd6cb]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 py-2 leading-snug">{aviso.texto}</span>
      {aviso.desfazer && (
        <button
          type="button"
          data-desfazer="1"
          onClick={() => {
            aviso.desfazer?.();
            setAviso(null);
          }}
          className="h-10 shrink-0 rounded-xl px-3.5 text-[13.5px] font-semibold text-[var(--marca-coral,#f06b4f)] transition hover:bg-white/[0.08]"
        >
          Desfazer
        </button>
      )}
    </div>
  ) : null;

  return { avisar, elemento };
}
