import { chamarSincrono } from "./fal";
import { assinar } from "./armazenamento";
import { conferirFatos } from "./book-fatos";
import { fichaDoImovel, montar, type DadosMontagem, type ImagemDisponivel, type ImovelMontagem } from "./book-montagem";
import { novoId, type DocumentoBook, type Pagina } from "./book-documento";
import { TIPO_POR_ID, type TipoBook } from "./book-tipos";

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
export async function verFotos(db: Db, userId: string, jobIds: string[], falKey: string | undefined): Promise<Map<string, Olhar>> {
  const vistos = new Map<string, Olhar>();
  if (jobIds.length === 0) return vistos;

  const { data } = await db.from("jobs").select("*").eq("user_id", userId).in("id", jobIds);
  const linhas = ((data ?? []) as LinhaJob[]).filter((j) => j.output_path);

  const porVer: LinhaJob[] = [];
  for (const j of linhas) {
    if (j.visto_em) {
      vistos.set(j.id, { jobId: j.id, ambiente: j.ambiente_ia ?? null, qualidade: Number(j.qualidade_ia ?? 5), legenda: j.legenda_ia ?? "" });
    } else {
      porVer.push(j);
    }
  }
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
  tituloDestaques: string;
  destaques: string[];
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

const REGRAS = [
  "Português do Brasil.",
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
  falKey: string | undefined
): Promise<TextosDoBook | null> {
  if (!falKey) return null;

  const pedido = [
    "Escreva os textos de um material de divulgação de imóvel. Responda SÓ com um JSON, sem markdown:",
    '{"descricao":"...","tituloDestaques":"...","destaques":["...","..."],"chamada":"..."}',
    "descricao: 2 ou 3 frases, até 55 palavras, pra abrir o material embaixo do preço. Comece pelo que o imóvel é.",
    "tituloDestaques: até 4 palavras, o título da página de características (exemplo: 'O que faz diferença').",
    "destaques: de 3 a 6 itens, cada um com até 8 palavras, sem ponto final. Cada item tem que sair de um dado da ficha ou de um ambiente que aparece nas fotos. Escreva o dado por extenso na língua de quem vende, não repita a ficha crua.",
    "chamada: até 5 palavras, o convite final pra visitar.",
    REGRAS,
    "",
    dossie(imovel, ambientes),
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

  const destaquesBrutos = (Array.isArray(bruto.destaques) ? bruto.destaques : [])
    .map((d) => limpar(d, 60).replace(/\.+$/, ""))
    .filter(Boolean)
    .slice(0, 6);

  return {
    descricao: sePassar(limpar(bruto.descricao, 400), "descrição"),
    tituloDestaques: limpar(bruto.tituloDestaques, 40) || "O que faz diferença",
    destaques: destaquesBrutos.map((d, i) => sePassar(d, `destaque ${i + 1}`)).filter(Boolean),
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
  falKey: string | undefined;
}): Promise<{ documento: DocumentoBook; relatorio: Relatorio }> {
  const { db, userId, tipo, imovel, imagens, cor, falKey } = args;
  const def = TIPO_POR_ID[tipo] ?? TIPO_POR_ID.book;

  const vistos = await verFotos(db, userId, imagens.map((i) => i.jobId), falKey).catch(() => new Map<string, Olhar>());
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
  const textos = await escreverTextos(imovel, ambientes, falKey).catch(() => null);

  if (textos) {
    const capa = documento.paginas.find((p) => p.tipo === "capa");
    // A descrição do corretor tem precedência: ele escreveu, ele manda.
    if (capa && textos.descricao && !imovel.descricao) capa.textos.descricao = textos.descricao;
    const contato = documento.paginas.find((p) => p.tipo === "contato");
    if (contato && textos.chamada) contato.textos.chamada = textos.chamada;

    const pagDestaques = documento.paginas.find((p) => p.tipo === "destaques");
    if (pagDestaques && textos.destaques.length) {
      pagDestaques.textos.titulo = textos.tituloDestaques;
      pagDestaques.textos.corpo = textos.destaques.join("\n");
    } else if (pagDestaques) {
      // Sem IA, a página de destaques ainda vale: sai da ficha, que é fato puro.
      pagDestaques.textos.corpo = destaquesDaFicha(imovel).join("\n");
    }
  } else {
    const pagDestaques = documento.paginas.find((p) => p.tipo === "destaques");
    if (pagDestaques) pagDestaques.textos.corpo = destaquesDaFicha(imovel).join("\n");
  }

  // Página de destaques sem nada dentro é página em branco no material do cliente.
  const paginas = documento.paginas.filter((p) => p.tipo !== "destaques" || (p.textos.corpo ?? "").trim().length > 0);

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

/** Uma página nova, pronta pra entrar no documento. */
export function novaPagina(tipo: Pagina["tipo"], textos: Record<string, string> = {}): Pagina {
  return { id: novoId(), tipo, origem: "auto", imagens: [], textos };
}
