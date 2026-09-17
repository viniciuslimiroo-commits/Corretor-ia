// CLIPES DE REAÇÃO do Pexels: gente rindo, batendo palmas, comemorando.
//
// É a parte "gente reagindo" dos GIFs do CapCut, pelo caminho que a pesquisa de 16/09
// deixou aberto: os memes da Giphy e cena de filme famoso não podem entrar em anúncio;
// vídeo do Pexels pode (licença: uso comercial, anúncio incluído, sem crédito
// obrigatório). O que a licença proíbe vira regra da tela: pessoa identificável não pode
// aparecer de forma ofensiva nem parecer que RECOMENDA o produto.
//
// Este arquivo não tem chave nem rede: é o que o navegador e o saneador importam. A busca
// e o download ficam em pexels-servidor.ts, com a chave do servidor.

/** Um clipe como a galeria recebe: capa, prévia leve e o crédito. */
export type ClipePexels = {
  id: number;
  /** Página do vídeo no Pexels. */
  url: string;
  autor: string;
  autorUrl: string;
  duracao: number;
  largura: number;
  altura: number;
  /** Imagem parada (primeiro quadro). */
  capa: string;
  /** O arquivo MP4 mais leve que ainda serve de prévia (~360–640px). */
  previa: string;
};

/** O que o elemento da cena guarda do clipe, só pra mostrar no palco e dar o crédito. */
export type ClipeNaCena = { previa: string; largura: number; altura: number; autor: string; autorUrl: string };

export const PREFIXO_PEXELS = "pexels:";

/** O id numérico do vídeo dentro de um `ElementoCena.id`, ou `null` se não for Pexels. */
export function idDoPexels(elementoId: string): number | null {
  if (!elementoId.startsWith(PREFIXO_PEXELS)) return null;
  const resto = elementoId.slice(PREFIXO_PEXELS.length);
  return /^\d{1,12}$/.test(resto) ? Number(resto) : null;
}

/**
 * Endereço de arquivo ou imagem do Pexels, e só do Pexels. O saneador usa isto antes de
 * guardar a prévia: o que o palco toca não pode ser um endereço qualquer vindo do navegador.
 */
export function ehUrlDoPexels(bruto: unknown): bruto is string {
  if (typeof bruto !== "string" || bruto.length > 600) return false;
  try {
    const u = new URL(bruto);
    return u.protocol === "https:" && (u.hostname === "pexels.com" || u.hostname.endsWith(".pexels.com"));
  } catch {
    return false;
  }
}

/** O clipe entra em laço curto, como GIF: os primeiros segundos, repetidos. */
export const LOOP_CLIPE_S = 3;

/** Altura padrão do clipe na cena, em fração da altura do vídeo. */
export const TAMANHO_CLIPE = 0.22;
export const TAMANHO_CLIPE_MIN = 0.1;
export const TAMANHO_CLIPE_MAX = 0.45;

/**
 * As prateleiras. A busca da prateleira vai em INGLÊS (medido: é a etiqueta principal do
 * acervo). O que a pessoa DIGITA vai em português com `locale=pt-BR`, que a API entende --
 * medido em 17/09: "pessoa rindo" e "cachorro engraçado" trazem o que se espera.
 */
export const CATEGORIAS_REACAO: { id: string; rotulo: string; busca: string }[] = [
  { id: "rindo", rotulo: "Rindo", busca: "person laughing" },
  { id: "palmas", rotulo: "Palmas", busca: "people clapping hands" },
  { id: "comemorando", rotulo: "Comemorando", busca: "celebrating success excited" },
  { id: "surpresa", rotulo: "Surpresa", busca: "surprised face shocked" },
  { id: "joinha", rotulo: "Joinha", busca: "thumbs up" },
  { id: "pensando", rotulo: "Pensando", busca: "thinking person" },
  { id: "dancando", rotulo: "Dançando", busca: "happy dance" },
  { id: "chaves", rotulo: "Chaves na mão", busca: "house keys hand" },
  { id: "mudanca", rotulo: "Casa nova", busca: "moving into new home happy couple" },
  { id: "oi", rotulo: "Oi / tchau", busca: "person waving hello" },
  { id: "nao_acredito", rotulo: "Não acredito", busca: "facepalm disappointed" },
  { id: "pet", rotulo: "Cachorros", busca: "funny dog" },
  { id: "gatos", rotulo: "Gatos", busca: "funny cat" },
  { id: "bebes", rotulo: "Bebês", busca: "baby laughing" },
];

export const CREDITO_PEXELS = "Vídeos do Pexels";

/** O aviso que a licença pede, dito do jeito do corretor. */
export const AVISO_PEXELS = "Pessoas reais: não use pra parecer que elas recomendam você ou o imóvel, nem de forma ofensiva.";
