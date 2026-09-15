import { DIMENSOES, TIPO_POR_ID, TIPOS_PAGINA, type Formato, type LayoutFoto, type TipoBook, type TipoPagina } from "./book-tipos";

// O documento do book: o que fica guardado em books.documento.
//
// Guarda as páginas JÁ RESOLVIDAS, não a receita de como montá-las. É o que faz a edição
// manual sobreviver: cada página carrega `origem`, e remontar refresca só as 'auto'.
//
// Guarda jobId das imagens, nunca URL. A URL é assinada por uma hora e refeita a cada
// leitura -- se o documento guardasse o endereço, o book quebraria sozinho em 60 minutos.
//
// Todas as funções aqui são PURAS: recebem o documento, devolvem um novo. Sem React, sem
// rede, sem banco. É a parte que mais erra e a mais fácil de conferir isolada.

export type EstiloElemento = "titulo" | "faixa" | "etiqueta" | "nota" | "bloco";

/**
 * Um elemento que a pessoa põe onde quiser na página.
 *
 * É a camada livre -- e é livre em POSIÇÃO, não em tudo. O estilo continua vindo de uma
 * lista curta: cinco acabamentos, cada um com tamanho, cor e peso já resolvidos. Foi de
 * propósito: seletor de fonte, roda de cor e sombra soltos é o que faz material caseiro
 * parecer caseiro, e quem abre a Encena quer sair com uma peça pronta, não com um Canva.
 *
 * As coordenadas são FRAÇÕES da página (0 a 1), nunca pontos. Assim o mesmo elemento
 * cai no lugar certo num post quadrado e num Story em pé, e sobrevive a mudar o formato
 * do material -- que é justamente o que se faz com um post que virou Story.
 */
export type ElementoLivre = {
  id: string;
  estilo: EstiloElemento;
  texto: string;
  /** Canto superior esquerdo, em fração da página. */
  x: number;
  y: number;
  /** Largura, em fração da largura da página. */
  l: number;
  /** Só "bloco": altura em fração da altura da página. */
  a?: number;
  alinhamento?: "esquerda" | "centro" | "direita";
};

export const ESTILOS_ELEMENTO: { id: EstiloElemento; rotulo: string; dica: string; padrao: { texto: string; l: number; tamanho: number } }[] = [
  { id: "titulo", rotulo: "Título", dica: "Grande, na cor da marca. Pro recado principal.", padrao: { texto: "Escreva aqui", l: 0.7, tamanho: 0.045 } },
  { id: "faixa", rotulo: "Faixa", dica: "Texto branco sobre a cor da marca, de ponta a ponta.", padrao: { texto: "Agende sua visita", l: 0.86, tamanho: 0.028 } },
  { id: "etiqueta", rotulo: "Etiqueta", dica: "Pequena e destacada. “Últimas unidades”, “Aceita financiamento”.", padrao: { texto: "Últimas unidades", l: 0.42, tamanho: 0.022 } },
  { id: "nota", rotulo: "Observação", dica: "Miúda e discreta, pro que precisa estar escrito mas não gritar.", padrao: { texto: "Valores sujeitos a alteração", l: 0.6, tamanho: 0.016 } },
  { id: "bloco", rotulo: "Bloco de cor", dica: "Um retângulo na cor da marca. Cobre, separa ou dá fundo.", padrao: { texto: "", l: 0.5, tamanho: 0.02 } },
];

export const ESTILO_ELEMENTO_POR_ID = Object.fromEntries(ESTILOS_ELEMENTO.map((e) => [e.id, e])) as Record<EstiloElemento, (typeof ESTILOS_ELEMENTO)[number]>;

export type Pagina = {
  id: string;
  tipo: TipoPagina;
  /** O que a pessoa pôs por cima, onde quis. Desenhado depois de tudo. */
  elementos?: ElementoLivre[];
  /** 'auto' = a montagem fez; 'manual' = a pessoa mexeu. Remontar só mexe nas 'auto'. */
  origem: "auto" | "manual";
  layout?: LayoutFoto;
  /** jobIds, na ordem em que aparecem na página. */
  imagens: string[];
  /** titulo, subtitulo, preco, legenda, corpo -- o que o tipo de página usar. */
  textos: Record<string, string>;
  /** Deslocamento do recorte por jobId, de -0.5 a 0.5. Ausente = centro. */
  foco?: Record<string, { x: number; y: number }>;
};

/**
 * As famílias de fonte do book. Duas, não um seletor de fonte: são as que o PDF traz
 * embutidas sem arquivo de fonte (Helvetica e Times), com métricas que o navegador
 * reproduz exatamente (book-metricas). Uma terceira exigiria embutir um TTF e medir com
 * ele dos dois lados -- fica pra quando alguém pedir uma fonte específica.
 */
export type FonteBook = "moderna" | "classica";

export const FONTES_BOOK: { id: FonteBook; rotulo: string; descricao: string; css: string }[] = [
  { id: "moderna", rotulo: "Moderna", descricao: "Limpa e direta. É a de sempre.", css: "Helvetica, Arial, sans-serif" },
  { id: "classica", rotulo: "Clássica", descricao: "Serifada, de imobiliária tradicional.", css: "'Times New Roman', Times, serif" },
];

export const FONTE_POR_ID = Object.fromEntries(FONTES_BOOK.map((f) => [f.id, f])) as Record<FonteBook, (typeof FONTES_BOOK)[number]>;

export type Identidade = {
  /** Hex da marca. Ausente = a cor de Minha marca na hora de renderizar. */
  cor?: string;
  capaEscura: boolean;
  /** Ausente = moderna (documentos anteriores à escolha). */
  fonte?: FonteBook;
};

export type DocumentoBook = {
  versao: 1;
  tipo: TipoBook;
  formato: Formato;
  identidade: Identidade;
  paginas: Pagina[];
};

/** Páginas que a pessoa não pode remover: a capa abre e o contato fecha. */
export const NAO_REMOVIVEIS: TipoPagina[] = ["capa", "contato"];

export function podeRemover(p: Pagina): boolean {
  return !NAO_REMOVIVEIS.includes(p.tipo);
}

let contador = 0;
/** Id de página. Não precisa ser universal -- só único dentro do documento. */
export function novoId(): string {
  contador += 1;
  return `p${Date.now().toString(36)}${contador.toString(36)}`;
}

export function paginaVazia(tipo: TipoPagina, origem: "auto" | "manual" = "manual"): Pagina {
  return { id: novoId(), tipo, origem, imagens: [], textos: {}, ...(tipo === "foto" ? { layout: "cheia" as LayoutFoto } : {}) };
}

// ---------- operações ----------
//
// Todas devolvem documento novo e marcam a página tocada como 'manual'. Marcar aqui, e
// não em cada chamador, é o que garante que nenhuma edição seja apagada por remontagem
// só porque alguém esqueceu de marcar.

function comPaginas(d: DocumentoBook, paginas: Pagina[]): DocumentoBook {
  return { ...d, paginas };
}

function tocar(p: Pagina): Pagina {
  return { ...p, origem: "manual" };
}

export function mover(d: DocumentoBook, id: string, para: number): DocumentoBook {
  const i = d.paginas.findIndex((p) => p.id === id);
  if (i < 0) return d;
  const destino = Math.max(0, Math.min(d.paginas.length - 1, para));
  if (destino === i) return d;
  const lista = [...d.paginas];
  const [saiu] = lista.splice(i, 1);
  lista.splice(destino, 0, saiu);
  return comPaginas(d, lista);
}

export function remover(d: DocumentoBook, id: string): DocumentoBook {
  const p = d.paginas.find((x) => x.id === id);
  if (!p || !podeRemover(p)) return d;
  return comPaginas(d, d.paginas.filter((x) => x.id !== id));
}

/** Entra DEPOIS da página selecionada, não no fim: é o que a pessoa espera. */
export function inserir(d: DocumentoBook, nova: Pagina, depoisDe?: string): DocumentoBook {
  const lista = [...d.paginas];
  const i = depoisDe ? lista.findIndex((p) => p.id === depoisDe) : -1;
  const destino = i >= 0 ? i + 1 : Math.max(1, lista.length - 1); // antes do contato, se houver
  lista.splice(destino, 0, nova);
  return comPaginas(d, lista);
}

/** Copia a página e põe logo depois dela. A cópia nasce 'manual': foi a pessoa que pediu. */
export function duplicar(d: DocumentoBook, id: string): DocumentoBook {
  const i = d.paginas.findIndex((p) => p.id === id);
  if (i < 0) return d;
  const original = d.paginas[i];
  const copia: Pagina = {
    ...original,
    id: novoId(),
    origem: "manual",
    textos: { ...original.textos },
    imagens: [...original.imagens],
    // Os elementos vêm junto, com id NOVO: dois elementos com o mesmo id em páginas
    // diferentes fariam mover um mexer nos dois.
    ...(original.elementos?.length ? { elementos: original.elementos.map((e) => ({ ...e, id: novoId() })) } : {}),
  };
  const lista = [...d.paginas];
  lista.splice(i + 1, 0, copia);
  return comPaginas(d, lista);
}

/** Solta uma imagem numa página: entra no lugar indicado, ou no fim se ainda couber. */
export function porImagem(d: DocumentoBook, id: string, jobId: string, indice?: number): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => {
      if (p.id !== id) return p;
      const imagens = [...p.imagens];
      const onde = indice ?? (imagens.length < limiteDeImagens(p, d.tipo) ? imagens.length : 0);
      imagens[onde] = jobId;
      return tocar({ ...p, imagens });
    })
  );
}

/**
 * Quantas imagens o layout daquela página comporta. É o TEMPLATE mandando, não a pessoa --
 * e é essa regra que impede o book de virar colagem.
 *
 * A capa leva cinco só no PDF de WhatsApp, que é página única e traz a grade embaixo. Nos
 * outros tipos a capa é uma foto só, e oferecer "adicionar 4 imagens" ali seria convidar
 * pra uma ação que não muda nada na página.
 */
export function limiteDeImagens(p: Pagina, tipoBook?: TipoBook): number {
  if (p.tipo === "capa") return tipoBook === "whatsapp" ? 5 : 1;
  if (p.tipo === "planta") return 1;
  // Localização aceita UMA imagem, que na prática é o print do mapa. Não existe mapa
  // próprio na Encena: o corretor guarda em Materiais o recorte que ele já usa e arrasta
  // pra cá. Mapa de verdade pede chave de API e custo por visualização.
  if (p.tipo === "localizacao") return 1;
  // Página de imóvel no catálogo: uma foto, a que vende. Catálogo com três fotos por
  // imóvel vira book -- e aí não é mais catálogo.
  if (p.tipo === "imovel") return 1;
  // Grade do portfólio: seis por página, 2x3. É o formato que a leitura dos materiais de
  // captação mostrou -- mais que isso vira contato sheet, menos vira book.
  if (p.tipo === "grade") return 6;
  if (p.tipo !== "foto") return 0;
  return p.layout === "duas" ? 2 : 1;
}

export function definirTexto(d: DocumentoBook, id: string, chave: string, valor: string): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => (p.id === id ? tocar({ ...p, textos: { ...p.textos, [chave]: valor } }) : p))
  );
}

/**
 * A etiqueta da capa: "À VENDA", "VENDIDO", "OPEN HOUSE". Vazio tira.
 *
 * Tem função própria, e não `definirTexto`, por causa de UMA diferença: não marca a
 * página como mexida à mão. A fase do anúncio é outro eixo -- a pessoa troca de
 * "À venda" pra "Vendido" e continua querendo que Refazer reescreva o título e a
 * descrição. Com `definirTexto` a capa virava manual e Refazer passava por ela sem
 * tocar, calado.
 */
export function definirSelo(d: DocumentoBook, texto: string): DocumentoBook {
  const limpo = texto.trim().slice(0, 24);
  return comPaginas(
    d,
    d.paginas.map((p) => (p.tipo === "capa" ? { ...p, textos: { ...p.textos, selo: limpo } } : p))
  );
}

/**
 * A camada livre, em quatro operações.
 *
 * Mexer em elemento NÃO marca a página como manual, pela mesma razão do selo: a pessoa
 * põe um "Últimas unidades" por cima e continua querendo que Refazer reescreva a
 * descrição embaixo. Os elementos são uma camada separada, e é por isso que valem a pena.
 */
export function adicionarElemento(d: DocumentoBook, paginaId: string, estilo: EstiloElemento): DocumentoBook {
  const def = ESTILO_ELEMENTO_POR_ID[estilo];
  const pagina = d.paginas.find((p) => p.id === paginaId);
  if (!pagina || !def) return d;
  // Entra no meio da página, um degrau abaixo do anterior: dois elementos novos
  // exatamente em cima um do outro parecem um só, e a pessoa arrasta o que não queria.
  const quantos = pagina.elementos?.length ?? 0;
  const novo: ElementoLivre = {
    id: novoId(),
    estilo,
    texto: def.padrao.texto,
    x: Math.min(0.9 - def.padrao.l, 0.07 + quantos * 0.03),
    y: Math.min(0.85, 0.4 + quantos * 0.06),
    l: def.padrao.l,
    ...(estilo === "bloco" ? { a: 0.08 } : {}),
    alinhamento: estilo === "faixa" ? "centro" : "esquerda",
  };
  return comPaginas(
    d,
    d.paginas.map((p) => (p.id === paginaId ? { ...p, elementos: [...(p.elementos ?? []), novo] } : p))
  );
}

export function mudarElemento(d: DocumentoBook, paginaId: string, elementoId: string, mudanca: Partial<Omit<ElementoLivre, "id">>): DocumentoBook {
  const limite = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return comPaginas(
    d,
    d.paginas.map((p) =>
      p.id !== paginaId
        ? p
        : {
            ...p,
            elementos: (p.elementos ?? []).map((e) => {
              if (e.id !== elementoId) return e;
              const j = { ...e, ...mudanca };
              // Preso dentro da página: elemento com metade pra fora não é liberdade,
              // é material cortado na hora de exportar.
              const l = limite(j.l, 0.08, 1);
              return { ...j, l, x: limite(j.x, 0, 1 - l), y: limite(j.y, 0, 0.98), a: j.a === undefined ? undefined : limite(j.a, 0.02, 1) };
            }),
          }
    )
  );
}

export function removerElemento(d: DocumentoBook, paginaId: string, elementoId: string): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => (p.id === paginaId ? { ...p, elementos: (p.elementos ?? []).filter((e) => e.id !== elementoId) } : p))
  );
}

export function trocarImagem(d: DocumentoBook, id: string, indice: number, jobId: string): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => {
      if (p.id !== id) return p;
      const imagens = [...p.imagens];
      imagens[indice] = jobId;
      return tocar({ ...p, imagens });
    })
  );
}

/**
 * Troca o template da página. O template manda no conteúdo, não o contrário: mudar pra
 * "uma foto" descarta a segunda em vez de deixar sobra invisível no documento.
 */
export function definirLayout(d: DocumentoBook, id: string, layout: LayoutFoto): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => {
      if (p.id !== id) return p;
      const nova = { ...p, layout };
      return tocar({ ...nova, imagens: p.imagens.slice(0, limiteDeImagens(nova, d.tipo)) });
    })
  );
}

export function definirFoco(d: DocumentoBook, id: string, jobId: string, x: number, y: number): DocumentoBook {
  const preso = (v: number) => Math.max(-0.5, Math.min(0.5, v));
  return comPaginas(
    d,
    d.paginas.map((p) => (p.id === id ? tocar({ ...p, foco: { ...(p.foco ?? {}), [jobId]: { x: preso(x), y: preso(y) } } }) : p))
  );
}

/** Promove uma foto a capa. A que estava lá desce pro lugar de onde a nova veio. */
export function definirCapa(d: DocumentoBook, jobId: string): DocumentoBook {
  const capa = d.paginas.find((p) => p.tipo === "capa");
  if (!capa) return d;
  const antiga = capa.imagens[0];
  return comPaginas(
    d,
    d.paginas.map((p) => {
      if (p.id === capa.id) return tocar({ ...p, imagens: [jobId] });
      if (p.tipo === "foto" && p.imagens.includes(jobId)) {
        return tocar({ ...p, imagens: p.imagens.map((x) => (x === jobId ? antiga : x)).filter(Boolean) });
      }
      return p;
    })
  );
}

export function definirIdentidade(d: DocumentoBook, mudanca: Partial<Identidade>): DocumentoBook {
  return { ...d, identidade: { ...d.identidade, ...mudanca } };
}

/** Todos os jobIds usados, sem repetir. Serve pra assinar URL e pra baixar no export. */
export function imagensDoDocumento(d: DocumentoBook): string[] {
  return [...new Set(d.paginas.flatMap((p) => p.imagens).filter(Boolean))];
}

// ---------- validação ----------

const LAYOUTS: LayoutFoto[] = ["cheia", "duas", "foto_texto"];

/** O maior `limiteDeImagens` de qualquer tipo de página. Sanitização não pode cortar abaixo disso. */
const MAX_IMAGENS_POR_PAGINA = 6;
/** Oito elementos numa página já é poluição; o teto existe pra segurar arquivo inflado. */
const MAX_ELEMENTOS_POR_PAGINA = 8;

/**
 * Limpa o que veio do banco ou do navegador. Nada aqui confia na entrada: o documento é
 * jsonb, então uma linha velha, um cliente com bug ou um curioso no devtools podem mandar
 * qualquer coisa -- e o renderizador não pode quebrar por causa disso.
 */
export function limparDocumento(bruto: unknown): DocumentoBook | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;
  const def = TIPO_POR_ID[typeof d.tipo === "string" ? d.tipo : ""];
  if (!def) return null;

  const formato = typeof d.formato === "string" && d.formato in DIMENSOES ? (d.formato as Formato) : def.formato;
  const ident = (d.identidade ?? {}) as Record<string, unknown>;
  const cor = typeof ident.cor === "string" && /^#?[0-9a-f]{6}$/i.test(ident.cor) ? ident.cor : undefined;

  const paginas: Pagina[] = [];
  for (const bruta of Array.isArray(d.paginas) ? d.paginas.slice(0, 60) : []) {
    if (!bruta || typeof bruta !== "object") continue;
    const p = bruta as Record<string, unknown>;
    const tipo = typeof p.tipo === "string" && TIPOS_PAGINA.includes(p.tipo as TipoPagina) ? (p.tipo as TipoPagina) : null;
    if (!tipo) continue;

    const textos: Record<string, string> = {};
    if (p.textos && typeof p.textos === "object") {
      for (const [k, v] of Object.entries(p.textos as Record<string, unknown>)) {
        // Dígito PRECISA passar: `legenda2` e `corpo2` são chaves reais. A versão anterior
        // desta linha só aceitava [a-z_], então a legenda da segunda foto era gravada e
        // sumia calada na releitura -- mesmo padrão do whitelist de tipos de página, no
        // mesmo arquivo. Sanitização que descarta em silêncio esconde bug por meses.
        if (typeof v === "string" && /^[a-z_][a-z0-9_]{0,19}$/.test(k)) textos[k] = v.slice(0, 1200);
      }
    }

    const foco: Record<string, { x: number; y: number }> = {};
    if (p.foco && typeof p.foco === "object") {
      for (const [k, v] of Object.entries(p.foco as Record<string, unknown>)) {
        const f = v as { x?: unknown; y?: unknown };
        if (typeof f?.x === "number" && typeof f?.y === "number") {
          foco[k] = { x: Math.max(-0.5, Math.min(0.5, f.x)), y: Math.max(-0.5, Math.min(0.5, f.y)) };
        }
      }
    }

    // A camada livre. Cada campo é conferido: fração fora de 0..1 desloca o elemento pra
    // fora do papel, e estilo desconhecido não tem como ser desenhado. O elemento inteiro
    // é descartado quando não dá pra confiar nele -- mas nunca em silêncio pela metade,
    // que é como as três perdas anteriores deste arquivo aconteceram.
    const elementos: ElementoLivre[] = [];
    for (const bruto of Array.isArray(p.elementos) ? p.elementos.slice(0, MAX_ELEMENTOS_POR_PAGINA) : []) {
      if (!bruto || typeof bruto !== "object") continue;
      const e = bruto as Record<string, unknown>;
      const estilo = typeof e.estilo === "string" && e.estilo in ESTILO_ELEMENTO_POR_ID ? (e.estilo as EstiloElemento) : null;
      if (!estilo) continue;
      const fr = (v: unknown, padrao: number, min = 0, max = 1) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n * 1000) / 1000)) : padrao;
      };
      const l = fr(e.l, ESTILO_ELEMENTO_POR_ID[estilo].padrao.l, 0.08, 1);
      elementos.push({
        id: typeof e.id === "string" && e.id.length <= 40 ? e.id : novoId(),
        estilo,
        texto: typeof e.texto === "string" ? e.texto.slice(0, 160) : "",
        l,
        x: fr(e.x, 0.07, 0, 1 - l),
        y: fr(e.y, 0.4, 0, 0.98),
        a: e.a === undefined || e.a === null ? undefined : fr(e.a, 0.08, 0.02, 1),
        alinhamento: e.alinhamento === "centro" || e.alinhamento === "direita" ? e.alinhamento : "esquerda",
      });
    }

    paginas.push({
      id: typeof p.id === "string" && p.id.length <= 40 ? p.id : novoId(),
      tipo,
      ...(elementos.length ? { elementos } : {}),
      origem: p.origem === "manual" ? "manual" : "auto",
      layout: typeof p.layout === "string" && LAYOUTS.includes(p.layout as LayoutFoto) ? (p.layout as LayoutFoto) : undefined,
      // O teto tem que acompanhar o tipo de página que MAIS aceita imagens (hoje a grade
      // do portfólio, com 6). Estava fixo em 4, e a grade perdia duas fotos na releitura --
      // gravava seis, lia quatro, em silêncio. Terceira vez que uma constante duplicada
      // neste arquivo engole conteúdo: ver o whitelist de tipos e a regex das chaves.
      imagens: (Array.isArray(p.imagens) ? p.imagens : []).filter((x): x is string => typeof x === "string").slice(0, MAX_IMAGENS_POR_PAGINA),
      textos,
      ...(Object.keys(foco).length ? { foco } : {}),
    });
  }
  if (paginas.length === 0) return null;

  return {
    versao: 1,
    tipo: def.id,
    formato,
    identidade: { cor, capaEscura: ident.capaEscura !== false, fonte: ident.fonte === "classica" ? "classica" : "moderna" },
    paginas,
  };
}
