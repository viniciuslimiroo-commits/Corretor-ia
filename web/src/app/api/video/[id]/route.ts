import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar, apagarEntradas } from "@/lib/armazenamento";
import { animacoesGuardadas, avancarVideo, desistirDoVideo, limparTemporarios, MINUTOS_ATE_DESISTIR, MINUTOS_DE_TRAVA, progressoDe, type LinhaVideo, type PipelineVideo } from "@/lib/video-pipeline";
import { duracaoDaCena, type EspecVideo } from "@/lib/video";
import { rotuloDoTipo } from "@/lib/acoes";

// Acompanha (e faz andar) um vídeo. Cada GET avança no máximo uma etapa. A etapa pode
// levar dezenas de segundos (a montagem, mais), então a função tem 300s e existe uma
// TRAVA: só uma chamada por vez trabalha no mesmo vídeo; as outras só leem o status.
// Sem a trava, a tela consultando a cada 3s dispararia a mesma etapa várias vezes.
export const maxDuration = 300;

// MINUTOS_DE_TRAVA e MINUTOS_ATE_DESISTIR moram em lib/video-pipeline.ts: o cron que
// desencalha vídeo abandonado (api/cron/videos-parados) usa os MESMOS números, e dois
// lugares com cópias próprias acabariam discordando sobre quando desistir.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const { data: video, error: erroLeitura } = await db
    .from("videos")
    .select("id, user_id, org_id, status, espec, pipeline, formato, titulo, output_path, thumb_path, duracao_segundos, share_token, erro, criado_em, creditos_cobrados, property_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  // Erro de leitura NÃO é "não existe": devolve 503 pra tela tentar de novo. Um 404
  // aqui fez a tela desistir de um vídeo que estava andando (12/09/2026).
  if (erroLeitura) return NextResponse.json({ error: `Instabilidade ao ler o vídeo: ${erroLeitura.message}` }, { status: 503 });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });

  const pipeline = video.pipeline as PipelineVideo | null;
  const espec = video.espec as EspecVideo;

  /**
   * A resposta de vídeo pronto: o arquivo, o espec e o que a tela precisa pra reabrir
   * cada cena (miniatura assinada, rótulo, se tem "antes"). É o que faz o botão Editar
   * funcionar -- o vídeo já era não-destrutivo, só faltava devolver o espec.
   *
   * É uma função porque existem DOIS caminhos que terminam em "concluído": abrir um
   * vídeo que já estava pronto, e a chamada que justamente terminou de montá-lo. Eram
   * duas respostas escritas à mão, e só uma delas mandava o espec -- quem acabou de
   * gerar recebia menos do que quem voltava depois.
   */
  async function respostaPronta(saida: string, thumb: string | null, duracao: number | null, pronto: PipelineVideo | null) {
    const avisos = pronto?.avisos ?? [];
    const jobIds = [...new Set(espec.cenas.map((c) => c.jobId).filter((x): x is string => !!x))];
    const { data: jobs } = jobIds.length ? await db.from("jobs").select("id, tipo, input_path, output_path").in("id", jobIds).eq("user_id", userId) : { data: [] as { id: string; tipo: string; input_path: string | null; output_path: string | null }[] };
    const porId = new Map((jobs ?? []).map((j) => [j.id, j]));
    const guardadas = await animacoesGuardadas(db, userId, espec).catch(() => espec.cenas.map(() => false));
    const cenas = await Promise.all(
      espec.cenas.map(async (c, i) => {
        const j = c.jobId ? porId.get(c.jobId) : undefined;
        const ehClipe = c.tipo === "clipe" || /\.(mp4|mov)$/i.test(c.arquivo ?? "");
        const fonte = j?.output_path ?? c.arquivo ?? null;
        // Clipe que é um vídeo do Encena: a miniatura dele mora ao lado (mesmo nome, .jpg).
        const deVideoPronto = ehClipe && !!c.arquivo && /\/videos\/[0-9a-f-]{36}\.mp4$/.test(c.arquivo);
        return {
          miniatura: fonte && !ehClipe ? await assinar(db, fonte).catch(() => null) : deVideoPronto ? await assinar(db, c.arquivo!.replace(/\.mp4$/, ".jpg")).catch(() => null) : null,
          // O arquivo do clipe, tocável: o palco mostra o vídeo de verdade ao reabrir.
          clipeUrl: ehClipe && c.arquivo ? await assinar(db, c.arquivo).catch(() => null) : null,
          rotulo: j ? rotuloDoTipo(j.tipo) : deVideoPronto ? "Vídeo do Encena" : ehClipe ? "Clipe enviado" : c.tipo === "tour360" ? "Foto 360 enviada" : "Foto enviada",
          temAntes: !!j?.input_path,
          ehClipe,
          // Se o clipe animado existe, gerar de novo com o mesmo movimento e duração é grátis.
          animacaoGuardada: guardadas[i] ? { animacao: c.animacao ?? "caminhar", duracao: duracaoDaCena(c) } : null,
        };
      })
    );
    return NextResponse.json({
      videoId: id,
      status: "concluido",
      url: await assinar(db, saida),
      // O caminho do arquivo pronto: é o que o editor manda de volta pra usar ESTE vídeo como
      // clipe de outro (pedido-video.ts confere que é dela e que existe).
      arquivo: saida,
      miniatura: thumb ? await assinar(db, thumb).catch(() => null) : null,
      duracao,
      titulo: video!.titulo,
      formato: video!.formato,
      avisos,
      compartilhado: !!video!.share_token,
      espec,
      edicao: {
        imovelId: (video!.property_id as string | null) ?? null,
        cenas,
        // O arquivo da voz: o que a pessoa enviou/gravou, ou o que a IA gerou nesta
        // montagem. Serve pra tocar na tela e pra transcrever em legendas depois -- é o
        // que faz "gerar legendas" funcionar também para quem usou a voz de IA.
        vozArquivo: espec.narracao?.arquivo ?? pronto?.narracaoPath ?? null,
        vozUrl: await (async () => {
          const caminho = espec.narracao?.arquivo ?? pronto?.narracaoPath;
          return caminho ? assinar(db, caminho).catch(() => null) : null;
        })(),
        apresentadorUrl: espec.apresentador?.arquivo ? await assinar(db, espec.apresentador.arquivo).catch(() => null) : null,
      },
    });
  }

  if (video.status === "concluido" && video.output_path) {
    return respostaPronta(video.output_path, video.thumb_path, video.duracao_segundos, pipeline);
  }
  if (video.status === "falhou") {
    return NextResponse.json({ videoId: id, status: "falhou", error: video.erro ?? "Este vídeo não foi concluído." }, { status: 409 });
  }


  async function falhar(mensagem: string) {
    const cancelou = await desistirDoVideo(db, { id, user_id: userId, org_id: (video!.org_id as string | null) ?? null, creditos_cobrados: video!.creditos_cobrados }, pipeline, mensagem);
    if (!cancelou) {
      return NextResponse.json({ videoId: id, status: "gerando", mensagem: "Conferindo o vídeo…", trabalhando: true });
    }
    return NextResponse.json({ videoId: id, status: "falhou", error: mensagem }, { status: 502 });
  }

  // ---- trava ----
  // ANTES do corte por tempo: sem ela, uma consulta de outra aba cancelava (e apagava) o
  // vídeo enquanto a chamada que tem a trava ainda estava terminando.
  const agora = new Date();
  const minhaTrava = new Date(agora.getTime() + MINUTOS_DE_TRAVA * 60000).toISOString();
  const { data: travado } = await db
    .from("videos")
    .update({ lock_ate: minhaTrava })
    .eq("id", id)
    .or(`lock_ate.is.null,lock_ate.lt.${agora.toISOString()}`)
    .select("id");
  if (!travado || travado.length === 0) {
    const prog = pipeline ? progressoDe(espec, pipeline) : { etapa: "cena", feitas: 0, total: 1, mensagem: "Preparando…" };
    return NextResponse.json({ videoId: id, status: "gerando", ...prog, trabalhando: true });
  }

  const minutos = (Date.now() - new Date(video.criado_em).getTime()) / 60000;
  // Em `finalizar` o vídeo já está montado e guardado: falta capa e marcar como pronto.
  // Cancelar ali estornaria e apagaria um vídeo feito -- então termina, mesmo atrasado.
  if (minutos > MINUTOS_ATE_DESISTIR && pipeline?.etapa !== "finalizar") {
    return falhar(`O vídeo passou de ${MINUTOS_ATE_DESISTIR} minutos sem terminar e foi cancelado. Seus créditos voltaram.`);
  }

  try {
    const prog = await avancarVideo(db, falKey, { id: video.id, user_id: video.user_id, org_id: video.org_id ?? null, espec, pipeline, formato: video.formato } as LinhaVideo);
    if (prog.etapa === "concluido") {
      const { data: pronto } = await db.from("videos").select("output_path, thumb_path, duracao_segundos, pipeline").eq("id", id).single();
      if (!pronto?.output_path) return NextResponse.json({ error: "O vídeo terminou sem arquivo." }, { status: 500 });
      return respostaPronta(pronto.output_path, pronto.thumb_path, pronto.duracao_segundos, pronto.pipeline as PipelineVideo | null);
    }
    return NextResponse.json({ videoId: id, status: "gerando", ...prog });
  } catch (e) {
    return falhar(`A montagem falhou: ${e instanceof Error ? e.message.slice(0, 300) : "erro"}. Seus créditos voltaram.`);
  } finally {
    // Solta só a PRÓPRIA trava: se esta chamada passou do tempo e outra já pegou a vez,
    // soltar a dela deixaria uma terceira entrar junto.
    await db.from("videos").update({ lock_ate: null }).eq("id", id).eq("lock_ate", minhaTrava);
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
