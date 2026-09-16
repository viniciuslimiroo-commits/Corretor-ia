import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_RESULTADOS } from "./supabase-server";
import { assinar, apagarEntradas } from "./armazenamento";
import { chamarSincrono, consultar, despachar, extrairImagem, resultado } from "./fal";
import { rodarFfmpeg, sondarMidia } from "./ffmpeg";
import { saldoFal } from "./custo";
import sharp from "sharp";
import { rasterizarArtes } from "./texto-arte-servidor";
import { creditar, marcaEfetiva } from "./cobranca";
import { ANIMACOES, CREDITOS, EFEITOS_SONOROS, FORMATOS_POR_ID, LIMITES, MUSICAS, NEGATIVO_VIDEO, VOZES, duracaoDaCena, emendasDoVideo, filtroDaCena, textosDaCena, projecaoPelaProporcao, vozDeIA, type Cena, type EspecVideo, type Projecao360 } from "./video";
import {
  argsCena360,
  argsCenaAntesDepois,
  argsCenaClipe,
  argsCenaFoto,
  argsCapaMontada,
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
  /** Índices das cenas animadas que NÃO foram cobradas porque o clipe já existia (ver
   *  `animacoesGuardadas`). Decidido na criação do vídeo, junto com a cobrança. */
  animadasGratis?: number[];
};

export type LinhaVideo = {
  id: string;
  user_id: string;
  org_id: string | null;
  espec: EspecVideo;
  pipeline: PipelineVideo | null;
  formato: string;
};

export type Progresso = { etapa: Etapa; feitas: number; total: number; mensagem: string };

export function pipelineInicial(saldoAntes: number | null, animadasGratis: number[] = []): PipelineVideo {
  return { etapa: "cena", cenaAtual: 0, clipes: [], duracoes: [], temporarios: [], avisos: [], animada: null, narracaoPath: null, saldoAntes, segundosDeRender: 0, animadasGratis };
}

// ---- clipes animados guardados ----
//
// A cena animada é a única parte cara do vídeo (IA, 2 créditos, minutos de fila). Editar
// um vídeo e gerar de novo não pode cobrar essa cena outra vez se nada nela mudou -- o
// corretor que corrige um preço na legenda não deve pagar a animação de novo.
//
// O clipe cru que volta do modelo fica guardado em animadas/{user}/{chave}.mp4, onde a
// chave é tudo que muda o resultado: a imagem de origem, o movimento, a duração (em
// quadros) e a proporção. Legenda e formato de saída NÃO entram: são ffmpeg em cima do
// clipe, de graça. Quem cria o vídeo consulta o que já existe e só cobra o resto; o
// pipeline reaproveita exatamente as cenas que não foram cobradas.

export function quadrosDaAnimacao(duracao: number): number {
  // Teto de 121 quadros (5s), não os 161 que o modelo aceita.
  //
  // Medido em produção: 161 quadros a 720p passaram de 8 minutos na fila, e a pessoa
  // fica olhando uma barra achando que travou. Os 40 quadros a mais não valem dobrar a
  // espera -- e a tela nem oferece mais de 5s por cena.
  return Math.min(121, Math.max(17, Math.round(duracao * 24) + 1));
}

export function aspectoDaAnimacao(formato: string): "16:9" | "9:16" | "1:1" {
  return formato === "16:9" ? "16:9" : formato === "9:16" ? "9:16" : "1:1";
}

export function chaveDaAnimacao(cena: Cena, formato: string): string {
  const partes = [cena.jobId ?? cena.arquivo ?? "", cena.animacao ?? "caminhar", quadrosDaAnimacao(duracaoDaCena(cena)), aspectoDaAnimacao(formato)];
  return createHash("sha1").update(partes.join("|")).digest("hex").slice(0, 24);
}

export function caminhoAnimacao(userId: string, chave: string): string {
  return `animadas/${userId}/${chave}.mp4`;
}

/** Por cena do espec: true se é animada E o clipe dela já está guardado. */
export async function animacoesGuardadas(db: Db, userId: string, espec: EspecVideo): Promise<boolean[]> {
  return Promise.all(
    espec.cenas.map(async (cena) => {
      if (cena.tipo !== "animada") return false;
      const nome = `${chaveDaAnimacao(cena, espec.formato)}.mp4`;
      const { data } = await db.storage.from(BUCKET_RESULTADOS).list(`animadas/${userId}`, { limit: 1, search: nome });
      return !!data?.some((f) => f.name === nome);
    })
  );
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
  // Estornos parciais (animação ou narração que falhou) voltam pra conta que pagou.
  const contaDoVideo = video.org_id ? { tipo: "org" as const, id: video.org_id } : { tipo: "user" as const, id: userId };
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
        const guardado = caminhoAnimacao(userId, chaveDaAnimacao(cena, espec.formato));
        // Cena que não foi cobrada porque o clipe já existia: usa o clipe, sem IA.
        const gratis = p.animadasGratis?.includes(i) ?? false;
        let clipeLocal: string | null = null;
        let reaproveitado = false;
        if (gratis && !p.animada) {
          clipeLocal = local(`animada${i}.mp4`);
          try {
            await baixar(db, guardado, clipeLocal);
            reaproveitado = true;
          } catch {
            // Sumiu entre a criação e agora (raro): gera de novo por nossa conta -- a
            // pessoa não pagou por esta cena e não vai pagar.
            clipeLocal = null;
          }
        }

        if (!reaproveitado) {
          if (!p.animada || p.animada.cena !== i) {
            // despacha pro fal e volta; a próxima consulta pergunta se acabou
            const urlImagem = await assinar(db, fontes[0]);
            const preset = ANIMACOES.find((a) => a.id === cena.animacao) ?? ANIMACOES[1];
            const d = await despachar(
              MODELO_ANIMACAO,
              {
                prompt: preset.prompt,
                // O que segura gente, bicho e parede nova. Faltava, e era a causa do
                // "Caminhar" gerar uma pessoa andando: a proibição estava só no positivo.
                negative_prompt: NEGATIVO_VIDEO,
                image_url: urlImagem,
                aspect_ratio: aspectoDaAnimacao(espec.formato),
                resolution: "720p",
                num_frames: quadrosDaAnimacao(dur),
                frames_per_second: 24,
                video_write_mode: "balanced",
                enable_safety_checker: false,
                // Expansão desligada: o modelo reescrevendo o prompt é o modelo desfazendo
                // as proibições que acabamos de escrever.
                enable_prompt_expansion: false,
              },
              falKey
            );
            await salvar({ animada: { cena: i, statusUrl: d.status_url, responseUrl: d.response_url } });
            return progressoDe(espec, p);
          }
          const estado = await consultar(p.animada.statusUrl, falKey);
          if (estado.estado === "esperando") return progressoDe(espec, p);

          if (estado.estado === "pronto") {
            try {
              const saida = (await resultado(p.animada.responseUrl, falKey)) as { video?: { url?: string } };
              const url = saida?.video?.url ?? extrairImagem(saida).url;
              clipeLocal = local(`animada${i}.mp4`);
              await baixarUrl(url, clipeLocal);
              // Guarda o clipe cru pra próxima edição deste vídeo não pagar de novo.
              // Se não conseguir guardar, o vídeo sai igual; só a próxima vez cobra.
              await subir(db, clipeLocal, guardado, "video/mp4").catch(() => null);
            } catch (e) {
              p.avisos.push(`Cena ${i + 1}: a animação não voltou (${e instanceof Error ? e.message.slice(0, 80) : "erro"}); ficou como foto.`);
              clipeLocal = null;
            }
          } else {
            p.avisos.push(`Cena ${i + 1}: a animação falhou (${estado.mensagem.slice(0, 80)}); ficou como foto.`);
          }
        }

        if (clipeLocal) {
          const saida = local(nomeClipe);
          const r = await rodarFfmpeg(argsCenaClipe({ clipe: clipeLocal, saida, W, H, duracao: dur, textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz }));
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        } else {
          // devolve os créditos da animação (se foi cobrada) e renderiza como foto
          if (!gratis) await creditar(db, contaDoVideo, userId, CREDITOS.animada, "estorno_animacao", video.id).catch(() => null);
          const foto = local(`foto${i}${extensaoDe(fontes[0])}`);
          await baixar(db, fontes[0], foto);
          const saida = local(nomeClipe);
          const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: "aproximar", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz }));
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        }
        p.animada = null;
      } else if (cena.tipo === "antes_depois") {
        const [antesPath, depoisPath] = await fontesDaCena(db, userId, cena);
        const antes = local("antes.jpg");
        const depois = local("depois.jpg");
        await Promise.all([baixar(db, antesPath, antes), baixar(db, depoisPath, depois)]);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaAntesDepois({ antes, depois, saida, W, H, duracao: dur, textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else if (cena.tipo === "tour360") {
        // Pode ser foto 360 (equirretangular 2:1), panorâmica de celular (cilíndrica,
        // 3:1 ou mais) ou vídeo 360. A projeção é decidida AQUI, pelo tamanho real do
        // arquivo, não pelo que o navegador disse.
        const [fonte] = await fontesDaCena(db, userId, cena);
        const ext = extensaoDe(fonte);
        const ehVideo = ext === ".mp4" || ext === ".mov";
        const entrada = local(`e360-${i}${ext}`);
        await baixar(db, fonte, entrada);
        let projecao: Projecao360 = "equirect";
        let larguraEntrada: number | undefined;
        let alturaEntrada: number | undefined;
        if (ehVideo) {
          const sonda = await sondarMidia(entrada);
          larguraEntrada = sonda.largura ?? undefined;
          alturaEntrada = sonda.altura ?? undefined;
        } else {
          const meta = await sharp(entrada).metadata();
          larguraEntrada = meta.width;
          alturaEntrada = meta.height;
        }
        if (larguraEntrada && alturaEntrada) {
          projecao = projecaoPelaProporcao(larguraEntrada, alturaEntrada) ?? "panoramica";
        }
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(
          argsCena360({ entrada, ehVideo, saida, dirTrabalho: dir, W, H, duracao: dur, movimento: cena.movimento ?? "olhar_volta", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz, projecao, entradaLargura: larguraEntrada, entradaAltura: alturaEntrada }),
          280_000
        );
        if (projecao === "panoramica") p.avisos.push(`Cena ${i + 1}: tratei como panorâmica de celular (a imagem não tem a proporção 2:1 de câmera 360).`);
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else if (cena.tipo === "clipe") {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const clipe = local(`clipe${i}${extensaoDe(fonte) === ".mov" ? ".mov" : ".mp4"}`);
        await baixar(db, fonte, clipe);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaClipe({ clipe, saida, W, H, duracao: dur, textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz, melhorar: cena.melhorar, inicio: cena.inicio }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const foto = local(`foto${i}${extensaoDe(fonte)}`);
        await baixar(db, fonte, foto);
        const saida = local(nomeClipe);
        // As artes de texto viram PNG antes do comando: o ffmpeg recebe imagem pronta,
        // não instrução de desenho. É o que permite contorno duplo, brilho e relevo.
        const artes = await rasterizarArtes(textosDaCena(cena), H, path.dirname(saida), `c${i}`, !!espec.titulo).catch(() => []);
        const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: cena.efeito ?? "aproximar", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, filtro: filtroDaCena(cena, espec.filtro), luz: cena.luz, artes }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      }

      p.cenaAtual = i + 1;
      await salvar({ etapa: p.cenaAtual >= espec.cenas.length ? proximaEtapaDepoisDasCenas() : "cena" });
      return progressoDe(espec, p);
    }

    // ---------- tela final ----------
    if (p.etapa === "marca") {
      // A marca da pessoa, completada pela da imobiliária (logo e WhatsApp da casa).
      const u = await marcaEfetiva(db, userId);
      if (u.nome || u.whatsapp || u.logo_path) {
        let logo: string | undefined;
        if (u.logo_path) {
          logo = local("logo.png");
          await baixar(db, u.logo_path, logo).catch(() => {
            logo = undefined;
          });
        }
        const saida = local("final.mp4");
        const r = await rodarFfmpeg(
          argsTelaFinal({ saida, W, H, duracao: LIMITES.telaFinalSegundos, cor: u.cor_marca ?? "#0F2D5B", logo, chamada: espec.chamada || undefined, nome: u.nome ?? "", creci: u.creci ?? undefined, whatsapp: u.whatsapp ?? undefined })
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
      // Voz da pessoa (gravada no navegador ou enviada): o arquivo já está no bucket, já
      // foi conferido como dela em /api/video, e não passa por modelo nenhum. Nada de TTS,
      // nada de crédito -- e NÃO entra em `temporarios`, senão a faxina do fim apagaria um
      // arquivo que é dela e que outros vídeos podem reusar.
      if (espec.narracao && !vozDeIA(espec.narracao) && espec.narracao.arquivo) {
        p.narracaoPath = espec.narracao.arquivo;
        await salvar({ etapa: "montar" });
        return progressoDe(espec, p);
      }
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
          // (daqui pra baixo é só a voz de IA)
          const arquivo = local("narracao.mp3");
          await baixarUrl(saida.audio.url, arquivo);
          // A voz de IA fica GUARDADA, não temporária: é dela que saem as legendas quando
          // a pessoa volta pra editar o vídeo. Guardada em uploads/ pela mesma razão que
          // a voz gravada -- é o mesmo tipo de arquivo, e a rota de legendas só aceita o
          // que está na pasta da pessoa. Um mp3 de narração tem poucos KB.
          const destino = `uploads/${userId}/voz-${video.id}.mp3`;
          await subir(db, arquivo, destino, "audio/mpeg");
          p.narracaoPath = destino;
        } catch (e) {
          p.avisos.push(`A narração não pôde ser gravada (${e instanceof Error ? e.message.slice(0, 80) : "erro"}); o crédito dela voltou.`);
          await creditar(db, contaDoVideo, userId, CREDITOS.narracao, "estorno_narracao", video.id).catch(() => null);
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
        // As faixas moram em public/ e não em assets/ porque o NAVEGADOR também precisa
        // delas: sem isso não dá pra ouvir a música antes de escolher, e escolher trilha
        // pelo nome é escolher no escuro. O ffmpeg lê o mesmo arquivo do disco.
        const candidato = path.join(process.cwd(), "public", "musica", faixa.arquivo);
        if (fs.existsSync(candidato)) musica = candidato;
        else p.avisos.push("A trilha escolhida não foi encontrada no servidor; o vídeo saiu sem música.");
      }
      let efeitoSonoro: string | undefined;
      const somDaVirada = EFEITOS_SONOROS.find((e) => e.id === espec.efeitoSonoro);
      if (somDaVirada?.arquivo) {
        const caminho = path.join(process.cwd(), "public", "efeitos", somDaVirada.arquivo);
        if (fs.existsSync(caminho)) efeitoSonoro = caminho;
        else p.avisos.push("O efeito sonoro escolhido não foi encontrado no servidor; o vídeo saiu sem ele.");
      }
      let narracao: string | undefined;
      if (p.narracaoPath) {
        // A extensão importa: o ffmpeg abre webm/opus (gravação do navegador) e m4a pelo
        // container, e um .mp3 que não é mp3 confunde o detector.
        narracao = local(`narracao${extensaoDe(p.narracaoPath)}`);
        await baixar(db, p.narracaoPath, narracao);
      }
      // As emendas vêm do espec (cada cena escolhe a sua) e são a MESMA lista que a tela
      // usa pra estimar a duração. Um clipe a mais que o esperado (a tela final) sai
      // coberto pelo `emenda()` do montador, que tem padrão.
      const emendas = emendasDoVideo(espec).slice(0, Math.max(0, p.clipes.length - 1));
      const somaEmendas = emendas.reduce((s, e) => s + e.segundos, 0);
      const total = p.duracoes.reduce((s, d) => s + d, 0) - somaEmendas;

      // O apresentador: o clipe da pessoa baixado e sondado. A sondagem importa -- um
      // vídeo sem faixa de áudio derruba a montagem inteira se o filtro pedir `[n:a]`.
      let apresentador: (typeof espec.apresentador & { arquivoLocal: string; temAudio: boolean; duracaoClipe: number }) | null = null;
      if (espec.apresentador?.arquivo) {
        try {
          const local2 = local(`apresentador${extensaoDe(espec.apresentador.arquivo)}`);
          await baixar(db, espec.apresentador.arquivo, local2);
          const sonda2 = await sondarMidia(local2);
          const disponivel = Math.max(0, (sonda2.duracao ?? 0) - (espec.apresentador.inicio ?? 0));
          apresentador = { ...espec.apresentador, arquivoLocal: local2, temAudio: sonda2.temAudio, duracaoClipe: Math.min(disponivel || 8, Math.max(1, total - (espec.apresentador.entra ?? 0))) };
        } catch (e) {
          p.avisos.push(`O vídeo do apresentador não pôde ser usado (${e instanceof Error ? e.message.slice(0, 60) : "erro"}); o vídeo saiu sem ele.`);
          apresentador = null;
        }
      }
      const ultimaEmenda = emendas[emendas.length - 1]?.segundos ?? 0;
      const fimDoCarimbo = p.telaFinalRenderizada ? total - LIMITES.telaFinalSegundos + ultimaEmenda : undefined;
      const subtitulo = [espec.preco, espec.local].filter(Boolean).join(" · ");
      const saida = local("video.mp4");
      const r = await rodarFfmpeg(
        argsMontagem({
          clipes: locais,
          duracoes: p.duracoes,
          saida,
          W,
          H,
          emendas,
          musica,
          narracao,
          titulo: espec.titulo || undefined,
          subtitulo: subtitulo || undefined,
          fimDoCarimbo,
          musicaVolume: espec.musicaVolume,
          efeitoSonoro,
          vozVolume: espec.narracao?.volume,
          vozInicio: espec.narracao?.inicio,
          legendas: espec.legendas,
          apresentador,
        }),
        280_000
      );
      // A miniatura sai da cena escolhida como capa: o começo dela na linha do tempo (cada
      // emenda sobrepõe o tempo dela) mais um pouco, pra não pegar o quadro em que a
      // transição ainda está terminando.
      const k = Math.min(Math.max(0, espec.capa ?? 0), espec.cenas.length - 1);
      const inicioDaCapa = p.duracoes.slice(0, k).reduce((s, d) => s + d, 0) - emendas.slice(0, k).reduce((s, e) => s + e.segundos, 0);
      const segundoDaCapa = Math.max(0, inicioDaCapa + Math.min(1.5, (p.duracoes[k] ?? 4) / 2));
      const thumb = local("thumb.jpg");
      // A capa MONTADA é a imagem que aparece antes de alguém tocar no play. Só faz
      // sentido quando há o que escrever nela: sem título nem preço, a faixa escura
      // cobriria um terço da foto pra não dizer nada, e aí o quadro cru é melhor.
      const cenaDaCapa = espec.cenas[k];
      const temCapaMontada = espec.capaMontada !== false && !!(espec.titulo?.trim() || espec.preco?.trim()) && cenaDaCapa?.tipo !== "clipe" && cenaDaCapa?.tipo !== "tour360";
      let feita = false;
      if (temCapaMontada) {
        try {
          // A FOTO da cena escolhida, não um quadro do vídeo: o carimbo de título e preço
          // vive no alto do vídeo inteiro, e uma capa tirada dali sairia com os dois
          // escritos duas vezes.
          const [fonteCapa] = await fontesDaCena(db, userId, cenaDaCapa);
          const fotoCapa = local(`capa-fonte${path.extname(fonteCapa) || ".jpg"}`);
          await baixar(db, fonteCapa, fotoCapa);

          const marcaCapa = await marcaEfetiva(db, userId).catch(() => null);
          let logoCapa: string | undefined;
          if (marcaCapa?.logo_path) {
            logoCapa = local("logo-capa.png");
            await baixar(db, marcaCapa.logo_path, logoCapa).catch(() => {
              logoCapa = undefined;
            });
          }
          await rodarFfmpeg(
            argsCapaMontada({
              foto: fotoCapa,
              saida: thumb,
              W,
              H,
              titulo: espec.titulo,
              preco: espec.preco,
              local: espec.local,
              cor: marcaCapa?.cor_marca ?? "#0F2D5B",
              logo: logoCapa,
            }),
            40_000
          );
          feita = fs.existsSync(thumb);
        } catch {
          feita = false;
        }
      }
      // Sem capa montada, ou se ela falhou: o quadro cru, que é o que sempre houve.
      if (!feita) await rodarFfmpeg(argsMiniatura(saida, thumb, segundoDaCapa), 30_000).catch(() => null);
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
