import type { SupabaseClient } from "@supabase/supabase-js";
import { PESSOAS_POR_PLANO, type PlanoId } from "./planos";

// De quem é a conta que paga: da pessoa ou da imobiliária. Regra única, usada por
// toda rota que debita, estorna ou credita:
//
//   membro de imobiliária  -> conta da imobiliária (créditos, plano e marca dela)
//   fora de imobiliária    -> conta pessoal
//
// Os créditos pessoais de quem entra numa imobiliária ficam congelados até sair; quem
// cria a imobiliária leva os próprios créditos pra ela. Previsível, sem "de qual saldo
// saiu?" -- e o gestor sabe que tudo que a equipe gasta sai de um lugar só.
//
// Só servidor (service role): as funções de crédito são SECURITY DEFINER e só o
// service_role executa (migrations 02, 05, 09, 10).

export type Papel = "dono" | "gestor" | "corretor";

export type ContaCobranca = { tipo: "user" | "org"; id: string };

export type Conta = ContaCobranca & {
  creditos: number;
  plano: PlanoId | string;
  status: string | null;
  renovaEm: string | null;
  org: { id: string; nome: string; papel: Papel; pessoas: number; limite: number } | null;
};

type Db = SupabaseClient;

export function limitePessoas(plano: string | null | undefined): number {
  return PESSOAS_POR_PLANO[(plano ?? "gratis") as PlanoId] ?? PESSOAS_POR_PLANO.gratis;
}

export async function membroDe(db: Db, userId: string): Promise<{ orgId: string; papel: Papel } | null> {
  const { data } = await db.from("org_members").select("org_id, papel").eq("user_id", userId).maybeSingle();
  return data ? { orgId: data.org_id, papel: data.papel as Papel } : null;
}

/**
 * Se a pessoa tem convite pendente (pelo e-mail) e não está em nenhuma imobiliária,
 * entra agora. Devolve o nome da imobiliária quando entrou, pra tela avisar.
 */
export async function aceitarConvitePendente(db: Db, userId: string, email: string): Promise<string | null> {
  if (!email) return null;
  const ja = await membroDe(db, userId);
  if (ja) return null;
  const { data: convites } = await db
    .from("org_convites")
    .select("id, org_id, papel, organizations(nome, plano)")
    .ilike("email", email)
    .is("aceito_em", null)
    .order("criado_em", { ascending: true })
    .limit(1);
  const convite = convites?.[0];
  if (!convite) return null;
  const org = convite.organizations as unknown as { nome: string; plano: string } | null;
  const { count } = await db.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", convite.org_id);
  if ((count ?? 0) >= limitePessoas(org?.plano)) return null; // lotou depois do convite: fica pendente
  const { error } = await db.from("org_members").insert({ org_id: convite.org_id, user_id: userId, papel: convite.papel });
  if (error) return null;
  await db.from("org_convites").update({ aceito_em: new Date().toISOString() }).eq("id", convite.id);
  return org?.nome ?? "sua imobiliária";
}

export async function contaDe(db: Db, userId: string): Promise<Conta> {
  const membro = await membroDe(db, userId);
  if (membro) {
    const [{ data: org }, { count }] = await Promise.all([
      db.from("organizations").select("id, nome, creditos_saldo, plano, assinatura_status, assinatura_renova_em").eq("id", membro.orgId).single(),
      db.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", membro.orgId),
    ]);
    if (org) {
      return {
        tipo: "org",
        id: org.id,
        creditos: org.creditos_saldo,
        plano: org.plano,
        status: org.assinatura_status,
        renovaEm: org.assinatura_renova_em,
        org: { id: org.id, nome: org.nome, papel: membro.papel, pessoas: count ?? 1, limite: limitePessoas(org.plano) },
      };
    }
  }
  const { data: u } = await db.from("users").select("creditos_saldo, plano, assinatura_status, assinatura_renova_em").eq("id", userId).single();
  return {
    tipo: "user",
    id: userId,
    creditos: u?.creditos_saldo ?? 0,
    plano: u?.plano ?? "gratis",
    status: u?.assinatura_status ?? null,
    renovaEm: u?.assinatura_renova_em ?? null,
    org: null,
  };
}

/** Debita N créditos da conta. Devolve o saldo novo, ou null se não havia saldo. */
export async function debitar(db: Db, conta: ContaCobranca, userId: string, quantidade: number, motivo: string, referencia?: string): Promise<number | null> {
  if (conta.tipo === "org") {
    const { data, error } = await db.rpc("debitar_creditos_org", { p_org_id: conta.id, p_user_id: userId, p_quantidade: quantidade, p_motivo: motivo, p_referencia: referencia ?? null });
    if (error) throw new Error(`debitar_creditos_org: ${error.message}`);
    return data as number | null;
  }
  const { data, error } = await db.rpc("debitar_creditos", { p_user_id: conta.id, p_quantidade: quantidade, p_motivo: motivo, p_referencia: referencia ?? null });
  if (error) throw new Error(`debitar_creditos: ${error.message}`);
  return data as number | null;
}

/** Credita N créditos na conta (estorno, compra, liberação mensal). */
export async function creditar(db: Db, conta: ContaCobranca, userId: string | null, quantidade: number, motivo: string, referencia?: string): Promise<number | null> {
  if (quantidade <= 0) return null;
  if (conta.tipo === "org") {
    const { data, error } = await db.rpc("adicionar_creditos_org", { p_org_id: conta.id, p_user_id: userId, p_quantidade: quantidade, p_motivo: motivo, p_referencia: referencia ?? null });
    if (error) throw new Error(`adicionar_creditos_org: ${error.message}`);
    return data as number | null;
  }
  const { data, error } = await db.rpc("adicionar_creditos", { p_user_id: conta.id, p_quantidade: quantidade, p_motivo: motivo, p_referencia: referencia ?? null });
  if (error) throw new Error(`adicionar_creditos: ${error.message}`);
  return data as number | null;
}

/** Acha a conta (pessoa ou imobiliária) dona de um customer da Stripe. */
export async function contaPorStripeCustomer(db: Db, customerId: string): Promise<ContaCobranca | null> {
  const { data: org } = await db.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (org) return { tipo: "org", id: org.id };
  const { data: u } = await db.from("users").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (u) return { tipo: "user", id: u.id };
  return null;
}

export type Marca = {
  nome: string | null;
  creci: string | null;
  whatsapp: string | null;
  logo_path: string | null;
  cor_marca: string | null;
  deImobiliaria: boolean;
  /**
   * A imobiliária crua, quando a pessoa é de uma equipe.
   *
   * Vem junto porque a TELA precisa distinguir o que é dela do que é herdado -- e não
   * distinguir foi o defeito: um corretor que entrou numa equipe com logo viu "Enviar meu
   * logo" e concluiu que precisava de um. Não precisava; os materiais dele já saíam com o da
   * imobiliária. A regra sempre esteve certa; quem não contava era a tela.
   */
  org: { nome: string; creci: string | null; whatsapp: string | null; temLogo: boolean; cor: string | null } | null;
};

/**
 * A marca que vai pra foto, pro vídeo e pra página compartilhada: a da pessoa, e o que
 * ela não preencheu vem da imobiliária (logo, cor, WhatsApp da casa).
 */
/**
 * De quem é a marca que vai sair na peça.
 *
 * Ausente = a regra de sempre: a da pessoa, e a da imobiliária como rede de proteção.
 * É o padrão porque é o que todo material já produzido fez.
 */
export type QualMarca = "pessoa" | "imobiliaria";

export function ehQualMarca(v: unknown): v is QualMarca {
  return v === "pessoa" || v === "imobiliaria";
}

/**
 * A marca que a peça leva: logo, cor, CRECI, WhatsApp e nome.
 *
 * `qual` responde a uma pergunta que o produto não deixava fazer. Ele em 12/10/2026: "e se
 * o corretor tiver a logo pessoal dele e a imobiliária outra, e a pessoa querer usar uma ou
 * outra nos materiais?". A regra antiga era `pessoa ?? imobiliária` em cada campo -- ótima
 * como rede de proteção (quem não tem logo herda o da equipe) e impossível de contrariar:
 * com logo pessoal, o da imobiliária NUNCA saía, nem quando o anúncio era dela.
 *
 * Três situações reais que isso trava: anúncio da imobiliária, que muitas exigem com a marca
 * dela; conteúdo do corretor, que ele quer com a dele; e quem atende duas.
 *
 * O NOME continua juntando os dois ("Fulano · Imobiliária J7") quando a peça é da
 * imobiliária: quem vê o anúncio precisa saber com quem falar, e o corretor não some da
 * própria peça. Escolhendo "pessoa", sai só ele.
 */
export async function marcaEfetiva(db: Db, userId: string, qual?: QualMarca): Promise<Marca> {
  const { data: u } = await db.from("users").select("nome, creci, whatsapp, logo_path, cor_marca").eq("id", userId).maybeSingle();
  const membro = await membroDe(db, userId);
  let org: { nome: string; creci: string | null; whatsapp: string | null; logo_path: string | null; cor_marca: string | null } | null = null;
  if (membro) {
    const { data } = await db.from("organizations").select("nome, creci, whatsapp, logo_path, cor_marca").eq("id", membro.orgId).maybeSingle();
    org = data;
  }
  // Pedir a marca da imobiliária sem estar em uma, ou numa que não tem logo, volta pro
  // padrão em vez de sair sem marca nenhuma: a peça tem que sair.
  const daOrg = qual === "imobiliaria" && !!org;
  const primeiro = <T>(a: T | null | undefined, b: T | null | undefined) => (daOrg ? (b ?? a ?? null) : (a ?? b ?? null));

  const pessoa = u?.nome ?? null;
  const nome =
    qual === "pessoa"
      ? (pessoa ?? org?.nome ?? null)
      : pessoa && org
        ? `${pessoa} · ${org.nome}`
        : (pessoa ?? org?.nome ?? null);
  const logo = primeiro(u?.logo_path, org?.logo_path);
  return {
    nome,
    creci: primeiro(u?.creci, org?.creci),
    whatsapp: primeiro(u?.whatsapp, org?.whatsapp),
    logo_path: logo,
    cor_marca: primeiro(u?.cor_marca, org?.cor_marca),
    deImobiliaria: !!logo && logo === org?.logo_path && logo !== u?.logo_path,
    org: org ? { nome: org.nome, creci: org.creci, whatsapp: org.whatsapp, temLogo: !!org.logo_path, cor: org.cor_marca } : null,
  };
}
