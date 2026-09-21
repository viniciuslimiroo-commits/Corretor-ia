import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { LIMITES_MODELO, conferirModelo, type SituacaoId } from "@/lib/crm-modelos";
import { CAMPOS_DO_MODELO, dosModelosDaConta, faltaATabela, liberarVagaDoAutomatico } from "@/lib/crm-modelos-servidor";
import { contaCrm, crmLiberado } from "@/lib/crm-servidor";

// Um modelo de mensagem: mudar e apagar.
//
// Quem pode mexer: qualquer pessoa da conta. Numa imobiliária o texto é da CASA -- se só o
// autor pudesse corrigir, o texto do corretor que saiu ficaria errado pra sempre.

async function abrir(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await usuarioDaRota(req);
  if (s.erro) return { erro: s.erro } as const;
  const { db, userId } = s;
  if (!(await crmLiberado(db, userId))) return { erro: NextResponse.json({ error: "O CRM ainda não está aberto." }, { status: 403 }) } as const;
  const c = await contaCrm(db, userId);
  const { id } = await ctx.params;
  const { data, error } = await dosModelosDaConta(db.from("modelos_mensagem").select(CAMPOS_DO_MODELO), c).eq("id", id).maybeSingle();
  if (error && faltaATabela(error.message)) return { erro: NextResponse.json({ error: "Falta rodar a migração 18 (modelos de mensagem) no Supabase." }, { status: 503 }) } as const;
  if (!data) return { erro: NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 }) } as const;
  return { db, userId, c, modelo: data as Record<string, unknown> } as const;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, c, modelo } = a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const alvo = {
    situacao: typeof b.situacao === "string" ? b.situacao : String(modelo.situacao),
    titulo: (typeof b.titulo === "string" ? b.titulo : String(modelo.titulo)).trim().slice(0, LIMITES_MODELO.tituloMax + 1),
    texto: (typeof b.texto === "string" ? b.texto : String(modelo.texto)).trim().slice(0, LIMITES_MODELO.textoMax + 1),
  };
  const problemas = conferirModelo(alvo);
  if (problemas.length) return NextResponse.json({ error: problemas[0].mensagem, problemas }, { status: 400 });

  const automatico = typeof b.automatico === "boolean" ? b.automatico && alvo.situacao !== "qualquer" : !!modelo.automatico && alvo.situacao !== "qualquer";
  // Vira automático (ou muda de situação levando o automático junto): libera a vaga antes.
  if (automatico) await liberarVagaDoAutomatico(db, c, alvo.situacao as SituacaoId, String(modelo.id));

  const { data, error } = await db
    .from("modelos_mensagem")
    .update({ ...alvo, automatico })
    .eq("id", modelo.id)
    .select(CAMPOS_DO_MODELO)
    .single();
  if (error) return NextResponse.json({ error: `Não consegui salvar agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  return NextResponse.json({ modelo: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await abrir(req, ctx);
  if (a.erro) return a.erro;
  const { db, modelo } = a;
  const { error } = await db.from("modelos_mensagem").delete().eq("id", modelo.id);
  if (error) return NextResponse.json({ error: `Não consegui apagar agora (${error.message.slice(0, 120)}).` }, { status: 503 });
  return NextResponse.json({ ok: true });
}
