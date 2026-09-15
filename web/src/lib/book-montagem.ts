import { TIPOS_ESPACO, rotuloDoTipo } from "./acoes";
import { rotuloDoValor, valorComPeriodo } from "./ficha-imovel";
import type { Idioma } from "@/i18n/idiomas";
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
  /**
   * 0 a 10, da leitura de imagem (book-ia). Só a montagem automática preenche; no caminho
   * manual fica ausente e o desempate continua sendo a ordem em que a pessoa marcou.
   */
  qualidade?: number;
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
  /** venda | locacao | ambos. Decide o rótulo do valor e o "/mês". Null = não informado. */
  negocio?: string | null;
  capa_job_id?: string | null;
};

/**
 * A ordem da VISITA, não a ordem de geração.
 *
 * Sai direto de TIPOS_ESPACO, que já está gravado nos parâmetros de metade dos jobs --
 * então boa parte do book se ordena sozinho, de graça, sem IA nenhuma. Foto sem espaço
 * conhecido entra depois das conhecidas, e a pessoa arrasta se quiser.
 */
const ORDEM_VISITA = [
  "fachada", "entrada", "sala", "integrado", "jantar", "cozinha", "escritorio", "quarto",
  "infantil", "closet", "banheiro", "area_servico", "varanda", "gourmet", "quintal",
  // Área comum vem por último: é do prédio, não da unidade, e quem está comprando quer
  // ver o imóvel antes do salão de festas.
  "piscina", "salao", "academia", "playground",
];

/**
 * Rótulo de cada ambiente. Os de TIPOS_ESPACO vêm da pessoa (ela escolheu ao editar a
 * foto); os de baixo só a leitura de imagem produz, e existem aqui pra que a legenda
 * automática saiba escrever "Piscina" em vez de ficar vazia.
 */
const ROTULO_ESPACO: Record<string, string> = {
  ...Object.fromEntries(TIPOS_ESPACO.filter((e) => e.valor !== "auto").map((e) => [e.valor, e.rotulo])),
  fachada: "Fachada",
  closet: "Closet",
  area_servico: "Área de serviço",
  quintal: "Quintal",
  piscina: "Piscina",
  salao: "Salão de festas",
  academia: "Academia",
  playground: "Playground",
};

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
export function fichaDoImovel(i: ImovelMontagem, idioma: Idioma = "pt"): { rotulo: string; valor: string }[] {
  const r = ROTULOS_FICHA[idioma];
  const linhas: { rotulo: string; valor: string }[] = [];
  // Número sai no formato daqui: 96,5 e não 96.5. O ponto decimal num material que vai
  // pro cliente brasileiro parece erro de sistema.
  const por = (rotulo: string, valor: unknown, sufixo = "") => {
    if (valor === null || valor === undefined || valor === "") return;
    const texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
    linhas.push({ rotulo, valor: `${texto}${sufixo}` });
  };
  por(r.areaUtil, i.area_util, " m²");
  por(r.areaTotal, i.area_total, " m²");
  por(r.dormitorios, i.dormitorios);
  por(r.suites, i.suites);
  por(r.banheiros, i.banheiros);
  por(r.vagas, i.vagas);
  por(r.ano, i.ano_construcao);
  por(r.condominio, i.condominio);
  por(r.iptu, i.iptu);
  return linhas;
}

/**
 * Os rótulos da ficha impressa, nos três idiomas.
 *
 * A ficha vai IMPRESSA no material que o corretor manda pro cliente: "Dormitórios" numa
 * página em espanhol é a peça saindo errada, não um detalhe de interface. "IPTU" fica
 * como está de propósito -- é o nome de um imposto brasileiro, não uma palavra.
 */
const ROTULOS_FICHA: Record<Idioma, { areaUtil: string; areaTotal: string; dormitorios: string; suites: string; banheiros: string; vagas: string; ano: string; condominio: string; iptu: string }> = {
  pt: { areaUtil: "Área útil", areaTotal: "Área total", dormitorios: "Dormitórios", suites: "Suítes", banheiros: "Banheiros", vagas: "Vagas", ano: "Ano", condominio: "Condomínio", iptu: "IPTU" },
  es: { areaUtil: "Superficie útil", areaTotal: "Superficie total", dormitorios: "Dormitorios", suites: "Suites", banheiros: "Baños", vagas: "Cocheras", ano: "Año", condominio: "Expensas", iptu: "IPTU" },
  en: { areaUtil: "Usable area", areaTotal: "Total area", dormitorios: "Bedrooms", suites: "Suites", banheiros: "Bathrooms", vagas: "Garages", ano: "Year", condominio: "HOA", iptu: "Property tax" },
};

export type DadosMontagem = {
  tipo: TipoBook;
  imovel: ImovelMontagem;
  imagens: ImagemDisponivel[];
  cor?: string;
  /** Idioma dos textos que a montagem escreve sozinha (preço com período, ficha). */
  idioma?: Idioma;
};

/**
 * Monta o documento inteiro. Puro: mesma entrada, mesma saída, sem rede e sem banco.
 */
export function montar(d: DadosMontagem): DocumentoBook {
  const def = TIPO_POR_ID[d.tipo] ?? TIPO_POR_ID.book;
  const capa = escolherCapa(d.imagens, d.imovel.capa_job_id);

  // A capa sai da sequência: foto repetida na página 4 parece descuido do software.
  // Ordem: o cômodo manda, a qualidade desempata, a data desempata o desempate. É a
  // qualidade que decide qual das três fotos da sala abre o cômodo -- e, quando o tipo tem
  // teto de fotos, quais ficam de fora. Sem nota (caminho manual) tudo vale 5 e a ordem
  // continua sendo a de sempre.
  const restantes = d.imagens
    .filter((i) => i.jobId !== capa?.jobId)
    .slice()
    .sort((a, b) => peso(a) - peso(b) || (b.qualidade ?? 5) - (a.qualidade ?? 5) || (a.criadoEm < b.criadoEm ? -1 : 1))
    .slice(0, Math.max(0, def.maxFotos - 1));

  const paginas: Pagina[] = [];

  // A descrição vai na capa só onde ela cabe e não se repete: nos tipos deitados o texto
  // tem página própria, e escrever nos dois lugares é o mesmo parágrafo duas vezes.
  const descricaoNaCapa = !def.paginasFixas.includes("texto") && def.formato !== "widescreen";

  paginas.push({
    id: novoId(),
    tipo: "capa",
    origem: "auto",
    imagens: capa ? [capa.jobId] : [],
    textos: {
      titulo: d.imovel.titulo,
      subtitulo: d.imovel.endereco ?? "",
      ...(def.usaPreco && d.imovel.preco ? { preco: valorComPeriodo(d.imovel.preco, d.imovel.negocio, d.idioma) } : {}),
      ...(descricaoNaCapa && d.imovel.descricao ? { descricao: d.imovel.descricao } : {}),
    },
  });

  // Página única: o PDF de WhatsApp (o arquivo que se manda na conversa), o post e o
  // Story. As outras fotos entram na própria capa, não viram página nova.
  if (def.paginaUnica) {
    const extras = Math.max(0, def.maxFotos - 1);
    paginas[0].imagens = [capa?.jobId, ...restantes.slice(0, extras).map((i) => i.jobId)].filter((x): x is string => !!x);
    // No Story a foto ocupa quase tudo e a descrição não cabe: só título, preço e local.
    if (def.formato !== "story") paginas[0].textos.descricao = d.imovel.descricao ?? "";
    return { versao: 1, tipo: def.id, formato: def.formato, identidade: { cor: d.cor, capaEscura: true }, paginas };
  }

  if (def.paginasFixas.includes("texto") && d.imovel.descricao) {
    paginas.push({ id: novoId(), tipo: "texto", origem: "auto", imagens: [], textos: { titulo: d.imovel.titulo, corpo: d.imovel.descricao } });
  }

  // Destaques e localização vêm ANTES das fotos: a leitura de 16 materiais reais mostrou
  // a mesma ordem em todos -- capa, promessa, onde fica, e só então o passeio pelas fotos.
  //
  // A página de destaques nasce vazia aqui de propósito. `montar()` é puro e não chama
  // IA; quem preenche é a montagem automática (book-ia), e se ela não rodar a página cai
  // fora na hora de gravar em vez de sair em branco no material do cliente.
  if (def.paginasFixas.includes("numeros")) {
    paginas.push({
      id: novoId(),
      tipo: "numeros",
      origem: "auto",
      imagens: [],
      // Sai da ficha, não de texto interpretado: número que o investidor compara tem que
      // vir do cadastro, com o rótulo certo.
      textos: { titulo: "Os números", corpo: numerosDoImovel(d.imovel).join("\n"), nota: d.imovel.descricao ?? "" },
    });
  }

  if (def.paginasFixas.includes("destaques")) {
    paginas.push({
      id: novoId(),
      tipo: "destaques",
      origem: "auto",
      imagens: [],
      // Duas listas, e a divisão é factual, não retórica: à esquerda o que o cadastro diz
      // que o imóvel É; à direita o que as fotos mostram que ele TEM a mais. Diferencial
      // de verdade seria comparação com a vizinhança, e esse dado nós não temos --
      // inventar superioridade era o caminho fácil e é exatamente o proibido aqui.
      textos: { titulo: "O imóvel", corpo: "", titulo2: "O que tem a mais", corpo2: "" },
    });
  }

  if (def.paginasFixas.includes("localizacao") && d.imovel.endereco) {
    paginas.push({
      id: novoId(),
      tipo: "localizacao",
      origem: "auto",
      imagens: [],
      textos: { titulo: "Localização", endereco: d.imovel.endereco, corpo: "" },
    });
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

/** Uma linha de ficha compacta, do jeito que cabe embaixo do preço num catálogo. */
export function fichaCurta(i: ImovelMontagem): string {
  const partes: string[] = [];
  if (i.area_util) partes.push(`${String(i.area_util).replace(".", ",")} m²`);
  if (i.dormitorios) partes.push(`${i.dormitorios} ${i.dormitorios === 1 ? "dorm" : "dorms"}`);
  if (i.suites) partes.push(`${i.suites} ${i.suites === 1 ? "suíte" : "suítes"}`);
  if (i.vagas) partes.push(`${i.vagas} ${i.vagas === 1 ? "vaga" : "vagas"}`);
  return partes.join("  ·  ");
}

export type ImovelDoCatalogo = { imovel: ImovelMontagem; imagens: ImagemDisponivel[] };

/**
 * O CATÁLOGO: vários imóveis num arquivo, um por página.
 *
 * Estrutura diferente do book de propósito. O book passeia por UM imóvel; o catálogo é uma
 * vitrine, e quem recebe compara. Por isso cada imóvel ocupa exatamente uma página, com os
 * mesmos campos na mesma posição -- comparar é impossível quando cada ficha sai num lugar.
 *
 * E não há texto de venda por imóvel: título, endereço, preço e ficha saem do cadastro,
 * nada mais. Meia dúzia de parágrafos gerados, um por imóvel, é meia dúzia de chances de
 * afirmar o que não se sabe.
 */
export function montarCatalogo(d: { imoveis: ImovelDoCatalogo[]; cor?: string; titulo?: string }): DocumentoBook {
  const def = TIPO_POR_ID.catalogo;
  const paginas: Pagina[] = [];

  const primeira = d.imoveis.find((x) => escolherCapa(x.imagens, x.imovel.capa_job_id));
  const capa = primeira ? escolherCapa(primeira.imagens, primeira.imovel.capa_job_id) : null;

  paginas.push({
    id: novoId(),
    tipo: "capa",
    origem: "auto",
    imagens: capa ? [capa.jobId] : [],
    textos: {
      titulo: d.titulo || "Imóveis selecionados",
      subtitulo: `${d.imoveis.length} ${d.imoveis.length === 1 ? "imóvel" : "imóveis"}`,
    },
  });

  for (const { imovel, imagens } of d.imoveis.slice(0, def.maxFotos)) {
    const foto = escolherCapa(imagens, imovel.capa_job_id);
    paginas.push({
      id: novoId(),
      tipo: "imovel",
      origem: "auto",
      imagens: foto ? [foto.jobId] : [],
      textos: {
        titulo: imovel.titulo,
        endereco: imovel.endereco ?? "",
        preco: valorComPeriodo(imovel.preco, imovel.negocio),
        ficha: fichaCurta(imovel),
      },
    });
  }

  paginas.push({ id: novoId(), tipo: "contato", origem: "auto", imagens: [], textos: { chamada: "Qual deles você quer ver?" } });

  return { versao: 1, tipo: def.id, formato: def.formato, identidade: { cor: d.cor, capaEscura: true }, paginas };
}

/** Os números que um investidor compara, saídos da ficha -- não de texto interpretado. */
export function numerosDoImovel(i: ImovelMontagem): string[] {
  const linhas: string[] = [];
  if (i.preco) linhas.push(`${rotuloDoValor(i.negocio)}: ${valorComPeriodo(i.preco, i.negocio)}`);
  if (i.area_util) linhas.push(`Área útil: ${String(i.area_util).replace(".", ",")} m²`);
  if (i.area_total) linhas.push(`Área total: ${String(i.area_total).replace(".", ",")} m²`);
  if (i.dormitorios) linhas.push(`Dormitórios: ${i.dormitorios}`);
  if (i.vagas) linhas.push(`Vagas: ${i.vagas}`);
  if (i.ano_construcao) linhas.push(`Ano: ${i.ano_construcao}`);
  if (i.condominio) linhas.push(`Condomínio: ${i.condominio}`);
  if (i.iptu) linhas.push(`IPTU: ${i.iptu}`);
  return linhas.slice(0, 8);
}

/**
 * O PORTFÓLIO: o que o corretor já fez, em grade.
 *
 * É o único material que não fala de um imóvel à venda -- fala de QUEM VENDE. Por isso não
 * tem preço, não tem ficha e não tem localização: quem recebe está avaliando o corretor,
 * não o apartamento. Seis fotos por página, com o nome do imóvel embaixo de cada uma.
 */
export function montarPortfolio(d: { imoveis: ImovelDoCatalogo[]; cor?: string; titulo?: string; subtitulo?: string }): DocumentoBook {
  const def = TIPO_POR_ID.portfolio;
  const paginas: Pagina[] = [];

  const todas: { jobId: string; nome: string }[] = [];
  for (const { imovel, imagens } of d.imoveis) {
    for (const img of imagens.filter((i) => !ehPlanta(i) && !ehTecnica(i))) {
      todas.push({ jobId: img.jobId, nome: imovel.titulo });
    }
  }
  const capa = todas[0];

  paginas.push({
    id: novoId(),
    tipo: "capa",
    origem: "auto",
    imagens: capa ? [capa.jobId] : [],
    textos: {
      titulo: d.titulo || "Meu portfólio",
      subtitulo: d.subtitulo || `${d.imoveis.length} ${d.imoveis.length === 1 ? "imóvel" : "imóveis"}`,
    },
  });

  // A capa sai da grade: repetir a mesma foto duas páginas depois parece descuido.
  const restantes = todas.filter((t) => t.jobId !== capa?.jobId).slice(0, def.maxFotos);
  for (let i = 0; i < restantes.length; i += 6) {
    const seis = restantes.slice(i, i + 6);
    const textos: Record<string, string> = i === 0 ? { titulo: "Trabalhos" } : {};
    seis.forEach((t, k) => {
      textos[`legenda${k + 1}`] = t.nome;
    });
    paginas.push({ id: novoId(), tipo: "grade", origem: "auto", imagens: seis.map((t) => t.jobId), textos });
  }

  paginas.push({ id: novoId(), tipo: "contato", origem: "auto", imagens: [], textos: { chamada: "Vamos conversar?" } });
  return { versao: 1, tipo: def.id, formato: def.formato, identidade: { cor: d.cor, capaEscura: true }, paginas };
}

/**
 * Remonta preservando o trabalho manual: páginas 'manual' sobrevivem no lugar onde
 * estão, e o resto é refeito pela regra. É o que permite trocar de tipo sem perder o que
 * a pessoa escreveu.
 */
export function remontar(atual: DocumentoBook, d: DadosMontagem): { documento: DocumentoBook; descartadas: number } {
  return remontarCom(atual, montar(d));
}

/**
 * A fusão em si, separada de quem montou o documento novo. É o que deixa o "refazer
 * automaticamente" reaproveitar exatamente esta regra: o book novo pode vir da montagem
 * pura OU da montagem com IA, e o que a pessoa editou sobrevive igual nos dois casos.
 */
export function remontarCom(atual: DocumentoBook, novo: DocumentoBook): { documento: DocumentoBook; descartadas: number } {
  const manuais = atual.paginas.filter((p) => p.origem === "manual");
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
