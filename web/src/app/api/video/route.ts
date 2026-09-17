import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { saldoFal } from "@/lib/custo";
import { CREDITOS, custoDoVideo, duracaoEstimada } from "@/lib/video";
import { animacoesGuardadas, pipelineInicial } from "@/lib/video-pipeline";
import { contaDe, debitar } from "@/lib/cobranca";
import { prepararPedidoDeVideo } from "@/lib/pedido-video";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";

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
    .select("id, titulo, formato, status, criado_em, concluido_em, duracao_segundos, thumb_path, share_token, property_id, creditos_cobrados, erro, properties!videos_property_id_fkey(titulo)")
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
  // Sanear, conferir dono de tudo e conferir a voz de IA reaproveitada: lib/pedido-video.ts,
  // onde dá pra testar sem banco. Aqui só o que precisa do banco de verdade.
  const pedido = await prepararPedidoDeVideo(corpo, userId, {
    jobsDoUsuario: async (ids) => {
      const { data } = await db.from("jobs").select("id, status, input_path, output_path").in("id", ids).eq("user_id", userId);
      return data ?? [];
    },
    existeNoBucket: async (pasta, nome) => {
      const { data } = await db.storage.from(BUCKET_RESULTADOS).list(pasta, { limit: 1, search: nome });
      return !!data?.some((f) => f.name === nome);
    },
  });
  if (!pedido.ok) return NextResponse.json({ error: pedido.error, ...(pedido.codigo ? { codigo: pedido.codigo } : {}) }, { status: pedido.status });
  const { espec, avisos, resumo } = pedido;

  let imovelId: string | null = null;
  if (typeof corpo?.imovelId === "string" && corpo.imovelId) {
    const { data: imovel } = await db.from("properties").select("id, titulo, endereco").eq("id", corpo.imovelId).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
    if (!espec.titulo) espec.titulo = (imovel.titulo ?? "").slice(0, 50);
  }

  // Cena animada cujo clipe já existe (o vídeo está sendo editado e essa cena não mudou)
  // não é cobrada de novo. Decidido aqui, junto com a cobrança, e gravado no pipeline
  // pra ele reaproveitar exatamente essas -- e não outras.
  const guardadas = await animacoesGuardadas(db, userId, espec);
  const animadasGratis = guardadas.flatMap((g, i) => (g ? [i] : []));
  const custo = Math.max(0, custoDoVideo(espec) - animadasGratis.length * CREDITOS.animada);
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
      pipeline: pipelineInicial(saldoAntes, animadasGratis, { avisos, resumoEdicao: resumo }),
      creditos_cobrados: custo,
    })
    .select("id")
    .single();
  if (erroInsert || !video) return NextResponse.json({ error: `Erro criando o vídeo: ${erroInsert?.message}` }, { status: 500 });

  // Vídeo sem IA não custa crédito: só cena animada e narração debitam.
  let saldo: number | null = conta.creditos;
  if (custo > 0) {
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
  }
  if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);

  // `avisos`: o que o saneamento tirou do pedido (trecho de áudio fora do vídeo, voz sem
  // trecho na linha do tempo). A tela mostra como recado; o vídeo sai do mesmo jeito.
  return NextResponse.json({ videoId: video.id, custo, creditosRestantes: saldo, duracaoEstimada: duracaoEstimada(espec), avisos });
}
