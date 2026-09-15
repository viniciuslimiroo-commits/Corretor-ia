import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { chamarSincrono } from "@/lib/fal";
import { limparDocumento } from "@/lib/book-documento";
import { faltaMigracao, RECADO_MIGRACAO, imovelDeMontagem, imagensDoImovel, urlsDoDocumento } from "@/lib/book-servidor";
import { fichaDoImovel, legendaDaImagem, type ImovelMontagem } from "@/lib/book-montagem";
import { conferirFatos } from "@/lib/book-fatos";
import { REGRA_IDIOMA, idiomaDaRequisicao, type Idioma } from "@/i18n/idiomas";

// Escreve UM campo de UMA página. Não reescreve o book inteiro: texto gerado em bloco
// ninguém lê antes de mandar, e o corretor assina embaixo do que sai daqui.
//
// Não gasta crédito, igual ao roteiro do vídeo -- a listagem de books promete isso e a
// conta de um flash-lite não paga o incômodo de cobrar.
//
// O modelo recebe o que está gravado no imóvel e, quando o texto é sobre uma foto, a
// própria foto. Nada além disso: não inventa metragem, não inventa preço, não inventa
// "vista para o parque". Anúncio de imóvel com dado errado é problema do corretor com o
// CRECI, não frase infeliz.

const MODELO = "google/gemini-2.5-flash-lite";

/**
 * Legenda de foto: nomear o ambiente é o trabalho todo. Repetir o nome do imóvel embaixo
 * de cada foto foi o que saiu na primeira versão, e some com a utilidade da página.
 */
const LEGENDA =
  "Escreva a legenda desta foto: o nome do ambiente que aparece nela (sala, cozinha, quarto, suíte, varanda, banheiro, fachada, área de lazer, piscina...). No máximo 6 palavras, sem ponto final e sem frase de venda. Acrescente um detalhe só se ele for o destaque do ambiente -- porta, parede, teto e piso comum não são detalhe, e sem destaque a legenda é só o nome do ambiente. Nunca repita o nome nem o endereço do imóvel.";

/** O que a IA pode escrever, e em que tamanho. Campo fora desta lista não tem botão. */
const REGRAS: Record<string, { max: number; instrucao: string }> = {
  descricao: {
    max: 400,
    instrucao:
      "Escreva a descrição de abertura do material, que vai na capa embaixo do preço. 2 ou 3 frases, no máximo 55 palavras. Comece pelo que o imóvel é, não por 'Este imóvel'. Tom direto e acolhedor.",
  },
  legenda: { max: 90, instrucao: LEGENDA },
  legenda2: { max: 90, instrucao: LEGENDA },
  corpo: {
    max: 600,
    instrucao:
      "Escreva o texto que fica ao lado da foto: 2 ou 3 frases, no máximo 45 palavras, sobre o ambiente que aparece nela. Comece nomeando o ambiente.",
  },
  titulo: {
    max: 90,
    instrucao: "Escreva o título desta página. No máximo 5 palavras, sem ponto final.",
  },
  // Título da CAPA é caso à parte: nome do imóvel já cadastrado. A IA pode deixar mais
  // apresentável (de "apto302 t55" pra "Apartamento no Setor Bueno"), nunca criar do zero.
  titulo_capa: {
    max: 90,
    instrucao:
      "Escreva o título da capa: o tipo do imóvel (apartamento, casa, cobertura, terreno, sobrado) e o BAIRRO, tirados do nome e do endereço cadastrados. No máximo 5 palavras, sem ponto final. NÃO repita número da unidade nem nome de rua -- isso já sai no subtítulo, logo abaixo. Não acrescente adjetivo de venda.",
  },
  chamada: {
    max: 60,
    instrucao:
      "Escreva a chamada final, o convite pra visitar. No máximo 5 palavras. Só termine em interrogação se for mesmo uma pergunta.",
  },
};

const regrasGerais = (idioma: Idioma) => [
  REGRA_IDIOMA[idioma],
  "Só use o que eu te der ou o que aparece na foto em anexo. Não invente metragem, preço, número de quartos ou vagas, vista, vizinhança nem nome de bairro.",
  "Sem superlativo e sem promessa: nada de 'o melhor', 'imperdível', 'único', 'oportunidade'.",
  "Sem enchimento: nada de 'ideal para você', 'perfeito para a família', 'venha conferir'. Cada frase tem que dizer um fato.",
  "Sem emoji, sem hashtag, sem aspas, sem markdown.",
  "Responda só com o texto, nada de explicação nem alternativas.",
].join(" ");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const paginaId = typeof corpo?.paginaId === "string" ? corpo.paginaId : "";
  const campo = typeof corpo?.campo === "string" ? corpo.campo : "";
  if (!paginaId || !campo) return NextResponse.json({ error: "Campo sem escrita automática." }, { status: 400 });

  const { data: book, error: erroLeitura } = await db.from("books").select("id, property_id, documento, titulo").eq("id", id).eq("user_id", userId).maybeSingle();
  if (erroLeitura && faltaMigracao(erroLeitura)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!book) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  const documento = limparDocumento(book.documento);
  const pagina = documento?.paginas.find((p) => p.id === paginaId);
  if (!documento || !pagina) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  const regra = REGRAS[campo === "titulo" && pagina.tipo === "capa" ? "titulo_capa" : campo];
  if (!regra) return NextResponse.json({ error: "Campo sem escrita automática." }, { status: 400 });

  // ---- o que o modelo sabe do imóvel ----
  const linhas: string[] = [];
  let descricaoDoImovel: string | null = null;
  let imovel: ImovelMontagem | null = null;
  if (book.property_id) {
    const dados = await imovelDeMontagem(db, userId, book.property_id);
    if (dados) {
      const i = dados.imovel;
      imovel = i;
      if (i.titulo) linhas.push(`Imóvel: ${i.titulo}.`);
      if (i.endereco) linhas.push(`Endereço: ${i.endereco}.`);
      if (i.preco) linhas.push(`Preço: ${i.preco}.`);
      const ficha = fichaDoImovel(i);
      if (ficha.length) linhas.push(`Ficha: ${ficha.map((f) => `${f.rotulo} ${f.valor}`).join("; ")}.`);
      descricaoDoImovel = i.descricao ?? null;
      if (i.descricao) linhas.push(`O corretor já escreveu sobre o imóvel: "${i.descricao.slice(0, 500)}".`);
    }
  }

  // Legenda e texto ao lado falam da FOTO, então o modelo precisa vê-la: metade dos jobs
  // não tem tipo_espaco gravado, e sem a imagem a legenda vira o nome do imóvel de novo.
  const olhaAFoto = campo === "legenda" || campo === "legenda2" || campo === "corpo";
  const jobDaFoto = pagina.imagens[campo === "legenda2" ? 1 : 0];
  let urlDaFoto: string | null = null;

  if (jobDaFoto && book.property_id) {
    const disponiveis = await imagensDoImovel(db, userId, book.property_id);
    const img = disponiveis.find((d) => d.jobId === jobDaFoto);
    const ambiente = img ? legendaDaImagem(img) : "";
    if (ambiente) linhas.push(`O corretor marcou esta foto como: ${ambiente}.`);
  }
  if (olhaAFoto && jobDaFoto) {
    // Cheias, não miniatura: o modelo precisa distinguir o que está no ambiente.
    const urls = await urlsDoDocumento(db, userId, documento, true);
    urlDaFoto = urls[jobDaFoto] ?? null;
    if (urlDaFoto) linhas.push("A imagem em anexo é a foto desta página. Escreva sobre o que aparece nela.");
  }

  const jaEscrito = (pagina.textos[campo] ?? "").trim();
  if (jaEscrito) linhas.push(`O que está escrito hoje neste campo: "${jaEscrito.slice(0, 300)}". Melhore, mantendo o sentido.`);

  if (linhas.length === 0) {
    return NextResponse.json({ error: "Preencha a ficha do imóvel primeiro — sem os dados, a IA só teria o que inventar." }, { status: 422 });
  }

  // A regra de idioma ABRE e FECHA o prompt. O modelo segue a língua dominante do que
  // lê, e tudo no meio -- instrução, regras e ficha -- está em português.
  const idioma = idiomaDaRequisicao(req);
  const prompt = [REGRA_IDIOMA[idioma], regra.instrucao, regrasGerais(idioma), "", "Dados do imóvel:", ...linhas, "", REGRA_IDIOMA[idioma]].join("\n");

  // A chave numa const local: dentro da closure o TypeScript perde o estreitamento feito
  // pelo `if (!falKey) return` lá em cima.
  const chave: string = falKey;

  /** Uma tentativa: chama o modelo e devolve o texto já aparado. */
  async function escrever(pedido: string): Promise<string> {
    const saida = (await chamarSincrono(
      urlDaFoto ? "fal-ai/any-llm/vision" : "fal-ai/any-llm",
      { model: MODELO, prompt: pedido, temperature: 0.6, max_tokens: 300, ...(urlDaFoto ? { image_urls: [urlDaFoto] } : {}) },
      chave,
      45_000
    )) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(saida.error);
    const bruto = (saida.output ?? "")
      .replace(/^["“'`]+|["”'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, regra.max);
    // Legenda não leva ponto final. Pedir no prompt funciona quase sempre; cortar aqui
    // funciona sempre, e "quase" aparece embaixo de uma foto no material do cliente.
    return campo === "legenda" || campo === "legenda2" ? bruto.replace(/\s*\.+$/, "") : bruto;
  }

  try {
    let limpo = await escrever(prompt);

    // ---- O GUARDA DE FATOS, também aqui ----
    //
    // Faltava, e é o furo mais sério que esta sessão produziu: a criação automática passava
    // por `conferirFatos` e este botão não, embora a tela ofereça a mesma coisa com a mesma
    // cara. Porteira com porta lateral aberta não é porteira -- bastava clicar "Escrever
    // com IA" num campo pra a regra deixar de valer.
    //
    // Uma segunda tentativa nomeando o que reprovou, e só. Se insistir, devolve erro em vez
    // de texto: num anúncio de imóvel, não escrever é melhor que escrever errado.
    if (imovel) {
      const v1 = conferirFatos(limpo, imovel);
      if (v1.length > 0) {
        const recado = v1.map((x) => `"${x.trecho.trim()}" (${x.motivo})`).join("; ");
        limpo = await escrever(
          `${prompt}\n\nA sua resposta anterior foi recusada porque afirmou o que não está na ficha: ${recado}. Escreva de novo SEM esses números.`
        );
        const v2 = conferirFatos(limpo, imovel);
        if (v2.length > 0) {
          return NextResponse.json(
            {
              error: `A IA insistiu em afirmar o que não está no cadastro (${v2.map((x) => x.trecho.trim()).join(", ")}). Não vou escrever isso — prefira o seu texto.`,
            },
            { status: 422 }
          );
        }
      }
    }

    if (limpo.length < 2) throw new Error("resposta vazia");

    // Eco só é erro em texto LONGO. Numa legenda de quatro palavras, devolver o mesmo é o
    // modelo concordando -- e transformar concordância em erro ensina a pessoa a não clicar.
    const ehProsa = campo === "descricao" || campo === "corpo";
    if (ehProsa && jaEscrito && limpo === jaEscrito) throw new Error("veio igual ao que já estava");
    if (descricaoDoImovel && campo !== "descricao" && limpo === descricaoDoImovel.trim()) throw new Error("veio igual à descrição do imóvel");

    return NextResponse.json({ texto: limpo });
  } catch (e) {
    return NextResponse.json(
      { error: `Não consegui escrever agora (${e instanceof Error ? e.message.slice(0, 80) : "erro"}). Escreva o seu ou tente de novo.` },
      { status: 502 }
    );
  }
}
