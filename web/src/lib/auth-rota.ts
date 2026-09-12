import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase-server";

// A mesma abertura de toda rota autenticada: cliente de servidor + usuário do token.
// Devolve `erro` pronto pra retornar quando algo falta, pra rota não repetir a dança.

export type Sessao = { db: SupabaseClient; userId: string; erro: null } | { db: null; userId: null; erro: NextResponse };

export async function usuarioDaRota(req: NextRequest): Promise<Sessao> {
  const db = supabaseServer();
  if (!db) return { db: null, userId: null, erro: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 }) };
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { db: null, userId: null, erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { db: null, userId: null, erro: NextResponse.json({ error: "Sessão inválida." }, { status: 401 }) };
  return { db, userId: data.user.id, erro: null };
}

/** Origem pública do app, pra montar links absolutos (compartilhar, retorno da Stripe). */
export function origemDoApp(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;
}
