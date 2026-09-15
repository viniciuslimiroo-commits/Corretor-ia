import sharp from "sharp";
import { ACOES_POR_ID } from "./acoes";

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
export function textoDoSelo(acao: string, seloDoJob?: string | null): string | null {
  if (typeof seloDoJob === "string" && seloDoJob.trim()) return seloDoJob.trim();
  const def = ACOES_POR_ID[acao];
  return def ? def.selo : "Imagem ilustrativa · editada digitalmente";
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  // Tamanho da fonte proporcional à imagem, com dois limites: nunca tão pequeno que
  // fique ilegível numa thumb, nunca tão largo que a caixa não caiba na foto.
  const margem = Math.max(8, Math.round(largura * 0.015));
  const larguraDisponivel = largura - margem * 2;
  const fonteProporcional = Math.round(largura * 0.016);
  const fonteQueCabe = Math.floor(larguraDisponivel / (texto.length * 0.52 + 1.6));
  const fonte = Math.max(10, Math.min(fonteProporcional, fonteQueCabe));

  const padX = Math.round(fonte * 0.8);
  const padY = Math.round(fonte * 0.5);
  const larguraCaixa = Math.min(
    Math.round(texto.length * fonte * 0.52) + padX * 2,
    larguraDisponivel
  );
  const alturaCaixa = fonte + padY * 2;

  const svg = Buffer.from(
    `<svg width="${larguraCaixa}" height="${alturaCaixa}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${larguraCaixa}" height="${alturaCaixa}" rx="${Math.round(
        alturaCaixa * 0.25
      )}" fill="#000000" fill-opacity="0.55"/>` +
      `<text x="${padX}" y="${Math.round(padY + fonte * 0.78)}" ` +
      `font-family="DejaVu Sans, Verdana, Arial, Helvetica, sans-serif" ` +
      `font-size="${fonte}" fill="#ffffff">${escaparXml(texto)}</text>` +
      `</svg>`
  );

  return sharp(bytes)
    .composite([
      {
        input: svg,
        top: Math.max(0, altura - alturaCaixa - margem),
        left: Math.max(0, largura - larguraCaixa - margem),
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Cobre a faixa onde o selo mora, pra a imagem poder voltar pra IA sem o aviso junto.
 *
 * Existe por causa da obra no terreno, que é encadeada: a etapa seguinte recebe a imagem
 * da anterior, e a anterior já saiu carimbada. O modelo então REDESENHAVA o "Imagem
 * ilustrativa" e o app carimbava outro por cima -- dois avisos sobrepostos. Pedir no
 * prompt pra não copiar funcionou em metade das rodadas, que é o mesmo que não funcionar.
 *
 * Não é "tirar o selo": nada é guardado assim. Isto roda sobre a cópia que vai como
 * ENTRADA da próxima etapa, e a saída dela é carimbada de novo, como toda imagem de IA.
 * A única cópia que existe no storage continua tendo o aviso queimado no pixel.
 *
 * A faixa é preenchida com o espelho dos pixels logo acima dela: o modelo recebe
 * continuação plausível da foto em vez de uma tarja, que ele copiaria igual.
 */
export async function limparFaixaDoSelo(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const largura = meta.width ?? 0;
  const altura = meta.height ?? 0;
  if (!largura || !altura) return bytes;

  // Mesma geometria de `aplicarSelo`, com folga: o tamanho da caixa depende do texto, e
  // aqui não se sabe qual era. Errar pra mais custa uma tira de céu ou de asfalto.
  const margem = Math.max(8, Math.round(largura * 0.015));
  const alturaCaixa = Math.round(largura * 0.016) * 2;
  const faixa = Math.min(altura - 1, Math.round((alturaCaixa + margem * 2) * 1.4));
  if (faixa < 4) return bytes;

  const espelho = await sharp(bytes)
    .extract({ left: 0, top: altura - faixa * 2, width: largura, height: faixa })
    .flip()
    .toBuffer();

  return sharp(bytes)
    .composite([{ input: espelho, top: altura - faixa, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
