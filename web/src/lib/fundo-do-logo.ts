/**
 * TIRAR O FUNDO DO LOGO, pra ele virar marca d'água de verdade.
 *
 * POR QUE EXISTE (10/10/2026): ele subiu o logo da imobiliária -- dourado sobre um fundo
 * escuro, quadrado, sem transparência -- e a marca d'água saiu como um SELO RETANGULAR por
 * cima do imóvel. Perguntou: "não pode ter opção de você transformar no SaaS a logo em
 * marca d'água?". Pode, e é aqui.
 *
 * COMO: a cor do fundo é lida dos QUATRO CANTOS, não escolhida por quem programou. Pixel
 * perto dessa cor vira transparente; pixel na faixa seguinte vira meio transparente, que é
 * o que evita a borra serrilhada em volta da letra. Tudo determinístico e local -- sem IA,
 * sem rede, sem crédito. O logo de um corretor é desenho chapado ou selo sobre fundo liso
 * em quase todo caso, e para esses a conta simples acerta.
 *
 * O QUE NÃO FAZ: fundo que é foto, ou logo cujo fundo tem a mesma cor de parte do desenho.
 * Nesses `valeTirarFundo` devolve `false` com o motivo, e a tela não oferece -- oferecer e
 * entregar um buraco no meio da letra é pior que não oferecer.
 */

export type Rgb = [number, number, number];

/** 1,0 = igual. Distância euclidiana em RGB, que basta pra fundo chapado. */
export function distancia(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A cor do fundo, lida dos quatro cantos, e o quanto eles discordam entre si.
 *
 * `desvio` é o que separa "fundo chapado" de "fundo que é um degradê ou uma foto". O logo
 * dele tem degradê (topo rgb(50,56,71), base rgb(11,12,14), desvio ~50) e MESMO ASSIM sai
 * limpo com tolerância alta -- por isso o desvio entra na conta da tolerância em vez de
 * reprovar sozinho.
 */
export function fundoDosCantos(
  dados: Uint8Array | Buffer,
  largura: number,
  altura: number,
  canais: number
): { cor: Rgb; desvio: number } {
  const em = (x: number, y: number): Rgb => {
    const i = (y * largura + x) * canais;
    return [dados[i], dados[i + 1], dados[i + 2]];
  };
  const m = 2;
  const cantos: Rgb[] = [em(m, m), em(largura - 1 - m, m), em(m, altura - 1 - m), em(largura - 1 - m, altura - 1 - m)];
  const cor: Rgb = [0, 1, 2].map((k) => Math.round(cantos.reduce((s, c) => s + c[k], 0) / 4)) as Rgb;
  const desvio = Math.max(...cantos.map((c) => distancia(c, cor)));
  return { cor, desvio };
}

/**
 * A PARTIR DE QUE ALFA um pixel conta como DESENHO. Um número só, usado por todo mundo.
 *
 * Eram dois, e isso deu defeito: a limpeza contava desenho acima de 120, o contorno acima
 * de 90. Os restos de textura no meio (alfa entre 90 e 120) escapavam da limpeza E eram
 * contornados -- então sumiam na versão limpa e REAPARECIAM na contornada, exatamente onde
 * eu tinha acabado de dizer que não havia mais sujeira. Dois limiares pra mesma pergunta
 * são duas respostas diferentes esperando a hora de discordar.
 */
const PISO_DESENHO = 110;

/** Acima disto os cantos não descrevem um fundo: são partes diferentes de uma imagem. */
const DESVIO_MAX = 90;
/** Abaixo disto o "fundo" ocupa tão pouco que ou já há recorte, ou o logo preenche a arte. */
const FRACAO_MIN = 0.12;

export type Veredito = { vale: true; cor: Rgb; tolerancia: number; fracao: number } | { vale: false; motivo: string };

/**
 * Vale a pena oferecer? Responde ANTES de processar, pra tela não prometer o que não
 * entrega. `fracaoOpaca` é quanto do logo já é transparente: logo que já veio recortado
 * não precisa de nada.
 */
export function valeTirarFundo(
  dados: Uint8Array | Buffer,
  largura: number,
  altura: number,
  canais: number,
  jaTransparente: number
): Veredito {
  if (jaTransparente > 0.05) return { vale: false, motivo: "Este logo já tem fundo transparente." };
  const { cor, desvio } = fundoDosCantos(dados, largura, altura, canais);
  if (desvio > DESVIO_MAX) return { vale: false, motivo: "Os cantos do logo são muito diferentes entre si: não dá pra saber o que é fundo sem arriscar comer parte do desenho." };
  // Tolerância cresce com o desvio: fundo em degradê precisa de mais folga que fundo chapado.
  const tolerancia = Math.min(120, Math.max(50, Math.round(desvio * 1.6 + 45)));
  const total = largura * altura;
  let perto = 0;
  for (let i = 0; i < dados.length; i += canais) {
    if (distancia([dados[i], dados[i + 1], dados[i + 2]], cor) < tolerancia) perto++;
  }
  const fracao = perto / total;
  if (fracao < FRACAO_MIN) return { vale: false, motivo: "Quase não há fundo pra tirar: o desenho ocupa o quadro inteiro." };
  // Fundo quase total significa que o "desenho" é que foi confundido com fundo.
  if (fracao > 0.97) return { vale: false, motivo: "O logo inteiro tem a cor do fundo; tirar deixaria a imagem vazia." };
  return { vale: true, cor, tolerancia, fracao };
}

/**
 * Apaga o fundo, devolvendo os bytes RGBA.
 *
 * A FAIXA DE MEIO-TOM (de `tolerancia` a `tolerancia * 1.4`) não é refinamento: sem ela a
 * borda da letra fica serrilhada e o logo parece recortado com tesoura, que num vídeo de
 * imóvel chama mais atenção que o fundo que se queria tirar.
 */
export function tirarFundo(dados: Uint8Array | Buffer, canais: number, cor: Rgb, tolerancia: number): Buffer {
  const saida = Buffer.from(dados);
  const bordaAte = tolerancia * 1.4;
  for (let i = 0; i < saida.length; i += canais) {
    const d = distancia([saida[i], saida[i + 1], saida[i + 2]], cor);
    if (d < tolerancia) saida[i + 3] = 0;
    else if (d < bordaAte) saida[i + 3] = Math.round(255 * ((d - tolerancia) / (bordaAte - tolerancia)));
  }
  return saida;
}

/**
 * TIRAR A SUJEIRA que sobra do recorte.
 *
 * Fundo texturizado nunca sai inteiro: ficam pontinhos soltos, restos da textura que
 * passaram da tolerância. Medido no logo do dono (10/10/2026): 59 pedaços opacos, dos quais
 * 42 eram ilhas minúsculas somando 949 px -- 5,8% do que sobrou era lixo.
 *
 * A regra que separa lixo de desenho é o TAMANHO RELATIVO: o desenho é uma ilha grande (ou
 * algumas), a sujeira é pedacinho solto. Usar um número absoluto de pixels quebraria em
 * logo de outro tamanho; a fração da maior ilha acompanha.
 *
 * Preserva ilha pequena que esteja COLADA numa grande -- ela é parte do desenho (o pingo do
 * i, um detalhe do ícone), e some num limiar bobo de "menos de N pixels".
 */
export function tirarIlhasPequenas(
  dados: Buffer,
  largura: number,
  altura: number,
  canais: number,
  fracaoMinima = 0.015
): { saida: Buffer; tiradas: number; pixels: number } {
  const n = largura * altura;
  const opaco = new Uint8Array(n);
  for (let p = 0; p < n; p++) opaco[p] = dados[p * canais + 3] > PISO_DESENHO ? 1 : 0;

  const dono = new Int32Array(n).fill(-1);
  const tamanhos: number[] = [];
  for (let p = 0; p < n; p++) {
    if (!opaco[p] || dono[p] >= 0) continue;
    const id = tamanhos.length;
    let conta = 0;
    const pilha = [p];
    dono[p] = id;
    while (pilha.length) {
      const q = pilha.pop()!;
      conta++;
      const x = q % largura;
      const y = (q / largura) | 0;
      if (x + 1 < largura && opaco[q + 1] && dono[q + 1] < 0) { dono[q + 1] = id; pilha.push(q + 1); }
      if (x > 0 && opaco[q - 1] && dono[q - 1] < 0) { dono[q - 1] = id; pilha.push(q - 1); }
      if (y + 1 < altura && opaco[q + largura] && dono[q + largura] < 0) { dono[q + largura] = id; pilha.push(q + largura); }
      if (y > 0 && opaco[q - largura] && dono[q - largura] < 0) { dono[q - largura] = id; pilha.push(q - largura); }
    }
    tamanhos.push(conta);
  }
  if (tamanhos.length === 0) return { saida: dados, tiradas: 0, pixels: 0 };

  const maior = Math.max(...tamanhos);
  const corte = Math.max(8, Math.round(maior * fracaoMinima));
  const saida = Buffer.from(dados);
  let tiradas = 0;
  let pixels = 0;
  for (let p = 0; p < n; p++) {
    const id = dono[p];
    if (id >= 0 && tamanhos[id] < corte) {
      saida[p * canais + 3] = 0;
      pixels++;
    }
  }
  tiradas = tamanhos.filter((t) => t < corte).length;
  return { saida, tiradas, pixels };
}

/**
 * CONTORNO em volta do desenho, pra ele ser lido sobre qualquer foto.
 *
 * Pedido dele em 10/10/2026: "colocar cor branca nas palavras se necessário, sem mudar a
 * logo, pra aparecer mais". É isto -- e o "sem mudar a logo" é a parte importante: não se
 * pinta por cima do desenho, se desenha ATRÁS dele. O logo sai intacto; ganha uma auréola.
 *
 * Por que faz falta: o logo dele é DOURADO, e dourado sobre parede branca some. A marca
 * d'água só existe pra ser vista; contorno é o que a faz funcionar nos dois extremos (foto
 * clara e foto escura) sem a pessoa ter que escolher um logo por tipo de imóvel.
 *
 * O desenho da auréola é uma DILATAÇÃO do alfa: cada pixel vazio perto de um pixel cheio
 * vira contorno. Usa distância de Chebyshev (o quadrado em volta), que é mais barata que a
 * euclidiana e, em espessura de 2 a 4 px, indistinguível.
 */
/**
 * ESTE LOGO PRECISA DE CONTORNO? E de que cor?
 *
 * A pergunta parece ser sobre a COR do logo e não é. O do dono é dourado, média 183 --
 * quase tão claro quanto branco puro --, e mesmo assim o contorno ESTRAGA: medido em
 * 10/10/2026, ele vira mingau na parede clara e engole o "NEGÓCIOS IMOBILIÁRIOS" na foto
 * escura. Já um logo branco chapado sobre parede clara mede faixa de luminância 15 na
 * composição: é invisível, e com contorno escuro vai a 255.
 *
 * O que separa os dois é a FAIXA INTERNA: quanto o próprio logo varia entre seu ponto mais
 * claro e o mais escuro. O dourado dele mede 139 -- tem modelado, sombra, relevo, e por isso
 * se lê sobre qualquer coisa. O branco chapado mede 0: é uma mancha só, e mancha clara
 * sobre fundo claro não existe.
 *
 * Então: logo com modelado próprio não leva nada. Logo CHAPADO leva contorno no tom
 * OPOSTO -- escuro se ele é claro, claro se ele é escuro, porque preto chapado sobre foto
 * noturna some do mesmo jeito que branco sobre parede.
 */
export function contornoNecessario(dados: Buffer | Uint8Array, canais: number): Rgb | null {
  let n = 0;
  let soma = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < dados.length; i += canais) {
    if (dados[i + 3] < PISO_DESENHO) continue;
    const l = 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
    n++;
    soma += l;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  if (n === 0) return null;
  // 60 fica entre os dois casos medidos (139 do modelado, 0 do chapado) com folga larga dos
  // dois lados -- não é um número ajustado pra passar num deles.
  if (max - min >= 60) return null;
  const media = soma / n;
  if (media > 150) return [26, 20, 14];
  if (media < 105) return [255, 255, 255];
  // Tom médio e chapado: se lê nos dois extremos sem ajuda.
  return null;
}

export function contornar(
  dados: Buffer,
  largura: number,
  altura: number,
  canais: number,
  cor: Rgb,
  espessura: number
): Buffer {
  const e = Math.max(1, Math.round(espessura));
  const n = largura * altura;
  const cheio = new Uint8Array(n);
  for (let p = 0; p < n; p++) cheio[p] = dados[p * canais + 3] > PISO_DESENHO ? 1 : 0;

  const saida = Buffer.from(dados);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      if (cheio[p]) continue; // o desenho não é tocado -- é o "sem mudar a logo"
      let perto = false;
      for (let dy = -e; dy <= e && !perto; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= altura) continue;
        for (let dx = -e; dx <= e; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= largura) continue;
          if (cheio[ny * largura + nx]) { perto = true; break; }
        }
      }
      if (!perto) continue;
      const i = p * canais;
      // Respeita o meio-tom que já estava ali: a borda suavizada do recorte continua
      // suave, agora na cor do contorno em vez da cor do fundo que saiu.
      const alfaAtual = saida[i + 3];
      saida[i] = cor[0];
      saida[i + 1] = cor[1];
      saida[i + 2] = cor[2];
      saida[i + 3] = Math.max(alfaAtual, 235);
    }
  }
  return saida;
}
