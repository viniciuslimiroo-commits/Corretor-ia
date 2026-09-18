"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

// O AVISO COM DESFAZER (docs/planos/linha-do-tempo-spec.md, D1 e D5; pacote P6).
//
// Todo corte, divisão ou exclusão pela barra avisa o que fez, com Desfazer ao lado: é o
// que deixa a pessoa experimentar no celular sem medo ("apaguei a voz?" -- Desfazer).
//
// Fixo, centralizado, 8px ACIMA da linha do tempo (`--altura-linha`, que o editor mede):
// nunca cobre o bloco que acabou de mudar. 44px de altura, no máximo 343 de largura (375
// menos 16 de cada lado), some em 4s. Aviso novo substitui o anterior.

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
      className="fixed left-1/2 z-50 flex h-11 w-[calc(100%-32px)] max-w-[343px] -translate-x-1/2 items-center gap-1 rounded-xl bg-[#0d1e3a] pl-3 text-[13px] text-[var(--letra-editor,#e9eef7)] shadow-[0_6px_24px_rgba(0,0,0,.45)] ring-1 ring-white/10"
      style={{ bottom: "calc(var(--altura-linha, 0px) + 8px)" }}
    >
      <span className="min-w-0 flex-1 truncate">{aviso.texto}</span>
      {aviso.desfazer && (
        <button
          type="button"
          data-desfazer="1"
          onClick={() => {
            aviso.desfazer?.();
            setAviso(null);
          }}
          className="h-11 min-w-11 shrink-0 rounded-r-xl px-3 text-[13px] font-semibold text-[var(--marca-coral,#f06b4f)]"
        >
          Desfazer
        </button>
      )}
    </div>
  ) : null;

  return { avisar, elemento };
}
