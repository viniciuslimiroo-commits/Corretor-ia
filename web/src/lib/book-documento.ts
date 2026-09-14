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

export type Pagina = {
  id: string;
  tipo: TipoPagina;
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

export type Identidade = {
  /** Hex da marca. Ausente = a cor de Minha marca na hora de renderizar. */
  cor?: string;
  capaEscura: boolean;
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
  const copia: Pagina = { ...d.paginas[i], id: novoId(), origem: "manual", textos: { ...d.paginas[i].textos }, imagens: [...d.paginas[i].imagens] };
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
  if (p.tipo !== "foto") return 0;
  return p.layout === "duas" ? 2 : 1;
}

export function definirTexto(d: DocumentoBook, id: string, chave: string, valor: string): DocumentoBook {
  return comPaginas(
    d,
    d.paginas.map((p) => (p.id === id ? tocar({ ...p, textos: { ...p.textos, [chave]: valor } }) : p))
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
        if (typeof v === "string" && /^[a-z_]{1,20}$/.test(k)) textos[k] = v.slice(0, 1200);
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

    paginas.push({
      id: typeof p.id === "string" && p.id.length <= 40 ? p.id : novoId(),
      tipo,
      origem: p.origem === "manual" ? "manual" : "auto",
      layout: typeof p.layout === "string" && LAYOUTS.includes(p.layout as LayoutFoto) ? (p.layout as LayoutFoto) : undefined,
      imagens: (Array.isArray(p.imagens) ? p.imagens : []).filter((x): x is string => typeof x === "string").slice(0, 4),
      textos,
      ...(Object.keys(foco).length ? { foco } : {}),
    });
  }
  if (paginas.length === 0) return null;

  return { versao: 1, tipo: def.id, formato, identidade: { cor, capaEscura: ident.capaEscura !== false }, paginas };
}
