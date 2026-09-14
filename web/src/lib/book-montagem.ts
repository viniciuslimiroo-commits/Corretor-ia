import { TIPOS_ESPACO, rotuloDoTipo } from "./acoes";
import { TIPO_POR_ID, type TipoBook } from "./book-tipos";
import { novoId, type DocumentoBook, type Pagina } from "./book-documento";

// A montagem automática: de um punhado de imagens a um book pronto.
//
// É aqui que o produto se decide. Se isto for bom, ninguém edita -- e "extremamente
// simples" deixa de ser promessa e vira o comportamento normal. Por isso as regras são
// explícitas e testáveis, não um monte de `if` espalhado pela rota.

export type ImagemDisponivel = {
  jobId: string;
  /** job.tipo: 'mobiliar', 'terreno_construir', 'planta_humanizada'… */
  tipo: string;
  /** job.parametros.tipo_espaco, quando a ação tinha esse parâmetro. */
  tipoEspaco?: string | null;
  criadoEm: string;
  imovelId?: string | null;
  imovelTitulo?: string | null;
};

export type ImovelMontagem = {
  id: string | null;
  titulo: string;
  endereco?: string | null;
  preco?: string | null;
  descricao?: string | null;
  area_util?: number | null;
  area_total?: number | null;
  dormitorios?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  ano_construcao?: number | null;
  condominio?: string | null;
  iptu?: string | null;
  capa_job_id?: string | null;
};

/**
 * A ordem da VISITA, não a ordem de geração.
 *
 * Sai direto de TIPOS_ESPACO, que já está gravado nos parâmetros de metade dos jobs --
 * então boa parte do book se ordena sozinho, de graça, sem IA nenhuma. Foto sem espaço
 * conhecido entra depois das conhecidas, e a pessoa arrasta se quiser.
 */
const ORDEM_VISITA = ["entrada", "sala", "integrado", "jantar", "cozinha", "escritorio", "quarto", "infantil", "banheiro", "varanda", "gourmet"];

const ROTULO_ESPACO: Record<string, string> = Object.fromEntries(TIPOS_ESPACO.filter((e) => e.valor !== "auto").map((e) => [e.valor, e.rotulo]));

/** Imagem de fora da casa: entra como fachada, antes dos cômodos. */
function ehExterna(img: ImagemDisponivel): boolean {
  return img.tipo === "trocar_ceu" || img.tipo === "terreno_construir" || img.tipo === "terreno_livre" || img.tipo === "terreno_limpar";
}

function ehPlanta(img: ImagemDisponivel): boolean {
  return img.tipo.startsWith("planta");
}

/** Terreno com medidas marcadas: é peça técnica, fica perto da planta. */
function ehTecnica(img: ImagemDisponivel): boolean {
  return img.tipo === "terreno";
}

function peso(img: ImagemDisponivel): number {
  if (ehExterna(img)) return 0;
  if (ehPlanta(img)) return 90;
  if (ehTecnica(img)) return 95;
  const espaco = img.tipoEspaco && img.tipoEspaco !== "auto" ? img.tipoEspaco : null;
  const i = espaco ? ORDEM_VISITA.indexOf(espaco) : -1;
  return i >= 0 ? 10 + i : 50;
}

/**
 * Legenda da imagem: o nome do AMBIENTE, e só.
 *
 * Quando não dá pra saber o ambiente, a legenda fica vazia -- de propósito. O nome da
 * ação é vocabulário do software, não do imóvel: "Melhorar foto" embaixo da sala e
 * "Converter em HD" embaixo da cozinha, num material que vai pro cliente, é pior que
 * legenda nenhuma. Planta e terreno são exceção porque aí o rótulo diz mesmo o que a
 * imagem é.
 *
 * Não repete o aviso legal: ele já está QUEIMADO no canto da imagem pelo selo
 * (lib/selo.ts) e ainda sai no rodapé de toda página. Escrever pela terceira vez embaixo
 * da foto empilha aviso em cima de aviso e ensina a ignorar os três.
 */
export function legendaDaImagem(img: ImagemDisponivel): string {
  const espaco = img.tipoEspaco && img.tipoEspaco !== "auto" ? ROTULO_ESPACO[img.tipoEspaco] : null;
  if (espaco) return espaco;
  if (ehPlanta(img) || ehTecnica(img) || img.tipo === "terreno_construir") return rotuloDoTipo(img.tipo);
  return "";
}

/**
 * Qual imagem vira capa.
 *
 * Ordem de preferência: a capa marcada na galeria do imóvel; depois uma externa
 * (fachada vende); depois sala ou varanda; depois a mais recente que não seja planta.
 * Planta e terreno com medidas NUNCA são capa -- a pesquisa mostrou o estrago: a planta
 * em pé é recortada pela metade e o book abre parecendo documento de cartório.
 */
export function escolherCapa(imagens: ImagemDisponivel[], capaMarcada?: string | null): ImagemDisponivel | null {
  if (imagens.length === 0) return null;
  const marcada = capaMarcada ? imagens.find((i) => i.jobId === capaMarcada) : null;
  if (marcada && !ehPlanta(marcada) && !ehTecnica(marcada)) return marcada;

  const candidatas = imagens.filter((i) => !ehPlanta(i) && !ehTecnica(i));
  if (candidatas.length === 0) return imagens[0];
  const externa = candidatas.find(ehExterna);
  if (externa) return externa;
  const social = candidatas.find((i) => i.tipoEspaco === "sala" || i.tipoEspaco === "integrado" || i.tipoEspaco === "varanda");
  return social ?? candidatas[0];
}

/** A ficha técnica, só com o que está preenchido. Campo vazio não vira linha em branco. */
export function fichaDoImovel(i: ImovelMontagem): { rotulo: string; valor: string }[] {
  const linhas: { rotulo: string; valor: string }[] = [];
  const por = (rotulo: string, valor: unknown, sufixo = "") => {
    if (valor === null || valor === undefined || valor === "") return;
    linhas.push({ rotulo, valor: `${valor}${sufixo}` });
  };
  por("Área útil", i.area_util, " m²");
  por("Área total", i.area_total, " m²");
  por("Dormitórios", i.dormitorios);
  por("Suítes", i.suites);
  por("Banheiros", i.banheiros);
  por("Vagas", i.vagas);
  por("Ano", i.ano_construcao);
  por("Condomínio", i.condominio);
  por("IPTU", i.iptu);
  return linhas;
}

export type DadosMontagem = {
  tipo: TipoBook;
  imovel: ImovelMontagem;
  imagens: ImagemDisponivel[];
  cor?: string;
};

/**
 * Monta o documento inteiro. Puro: mesma entrada, mesma saída, sem rede e sem banco.
 */
export function montar(d: DadosMontagem): DocumentoBook {
  const def = TIPO_POR_ID[d.tipo] ?? TIPO_POR_ID.book;
  const capa = escolherCapa(d.imagens, d.imovel.capa_job_id);

  // A capa sai da sequência: foto repetida na página 4 parece descuido do software.
  const restantes = d.imagens
    .filter((i) => i.jobId !== capa?.jobId)
    .slice()
    .sort((a, b) => peso(a) - peso(b) || (a.criadoEm < b.criadoEm ? -1 : 1))
    .slice(0, Math.max(0, def.maxFotos - 1));

  const paginas: Pagina[] = [];

  paginas.push({
    id: novoId(),
    tipo: "capa",
    origem: "auto",
    imagens: capa ? [capa.jobId] : [],
    textos: {
      titulo: d.imovel.titulo,
      subtitulo: d.imovel.endereco ?? "",
      ...(def.usaPreco && d.imovel.preco ? { preco: d.imovel.preco } : {}),
    },
  });

  // O de WhatsApp é uma página só, de propósito: é o arquivo que se manda na conversa.
  // As quatro fotos seguintes entram na própria capa, não em páginas novas.
  if (def.id === "whatsapp") {
    paginas[0].imagens = [capa?.jobId, ...restantes.slice(0, 4).map((i) => i.jobId)].filter((x): x is string => !!x);
    paginas[0].textos.descricao = d.imovel.descricao ?? "";
    return { versao: 1, tipo: def.id, formato: def.formato, identidade: { cor: d.cor, capaEscura: true }, paginas };
  }

  if (def.paginasFixas.includes("texto") && d.imovel.descricao) {
    paginas.push({ id: novoId(), tipo: "texto", origem: "auto", imagens: [], textos: { titulo: d.imovel.titulo, corpo: d.imovel.descricao } });
  }

  const fotos = restantes.filter((i) => !ehPlanta(i));
  const plantas = restantes.filter(ehPlanta);

  if (def.fotoPorPagina) {
    for (const img of fotos) {
      paginas.push({ id: novoId(), tipo: "foto", origem: "auto", layout: "cheia", imagens: [img.jobId], textos: { legenda: legendaDaImagem(img) } });
    }
  } else {
    for (let i = 0; i < fotos.length; i += 2) {
      const par = fotos.slice(i, i + 2);
      paginas.push({
        id: novoId(),
        tipo: "foto",
        origem: "auto",
        layout: par.length === 2 ? "duas" : "cheia",
        imagens: par.map((x) => x.jobId),
        textos: { legenda: legendaDaImagem(par[0]), ...(par[1] ? { legenda2: legendaDaImagem(par[1]) } : {}) },
      });
    }
  }

  for (const p of plantas) {
    paginas.push({ id: novoId(), tipo: "planta", origem: "auto", imagens: [p.jobId], textos: { legenda: legendaDaImagem(p) } });
  }

  if (def.paginasFixas.includes("ficha") && fichaDoImovel(d.imovel).length > 0) {
    paginas.push({ id: novoId(), tipo: "ficha", origem: "auto", imagens: [], textos: { titulo: "Ficha técnica" } });
  }

  if (def.paginasFixas.includes("contato")) {
    paginas.push({ id: novoId(), tipo: "contato", origem: "auto", imagens: [], textos: { chamada: "Vamos visitar?" } });
  }

  return { versao: 1, tipo: def.id, formato: def.formato, identidade: { cor: d.cor, capaEscura: true }, paginas };
}

/**
 * Remonta preservando o trabalho manual: páginas 'manual' sobrevivem no lugar onde
 * estão, e o resto é refeito pela regra. É o que permite trocar de tipo sem perder o que
 * a pessoa escreveu.
 */
export function remontar(atual: DocumentoBook, d: DadosMontagem): { documento: DocumentoBook; descartadas: number } {
  const manuais = atual.paginas.filter((p) => p.origem === "manual");
  const novo = montar(d);
  const usadas = new Set(manuais.flatMap((p) => p.imagens));
  // Tira das páginas novas as imagens que já aparecem numa página que a pessoa editou.
  const semRepetir = novo.paginas
    .map((p) => (p.tipo === "foto" ? { ...p, imagens: p.imagens.filter((x) => !usadas.has(x)) } : p))
    .filter((p) => p.tipo !== "foto" || p.imagens.length > 0);

  const contato = semRepetir.filter((p) => p.tipo === "contato");
  const corpo = semRepetir.filter((p) => p.tipo !== "contato");
  return {
    documento: { ...novo, paginas: [...corpo, ...manuais.filter((p) => p.tipo !== "capa" && p.tipo !== "contato"), ...contato] },
    descartadas: atual.paginas.length - manuais.length,
  };
}
