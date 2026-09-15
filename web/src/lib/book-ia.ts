import { chamarSincrono } from "./fal";
import { assinar } from "./armazenamento";
import { conferirFatos } from "./book-fatos";
import { fichaDoImovel, montar, type DadosMontagem, type ImagemDisponivel, type ImovelMontagem } from "./book-montagem";
import { novoId, type DocumentoBook, type Pagina } from "./book-documento";
import { TIPO_POR_ID, type TipoBook } from "./book-tipos";
import { garantirMapa } from "./mapa";
import { REGRA_IDIOMA, type Idioma } from "@/i18n/idiomas";

// "Criar automaticamente": do imóvel cadastrado a um book pronto, sem a pessoa escolher
// nada.
//
// A divisão que sustenta tudo isto:
//
//   FATO  -> vem do cadastro. Metragem, quartos, suítes, banheiros, vagas, ano, endereço,
//            condomínio, IPTU, preço. A IA recebe como leitura e NUNCA como sugestão.
//   OLHAR -> vem da foto. Que cômodo é, se está nítida, o que aparece. É leitura de
//            imagem, não afirmação sobre o imóvel.
//   LÍNGUA-> vem da IA. Ordem das frases, tom, título. Só isso.
//
// E na saída tem porteira: `conferirFatos` reprova qualquer número sem origem antes de o
// texto entrar no documento (book-fatos.ts). Prompt pede; o guarda garante.
//
// Se a IA falhar -- chave ausente, timeout, fal fora do ar -- a montagem determinística
// (montar()) segue sozinha e o book sai assim mesmo. Automático que quebra por causa de
// um serviço externo é pior do que automático simples.

const MODELO = "google/gemini-2.5-flash-lite";
const EM_PARALELO = 6;

/**
 * O vocabulário fechado de ambientes. Fechado de propósito: resposta livre vira
 * "aconchegante living integrado" e nunca casa com a ordem de visita.
 */
export const AMBIENTES = [
  "fachada", "entrada", "sala", "integrado", "jantar", "cozinha", "escritorio", "quarto",
  "infantil", "closet", "banheiro", "area_servico", "varanda", "gourmet", "quintal",
  "piscina", "salao", "academia", "playground", "planta", "outro",
] as const;

export type Olhar = {
  jobId: string;
  ambiente: string | null;
  /** 0 a 10: nitidez, enquadramento e luz. Ordena as melhores. */
  qualidade: number;
  /** Legenda curta do que aparece. Nunca traz número -- isso é conferido. */
  legenda: string;
};

type LinhaJob = { id: string; output_path: string | null; thumb_path?: string | null; ambiente_ia?: string | null; qualidade_ia?: number | null; legenda_ia?: string | null; visto_em?: string | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

function jsonDaResposta(saida: unknown): Record<string, unknown> | null {
  const texto = String((saida as { output?: string })?.output ?? "");
  const bloco = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) return null;
  try {
    return JSON.parse(bloco) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

const PROMPT_OLHAR = [
  "Você está catalogando a foto de um imóvel. Responda SÓ com um JSON, sem markdown:",
  '{"ambiente":"<um valor da lista>","qualidade":<0 a 10>,"legenda":"<até 5 palavras>"}',
  `Valores possíveis de ambiente: ${AMBIENTES.join(", ")}.`,
  "Use 'fachada' para a vista externa do prédio ou da casa; 'planta' para planta baixa ou desenho técnico; 'outro' quando não der pra dizer.",
  "qualidade é a foto em si: nitidez, enquadramento e luz. 10 é foto de catálogo, 3 é escura ou torta.",
  "legenda nomeia o ambiente e, se houver, o destaque visível. Sem ponto final, sem frase de venda.",
  "NUNCA escreva número, medida, metragem, preço nem quantidade de cômodos na legenda. Você não tem essa informação.",
].join("\n");

/**
 * Olha cada foto uma vez na vida. O resultado fica gravado no job: a mesma foto entra em
 * vários books, e pagar de novo pela mesma resposta é desperdício puro.
 */
export async function verFotos(db: Db, userId: string, jobIds: string[], falKey: string | undefined, maxNovas = 999): Promise<Map<string, Olhar>> {
  const vistos = new Map<string, Olhar>();
  if (jobIds.length === 0) return vistos;

  const { data } = await db.from("jobs").select("*").eq("user_id", userId).in("id", jobIds);
  const linhas = ((data ?? []) as LinhaJob[]).filter((j) => j.output_path);

  // O que já foi visto entra inteiro: custa zero. O teto vale só pras fotos NOVAS, que são
  // as que vão gastar uma chamada de visão.
  const ordem = new Map(jobIds.map((id, i) => [id, i]));
  let porVer: LinhaJob[] = [];
  for (const j of linhas) {
    if (j.visto_em) {
      vistos.set(j.id, { jobId: j.id, ambiente: j.ambiente_ia ?? null, qualidade: Number(j.qualidade_ia ?? 5), legenda: j.legenda_ia ?? "" });
    } else {
      porVer.push(j);
    }
  }
  porVer = porVer.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0)).slice(0, Math.max(0, maxNovas));
  if (!falKey || porVer.length === 0) return vistos;

  const novos = await emLotes(porVer, EM_PARALELO, async (j) => {
    try {
      const caminho = j.thumb_path ?? j.output_path;
      if (!caminho) return null;
      const url = await assinar(db, caminho);
      const saida = await chamarSincrono(
        "fal-ai/any-llm/vision",
        { model: MODELO, prompt: PROMPT_OLHAR, image_urls: [url], temperature: 0, max_tokens: 160 },
        falKey,
        40_000
      );
      const j2 = jsonDaResposta(saida);
      if (!j2) return null;
      const ambiente = AMBIENTES.includes(String(j2.ambiente) as never) ? String(j2.ambiente) : null;
      const qualidade = Math.max(0, Math.min(10, Math.round(Number(j2.qualidade ?? 5)) || 5));
      // Legenda com número é legenda que afirma -- corta na origem, não vale o risco.
      const bruta = String(j2.legenda ?? "").replace(/\s+/g, " ").trim().replace(/\.+$/, "").slice(0, 60);
      const legenda = /\d/.test(bruta) ? "" : bruta;
      return { jobId: j.id, ambiente, qualidade, legenda } satisfies Olhar;
    } catch {
      return null;
    }
  });

  const gravar = novos.filter((x): x is Olhar => !!x);
  await Promise.all(
    gravar.map(async (o) => {
      vistos.set(o.jobId, o);
      await db
        .from("jobs")
        .update({ ambiente_ia: o.ambiente, qualidade_ia: o.qualidade, legenda_ia: o.legenda, visto_em: new Date().toISOString() })
        .eq("id", o.jobId)
        .eq("user_id", userId)
        .then(undefined, () => {});
    })
  );
  return vistos;
}

/**
 * Funde o olhar da IA nas imagens. Preenche `tipoEspaco` só quando a pessoa não escolheu:
 * o que ela marcou na hora de editar a foto vale mais que a leitura da máquina.
 *
 * Depois disso, toda a ordenação e a escolha de capa que já existiam funcionam iguais --
 * só que agora com o ambiente preenchido em TODAS as fotos, não na metade.
 */
export function comOlhar(
  imagens: ImagemDisponivel[],
  vistos: Map<string, Olhar>
): (ImagemDisponivel & { qualidade: number; legendaVista: string; marcadoPelaPessoa: boolean })[] {
  return imagens.map((i) => {
    const o = vistos.get(i.jobId);
    const marcado = i.tipoEspaco && i.tipoEspaco !== "auto" ? i.tipoEspaco : null;
    return {
      ...i,
      tipoEspaco: marcado ?? (o?.ambiente && o.ambiente !== "outro" && o.ambiente !== "planta" ? o.ambiente : i.tipoEspaco),
      qualidade: o?.qualidade ?? 5,
      legendaVista: o?.legenda ?? "",
      marcadoPelaPessoa: !!marcado,
    };
  });
}

export type TextosDoBook = {
  descricao: string;
  /** O que o cadastro diz que o imóvel É: metragem, cômodos, vagas, ano. */
  destaques: string[];
  /** O que as fotos mostram que ele TEM a mais: gourmet, piscina, academia, varanda. */
  extras: string[];
  chamada: string;
  /** O que foi reprovado pelo guarda de fatos, pra aparecer no relatório. */
  reprovados: string[];
};

/** Os fatos, em texto, do jeito que o modelo pode LER mas não copiar como número novo. */
function dossie(imovel: ImovelMontagem, ambientes: string[]): string {
  const ficha = fichaDoImovel(imovel);
  return [
    `Imóvel: ${imovel.titulo}.`,
    imovel.endereco ? `Endereço: ${imovel.endereco}.` : "",
    imovel.preco ? `Preço: ${imovel.preco}.` : "",
    ficha.length ? `Ficha cadastrada: ${ficha.map((f) => `${f.rotulo} ${f.valor}`).join("; ")}.` : "",
    imovel.descricao ? `O corretor escreveu: "${imovel.descricao.slice(0, 600)}".` : "",
    ambientes.length ? `Ambientes que aparecem nas fotos: ${ambientes.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * As regras que toda escrita de book obedece. O idioma é o primeiro item de propósito:
 * é a instrução que o modelo mais ignora quando vem no fim de uma lista longa.
 */
const regras = (idioma: Idioma) => [
  REGRA_IDIOMA[idioma],
  "NÃO INVENTE FATO. Metragem, quantidade de cômodos, vagas, ano, preço, condomínio, IPTU e endereço só podem sair da ficha cadastrada acima, com o mesmo número e o mesmo rótulo.",
  "Não afirme nada que não esteja na ficha nem na frase do corretor: nada de distância até shopping, escola ou metrô, nada de andar, nada de vista, nada de nome de bairro novo, nada de acabamento que ninguém citou.",
  "Se você não tem o dado, escreva a frase sem ele. Frase mais curta é melhor que frase inventada.",
  "Sem superlativo e sem promessa ('o melhor', 'imperdível', 'oportunidade única').",
  "Sem enchimento ('ideal para você', 'perfeito para a família', 'venha conferir').",
  "Sem emoji, sem hashtag, sem markdown.",
].join(" ");

/**
 * Uma chamada só escreve o book inteiro: descrição da capa, destaques e a chamada final.
 * Uma, e não uma por campo, porque os três textos precisam não se repetir entre si.
 */
export async function escreverTextos(
  imovel: ImovelMontagem,
  ambientes: string[],
  falKey: string | undefined,
  idioma: Idioma = "pt"
): Promise<TextosDoBook | null> {
  if (!falKey) return null;

  const pedido = [
    // Abre com o idioma e fecha com ele: o meio do prompt é onde instrução se perde, e
    // tudo no meio aqui está em português.
    REGRA_IDIOMA[idioma],
    "Escreva os textos de um material de divulgação de imóvel. Responda SÓ com um JSON, sem markdown:",
    '{"descricao":"...","destaques":["...","..."],"extras":["...","..."],"chamada":"..."}',
    "descricao: 2 ou 3 frases, até 55 palavras, pra abrir o material embaixo do preço. Comece pelo que o imóvel é.",
    "destaques: de 3 a 5 itens sobre O QUE O IMÓVEL É, cada um saindo de um campo da ficha cadastrada (metragem, dormitórios, suítes, banheiros, vagas, ano, condomínio). Até 8 palavras, sem ponto final, escrito na língua de quem vende e não como a ficha crua.",
    "extras: de 0 a 4 itens sobre O QUE ELE TEM A MAIS, e SÓ a partir da lista de ambientes que aparecem nas fotos (área gourmet, piscina, academia, varanda, closet, home office, salão de festas, playground, quintal). Até 6 palavras, sem ponto final. Se a lista de ambientes não tiver nada além de sala, quarto, cozinha e banheiro, devolva a lista vazia -- não force.",
    "Não repita em extras o que já está em destaques.",
    "chamada: até 5 palavras, o convite final pra visitar.",
    regras(idioma),
    "",
    dossie(imovel, ambientes),
    "",
    REGRA_IDIOMA[idioma],
  ].join("\n");

  let bruto: Record<string, unknown> | null = null;
  try {
    bruto = jsonDaResposta(await chamarSincrono("fal-ai/any-llm", { model: MODELO, prompt: pedido, temperature: 0.5, max_tokens: 700 }, falKey, 45_000));
  } catch {
    return null;
  }
  if (!bruto) return null;

  const limpar = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const reprovados: string[] = [];

  /** A porteira: texto com número sem origem simplesmente não entra. */
  const sePassar = (valor: string, rotulo: string) => {
    if (!valor) return "";
    const v = conferirFatos(valor, imovel);
    if (v.length === 0) return valor;
    reprovados.push(`${rotulo}: ${v.map((x) => `"${x.trecho.trim()}" (${x.motivo})`).join("; ")}`);
    return "";
  };

  // Maiúscula na primeira letra, sempre. O modelo devolve ora "Varanda", ora "varanda", e
  // a lista sai com os dois numa página impressa -- reparado no PDF do primeiro book com
  // as duas listas. Pedir no prompt acerta quase sempre; fazer aqui acerta sempre.
  const comMaiuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

  const lista = (v: unknown, max: number, rotulo: string) =>
    (Array.isArray(v) ? v : [])
      .map((d) => comMaiuscula(limpar(d, 60).replace(/\.+$/, "")))
      .filter(Boolean)
      .slice(0, max)
      .map((d, i) => sePassar(d, `${rotulo} ${i + 1}`))
      .filter(Boolean);

  return {
    descricao: sePassar(limpar(bruto.descricao, 400), "descrição"),
    destaques: lista(bruto.destaques, 5, "destaque"),
    extras: lista(bruto.extras, 4, "extra"),
    chamada: sePassar(limpar(bruto.chamada, 60), "chamada") || "Vamos visitar?",
    reprovados,
  };
}

export type Relatorio = {
  fotosVistas: number;
  fotosNoBook: number;
  textosPorIA: boolean;
  /** Afirmações que a IA tentou e o guarda de fatos barrou. Aparece no editor. */
  reprovados: string[];
};

/**
 * O caminho completo do "Criar automaticamente".
 *
 * Determinístico primeiro, IA por cima: `montar()` continua sendo quem decide a ESTRUTURA
 * (que páginas existem, em que ordem, com que geometria), e a IA só preenche o que é
 * língua. Assim uma falha da IA degrada o texto, nunca o documento.
 */
export async function montarAutomatico(args: {
  db: Db;
  userId: string;
  tipo: TipoBook;
  imovel: ImovelMontagem;
  imagens: ImagemDisponivel[];
  cor?: string;
  /** Idioma em que a IA escreve. Vem do cookie da pessoa, lido na rota. */
  idioma?: Idioma;
  falKey: string | undefined;
}): Promise<{ documento: DocumentoBook; relatorio: Relatorio }> {
  const { db, userId, tipo, imovel, imagens, cor, falKey, idioma = "pt" } = args;
  const def = TIPO_POR_ID[tipo] ?? TIPO_POR_ID.book;

  // Teto de leitura: um imóvel com 60 fotos não vira 60 chamadas de visão pra montar um
  // book que leva 24. As já vistas custam zero e entram de graça; das novas, entram as mais
  // recentes até o teto -- foto recente é a que o corretor acabou de editar, e é a que ele
  // espera ver no book.
  const teto = Math.max(def.maxFotos + 4, 12);
  const naOrdemDaFila = imagens
    .slice()
    .sort((a2, b2) => (b2.criadoEm < a2.criadoEm ? -1 : 1))
    .map((i) => i.jobId);

  const vistos = await verFotos(db, userId, naOrdemDaFila, falKey, teto).catch(() => new Map<string, Olhar>());
  const comVista = comOlhar(imagens, vistos);

  // Melhor foto primeiro, no geral: é assim que `escolherCapa` — que pega a PRIMEIRA
  // externa, ou a primeira social — acaba pegando a melhor de cada grupo. Dentro de
  // `montar` a ordem da visita reordena tudo de novo, com a nota como desempate.
  const ordenadas = comVista.slice().sort((a, b) => b.qualidade - a.qualidade);

  const dados: DadosMontagem = { tipo: def.id, imovel, imagens: ordenadas, cor };
  const documento = montar(dados);

  // Legenda: quando a PESSOA marcou o cômodo ao editar a foto, vale o rótulo dela. Quando
  // quem leu foi a máquina, vale a legenda da leitura -- é mais específica ("Sala com
  // porta de vidro" em vez de "Sala de estar") e evita duas páginas seguidas com a mesma
  // palavra embaixo, que foi o que saiu no primeiro book montado de verdade.
  const olhoDe = new Map(comVista.map((i) => [i.jobId, i]));
  for (const p of documento.paginas) {
    if (p.tipo !== "foto" && p.tipo !== "planta") continue;
    for (const [i, chave] of [[0, "legenda"], [1, "legenda2"]] as [number, string][]) {
      const job = p.imagens[i];
      const o = job ? olhoDe.get(job) : null;
      if (!o || o.marcadoPelaPessoa || !o.legendaVista) continue;
      p.textos[chave] = o.legendaVista;
    }
  }

  const ambientes = [...new Set(comVista.map((i) => i.tipoEspaco).filter((x): x is string => !!x && x !== "auto"))];
  const textos = await escreverTextos(imovel, ambientes, falKey, idioma).catch(() => null);

  if (textos) {
    const capa = documento.paginas.find((p) => p.tipo === "capa");
    // A descrição do corretor tem precedência: ele escreveu, ele manda.
    if (capa && textos.descricao && !imovel.descricao) capa.textos.descricao = textos.descricao;
    const contato = documento.paginas.find((p) => p.tipo === "contato");
    if (contato && textos.chamada) contato.textos.chamada = textos.chamada;

  }

  // Os destaques, nas duas listas. As duas têm piso determinístico: a da esquerda sai da
  // ficha, a da direita dos ambientes que apareceram nas fotos. A IA melhora a frase; se
  // ela não responder, a página continua de pé e continua verdadeira.
  const pagDestaques = documento.paginas.find((p) => p.tipo === "destaques");
  if (pagDestaques) {
    const doCadastro = textos?.destaques.length ? textos.destaques : destaquesDaFicha(imovel);
    const dasFotos = textos?.extras.length ? textos.extras : extrasDosAmbientes(comVista.map((i) => i.tipoEspaco));
    pagDestaques.textos.corpo = doCadastro.join("\n");
    pagDestaques.textos.corpo2 = dasFotos.join("\n");
  }

  // O mapa, quando há chave do Mapbox configurada. Sem chave a página de localização
  // continua de pé com endereço e QR -- por isso isto nunca derruba a montagem.
  const pagLocal = documento.paginas.find((p) => p.tipo === "localizacao");
  if (pagLocal && pagLocal.imagens.length === 0) {
    const mapa = await garantirMapa(db, userId, imovel, cor).catch(() => null);
    if (mapa) pagLocal.imagens = [mapa];
  }

  // Página de destaques sem nada dentro é página em branco no material do cliente.
  const paginas = documento.paginas.filter(
    (p) => p.tipo !== "destaques" || `${p.textos.corpo ?? ""}${p.textos.corpo2 ?? ""}`.trim().length > 0
  );

  return {
    documento: { ...documento, paginas },
    relatorio: {
      fotosVistas: vistos.size,
      fotosNoBook: new Set(paginas.flatMap((p) => p.imagens)).size,
      textosPorIA: !!textos,
      reprovados: textos?.reprovados ?? [],
    },
  };
}

/**
 * Destaques sem IA nenhuma: a ficha vira frase. É o piso de qualidade da página -- fato
 * puro, zero risco, e já melhor do que página nenhuma.
 */
export function destaquesDaFicha(i: ImovelMontagem): string[] {
  const itens: string[] = [];
  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;
  if (i.area_util) itens.push(`${String(i.area_util).replace(".", ",")} m² de área útil`);
  if (i.dormitorios) itens.push(plural(i.dormitorios, "dormitório", "dormitórios") + (i.suites ? `, ${plural(i.suites, "suíte", "suítes")}` : ""));
  if (i.banheiros) itens.push(plural(i.banheiros, "banheiro", "banheiros"));
  if (i.vagas) itens.push(plural(i.vagas, "vaga na garagem", "vagas na garagem"));
  if (i.ano_construcao) itens.push(`Entregue em ${i.ano_construcao}`);
  if (i.condominio) itens.push(`Condomínio de ${i.condominio}`);
  return itens.slice(0, 6);
}

/**
 * O "tem a mais" sem IA nenhuma: os ambientes que apareceram nas fotos e que não são o
 * feijão com arroz de qualquer imóvel. Sala, quarto, cozinha e banheiro todo apartamento
 * tem -- listar isso como diferencial é ruído, então eles não estão nesta tabela.
 */
const EXTRA_DO_AMBIENTE: Record<string, string> = {
  gourmet: "Área gourmet",
  varanda: "Varanda",
  piscina: "Piscina no condomínio",
  academia: "Academia no condomínio",
  salao: "Salão de festas",
  playground: "Playground",
  closet: "Closet",
  escritorio: "Espaço para home office",
  quintal: "Quintal",
  area_servico: "Área de serviço",
  entrada: "Hall de entrada",
};

export function extrasDosAmbientes(ambientes: (string | null | undefined)[]): string[] {
  const jaTem = new Set<string>();
  const saida: string[] = [];
  for (const a of ambientes) {
    const rotulo = a ? EXTRA_DO_AMBIENTE[a] : null;
    if (!rotulo || jaTem.has(rotulo)) continue;
    jaTem.add(rotulo);
    saida.push(rotulo);
  }
  return saida.slice(0, 4);
}

/** Uma página nova, pronta pra entrar no documento. */
export function novaPagina(tipo: Pagina["tipo"], textos: Record<string, string> = {}): Pagina {
  return { id: novoId(), tipo, origem: "auto", imagens: [], textos };
}
