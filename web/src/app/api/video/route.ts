import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { saldoFal } from "@/lib/custo";
import { custoDoVideo, duracaoEstimada, limparEspec } from "@/lib/video";
import { pipelineInicial } from "@/lib/video-pipeline";
import { contaDe, debitar } from "@/lib/cobranca";

// Vídeo (Fase C). POST cria o pedido: valida o espec, confere que cada foto é da pessoa,
// debita os créditos de uma vez (atômico, migration 09) e grava o vídeo com o pipeline
// na primeira etapa. Quem faz o trabalho é /api/video/[id], uma etapa por chamada.
// GET lista os vídeos da pessoa, com miniatura assinada.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: videos } = await db
    .from("videos")
    .select("id, titulo, formato, status, criado_em, concluido_em, duracao_segundos, thumb_path, share_token, property_id, creditos_cobrados, erro, properties(titulo)")
    .eq("user_id", userId)
    .order("criado_em", { ascending: false })
    .limit(60);

  const itens = await Promise.all(
    (videos ?? []).map(async (v) => ({
      id: v.id,
      titulo: v.titulo ?? "Vídeo",
      formato: v.formato,
      status: v.status,
      criadoEm: v.criado_em,
      duracao: v.duracao_segundos,
      creditos: v.creditos_cobrados,
      erro: v.erro,
      compartilhado: !!v.share_token,
      imovel: v.property_id ? { id: v.property_id, titulo: (v.properties as unknown as { titulo: string | null } | null)?.titulo ?? "Imóvel" } : null,
      miniatura: v.thumb_path ? await assinar(db, v.thumb_path).catch(() => null) : null,
    }))
  );
  return NextResponse.json({ videos: itens });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const { espec, erro } = limparEspec(corpo?.espec);
  if (erro || !espec) return NextResponse.json({ error: erro ?? "Pedido inválido." }, { status: 400 });

  let imovelId: string | null = null;
  if (typeof corpo?.imovelId === "string" && corpo.imovelId) {
    const { data: imovel } = await db.from("properties").select("id, titulo, endereco").eq("id", corpo.imovelId).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
    if (!espec.titulo) espec.titulo = (imovel.titulo ?? "").slice(0, 50);
  }

  // Cada foto tem que ser da pessoa e estar pronta. Conferido AQUI, antes de debitar:
  // ninguém paga por um vídeo que não tinha como ser montado.
  const jobIds = [...new Set(espec.cenas.map((c) => c.jobId).filter((x): x is string => !!x))];
  if (jobIds.length) {
    const { data: jobs } = await db.from("jobs").select("id, status, input_path, output_path").in("id", jobIds).eq("user_id", userId);
    const porId = new Map((jobs ?? []).map((j) => [j.id, j]));
    for (const c of espec.cenas) {
      if (!c.jobId) continue;
      const j = porId.get(c.jobId);
      if (!j || j.status !== "concluido" || !j.output_path) return NextResponse.json({ error: "Uma das fotos escolhidas não está pronta ou não é sua." }, { status: 400 });
      if (c.tipo === "antes_depois" && !j.input_path) return NextResponse.json({ error: "Uma das fotos não tem a original guardada pra fazer antes e depois." }, { status: 400 });
    }
  }
  for (const c of espec.cenas) {
    if (c.arquivo && !c.arquivo.startsWith(`uploads/${userId}/`)) return NextResponse.json({ error: "Arquivo enviado não reconhecido." }, { status: 400 });
  }

  const custo = custoDoVideo(espec);
  const saldoAntes = await saldoFal(falKey);
  const conta = await contaDe(db, userId);

  const { data: video, error: erroInsert } = await db
    .from("videos")
    .insert({
      user_id: userId,
      org_id: conta.tipo === "org" ? conta.id : null,
      property_id: imovelId,
      titulo: espec.titulo || null,
      formato: espec.formato,
      status: "gerando",
      espec,
      pipeline: pipelineInicial(saldoAntes),
      creditos_cobrados: custo,
    })
    .select("id")
    .single();
  if (erroInsert || !video) return NextResponse.json({ error: `Erro criando o vídeo: ${erroInsert?.message}` }, { status: 500 });

  let saldo: number | null;
  try {
    saldo = await debitar(db, conta, userId, custo, "video", video.id);
  } catch (e) {
    await db.from("videos").delete().eq("id", video.id);
    return NextResponse.json({ error: `Erro debitando créditos: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (saldo === null) {
    await db.from("videos").delete().eq("id", video.id);
    return NextResponse.json({ error: `Este vídeo custa ${custo} ${custo === 1 ? "crédito" : "créditos"} e ${conta.tipo === "org" ? "a imobiliária" : "você"} não tem saldo suficiente.` }, { status: 402 });
  }
  if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);

  return NextResponse.json({ videoId: video.id, custo, creditosRestantes: saldo, duracaoEstimada: duracaoEstimada(espec) });
}
