import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { limitePessoas, membroDe, type Papel } from "@/lib/cobranca";

// Membros e convites da imobiliária.
//   POST   { email, papel }        convida (dono ou gestor); vale o limite do plano
//   DELETE { userId } | { conviteId } | { sair: true }
//   PATCH  { userId, papel }       muda o papel (só o dono)
//
// Convite não manda e-mail: fica pendente e vira membro quando a pessoa entra com
// aquele e-mail (ver /api/conta). O gestor avisa pelo WhatsApp, que é como imobiliária
// conversa de verdade.

async function contexto(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return { erro: s.erro } as const;
  const membro = await membroDe(s.db, s.userId);
  if (!membro) return { erro: NextResponse.json({ error: "Você não está numa imobiliária." }, { status: 404 }) } as const;
  const { data: org } = await s.db.from("organizations").select("id, plano, dono_id").eq("id", membro.orgId).single();
  if (!org) return { erro: NextResponse.json({ error: "Imobiliária não encontrada." }, { status: 404 }) } as const;
  return { db: s.db, userId: s.userId, papel: membro.papel, org, erro: null } as const;
}

const gerencia = (papel: Papel) => papel === "dono" || papel === "gestor";

export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if (c.erro) return c.erro;
  const { db, userId, papel, org } = c;
  if (!gerencia(papel)) return NextResponse.json({ error: "Só dono ou gestor convida." }, { status: 403 });

  const corpo = await req.json().catch(() => ({}));
  const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const papelNovo: Papel = corpo?.papel === "gestor" ? "gestor" : "corretor";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

  const [{ count: membros }, { count: pendentes }] = await Promise.all([
    db.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
    db.from("org_convites").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("aceito_em", null),
  ]);
  const limite = limitePessoas(org.plano);
  if ((membros ?? 0) + (pendentes ?? 0) >= limite) {
    return NextResponse.json({ error: `Seu plano comporta ${limite} pessoas (contando convites pendentes). Suba de plano em Planos.` }, { status: 409 });
  }

  // Já é membro de alguma imobiliária? Não dá pra estar em duas.
  const { data: usuario } = await db.from("users").select("id").ilike("email", email).maybeSingle();
  if (usuario) {
    const { data: jaMembro } = await db.from("org_members").select("org_id").eq("user_id", usuario.id).maybeSingle();
    if (jaMembro) return NextResponse.json({ error: jaMembro.org_id === org.id ? "Essa pessoa já está na equipe." : "Essa pessoa já faz parte de outra imobiliária." }, { status: 409 });
  }

  const { data, error } = await db
    .from("org_convites")
    .insert({ org_id: org.id, email, papel: papelNovo, convidado_por: userId })
    .select("id, email, papel, criado_em")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Esse e-mail já tem convite pendente." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ convite: { id: data.id, email: data.email, papel: data.papel, criadoEm: data.criado_em } });
}

export async function DELETE(req: NextRequest) {
  const c = await contexto(req);
  if (c.erro) return c.erro;
  const { db, userId, papel, org } = c;
  const corpo = await req.json().catch(() => ({}));

  if (corpo?.sair === true) {
    if (papel === "dono") return NextResponse.json({ error: "O dono não sai; passe a imobiliária pra outra pessoa primeiro." }, { status: 409 });
    await db.from("org_members").delete().eq("org_id", org.id).eq("user_id", userId);
    return NextResponse.json({ ok: true, saiu: true });
  }
  if (!gerencia(papel)) return NextResponse.json({ error: "Só dono ou gestor remove." }, { status: 403 });

  if (typeof corpo?.conviteId === "string") {
    await db.from("org_convites").delete().eq("id", corpo.conviteId).eq("org_id", org.id).is("aceito_em", null);
    return NextResponse.json({ ok: true });
  }
  if (typeof corpo?.userId === "string") {
    if (corpo.userId === org.dono_id) return NextResponse.json({ error: "O dono não pode ser removido." }, { status: 409 });
    if (corpo.userId === userId) return NextResponse.json({ error: "Pra sair, use 'Sair da imobiliária'." }, { status: 409 });
    await db.from("org_members").delete().eq("org_id", org.id).eq("user_id", corpo.userId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Informe userId, conviteId ou sair." }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const c = await contexto(req);
  if (c.erro) return c.erro;
  const { db, papel, org } = c;
  if (papel !== "dono") return NextResponse.json({ error: "Só o dono muda papéis." }, { status: 403 });
  const corpo = await req.json().catch(() => ({}));
  const alvo = typeof corpo?.userId === "string" ? corpo.userId : "";
  const novo: Papel = corpo?.papel === "gestor" ? "gestor" : "corretor";
  if (!alvo || alvo === org.dono_id) return NextResponse.json({ error: "Escolha um membro que não seja o dono." }, { status: 400 });
  const { data } = await db.from("org_members").update({ papel: novo }).eq("org_id", org.id).eq("user_id", alvo).select("user_id");
  if (!data || data.length === 0) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, papel: novo });
}
