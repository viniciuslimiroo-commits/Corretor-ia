// Os idiomas que a Encena fala, e como decidir qual usar.
//
// Sem prefixo de URL de propósito. `/b/{token}` e `/c/{token}` já circulam no WhatsApp de
// cliente; virar `/es/b/{token}` quebraria link que está na mão de comprador. O idioma
// mora num cookie, e quem lê o cookie é o servidor (ver `layout.tsx`), pra tela nascer no
// idioma certo em vez de nascer em português e trocar depois.

export type Idioma = "pt" | "es" | "en";

export const IDIOMAS: { id: Idioma; rotulo: string; curto: string; lang: string }[] = [
  { id: "pt", rotulo: "Português", curto: "PT", lang: "pt-BR" },
  { id: "es", rotulo: "Español", curto: "ES", lang: "es" },
  { id: "en", rotulo: "English", curto: "EN", lang: "en" },
];

export const IDIOMA_PADRAO: Idioma = "pt";
export const COOKIE_IDIOMA = "idioma";

export function ehIdioma(x: unknown): x is Idioma {
  return x === "pt" || x === "es" || x === "en";
}

/**
 * Primeiro visita, sem cookie: o navegador diz o que a pessoa lê. `Accept-Language` vem
 * como "es-MX,es;q=0.9,en;q=0.8" -- o primeiro que a gente fala, ganha. Português é o
 * padrão quando nada bate, porque é onde o produto está.
 */
export function idiomaDoNavegador(acceptLanguage: string | null | undefined): Idioma {
  if (!acceptLanguage) return IDIOMA_PADRAO;
  for (const parte of acceptLanguage.split(",")) {
    const codigo = parte.trim().slice(0, 2).toLowerCase();
    if (ehIdioma(codigo)) return codigo;
  }
  return IDIOMA_PADRAO;
}

export function langHtml(idioma: Idioma): string {
  return IDIOMAS.find((i) => i.id === idioma)?.lang ?? "pt-BR";
}
