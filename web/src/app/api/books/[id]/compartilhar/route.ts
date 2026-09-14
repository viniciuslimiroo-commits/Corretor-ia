import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota, origemDoApp } from "@/lib/auth-rota";
import { ehToken, gerarToken } from "@/lib/compartilhar";
import { faltaMigracao, RECADO_MIGRACAO } from "@/lib/book-servidor";

// Liga e desliga o link público do book. Mesmo desenho do link do imóvel: o token é o
// único segredo, e apagá-lo corta o acesso na visita seguinte -- nada fica cacheado numa
// URL permanente.

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const ligar = corpo?.ligar !== false;

  const { data: book, error: erroLeitura } = await db.from("books").select("id, share_token, aberturas").eq("id", id).eq("user_id", userId).maybeSingle();
  if (erroLeitura && faltaMigracao(erroLeitura)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!book) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });

  if (!ligar) {
    const { error } = await db.from("books").update({ share_token: null }).eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ compartilhado: false, url: null });
  }

  // Reaproveita o token que já existe: regerar quebraria o link que a pessoa já mandou.
  const token = ehToken(book.share_token) ? book.share_token : gerarToken();
  if (token !== book.share_token) {
    const { error } = await db.from("books").update({ share_token: token }).eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    compartilhado: true,
    url: `${origemDoApp(req).replace(/\/$/, "")}/b/${token}`,
    aberturas: Number(book.aberturas ?? 0),
  });
}
