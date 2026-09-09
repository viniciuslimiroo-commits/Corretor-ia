import { createClient } from "@supabase/supabase-js";

// Cliente do lado do navegador (usa a chave pública "anon" -- segura de expor,
// a segurança de verdade vem do RLS definido em supabase/schema.sql).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;

// `supabase` fica `null` até você preencher web/.env.local -- as telas que dependem
// dele (login, salvar job) devem checar isso antes de usar.
