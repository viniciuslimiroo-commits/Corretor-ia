import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { apagarEntradas, assinar, caminhoResultado, guardarEAssinar } from "@/lib/armazenamento";
import {
  UPSCALER,
  consultar,
  corpoRequisicao,
  despachar,
  extrairImagem,
  resultado,
  type Provedor,
} from "@/lib/fal";
import { aplicarSelo, textoDoSelo } from "@/lib/selo";
import { ALVO_LARGURA_UPSCALE, saldoFal } from "@/lib/custo";
import { ACOES_COM_CHECAGEM_DE_IGUALDADE, pareceIgual } from "@/lib/comparar";
import { ACOES_POR_ID } from "@/lib/acoes";
import { avaliarResultado } from "@/lib/avaliador";
import { creditar } from "@/lib/cobranca";

// Job despachado que nunca volta prende o crédito do usuário pra sempre. 15 minutos é
// muito acima do pior caso medido (100s) e curto o bastante pra ninguém ficar preso a
// uma tarde. Quem varre é a própria consulta: não precisa de rotina agendada pra
// resolver o caso comum, que é o usuário olhando a tela.
const MINUTOS_ATE_DESISTIR = 15;

// ACOMPANHANTE. Cada chamada avança NO MÁXIMO uma etapa e volta -- nunca fica esperando
// a IA. É isso que mantém toda requisição curta, em qualquer plano de hospedagem.
//
// Etapas: geracao -> upscale -> concluido. O upscale é opcional e pode ser pulado.
//
// A etapa mais cara é a última (baixar o resultado em 4096px, carimbar o selo e guardar),
// e ela é trabalho local de segundos. 60s de teto é folga grande e cabe no plano Hobby.
export const maxDuration = 60;

type Pipeline = {
  etapa: "geracao" | "upscale";
  modelo: Provedor;
  tentouFallback: boolean;
  semUpscale: boolean;
  statusUrl: string;
  responseUrl: string;
  entradas: string[];
  urlFoto: string;
  urlMascara: string | null;
  urlReferencia?: string | null;
  /** [primário, fallback] escolhidos no despacho (mudam se houve máscara). */
  provedores?: [Provedor, Provedor] | [string, string];
  /** Prompt já montado pelo catálogo, reaproveitado no fallback. */
  prompt?: string;
  urlGerada?: string;
  upscaled?: boolean;
  aviso?: string | null;
  saldoAntes?: number | null;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const falKey = process.env.FAL_KEY;
  const db = supabaseServer();
  if (!falKey || !db) {
    return NextResponse.json({ error: "Servidor sem FAL_KEY ou service role key." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const userId = userData.user.id;

  // O filtro por user_id é o que impede alguém de acompanhar (ou finalizar) o job de
  // outro trocando o id na URL. O service role ignora RLS, então a checagem é explícita.
  const { data: job, error: erroJob } = await db
    .from("jobs")
    .select("id, tipo, status, output_path, input_path, selo, pipeline, criado_em, property_id, org_id, parametros")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (erroJob || !job) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }
  // O crédito volta pra conta de onde saiu: a imobiliária, se o job nasceu nela.
  const contaDoJob = job.org_id ? { tipo: "org" as const, id: job.org_id as string } : { tipo: "user" as const, id: userId };

  if (job.status === "concluido" && job.output_path) {
    // Reassina em vez de devolver a URL antiga: a assinatura anterior pode ter vencido
    // enquanto a aba ficou aberta, e uma imagem quebrada na tela parece bug do produto.
    return NextResponse.json({
      jobId: job.id,
      status: "concluido",
      url: await assinar(db, job.output_path),
      selo: job.selo,
      imovelId: job.property_id,
    });
  }
  if (job.status === "falhou" || job.status === "sem_credito") {
    return NextResponse.json(
      { jobId: job.id, status: job.status, error: "Esta geração não foi concluída." },
      { status: 409 }
    );
  }

  const p = job.pipeline as Pipeline | null;
  if (!p) {
    return NextResponse.json({ jobId: job.id, status: job.status ?? "gerando" });
  }

  async function falhar(mensagem: string) {
    await creditar(db!, contaDoJob, userId, 1, "estorno_falha", id).catch(() => null);
    await db!.from("jobs").update({ status: "falhou", input_path: null }).eq("id", id);
    // Job que falhou não tem "depois", então a original também não tem por que ficar.
    await apagarEntradas(db!, [...(p!.entradas ?? []), ...(job!.input_path ? [job!.input_path] : [])]);
    return NextResponse.json({ jobId: id, status: "falhou", error: mensagem }, { status: 502 });
  }

  async function finalizar(urlImagem: string, pipeline: Pipeline) {
    const resp = await fetch(urlImagem);
    if (!resp.ok) return falhar(`Não consegui baixar o resultado (${resp.status}).`);
    const bytesCrus = Buffer.from(await resp.arrayBuffer());

    // O selo é queimado ANTES de guardar, de propósito: assim a única cópia que existe
    // já está carimbada. Carimbar só na hora do download deixaria a versão sem aviso
    // acessível por quem pegasse a URL assinada.
    const textoSelo = textoDoSelo(job!.tipo, job!.selo);
    const bytesFinais = await aplicarSelo(bytesCrus, textoSelo);
    const dim = await sharp(bytesFinais).metadata();

    const caminho = caminhoResultado(userId, id);
    const urlAssinada = await guardarEAssinar(db!, caminho, bytesFinais, "image/jpeg");

    // Custo REAL do job: o quanto o saldo do fal andou entre o despacho e agora. É o
    // número que estava faltando pra decidir preço de assinatura sem chutar.
    const saldoDepois = await saldoFal(falKey!);
    const custo =
      pipeline.saldoAntes != null && saldoDepois != null
        ? Math.max(0, Number((pipeline.saldoAntes - saldoDepois).toFixed(4)))
        : null;

    await db!
      .from("jobs")
      .update({
        status: "concluido",
        output_path: caminho,
        output_url: null,
        selo: textoSelo,
        creditos_cobrados: 1,
        custo_real: custo,
        pipeline: {
          ...pipeline,
          etapa: "concluido",
          saldoDepois,
          megapixelsEntregues: Number((((dim.width ?? 0) * (dim.height ?? 0)) / 1_000_000).toFixed(2)),
        },
      })
      .eq("id", id);

    await apagarEntradas(db!, pipeline.entradas ?? []);

    return NextResponse.json({
      jobId: id,
      status: "concluido",
      url: urlAssinada,
      width: dim.width,
      height: dim.height,
      modelo: pipeline.modelo,
      upscaled: pipeline.upscaled ?? false,
      selo: textoSelo,
      aviso: pipeline.aviso ?? null,
    });
  }

  // Desistência por tempo: um despacho que nunca volta deixaria o crédito preso e a
  // tela girando pra sempre. Aqui o crédito volta e o usuário fica sabendo.
  const minutosRodando = (Date.now() - new Date(job.criado_em).getTime()) / 60000;
  if (minutosRodando > MINUTOS_ATE_DESISTIR) {
    return falhar(
      `A geração passou de ${MINUTOS_ATE_DESISTIR} minutos sem terminar e foi cancelada. Seu crédito voltou.`
    );
  }

  /**
   * Troca pro segundo provedor e devolve a resposta, ou null se não houver pra onde ir.
   *
   * Serve às DUAS formas de falhar: a fila devolveu erro, ou a fila devolveu 200 com
   * uma imagem imprestável. O tratamento é o mesmo -- tenta o outro modelo -- e por
   * isso mora num lugar só.
   */
  async function tentarFallback(motivoDoAviso: string) {
    const provedores = p!.provedores;
    if (p!.tentouFallback || !provedores || provedores[0] === provedores[1]) return null;
    const [primario, secundario] = provedores as [Provedor, Provedor];
    const novo = await despachar(
      secundario,
      corpoRequisicao(secundario, {
        prompt: p!.prompt ?? "",
        imagemUrl: p!.urlFoto,
        mascaraUrl: p!.urlMascara ?? undefined,
        referenciaUrl: p!.urlReferencia ?? undefined,
      }),
      falKey!
    );
    await db!
      .from("jobs")
      .update({
        status: "gerando",
        pipeline: {
          ...p,
          etapa: "geracao",
          modelo: secundario,
          tentouFallback: true,
          statusUrl: novo.status_url,
          responseUrl: novo.response_url,
          aviso: `${primario} ${motivoDoAviso}, usamos ${secundario} no lugar.`,
        },
      })
      .eq("id", id);
    return NextResponse.json({ jobId: id, status: "gerando", trocouProvedor: true });
  }

  const estado = await consultar(p.statusUrl, falKey);

  // ---------- etapa: geração ----------
  if (p.etapa === "geracao") {
    if (estado.estado === "esperando") {
      return NextResponse.json({ jobId: id, status: "gerando", posicaoNaFila: estado.posicao });
    }

    if (estado.estado === "erro") {
      // Fallback entre provedores, preservado da versão síncrona -- e só possível
      // porque as entradas ficam no storage, em vez de morrerem com a requisição.
      try {
        const trocou = await tentarFallback("falhou");
        if (trocou) return trocou;
      } catch (e) {
        return falhar(
          `Os dois provedores falharam (crédito devolvido). ${estado.mensagem} | ${
            e instanceof Error ? e.message : e
          }`
        );
      }
      return falhar(`A geração falhou (crédito devolvido). ${estado.mensagem}`);
    }

    // pronto -- ou quase: a fila diz COMPLETED e a resposta vem 422 quando o filtro de
    // conteúdo do modelo recusou o prompt (aconteceu com "tirar bagunça" no Nano Banana,
    // 12/09/2026). É falha do provedor como qualquer outra: tenta o segundo antes de
    // devolver o crédito.
    let imagem;
    try {
      imagem = extrairImagem(await resultado(p.responseUrl, falKey));
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Resposta do modelo ilegível.";
      try {
        const trocou = await tentarFallback("recusou o pedido");
        if (trocou) return trocou;
      } catch {
        // cai no falhar abaixo
      }
      return falhar(`A geração falhou (crédito devolvido). ${mensagem}`);
    }

    // Baixa uma vez só: os mesmos bytes servem pra checar "voltou igual?" e pra medir a
    // largura real quando o modelo não informa.
    const bytesSaida = Buffer.from(await (await fetch(imagem.url)).arrayBuffer());

    // A falha que não se parece com falha: a chamada devolve 200, o crédito é debitado,
    // e o corretor recebe de volta a foto que ele mesmo subiu. Aconteceu de verdade com
    // o Nano Banana no "esvaziar". Limiar calibrado em @/lib/comparar.
    // Com máscara a mudança é LOCAL (mobília só na área pintada) e a medida global fica
    // abaixo do limiar mesmo quando o modelo acertou -- aconteceu no primeiro teste do
    // "mobiliar só onde eu pintar": o fill trabalhou certo e foi descartado por isso.
    // Sem máscara a checagem continua valendo.
    if (ACOES_COM_CHECAGEM_DE_IGUALDADE.has(job.tipo) && !p.urlMascara) {
      const bytesEntrada = Buffer.from(await (await fetch(p.urlFoto)).arrayBuffer());
      if (await pareceIgual(job.tipo, bytesEntrada, bytesSaida)) {
        // Medir pixel diz "mudou pouco", não "está errado": esvaziar uma varanda quase
        // vazia muda pouco e ACERTA. Na bateria de 12/09/2026 um esvaziar bom foi
        // descartado assim, dos dois modelos -- é a terceira vez que essa medida global
        // erra (ver observação 0012). Antes de descartar, um modelo de visão olha as
        // duas imagens e diz se o pedido foi cumprido; só descarta se ele confirmar.
        const acaoDef = ACOES_POR_ID[job.tipo];
        let confirmouIgual = true;
        if (acaoDef) {
          const veredito = await avaliarResultado({
            falKey,
            acao: acaoDef,
            parametros: (job.parametros ?? {}) as Record<string, string>,
            usouMascara: false,
            relato: "A imagem parece não ter mudado quase nada em relação à original.",
            urlAntes: p.urlFoto,
            urlDepois: imagem.url,
          }).catch(() => null);
          // "ok" = o avaliador viu a mudança pedida: o resultado presta, segue.
          if (veredito?.veredito === "ok") confirmouIgual = false;
        }
        if (confirmouIgual) {
          try {
            const trocou = await tentarFallback("devolveu a foto quase sem alteração");
            if (trocou) return trocou;
          } catch {
            // cai no falhar abaixo
          }
          return falhar(
            "Os dois modelos devolveram a sua foto praticamente sem alteração, então seu crédito voltou. Costuma acontecer quando a foto não tem o que a ação pede (por exemplo, esvaziar um cômodo que já está vazio)."
          );
        }
      }
    }

    if (p.semUpscale) return finalizar(imagem.url, { ...p, upscaled: false });

    // Largura real: nem todo modelo devolve `width`, e o fator do upscale depende dela.
    // Quando falta, meço com o sharp em vez de chutar.
    const largura = imagem.width ?? (await sharp(bytesSaida).metadata()).width ?? 1024;
    const fator = Math.min(Math.max(ALVO_LARGURA_UPSCALE / largura, 1), 4);

    try {
      const up = await despachar(UPSCALER, { image_url: imagem.url, upscale_factor: fator }, falKey);
      await db.from("jobs").update({
        status: "upscaling",
        pipeline: {
          ...p,
          etapa: "upscale",
          urlGerada: imagem.url,
          statusUrl: up.status_url,
          responseUrl: up.response_url,
        },
      }).eq("id", id);
      return NextResponse.json({ jobId: id, status: "upscaling" });
    } catch {
      // Upscale é bônus: se nem despachar deu, entrega o que já tem em vez de dar erro.
      return finalizar(imagem.url, { ...p, upscaled: false });
    }
  }

  // ---------- etapa: upscale ----------
  if (estado.estado === "esperando") {
    return NextResponse.json({ jobId: id, status: "upscaling", posicaoNaFila: estado.posicao });
  }
  if (estado.estado === "erro") {
    // Bônus que falhou não estraga o pedido: entrega a imagem sem upscale.
    return finalizar(p.urlGerada!, { ...p, upscaled: false });
  }
  try {
    const imagem = extrairImagem(await resultado(p.responseUrl, falKey));
    return finalizar(imagem.url, { ...p, upscaled: true });
  } catch {
    return finalizar(p.urlGerada!, { ...p, upscaled: false });
  }
}

/**
 * Move a geração pra um imóvel (ou tira dela, com `imovelId: null`). Fase B: a pessoa
 * pode gerar primeiro e organizar depois, sem ter que decidir o projeto antes da foto.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const corpo = await req.json().catch(() => ({}));
  const mudaImovel = "imovelId" in corpo;
  const mudaFavorito = typeof corpo.favorito === "boolean";
  if (!mudaImovel && !mudaFavorito) return NextResponse.json({ error: "Nada pra alterar." }, { status: 400 });
  const imovelId: string | null = typeof corpo.imovelId === "string" && corpo.imovelId ? corpo.imovelId : null;

  if (mudaImovel && imovelId) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", imovelId).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  }

  const mudancas: { property_id?: string | null; favorito?: boolean } = {};
  if (mudaImovel) mudancas.property_id = imovelId;
  if (mudaFavorito) mudancas.favorito = corpo.favorito; // migração 16
  const { data: alterado, error: erroUpdate } = await db
    .from("jobs")
    .update(mudancas)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, property_id, favorito");
  if (erroUpdate) return NextResponse.json({ error: `Não consegui alterar: ${erroUpdate.message}` }, { status: 500 });
  if (!alterado || alterado.length === 0) return NextResponse.json({ error: "Geração não encontrada." }, { status: 404 });
  if (mudaImovel && imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);

  return NextResponse.json({ jobId: id, imovelId: alterado[0].property_id ?? null, favorito: !!alterado[0].favorito });
}
