import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marcaEfetiva, membroDe, type Papel } from "./cobranca";
import { LIMITES_CRM, mensagemDeRetorno, mensagemPronta, podeEnviar, type OrigemId } from "./crm";

// O CRM no servidor: quem pode ver o quê, o histórico e o bloqueio que sobrevive à
// exclusão. As regras de negócio (quando pode enviar, mensagem pronta...) moram em
// lib/crm.ts, puras.
//
// QUEM VÊ O QUÊ. A conta dos leads é a imobiliária quando a pessoa é membro (a
// imobiliária é a controladora dos dados), senão a própria pessoa. Dentro da imobiliária,
// dono e gestor veem todos os leads da casa; o corretor vê os que ele cadastrou.

type Db = SupabaseClient;

export type ContaCrm = { userId: string; orgId: string | null; papel: Papel | null; conta: string; veTudoDaCasa: boolean };

export async function contaCrm(db: Db, userId: string): Promise<ContaCrm> {
  const m = await membroDe(db, userId);
  return {
    userId,
    orgId: m?.orgId ?? null,
    papel: m?.papel ?? null,
    conta: m?.orgId ?? userId,
    veTudoDaCasa: !!m && (m.papel === "dono" || m.papel === "gestor"),
  };
}

/**
 * O CRM ainda não está aberto pra todo mundo: o estudo jurídico recomenda advogado e
 * empresa aberta antes de lançar. Até lá, só quem está em ADMIN_EMAILS entra --
 * `CRM_ABERTO=1` abre pra todos quando chegar a hora.
 */
export async function crmLiberado(db: Db, userId: string): Promise<boolean> {
  if (process.env.CRM_ABERTO === "1") return true;
  const lista = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!lista.length) return false;
  const { data } = await db.from("users").select("email").eq("id", userId).maybeSingle();
  return !!data?.email && lista.includes(String(data.email).toLowerCase());
}

/** Nomes dos corretores (pra quem vê a casa inteira saber de quem é cada cliente). */
export async function nomesDosCorretores(db: Db, ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return {};
  const { data } = await db.from("users").select("id, nome, email").in("id", unicos);
  return Object.fromEntries((data ?? []).map((u) => [u.id, (u.nome as string | null)?.trim() || String(u.email ?? "").split("@")[0]]));
}

/** O CRM está fechado pros outros (só ADMIN_EMAILS)? A tela avisa enquanto estiver. */
export const crmSoAdmin = () => process.env.CRM_ABERTO !== "1";

/** Aplica "quem vê o quê" numa consulta de `leads`. */
export function doLeadsDaConta<T>(consulta: T, c: ContaCrm): T {
  // Os tipos do construtor de consulta do Supabase estouram a inferência se o filtro for
  // genérico no formato dele; aqui ele entra e sai com o tipo de quem chamou.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = consulta as any;
  if (c.orgId && c.veTudoDaCasa) return q.eq("org_id", c.orgId) as T;
  if (c.orgId) return q.eq("org_id", c.orgId).eq("user_id", c.userId) as T;
  return q.eq("user_id", c.userId).is("org_id", null) as T;
}

/** Registra no histórico. NUNCA põe nome, telefone ou e-mail do lead no detalhe. */
export async function registrar(db: Db, c: ContaCrm, leadId: string | null, acao: string, detalhe?: Record<string, unknown>): Promise<void> {
  await db.from("leads_log").insert({ lead_id: leadId, user_id: c.userId, org_id: c.orgId, acao, detalhe: detalhe ?? null });
}

/** O número como fica guardado no bloqueio: hash com a conta, sem o número em claro. */
export function hashDoTelefone(conta: string, numero: string): string {
  return createHash("sha256").update(`${conta}:${numero}`).digest("hex");
}

export async function numeroBloqueado(db: Db, c: ContaCrm, numero: string): Promise<"pediu_parar" | "numero_errado" | null> {
  const { data } = await db.from("leads_bloqueados").select("motivo").eq("conta", c.conta).eq("telefone_hash", hashDoTelefone(c.conta, numero)).maybeSingle();
  return (data?.motivo as "pediu_parar" | "numero_errado" | undefined) ?? null;
}

export async function bloquearNumero(db: Db, c: ContaCrm, numero: string, motivo: "pediu_parar" | "numero_errado"): Promise<void> {
  await db.from("leads_bloqueados").upsert({ conta: c.conta, telefone_hash: hashDoTelefone(c.conta, numero), motivo }, { onConflict: "conta,telefone_hash" });
}

/** Início do dia em Brasília, em ISO: o limite de primeiros contatos é por dia daqui. */
export function inicioDoDiaEmBrasilia(agora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/** Primeiros contatos que ESTA pessoa abriu hoje (o limite é do número dela, não da casa). */
export async function primeirosContatosHoje(db: Db, userId: string, agora: Date): Promise<number> {
  const { count } = await db
    .from("leads_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("acao", "abriu_mensagem")
    .eq("detalhe->>primeiro", "true")
    .gte("criado_em", inicioDoDiaEmBrasilia(agora));
  return count ?? 0;
}

export const CAMPOS_DO_LEAD =
  "id, user_id, org_id, nome, telefone, email, origem, etapa, property_id, observacoes, frio, bloqueio, bloqueado_em, declaracao_em, declaracao_versao, tentativas_sem_resposta, ultimo_envio_em, proximo_contato_em, criado_em, atualizado_em";

/** O que a tela precisa pra decidir o botão de mensagem: pode enviar agora? com que texto? */
export async function situacaoDeEnvio(db: Db, c: ContaCrm, lead: Record<string, unknown>, agora: Date) {
  const marca = await marcaEfetiva(db, c.userId);
  const primeirosHoje = await primeirosContatosHoje(db, c.userId, agora);
  let imovel: string | null = null;
  if (lead.property_id) {
    const { data } = await db.from("properties").select("titulo").eq("id", lead.property_id as string).maybeSingle();
    imovel = data?.titulo ?? null;
  }
  // Reabertura da PRIMEIRA mensagem no mesmo dia: o texto continua o de apresentação.
  let primeiraMensagemHoje = false;
  if (lead.ultimo_envio_em) {
    const { count } = await db
      .from("leads_log")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id as string)
      .eq("acao", "abriu_mensagem")
      .eq("detalhe->>primeiro", "true")
      .gte("criado_em", inicioDoDiaEmBrasilia(agora));
    primeiraMensagemHoje = (count ?? 0) > 0;
  }
  const pode = podeEnviar(
    {
      telefone: lead.telefone as string,
      bloqueio: (lead.bloqueio as "pediu_parar" | "numero_errado" | null) ?? null,
      declaracao_em: (lead.declaracao_em as string | null) ?? null,
      tentativas_sem_resposta: Number(lead.tentativas_sem_resposta ?? 0),
      ultimo_envio_em: (lead.ultimo_envio_em as string | null) ?? null,
      frio: !!lead.frio,
    },
    { creci: marca.creci, primeirosHoje, agora, primeiraMensagemHoje }
  );
  const corretor = marca.nome ?? "";
  const apresentacao = pode.ok ? pode.primeiroContato : !lead.ultimo_envio_em;
  const texto = apresentacao
    ? mensagemPronta({ corretor, creci: marca.creci ?? "", nomeLead: lead.nome as string, origem: lead.origem as OrigemId, imovel })
    : mensagemDeRetorno({ corretor, nomeLead: lead.nome as string });
  return { pode, texto, primeirosHoje, limiteDia: LIMITES_CRM.primeirosPorDia, corretor, creci: marca.creci, imovel };
}
