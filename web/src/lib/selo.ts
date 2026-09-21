import sharp from "sharp";
import { ACOES_POR_ID } from "./acoes";
import { larguraDoTexto, textoSvg } from "./texto-svg";
import { AVISO_IMAGEM, type Idioma } from "@/i18n/idiomas";

// Selo de "imagem ilustrativa" (Sprint 4 do plano, puxado pra cá porque é pré-requisito
// pra colocar o produto na mão de corretor de verdade).
//
// Por que existe: anúncio de imóvel com foto alterada por IA e sem aviso é propaganda
// enganosa. O corretor é quem responde pelo anúncio, então o produto tem que carimbar
// sozinho -- se depender de ele lembrar de escrever "imagem ilustrativa" na descrição,
// uma hora não escreve.
//
// Por que o texto MUDA por ação, em vez de um carimbo genérico: o aviso tem que
// descrever o que foi alterado de verdade. "Mobília virtual" numa foto onde só
// trocamos o céu é um aviso errado, e aviso errado não protege ninguém.
//
// Por que "melhorar" NÃO leva selo: essa ação só corrige exposição, balanço de branco e
// ruído. Não inventa nem remove nada da cena -- é o mesmo que revelar a foto direito, o
// que todo fotógrafo de imóvel faz. Carimbar "imagem ilustrativa" nela seria pior que
// não carimbar: sujaria uma foto honesta e ensinaria o comprador a ignorar o selo
// justamente nas fotos em que ele importa.
// O texto de cada ação mora no catálogo (acoes.ts), ao lado do prompt que a define.
//
// `seloDoJob` vem gravado na linha do job e VENCE o catálogo: quem criou o job sabe o que
// foi feito ali. É o que permite avisos que o catálogo de fotos não tem como saber -- o
// mais importante deles, na casa desenhada num terreno vazio, é dizer que a casa não está
// incluída. O genérico "editada digitalmente" não avisa isso, e é justamente esse o aviso
// que protege o corretor.
//
// Ação desconhecida e sem selo próprio recebe o genérico: na dúvida, avisar é o lado seguro.
export function textoDoSelo(acao: string, seloDoJob?: string | null, idioma: Idioma = "pt"): string | null {
  if (typeof seloDoJob === "string" && seloDoJob.trim()) return seloDoJob.trim();
  const def = ACOES_POR_ID[acao];
  // Fora do português, o aviso GENÉRICO da língua, e não o específico da ação.
  //
  // O aviso vai QUEIMADO na imagem e é o que protege o corretor; metade dele em
  // português dentro de um material em espanhol não protege ninguém e ainda parece
  // erro. O específico ("a casa não está incluída") é mais informativo e volta pra cada
  // idioma quando os catálogos de ação forem traduzidos -- até lá, dizer que a imagem
  // foi editada digitalmente, na língua certa, é o mínimo correto.
  if (idioma !== "pt") return AVISO_IMAGEM[idioma].generico;
  return def ? def.selo : AVISO_IMAGEM.pt.generico;
}

type Geometria = {
  margem: number;
  fonte: number;
  padX: number;
  padY: number;
  larguraCaixa: number;
  alturaCaixa: number;
  /** Canto superior esquerdo da caixa dentro da imagem. */
  top: number;
  left: number;
};

/**
 * Onde a caixa do selo cai e que tamanho tem, dado o tamanho da imagem e o texto.
 *
 * É uma função separada porque DOIS lugares precisam da mesma resposta: quem carimba e
 * quem, mais tarde, precisa saber exatamente que retângulo cobrir antes de mandar a
 * imagem de volta pra IA. Se os dois calculassem por conta própria, uma mudança no
 * tamanho da fonte aqui deixaria um pedaço de selo pra trás lá.
 */
export function geometriaDoSelo(largura: number, altura: number, texto: string): Geometria {
  // Tamanho da fonte proporcional à imagem, com dois limites: nunca tão pequeno que
  // fique ilegível numa thumb, nunca tão largo que a caixa não caiba na foto.
  const margem = Math.max(8, Math.round(largura * 0.015));
  const larguraDisponivel = largura - margem * 2;
  const fonteProporcional = Math.round(largura * 0.016);
  const fonteQueCabe = Math.floor(larguraDisponivel / (larguraDoTexto(texto, 100) / 100 + 1.6));
  const fonte = Math.max(10, Math.min(fonteProporcional, fonteQueCabe));

  const padX = Math.round(fonte * 0.8);
  const padY = Math.round(fonte * 0.5);
  const larguraCaixa = Math.min(Math.round(larguraDoTexto(texto, fonte)) + padX * 2, larguraDisponivel);
  const alturaCaixa = fonte + padY * 2;

  return {
    margem,
    fonte,
    padX,
    padY,
    larguraCaixa,
    alturaCaixa,
    top: Math.max(0, altura - alturaCaixa - margem),
    left: Math.max(0, largura - larguraCaixa - margem),
  };
}

/**
 * Carimba o selo no canto inferior direito e devolve o JPEG final.
 *
 * O selo é QUEIMADO no pixel, de propósito: se fosse sobreposição de CSS na tela, sumia
 * no download, que é exatamente o arquivo que vai pro anúncio. Fica no canto inferior
 * direito porque é onde os portais menos cortam a miniatura (eles cortam o topo pra
 * gerar thumb) e onde menos atrapalha o cômodo.
 *
 * Se `texto` for null (ação que não altera a realidade), devolve os bytes intactos.
 */
export async function aplicarSelo(bytes: Buffer, texto: string | null): Promise<Buffer> {
  if (!texto) return bytes;

  const meta = await sharp(bytes).metadata();
  const largura = meta.width ?? 0;
  const altura = meta.height ?? 0;
  if (!largura || !altura) return bytes;

  const g = geometriaDoSelo(largura, altura, texto);

  const svg = Buffer.from(
    `<svg width="${g.larguraCaixa}" height="${g.alturaCaixa}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${g.larguraCaixa}" height="${g.alturaCaixa}" rx="${Math.round(
        g.alturaCaixa * 0.25
      )}" fill="#000000" fill-opacity="0.55"/>` +
      textoSvg(texto, { x: g.padX, y: Math.round(g.padY + g.fonte * 0.78), corpo: g.fonte, cor: "#ffffff" }) +
      `</svg>`
  );

  return sharp(bytes)
    .composite([{ input: svg, top: g.top, left: g.left }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

type Retangulo = { left: number; top: number; width: number; height: number };

/**
 * Cobre a caixa do selo, pra a imagem poder voltar pra IA sem o aviso junto.
 *
 * Existe por causa da obra no terreno, que é encadeada: a etapa seguinte recebe a imagem
 * da anterior, e a anterior já saiu carimbada. O modelo então REDESENHAVA o "Imagem
 * ilustrativa" e o app carimbava outro por cima -- dois avisos sobrepostos. Pedir no
 * prompt pra não copiar funcionou em metade das rodadas, que é o mesmo que não funcionar.
 * O refinar tem o mesmo problema pelo mesmo motivo: a entrada dele é um resultado.
 *
 * Não é "tirar o selo": nada é guardado assim. Isto roda sobre a cópia que vai como
 * ENTRADA da próxima etapa, e a saída dela é carimbada de novo, como toda imagem de IA.
 * A única cópia que existe no storage continua tendo o aviso queimado no pixel.
 *
 * Duas decisões que o teste real obrigou:
 *
 * 1. Cobrir SÓ a caixa, não a faixa inteira do rodapé. A primeira versão cobria a
 *    largura toda, e o modelo -- que preserva o que não foi pedido pra mudar -- devolvia
 *    o rodapé inteiro com a cobertura, visível na imagem final. Com `texto`, a caixa é
 *    calculada pela MESMA função que carimbou, e o que se cobre é ela e uma folga fina.
 *    O selo novo cai exatamente em cima desse retângulo, escondendo o remendo.
 *
 * 2. Preencher com DESFOQUE do trecho logo acima, não com o espelho dele. O espelho
 *    tinha a intenção certa (continuação plausível da foto, que o modelo não copia como
 *    tarja) mas deixava uma simetria que se enxerga -- piso em espinha virando chevron.
 *    Um borrão da mesma cor e luz é anônimo: o modelo o lê como foreground fora de foco.
 *
 * Sem `texto` (quem chama não sabe o que foi carimbado) cai na faixa inteira, como
 * antes -- pior, mas ainda remove o aviso, que é o que não pode entrar no modelo.
 */
export async function limparFaixaDoSelo(bytes: Buffer, texto?: string | null): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const largura = meta.width ?? 0;
  const altura = meta.height ?? 0;
  if (!largura || !altura) return bytes;

  let alvo: Retangulo;
  if (texto) {
    const g = geometriaDoSelo(largura, altura, texto);
    // A folga cobre o anti-aliasing da borda arredondada e o sangramento do JPEG.
    const folga = Math.max(2, Math.round(g.margem * 0.4));
    const left = Math.max(0, g.left - folga);
    const top = Math.max(0, g.top - folga);
    alvo = {
      left,
      top,
      width: Math.min(largura - left, g.larguraCaixa + folga * 2),
      height: Math.min(altura - top, g.alturaCaixa + folga * 2),
    };
  } else {
    const margem = Math.max(8, Math.round(largura * 0.015));
    const alturaCaixa = Math.round(largura * 0.016) * 2;
    const faixa = Math.min(altura - 1, Math.round((alturaCaixa + margem * 2) * 1.4));
    alvo = { left: 0, top: altura - faixa, width: largura, height: faixa };
  }
  if (alvo.width < 4 || alvo.height < 4) return bytes;

  // A fonte do remendo é o mesmo retângulo, deslocado pra cima até sair de cima da caixa.
  // Numa imagem baixa demais pra isso, sobe o que der.
  const fonteTop = Math.max(0, alvo.top - alvo.height);

  // Desfoca com sobra em volta e recorta depois: desfocar o recorte exato deixaria as
  // bordas do remendo escurecidas/estendidas pelo próprio filtro.
  const sigma = Math.max(2, Math.round(alvo.height / 3));
  const sobra = sigma * 2;
  const areaLeft = Math.max(0, alvo.left - sobra);
  const areaTop = Math.max(0, fonteTop - sobra);
  const areaRight = Math.min(largura, alvo.left + alvo.width + sobra);
  const areaBottom = Math.min(altura, fonteTop + alvo.height + sobra);

  const desfocado = await sharp(bytes)
    .extract({ left: areaLeft, top: areaTop, width: areaRight - areaLeft, height: areaBottom - areaTop })
    .blur(sigma)
    .toBuffer();
  const remendo = await sharp(desfocado)
    .extract({ left: alvo.left - areaLeft, top: fonteTop - areaTop, width: alvo.width, height: alvo.height })
    .toBuffer();

  return sharp(bytes)
    .composite([{ input: remendo, top: alvo.top, left: alvo.left }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
