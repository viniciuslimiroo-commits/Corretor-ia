import {
  FILTRO_POR_ID,
  ehTransicao,
  LIMITES,
  SELOS_IMOVEL,
  textosDaCena,
  type AnimacaoTexto,
  type Cena,
  type EfeitoId,
  type EspecVideo,
  type EstiloTexto,
  type FiltroId,
  type FormatoId,
  type MusicaId,
  type PosicaoTexto,
  type TransicaoId,
} from "./video";

/**
 * Templates de vídeo imobiliário.
 *
 * Um template NÃO é um vídeo pronto: é a diferença entre um apartamento de 400 mil e uma
 * casa de alto padrão, escrita como escolhas de edição. Ninguém abre o editor sabendo que
 * imóvel caro pede cena de 6s com dissolver lento e música de lounge, e imóvel de
 * aluguel pede corte seco de 3s -- mas todo mundo reconhece o resultado.
 *
 * O que o template mexe: formato, música, transição, duração e movimento das cenas,
 * tela final, chamada e os TEXTOS das cenas. O que ele nunca mexe: o dado do imóvel. Os
 * textos saem de `pecasDoImovel` -- preço, quartos, área -- e um campo que o imóvel não
 * tem simplesmente não vira texto. Template não inventa metragem.
 */
export type TemplateVideo = {
  id: string;
  nome: string;
  /** Pra que tipo de imóvel serve, em uma linha curta. Vai no cartão. */
  para: string;
  /** O que muda, em linguagem de quem edita (não de quem programa). */
  descricao: string;
  formato: FormatoId;
  musica: MusicaId;
  transicao: TransicaoId;
  /** Acabamento de cor do vídeo inteiro. */
  filtro: FiltroId;
  duracaoCena: number;
  /** Movimento de câmera em rodízio pelas cenas: cena 1 pega o primeiro, cena 2 o segundo. */
  efeitos: EfeitoId[];
  /** Id de SELOS_IMOVEL que entra na primeira cena. */
  selo: string | null;
  /** Ids de `pecasDoImovel`, na ordem em que entram nas cenas. */
  pecas: string[];
  estiloPecas: EstiloTexto;
  posicaoPecas: PosicaoTexto;
  animacao: AnimacaoTexto;
  telaFinal: boolean;
  chamada: string;
};

export const TEMPLATES_VIDEO: TemplateVideo[] = [
  {
    id: "apartamento",
    nome: "Apartamento",
    para: "Apartamento, studio, cobertura",
    descricao: "Ritmo de Reels: 4 segundos por cena, música moderna e os números aparecendo um por vez.",
    formato: "9:16",
    musica: "moderna",
    transicao: "dissolver",
    filtro: "claro",
    duracaoCena: 4,
    efeitos: ["aproximar", "esquerda", "afastar", "direita"],
    selo: "venda",
    pecas: ["preco", "dormitorios", "area", "vagas"],
    estiloPecas: "destaque",
    posicaoPecas: "base",
    animacao: "subir",
    telaFinal: true,
    chamada: "Agende sua visita",
  },
  {
    id: "casa",
    nome: "Casa",
    para: "Casa, sobrado, casa em condomínio",
    descricao: "Clima de família: música leve, cenas um pouco mais longas e a câmera abrindo os ambientes.",
    formato: "9:16",
    musica: "alegre",
    transicao: "deslizar",
    filtro: "quente",
    duracaoCena: 5,
    efeitos: ["afastar", "direita", "aproximar", "esquerda"],
    selo: "venda",
    pecas: ["preco", "dormitorios", "suites", "area"],
    estiloPecas: "faixa",
    posicaoPecas: "base",
    animacao: "subir",
    telaFinal: true,
    chamada: "Agende sua visita",
  },
  {
    id: "alto_padrao",
    nome: "Alto padrão",
    para: "Imóvel de luxo, cobertura, mansão",
    descricao: "Devagar e caro: cena de 6s, dissolver longo, lounge instrumental e quase nenhum movimento.",
    formato: "9:16",
    musica: "elegante",
    transicao: "dissolver",
    filtro: "cinema",
    duracaoCena: 6,
    efeitos: ["aproximar", "parado", "afastar", "parado"],
    selo: "alto_padrao",
    pecas: ["area", "suites", "vagas", "preco"],
    estiloPecas: "destaque",
    posicaoPecas: "base",
    animacao: "surgir",
    telaFinal: true,
    chamada: "Quero saber mais",
  },
  {
    id: "lancamento",
    nome: "Lançamento",
    para: "Obra nova, planta, pré-lançamento",
    descricao: "Orquestra crescente e transição de zoom, do jeito que anúncio de lançamento costuma ser.",
    formato: "9:16",
    musica: "cinematografica",
    transicao: "aproximar",
    filtro: "cinema",
    duracaoCena: 4,
    efeitos: ["aproximar", "aproximar", "afastar", "esquerda"],
    selo: "lancamento",
    pecas: ["preco", "dormitorios", "area"],
    estiloPecas: "destaque",
    posicaoPecas: "base",
    animacao: "subir",
    telaFinal: true,
    chamada: "Quero saber mais",
  },
  {
    id: "terreno",
    nome: "Terreno",
    para: "Lote, chácara, área",
    descricao: "A câmera anda de lado pra mostrar extensão, e o texto grande é a metragem.",
    formato: "9:16",
    musica: "calma",
    transicao: "deslizar",
    filtro: "natural",
    duracaoCena: 5,
    efeitos: ["direita", "esquerda", "afastar", "direita"],
    selo: "oportunidade",
    pecas: ["area", "preco"],
    estiloPecas: "destaque",
    posicaoPecas: "base",
    animacao: "surgir",
    telaFinal: true,
    chamada: "Quero saber mais",
  },
  {
    id: "praia",
    nome: "Praia e campo",
    para: "Casa de praia, sítio, temporada",
    descricao: "Cena longa e câmera abrindo: o que vende aqui é a vista, não a contagem de quartos.",
    formato: "9:16",
    musica: "calma",
    transicao: "dissolver",
    filtro: "quente",
    duracaoCena: 5,
    efeitos: ["afastar", "direita", "aproximar", "esquerda"],
    selo: "novo",
    pecas: ["preco", "dormitorios", "area"],
    estiloPecas: "faixa",
    posicaoPecas: "base",
    animacao: "surgir",
    telaFinal: true,
    chamada: "Agende sua visita",
  },
  {
    id: "comercial",
    nome: "Comercial",
    para: "Sala, loja, galpão, laje",
    descricao: "Quadrado pro feed, corte seco e sem trilha doce: área, vagas e valor, direto.",
    formato: "1:1",
    musica: "moderna",
    transicao: "corte",
    filtro: "sobrio",
    duracaoCena: 4,
    efeitos: ["parado", "esquerda", "parado", "direita"],
    selo: null,
    pecas: ["area", "vagas", "preco", "condominio"],
    estiloPecas: "faixa",
    posicaoPecas: "base",
    animacao: "nenhuma",
    telaFinal: true,
    chamada: "Quero saber mais",
  },
  {
    id: "aluguel",
    nome: "Aluguel",
    para: "Locação residencial",
    descricao: "Rápido: 3s por cena, corte seco e o valor do aluguel na primeira tela.",
    formato: "9:16",
    musica: "alegre",
    transicao: "corte",
    filtro: "claro",
    duracaoCena: 3,
    efeitos: ["aproximar", "direita", "afastar", "esquerda"],
    selo: "aluguel",
    pecas: ["preco", "dormitorios", "area", "condominio"],
    estiloPecas: "faixa",
    posicaoPecas: "base",
    animacao: "subir",
    telaFinal: true,
    chamada: "Chame no WhatsApp",
  },
  {
    id: "vendido",
    nome: "Vendido",
    para: "Prova social depois de fechar",
    descricao: "O carimbo no meio da tela e nada de preço: este vídeo não vende o imóvel, vende você.",
    formato: "9:16",
    musica: "alegre",
    transicao: "aproximar",
    filtro: "claro",
    duracaoCena: 3,
    efeitos: ["aproximar", "afastar", "aproximar", "afastar"],
    selo: "vendido",
    pecas: [],
    estiloPecas: "faixa",
    posicaoPecas: "base",
    animacao: "subir",
    telaFinal: true,
    chamada: "Quero saber mais",
  },
];

export const TEMPLATE_POR_ID = Object.fromEntries(TEMPLATES_VIDEO.map((t) => [t.id, t])) as Record<string, TemplateVideo>;

export type PecaImovel = { id: string; rotulo: string; texto: string };

/** O que um template vai mudar, em frases -- pra mostrar ANTES de aplicar. */
export function mudancasDoTemplate(t: TemplateVideo, pecas: PecaImovel[]): string[] {
  const usadas = t.pecas.map((id) => pecas.find((p) => p.id === id)).filter((p): p is PecaImovel => !!p);
  const selo = t.selo ? SELOS_IMOVEL.find((s) => s.id === t.selo) : null;
  const acabamento = FILTRO_POR_ID[t.filtro]?.rotulo ?? t.filtro;
  const lista = [
    `Formato ${t.formato} e música ${t.musica === "nenhuma" ? "nenhuma" : t.musica}`,
    `Acabamento de cor: ${acabamento}`,
    `${t.duracaoCena.toFixed(1).replace(".0", "").replace(".", ",")}s por cena, transição ${t.transicao}`,
  ];
  if (selo) lista.push(`Etiqueta “${selo.texto}” na primeira cena`);
  if (usadas.length) lista.push(`Texto nas cenas: ${usadas.map((p) => p.texto).join(", ")}`);
  else if (t.pecas.length) lista.push("Sem texto de dado: este imóvel ainda não tem preço, área nem quartos preenchidos");
  if (t.telaFinal) lista.push(`Tela final com “${t.chamada}”`);
  return lista;
}

/**
 * Aplica o template às cenas que já existem.
 *
 * Duas regras que importam mais que o resto:
 *
 * 1. Peça que o imóvel não tem não vira texto. Se a ficha não tem área, o template de
 *    terreno simplesmente não escreve metragem -- em vez de escrever "0 m²", que é
 *    pior que não escrever nada.
 * 2. Cena que tem duração própria não é tocada -- animada, 360 e clipe duram o que o
 *    arquivo dura. O ritmo do template só vale pra foto, que é onde ele é uma escolha.
 *
 * Aplicar APAGA os textos escritos à mão: é o template inteiro ou nenhum. A tela avisa
 * antes (`templateVaiApagarTexto`), porque não existe desfazer aqui.
 */
export function aplicarTemplateVideo(
  t: TemplateVideo,
  base: EspecVideo,
  pecas: PecaImovel[],
  opcoes?: { temWhatsapp?: boolean }
): EspecVideo {
  const selo = t.selo ? SELOS_IMOVEL.find((s) => s.id === t.selo) : null;
  const disponiveis = t.pecas.map((id) => pecas.find((p) => p.id === id)).filter((p): p is PecaImovel => !!p);

  // "Chame no WhatsApp" sem WhatsApp cadastrado é uma chamada que não leva a lugar nenhum.
  const chamada = t.chamada === "Chame no WhatsApp" && opcoes?.temWhatsapp === false ? "Agende sua visita" : t.chamada;

  let proxima = 0;
  const cenas: Cena[] = base.cenas.map((c, i) => {
    const textos: { texto: string; posicao: PosicaoTexto; estilo: EstiloTexto; animacao: AnimacaoTexto }[] = [];
    if (i === 0 && selo) textos.push({ texto: selo.texto, posicao: selo.posicao, estilo: selo.estilo, animacao: "surgir" });
    if (proxima < disponiveis.length && textos.length < LIMITES.textosPorCena) {
      const p = disponiveis[proxima++];
      textos.push({ texto: p.texto.slice(0, LIMITES.textoMax), posicao: t.posicaoPecas, estilo: t.estiloPecas, animacao: t.animacao });
    }
    // Cena animada, 360 e clipe têm duração própria (o clipe que existe, o trecho aparado).
    const fixa = c.tipo === "animada" || c.tipo === "tour360" || c.tipo === "clipe";
    return {
      ...c,
      efeito: c.tipo === "foto" || c.tipo === "antes_depois" ? t.efeitos[i % t.efeitos.length] : c.efeito,
      duracao: fixa ? c.duracao : t.duracaoCena,
      filtro: undefined,
      luz: undefined,
      // A transição e o acabamento por cena voltam pro do vídeo: o template define um só.
      transicao: undefined,
      textos: textos.length ? textos : undefined,
      legenda: undefined,
    };
  });

  return {
    ...base,
    formato: t.formato,
    filtro: t.filtro,
    musica: t.musica,
    transicao: ehTransicao(t.transicao),
    cenas,
    telaFinal: t.telaFinal,
    chamada,
  };
}

/** Se o vídeo atual já tem texto escrito à mão, aplicar um template apaga. Pra avisar antes. */
export function templateVaiApagarTexto(base: Pick<EspecVideo, "cenas">): boolean {
  return base.cenas.some((c) => textosDaCena(c).length > 0);
}
