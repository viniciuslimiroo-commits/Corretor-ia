import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { ACOES_POR_ID } from "@/lib/acoes";
import { avaliarResultado, type Avaliacao } from "@/lib/avaliador";

// "Geração ruim = crédito de volta". A pessoa aperta "Reportar", conta o que deu errado
// e o crédito volta -- sem ninguém aprovar. Fase B: um modelo de visão olha antes e
// depois e dá o veredito (é o classificador que a Pedra também tem), e o veredito
// decide COM O LIMITE, não sozinho:
//
//   modelo diz "falhou"  -> estorna, até LIMITE_TOTAL por dia (freio contra abuso em massa)
//   modelo diz "ok"      -> estorna mesmo assim, por cortesia, até LIMITE_CORTESIA por dia;
//                           passou disso, registra pra análise manual e não estorna
//   modelo não respondeu -> igual à cortesia (a política anterior, manual)
//
// Por que a cortesia existe: o modelo erra, e quem paga o erro dele não pode ser o
// corretor que acabou de ter uma foto ruim. Três cortesias por dia cobrem o uso honesto;
// o que passa disso, ou o modelo confirma, ou uma pessoa olha.
//
// Um estorno por job: o UPDATE só pega a linha se `reportado_em` ainda for nulo -- é um
// statement só, então dois cliques simultâneos não estornam duas vezes.
const LIMITE_CORTESIA = 3;
const LIMITE_TOTAL = 10;

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const motivo = (await req.json().catch(() => ({})))?.motivo;
  const motivoLimpo = typeof motivo === "string" && motivo.trim() ? motivo.trim().slice(0, 500) : null;

  const { data: job } = await db
    .from("jobs")
    .select("status, reportado_em, tipo, parametros, input_path, output_path, pipeline")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!job) return NextResponse.json({ error: "Geração não encontrada." }, { status: 404 });
  if (job.status !== "concluido") {
    return NextResponse.json({ error: "Só dá pra reportar uma geração que terminou." }, { status: 409 });
  }
  if (job.reportado_em) {
    return NextResponse.json({ error: "Esta geração já foi reportada." }, { status: 409 });
  }

  // Quantos reportes nas últimas 24h, antes deste -- separando os que o avaliador
  // CONFIRMOU dos que foram devolvidos por cortesia. Quem teve três falhas de verdade
  // não pode ouvir "suas cortesias acabaram": o limite de cortesia conta só cortesia.
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recentes } = await db
    .from("jobs")
    .select("avaliacao")
    .eq("user_id", userId)
    .gte("reportado_em", desde);
  const reportesHoje = recentes?.length ?? 0;
  const cortesiasHoje = (recentes ?? []).filter((r) => {
    const a = r.avaliacao as { veredito?: string } | null;
    return !a || a.veredito !== "falhou";
  }).length;

  // Marca como reportado de forma atômica. Se outra requisição chegou antes, `data`
  // volta vazio e a gente não estorna de novo.
  const { data: marcado } = await db
    .from("jobs")
    .update({ reportado_em: new Date().toISOString(), motivo_reporte: motivoLimpo })
    .eq("id", id)
    .eq("user_id", userId)
    .is("reportado_em", null)
    .select("id");
  if (!marcado || marcado.length === 0) {
    return NextResponse.json({ error: "Esta geração já foi reportada." }, { status: 409 });
  }

  // ---- o avaliador ----
  let avaliacao: Avaliacao | null = null;
  const falKey = process.env.FAL_KEY;
  const acao = ACOES_POR_ID[job.tipo];
  if (falKey && acao && job.input_path && job.output_path) {
    try {
      const [urlAntes, urlDepois] = await Promise.all([assinar(db, job.input_path), assinar(db, job.output_path)]);
      const pipeline = (job.pipeline ?? {}) as { urlMascara?: string | null };
      avaliacao = await avaliarResultado({
        falKey,
        acao,
        parametros: (job.parametros ?? {}) as Record<string, string>,
        usouMascara: !!pipeline.urlMascara,
        relato: motivoLimpo,
        urlAntes,
        urlDepois,
      });
    } catch (e) {
      avaliacao = { veredito: "indeterminado", justificativa: `Avaliação não rodou (${e instanceof Error ? e.message.slice(0, 120) : "erro"}).`, modelo: "-", em: new Date().toISOString() };
    }
  }

  const confirmou = avaliacao?.veredito === "falhou";
  const estorna = confirmou ? reportesHoje < LIMITE_TOTAL : cortesiasHoje < LIMITE_CORTESIA;

  await db.from("jobs").update({ avaliacao: { ...(avaliacao ?? { veredito: "indeterminado", justificativa: "Sem original guardada pra comparar.", modelo: "-", em: new Date().toISOString() }), estornado: estorna } }).eq("id", id);

  const justificativa = avaliacao?.justificativa && avaliacao.veredito !== "indeterminado" ? ` ${avaliacao.justificativa}` : "";

  if (!estorna) {
    return NextResponse.json({
      estornado: false,
      veredito: avaliacao?.veredito ?? "indeterminado",
      mensagem: confirmou
        ? `Reporte registrado. Você já recebeu ${LIMITE_TOTAL} estornos nas últimas 24h; este vai ser analisado manualmente.`
        : `Reporte registrado. Nossa avaliação automática não encontrou falha nesta geração${justificativa} e as ${LIMITE_CORTESIA} devoluções por cortesia de hoje já foram usadas; este vai ser analisado manualmente.`,
    });
  }

  const { data: saldo, error: erroEstorno } = await db.rpc("estornar_credito", {
    p_user_id: userId,
    p_job_id: id,
    p_motivo: "estorno_reporte",
  });
  if (erroEstorno) {
    return NextResponse.json({ error: `Erro devolvendo o crédito: ${erroEstorno.message}` }, { status: 500 });
  }

  return NextResponse.json({
    estornado: true,
    creditosRestantes: saldo,
    veredito: avaliacao?.veredito ?? "indeterminado",
    mensagem: confirmou
      ? `Crédito devolvido. A avaliação automática confirmou o problema:${justificativa}`
      : avaliacao?.veredito === "ok"
        ? `Crédito devolvido por cortesia (${cortesiasHoje + 1} de ${LIMITE_CORTESIA} hoje). A avaliação automática não viu falha:${justificativa}`
        : "Crédito devolvido. Obrigado por avisar, isso ajuda a melhorar os modelos.",
  });
}
