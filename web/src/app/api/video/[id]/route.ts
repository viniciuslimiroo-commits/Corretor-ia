import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar, apagarEntradas } from "@/lib/armazenamento";
import { avancarVideo, limparTemporarios, progressoDe, type LinhaVideo, type PipelineVideo } from "@/lib/video-pipeline";
import type { EspecVideo } from "@/lib/video";

// Acompanha (e faz andar) um vídeo. Cada GET avança no máximo uma etapa. A etapa pode
// levar dezenas de segundos (a montagem, mais), então a função tem 300s e existe uma
// TRAVA: só uma chamada por vez trabalha no mesmo vídeo; as outras só leem o status.
// Sem a trava, a tela consultando a cada 3s dispararia a mesma etapa várias vezes.
export const maxDuration = 300;

const MINUTOS_DE_TRAVA = 4;
const MINUTOS_ATE_DESISTIR = 25;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const { data: video, error: erroLeitura } = await db
    .from("videos")
    .select("id, user_id, status, espec, pipeline, formato, titulo, output_path, thumb_path, duracao_segundos, share_token, erro, criado_em, creditos_cobrados")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  // Erro de leitura NÃO é "não existe": devolve 503 pra tela tentar de novo. Um 404
  // aqui fez a tela desistir de um vídeo que estava andando (12/09/2026).
  if (erroLeitura) return NextResponse.json({ error: `Instabilidade ao ler o vídeo: ${erroLeitura.message}` }, { status: 503 });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });

  const pipeline = video.pipeline as PipelineVideo | null;
  const espec = video.espec as EspecVideo;

  if (video.status === "concluido" && video.output_path) {
    return NextResponse.json({
      videoId: id,
      status: "concluido",
      url: await assinar(db, video.output_path),
      miniatura: video.thumb_path ? await assinar(db, video.thumb_path).catch(() => null) : null,
      duracao: video.duracao_segundos,
      titulo: video.titulo,
      formato: video.formato,
      avisos: pipeline?.avisos ?? [],
      compartilhado: !!video.share_token,
    });
  }
  if (video.status === "falhou") {
    return NextResponse.json({ videoId: id, status: "falhou", error: video.erro ?? "Este vídeo não foi concluído." }, { status: 409 });
  }

  async function falhar(mensagem: string) {
    await db.rpc("adicionar_creditos", { p_user_id: userId, p_quantidade: video!.creditos_cobrados, p_motivo: "estorno_video", p_referencia: id });
    await db.from("videos").update({ status: "falhou", erro: mensagem, lock_ate: null }).eq("id", id);
    await limparTemporarios(db, pipeline);
    return NextResponse.json({ videoId: id, status: "falhou", error: mensagem }, { status: 502 });
  }

  const minutos = (Date.now() - new Date(video.criado_em).getTime()) / 60000;
  if (minutos > MINUTOS_ATE_DESISTIR) {
    return falhar(`O vídeo passou de ${MINUTOS_ATE_DESISTIR} minutos sem terminar e foi cancelado. Seus créditos voltaram.`);
  }

  // ---- trava ----
  const agora = new Date();
  const { data: travado } = await db
    .from("videos")
    .update({ lock_ate: new Date(agora.getTime() + MINUTOS_DE_TRAVA * 60000).toISOString() })
    .eq("id", id)
    .or(`lock_ate.is.null,lock_ate.lt.${agora.toISOString()}`)
    .select("id");
  if (!travado || travado.length === 0) {
    const prog = pipeline ? progressoDe(espec, pipeline) : { etapa: "cena", feitas: 0, total: 1, mensagem: "Preparando…" };
    return NextResponse.json({ videoId: id, status: "gerando", ...prog, trabalhando: true });
  }

  try {
    const prog = await avancarVideo(db, falKey, { id: video.id, user_id: video.user_id, espec, pipeline, formato: video.formato } as LinhaVideo);
    if (prog.etapa === "concluido") {
      const { data: pronto } = await db.from("videos").select("output_path, thumb_path, duracao_segundos, pipeline").eq("id", id).single();
      return NextResponse.json({
        videoId: id,
        status: "concluido",
        url: pronto?.output_path ? await assinar(db, pronto.output_path) : null,
        miniatura: pronto?.thumb_path ? await assinar(db, pronto.thumb_path).catch(() => null) : null,
        duracao: pronto?.duracao_segundos,
        titulo: video.titulo,
        formato: video.formato,
        avisos: (pronto?.pipeline as PipelineVideo | null)?.avisos ?? [],
        compartilhado: false,
      });
    }
    return NextResponse.json({ videoId: id, status: "gerando", ...prog });
  } catch (e) {
    return falhar(`A montagem falhou: ${e instanceof Error ? e.message.slice(0, 300) : "erro"}. Seus créditos voltaram.`);
  } finally {
    await db.from("videos").update({ lock_ate: null }).eq("id", id);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: video } = await db.from("videos").select("id, output_path, thumb_path, pipeline").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });

  const arquivos = [video.output_path, video.thumb_path].filter((x): x is string => !!x);
  await apagarEntradas(db, arquivos);
  await limparTemporarios(db, video.pipeline as PipelineVideo | null);
  await db.from("videos").delete().eq("id", id).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
