import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { marcaEfetiva } from "@/lib/cobranca";
import { ETAPAS, limparLeadNovo } from "@/lib/crm";
import { CAMPOS_DO_LEAD, contaCrm, crmLiberado, crmSoAdmin, doLeadsDaConta, nomesDosCorretores, numeroBloqueado, registrar } from "@/lib/crm-servidor";

// CRM: a lista de clientes da conta e o cadastro de um novo. Regras em lib/crm.ts;
// quem vê o quê em lib/crm-servidor.ts.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 });
  const c = await contaCrm(db, userId);

  const { data, error } = await doLeadsDaConta(db.from("leads").select(CAMPOS_DO_LEAD), c).order("atualizado_em", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: `Não consegui ler seus clientes agora (${error.message.slice(0, 120)}). Tente de novo.` }, { status: 503 });

  const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e.id, 0])) as Record<string, number>;
  for (const l of data ?? []) porEtapa[l.etapa] = (porEtapa[l.etapa] ?? 0) + 1;
  // Dono e gestor veem a casa inteira: cada cliente de colega vem com o nome do corretor.
  const deColegas = c.veTudoDaCasa ? (data ?? []).filter((l) => l.user_id !== userId) : [];
  const nomes = await nomesDosCorretores(db, deColegas.map((l) => l.user_id as string));
  const leads = (data ?? []).map((l) => (l.user_id !== userId && nomes[l.user_id as string] ? { ...l, corretor: nomes[l.user_id as string] } : l));

  // Sem CRECI nenhuma mensagem sai: a lista avisa logo, não só na hora de enviar.
  const marca = await marcaEfetiva(db, userId);
  return NextResponse.json({ leads, porEtapa, veTudoDaCasa: c.veTudoDaCasa, temCreci: !!marca.creci?.trim(), soAdmin: crmSoAdmin() });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 });
  const c = await contaCrm(db, userId);

  const corpo = await req.json().catch(() => ({}));
  const r = limparLeadNovo(corpo && typeof corpo === "object" ? corpo : {});
  if (r.lead === null) return NextResponse.json({ error: r.erro }, { status: 400 });

  // Quem pediu pra parar continua bloqueado mesmo se o lead foi excluído e cadastrado de novo.
  const bloqueio = await numeroBloqueado(db, c, r.lead.telefone);
  if (bloqueio === "pediu_parar") {
    return NextResponse.json({ error: "Este número pediu para parar de receber mensagens desta conta. Não dá pra cadastrar de novo." }, { status: 409 });
  }

  // O imóvel, se veio, tem que ser da pessoa.
  if (r.lead.property_id) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", r.lead.property_id).eq("user_id", userId).maybeSingle();
    if (!imovel) r.lead.property_id = null;
  }

  const { data, error } = await db
    .from("leads")
    .insert({ ...r.lead, user_id: userId, org_id: c.orgId, ...(bloqueio === "numero_errado" ? { bloqueio, bloqueado_em: new Date().toISOString() } : {}) })
    .select(CAMPOS_DO_LEAD)
    .single();
  if (error) {
    if (error.code === "23505") {
      // Aponta o cliente que já existe. Se é de outro corretor da imobiliária (que esta
      // pessoa não vê), diz isso -- "já está nos seus clientes" mandava procurar o que não aparece.
      const base = db.from("leads").select("id, user_id").eq("telefone", r.lead.telefone);
      const { data: existe } = await (c.orgId ? base.eq("org_id", c.orgId) : base.eq("user_id", userId).is("org_id", null)).maybeSingle();
      const ve = !!existe && (!c.orgId || c.veTudoDaCasa || existe.user_id === userId);
      return NextResponse.json(
        ve ? { error: "Este número já está nos seus clientes.", existente: existe!.id } : { error: "Este número já é cliente de outro corretor da sua imobiliária." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Não consegui cadastrar agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  }
  await registrar(db, c, data.id, "cadastrou", { origem: r.lead.origem, frio: r.lead.frio });
  return NextResponse.json({ lead: data });
}
