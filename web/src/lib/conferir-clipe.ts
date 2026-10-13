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
// MEDIDO em 12/10/2026, nos seis clipes reais que eu já tinha julgado olhando quadro a
// quadro: 6 de 6. Nos três ruins ela disse o que viu ("um robô apareceu", "equipamento de
// ginástica apareceu no quintal", "tripé com celular apareceu no cômodo") e nos três bons
// não acusou nada, descrevendo só o movimento da câmera. Não é chute: ela nomeia o achado.
//
// CUSTA QUASE NADA e só roda em clipe NOVO. É a mesma visão que já lê cada foto no book
// (gemini flash lite, frações de centavo) contra um clipe de IA que custou US$0,15. Clipe
// que veio do cache já passou por aqui uma vez -- perguntar de novo é pagar duas vezes pela
// mesma resposta, como na migração 12.

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
// E O ÚLTIMO QUADRO NÃO É O MELHOR SEGUNDO QUADRO. Medido nos seis, variando só o instante:
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
  '{"inventou":<true|false>,"o_que":"<até 10 palavras>"}',
  "inventou = true se na segunda imagem aparece pessoa, animal, veículo, equipamento, móvel ou estrutura que não existe na primeira,",
  "ou se alguma parte construída (parede, pilar, chaminé, telhado, batente, corrimão) mudou de forma, grossura ou proporção de um jeito que a perspectiva não explica.",
  "inventou = false se a diferença é só a câmera ter chegado mais perto, mais longe ou para o lado, com as mesmas coisas.",
  "Objeto que SAIU do quadro porque a câmera andou NÃO é invenção.",
].join("\n");

/** O modelo de visão: o mesmo que já lê as fotos do book. */
export const MODELO_CONFERENTE = "google/gemini-2.5-flash-lite";

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
