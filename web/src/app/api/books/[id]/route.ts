import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota, origemDoApp } from "@/lib/auth-rota";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { limparDocumento } from "@/lib/book-documento";
import { faltaMigracao, imovelDeMontagem, prepararLeitura, RECADO_MIGRACAO } from "@/lib/book-servidor";

// Um book: ler, salvar e apagar.
//
// O GET devolve o pacote inteiro numa chamada -- documento, layout já calculado e as URLs
// assinadas. É o que faz o editor abrir de uma vez em vez de montar a tela em três idas.
//
// O PATCH é o salvamento automático, e é por isso que existe `versao`: o cliente manda a
// versão que leu e o servidor recusa se já mudou. Sem isso, duas abas abertas se
// sobrescrevem em silêncio e a pessoa só descobre quando falta uma página.

export const maxDuration = 60;

async function carregar(db: NonNullable<Awaited<ReturnType<typeof usuarioDaRota>>["db"]>, userId: string, id: string) {
  return db.from("books").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data, error } = await carregar(db, userId, id);
  if (error && faltaMigracao(error)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  const documento = limparDocumento(data.documento);
  if (!documento) return NextResponse.json({ error: "Este book está corrompido. Crie outro a partir do imóvel." }, { status: 500 });

  const dados = data.property_id ? await imovelDeMontagem(db, userId, data.property_id) : null;
  const { layout, urls } = await prepararLeitura(db, userId, documento, dados?.imovel ?? null, dados?.shareToken ?? null, origemDoApp(req));

  return NextResponse.json({
    book: {
      id: String(data.id),
      tipo: data.tipo,
      rotuloTipo: TIPO_POR_ID[String(data.tipo)]?.rotulo ?? String(data.tipo),
      titulo: data.titulo,
      versao: data.versao,
      imovel: dados ? { id: dados.imovel.id, titulo: dados.imovel.titulo } : null,
      compartilhado: !!data.share_token,
      atualizadoEm: data.atualizado_em,
      // Lançamento sem registro de incorporação não pode exportar: a lei exige o número
      // em qualquer peça de divulgação. A trava mora aqui, não no botão.
      faltaRegistro: data.tipo === "lancamento" && !dados?.registro,
    },
    documento,
    layout,
    urls,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const { data: atual, error: erroLeitura } = await carregar(db, userId, id);
  if (erroLeitura && faltaMigracao(erroLeitura)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!atual) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  if (typeof corpo?.versao === "number" && corpo.versao !== atual.versao) {
    return NextResponse.json(
      { error: "Este book foi alterado em outro lugar. Recarregue antes de continuar.", versaoAtual: atual.versao },
      { status: 409 }
    );
  }

  const mudanca: Record<string, unknown> = { atualizado_em: new Date().toISOString(), versao: Number(atual.versao ?? 1) + 1 };
  if (corpo?.documento) {
    const limpo = limparDocumento(corpo.documento);
    if (!limpo) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
    mudanca.documento = limpo;
    mudanca.tipo = limpo.tipo;
  }
  if (typeof corpo?.titulo === "string") mudanca.titulo = corpo.titulo.trim().slice(0, 120) || null;

  const { data, error } = await db.from("books").update(mudanca).eq("id", id).eq("user_id", userId).select("versao, atualizado_em").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Não consegui salvar." }, { status: 500 });

  return NextResponse.json({ versao: data.versao, atualizadoEm: data.atualizado_em });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  // Apagar o book não toca em job nenhum: as fotos continuam em Materiais. É o medo
  // número um da pessoa, e a resposta está na mensagem que a tela mostra.
  const { error } = await db.from("books").delete().eq("id", id).eq("user_id", userId);
  if (error) {
    if (faltaMigracao(error)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
