import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { contaDe, limitePessoas, membroDe, type Papel } from "@/lib/cobranca";
import { rotuloDoPlano } from "@/lib/planos";

// Painel da imobiliária. GET devolve tudo que a tela Equipe mostra: a imobiliária,
// o papel de quem pede, os membros com o uso do mês, os convites pendentes, a marca.
// POST cria a imobiliária e leva os créditos pessoais de quem criou pra ela.

export type Membro = { userId: string; email: string; nome: string | null; papel: Papel; entrouEm: string; fotosMes: number; videosMes: number };

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const membro = await membroDe(db, userId);
  if (!membro) return NextResponse.json({ org: null });

  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  const [{ data: org }, { data: membros }, { data: convites }, { data: jobsMes }, { data: videosMes }] = await Promise.all([
    db.from("organizations").select("id, nome, plano, creditos_saldo, assinatura_status, assinatura_renova_em, logo_path, cor_marca, whatsapp, creci, dono_id, criado_em").eq("id", membro.orgId).single(),
    db.from("org_members").select("user_id, papel, criado_em, users(email, nome)").eq("org_id", membro.orgId).order("criado_em"),
    db.from("org_convites").select("id, email, papel, criado_em").eq("org_id", membro.orgId).is("aceito_em", null).order("criado_em"),
    db.from("jobs").select("user_id").eq("org_id", membro.orgId).gte("criado_em", inicioMes.toISOString()).neq("status", "sem_credito"),
    db.from("videos").select("user_id").eq("org_id", membro.orgId).gte("criado_em", inicioMes.toISOString()),
  ]);
  if (!org) return NextResponse.json({ org: null });

  const contar = (lista: { user_id: string }[] | null, id: string) => (lista ?? []).filter((x) => x.user_id === id).length;
  const lista: Membro[] = (membros ?? []).map((m) => {
    const u = m.users as unknown as { email: string; nome: string | null } | null;
    return { userId: m.user_id, email: u?.email ?? "", nome: u?.nome ?? null, papel: m.papel as Papel, entrouEm: m.criado_em, fotosMes: contar(jobsMes, m.user_id), videosMes: contar(videosMes, m.user_id) };
  });

  return NextResponse.json({
    org: {
      id: org.id,
      nome: org.nome,
      plano: org.plano,
      planoRotulo: rotuloDoPlano(org.plano),
      creditos: org.creditos_saldo,
      status: org.assinatura_status,
      renovaEm: org.assinatura_renova_em,
      limite: limitePessoas(org.plano),
      pessoas: lista.length,
      criadoEm: org.criado_em,
      marca: {
        logoUrl: org.logo_path ? await assinar(db, org.logo_path).catch(() => null) : null,
        cor: org.cor_marca,
        whatsapp: org.whatsapp ?? "",
        creci: org.creci ?? "",
      },
    },
    papel: membro.papel,
    membros: lista,
    convites: (convites ?? []).map((c) => ({ id: c.id, email: c.email, papel: c.papel, criadoEm: c.criado_em })),
  });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const nome = typeof corpo?.nome === "string" ? corpo.nome.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (nome.length < 2) return NextResponse.json({ error: "Dê um nome à imobiliária." }, { status: 400 });

  if (await membroDe(db, userId)) return NextResponse.json({ error: "Você já faz parte de uma imobiliária." }, { status: 409 });

  const contaPessoal = await contaDe(db, userId);
  if (contaPessoal.status === "active" || contaPessoal.status === "past_due") {
    return NextResponse.json({ error: "Cancele sua assinatura Pro pessoal antes de criar a imobiliária (os créditos que sobrarem vão junto)." }, { status: 409 });
  }

  const { data: org, error } = await db.from("organizations").insert({ nome, dono_id: userId }).select("id, nome").single();
  if (error || !org) return NextResponse.json({ error: error?.message ?? "Erro criando a imobiliária." }, { status: 500 });
  const { error: erroMembro } = await db.from("org_members").insert({ org_id: org.id, user_id: userId, papel: "dono" });
  if (erroMembro) {
    await db.from("organizations").delete().eq("id", org.id);
    return NextResponse.json({ error: erroMembro.message }, { status: 500 });
  }

  // Leva os créditos pessoais: sai da pessoa, entra na imobiliária, tudo no ledger.
  let transferidos = 0;
  if (contaPessoal.creditos > 0) {
    const { data: saldo } = await db.rpc("debitar_creditos", { p_user_id: userId, p_quantidade: contaPessoal.creditos, p_motivo: "transferencia_imobiliaria", p_referencia: org.id });
    if (saldo !== null) {
      await db.rpc("adicionar_creditos_org", { p_org_id: org.id, p_user_id: userId, p_quantidade: contaPessoal.creditos, p_motivo: "transferencia_pessoal", p_referencia: userId });
      transferidos = contaPessoal.creditos;
    }
  }
  // O que já era da pessoa passa a aparecer no painel da imobiliária.
  await Promise.all([
    db.from("jobs").update({ org_id: org.id }).eq("user_id", userId).is("org_id", null),
    db.from("videos").update({ org_id: org.id }).eq("user_id", userId).is("org_id", null),
    db.from("properties").update({ org_id: org.id }).eq("user_id", userId).is("org_id", null),
  ]);

  return NextResponse.json({ org: { id: org.id, nome: org.nome }, transferidos });
}
