import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  avancarVideo,
  desistirDoVideo,
  MINUTOS_ATE_DESISTIR,
  MINUTOS_DE_TRAVA,
  type LinhaVideo,
  type PipelineVideo,
} from "@/lib/video-pipeline";
import type { EspecVideo } from "@/lib/video";

// O VÍDEO TERMINA MESMO COM O NAVEGADOR FECHADO.
//
// Até aqui, quem empurrava o pipeline era a tela: cada consulta avançava uma etapa. Quem
// fechasse o navegador no meio -- num tour de 11 cenas isso leva minutos -- deixava o vídeo
// parado em "gerando" PARA SEMPRE, com os créditos presos. O comentário da própria rota
// dizia: "sem ninguém consultar, ele fica parado pra sempre e o crédito não volta". Existia
// o botão Retomar, mas ele exige que a pessoa volte, entenda que travou e clique.
//
// Com um usuário testando isso é um aborrecimento. Com clientes de verdade é suporte diário,
// e do tipo pior: o cliente acha que pagou e não recebeu.
//
// Este cron faz as duas coisas que ninguém estava fazendo:
//
//   1. EMPURRA os vídeos que ficaram parados, até terminarem;
//   2. DESISTE dos que passaram do prazo, devolvendo o crédito -- que antes só acontecia
//      se alguém abrisse a página do vídeo encalhado.
//
// Não atrapalha quem está com a tela aberta: usa a MESMA trava da rota (`lock_ate`), então
// só um trabalha num vídeo por vez. Se o cron pegar um vídeo que a pessoa está acompanhando,
// o trabalho é o mesmo e acontece uma vez só; a tela dela continua lendo o progresso que o
// cron grava.

export const maxDuration = 300;

/** Quanto tempo esta chamada trabalha antes de devolver, com folga pro teto de 300 s. */
const SEGUNDOS_DE_TRABALHO = 240;

/**
 * Quantos vídeos encalhados uma rodada atende.
 *
 * Dois, e não vinte: cada um pode comer os 240 s inteiros, e é melhor terminar dois de
 * verdade do que começar vinte e não acabar nenhum. O que sobrar fica pra próxima rodada --
 * eles não vão a lugar nenhum.
 */
const QUANTOS_POR_VEZ = 2;

/** Pausa entre tentativas quando a etapa não andou (a cena está na fila do fal). */
const PAUSA_MS = 5000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const inicio = Date.now();
  const agora = new Date();

  // Os mais VELHOS primeiro: são os que estão mais perto do prazo de desistir, e são os que
  // têm crédito preso há mais tempo.
  const { data: parados, error } = await db
    .from("videos")
    .select("id, user_id, org_id, espec, pipeline, formato, criado_em, creditos_cobrados")
    .eq("status", "gerando")
    .or(`lock_ate.is.null,lock_ate.lt.${agora.toISOString()}`)
    .order("criado_em", { ascending: true })
    .limit(QUANTOS_POR_VEZ);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const relatorio: { id: string; etapas: number; fim: string }[] = [];

  for (const v of parados ?? []) {
    const espec = v.espec as EspecVideo;
    let pipeline = v.pipeline as PipelineVideo | null;
    const minutos = (Date.now() - new Date(v.criado_em as string).getTime()) / 60000;

    // Em `finalizar` o vídeo já está montado e guardado: falta a capa e marcar como pronto.
    // Desistir ali jogaria fora um vídeo feito -- então termina, mesmo atrasado. É a mesma
    // regra da rota, e por isso ela mora junto da constante.
    if (minutos > MINUTOS_ATE_DESISTIR && pipeline?.etapa !== "finalizar") {
      const cancelou = await desistirDoVideo(
        db,
        { id: v.id as string, user_id: v.user_id as string, org_id: (v.org_id as string | null) ?? null, creditos_cobrados: v.creditos_cobrados as number | null },
        pipeline,
        `O vídeo passou de ${MINUTOS_ATE_DESISTIR} minutos sem terminar e foi cancelado. Seus créditos voltaram.`
      );
      relatorio.push({ id: v.id as string, etapas: 0, fim: cancelou ? "desistiu e estornou" : "outro terminou antes" });
      continue;
    }

    // A trava desta rodada. Pegar com condição (`lock_ate` vencida ou nula) é o que impede
    // duas chamadas de trabalharem no mesmo vídeo -- inclusive esta e a tela da pessoa.
    const minhaTrava = new Date(Date.now() + MINUTOS_DE_TRAVA * 60000).toISOString();
    const { data: travado } = await db
      .from("videos")
      .update({ lock_ate: minhaTrava })
      .eq("id", v.id)
      .eq("status", "gerando")
      .or(`lock_ate.is.null,lock_ate.lt.${new Date().toISOString()}`)
      .select("id");
    if (!travado || travado.length === 0) {
      relatorio.push({ id: v.id as string, etapas: 0, fim: "alguém já estava trabalhando nele" });
      continue;
    }

    let etapas = 0;
    let fim = "ainda gerando";
    let marcaAnterior = "";
    try {
      while (Date.now() - inicio < SEGUNDOS_DE_TRABALHO * 1000) {
        const prog = await avancarVideo(db, falKey, {
          id: v.id as string,
          user_id: v.user_id as string,
          org_id: (v.org_id as string | null) ?? null,
          espec,
          pipeline,
          formato: v.formato as string,
        } as LinhaVideo);
        etapas++;
        if (prog.etapa === "concluido") {
          fim = "terminou";
          break;
        }
        // Etapa que não andou quer dizer "a cena ainda está na fila do fal". Insistir sem
        // pausa só martelaria a consulta de status -- a espera é do outro lado.
        const marca = `${prog.etapa}:${prog.feitas}`;
        if (marca === marcaAnterior) await esperar(PAUSA_MS);
        marcaAnterior = marca;

        // Relê o pipeline: `avancarVideo` gravou o avanço no banco, e seguir com a cópia
        // velha faria a próxima volta refazer a etapa que acabou de sair.
        const { data: fresco } = await db.from("videos").select("pipeline, status").eq("id", v.id).maybeSingle();
        if (!fresco || fresco.status !== "gerando") {
          fim = fresco?.status === "concluido" ? "terminou" : `saiu como ${fresco?.status ?? "sumiu"}`;
          break;
        }
        pipeline = fresco.pipeline as PipelineVideo | null;
      }
    } catch (e) {
      // Falhou de verdade: cancela e devolve o crédito, igual à rota. Um vídeo que estoura
      // e fica "gerando" é o mesmo problema que este cron existe pra resolver.
      const cancelou = await desistirDoVideo(
        db,
        { id: v.id as string, user_id: v.user_id as string, org_id: (v.org_id as string | null) ?? null, creditos_cobrados: v.creditos_cobrados as number | null },
        pipeline,
        `A montagem falhou: ${e instanceof Error ? e.message.slice(0, 300) : "erro"}. Seus créditos voltaram.`
      );
      fim = cancelou ? "falhou e estornou" : "falhou, outro já tinha terminado";
    } finally {
      // Solta só a PRÓPRIA trava: se esta chamada passou do tempo e outra já pegou a vez,
      // soltar a dela deixaria uma terceira entrar junto.
      await db.from("videos").update({ lock_ate: null }).eq("id", v.id).eq("lock_ate", minhaTrava);
    }
    relatorio.push({ id: v.id as string, etapas, fim });
  }

  return NextResponse.json({
    agora: agora.toISOString(),
    encalhados: parados?.length ?? 0,
    atendidos: relatorio,
    segundos: Number(((Date.now() - inicio) / 1000).toFixed(1)),
  });
}
