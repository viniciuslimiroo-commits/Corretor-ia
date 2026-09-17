import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { buscarClipesPexels, temChavePexels } from "@/lib/pexels-servidor";

// Busca de clipes de reação no Pexels, pra aba GIFs do editor.
//
// Só pra quem está logado: a cota da chave (200 buscas por hora) é da conta inteira, e uma
// rota aberta deixaria qualquer um gastá-la. A resposta é o mínimo que a galeria precisa --
// capa, prévia leve e crédito -- e a chave nunca sai do servidor.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!temChavePexels()) return NextResponse.json({ error: "sem_chave" }, { status: 503 });
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "Servidor sem Supabase." }, { status: 500 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const pagina = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("pagina")) || 1));
  if (!q) return NextResponse.json({ error: "Busca vazia." }, { status: 400 });
  try {
    // `livre=1`: o que a pessoa digitou, em português. Sem ele, é a busca da prateleira.
    const r = await buscarClipesPexels(q, pagina, req.nextUrl.searchParams.get("livre") === "1");
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: msg === "limite" ? "limite" : "falhou" }, { status: msg === "limite" ? 429 : 502 });
  }
}
