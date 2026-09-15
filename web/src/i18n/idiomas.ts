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

/**
 * O idioma de uma requisição de API: o cookie que a pessoa escolheu, senão o navegador.
 *
 * Existe porque traduzir só a tela não basta. O que a IA ESCREVE -- descrição do book,
 * roteiro da narração -- e o aviso gravado dentro da imagem saem do servidor, e sair em
 * português numa conta em espanhol não é falta de polimento: é material que o corretor
 * não pode mandar pro cliente dele.
 */
export function idiomaDaRequisicao(req: { headers: { get(nome: string): string | null } }): Idioma {
  const cookie = req.headers.get("cookie") ?? "";
  const achou = new RegExp(`(?:^|;\\s*)${COOKIE_IDIOMA}=([^;]+)`).exec(cookie);
  const doCookie = achou?.[1]?.trim();
  if (ehIdioma(doCookie)) return doCookie;
  return idiomaDoNavegador(req.headers.get("accept-language"));
}

/**
 * A regra de língua que vai no prompt, por extenso.
 *
 * "Espanhol neutro" e não de um país: um anúncio em espanhol rioplatense lido no México
 * soa estrangeiro, e a Encena não sabe em que país o corretor está -- sabe só que idioma
 * ele escolheu. Neutro é o que serve aos dois.
 *
 * A frase diz, com todas as letras, que as INSTRUÇÕES e os DADOS vêm em português e
 * ainda assim a resposta é na outra língua. Sem isso não funciona: medido
 * (`scripts/testar-idioma-servidor.mjs`) -- um "Escribe en español" no meio de um prompt
 * em português devolve português, porque o modelo segue a língua dominante do texto que
 * está lendo. A regra também entra DUAS vezes no prompt, na primeira linha e na última:
 * o meio é onde instrução se perde.
 */
export const REGRA_IDIOMA: Record<Idioma, string> = {
  pt: "Escreva em Português do Brasil.",
  es: "IMPORTANTE: responde SOLO en español neutro de Latinoamérica, sin modismos de un país específico. Las instrucciones y los datos del inmueble están en portugués a propósito; tu respuesta tiene que estar en español de todas formas.",
  en: "IMPORTANT: answer ONLY in English (US). The instructions and the property data are in Portuguese on purpose; your answer must still be in English.",
};

/** O aviso que fica gravado na imagem editada, por idioma. */
export const AVISO_IMAGEM: Record<Idioma, { prefixo: string; generico: string }> = {
  pt: { prefixo: "Imagem ilustrativa", generico: "Imagem ilustrativa · editada digitalmente" },
  es: { prefixo: "Imagen ilustrativa", generico: "Imagen ilustrativa · editada digitalmente" },
  en: { prefixo: "Illustrative image", generico: "Illustrative image · digitally edited" },
};
