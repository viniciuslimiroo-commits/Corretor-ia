"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
 * Bandeira desenhada, não emoji.
 *
 * Emoji de bandeira (🇧🇷) é um par de letras que a FONTE transforma em desenho -- e o
 * Windows não tem esse desenho em nenhuma fonte do sistema: o Chrome no Windows mostra
 * "BR" numa caixinha. Metade dos corretores está no Windows, então a bandeira tem que ser
 * SVG nosso. Simplificadas de propósito: a 20px, o brasão da Espanha e as 50 estrelas dos
 * EUA viram borrão -- o que identifica são as cores e as formas grandes.
 */
export function Bandeira({ id, className = "h-3.5 w-5" }: { id: Idioma; className?: string }) {
  const comum = { viewBox: "0 0 24 16", className, "aria-hidden": true as const, xmlns: "http://www.w3.org/2000/svg" };
  if (id === "pt") {
    return (
      <svg {...comum}>
        <rect width="24" height="16" rx="2.5" fill="#009B3A" />
        <path d="M12 2.4 21.6 8 12 13.6 2.4 8Z" fill="#FEDF00" />
        <circle cx="12" cy="8" r="3.1" fill="#002776" />
        <path d="M9.1 7.1c1.9-.8 4.1-.6 5.9.6" stroke="#fff" strokeWidth=".8" fill="none" />
      </svg>
    );
  }
  if (id === "es") {
    return (
      <svg {...comum}>
        <rect width="24" height="16" rx="2.5" fill="#C60B1E" />
        <rect y="4" width="24" height="8" fill="#FFC400" />
        <rect x="5.4" y="6.2" width="2.8" height="3.6" rx=".6" fill="#C60B1E" opacity=".85" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <rect width="24" height="16" rx="2.5" fill="#fff" />
      {[0, 2, 4, 6].map((n) => (
        <rect key={n} y={n * 2.286} width="24" height="2.286" fill="#B22234" />
      ))}
      <rect width="10.5" height="9.15" rx="2.5" fill="#3C3B6E" />
      <rect width="10.5" height="9.15" fill="#3C3B6E" />
      {[
        [2.2, 2.2],
        [5.2, 2.2],
        [8.2, 2.2],
        [3.7, 4.6],
        [6.7, 4.6],
        [2.2, 7],
        [5.2, 7],
        [8.2, 7],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r=".65" fill="#fff" />
      ))}
    </svg>
  );
}

/**
 * O idioma: um botão com a bandeira atual que abre a lista dos três.
 *
 * Eram três botões lado a lado (PT · ES · EN). Cabia, mas ocupava a barra inteira e não
 * parecia parte do produto. A lista mostra o nome por extenso -- cada um escrito NO SEU
 * idioma, que é como quem procura o próprio idioma reconhece -- e a bandeira serve de
 * âncora visual pra quem não lê o rótulo.
 *
 * `paraCima` pro rodapé: lá a lista aberta pra baixo sai da página.
 */
export function SeletorIdioma({
  className = "",
  escuro = false,
  paraCima = false,
}: {
  className?: string;
  escuro?: boolean;
  paraCima?: boolean;
}) {
  const { idioma, definir, t } = useIdioma();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = IDIOMAS.find((i) => i.id === idioma) ?? IDIOMAS[0];

  // Fecha ao clicar fora e no Esc. `pointerdown` e não `click`: o clique que fecha não
  // pode ser o mesmo que já foi consumido por um botão de dentro.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const borda = escuro ? "border-white/20 hover:border-white/40" : "border-neutral-200 hover:border-neutral-400";
  const texto = escuro ? "text-white/90" : "text-neutral-700";

  return (
    <div ref={caixa} className={"relative inline-block " + className}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`${t("idioma.rotulo")}: ${atual.rotulo}`}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 text-xs font-medium transition ${borda} ${texto}`}
      >
        <Bandeira id={atual.id} />
        <span className="tracking-wide">{atual.curto}</span>
        <svg viewBox="0 0 24 24" className={"h-3 w-3 opacity-60 transition " + (aberto ? "rotate-180" : "")} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <ul
          role="listbox"
          aria-label={t("idioma.rotulo")}
          className={
            "absolute right-0 z-50 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg " +
            (paraCima ? "bottom-full mb-1" : "top-full mt-1")
          }
        >
          {IDIOMAS.map((i) => {
            const ativo = i.id === idioma;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  onClick={() => {
                    definir(i.id);
                    setAberto(false);
                  }}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition " +
                    (ativo ? "bg-marca-indigo/5 font-medium text-marca-indigo" : "text-neutral-700 hover:bg-neutral-50")
                  }
                >
                  <Bandeira id={i.id} className="h-4 w-6 shrink-0 rounded-[3px] shadow-sm" />
                  <span className="min-w-0 flex-1 truncate">{i.rotulo}</span>
                  {ativo ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="shrink-0 text-[10px] font-semibold tracking-wider text-neutral-400">{i.curto}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
