import { DIMENSOES, TIPO_POR_ID } from "./book-tipos";
import { ESTILO_ELEMENTO_POR_ID, type DocumentoBook, type FonteBook, type Pagina } from "./book-documento";
import { medidorDaFonte } from "./book-metricas";
import type { Idioma } from "@/i18n/idiomas";

// O MOTOR DE LAYOUT: a página vira uma lista de caixas em coordenadas de página.
//
// Existe porque o editor precisa mostrar na tela exatamente o que vai sair no PDF, e tela
// e PDF são desenhistas diferentes. Se cada um calcular o próprio layout, eles divergem --
// e a divergência aparece no pior momento, depois de exportar.
//
// Aqui o layout é calculado UMA vez. O HTML posiciona div em porcentagem, o pdf-lib
// desenha no ponto. Os dois são burros de propósito.
//
// O detalhe que fecha a questão: a QUEBRA DE LINHA acontece aqui, no servidor, com as
// métricas da fonte do PDF, e as caixas de texto saem com as linhas já quebradas. O
// navegador não recalcula nada. Sem isso a mesma frase quebraria em dois lugares
// diferentes e a última linha sumiria só no PDF.
//
// Origem no CANTO SUPERIOR ESQUERDO, que é o natural do HTML. Quem inverte pro sistema do
// pdf-lib (origem embaixo) é o renderizador de PDF, num lugar só.

export type Caixa =
  | { tipo: "retangulo"; x: number; y: number; l: number; a: number; cor: string; opacidade?: number; elementoId?: string }
  | { tipo: "imagem"; x: number; y: number; l: number; a: number; jobId: string; modo: "cobrir" | "conter"; foco?: { x: number; y: number } }
  | { tipo: "texto"; x: number; y: number; l: number; linhas: string[]; tamanho: number; entrelinha: number; negrito: boolean; cor: string; alinhamento: "esquerda" | "centro" | "direita"; elementoId?: string }
  | { tipo: "logo"; x: number; y: number; l: number; a: number; placa: boolean }
  | { tipo: "qr"; x: number; y: number; l: number; a: number; conteudo: string; png?: string };

/** `fonte` é carimbada por `montarLayout`: a tela e o PDF desenham com a família certa. */
export type PaginaLayout = { id: string; largura: number; altura: number; caixas: Caixa[]; fonte?: FonteBook };

export type Medidor = (texto: string, tamanho: number, negrito: boolean) => number;

export type ContextoLayout = {
  marca: { nome?: string | null; creci?: string | null; whatsapp?: string | null; temLogo: boolean };
  ficha: { rotulo: string; valor: string }[];
  /** Link público do imóvel. Sem ele não sai QR -- QR que cai em 404 é pior que nenhum. */
  link?: string | null;
  /**
   * Alguma imagem deste material passou por IA?
   *
   * Decide o aviso do rodapé. Antes era constante: TODO book dizia "algumas editadas
   * digitalmente", porque até existir foto enviada isso era sempre verdade. Agora seria
   * mentira ao contrário -- chamar de ilustração o que é registro --, e num material que
   * vai pro cliente a diferença entre foto real e foto editada é exatamente o que o aviso
   * existe pra dizer. Ausente = assume que sim, que é o lado seguro.
   */
  temEditada?: boolean;
  /**
   * Em que língua saem os avisos impressos. O material vai pro CLIENTE do corretor: um
   * aviso legal em português dentro de um book em espanhol não avisa ninguém, e é
   * justamente o aviso que protege quem assina o anúncio. Ausente = português.
   */
  idioma?: Idioma;
};

const MARGEM = 40;
const CINZA = "#6b7380";
const GRAFITE = "#1a1f26";

const AVISO_EDITADA: Record<Idioma, string> = {
  pt: "Imagens ilustrativas · algumas editadas digitalmente",
  es: "Imágenes ilustrativas · algunas editadas digitalmente",
  en: "Illustrative images · some digitally edited",
};

/** Escurece a cor da marca pra virar fundo de capa sem estourar num tom claro. */
function fundo(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#0f2d5b";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const f = luz > 0.6 ? 0.55 : luz > 0.35 ? 0.85 : 1;
  const p = (v: number) => Math.round(v * f).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

function quebrar(texto: string, medir: Medidor, tamanho: number, negrito: boolean, largura: number, maxLinhas: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\n+/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (medir(tentativa, tamanho, negrito) > largura && atual) {
        linhas.push(atual);
        atual = palavra;
        if (linhas.length >= maxLinhas) return linhas;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
    if (linhas.length >= maxLinhas) return linhas.slice(0, maxLinhas);
  }
  return linhas;
}

function texto(
  conteudo: string,
  medir: Medidor,
  o: { x: number; y: number; l: number; tamanho: number; negrito?: boolean; cor?: string; maxLinhas?: number; alinhamento?: "esquerda" | "centro" | "direita" }
): { caixa: Extract<Caixa, { tipo: "texto" }>; alturaUsada: number } | null {
  const limpo = (conteudo ?? "").trim();
  if (!limpo) return null;
  const negrito = !!o.negrito;
  const linhas = quebrar(limpo, medir, o.tamanho, negrito, o.l, o.maxLinhas ?? 99);
  if (linhas.length === 0) return null;
  const entrelinha = o.tamanho * 1.32;
  return {
    caixa: {
      tipo: "texto",
      x: o.x,
      y: o.y,
      l: o.l,
      linhas,
      tamanho: o.tamanho,
      entrelinha,
      negrito,
      cor: o.cor ?? GRAFITE,
      alinhamento: o.alinhamento ?? "esquerda",
    },
    alturaUsada: linhas.length * entrelinha,
  };
}

/** Assinatura do rodapé: quem manda o material. */
function assinaturaDe(c: ContextoLayout): string {
  return [c.marca.nome, c.marca.creci ? `CRECI ${c.marca.creci}` : null, c.marca.whatsapp].filter(Boolean).join("  ·  ");
}

/**
 * Monta uma página. Puro e síncrono: o QR sai sem o PNG, que é preenchido depois por
 * `resolverQr` -- assim esta função continua testável sem nada assíncrono em volta.
 */
function corpoDaPagina(
  pagina: Pagina,
  doc: DocumentoBook,
  ctx: ContextoLayout,
  medir: Medidor,
  numero: number
): PaginaLayout {
  const { largura: L, altura: A } = DIMENSOES[doc.formato];
  const util = L - MARGEM * 2;
  const cor = doc.identidade.cor ?? "#0f2d5b";
  const escuro = fundo(cor);
  const caixas: Caixa[] = [];
  const deitado = L > A;

  const por = (c: { caixa: Caixa } | null) => {
    if (c) caixas.push(c.caixa);
  };

  const foco = (jobId: string) => pagina.foco?.[jobId];

  // ---------- rodapé, em toda página menos a capa ----------
  function rodape() {
    const assinatura = assinaturaDe(ctx);
    if (assinatura) por(texto(assinatura, medir, { x: MARGEM, y: A - 30, l: util - 30, tamanho: 8, cor: CINZA }));
    por(texto(String(numero), medir, { x: L - MARGEM - 20, y: A - 30, l: 20, tamanho: 8, cor: CINZA, alinhamento: "direita" }));
    if (ctx.temEditada !== false) por(texto(AVISO_EDITADA[ctx.idioma ?? "pt"], medir, { x: MARGEM, y: A - 19, l: util, tamanho: 6.5, cor: "#a7aeb9" }));
  }

  if (pagina.tipo === "capa") {
    // Altura da foto de capa, em três casos:
    //
    // - página única do WhatsApp: baixa (330), porque ainda precisa caber preço,
    //   descrição, quatro fotos e o contato embaixo. Com 56% a grade descia 20pt pra fora
    //   do papel -- achado rodando a montagem contra as fotos reais;
    // - capa com preço ou descrição: 56%, deixando a metade de baixo pro texto;
    // - capa SEM nenhum dos dois: 78%. Reservar 44% da página pra texto que não existe
    //   deixa um vazio branco enorme embaixo da foto, e é o que acontece hoje em todo
    //   imóvel -- os campos de ficha só passam a existir com a migração 11.
    //
    // O STORY é o quarto caso e não segue nenhum dos três: a foto ocupa a tela inteira,
    // como todo Story, e o texto vive por cima dela. Com a régua do A4 ele saía com
    // metade da tela em branco -- que num Story é metade do alcance jogada fora.
    const ehStory = doc.formato === "story";
    const umaPaginaSo = pagina.imagens.length > 1;
    const temTextoAbaixo = !!(pagina.textos.preco?.trim() || pagina.textos.descricao?.trim());
    const cheia = deitado || ehStory;
    // Material de UMA página sem grade (o post): a foto sobe pra 68%. Com 56% sobrava uma
    // faixa branca no meio, entre a descrição e o contato -- e post com buraco no meio
    // parece inacabado, não minimalista.
    const fracao = temTextoAbaixo ? (doc.paginas.length === 1 && !umaPaginaSo ? 0.68 : 0.56) : 0.78;
    const alturaFoto = cheia ? A : umaPaginaSo ? Math.round(A * 0.42) : Math.round(A * fracao);
    const primeira = pagina.imagens[0];
    if (primeira) {
      caixas.push({ tipo: "imagem", x: 0, y: 0, l: L, a: alturaFoto, jobId: primeira, modo: "cobrir", foco: foco(primeira) });
    } else {
      caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: alturaFoto, cor: escuro });
    }
    // Capa escura (padrão): faixa preta translúcida com o texto branco por cima da foto.
    // Capa clara: faixa branca e o texto na cor escura da marca. `capaEscura` existia na
    // identidade desde o começo e nunca tinha sido lida -- era gravada como true e ponto.
    const capaEscura = doc.identidade.capaEscura !== false;
    const corDoTitulo = capaEscura ? "#ffffff" : escuro;
    // No Story a faixa é mais alta e desce até o pé: ali cabem título, local e preço, e é
    // onde o dedo não cobre a imagem enquanto a pessoa assiste.
    const alturaFaixa = deitado ? 190 : ehStory ? 230 : 120;
    caixas.push({ tipo: "retangulo", x: 0, y: alturaFoto - alturaFaixa, l: L, a: alturaFaixa, cor: capaEscura ? "#000000" : "#ffffff", opacidade: capaEscura ? 0.5 : 0.88 });

    // ---------- o selo ----------
    // "À VENDA", "VENDIDO", "OPEN HOUSE": em que fase o imóvel está, dito antes de
    // qualquer outra coisa. Mora no alto da foto, do lado OPOSTO ao logo -- no Story o
    // logo fica na esquerda, então o selo vai pra direita; nos outros é o contrário.
    // Sai na cor da marca e não numa cor própria: duas cores fortes na mesma capa e o
    // preço perde a briga com uma etiqueta.
    const selo = (pagina.textos.selo ?? "").trim().toUpperCase();
    if (selo) {
      const tamSelo = ehStory || deitado ? 13 : 12;
      const altSelo = Math.round(tamSelo * 2.2);
      const larguraTexto = medir(selo, tamSelo, true);
      const respiro = tamSelo * 1.9;
      const largSelo = Math.round(larguraTexto + respiro);
      const xSelo = ehStory ? L - MARGEM - largSelo : MARGEM;
      const ySelo = ehStory ? 46 : 36;
      caixas.push({ tipo: "retangulo", x: xSelo, y: ySelo, l: largSelo, a: altSelo, cor });
      // Centrado na mão: a caixa de texto só sabe alinhar à esquerda e à direita, e meio
      // respiro de cada lado é exatamente o centro da etiqueta.
      por(
        texto(selo, medir, {
          x: xSelo + Math.round(respiro / 2),
          y: ySelo + Math.round((altSelo - tamSelo * 1.05) / 2),
          l: Math.ceil(larguraTexto) + 2,
          tamanho: tamSelo,
          negrito: true,
          cor: "#ffffff",
          maxLinhas: 1,
        })
      );
    }

    let y = alturaFoto - alturaFaixa + 30;
    const tituloT = deitado ? 34 : ehStory ? 22 : 26;
    const t = texto(pagina.textos.titulo ?? "", medir, { x: MARGEM, y, l: util, tamanho: tituloT, negrito: true, cor: corDoTitulo, maxLinhas: 2 });
    if (t) {
      caixas.push(t.caixa);
      y += t.alturaUsada + 6;
    }
    por(texto(pagina.textos.subtitulo ?? "", medir, { x: MARGEM, y, l: util, tamanho: 11, cor: capaEscura ? "#ffffff" : "#414a57", maxLinhas: 1 }));

    if (cheia) {
      por(texto(pagina.textos.preco ?? "", medir, { x: MARGEM, y: A - (ehStory ? 74 : 58), l: util, tamanho: ehStory ? 26 : 20, negrito: true, cor: corDoTitulo, maxLinhas: 1 }));
      // No Story o logo fica em cima, longe do texto e da barra de progresso do app.
      if (ctx.marca.temLogo) caixas.push({ tipo: "logo", x: ehStory ? MARGEM : L - MARGEM - 130, y: ehStory ? 46 : 36, l: 130, a: 54, placa: true });
      // O aviso de imagem editada, que a capa cheia não tinha.
      //
      // Nas outras páginas ele vem no rodapé, e esta saía antes de chegar lá. No Story
      // isso deixava o material SEM aviso nenhum: o Story é de uma página só, e o selo
      // que a própria foto carrega fica no canto de baixo à direita -- justamente o que
      // o corte pra 9:16 joga fora. Saía um imóvel com mobília virtual anunciado sem
      // dizer que é virtual.
      if (ctx.temEditada !== false) {
        por(texto(AVISO_EDITADA[ctx.idioma ?? "pt"], medir, { x: MARGEM, y: A - 17, l: util, tamanho: 6.5, cor: capaEscura ? "#c9cfd8" : "#8a929e" }));
      }
      return { id: pagina.id, largura: L, altura: A, caixas };
    }

    // Retrato e quadrado: preço, descrição e grade de fotos embaixo da capa.
    y = alturaFoto + 36;
    const p = texto(pagina.textos.preco ?? "", medir, { x: MARGEM, y, l: util, tamanho: 28, negrito: true, cor, maxLinhas: 1 });
    if (p) {
      caixas.push(p.caixa);
      y += p.alturaUsada + 14;
    }
    const d = texto(pagina.textos.descricao ?? "", medir, { x: MARGEM, y, l: util, tamanho: 10.5, cor: "#414a57", maxLinhas: 3 });
    if (d) {
      caixas.push(d.caixa);
      y += d.alturaUsada + 16;
    }

    // A página única do WhatsApp leva as outras quatro fotos aqui mesmo.
    const extras = pagina.imagens.slice(1, 5);
    if (extras.length) {
      const gap = 12;
      const lado = (util - gap) / 2;
      const alt = 118;
      // Ancorada EMBAIXO, não empilhada depois do texto: numa página só, descrição curta
      // deixava meio dedo de branco no meio e descrição longa empurrava a grade pra fora.
      const linhas = Math.ceil(extras.length / 2);
      const topo = A - 139 - (linhas * alt + (linhas - 1) * gap);
      extras.forEach((jobId, i) => {
        caixas.push({
          tipo: "imagem",
          x: MARGEM + (i % 2) * (lado + gap),
          y: topo + Math.floor(i / 2) * (alt + gap),
          l: lado,
          a: alt,
          jobId,
          modo: "cobrir",
          foco: foco(jobId),
        });
      });
      const assinatura = assinaturaDe(ctx);
      if (assinatura) por(texto(assinatura, medir, { x: MARGEM, y: A - 78, l: util - 100, tamanho: 11, negrito: true, cor: GRAFITE }));
      if (ctx.link) caixas.push({ tipo: "qr", x: L - MARGEM - 78, y: A - 118, l: 78, a: 78, conteudo: ctx.link });
      if (ctx.marca.temLogo) caixas.push({ tipo: "logo", x: MARGEM, y: A - 118, l: 100, a: 34, placa: false });
      if (ctx.temEditada !== false) por(texto(AVISO_EDITADA[ctx.idioma ?? "pt"], medir, { x: MARGEM, y: A - 19, l: util, tamanho: 6.5, cor: "#a7aeb9" }));
    } else if (doc.paginas.length === 1) {
      // Material de uma página só e sem grade (o post): o pé leva o contato, senão sobra
      // meia tela em branco embaixo do preço -- e um post com espaço vazio parece
      // inacabado, não minimalista.
      const assinatura = assinaturaDe(ctx);
      if (assinatura) por(texto(assinatura, medir, { x: MARGEM, y: A - 78, l: util - 100, tamanho: 11, negrito: true, cor: GRAFITE }));
      if (ctx.link) caixas.push({ tipo: "qr", x: L - MARGEM - 78, y: A - 118, l: 78, a: 78, conteudo: ctx.link });
      if (ctx.marca.temLogo) caixas.push({ tipo: "logo", x: MARGEM, y: A - 118, l: 100, a: 34, placa: false });
      if (ctx.temEditada !== false) por(texto(AVISO_EDITADA[ctx.idioma ?? "pt"], medir, { x: MARGEM, y: A - 19, l: util, tamanho: 6.5, cor: "#a7aeb9" }));
    } else if (ctx.marca.temLogo) {
      caixas.push({ tipo: "logo", x: MARGEM, y: A - 100, l: 110, a: 45, placa: false });
    }
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  if (pagina.tipo === "foto") {
    const temLegenda = !!(pagina.textos.legenda || pagina.textos.legenda2);
    const alturaArea = A - MARGEM * 2 - (temLegenda ? 22 : 0) - 22;
    const [a1, a2] = pagina.imagens;

    if (pagina.layout === "duas" && a2) {
      if (deitado) {
        const gap = 16;
        const lado = (util - gap) / 2;
        caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM, l: lado, a: alturaArea, jobId: a1, modo: "cobrir", foco: foco(a1) });
        caixas.push({ tipo: "imagem", x: MARGEM + lado + gap, y: MARGEM, l: lado, a: alturaArea, jobId: a2, modo: "cobrir", foco: foco(a2) });
        por(texto(pagina.textos.legenda ?? "", medir, { x: MARGEM, y: MARGEM + alturaArea + 6, l: lado, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
        por(texto(pagina.textos.legenda2 ?? "", medir, { x: MARGEM + lado + gap, y: MARGEM + alturaArea + 6, l: lado, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
      } else {
        const gap = 30;
        const alt = (alturaArea - gap) / 2;
        caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM, l: util, a: alt, jobId: a1, modo: "cobrir", foco: foco(a1) });
        por(texto(pagina.textos.legenda ?? "", medir, { x: MARGEM, y: MARGEM + alt + 6, l: util, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
        caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM + alt + gap, l: util, a: alt, jobId: a2, modo: "cobrir", foco: foco(a2) });
        por(texto(pagina.textos.legenda2 ?? "", medir, { x: MARGEM, y: MARGEM + alt + gap + alt + 6, l: util, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
      }
    } else if (pagina.layout === "foto_texto") {
      const larguraFoto = util * 0.58;
      if (a1) caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM, l: larguraFoto, a: alturaArea, jobId: a1, modo: "cobrir", foco: foco(a1) });
      const xTexto = MARGEM + larguraFoto + 22;
      const lTexto = L - MARGEM - xTexto;
      let y = MARGEM + 6;
      const t = texto(pagina.textos.legenda ?? "", medir, { x: xTexto, y, l: lTexto, tamanho: 15, negrito: true, maxLinhas: 2 });
      if (t) {
        caixas.push(t.caixa);
        y += t.alturaUsada + 10;
      }
      por(texto(pagina.textos.corpo ?? "", medir, { x: xTexto, y, l: lTexto, tamanho: 10.5, cor: "#414a57", maxLinhas: 18 }));
    } else if (a1) {
      caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM, l: util, a: alturaArea, jobId: a1, modo: "cobrir", foco: foco(a1) });
      por(texto(pagina.textos.legenda ?? "", medir, { x: MARGEM, y: MARGEM + alturaArea + 6, l: util, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
    }
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  if (pagina.tipo === "planta") {
    // CONTER, não cobrir: planta cortada perde medida, e medida cortada é informação
    // errada no material. Sobra branco em volta, e está certo assim.
    const alturaArea = A - MARGEM * 2 - 44;
    const jobId = pagina.imagens[0];
    if (jobId) caixas.push({ tipo: "imagem", x: MARGEM, y: MARGEM, l: util, a: alturaArea, jobId, modo: "conter" });
    por(texto(pagina.textos.legenda ?? "Planta baixa", medir, { x: MARGEM, y: MARGEM + alturaArea + 8, l: util, tamanho: 11, negrito: true }));
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  if (pagina.tipo === "ficha") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    por(texto(pagina.textos.titulo || "Ficha técnica", medir, { x: MARGEM, y: MARGEM + 26, l: util, tamanho: 24, negrito: true }));
    const colunas = deitado ? 3 : 2;
    const gap = 14;
    const larguraCard = (util - gap * (colunas - 1)) / colunas;
    // Quantas linhas cabem de verdade, em vez de um número fixo: com três chutado, uma
    // ficha completa perdia área total, condomínio e IPTU sem avisar ninguém.
    const linhasQueCabem = Math.max(1, Math.floor((A - MARGEM - 74 - 40) / 84));
    ctx.ficha.slice(0, colunas * linhasQueCabem).forEach((linha, i) => {
      const x = MARGEM + (i % colunas) * (larguraCard + gap);
      const y = MARGEM + 74 + Math.floor(i / colunas) * 84;
      caixas.push({ tipo: "retangulo", x, y, l: larguraCard, a: 68, cor: "#f5f7fa" });
      por(texto(linha.rotulo, medir, { x: x + 14, y: y + 18, l: larguraCard - 28, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
      por(texto(linha.valor, medir, { x: x + 14, y: y + 40, l: larguraCard - 28, tamanho: 17, negrito: true, cor, maxLinhas: 1 }));
    });
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  // ---------- destaques: a ficha virada frase ----------
  // Lista, não parágrafo: o cliente não lê o material inteiro, ele varre. Cada linha do
  // campo "corpo" vira um item, e é o corretor quem decide quantos — sem contador mágico.
  // ---------- grade do portfólio ----------
  // Seis fotos 2x3, com o nome embaixo de cada uma. É material de captação: o que importa
  // é a quantidade e a variedade do trabalho, não cada imóvel em detalhe.
  if (pagina.tipo === "grade") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    let topo = MARGEM + 20;
    const t = texto(pagina.textos.titulo ?? "", medir, { x: MARGEM, y: topo, l: util, tamanho: 20, negrito: true, maxLinhas: 1 });
    if (t) {
      caixas.push(t.caixa);
      topo += t.alturaUsada + 18;
    }

    // A grade se ajusta à QUANTIDADE, não ao teto. Uma página com três fotos numa moldura
    // de seis deixa três buracos cinza -- e buraco num material de captação parece trabalho
    // que não existe. Com poucas fotos a grade vira uma coluna e elas crescem.
    const fotos = pagina.imagens.filter(Boolean).slice(0, 6);
    const quantas = Math.max(1, fotos.length);
    const colunas = deitado ? Math.min(3, quantas) : quantas <= 2 ? 1 : 2;
    const linhas = Math.ceil(quantas / colunas);
    const gap = 14;
    const rotulo = 16;
    const larguraFoto = (util - gap * (colunas - 1)) / colunas;
    const alturaDisponivel = A - 56 - topo;
    const alturaCelula = (alturaDisponivel - gap * (linhas - 1)) / linhas;
    const alturaFoto = Math.max(40, alturaCelula - rotulo);

    fotos.forEach((job, i) => {
      const x = MARGEM + (i % colunas) * (larguraFoto + gap);
      const y = topo + Math.floor(i / colunas) * (alturaCelula + gap);
      caixas.push({ tipo: "imagem", x, y, l: larguraFoto, a: alturaFoto, jobId: job, modo: "cobrir", foco: foco(job) });
      por(texto(pagina.textos[`legenda${i + 1}`] ?? "", medir, { x, y: y + alturaFoto + 4, l: larguraFoto, tamanho: 8, cor: CINZA, maxLinhas: 1 }));
    });
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  // ---------- página de números ----------
  // Cada linha "Rótulo: valor" vira um cartão. Quem investe lê número antes de foto, e
  // número espalhado em parágrafo não se compara com outro imóvel.
  if (pagina.tipo === "numeros") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    por(texto(pagina.textos.titulo || "Os números", medir, { x: MARGEM, y: MARGEM + 26, l: util, tamanho: 24, negrito: true, maxLinhas: 1 }));

    const cartoes = (pagina.textos.corpo ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^([^:]{1,28}):\s*(.+)$/.exec(l);
        return m ? { rotulo: m[1].trim(), valor: m[2].trim().slice(0, 24) } : null;
      })
      .filter((c): c is { rotulo: string; valor: string } => !!c)
      .slice(0, 8);

    const colunas = deitado ? 4 : 2;
    const gap = 14;
    const larguraCard = (util - gap * (colunas - 1)) / colunas;
    cartoes.forEach((c, i) => {
      const x = MARGEM + (i % colunas) * (larguraCard + gap);
      const y = MARGEM + 80 + Math.floor(i / colunas) * 92;
      caixas.push({ tipo: "retangulo", x, y, l: larguraCard, a: 76, cor: "#f5f7fa" });
      por(texto(c.rotulo, medir, { x: x + 14, y: y + 18, l: larguraCard - 28, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
      por(texto(c.valor, medir, { x: x + 14, y: y + 40, l: larguraCard - 28, tamanho: 20, negrito: true, cor, maxLinhas: 1 }));
    });

    const abaixo = MARGEM + 80 + Math.ceil(cartoes.length / colunas) * 92 + 10;
    por(texto(pagina.textos.nota ?? "", medir, { x: MARGEM, y: abaixo, l: util * 0.8, tamanho: 12, cor: "#414a57", maxLinhas: 6 }));
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  // ---------- um imóvel do catálogo ----------
  // Todos os campos na MESMA posição em todas as páginas, de propósito: catálogo existe
  // pra comparar, e comparação morre quando o preço de um está embaixo e o do outro ao
  // lado. Foto em cima, nome, endereço, preço grande, ficha curta. Nada além disso.
  if (pagina.tipo === "imovel") {
    const alturaFoto = Math.round(A * (deitado ? 0.62 : 0.52));
    const foto = pagina.imagens[0];
    if (foto) {
      caixas.push({ tipo: "imagem", x: 0, y: 0, l: L, a: alturaFoto, jobId: foto, modo: "cobrir", foco: foco(foto) });
    } else {
      caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: alturaFoto, cor: "#e8ebef" });
    }

    let y = alturaFoto + 34;
    const t = texto(pagina.textos.titulo ?? "", medir, { x: MARGEM, y, l: util, tamanho: 22, negrito: true, maxLinhas: 2 });
    if (t) {
      caixas.push(t.caixa);
      y += t.alturaUsada + 6;
    }
    const end = texto(pagina.textos.endereco ?? "", medir, { x: MARGEM, y, l: util, tamanho: 11, cor: CINZA, maxLinhas: 2 });
    if (end) {
      caixas.push(end.caixa);
      y += end.alturaUsada + 18;
    }
    const preco = texto(pagina.textos.preco ?? "", medir, { x: MARGEM, y, l: util, tamanho: 26, negrito: true, cor, maxLinhas: 1 });
    if (preco) {
      caixas.push(preco.caixa);
      y += preco.alturaUsada + 14;
    }
    por(texto(pagina.textos.ficha ?? "", medir, { x: MARGEM, y, l: util, tamanho: 12, cor: "#414a57", maxLinhas: 2 }));
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  if (pagina.tipo === "destaques") {
    const emLista = (chave: string) =>
      (pagina.textos[chave] ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8);

    const grupos = [
      { titulo: pagina.textos.titulo || "O imóvel", itens: emLista("corpo") },
      { titulo: pagina.textos.titulo2 || "O que tem a mais", itens: emLista("corpo2") },
    ].filter((g) => g.itens.length > 0);

    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    // Com dois grupos o título da página vira o título do primeiro grupo, e cada bloco leva
    // o seu. Com um grupo só, a página tem um título e ponto -- sem cabeçalho órfão.
    const doisGrupos = grupos.length > 1;
    const gapColuna = 28;
    // Deitado com dois grupos, lado a lado; no resto, um embaixo do outro numa coluna só.
    const larguraCol = doisGrupos && deitado ? (util - gapColuna) / 2 : util;

    const todos = grupos.reduce((n, g) => n + g.itens.length, 0);
    const tamanho = todos <= 4 ? 17 : todos <= 7 ? 15 : 13;
    const passo = todos <= 4 ? 56 : todos <= 7 ? 44 : 38;

    let y = MARGEM + 34;
    if (!doisGrupos) {
      por(texto(grupos[0]?.titulo ?? "Destaques", medir, { x: MARGEM, y: y + 6, l: util, tamanho: 24, negrito: true, maxLinhas: 1 }));
      y += 58;
      // Bloco único vai pro centro óptico do que sobra: encostado no título, sobra meia
      // página em branco e o material parece que travou no meio.
      y += Math.max(0, (A - 56 - y - (grupos[0]?.itens.length ?? 0) * passo) / 2);
    } else {
      por(texto("Destaques", medir, { x: MARGEM, y: y + 6, l: util, tamanho: 24, negrito: true, maxLinhas: 1 }));
      y += 62;
    }

    const desenhar = (g: { titulo: string; itens: string[] }, x: number, topo: number, largura: number) => {
      let yy = topo;
      if (doisGrupos) {
        por(texto(g.titulo.toUpperCase(), medir, { x, y: yy, l: largura, tamanho: 9, negrito: true, cor, maxLinhas: 1 }));
        yy += 26;
      }
      g.itens.forEach((item) => {
        if (yy + passo > A - 56) return;
        // Marcador quadrado na cor da marca: bolinha vira ruído quando a lista tem oito itens.
        caixas.push({ tipo: "retangulo", x, y: yy + tamanho * 0.42, l: 7, a: 7, cor });
        por(texto(item, medir, { x: x + 22, y: yy, l: largura - 22, tamanho, maxLinhas: 2 }));
        yy += passo;
      });
      return yy;
    };

    if (doisGrupos && deitado) {
      desenhar(grupos[0], MARGEM, y, larguraCol);
      desenhar(grupos[1], MARGEM + larguraCol + gapColuna, y, larguraCol);
    } else if (doisGrupos) {
      const fim = desenhar(grupos[0], MARGEM, y, util);
      desenhar(grupos[1], MARGEM, fim + 26, util);
    } else {
      desenhar(grupos[0], MARGEM, y, util);
    }

    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  // ---------- localização ----------
  // O endereço é do cadastro e aparece grande; o mapa é opcional. Sem imagem, a página
  // continua de pé em vez de abrir um buraco branco.
  if (pagina.tipo === "localizacao") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    por(texto(pagina.textos.titulo || "Localização", medir, { x: MARGEM, y: MARGEM + 26, l: util, tamanho: 24, negrito: true, maxLinhas: 1 }));

    const mapa = pagina.imagens[0];
    const topo = MARGEM + 84;

    // Com mapa, o texto fica em cima e a imagem toma o resto. Sem mapa, o bloco inteiro
    // (endereço + observação + QR) vai pro centro do que sobrou -- página com endereço
    // grudado no título e dois terços em branco parece material inacabado.
    const ladoQr = 170;
    const medirEnd = (yy: number) => texto(pagina.textos.endereco ?? "", medir, { x: MARGEM, y: yy, l: util * 0.8, tamanho: mapa ? 18 : 24, negrito: true, cor, maxLinhas: 3 });
    const medirNota = (yy: number) => texto(pagina.textos.corpo ?? "", medir, { x: MARGEM, y: yy, l: util * 0.8, tamanho: 12, cor: "#414a57", maxLinhas: 4 });

    let y = topo;
    if (!mapa) {
      const alturaBloco =
        (medirEnd(0)?.alturaUsada ?? 0) + 12 + (medirNota(0)?.alturaUsada ?? 0) + (ctx.link ? ladoQr + 40 : 0);
      y = topo + Math.max(0, (A - 70 - topo - alturaBloco) / 2);
    }

    const end = medirEnd(y);
    if (end) {
      caixas.push(end.caixa);
      y += end.alturaUsada + 12;
    }
    const nota = medirNota(y);
    if (nota) {
      caixas.push(nota.caixa);
      y += nota.alturaUsada + 20;
    }

    if (mapa) {
      const alturaMapa = Math.max(160, A - y - 80);
      caixas.push({ tipo: "imagem", x: MARGEM, y: y + 8, l: util, a: alturaMapa, jobId: mapa, modo: "conter", foco: pagina.foco?.[mapa] });
    } else if (pagina.textos.endereco?.trim()) {
      // Sem figura de mapa, o QR abre o ENDEREÇO no app de mapa do celular.
      //
      // É um link de busca do Google Maps, não uma API: não tem chave, não tem cota e não
      // tem custo. E pra quem recebe é melhor que uma figura -- abre o mapa de verdade,
      // com rota a partir de onde a pessoa está.
      //
      // Antes daqui este QR apontava pro link público do IMÓVEL com a legenda "ver no
      // mapa", que prometia mapa e entregava outra coisa.
      const busca = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pagina.textos.endereco.trim().slice(0, 160))}`;
      caixas.push({ tipo: "qr", x: MARGEM, y: y + 8, l: ladoQr, a: ladoQr, conteudo: busca });
      por(texto("Aponte a câmera pra abrir no mapa", medir, { x: MARGEM, y: y + ladoQr + 18, l: util, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
    }
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  if (pagina.tipo === "texto") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    let y = MARGEM + 34;
    const t = texto(pagina.textos.titulo ?? "", medir, { x: MARGEM, y, l: util * 0.8, tamanho: 24, negrito: true, maxLinhas: 2 });
    if (t) {
      caixas.push(t.caixa);
      y += t.alturaUsada + 18;
    }
    por(texto(pagina.textos.corpo ?? "", medir, { x: MARGEM, y, l: util * 0.72, tamanho: 13, cor: "#414a57", maxLinhas: 20 }));
    rodape();
    return { id: pagina.id, largura: L, altura: A, caixas };
  }

  // ---------- contato ----------
  const alturaFaixa = deitado ? 150 : 200;
  caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: alturaFaixa, cor: escuro });
  por(texto(pagina.textos.chamada || "Vamos visitar?", medir, { x: MARGEM, y: alturaFaixa - 92, l: util - 150, tamanho: deitado ? 26 : 30, negrito: true, cor: "#ffffff", maxLinhas: 1 }));
  if (ctx.marca.nome) por(texto(ctx.marca.nome, medir, { x: MARGEM, y: alturaFaixa - 52, l: util - 150, tamanho: 13, cor: "#ffffff", maxLinhas: 1 }));
  if (ctx.marca.temLogo) caixas.push({ tipo: "logo", x: L - MARGEM - 120, y: alturaFaixa - 82, l: 120, a: 50, placa: true });

  let y = alturaFaixa + 60;
  for (const [rot, val] of [
    ["WhatsApp", ctx.marca.whatsapp],
    ["CRECI", ctx.marca.creci],
  ] as [string, string | null | undefined][]) {
    if (!val) continue;
    por(texto(rot, medir, { x: MARGEM, y, l: 200, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
    por(texto(val, medir, { x: MARGEM, y: y + 20, l: 260, tamanho: 16, negrito: true, maxLinhas: 1 }));
    y += 48;
  }
  if (ctx.link) {
    caixas.push({ tipo: "qr", x: L - MARGEM - 150, y: alturaFaixa + 40, l: 150, a: 150, conteudo: ctx.link });
    por(texto("Aponte a câmera", medir, { x: L - MARGEM - 150, y: alturaFaixa + 198, l: 150, tamanho: 8, cor: CINZA, maxLinhas: 1 }));
  }
  rodape();
  return { id: pagina.id, largura: L, altura: A, caixas };
}

/** O book inteiro. A capa não entra na contagem de rodapé porque não tem rodapé. */
/**
 * Todas as páginas. O medidor vem da FONTE do documento -- quebrar linha com as
 * métricas da Helvetica num book em Times deixaria a última linha sumir só no PDF, que
 * é exatamente a divergência que este motor existe pra impedir. `medir` explícito só pra
 * teste.
 */
/**
 * A camada livre virada em caixas, por cima de tudo que a página já tinha.
 *
 * Fica fora de `corpoDaPagina` de propósito: o corpo tem um `return` por tipo de página
 * (capa, foto, ficha, contato…), e uma camada que precisa valer em TODAS não pode
 * depender de alguém lembrar de chamá-la em cada saída. Aqui ela é aplicada num lugar só,
 * ao resultado, e passa a existir em qualquer tipo de página -- inclusive nos que forem
 * criados depois.
 *
 * As frações viram pontos aqui, na última hora. É isso que faz o mesmo elemento cair no
 * lugar certo quando o material troca de formato.
 */
function caixasDaCamadaLivre(pagina: Pagina, doc: DocumentoBook, medir: Medidor, L: number, A: number): Caixa[] {
  const elementos = pagina.elementos ?? [];
  if (!elementos.length) return [];
  const cor = doc.identidade.cor ?? "#0f2d5b";
  const caixas: Caixa[] = [];

  for (const e of elementos) {
    const x = e.x * L;
    const y = e.y * A;
    const l = e.l * L;

    if (e.estilo === "bloco") {
      caixas.push({ tipo: "retangulo", x, y, l, a: (e.a ?? 0.08) * A, cor, opacidade: 0.92, elementoId: e.id });
      continue;
    }

    const tamanho = Math.max(7, ESTILO_ELEMENTO_POR_ID[e.estilo].padrao.tamanho * A);
    const comFundo = e.estilo === "faixa" || e.estilo === "etiqueta";
    const respiro = Math.round(tamanho * 0.6);
    const corTexto = comFundo ? "#ffffff" : e.estilo === "nota" ? CINZA : cor;
    const t = texto(e.texto, medir, {
      x: x + (comFundo ? respiro : 0),
      y: y + (comFundo ? respiro : 0),
      l: l - (comFundo ? respiro * 2 : 0),
      tamanho,
      negrito: e.estilo !== "nota",
      cor: corTexto,
      maxLinhas: 3,
      alinhamento: e.alinhamento ?? "esquerda",
    });
    if (!t) continue;
    // O fundo é desenhado em volta do texto JÁ MEDIDO: caixa de altura fixa com texto de
    // duas linhas sobra pra fora, e num material isso aparece como letra cortada.
    if (comFundo) caixas.push({ tipo: "retangulo", x, y, l, a: t.alturaUsada + respiro * 2, cor, elementoId: e.id });
    caixas.push({ ...t.caixa, elementoId: e.id });
  }
  return caixas;
}

export function montarPagina(pagina: Pagina, doc: DocumentoBook, ctx: ContextoLayout, medir: Medidor, numero: number): PaginaLayout {
  const base = corpoDaPagina(pagina, doc, ctx, medir, numero);
  const livres = caixasDaCamadaLivre(pagina, doc, medir, base.largura, base.altura);
  return livres.length ? { ...base, caixas: [...base.caixas, ...livres] } : base;
}

export function montarLayout(doc: DocumentoBook, ctx: ContextoLayout, medir?: Medidor): PaginaLayout[] {
  const fonte: FonteBook = doc.identidade.fonte === "classica" ? "classica" : "moderna";
  const medidor = medir ?? medidorDaFonte(fonte);
  return doc.paginas.map((p, i) => ({ ...montarPagina(p, doc, ctx, medidor, i + 1), fonte }));
}

/** Teto de páginas do tipo, pra avisar antes de montar um arquivo grande demais. */
export function limiteDoTipo(doc: DocumentoBook): number {
  return TIPO_POR_ID[doc.tipo]?.maxFotos ?? 24;
}
