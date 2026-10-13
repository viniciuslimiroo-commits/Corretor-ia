// O CLIPE DA IA É CONFERIDO ANTES DE ENTRAR NO VÍDEO.
//
// Ele em 12/10/2026, depois de ver uma churrasqueira virar outra coisa no meio da cena:
// "independente do imóvel, quero que vc tente evitar possíveis erros que podem vir a
// acontecer".
//
// POR QUE NÃO DÁ PRA RESOLVER PEDINDO MELHOR. Três coisas medidas no mesmo dia, gerando de
// verdade na foto da cena 2 do tour dele:
//
//   - o modelo barato (wan 2.2 5b) DEFORMA construção: um braço curvo cresce do tijolo, e a
//     chaminé da área gourmet engorda ao longo do clipe;
//   - o modelo caro (wan 2.2 a14b) segura a geometria e INVENTA OBJETO: pôs um vulto escuro
//     no chão do quintal, e num quarto pôs um tripé com celular;
//   - o caro COM o negativo reforçado (acrescentando camera, tripod, pipe, pole, bending
//     structure, stretching brickwork) inventou de novo -- equipamento de ginástica no
//     quintal.
//
// Ou seja: o negativo é um PEDIDO, e o modelo atende quando quer. Trocar de modelo troca o
// tipo de erro, não tira o erro. O que não depende do imóvel nem do modelo é olhar o que
// voltou antes de entregar -- e é o que este arquivo faz.
//
// MEDIDO DUAS VEZES, e a segunda é a que vale.
//
// Primeiro em seis clipes soltos que eu já tinha julgado quadro a quadro: 5 de 6, errando só
// no clipe de maior movimento de câmera do projeto (ver o ponto cego em
// `scripts/testar-conferir-clipe.ts`).
//
// Depois -- porque ele pediu, "testa com um tour real pra ver quantas cenas reprovam" -- nas
// ONZE cenas do tour que gerou a queixa, com os clipes que já estavam guardados. Reprova 1,
// e é exatamente a cena 2: "churrasqueira de alvenaria apareceu no lugar da churrasqueira de
// madeira". As outras dez passam. Três perguntas por cena, todas iguais entre si.
//
// Esse segundo teste mudou três coisas que o primeiro dava por boas, e nenhuma teria
// aparecido sem ele: o modelo de visão (ver MODELO_CONFERENTE), a barra de "óbvio" e a
// direção do dano (sumir não conta). Antes deles, o tour reprovava 4 de 11 -- um banheiro
// porque o veio do mármore se redesenhou -- e deixava passar a churrasqueira.
//
// CUSTA QUASE NADA e só roda em clipe NOVO: frações de centavo contra um clipe de US$ 0,15.
// Clipe que veio do cache já passou por aqui uma vez -- perguntar de novo é pagar duas vezes
// pela mesma resposta, como na migração 12.

import fs from "node:fs";
import path from "node:path";
import { chamarSincrono } from "./fal";
import { rodarFfmpeg, sondarMidia } from "./ffmpeg";

// DOIS QUADROS: o primeiro e o de 80%. Cada número aqui foi medido, nenhum é escolhido.
//
// TRÊS QUADROS PIORA. Acrescentei um no meio, achando que pegaria a invenção que aparece e
// some antes do fim: nos mesmos seis clipes ela passou a aprovar os ruins. Uma sequência
// gradual se lê como "a câmera está andando e revelando" -- com duas pontas não há
// progressão pra justificar nada. Ou a coisa está nas duas, ou alguém a desenhou.
//
// E O ÚLTIMO QUADRO NÃO É O MELHOR SEGUNDO QUADRO. Medido nos seis, variando só o instante
// (com o modelo de visão antigo, mas a forma da curva é o que importa aqui):
//
//           50%    65%    80%    fim
//   ruins   3/4    3/4    4/4    3/4
//   bons    2/2    2/2    2/2    2/2
//
// Em 80% a deformação já se desenvolveu e o quadro ainda tem o bastante em comum com o
// primeiro pra comparação valer. No fim o modelo já moveu tanto a câmera que a diferença
// passa a ser explicada por ela -- a própria saída que a pergunta concede de propósito, pra
// não acusar clipe bom.
export const QUADROS_CONFERIDOS = 2;

/** A fração do clipe onde o segundo quadro é tirado. Medida, não escolhida: ver acima. */
export const FRACAO_DO_SEGUNDO_QUADRO = 0.8;

/**
 * A pergunta.
 *
 * O que ela precisa acertar é a DIFERENÇA entre a câmera ter andado (que é o produto) e o
 * imóvel ter mudado (que é o defeito). Por isso o último parágrafo: objeto que sai do quadro
 * porque a câmera andou não é invenção, e sem essa frase a visão acusaria todo clipe bom.
 */
export const PERGUNTA_DO_CONFERENTE = [
  "As duas imagens são o PRIMEIRO e o ÚLTIMO quadro de um vídeo curto feito a partir de uma foto de imóvel.",
  "A câmera se moveu; o imóvel NÃO podia mudar.",
  "Responda SÓ com um JSON, sem markdown:",
  // A DESCRIÇÃO VEM ANTES DO VEREDITO, e isso não é arrumação.
  //
  // Com o booleano primeiro, ela decide e só depois descreve -- e escreveu, na mesma
  // resposta, `inventou: false` junto de "churrasqueira apareceu". Descrevendo antes, a
  // conclusão sai do que ela acabou de escrever.
  '{"o_que":"<o que mudou, até 10 palavras>","inventou":<true|false>}',
  "inventou = true se na segunda imagem aparece pessoa, animal, veículo, equipamento, móvel ou estrutura que não existe na primeira,",
  // "VIROU OUTRA COISA" É O CASO MAIS COMUM, e o que eu tinha escrito não o cobria.
  //
  // A primeira versão só falava em parte construída mudando de forma. Na cena 2 do tour dele,
  // o que muda é um BANCO de madeira encostado na parede que vira uma churrasqueira de tijolo
  // com chaminé e rodinhas. A visão descreveu a churrasqueira com todas as letras e respondeu
  // `inventou: false` -- porque naquele ponto da foto existe um objeto, então ela entendeu
  // "estava lá, a câmera revelou". Não apareceu do nada: TRANSFORMOU. É outra pergunta.
  "ou se alguma coisa que já estava lá mudou de forma, de tamanho ou VIROU OUTRO OBJETO -- um banco que vira churrasqueira, um pilar que engrossa, um móvel que cresce, um telhado que entorta --, de um jeito que a perspectiva não explica.",
  // SEM ESTAS DUAS LINHAS ELA PERDOA A PIOR INVENÇÃO QUE EXISTE AQUI.
  //
  // Medido no tour de 11 cenas dele: na cena 2, um banquinho encostado na parede de tijolo
  // vira uma churrasqueira com chaminé e rodas ao longo do clipe -- e a conferência APROVOU,
  // porque a coisa cresce de trás de um pilar e isso se lê como "a câmera revelou". É
  // literalmente a queixa dele ("a churrasqueira anda"), passando pela porta que eu abri.
  //
  // Num vídeo feito de UMA foto, revelar não existe: o que não está na foto, o modelo
  // desenhou. É a regra que ele deu em 24/09/2026 ("se não tiver informações do ambiente não
  // inventar") e a mesma que o negativo já pede ao gerador.
  "O vídeo foi feito de UMA foto só: o que não está na primeira imagem não existe no imóvel.",
  "Por isso coisa que APARECE de trás de uma parede, pilar ou móvel, ou que entra pela borda, TAMBÉM é invenção, mesmo parecendo que a câmera revelou.",
  "inventou = false se as mesmas coisas continuam lá, só mais perto, mais longe ou de lado.",
  // A saída que evita acusar clipe bom, e que só vale pra quem SAI: a câmera andando tira
  // coisa do quadro o tempo todo, e sem esta linha todo clipe com movimento reprova.
  // SÓ CONTA O QUE APARECE OU O QUE VIRA OUTRA COISA. Sumir, não.
  //
  // As duas acusações duvidosas do tour dele eram "churrasqueira e bancada sumiram" e
  // "bancada diminuiu" -- exatamente o que uma câmera andando pra frente faz com o que fica
  // para trás, e indistinguível disso em dois quadros. O dano que ele quer evitar tem direção:
  // um anúncio que MOSTRA o que a casa não tem é propaganda enganosa; um que deixa de mostrar
  // um canto é só um vídeo curto.
  "Coisa que sumiu, encolheu, ficou para trás ou saiu pela borda NÃO é invenção: a câmera andou.",
  "Só conta o que APARECEU onde não havia nada, ou o que VIROU OUTRA COISA.",
  // A BARRA DE "ÓBVIO", que é o que separa defeito de ruído.
  //
  // Sem ela o julgamento acusa demais. Medido no tour de 11 cenas: ele reprovou um banheiro
  // porque o veio do mármore se redesenhou e uma cozinha porque a bancada "mudou de forma" --
  // coisas que ninguém vê rodando o vídeo. Reprovar sai caro duas vezes: paga outra geração e
  // pode acabar trocando por foto parada uma cena que estava boa, que é a queixa de origem.
  //
  // O alvo é o que ele viu e nomeou: uma coisa virando outra coisa.",
  "Só responda true se a mudança for ÓBVIA e GROSSEIRA -- uma coisa virando outra, uma estrutura se desfazendo, um objeto grande surgindo do nada.",
  "Diferença de textura, de nitidez, de luz, de sombra, de desenho de pedra ou madeira, e enquadramento, NÃO contam: responda false.",
].join("\n");

/**
 * O modelo de visão. NÃO é o mesmo que lê as fotos do book, e a diferença foi medida.
 *
 * O `flash-lite` (que o book usa) julga mal E instável. No tour de 11 cenas dele, no clipe em
 * que o banco vira churrasqueira: três perguntas iguais, com `temperature: 0`, deram REPROVA,
 * limpo, REPROVA. Ele chegou a escrever `{"o_que":"churrasqueira apareceu","inventou":false}`
 * -- descreve a invenção e absolve na mesma linha.
 *
 * O `flash` deu REPROVA nas três, e nas cenas limpas deu limpo nas três.
 *
 * Custa alguns centésimos de centavo a mais por cena, contra um clipe de US$ 0,15 e 2 créditos
 * cobrados. Economizar aqui é economizar no único lugar que decide se o vídeo sai com defeito.
 */
export const MODELO_CONFERENTE = "google/gemini-2.5-flash";

export type Veredito = {
  /** false SÓ quando a visão afirmou que mudou o imóvel. Dúvida, erro e silêncio aprovam. */
  aprovado: boolean;
  /** O que ela disse ter visto, pra caber no aviso da tela. Vazio quando aprovou. */
  achado: string;
  /** false quando nem deu pra perguntar -- usado nos testes e no registro, não na decisão. */
  respondeu: boolean;
};

const APROVADO: Veredito = { aprovado: true, achado: "", respondeu: true };

/**
 * Lê o veredito do texto que voltou.
 *
 * APROVA NA DÚVIDA, e isso é a regra mais importante daqui. Se a visão cair, estourar o
 * tempo ou devolver qualquer coisa que não dê pra ler, o clipe passa. Um conferente que
 * reprova quando ELE falha transformaria uma pane no fal em "todo vídeo saiu como foto" --
 * um defeito maior do que o que ele foi feito pra evitar, e em cima de clipe que a pessoa
 * já pagou.
 */
export function vereditoDaResposta(texto: string): Veredito {
  const bloco = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) return { ...APROVADO, respondeu: false };
  let o: { inventou?: unknown; o_que?: unknown };
  try {
    o = JSON.parse(bloco) as typeof o;
  } catch {
    return { ...APROVADO, respondeu: false };
  }
  // `inventou` tem de ser o booleano true. Texto "true", 1 e "sim" NÃO reprovam: se o
  // formato mudou, eu não sei mais o que ela quis dizer, e na dúvida o clipe passa.
  if (o.inventou !== true) return { ...APROVADO, respondeu: typeof o.inventou === "boolean" };
  const achado = typeof o.o_que === "string" ? o.o_que.trim().slice(0, 90) : "";
  return { aprovado: false, achado, respondeu: true };
}

/**
 * Os dois instantes, em segundos, pra um clipe que de fato dura `duracao`.
 *
 * A duração tem de ser a do ARQUIVO, não a que foi pedida: o fal entrega 4,02 s quando se
 * pede 4, e 80% de um número errado não é 80%. Quem chama mede com `sondarMidia` antes.
 */
export function instantesDosQuadros(duracao: number): [number, number] {
  const d = Number.isFinite(duracao) && duracao > 0.5 ? duracao : 3;
  return [0.1, Math.max(0.3, d * FRACAO_DO_SEGUNDO_QUADRO)];
}

type Perguntar = (imagens: string[]) => Promise<string>;

/**
 * Confere um clipe que acabou de voltar da IA.
 *
 * `perguntar` existe pro teste poder rodar sem gastar: o caminho de verdade é o de baixo.
 */
export async function conferirClipe(opts: {
  clipe: string;
  duracao: number;
  falKey: string;
  pasta: string;
  perguntar?: Perguntar;
}): Promise<Veredito> {
  const { clipe, duracao, falKey, pasta } = opts;
  const perguntar =
    opts.perguntar ??
    (async (imagens) => {
      const r = (await chamarSincrono(
        "fal-ai/any-llm/vision",
        {
          model: MODELO_CONFERENTE,
          prompt: PERGUNTA_DO_CONFERENTE,
          image_urls: imagens,
          // Zero porque a mesma dupla de quadros tem de dar o mesmo veredito: uma reprovação
          // que vai e volta entre duas gerações iguais é impossível de depurar depois.
          temperature: 0,
          max_tokens: 120,
        },
        falKey,
        60_000
      )) as { output?: string };
      return String(r?.output ?? "");
    });

  let imagens: string[];
  try {
    // A duração do ARQUIVO manda. Se a sonda não responder, vale a pedida -- erra uns
    // décimos, e o instante segue dentro do clipe.
    const sonda = await sondarMidia(clipe).catch(() => ({ duracao: null }));
    const arquivos: string[] = [];
    for (const [k, t] of instantesDosQuadros(sonda.duracao ?? duracao).entries()) {
      const f = path.join(pasta, `conf-${k}.jpg`);
      await rodarFfmpeg(["-ss", t.toFixed(2), "-i", clipe, "-frames:v", "1", "-vf", "scale=512:-2", "-y", f], 60_000);
      if (fs.existsSync(f) && fs.statSync(f).size > 0) arquivos.push(f);
    }
    // Menos de dois quadros não é comparação: sem base pra reprovar, aprova.
    if (arquivos.length < QUADROS_CONFERIDOS) return { ...APROVADO, respondeu: false };
    imagens = arquivos.map((f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}`);
  } catch {
    return { ...APROVADO, respondeu: false };
  }

  try {
    return vereditoDaResposta(await perguntar(imagens));
  } catch {
    return { ...APROVADO, respondeu: false };
  }
}

/**
 * O que fazer com um clipe REPROVADO, sabendo quantas vezes esta cena já foi refeita.
 *
 * Mora aqui, fora do pipeline, porque é a parte que erra calada: um off-by-one no teto faz a
 * cena refazer pra sempre, e cada volta paga outro clipe no fal sem ninguém ver -- o vídeo só
 * demora. O pipeline tem banco e fal no meio e não dá pra testar de graça; isto dá.
 *
 * `jaRefeitas` é quantas refeitas JÁ aconteceram, não a que está sendo decidida: contar a
 * atual foi o jeito de errar que eu quis tirar do caminho.
 */
export function destinoDoReprovado(jaRefeitas: number, teto: number): "refazer" | "foto" {
  const limite = Number.isFinite(teto) && teto > 0 ? Math.floor(teto) : 0;
  // CONTAGEM ILEGÍVEL CAI PRO LADO QUE NÃO GASTA. Se o número guardado não dá pra somar
  // (NaN, infinito), tratá-lo como zero faria a cena refazer, gravar um número igualmente
  // ilegível e refazer de novo -- de graça pra quem olha a tela, que só vê o vídeo demorando,
  // e US$ 0,15 por volta pra nós. Entre repetir à toa e entregar uma foto, entrega a foto.
  if (!Number.isFinite(jaRefeitas)) return "foto";
  return Math.max(0, Math.floor(jaRefeitas)) < limite ? "refazer" : "foto";
}

/** Quantas refeitas CONTAM, lido do JSON do pipeline, que pode trazer qualquer coisa. */
export function refeitasJaFeitas(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** O recado da cena que desistiu, pra lista de avisos do vídeo. */
export function avisoDeReprovado(cenaZeroBase: number, achado: string): string {
  const oque = achado.trim() || "apareceu coisa que não está na foto";
  return `Cena ${cenaZeroBase + 1}: a IA mudou o imóvel (${oque}); ficou como foto e o crédito voltou.`;
}
