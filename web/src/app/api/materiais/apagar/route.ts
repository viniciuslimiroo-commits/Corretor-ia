import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { apagarEntradas, caminhoOriginal, caminhoEntrada } from "@/lib/armazenamento";
import { rotuloDoTipo } from "@/lib/acoes";
import { imagensDoDocumento, limparDocumento } from "@/lib/book-documento";

// Apagar material: a imagem sai do banco E do armazenamento.
//
// Faltava. Dava pra apagar book, vídeo e imóvel, mas não a foto -- então cada teste, cada
// tentativa que não ficou boa e cada versão antiga se acumulava pra sempre, ocupando
// espaço e atrapalhando na hora de escolher. Apagar é parte de organizar.
//
// Duas travas, porque isto é irreversível:
//
//   1. Material usado em BOOK não some sem aviso. A primeira chamada devolve 409 dizendo
//      em quais books ele está; só uma segunda, com `forcar`, apaga -- e aí as páginas
//      daqueles books ficam sem a imagem.
//   2. Vídeo não passa por aqui. Tem apagar próprio, na tela de vídeo, que também limpa os
//      temporários da montagem.
//
// Não devolve crédito: o trabalho foi feito e pago. Apagar é faxina, não estorno.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(corpo?.ids) ? corpo.ids : []).filter((x: unknown): x is string => typeof x === "string").slice(0, 200);
  const forcar = corpo?.forcar === true;
  if (ids.length === 0) return NextResponse.json({ error: "Escolha o que apagar." }, { status: 400 });

  const { data: jobs, error } = await db.from("jobs").select("*").eq("user_id", userId).in("id", ids);
  if (error) return NextResponse.json({ error: `Não consegui ler os materiais: ${error.message}` }, { status: 503 });
  const linhas = (jobs ?? []) as Record<string, unknown>[];
  if (linhas.length === 0) return NextResponse.json({ error: "Nada encontrado pra apagar." }, { status: 404 });

  // ---- trava 1: está em algum book? ----
  const { data: books } = await db.from("books").select("id, titulo, documento").eq("user_id", userId).limit(200);
  const emUso = new Map<string, string[]>();
  for (const b of (books ?? []) as { id: string; titulo: string | null; documento: unknown }[]) {
    const doc = limparDocumento(b.documento);
    if (!doc) continue;
    const usadas = new Set(imagensDoDocumento(doc));
    for (const j of linhas) {
      if (!usadas.has(String(j.id))) continue;
      const lista = emUso.get(String(j.id)) ?? [];
      lista.push(b.titulo ?? "Book sem título");
      emUso.set(String(j.id), lista);
    }
  }

  if (emUso.size > 0 && !forcar) {
    const nomes = [...new Set([...emUso.values()].flat())];
    return NextResponse.json(
      {
        emUso: true,
        quantos: emUso.size,
        books: nomes,
        error:
          `${emUso.size === 1 ? "1 imagem está" : `${emUso.size} imagens estão`} em ${nomes.length === 1 ? "um book" : `${nomes.length} books`}: ` +
          `${nomes.join(", ")}. Apagar deixa ${emUso.size === 1 ? "a página" : "as páginas"} sem a foto.`,
      },
      { status: 409 }
    );
  }

  // ---- apaga os arquivos, depois as linhas ----
  //
  // Nesta ordem de propósito: arquivo órfão custa alguns megabytes e some na próxima
  // faxina; linha apontando pra arquivo que não existe mais quebra a tela de quem abrir.
  const caminhos: string[] = [];
  for (const j of linhas) {
    const id = String(j.id);
    for (const c of [j.output_path, j.thumb_path, j.input_path]) if (typeof c === "string" && c) caminhos.push(c);
    caminhos.push(caminhoOriginal(userId, id));
    for (const qual of ["foto", "mascara", "referencia"] as const) caminhos.push(caminhoEntrada(userId, id, qual));
  }
  await apagarEntradas(db, [...new Set(caminhos)]);

  // A capa do imóvel pode apontar pra uma das apagadas: solta antes, senão a galeria fica
  // com uma capa que não existe.
  const apagados = linhas.map((j) => String(j.id));
  await db.from("properties").update({ capa_job_id: null }).eq("user_id", userId).in("capa_job_id", apagados).then(undefined, () => {});

  const { data: fora, error: erroApagar } = await db.from("jobs").delete().eq("user_id", userId).in("id", apagados).select("id, tipo");
  if (erroApagar) return NextResponse.json({ error: `Não consegui apagar: ${erroApagar.message}` }, { status: 500 });

  const quais = (fora ?? []) as { tipo: string }[];
  return NextResponse.json({
    apagados: quais.length,
    tipos: [...new Set(quais.map((q) => rotuloDoTipo(q.tipo)))],
    booksAfetados: forcar ? [...new Set([...emUso.values()].flat())] : [],
  });
}
