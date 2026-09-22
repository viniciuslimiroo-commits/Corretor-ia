import { NextResponse } from "next/server";
import { BUCKET_RESULTADOS, supabaseServer } from "@/lib/supabase-server";
import { ehToken } from "@/lib/compartilhar";
import { caminhoDaCapaDoBook, tipoDaImagem } from "@/lib/capa-publica";

// A capa do book, pra prévia do link no WhatsApp. Mesmas regras da capa de /c: sem login,
// endereço que não vence, cache curto pra revogar o token continuar cortando o acesso.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = supabaseServer();
  if (!db || !ehToken(token)) return new NextResponse("não encontrado", { status: 404 });

  const caminho = await caminhoDaCapaDoBook(db, token);
  if (!caminho) return new NextResponse("sem capa", { status: 404 });

  const { data, error } = await db.storage.from(BUCKET_RESULTADOS).download(caminho);
  if (error || !data) return new NextResponse("sem capa", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": tipoDaImagem(caminho),
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
