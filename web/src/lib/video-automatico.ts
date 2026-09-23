import { AMBIENTES } from "./book-ia";
import type { EfeitoId } from "./video";

// MONTAR O VÍDEO SOZINHO: a ordem, a capa, a legenda e o movimento de cada cena.
//
// Pedido dele em 22/09/2026, depois de comparar com um vídeo do concorrente feito com as
// mesmas dez fotos: "quero que a geração automática seja parecida com este vídeo, quando a
// pessoa mandar as fotos, analisa as fotos". E logo depois: "quero que esse padrão funcione
// pra QUALQUER imagem" -- foto de imóvel cadastrado ou arquivo solto que ela acabou de subir.
//
// A divisão de trabalho é a mesma que o book já usa e que funciona:
//
//   A IA DIZ O QUE É    ambiente (lista fechada), qualidade de 0 a 10, legenda curta.
//   O CÓDIGO DECIDE     ordem, descarte, capa, movimento e duração.
//
// Por que a decisão não é da IA: regra não varia entre execuções. Pedir "ordene como numa
// visita" devolve uma ordem boa hoje e outra amanhã com as mesmas fotos, e o corretor que
// refizer o vídeo vê a ordem mudar sem ter mexido em nada. Foi a lição da leitura de planta,
// onde repetir a instrução no prompt não segurou a "laje técnica" fora da lista e um filtro
// de três linhas segurou.
//
// Este arquivo é PURO: nada de rede, nada de banco. Quem chama a visão é a rota.

/**
 * A ordem de uma visita de verdade: chega, entra, vê o social, vê o íntimo, sai pros fundos.
 *
 * É a mesma de book-montagem.ts, copiada de propósito e não importada: aquela é a ordem das
 * PÁGINAS de um material impresso, que pode divergir da ordem de um passeio em vídeo sem que
 * nenhuma das duas esteja errada. Importar amarraria as duas a uma decisão só.
 */
export const ORDEM_DO_PASSEIO: string[] = [
  "fachada", "entrada", "sala", "integrado", "jantar", "cozinha", "escritorio",
  "quarto", "infantil", "closet", "banheiro", "area_servico",
  "varanda", "gourmet", "quintal", "piscina",
  // Área comum é do prédio, não da unidade: quem compra quer ver o imóvel antes do salão.
  "salao", "academia", "playground",
];

/** O nome que vai na legenda da cena. Sem isto a legenda automática sairia vazia. */
export const NOME_DO_AMBIENTE: Record<string, string> = {
  fachada: "Fachada",
  entrada: "Entrada",
  sala: "Sala",
  integrado: "Ambiente integrado",
  jantar: "Sala de jantar",
  cozinha: "Cozinha",
  escritorio: "Escritório",
  quarto: "Quarto",
  infantil: "Quarto infantil",
  closet: "Closet",
  banheiro: "Banheiro",
  area_servico: "Área de serviço",
  varanda: "Varanda",
  gourmet: "Área gourmet",
  quintal: "Quintal",
  piscina: "Piscina",
  salao: "Salão de festas",
  academia: "Academia",
  playground: "Playground",
};

/**
 * O movimento de câmera que cada ambiente pede.
 *
 * A regra é simples e tem motivo: ambiente que se entende pelo CONJUNTO abre (afastar);
 * ambiente que se vende pelo ACABAMENTO fecha (aproximar). Fachada precisa mostrar a casa
 * inteira; bancada de cozinha precisa mostrar a pedra.
 */
const MOVIMENTO: Record<string, EfeitoId> = {
  fachada: "afastar",
  entrada: "afastar",
  quintal: "afastar",
  piscina: "afastar",
  gourmet: "afastar",
  varanda: "afastar",
  salao: "afastar",
  academia: "afastar",
  playground: "afastar",
  sala: "afastar",
  integrado: "afastar",
  cozinha: "aproximar",
  banheiro: "aproximar",
  closet: "aproximar",
  escritorio: "aproximar",
  area_servico: "aproximar",
  jantar: "aproximar",
  quarto: "aproximar",
  infantil: "aproximar",
};

/** O que a visão devolveu sobre uma imagem, seja ela de job ou de arquivo solto. */
export type Olhada = {
  /** A chave da cena na tela — é por ela que o resultado volta pro lugar certo. */
  chave: string;
  ambiente: string | null;
  /** 0 a 10: nitidez, enquadramento e luz. */
  qualidade: number;
  legenda: string;
  /** Panorâmica e 360 têm movimento próprio e não entram na regra de ambiente. */
  ehPanoramica?: boolean;
  eh360?: boolean;
  ehClipe?: boolean;
};

export type CenaSugerida = {
  chave: string;
  legenda: string;
  efeito: EfeitoId;
  duracao: number;
};

export type Sugestao = {
  /** As chaves na ordem do passeio. */
  ordem: string[];
  /** A chave da cena que vira capa. */
  capa: string | null;
  cenas: CenaSugerida[];
  /** Descartadas, com o motivo — a tela precisa DIZER o que tirou, não sumir com a foto. */
  fora: { chave: string; motivo: string }[];
};

/** Nota mínima pra entrar. Abaixo disso a foto atrapalha mais do que mostra. */
export const NOTA_MINIMA = 3;

/**
 * Quem merece ser capa, do melhor (0) pro pior. Menor é melhor.
 *
 * A fachada vende o imóvel inteiro numa imagem; a área externa e o social vêm depois; quarto
 * e banheiro são o que se vê DEPOIS de decidir entrar, e não o que faz entrar. Área de
 * serviço e closet ficam por último -- foto boa de lavanderia continua sendo lavanderia.
 */
function pontoDeCapa(ambiente: string | null): number {
  switch (ambiente) {
    case "fachada":
      return 0;
    case "piscina":
    case "gourmet":
    case "varanda":
    case "quintal":
      return 1;
    case "sala":
    case "integrado":
    case "jantar":
      return 2;
    case "cozinha":
      return 3;
    case "entrada":
    case "salao":
    case "academia":
    case "playground":
      return 4;
    case "quarto":
    case "infantil":
    case "escritorio":
      return 5;
    case "banheiro":
    case "closet":
    case "area_servico":
      return 7;
    default:
      // Ambiente que a visão não reconheceu fica no meio: pode ser uma boa fachada torta.
      return 6;
  }
}

/** Onde a foto cai na visita. Ambiente desconhecido vai pro meio, não pro fim. */
function posicao(ambiente: string | null): number {
  const i = ambiente ? ORDEM_DO_PASSEIO.indexOf(ambiente) : -1;
  return i >= 0 ? i : ORDEM_DO_PASSEIO.length / 2;
}

/**
 * A montagem inteira, a partir do que a visão viu.
 *
 * `duracaoPadrao` vem de LIMITES pra não haver dois números de duração no projeto.
 */
export function sugerirMontagem(olhadas: Olhada[], duracaoPadrao: number): Sugestao {
  const fora: { chave: string; motivo: string }[] = [];
  const dentro: Olhada[] = [];

  for (const o of olhadas) {
    // Clipe, 360 e panorâmica entram sempre: a pessoa mandou de propósito, e a nota de
    // "nitidez e enquadramento" não quer dizer nada num vídeo ou numa esfera.
    if (o.ehClipe || o.eh360 || o.ehPanoramica) {
      dentro.push(o);
      continue;
    }
    if (o.ambiente === "planta") {
      fora.push({ chave: o.chave, motivo: "é planta baixa, não entra no passeio" });
      continue;
    }
    if (o.qualidade < NOTA_MINIMA) {
      fora.push({ chave: o.chave, motivo: `foto escura ou torta (nota ${o.qualidade})` });
      continue;
    }
    dentro.push(o);
  }

  // Tudo reprovado seria pior que não fazer nada: a pessoa ficaria sem vídeo e sem entender.
  // Nesse caso a montagem devolve todas de volta, na ordem que vier.
  if (dentro.length === 0 && olhadas.length > 0) {
    return {
      ordem: olhadas.map((o) => o.chave),
      capa: olhadas[0]?.chave ?? null,
      cenas: olhadas.map((o) => ({ chave: o.chave, legenda: "", efeito: efeitoDe(o), duracao: duracaoPadrao })),
      fora: [],
    };
  }

  const ordenadas = [...dentro].sort((a, b) => {
    const d = posicao(a.ambiente) - posicao(b.ambiente);
    if (d !== 0) return d;
    // Mesmo ambiente: a melhor foto primeiro. Dois quartos viram "o melhor quarto, depois o outro".
    return b.qualidade - a.qualidade;
  });

  // A CAPA é o quadro que aparece antes de alguém tocar no play -- é ele que decide se
  // tocam. Por isso não basta "a foto de maior nota": num teste com fotos reais, a melhor
  // nota era um BANHEIRO, e banheiro não é capa de anúncio de imóvel por melhor que esteja
  // a foto. A preferência é por ambiente, e a nota só desempata dentro dela.
  const candidatas = ordenadas.filter((o) => !o.ehClipe);
  const capa =
    [...candidatas].sort((a, b) => {
      const d = pontoDeCapa(a.ambiente) - pontoDeCapa(b.ambiente);
      return d !== 0 ? d : b.qualidade - a.qualidade;
    })[0]?.chave ?? ordenadas[0]?.chave ?? null;

  const cenas = ordenadas.map((o) => ({
    chave: o.chave,
    legenda: legendaDe(o),
    efeito: efeitoDe(o),
    // A capa segura um pouco mais: é onde a pessoa decide se continua vendo.
    duracao: o.chave === capa ? Math.round(duracaoPadrao * 1.25) : duracaoPadrao,
  }));

  // A PRIMEIRA CENA É A CAPA. Antes a ordem era pura ordem de visita, e a capa servia só de
  // miniatura -- então um conjunto sem foto de fachada ABRIA numa cozinha ou num banheiro,
  // que foi o que ele viu: "acho estranho a sequência começar pela parte interna".
  //
  // Vídeo de imóvel se apresenta antes de entrar. A capa já é escolhida por quem merece
  // abrir (fachada, depois área externa, depois social), então é ela que abre o passeio; o
  // resto segue a ordem da visita, e o fim continua caindo nas áreas de lazer e comuns.
  const ordem = capa ? [capa, ...ordenadas.filter((o) => o.chave !== capa).map((o) => o.chave)] : ordenadas.map((o) => o.chave);
  return { ordem, capa, cenas, fora };
}

/** O nome do ambiente. A legenda da IA só entra quando o ambiente não foi reconhecido. */
export function legendaDe(o: Olhada): string {
  if (o.ehClipe || o.eh360) return "";
  const nome = o.ambiente ? NOME_DO_AMBIENTE[o.ambiente] : null;
  if (nome) return nome;
  // Legenda da IA com número seria uma afirmação sobre o imóvel — isso já é cortado na
  // origem (book-ia), mas o corte é barato e a garantia é de quem escreve na tela.
  return /\d/.test(o.legenda) ? "" : o.legenda;
}

/** O movimento da cena. Panorâmica desliza; o resto segue o ambiente. */
export function efeitoDe(o: Olhada): EfeitoId {
  if (o.ehPanoramica) return "direita";
  if (o.eh360 || o.ehClipe) return "parado";
  const m = o.ambiente ? MOVIMENTO[o.ambiente] : null;
  return m ?? "aproximar";
}

/** Só pra tela: quantas fotos a visão ainda não viu (cada uma custa uma chamada). */
export function ambienteValido(v: unknown): boolean {
  return typeof v === "string" && (AMBIENTES as readonly string[]).includes(v);
}
