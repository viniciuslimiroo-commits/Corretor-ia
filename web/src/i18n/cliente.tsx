"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { COOKIE_IDIOMA, IDIOMAS, langHtml, type Idioma } from "./idiomas";
import { traduzir } from "./textos";

// O idioma no navegador: um contexto, um hook e o seletor.
//
// O valor inicial vem do servidor (layout.tsx lê o cookie e passa por prop). Não se lê
// `document.cookie` no primeiro render de propósito: o servidor renderizaria em
// português e o cliente em espanhol, e o React chamaria isso de hydration mismatch --
// que aparece pro usuário como a tela piscando de um idioma pro outro.
//
// Trocar de idioma escreve o cookie e muda o estado na hora, sem recarregar. O `<html
// lang>` é atualizado à mão pelo mesmo motivo: é o que o leitor de tela e o corretor
// ortográfico do navegador leem.

type Contexto = {
  idioma: Idioma;
  t: (chave: string, vars?: Record<string, string | number>) => string;
  definir: (novo: Idioma) => void;
};

const ContextoIdioma = createContext<Contexto | null>(null);

export function IdiomaProvider({ inicial, children }: { inicial: Idioma; children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(inicial);

  const definir = useCallback((novo: Idioma) => {
    setIdioma(novo);
    try {
      // Um ano; `SameSite=Lax` porque o cookie nunca precisa viajar em requisição de
      // terceiro. Sem `Secure` no localhost, senão o navegador descarta.
      const seguro = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${COOKIE_IDIOMA}=${novo}; Path=/; Max-Age=31536000; SameSite=Lax${seguro}`;
      document.documentElement.lang = langHtml(novo);
    } catch {
      /* navegador sem cookie: o idioma vale até fechar a aba, e está bom */
    }
  }, []);

  const valor = useMemo<Contexto>(
    () => ({ idioma, t: (chave, vars) => traduzir(idioma, chave, vars), definir }),
    [idioma, definir]
  );

  return <ContextoIdioma.Provider value={valor}>{children}</ContextoIdioma.Provider>;
}

/** O idioma atual e a função de tradução. Fora do provider, cai em português. */
export function useIdioma(): Contexto {
  const ctx = useContext(ContextoIdioma);
  if (ctx) return ctx;
  return { idioma: "pt", t: (chave, vars) => traduzir("pt", chave, vars), definir: () => {} };
}

/**
 * PT · ES · EN. Três botões e nada mais: bandeira confunde (espanhol não é da Espanha,
 * inglês não é dos EUA) e um select esconde a opção atrás de um clique.
 */
export function SeletorIdioma({ className = "", escuro = false }: { className?: string; escuro?: boolean }) {
  const { idioma, definir, t } = useIdioma();
  return (
    <div className={"inline-flex items-center gap-0.5 rounded-lg border p-0.5 " + (escuro ? "border-white/20" : "border-neutral-200") + " " + className} role="group" aria-label={t("idioma.rotulo")}>
      {IDIOMAS.map((i) => {
        const ativo = i.id === idioma;
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => definir(i.id)}
            aria-pressed={ativo}
            title={i.rotulo}
            className={
              "rounded-md px-2 py-1 text-[11px] font-semibold tracking-wider transition " +
              (ativo
                ? escuro
                  ? "bg-white/20 text-white"
                  : "bg-marca-indigo text-white"
                : escuro
                  ? "text-white/70 hover:text-white"
                  : "text-neutral-500 hover:text-marca-indigo")
            }
          >
            {i.curto}
          </button>
        );
      })}
    </div>
  );
}
