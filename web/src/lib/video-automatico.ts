import { AMBIENTES } from "./book-ia";
import type { AnimacaoId, EfeitoId } from "./video";

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

// O MAPA DE MOVIMENTO POR AMBIENTE foi removido em 10/10/2026, quando toda foto passou a
// passear pro lado (ver `efeitoDe`). Ele dizia: fachada, sala e áreas externas AFASTAM
// (vende-se o espaço); cozinha, banho, quarto e closet APROXIMAM (vende-se o acabamento).
// Fica no git, não aqui: mapa morto que parece vivo é pior que mapa nenhum.

/**
 * Qual movimento de CÂMERA DE VERDADE cada ambiente pede, quando a cena é animada por IA.
 *
 * Isto é outra coisa do `MOVIMENTO` acima. Lá é zoom sobre foto parada -- a imagem é um
 * plano que desliza. Aqui o modelo de image-to-video recria a profundidade: a porta abre
 * no fundo, a janela gira, o corredor se aprofunda. Por isso a direção importa de verdade,
 * e foi o que ele apontou em 23/09/2026: "tempo de caminhada, DIREÇÃO QUE VAI".
 *
 * A regra vem do que a câmera poderia fisicamente fazer ali:
 *
 *   SOBREVOO    do lado de fora, onde o assunto é grande demais pra caber andando: fachada,
 *               quintal, piscina. É como o vídeo do concorrente abre.
 *   ENTRAR      o ambiente em que uma pessoa ENTRA e que tem fundo pra andar.

 *   APROXIMAR   cômodo pequeno. Andar pra frente num banheiro de 2 m bate na parede em um
 *               segundo; o avanço com profundidade mostra o acabamento sem esbarrar.
 */
const ANIMACAO: Record<string, AnimacaoId> = {
  fachada: "drone",
  quintal: "drone",
  piscina: "drone",
  playground: "drone",
  entrada: "caminhar",
  sala: "caminhar",
  integrado: "caminhar",
  jantar: "caminhar",
  cozinha: "caminhar",
  quarto: "caminhar",
  infantil: "caminhar",
  escritorio: "caminhar",
  varanda: "caminhar",
  gourmet: "caminhar",
  salao: "caminhar",
  academia: "caminhar",
  banheiro: "aproximar",
  closet: "aproximar",
  area_servico: "aproximar",
};

/** O que a visão devolveu sobre uma imagem, seja ela de job ou de arquivo solto. */
export type Olhada = {
  /** A chave da cena na tela — é por ela que o resultado volta pro lugar certo. */
  chave: string;
  ambiente: string | null;
  /** 0 a 10: nitidez, enquadramento e luz. */
  qualidade: number;
  legenda: string;
  /**
   * 0 a 10: quanto a câmera pode AVANÇAR nesta foto antes de bater em algo (migração 19).
   * `null`/ausente = ainda não perguntado; aí vale a regra antiga, por ambiente.
   */
  profundidade?: number | null;
  /** Panorâmica e 360 têm movimento próprio e não entram na regra de ambiente. */
  ehPanoramica?: boolean;
  eh360?: boolean;
  ehClipe?: boolean;
};

export type CenaSugerida = {
  chave: string;
  legenda: string;
  efeito: EfeitoId;
  /** O movimento da câmera quando a cena for animada por IA. Só vale no estilo "Tour". */
  animacao: AnimacaoId;
  duracao: number;
  /** Por que esta foto está AQUI, nesta posição. É o que a tela mostra embaixo da miniatura. */
  motivo: string;
  /** Esta cena merece a câmera de IA (que custa) ou o movimento na foto (que é grátis). */
  camera: boolean;
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

/**
 * QUANTO TEMPO CADA CENA SEGURA, pela POSIÇÃO dela no vídeo -- não pelo ambiente.
 *
 * Medido no vídeo que ele tomou como referência (23/09/2026), que a própria tela do
 * concorrente declara foto por foto: 4 · 4 · 4 · 3 · 3 · 3 · 3 · 4 · 4 · 4 = 36 s. As três
 * primeiras e as três últimas seguram 4 s; o miolo corre a 3 s.
 *
 * É ritmo de montagem, e o motivo é de quem edita vídeo: a abertura precisa de tempo pra
 * prender, o miolo precisa de velocidade pra não cansar, e o fim precisa de ar pra assentar
 * antes da tela de contato. Duração igual do começo ao fim é o que faz um vídeo de imóvel
 * parecer apresentação de slides.
 *
 * Tem dois efeitos de bolso, e os dois são bons: o vídeo de 10 fotos cai de 37 s pra 36 s --
 * mais perto da faixa de 15 a 30 s que o Reels empurra -- e a cena animada custa por QUADRO,
 * então as quatro cenas de 3 s custam 25% menos cada uma que custariam a 4 s.
 *
 * Vídeo curto (até 6 cenas) é todo de abertura e fim: não existe miolo pra correr.
 */
export function duracaoDaPosicao(indice: number, total: number, padrao: number): number {
  if (total <= 6) return padrao;
  const noComeco = indice < 3;
  const noFim = indice >= total - 3;
  return noComeco || noFim ? padrao : Math.max(3, padrao - 1);
}

/**
 * QUANTAS CENAS GANHAM CÂMERA DE VERDADE -- o movimento de IA, que é o único que custa.
 *
 * Ele observou o concorrente em 24/09/2026 e desmontou uma objeção minha: "vi que nem todos
 * eles usaram o efeito mais caro de tour, mesclam com aproximação que dá pra enganar; pegaram
 * as imagens mais importantes e gastaram o tour mais caro, outras fizeram aproximação".
 *
 * Eu tinha desaconselhado a mescla dizendo que o vídeo ficaria remendado. Estava errado, e a
 * prova é o vídeo que ele mesmo achou ideal: metade dele é zoom, e ele não percebeu.
 *
 * Quatro é o teto e tem razão de ser: é o que cabe na abertura e no fecho -- os lugares onde
 * a pessoa decide se assiste e o que ela leva na cabeça. Cena de miolo com câmera de IA custa
 * o mesmo e é vista por quem já decidiu ficar. Abaixo de cinco fotos o teto cai junto, senão
 * um vídeo de três fotos sairia todo animado e mais caro por foto que um de dez.
 */
export function quantasComCamera(total: number): number {
  if (total <= 1) return total;
  return Math.min(4, Math.max(2, Math.round(total * 0.4)));
}

/**
 * QUEM merece a câmera, em ordem de prioridade. Menor é melhor.
 *
 * Primeiro a função no vídeo (quem abre, quem fecha), depois o ambiente. Repetição nunca
 * ganha: o segundo quarto animado gasta o mesmo que o primeiro e mostra a mesma coisa.
 */
function pontoDeCamera(o: Olhada, indice: number, total: number, repeticao: number): number {
  if (o.ehClipe || o.eh360 || o.ehPanoramica) return 99; // já têm movimento próprio
  // POSIÇÃO ANTES DE REPETIÇÃO, o mesmo que vale pro motivo da cena. Num conjunto com dois
  // quintais, a última era o SEGUNDO quintal e a regra a descartava por repetida -- o vídeo
  // acabava num zoom e a câmera cara ia pra cena 9, que ninguém lembra. Quem fecha é a
  // imagem que fica na cabeça, seja ela a segunda foto do mesmo lugar ou não.
  if (indice === 0) return 0; // a capa decide se a pessoa assiste
  if (indice === total - 1) return 1; // a última é a imagem que fica
  if (repeticao > 0) return 90;
  return pontoDeCapa(o.ambiente) + 2;
}

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
      cenas: olhadas.map((o, i) => ({ chave: o.chave, legenda: "", efeito: efeitoDe(o, i), animacao: animacaoDe(o), duracao: duracaoPadrao, motivo: "Nenhuma foto passou na conferência; usei todas em vez de te deixar sem vídeo.", camera: i === 0 })),
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

  // A PRIMEIRA CENA É A CAPA. Antes a ordem era pura ordem de visita, e a capa servia só de
  // miniatura -- então um conjunto sem foto de fachada ABRIA numa cozinha ou num banheiro,
  // que foi o que ele viu: "acho estranho a sequência começar pela parte interna".
  //
  // Vídeo de imóvel se apresenta antes de entrar. A capa já é escolhida por quem merece
  // abrir (fachada, depois área externa, depois social), então é ela que abre o passeio; o
  // resto segue a ordem da visita, e o fim continua caindo nas áreas de lazer e comuns.
  const naTela = capa ? [ordenadas.find((o) => o.chave === capa)!, ...ordenadas.filter((o) => o.chave !== capa)] : ordenadas;
  const ordem = naTela.map((o) => o.chave);

  // A ordem sai ANTES das cenas de propósito: a duração, o motivo e o direito à câmera
  // dependem da POSIÇÃO de cada uma, e a posição só existe depois de ordenar.
  const jaVieram = new Map<string, number>();
  const comPosicao = naTela.map((o, i) => {
    const doMesmo = jaVieram.get(o.ambiente ?? "?") ?? 0;
    jaVieram.set(o.ambiente ?? "?", doMesmo + 1);
    return { o, i, doMesmo };
  });

  // A CÂMERA VAI PRAS QUE VENDEM, e o resto anda na foto mesmo. É o que o concorrente faz, e
  // ele confirmou olhando: "pegaram as imagens mais importantes e gastaram o tour mais caro,
  // outras fizeram aproximação... dá pra enganar". Empate no ponto se desfaz pela nota.
  const comCamera = new Set(
    [...comPosicao]
      .sort((a, b) => {
        const d = pontoDeCamera(a.o, a.i, naTela.length, a.doMesmo) - pontoDeCamera(b.o, b.i, naTela.length, b.doMesmo);
        return d !== 0 ? d : b.o.qualidade - a.o.qualidade;
      })
      .filter((c) => pontoDeCamera(c.o, c.i, naTela.length, c.doMesmo) < 90)
      .slice(0, quantasComCamera(naTela.length))
      .map((c) => c.o.chave)
  );

  const cenas = comPosicao.map(({ o, i, doMesmo }) => ({
    chave: o.chave,
    legenda: legendaDe(o),
    efeito: efeitoDe(o, i),
    animacao: animacaoDe(o),
    duracao: duracaoDaPosicao(i, naTela.length, duracaoPadrao),
    motivo: motivoDaCena(o, i, naTela.length, doMesmo),
    camera: comCamera.has(o.chave),
  }));

  return { ordem, capa, cenas, fora };
}

/**
 * POR QUE ESTA FOTO ESTÁ AQUI -- a frase que aparece embaixo da miniatura no roteiro.
 *
 * Escrita pela REGRA e não pela IA, pelo mesmo motivo de todo o resto deste arquivo: a
 * explicação tem que bater com a decisão. Uma frase gerada por IA soaria melhor e, de vez
 * em quando, justificaria uma escolha que o código não fez -- e aí o corretor confia numa
 * explicação que não corresponde ao vídeo dele. Também custaria uma chamada por foto.
 *
 * `repeticao` é quantas fotos DESTE mesmo ambiente já vieram antes: é o que transforma o
 * segundo quarto em "Segundo quarto, mantém a sequência" em vez de repetir a mesma frase.
 */
export function motivoDaCena(o: Olhada, indice: number, total: number, repeticao: number): string {
  if (o.ehClipe) return "Clipe que você enviou: entra como está.";
  if (o.eh360) return "Foto 360: a câmera passeia dentro dela.";
  if (o.ehPanoramica) return "Panorâmica: desliza de ponta a ponta em vez de aproximar.";

  // A POSIÇÃO VEM ANTES DA REPETIÇÃO. A última cena de um conjunto com dois quintais dizia
  // "Segundo quintal, mantém a sequência" e engolia a única informação que importava ali:
  // que é ela que fecha o vídeo. Abrir e fechar são funções; ser o segundo quarto é detalhe.
  if (indice === 0) return `${abreCom(o.ambiente)} Abre o vídeo.`;
  if (indice === total - 1) return `${fechaCom(o.ambiente)} Fecha o vídeo.`;

  const nome = (o.ambiente && NOME_DO_AMBIENTE[o.ambiente]) || "Ambiente";
  if (repeticao > 0) return `${maisUm(nome, repeticao)}, mantém a sequência.`;

  const porQue = PORQUE_DO_AMBIENTE[o.ambiente ?? ""] ?? "Entra na ordem da visita.";
  // Nota alta é informação verificável: veio da conferência das fotos, não de opinião.
  return o.qualidade >= 8 ? `${porQue} Foto bem enquadrada.` : porQue;
}

/**
 * "Segunda cozinha", "Segundo quarto", "Mais uma área gourmet".
 *
 * O gênero sai do NOME que vai aparecer na frase, não da chave do ambiente -- "jantar" vira
 * "Sala de jantar" e "gourmet" vira "Área gourmet", os dois femininos apesar da chave. Sem
 * isto a tela escrevia "Segundo cozinha", que é o tipo de erro que faz um corretor brasileiro
 * fechar a aba: ele não pensa "bug", pensa "isso aqui foi robô que escreveu".
 *
 * Do terceiro em diante vira "Mais um/uma" de propósito: o ordinal de posição 4 é "Quarto", e
 * "Quarto quarto" não é frase que se escreva.
 */
function maisUm(nome: string, repeticao: number): string {
  const f = FEMININO.has(nome);
  if (repeticao === 1) return `${f ? "Segunda" : "Segundo"} ${nome.toLowerCase()}`;
  if (repeticao === 2) return `${f ? "Terceira" : "Terceiro"} ${nome.toLowerCase()}`;
  return `Mais ${f ? "uma" : "um"} ${nome.toLowerCase()}`;
}

/** Os nomes de ambiente que pedem artigo feminino. É a lista, porque regra de terminação erra. */
const FEMININO = new Set(["Fachada", "Entrada", "Sala", "Sala de jantar", "Cozinha", "Área de serviço", "Varanda", "Área gourmet", "Piscina", "Academia"]);

/** Por que a foto merece ABRIR: é o quadro que aparece antes de alguém tocar no play. */
function abreCom(ambiente: string | null): string {
  switch (ambiente) {
    case "fachada":
      return "Mostra a casa inteira antes de entrar.";
    case "piscina":
    case "gourmet":
    case "quintal":
    case "varanda":
      return "Foto externa, com luz e espaço.";
    case "sala":
    case "integrado":
      return "O ambiente que mais decide a visita.";
    default:
      return "A melhor foto do conjunto.";
  }
}

/** Por que a foto merece FECHAR: é o último quadro antes da tela de contato. */
function fechaCom(ambiente: string | null): string {
  switch (ambiente) {
    case "piscina":
    case "gourmet":
    case "quintal":
    case "varanda":
      return "Área de lazer, a imagem que fica na cabeça.";
    case "salao":
    case "academia":
    case "playground":
      return "Área comum do prédio, o extra do imóvel.";
    default:
      return "Última parada do passeio.";
  }
}

/** A função de cada ambiente no meio do vídeo. Uma frase, sem adjetivo inventado. */
const PORQUE_DO_AMBIENTE: Record<string, string> = {
  fachada: "A casa por fora, antes de entrar.",
  entrada: "A chegada, como numa visita de verdade.",
  sala: "Ambiente social, onde a visita começa.",
  integrado: "Mostra a ligação entre os ambientes.",
  jantar: "Completa a parte social.",
  cozinha: "Cozinha: é onde se olha o acabamento.",
  escritorio: "Espaço de trabalho, hoje pesa na escolha.",
  quarto: "Quarto, a parte íntima da visita.",
  infantil: "Quarto de criança, para quem tem família.",
  closet: "Closet, item de acabamento.",
  banheiro: "Banheiro: acabamento e louças.",
  area_servico: "Área de serviço, a parte prática.",
  varanda: "Varanda, o respiro do imóvel.",
  gourmet: "Área gourmet, o espaço de receber.",
  quintal: "Área externa do imóvel.",
  piscina: "Piscina, o que mais chama atenção.",
  salao: "Salão de festas do prédio.",
  academia: "Academia do prédio.",
  playground: "Playground do prédio.",
};

/** O nome do ambiente. A legenda da IA só entra quando o ambiente não foi reconhecido. */
export function legendaDe(o: Olhada): string {
  if (o.ehClipe || o.eh360) return "";
  const nome = o.ambiente ? NOME_DO_AMBIENTE[o.ambiente] : null;
  if (nome) return nome;
  // Legenda da IA com número seria uma afirmação sobre o imóvel — isso já é cortado na
  // origem (book-ia), mas o corte é barato e a garantia é de quem escreve na tela.
  return /\d/.test(o.legenda) ? "" : o.legenda;
}

/**
 * O movimento da cena: TODA FOTO PASSEIA PRO LADO, alternando a direção.
 *
 * Pedido dele em 10/10/2026: "que todos os movimentos fossem passear pro lado, não importa
 * se direito ou esquerdo". Antes isto seguia o ambiente pelo mapa `MOVIMENTO` -- fachada e
 * sala AFASTAVAM pra revelar o espaço, cozinha e quarto APROXIMAVAM pro acabamento. Era
 * desenho deliberado e fica registrado aqui, porque a troca tem um custo: o movimento deixa
 * de comentar o que a foto mostra. O que se ganha é constância -- o vídeo inteiro com o
 * mesmo gesto, que é o que ele quis.
 *
 * ALTERNA em vez de fixar um lado só. "Não importa se direito ou esquerdo" libera a escolha,
 * e dez cenas deslizando todas pro mesmo lado viram esteira: a alternância dá respiro sem
 * desobedecer ao pedido. Pela POSIÇÃO, não por sorteio -- o mesmo conjunto de fotos tem que
 * dar o mesmo vídeo hoje e amanhã, que é a regra desta montagem inteira.
 *
 * 360 e clipe continuam parados: já têm movimento próprio, e empurrar outro por cima briga.
 */
export function efeitoDe(o: Olhada, indice = 0): EfeitoId {
  if (o.eh360 || o.ehClipe) return "parado";
  return indice % 2 === 0 ? "direita" : "esquerda";
}

/**
 * QUANTA PROFUNDIDADE A FOTO PRECISA TER pra a câmera avançar de verdade.
 *
 * Abaixo disto, avançar não revela nada que já esteja na foto -- e um modelo que "avança"
 * ali inventa cômodo, que é o que está proibido desde 24/09/2026.
 *
 * 6 é a borda que a própria escala do prompt desenha: 0-2 é parede de perto, 3-5 é cômodo
 * fechado com pouco espaço à frente, 6-10 é corredor, porta aberta pro fundo, vista que
 * continua. Avançar só vale a partir do 6.
 */
export const PROFUNDIDADE_PRA_AVANCAR = 6;

/**
 * O movimento de câmera da cena animada.
 *
 * A regra por AMBIENTE existe desde o começo e acerta no geral -- fachada pede sobrevoo,
 * banheiro pede aproximação. Mas ela erra no caso que ele reclamou em 12/10/2026: duas
 * fotos da MESMA sala, uma tirada da porta e outra de frente pra parede, recebiam o mesmo
 * "caminhar", e só a primeira tinha para onde caminhar. Medido: a área gourmet dele andou
 * 72,8 e uma sala larga, 31,2, com o mesmo ajuste e o mesmo modelo.
 *
 * Profundidade não é ambiente. Quando a visão respondeu (migração 19), ela manda: foto sem
 * fundo troca o avanço pelo zoom com profundidade, que não precisa de espaço à frente.
 * Quando não respondeu (`null`), nada muda -- vale a regra de ambiente, como antes.
 */
export function animacaoDe(o: Olhada): AnimacaoId {
  const a = o.ambiente ? ANIMACAO[o.ambiente] : null;
  const escolhido = a ?? "caminhar";
  const avanca = escolhido === "caminhar" || escolhido === "drone";
  if (avanca && typeof o.profundidade === "number" && o.profundidade < PROFUNDIDADE_PRA_AVANCAR) return "aproximar";
  return escolhido;
}

/** A foto tem fundo pra câmera andar? `null` quando a visão ainda não olhou. */
export function daPraAndar(o: Olhada): boolean | null {
  if (typeof o.profundidade !== "number") return null;
  return o.profundidade >= PROFUNDIDADE_PRA_AVANCAR;
}

/** Só pra tela: quantas fotos a visão ainda não viu (cada uma custa uma chamada). */
export function ambienteValido(v: unknown): boolean {
  return typeof v === "string" && (AMBIENTES as readonly string[]).includes(v);
}
