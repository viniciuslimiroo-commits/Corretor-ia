import { createClient } from "@supabase/supabase-js";

// Cliente de SERVIDOR -- usa a service role key, que ignora RLS. Nunca importar isto
// num Client Component (é por isso que não tem NEXT_PUBLIC_ no nome da env var).
//
// Causa raiz do bug "créditos nunca debitam" (achado no QA de 09/09/2026): o app
// inserta em credit_ledger direto do navegador, mas a tabela só tem policy de SELECT --
// o INSERT era bloqueado pelo RLS, silenciosamente, porque o código não checava o
// campo `error` do retorno do Supabase. Em vez de abrir uma policy de INSERT pro
// cliente (o que deixaria qualquer usuário se dar crédito de graça via devtools), o
// débito de crédito passa a acontecer aqui, no servidor, depois de verificar o token
// do usuário -- é o único lugar que pode inserir em credit_ledger.
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
