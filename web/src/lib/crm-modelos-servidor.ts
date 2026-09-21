import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContaCrm } from "./crm-servidor";
import type { SituacaoId } from "./crm-modelos";

// Os modelos de mensagem no servidor: de quem são e como se lê a lista.
//
// A conta é a MESMA dos leads: a imobiliária quando a pessoa é membro, a pessoa quando não
// é. Assim o dono da casa escreve o texto uma vez e todo corretor dela abre com ele pronto.

export const CAMPOS_DO_MODELO = "id, user_id, org_id, situacao, titulo, texto, automatico, criado_em, atualizado_em";

/** A tabela é nova (migração 18): sem ela, a tela funciona e a lista vem vazia. */
export function faltaATabela(mensagem: string | undefined): boolean {
  return !!mensagem && /relation .* does not exist|could not find the table/i.test(mensagem);
}

/**
 * Aplica o filtro da conta numa consulta de modelos.
 *
 * Sem genérico de propósito: com `<T extends ...>` os tipos encadeados do Supabase estouram
 * o limite de profundidade do TypeScript ("type instantiation is excessively deep"). Aqui o
 * tipo entra e sai como `any` controlado, num ponto só, em vez de espalhar `any` pelas rotas.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function dosModelosDaConta<T>(q: T, c: ContaCrm): T {
  const a = q as any;
  return (c.orgId ? a.eq("org_id", c.orgId) : a.is("org_id", null).eq("user_id", c.userId)) as T;
}

/**
 * Tira o automático de quem tinha a vaga desta situação.
 *
 * O banco só aceita UM automático por situação (índice único). Sem isto, marcar "use este
 * automaticamente" num segundo modelo devolveria erro de chave duplicada -- a tela
 * discutindo em vez de obedecer. Aqui o novo destrona o anterior, que é o que a pessoa quis
 * dizer ao marcar.
 */
export async function liberarVagaDoAutomatico(db: SupabaseClient, c: ContaCrm, situacao: SituacaoId, exceto?: string) {
  let q: any = dosModelosDaConta(db.from("modelos_mensagem").update({ automatico: false }), c).eq("situacao", situacao).eq("automatico", true);
  if (exceto) q = q.neq("id", exceto);
  await q;
}
