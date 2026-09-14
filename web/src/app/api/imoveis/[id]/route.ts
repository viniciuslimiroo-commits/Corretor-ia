import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";
import { CHAVES_FICHA, limparFicha } from "@/lib/ficha-imovel";

// Um imóvel: dados e a galeria de gerações dele, cada uma com antes e depois assinados.

async function imovelDoUsuario(db: NonNullable<Awaited<ReturnType<typeof usuarioDaRota>>["db"]>, id: string, userId: string) {
  const { data } = await db
    .from("properties")
    // Asterisco de propósito: os campos de ficha entraram na migração 11 e listar nome por
    // nome faria a consulta falhar inteira em base que ainda não migrou.
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const imovel = await imovelDoUsuario(db, id, userId);
  if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const { data: jobs } = await db
    .from("jobs")
    .select("id, tipo, status, parametros, input_path, output_path, share_token, reportado_em, criado_em")
    .eq("property_id", id)
    .eq("user_id", userId)
    .in("status", ["concluido", "gerando", "upscaling"])
    .order("criado_em", { ascending: false });

  const geracoes = await Promise.all(
    (jobs ?? []).map(async (j) => {
      const def = ACOES_POR_ID[j.tipo];
      return {
        id: j.id,
        acao: rotuloDoTipo(j.tipo),
        detalhe: def ? resumirParametros(def, (j.parametros ?? {}) as Record<string, string>) : "",
        status: j.status,
        criadoEm: j.criado_em,
        reportado: !!j.reportado_em,
        compartilhado: !!j.share_token,
        antes: j.input_path ? await assinar(db, j.input_path).catch(() => null) : null,
        depois: j.output_path ? await assinar(db, j.output_path).catch(() => null) : null,
        capa: j.id === imovel.capa_job_id,
      };
    })
  );

  return NextResponse.json({
    imovel: {
      id: imovel.id,
      titulo: imovel.titulo ?? "Imóvel",
      endereco: imovel.endereco,
      compartilhado: !!imovel.share_token,
      criadoEm: imovel.criado_em,
      atualizadoEm: imovel.atualizado_em,
      ficha: Object.fromEntries(CHAVES_FICHA.map((k) => [k, (imovel as Record<string, unknown>)[k] ?? null])),
    },
    geracoes,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const imovel = await imovelDoUsuario(db, id, userId);
  if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  const mudancas: Record<string, string | number | null> = { ...limparFicha(corpo) };
  if (typeof corpo.titulo === "string") {
    const t = corpo.titulo.trim().slice(0, 80);
    if (!t) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    mudancas.titulo = t;
  }
  if (typeof corpo.endereco === "string") mudancas.endereco = corpo.endereco.trim().slice(0, 160) || null;
  if ("capaJobId" in corpo) {
    const capa = typeof corpo.capaJobId === "string" && corpo.capaJobId ? corpo.capaJobId : null;
    if (capa) {
      const { data: job } = await db.from("jobs").select("id").eq("id", capa).eq("user_id", userId).eq("property_id", id).maybeSingle();
      if (!job) return NextResponse.json({ error: "Essa foto não é deste imóvel." }, { status: 400 });
    }
    mudancas.capa_job_id = capa;
  }
  if (Object.keys(mudancas).length === 0) return NextResponse.json({ error: "Nada pra alterar." }, { status: 400 });
  mudancas.atualizado_em = new Date().toISOString();

  const { error } = await db.from("properties").update(mudancas).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  // As gerações continuam existindo (property_id vira null pela FK); só o agrupamento
  // some. Apagar fotos é decisão separada, e mais séria, que não mora aqui.
  const { data } = await db.from("properties").delete().eq("id", id).eq("user_id", userId).select("id");
  if (!data || data.length === 0) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
