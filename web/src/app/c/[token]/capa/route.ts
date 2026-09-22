import { NextResponse } from "next/server";
import { BUCKET_RESULTADOS, supabaseServer } from "@/lib/supabase-server";
import { ehToken } from "@/lib/compartilhar";
import { caminhoDaCapa, tipoDaImagem } from "@/lib/capa-publica";

// A foto de capa de um link público, por um endereço que NÃO vence -- é ela que o WhatsApp
// mostra na prévia da mensagem. Sem login: quem tem o token vê, como a página.
//
// Cache curto de propósito: o link se revoga apagando o token, e uma prévia guardada por
// horas na borda faria o material continuar aparecendo depois de revogado.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = supabaseServer();
  if (!db || !ehToken(token)) return new NextResponse("não encontrado", { status: 404 });

  const caminho = await caminhoDaCapa(db, token);
  if (!caminho) return new NextResponse("sem capa", { status: 404 });

  const { data, error } = await db.storage.from(BUCKET_RESULTADOS).download(caminho);
  if (error || !data) return new NextResponse("sem capa", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": tipoDaImagem(caminho),
      "Cache-Control": "public, max-age=300, s-maxage=300",
      // O robô de prévia segue link; buscador nenhum indexa isto.
      "X-Robots-Tag": "noindex",
    },
  });
}
