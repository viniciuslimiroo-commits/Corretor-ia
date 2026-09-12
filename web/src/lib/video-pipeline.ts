import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_RESULTADOS } from "./supabase-server";
import { assinar, apagarEntradas } from "./armazenamento";
import { chamarSincrono, consultar, despachar, extrairImagem, resultado } from "./fal";
import { rodarFfmpeg, sondarMidia } from "./ffmpeg";
import { saldoFal } from "./custo";
import { ANIMACOES, CREDITOS, FORMATOS_POR_ID, LIMITES, MUSICAS, VOZES, duracaoDaCena, type Cena, type EspecVideo } from "./video";
import {
  argsCenaAntesDepois,
  argsCenaClipe,
  argsCenaFoto,
  argsMiniatura,
  argsMontagem,
  argsTelaFinal,
  caminhoMiniatura,
  caminhoTemporario,
  caminhoVideoFinal,
} from "./video-ffmpeg";

// O ACOMPANHANTE do vídeo, no mesmo desenho de /api/job: cada chamada avança UMA etapa e
// volta. Etapas: cena (uma por foto/clipe; a animada tem despacho e espera), marca (tela
// final), narracao (TTS), montar (emenda tudo, música, carimbos), concluido.
//
// Entre uma chamada e outra nada sobrevive no disco da função, então cada clipe pronto
// sobe pro bucket em tmp/videos/{user}/{id}/ e a montagem baixa todos de volta. É mais
// tráfego, mas é o que faz o vídeo caber em funções de até 300s sem servidor próprio.

export const MODELO_ANIMACAO = "fal-ai/wan/v2.2-5b/image-to-video";
export const MODELO_NARRACAO = "fal-ai/elevenlabs/tts/multilingual-v2";

export type Etapa = "cena" | "marca" | "narracao" | "montar" | "concluido";

export type PipelineVideo = {
  etapa: Etapa;
  cenaAtual: number;
  clipes: string[];
  duracoes: number[];
  temporarios: string[];
  avisos: string[];
  animada?: { cena: number; statusUrl: string; responseUrl: string } | null;
  narracaoPath?: string | null;
  telaFinalRenderizada?: boolean;
  saldoAntes?: number | null;
  saldoDepois?: number | null;
  segundosDeRender?: number;
};

export type LinhaVideo = {
  id: string;
  user_id: string;
  espec: EspecVideo;
  pipeline: PipelineVideo | null;
  formato: string;
};

export type Progresso = { etapa: Etapa; feitas: number; total: number; mensagem: string };

export function pipelineInicial(saldoAntes: number | null): PipelineVideo {
  return { etapa: "cena", cenaAtual: 0, clipes: [], duracoes: [], temporarios: [], avisos: [], animada: null, narracaoPath: null, saldoAntes, segundosDeRender: 0 };
}

export function progressoDe(espec: EspecVideo, p: PipelineVideo): Progresso {
  const n = espec.cenas.length;
  const tf = espec.telaFinal ? 1 : 0;
  const nar = espec.narracao ? 1 : 0;
  const total = n + tf + nar + 1;
  const feitas = p.etapa === "cena" ? p.cenaAtual : p.etapa === "marca" ? n : p.etapa === "narracao" ? n + tf : p.etapa === "montar" ? n + tf + nar : total;
  const mensagem =
    p.etapa === "cena"
      ? p.animada
        ? `Animando a cena ${p.cenaAtual + 1} com IA…`
        : `Montando a cena ${p.cenaAtual + 1} de ${n}…`
      : p.etapa === "marca"
        ? "Criando a tela final com sua marca…"
        : p.etapa === "narracao"
          ? "Gravando a narração…"
          : p.etapa === "montar"
            ? "Juntando tudo com a música…"
            : "Pronto.";
  return { etapa: p.etapa, feitas, total, mensagem };
}

type Db = SupabaseClient;

async function baixar(db: Db, caminhoBucket: string, destino: string) {
  const { data, error } = await db.storage.from(BUCKET_RESULTADOS).download(caminhoBucket);
  if (error || !data) throw new Error(`Não consegui baixar ${caminhoBucket}: ${error?.message ?? "vazio"}`);
  fs.writeFileSync(destino, Buffer.from(await data.arrayBuffer()));
}

async function baixarUrl(url: string, destino: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download falhou (${r.status})`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

async function subir(db: Db, origem: string, caminhoBucket: string, contentType: string) {
  const { error } = await db.storage.from(BUCKET_RESULTADOS).upload(caminhoBucket, fs.readFileSync(origem), { contentType, upsert: true });
  if (error) throw new Error(`Não consegui guardar ${caminhoBucket}: ${error.message}`);
}

/** Caminhos no bucket da(s) imagem(ns) de uma cena: [principal] ou [antes, depois]. */
async function fontesDaCena(db: Db, userId: string, cena: Cena): Promise<string[]> {
  if (cena.jobId) {
    const { data: job } = await db.from("jobs").select("input_path, output_path, status").eq("id", cena.jobId).eq("user_id", userId).maybeSingle();
    if (!job || job.status !== "concluido" || !job.output_path) throw new Error("Uma das fotos escolhidas não está mais disponível.");
    if (cena.tipo === "antes_depois") {
      if (!job.input_path) throw new Error("Essa geração não tem a foto original guardada pra fazer o antes e depois.");
      return [job.input_path, job.output_path];
    }
    return [job.output_path];
  }
  if (cena.arquivo) return [cena.arquivo];
  throw new Error("Cena sem imagem.");
}

function extensaoDe(caminho: string) {
  const e = path.extname(caminho).toLowerCase();
  return e || ".jpg";
}

/**
 * Avança uma etapa do vídeo e grava o pipeline. Devolve o progresso pra tela. Lança
 * erro quando a etapa falha de vez -- quem chama marca o vídeo como falhou e estorna.
 */
export async function avancarVideo(db: Db, falKey: string, video: LinhaVideo): Promise<Progresso> {
  const espec = video.espec;
  const p: PipelineVideo = video.pipeline ?? pipelineInicial(null);
  const formato = FORMATOS_POR_ID[espec.formato];
  const W = formato.largura;
  const H = formato.altura;
  const userId = video.user_id;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "encena-video-"));
  const local = (nome: string) => path.join(dir, nome);
  const tmp = (nome: string) => caminhoTemporario(userId, video.id, nome);

  async function salvar(extra: Partial<PipelineVideo> = {}) {
    Object.assign(p, extra);
    await db.from("videos").update({ pipeline: p }).eq("id", video.id);
  }

  async function guardarClipe(arquivoLocal: string, nome: string, duracao: number, segundos: number) {
    const destino = tmp(nome);
    await subir(db, arquivoLocal, destino, "video/mp4");
    p.clipes.push(destino);
    p.duracoes.push(duracao);
    p.temporarios.push(destino);
    p.segundosDeRender = (p.segundosDeRender ?? 0) + segundos;
  }

  function proximaEtapaDepoisDasCenas(): Etapa {
    if (espec.telaFinal) return "marca";
    if (espec.narracao) return "narracao";
    return "montar";
  }

  try {
    // ---------- cenas ----------
    if (p.etapa === "cena") {
      const i = p.cenaAtual;
      const cena = espec.cenas[i];
      if (!cena) {
        await salvar({ etapa: proximaEtapaDepoisDasCenas() });
        return progressoDe(espec, p);
      }
      const dur = duracaoDaCena(cena);
      const nomeClipe = `cena${i}.mp4`;

      if (cena.tipo === "animada") {
        const fontes = await fontesDaCena(db, userId, cena);
        if (!p.animada || p.animada.cena !== i) {
          // despacha pro fal e volta; a próxima consulta pergunta se acabou
          const urlImagem = await assinar(db, fontes[0]);
          const preset = ANIMACOES.find((a) => a.id === cena.animacao) ?? ANIMACOES[1];
          const aspect = espec.formato === "16:9" ? "16:9" : espec.formato === "9:16" ? "9:16" : "1:1";
          const frames = Math.min(161, Math.max(17, Math.round(dur * 24) + 1));
          const d = await despachar(
            MODELO_ANIMACAO,
            { prompt: preset.prompt, image_url: urlImagem, aspect_ratio: aspect, resolution: "720p", num_frames: frames, frames_per_second: 24, video_write_mode: "balanced", enable_safety_checker: false, enable_prompt_expansion: false },
            falKey
          );
          await salvar({ animada: { cena: i, statusUrl: d.status_url, responseUrl: d.response_url } });
          return progressoDe(espec, p);
        }
        const estado = await consultar(p.animada.statusUrl, falKey);
        if (estado.estado === "esperando") return progressoDe(espec, p);

        let clipeLocal: string | null = null;
        if (estado.estado === "pronto") {
          try {
            const saida = (await resultado(p.animada.responseUrl, falKey)) as { video?: { url?: string } };
            const url = saida?.video?.url ?? extrairImagem(saida).url;
            clipeLocal = local(`animada${i}.mp4`);
            await baixarUrl(url, clipeLocal);
          } catch (e) {
            p.avisos.push(`Cena ${i + 1}: a animação não voltou (${e instanceof Error ? e.message.slice(0, 80) : "erro"}); ficou como foto.`);
            clipeLocal = null;
          }
        } else {
          p.avisos.push(`Cena ${i + 1}: a animação falhou (${estado.mensagem.slice(0, 80)}); ficou como foto.`);
        }

        if (clipeLocal) {
          const saida = local(nomeClipe);
          const r = await rodarFfmpeg(argsCenaClipe({ clipe: clipeLocal, saida, W, H, duracao: dur, legenda: cena.legenda }));
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        } else {
          // devolve os créditos da animação e renderiza como foto
          await db.rpc("adicionar_creditos", { p_user_id: userId, p_quantidade: CREDITOS.animada, p_motivo: "estorno_animacao", p_referencia: video.id });
          const foto = local(`foto${i}${extensaoDe(fontes[0])}`);
          await baixar(db, fontes[0], foto);
          const saida = local(nomeClipe);
          const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: "aproximar", legenda: cena.legenda }));
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        }
        p.animada = null;
      } else if (cena.tipo === "antes_depois") {
        const [antesPath, depoisPath] = await fontesDaCena(db, userId, cena);
        const antes = local("antes.jpg");
        const depois = local("depois.jpg");
        await Promise.all([baixar(db, antesPath, antes), baixar(db, depoisPath, depois)]);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaAntesDepois({ antes, depois, saida, W, H, duracao: dur, legenda: cena.legenda }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else if (cena.tipo === "clipe") {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const clipe = local(`clipe${i}${extensaoDe(fonte) === ".mov" ? ".mov" : ".mp4"}`);
        await baixar(db, fonte, clipe);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaClipe({ clipe, saida, W, H, duracao: dur, legenda: cena.legenda, melhorar: cena.melhorar }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const foto = local(`foto${i}${extensaoDe(fonte)}`);
        await baixar(db, fonte, foto);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: cena.efeito ?? "aproximar", legenda: cena.legenda }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      }

      p.cenaAtual = i + 1;
      await salvar({ etapa: p.cenaAtual >= espec.cenas.length ? proximaEtapaDepoisDasCenas() : "cena" });
      return progressoDe(espec, p);
    }

    // ---------- tela final ----------
    if (p.etapa === "marca") {
      const { data: u } = await db.from("users").select("nome, creci, whatsapp, logo_path, cor_marca").eq("id", userId).maybeSingle();
      if (u && (u.nome || u.whatsapp || u.logo_path)) {
        let logo: string | undefined;
        if (u.logo_path) {
          logo = local("logo.png");
          await baixar(db, u.logo_path, logo).catch(() => {
            logo = undefined;
          });
        }
        const saida = local("final.mp4");
        const r = await rodarFfmpeg(
          argsTelaFinal({ saida, W, H, duracao: LIMITES.telaFinalSegundos, cor: u.cor_marca ?? "#0F2D5B", logo, nome: u.nome ?? "", creci: u.creci ?? undefined, whatsapp: u.whatsapp ?? undefined })
        );
        await guardarClipe(saida, "telafinal.mp4", LIMITES.telaFinalSegundos, r.segundos);
        p.telaFinalRenderizada = true;
      } else {
        p.avisos.push("Sem nome, WhatsApp ou logo em Minha marca, então o vídeo saiu sem a tela final.");
      }
      await salvar({ etapa: espec.narracao ? "narracao" : "montar" });
      return progressoDe(espec, p);
    }

    // ---------- narração ----------
    if (p.etapa === "narracao") {
      if (espec.narracao) {
        try {
          const voz = VOZES.find((v) => v.id === espec.narracao!.voz) ?? VOZES[0];
          const saida = (await chamarSincrono(
            MODELO_NARRACAO,
            { text: espec.narracao.roteiro, voice: voz.elevenlabs, language_code: "pt", stability: 0.5, similarity_boost: 0.75, speed: 1 },
            falKey,
            120_000
          )) as { audio?: { url?: string } };
          if (!saida.audio?.url) throw new Error("TTS sem áudio na resposta.");
          const arquivo = local("narracao.mp3");
          await baixarUrl(saida.audio.url, arquivo);
          const destino = tmp("narracao.mp3");
          await subir(db, arquivo, destino, "audio/mpeg");
          p.temporarios.push(destino);
          p.narracaoPath = destino;
        } catch (e) {
          p.avisos.push(`A narração não pôde ser gravada (${e instanceof Error ? e.message.slice(0, 80) : "erro"}); o crédito dela voltou.`);
          await db.rpc("adicionar_creditos", { p_user_id: userId, p_quantidade: CREDITOS.narracao, p_motivo: "estorno_narracao", p_referencia: video.id });
          p.narracaoPath = null;
        }
      }
      await salvar({ etapa: "montar" });
      return progressoDe(espec, p);
    }

    // ---------- montagem ----------
    if (p.etapa === "montar") {
      if (p.clipes.length === 0) throw new Error("Nenhuma cena foi renderizada.");
      const locais: string[] = [];
      for (let i = 0; i < p.clipes.length; i++) {
        const l = local(`m${i}.mp4`);
        await baixar(db, p.clipes[i], l);
        locais.push(l);
      }
      let musica: string | undefined;
      const faixa = MUSICAS.find((m) => m.id === espec.musica);
      if (faixa?.arquivo) {
        const candidato = path.join(process.cwd(), "assets", "musica", faixa.arquivo);
        if (fs.existsSync(candidato)) musica = candidato;
        else p.avisos.push("A trilha escolhida não foi encontrada no servidor; o vídeo saiu sem música.");
      }
      let narracao: string | undefined;
      if (p.narracaoPath) {
        narracao = local("narracao.mp3");
        await baixar(db, p.narracaoPath, narracao);
      }
      const total = p.duracoes.reduce((s, d) => s + d, 0) - (espec.transicao === "suave" ? LIMITES.transicaoSegundos * (p.clipes.length - 1) : 0);
      const fimDoCarimbo = p.telaFinalRenderizada ? total - LIMITES.telaFinalSegundos + (espec.transicao === "suave" ? LIMITES.transicaoSegundos : 0) : undefined;
      const subtitulo = [espec.preco, espec.local].filter(Boolean).join(" · ");
      const saida = local("video.mp4");
      const r = await rodarFfmpeg(
        argsMontagem({
          clipes: locais,
          duracoes: p.duracoes,
          saida,
          W,
          H,
          transicao: espec.transicao,
          musica,
          narracao,
          titulo: espec.titulo || undefined,
          subtitulo: subtitulo || undefined,
          fimDoCarimbo,
        }),
        280_000
      );
      const thumb = local("thumb.jpg");
      await rodarFfmpeg(argsMiniatura(saida, thumb), 30_000).catch(() => null);
      const sonda = await sondarMidia(saida);

      const caminhoFinal = caminhoVideoFinal(userId, video.id);
      const caminhoThumb = caminhoMiniatura(userId, video.id);
      await subir(db, saida, caminhoFinal, "video/mp4");
      if (fs.existsSync(thumb)) await subir(db, thumb, caminhoThumb, "image/jpeg");

      const saldoDepois = await saldoFal(falKey);
      const custo = p.saldoAntes != null && saldoDepois != null ? Math.max(0, Number((p.saldoAntes - saldoDepois).toFixed(4))) : null;
      p.segundosDeRender = (p.segundosDeRender ?? 0) + r.segundos;
      p.etapa = "concluido";
      p.saldoDepois = saldoDepois;
      await db
        .from("videos")
        .update({
          status: "concluido",
          output_path: caminhoFinal,
          thumb_path: fs.existsSync(thumb) ? caminhoThumb : null,
          duracao_segundos: sonda.duracao ?? total,
          custo_real: custo,
          concluido_em: new Date().toISOString(),
          pipeline: p,
        })
        .eq("id", video.id);
      await apagarEntradas(db, p.temporarios);
      return progressoDe(espec, p);
    }

    return progressoDe(espec, p);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Limpa os temporários de um vídeo que falhou ou foi apagado. */
export async function limparTemporarios(db: Db, p: PipelineVideo | null) {
  if (p?.temporarios?.length) await apagarEntradas(db, p.temporarios);
}
