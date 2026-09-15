import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { marcaEfetiva } from "@/lib/cobranca";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { remontarCom } from "@/lib/book-montagem";
import { montarAutomatico } from "@/lib/book-ia";
import { idiomaDaRequisicao } from "@/i18n/idiomas";
import { limparDocumento } from "@/lib/book-documento";
import { faltaMigracao, imagensDoImovel, imovelDeMontagem, RECADO_MIGRACAO } from "@/lib/book-servidor";

// Refaz o book automaticamente, sem perder o que a pessoa editou.
//
// É a resposta pra "editei mais cinco fotos depois de montar": as fotos novas entram, a
// ordem é recalculada, os textos automáticos são reescritos -- e TODA página marcada como
// 'manual' sobrevive no lugar onde está. Quem decide isso é `remontarCom`, a mesma regra
// da remontagem por troca de tipo; aqui só trocamos quem monta o documento novo.
//
// Grava direto e devolve a versão nova: o editor recarrega. Fundir no cliente exigiria
// replicar a regra de fusão no navegador, e duas cópias da mesma regra divergem.

export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: book, error: erroLeitura } = await db
    .from("books")
    .select("id, tipo, property_id, documento, versao")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (erroLeitura && faltaMigracao(erroLeitura)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!book) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  const atual = limparDocumento(book.documento);
  if (!atual) return NextResponse.json({ error: "Este book não tem conteúdo para refazer." }, { status: 400 });
  if (!book.property_id) {
    return NextResponse.json({ error: "Este book não está ligado a um imóvel, então não há de onde refazer." }, { status: 400 });
  }

  const def = TIPO_POR_ID[String(book.tipo)] ?? TIPO_POR_ID.book;
  const dados = await imovelDeMontagem(db, userId, book.property_id);
  if (!dados) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const imagens = await imagensDoImovel(db, userId, book.property_id);
  if (imagens.length === 0) return NextResponse.json({ error: "Este imóvel não tem imagens prontas." }, { status: 400 });

  const marca = await marcaEfetiva(db, userId);
  const cor = /^#?[0-9a-f]{6}$/i.test(marca.cor_marca ?? "") ? (marca.cor_marca as string) : undefined;

  const feito = await montarAutomatico({
    db,
    userId,
    tipo: def.id,
    imovel: dados.imovel,
    imagens,
    cor,
    falKey: process.env.FAL_KEY,
    idioma: idiomaDaRequisicao(req),
  });

  const { documento, descartadas } = remontarCom(atual, feito.documento);

  const { data: salvo, error } = await db
    .from("books")
    .update({ documento, versao: Number(book.versao ?? 1) + 1, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("versao")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const manuais = atual.paginas.filter((p) => p.origem === "manual").length;
  return NextResponse.json({
    versao: salvo?.versao ?? Number(book.versao ?? 1) + 1,
    paginas: documento.paginas.length,
    manuaisPreservadas: manuais,
    refeitas: descartadas,
    relatorio: feito.relatorio,
  });
}
