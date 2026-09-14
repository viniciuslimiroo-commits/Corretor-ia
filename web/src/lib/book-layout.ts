import { DIMENSOES, TIPO_POR_ID } from "./book-tipos";
import type { DocumentoBook, Pagina } from "./book-documento";

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
  | { tipo: "retangulo"; x: number; y: number; l: number; a: number; cor: string; opacidade?: number }
  | { tipo: "imagem"; x: number; y: number; l: number; a: number; jobId: string; modo: "cobrir" | "conter"; foco?: { x: number; y: number } }
  | { tipo: "texto"; x: number; y: number; l: number; linhas: string[]; tamanho: number; entrelinha: number; negrito: boolean; cor: string; alinhamento: "esquerda" | "direita" }
  | { tipo: "logo"; x: number; y: number; l: number; a: number; placa: boolean }
  | { tipo: "qr"; x: number; y: number; l: number; a: number; conteudo: string; png?: string };

export type PaginaLayout = { id: string; largura: number; altura: number; caixas: Caixa[] };

export type Medidor = (texto: string, tamanho: number, negrito: boolean) => number;

export type ContextoLayout = {
  marca: { nome?: string | null; creci?: string | null; whatsapp?: string | null; temLogo: boolean };
  ficha: { rotulo: string; valor: string }[];
  /** Link público do imóvel. Sem ele não sai QR -- QR que cai em 404 é pior que nenhum. */
  link?: string | null;
};

const MARGEM = 40;
const CINZA = "#6b7380";
const GRAFITE = "#1a1f26";
const AVISO = "Imagens ilustrativas · algumas editadas digitalmente";

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
  o: { x: number; y: number; l: number; tamanho: number; negrito?: boolean; cor?: string; maxLinhas?: number; alinhamento?: "esquerda" | "direita" }
): { caixa: Caixa; alturaUsada: number } | null {
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
export function montarPagina(
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
    por(texto(AVISO, medir, { x: MARGEM, y: A - 19, l: util, tamanho: 6.5, cor: "#a7aeb9" }));
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
    const umaPaginaSo = pagina.imagens.length > 1;
    const temTextoAbaixo = !!(pagina.textos.preco?.trim() || pagina.textos.descricao?.trim());
    const alturaFoto = deitado ? A : umaPaginaSo ? 330 : Math.round(A * (temTextoAbaixo ? 0.56 : 0.78));
    const primeira = pagina.imagens[0];
    if (primeira) {
      caixas.push({ tipo: "imagem", x: 0, y: 0, l: L, a: alturaFoto, jobId: primeira, modo: "cobrir", foco: foco(primeira) });
    } else {
      caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: alturaFoto, cor: escuro });
    }
    const alturaFaixa = deitado ? 190 : 120;
    caixas.push({ tipo: "retangulo", x: 0, y: alturaFoto - alturaFaixa, l: L, a: alturaFaixa, cor: "#000000", opacidade: 0.5 });

    let y = alturaFoto - alturaFaixa + 30;
    const tituloT = deitado ? 34 : 26;
    const t = texto(pagina.textos.titulo ?? "", medir, { x: MARGEM, y, l: util, tamanho: tituloT, negrito: true, cor: "#ffffff", maxLinhas: 2 });
    if (t) {
      caixas.push(t.caixa);
      y += t.alturaUsada + 6;
    }
    por(texto(pagina.textos.subtitulo ?? "", medir, { x: MARGEM, y, l: util, tamanho: 11, cor: "#ffffff", maxLinhas: 1 }));

    if (deitado) {
      por(texto(pagina.textos.preco ?? "", medir, { x: MARGEM, y: A - 58, l: util, tamanho: 20, negrito: true, cor: "#ffffff", maxLinhas: 1 }));
      if (ctx.marca.temLogo) caixas.push({ tipo: "logo", x: L - MARGEM - 130, y: 36, l: 130, a: 54, placa: true });
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
      por(texto(AVISO, medir, { x: MARGEM, y: A - 19, l: util, tamanho: 6.5, cor: "#a7aeb9" }));
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
  if (pagina.tipo === "destaques") {
    caixas.push({ tipo: "retangulo", x: 0, y: 0, l: L, a: 8, cor });
    por(texto(pagina.textos.titulo || "O que faz diferença", medir, { x: MARGEM, y: MARGEM + 26, l: util, tamanho: 24, negrito: true, maxLinhas: 1 }));

    const itens = (pagina.textos.corpo ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8);
    const colunas = deitado ? 2 : 1;
    const gap = 20;
    const larguraItem = (util - gap * (colunas - 1)) / colunas;
    // Lista curta respira mais: seis itens de 14pt grudados no topo de um A4 deixam meia
    // página em branco e o material parece que travou no meio.
    const tamanho = itens.length <= 4 ? 17 : itens.length <= 6 ? 15 : 13;
    const passo = itens.length <= 4 ? 62 : itens.length <= 6 ? 50 : 42;

    const topo = MARGEM + 86;
    const disponivel = A - 56 - topo;
    const linhas = Math.ceil(itens.length / colunas);
    // E o bloco fica no centro óptico do que sobrou, em vez de encostado no título: assim
    // a folga vira composição e não sobra.
    const inicio = topo + Math.max(0, (disponivel - linhas * passo) / 2);

    itens.forEach((item, i) => {
      const x = MARGEM + (i % colunas) * (larguraItem + gap);
      const y = inicio + Math.floor(i / colunas) * passo;
      if (y + passo > A - 56) return;
      // Marcador quadrado na cor da marca: bolinha vira ruído quando a lista tem oito itens.
      caixas.push({ tipo: "retangulo", x, y: y + tamanho * 0.42, l: 7, a: 7, cor });
      por(texto(item, medir, { x: x + 22, y, l: larguraItem - 22, tamanho, maxLinhas: 2 }));
    });
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
    } else if (ctx.link) {
      // Sem mapa, o QR do imóvel faz o trabalho: quem aponta a câmera vê onde é.
      caixas.push({ tipo: "qr", x: MARGEM, y: y + 8, l: ladoQr, a: ladoQr, conteudo: ctx.link });
      por(texto("Aponte a câmera pra ver no mapa", medir, { x: MARGEM, y: y + ladoQr + 18, l: util, tamanho: 9, cor: CINZA, maxLinhas: 1 }));
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
export function montarLayout(doc: DocumentoBook, ctx: ContextoLayout, medir: Medidor): PaginaLayout[] {
  return doc.paginas.map((p, i) => montarPagina(p, doc, ctx, medir, i + 1));
}

/** Teto de páginas do tipo, pra avisar antes de montar um arquivo grande demais. */
export function limiteDoTipo(doc: DocumentoBook): number {
  return TIPO_POR_ID[doc.tipo]?.maxFotos ?? 24;
}
