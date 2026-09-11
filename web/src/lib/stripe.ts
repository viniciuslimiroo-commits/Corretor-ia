import Stripe from "stripe";

// Cliente da Stripe, só no servidor: a chave secreta nunca tem NEXT_PUBLIC_ no nome.
// Devolve null quando a chave não está configurada, no mesmo espírito do
// supabaseServer() -- as rotas checam e explicam em vez de explodir.
export function stripe(): Stripe | null {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return null;
  return new Stripe(chave);
}

// Créditos por ciclo quando o preço não trouxer `metadata.creditos_por_ciclo`.
// O valor de verdade mora no metadata do preço na Stripe (foi criado assim), pra mudar
// o plano sem deploy. Isto aqui é só rede de proteção, e quando cai nela o webhook
// registra o aviso no ledger.
export const CREDITOS_POR_CICLO_PADRAO = 80;

/** Extrai um id de um campo que a Stripe ora manda como string, ora como objeto. */
export function idDe(valor: unknown): string | null {
  if (!valor) return null;
  if (typeof valor === "string") return valor;
  if (typeof valor === "object" && "id" in valor && typeof (valor as { id: unknown }).id === "string") {
    return (valor as { id: string }).id;
  }
  return null;
}
