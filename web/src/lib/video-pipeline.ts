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
import { rasterizarElementos } from "./elementos-servidor";
import { animarPecas } from "./movimento-servidor";
import { ajustesNeutros, gradeNeutra, lutCube, vinhetaDaGrade } from "./filtros";
import { creditar, marcaEfetiva } from "./cobranca";
import type { ResumoEdicao } from "./resumo-edicao";
import { avisoDeReprovado, conferirClipe, destinoDoReprovado, refeitasJaFeitas } from "./conferir-clipe";
import { ANIMACOES, CREDITOS, EFEITOS_SONOROS, FORMATOS_POR_ID, LIMITES, MUSICAS, MUSICA_POR_ID, NEGATIVO_VIDEO, TAMANHOS_MARCA_DAGUA, VOZES, clipeContinua, duracaoDaCena, emendasDoVideo, gradeDaCena, relogioDoEspec, textosDaCena, projecaoPelaProporcao, type Cena, type PosicaoMarcaDagua, type EfeitoId, type EspecVideo, type Projecao360 } from "./video";
import { resolverAudiosDaMontagem } from "./audio-montagem";
import { estornoDaNarracao } from "./pedido-video";
import type { AudioNaMontagem } from "./video-ffmpeg";
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
// final), narracao (TTS), montar (emenda tudo, música, carimbos), finalizar (capa,
// miniatura, grava como pronto), concluido.
//
// Entre uma chamada e outra nada sobrevive no disco da função, então cada clipe pronto
// sobe pro bucket em tmp/videos/{user}/{id}/ e a montagem baixa todos de volta. É mais
// tráfego, mas é o que faz o vídeo caber em funções de até 300s sem servidor próprio.

export const MODELO_ANIMACAO = "fal-ai/wan/v2.2-5b/image-to-video";

/**
 * Quantas vezes uma cena reprovada na conferência é refeita antes de virar foto.
 *
 * UM, e o teto é de dinheiro. A cena cobra 2 créditos (R$ 1,73) e cada clipe custa US$ 0,15
 * (~R$ 0,83): com uma refeita a margem some no pior caso, com duas o vídeo dá prejuízo. E
 * quem reprova duas vezes seguidas quase sempre é a FOTO, não o sorteio -- parede de perto
 * não tem para onde a câmera andar, e insistir só paga de novo pelo mesmo erro.
 */
export const REFAZER_NO_MAXIMO = 1;
export const MODELO_NARRACAO = "fal-ai/elevenlabs/tts/multilingual-v2";

export type Etapa = "cena" | "marca" | "narracao" | "montar" | "finalizar" | "concluido";

/** Até quantos segundos de chamada a montagem ainda emenda o `finalizar` (capa até 40s,
 *  miniatura até 30s, uploads): abaixo de 300 com sobra. */
const SEGUNDOS_PRA_EMENDAR_FINALIZAR = 200;

export type PipelineVideo = {
  etapa: Etapa;
  cenaAtual: number;
  clipes: string[];
  duracoes: number[];
  temporarios: string[];
  avisos: string[];
  /** A animacao em voo, uma por vez. Mantido pra videos que ja estavam rodando com o modelo
   *  antigo -- video novo usa `animadas`. */
  animada?: { cena: number; statusUrl: string; responseUrl: string } | null;
  /**
   * TODAS as animacoes em voo, por indice de cena. Chave em texto porque isto vira JSON.
   *
   * Antes era uma so: o pipeline despachava a cena, voltava, esperava ela ficar pronta e so
   * entao despachava a proxima. Com a fila do fal variando de 30 s a 11 minutos (medido nos
   * dois testes de 24/09/2026), um video de quatro cenas animadas podia levar 45 minutos, e
   * uma unica cena lenta segurava todas as outras que ja poderiam estar prontas.
   *
   * Despachando todas de uma vez o video passa a levar o tempo da cena MAIS LENTA, nao a soma.
   */
  animadas?: Record<string, { statusUrl: string; responseUrl: string }> | null;
  /** true quando o despacho em lote ja aconteceu -- inclusive quando nao havia o que despachar. */
  animadasDespachadas?: boolean;
  narracaoPath?: string | null;
  telaFinalRenderizada?: boolean;
  saldoAntes?: number | null;
  saldoDepois?: number | null;
  segundosDeRender?: number;
  /** Índices das cenas animadas que NÃO foram cobradas porque o clipe já existia (ver
   *  `animacoesGuardadas`). Decidido na criação do vídeo, junto com a cobrança. */
  animadasGratis?: number[];
  /** Segundos gastos em cada etapa, somados entre chamadas. É o que mostra quanto falta
   *  pro teto de 300s da função -- a montagem já passou perto dele. */
  tempos?: Partial<Record<Etapa, number>>;
  /** Núcleos da máquina que rodou a última etapa: o mesmo comando leva o dobro com 1. */
  nucleos?: number;
  /** Onde o vídeo pronto já subiu, entre `montar` e `finalizar`. */
  saida?: string | null;
  /** Duração do vídeo pronto, medida na montagem. */
  duracaoFinal?: number | null;
  /** O que a pessoa fez no editor até pedir este vídeo (lib/resumo-edicao.ts). Mora aqui e
   *  não no espec: o saneador do espec não o conhece e o vídeo sai igual sem ele. */
  resumoEdicao?: ResumoEdicao | null;
  /** O crédito da narração já voltou uma vez. Guarda pra etapa repetida não estornar de novo. */
  narracaoEstornada?: boolean;
  /**
   * Quantas vezes cada cena animada foi REFEITA por ter sido reprovada na conferência
   * (lib/conferir-clipe.ts). Chave em texto porque isto vira JSON, como `animadas`.
   *
   * Mora no pipeline e não numa variável porque a etapa volta: despacha a refeita, devolve o
   * progresso e o servidor chama de novo. Sem isto, a cena reprovaria, refaria, reprovaria e
   * refaria pra sempre -- cada volta pagando outro clipe.
   */
  refeitas?: Record<string, number> | null;
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

/**
 * O pipeline de um vídeo recém-pedido. `extra` traz o que o pedido já sabe: avisos do
 * saneamento e o resumo da edição. Sem `extra` (ou com resumo nulo) o objeto sai idêntico
 * ao de antes -- a página rápida não manda resumo, e a linha dela não ganha chave nova.
 */
export function pipelineInicial(saldoAntes: number | null, animadasGratis: number[] = [], extra: { avisos?: string[]; resumoEdicao?: ResumoEdicao | null } = {}): PipelineVideo {
  return { etapa: "cena", cenaAtual: 0, clipes: [], duracoes: [], temporarios: [], avisos: [...(extra.avisos ?? [])], animada: null, narracaoPath: null, saldoAntes, segundosDeRender: 0, animadasGratis, ...(extra.resumoEdicao ? { resumoEdicao: extra.resumoEdicao } : {}) };
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

/** Quantas animacoes ainda estao na fila do fal. */
function emVooAgora(p: PipelineVideo): number {
  return p.animadas ? Object.keys(p.animadas).length : 0;
}

/**
 * A cena de agora esta' na SEGUNDA tentativa, por ter sido reprovada na conferencia?
 *
 * Olha a cena atual, nao o video: um vídeo onde a cena 2 foi refeita e ja' passou nao pode
 * ficar dizendo "refazendo" enquanto anima a cena 7.
 */
function refazendoAgora(p: PipelineVideo): boolean {
  return (p.refeitas?.[String(p.cenaAtual)] ?? 0) > 0 && (emVooAgora(p) > 0 || !!p.animada);
}

export function progressoDe(espec: EspecVideo, p: PipelineVideo): Progresso {
  const n = espec.cenas.length;
  const tf = espec.telaFinal ? 1 : 0;
  const nar = espec.narracao ? 1 : 0;
  const total = n + tf + nar + 2;
  const feitas =
    p.etapa === "cena" ? p.cenaAtual : p.etapa === "marca" ? n : p.etapa === "narracao" ? n + tf : p.etapa === "montar" ? n + tf + nar : p.etapa === "finalizar" ? n + tf + nar + 1 : total;
  const mensagem =
    p.etapa === "cena"
      ? // QUANTAS ESTAO NA FILA DA IA AGORA. Com o despacho em lote, "Animando a cena 1" seria
        // mentira: as quatro estao sendo feitas ao mesmo tempo, e dizer isso e o que explica
        // por que a barra fica parada um tempo e depois anda varias casas de uma vez.
        // A CENA QUE ESTA SENDO REFEITA DIZ QUE ESTA SENDO REFEITA.
        //
        // Sem isto a pessoa ve "Animando a cena 2 com IA…" de novo, espera mais uma rodada
        // inteira da fila do fal (30 s a 11 minutos, medido) e nao tem como saber por que.
        // Parece travamento, que foi a queixa dele sobre o contador em outro lugar do fluxo.
        // Dizendo o motivo, a mesma espera vira o produto trabalhando a favor dela.
        refazendoAgora(p)
        ? `A cena ${p.cenaAtual + 1} saiu com defeito; refazendo…`
        : emVooAgora(p) > 1
          ? `Animando ${emVooAgora(p)} cenas com IA ao mesmo tempo…`
          : emVooAgora(p) === 1 || p.animada
            ? `Animando a cena ${p.cenaAtual + 1} com IA…`
            : `Montando a cena ${p.cenaAtual + 1} de ${n}…`
      : p.etapa === "marca"
        ? "Criando a tela final com sua marca…"
        : p.etapa === "narracao"
          ? "Gravando a narração…"
          : p.etapa === "montar"
            ? "Juntando tudo com a música…"
            : p.etapa === "finalizar"
              ? "Preparando a capa…"
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

  // Cronômetro: soma o trecho na etapa que está rodando (a montagem pode emendar o
  // `finalizar` na mesma chamada, e aí o relógio troca de etapa junto).
  let etapaDaChamada = p.etapa;
  // Soma só o trecho desde a última gravação: uma chamada que salva duas vezes não conta dobrado.
  const inicioDaChamada = Date.now();
  let marco = inicioDaChamada;
  function cronometrar() {
    const agora = Date.now();
    p.tempos = { ...(p.tempos ?? {}) };
    p.tempos[etapaDaChamada] = Number(((p.tempos[etapaDaChamada] ?? 0) + (agora - marco) / 1000).toFixed(1));
    marco = agora;
    p.nucleos = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  }

  async function salvar(extra: Partial<PipelineVideo> = {}) {
    Object.assign(p, extra);
    cronometrar();
    await db.from("videos").update({ pipeline: p }).eq("id", video.id);
  }

  /** O pedido que vai pro fal, identico pro lote e pro caminho antigo. */
  function corpoDaAnimacao(cena: Cena, dur: number, urlImagem: string) {
    const preset = ANIMACOES.find((a) => a.id === cena.animacao) ?? ANIMACOES[1];
    return {
      prompt: preset.prompt,
      // O que segura gente, bicho e parede nova. Faltava, e era a causa do "Caminhar" gerar
      // uma pessoa andando: a proibicao estava so no positivo.
      negative_prompt: NEGATIVO_VIDEO,
      image_url: urlImagem,
      aspect_ratio: aspectoDaAnimacao(espec.formato),
      resolution: "720p" as const,
      num_frames: quadrosDaAnimacao(dur),
      frames_per_second: 24,
      video_write_mode: "balanced" as const,
      enable_safety_checker: false,
      // Expansao desligada: o modelo reescrevendo o prompt e o modelo desfazendo as
      // proibicoes que acabamos de escrever.
      enable_prompt_expansion: false,
    };
  }

  try {
    // ---------- cenas ----------
    if (p.etapa === "cena") {
      // TODAS AS ANIMACOES DE UMA VEZ, antes de montar a primeira cena.
      //
      // A fila do fal varia muito -- 29 s numa geracao e 11 minutos em outra, medido nos dois
      // testes de 24/09/2026 com a MESMA foto e o mesmo modelo. Em serie, essa variacao se
      // soma: quatro cenas animadas podiam levar 45 minutos, e uma cena azarada segurava
      // todas as outras. Despachadas juntas, o video leva o tempo da mais lenta.
      //
      // Custa o mesmo: e a mesma quantidade de geracoes, so que sem fila interna.
      if (!p.animadasDespachadas) {
        const aDespachar = espec.cenas
          .map((c, k) => ({ c, k }))
          .filter(({ c, k }) => c.tipo === "animada" && !(p.animadasGratis?.includes(k) ?? false));
        const emVoo: Record<string, { statusUrl: string; responseUrl: string }> = { ...(p.animadas ?? {}) };
        // Uma que falhe nao pode derrubar as outras: o laco por cena trata a ausencia dela
        // gerando na hora, pelo caminho antigo, e o pior caso vira o comportamento de antes.
        await Promise.all(
          aDespachar.map(async ({ c, k }) => {
            if (emVoo[String(k)]) return;
            try {
              const fontes = await fontesDaCena(db, userId, c);
              const urlImagem = await assinar(db, fontes[0]);
              const d = await despachar(MODELO_ANIMACAO, corpoDaAnimacao(c, duracaoDaCena(c), urlImagem), falKey);
              emVoo[String(k)] = { statusUrl: d.status_url, responseUrl: d.response_url };
            } catch {
              // Sem aviso aqui: quem nao entrou no lote e despachado na vez dele, e o aviso
              // (se houver) sai de la, junto do motivo de verdade.
            }
          })
        );
        await salvar({ animadas: emVoo, animadasDespachadas: true });
        // Volta pra tela saber que o pedido foi feito. Nada se perde: a proxima consulta
        // comeca a montar as cenas enquanto a IA trabalha.
        if (aDespachar.length > 0) return progressoDe(espec, p);
      }

      const i = p.cenaAtual;
      const cena = espec.cenas[i];
      if (!cena) {
        await salvar({ etapa: proximaEtapaDepoisDasCenas() });
        return progressoDe(espec, p);
      }
      const dur = duracaoDaCena(cena);
      const nomeClipe = `cena${i}.mp4`;
      // As artes de texto viram PNG ANTES do comando: o ffmpeg recebe imagem pronta, não
      // instrução de desenho. É o que permite contorno duplo, brilho e relevo.
      //
      // Fica aqui em cima, fora do `if`, porque vale pra QUALQUER tipo de cena. Quando
      // estava dentro do ramo da foto, um modelo escolhido num clipe sumia sem aviso --
      // a arte não era desenhada e o drawtext já tinha desistido do texto.
      // Movimento em laço (pulsar, balançar...) vira sequência de quadros DEPOIS de
      // rasterizar e posicionar: a folga do movimento não pode empurrar o empilhamento.
      const artes = await rasterizarArtes(textosDaCena(cena), H, dir, `c${i}`, !!espec.titulo, W)
        .then((l) => animarPecas(l, dir, `c${i}-arte`))
        .catch(() => []);
      // Os elementos gráficos passam pelo mesmo caminho: SVG do catálogo -> PNG ->
      // sobreposição. A diferença é que cada um escolhe o canto, em vez de sair centrado.
      const pecas = await rasterizarElementos(cena.elementos, W, H, dir, `c${i}`, { topoOcupado: !!espec.titulo })
        .then((l) => animarPecas(l, dir, `c${i}-peca`))
        .catch(() => []);
      // Giro, espelho e velocidade vêm da barra da linha do tempo. Ficam aqui, num
      // objeto só, porque valem pra todo tipo de cena e repetir seis vezes é como um
      // deles some de um ramo sem ninguém ver.
      const forma = { giro: cena.giro, espelho: cena.espelho };

      // A cor da cena vira ARQUIVO antes do comando: a LUT sai da mesma função que pinta
      // a miniatura no navegador. Grade neutra não escreve nada nem acrescenta filtro --
      // um `lut3d` de identidade custaria uma conversão de cor inteira por quadro à toa.
      const grade = gradeDaCena(cena, espec);
      let cor: { lut?: string; vinheta?: number } | undefined;
      if (!gradeNeutra(grade)) {
        cor = {};
        if ((grade.filtro !== "natural" && grade.intensidade > 0) || !ajustesNeutros(grade.ajustes)) {
          cor.lut = path.join(dir, `c${i}.cube`);
          fs.writeFileSync(cor.lut, lutCube(grade));
        }
        const v = vinhetaDaGrade(grade);
        if (v > 0) cor.vinheta = v;
      }

      /**
       * Renderiza uma cena que tem vídeo por baixo -- clipe enviado ou clipe da IA.
       *
       * Existe pra os dois ramos passarem pelo MESMO caminho. `congelar` valia pros
       * dois no saneamento e só estava escrito num deles: a cena animada congelada
       * sairia correndo, sem erro nenhum, que é o defeito mais caro de achar.
       */
      async function renderizarComVideo(clipe: string, saida: string, extras: { melhorar?: boolean; efeito?: EfeitoId } = {}) {
        if (cena.congelar) {
          // Congelar é PARAR no quadro onde a pessoa deixou o cabeçote: tira aquele
          // quadro do arquivo e daí em diante a cena é uma foto, com o mesmo caminho de
          // texto, arte e acabamento que qualquer foto. Vira um respiro pra mostrar um
          // detalhe -- a bancada, a vista -- sem precisar de outra imagem.
          const parado = local(`parado${i}.png`);
          await rodarFfmpeg(["-ss", Math.max(0, cena.inicio ?? 0).toFixed(2), "-i", clipe, "-frames:v", "1", parado]);
          return rodarFfmpeg(argsCenaFoto({ foto: parado, saida, W, H, duracao: dur, efeito: "parado", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, artes, ...forma , pecas }));
        }
        return rodarFfmpeg(
          argsCenaClipe({ clipe, saida, W, H, duracao: dur, textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, inicio: cena.inicio, artes, pecas, ...forma, velocidade: cena.velocidade, semPouso: clipeContinua(espec, i), ...extras })
        );
      }

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
          // O LOTE JA DESPACHOU ESTA CENA. Se por acaso nao despachou -- uma falha de rede no
          // lote, ou um video antigo que comecou no modelo de uma por vez --, despacha aqui e
          // o pior caso vira exatamente o comportamento anterior.
          const emVoo =
            p.animadas?.[String(i)] ??
            (p.animada && p.animada.cena === i ? { statusUrl: p.animada.statusUrl, responseUrl: p.animada.responseUrl } : null);
          if (!emVoo) {
            const urlImagem = await assinar(db, fontes[0]);
            const d = await despachar(MODELO_ANIMACAO, corpoDaAnimacao(cena, dur, urlImagem), falKey);
            await salvar({ animadas: { ...(p.animadas ?? {}), [String(i)]: { statusUrl: d.status_url, responseUrl: d.response_url } } });
            return progressoDe(espec, p);
          }
          const estado = await consultar(emVoo.statusUrl, falKey);
          if (estado.estado === "esperando") return progressoDe(espec, p);

          if (estado.estado === "pronto") {
            try {
              const saida = (await resultado(emVoo.responseUrl, falKey)) as { video?: { url?: string } };
              const url = saida?.video?.url ?? extrairImagem(saida).url;
              clipeLocal = local(`animada${i}.mp4`);
              await baixarUrl(url, clipeLocal);

              // O CLIPE É CONFERIDO ANTES DE ENTRAR NO VÍDEO (lib/conferir-clipe.ts).
              //
              // Pedido dele em 12/10/2026, depois de ver uma churrasqueira se desmanchar no
              // meio da cena: "independente do imóvel, quero que vc tente evitar possíveis
              // erros que podem vir a acontecer". Medido no mesmo dia: não existe modelo nem
              // negativo que não erre -- o barato solta um banco da parede e deixa ele
              // flutuando, o caro põe tripé e equipamento no chão, e o caro com o negativo
              // reforçado inventa do mesmo jeito. O negativo é um PEDIDO. Isto é conferência.
              const veredito = await conferirClipe({ clipe: clipeLocal, duracao: dur, falKey, pasta: dir });
              if (!veredito.aprovado) {
                clipeLocal = null;
                const jaRefeitas = refeitasJaFeitas(p.refeitas?.[String(i)]);
                if (destinoDoReprovado(jaRefeitas, REFAZER_NO_MAXIMO) === "refazer") {
                  // MAIS UMA RODADA ANTES DE DESISTIR. O modelo é aleatório: a mesma foto com
                  // o mesmo pedido volta diferente, e quase sempre volta limpa. Vale uma
                  // geração a mais (US$0,15) pra não entregar foto parada em cena que a
                  // pessoa pediu animada -- que é a queixa de onde tudo isto nasceu.
                  const urlImagem = await assinar(db, fontes[0]);
                  const d = await despachar(MODELO_ANIMACAO, corpoDaAnimacao(cena, dur, urlImagem), falKey);
                  await salvar({
                    animadas: { ...(p.animadas ?? {}), [String(i)]: { statusUrl: d.status_url, responseUrl: d.response_url } },
                    refeitas: { ...(p.refeitas ?? {}), [String(i)]: jaRefeitas + 1 },
                  });
                  return progressoDe(espec, p);
                }
                // Duas vezes seguidas: esta foto não vai render clipe bom. Vira foto, com o
                // crédito de volta (o estorno mora no `else` lá embaixo, junto com o da
                // animação que nem voltou -- pra pessoa é o mesmo caso).
                p.avisos.push(avisoDeReprovado(i, veredito.achado));
              } else {
                // Guarda o clipe cru pra próxima edição deste vídeo não pagar de novo.
                // Se não conseguir guardar, o vídeo sai igual; só a próxima vez cobra.
                //
                // SÓ O APROVADO É GUARDADO: clipe reprovado que entrasse no cache seria
                // reusado de graça pra sempre, e a conferência viraria enfeite.
                await subir(db, clipeLocal, guardado, "video/mp4").catch(() => null);
              }
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
          // O MOVIMENTO DO FFMPEG POR CIMA DO CLIPE DA IA. A IA da a paralaxe (que e o que
          // faz parecer camera de verdade) e o ffmpeg da a distancia (que e o que faz parecer
          // tour). Pedir as duas coisas pro modelo foi o que fez ele alucinar uma parede nova
          // no meio do comodo -- medido em 24/09/2026, em duas geracoes reais.
          //
          // So no clipe da IA: o video que a PESSOA enviou ja tem o movimento que ela filmou,
          // e ampliar por cima cortaria o enquadramento dela sem ninguem ter pedido.
          const r = await renderizarComVideo(clipeLocal, saida, { efeito: cena.efeito });
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        } else {
          // devolve os créditos da animação (se foi cobrada) e renderiza como foto
          if (!gratis) await creditar(db, contaDoVideo, userId, CREDITOS.animada, "estorno_animacao", video.id).catch(() => null);
          const foto = local(`foto${i}${extensaoDe(fontes[0])}`);
          await baixar(db, fontes[0], foto);
          const saida = local(nomeClipe);
          const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: "aproximar", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, artes, ...forma , pecas }));
          await guardarClipe(saida, nomeClipe, dur, r.segundos);
        }
        // Esta cena saiu do ar: nao pode ser consultada de novo se a etapa repetir.
        p.animada = null;
        if (p.animadas) delete p.animadas[String(i)];
      } else if (cena.tipo === "antes_depois") {
        const [antesPath, depoisPath] = await fontesDaCena(db, userId, cena);
        const antes = local("antes.jpg");
        const depois = local("depois.jpg");
        await Promise.all([baixar(db, antesPath, antes), baixar(db, depoisPath, depois)]);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaAntesDepois({ antes, depois, saida, W, H, duracao: dur, textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, artes, ...forma , pecas }));
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
          argsCena360({ entrada, ehVideo, saida, dirTrabalho: dir, W, H, duracao: dur, movimento: cena.movimento ?? "olhar_volta", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, projecao, entradaLargura: larguraEntrada, entradaAltura: alturaEntrada, artes, pecas }),
          280_000
        );
        if (projecao === "panoramica") p.avisos.push(`Cena ${i + 1}: tratei como panorâmica de celular (a imagem não tem a proporção 2:1 de câmera 360).`);
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else if (cena.tipo === "clipe") {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const clipe = local(`clipe${i}${extensaoDe(fonte) === ".mov" ? ".mov" : ".mp4"}`);
        await baixar(db, fonte, clipe);
        const saida = local(nomeClipe);
        const r = await renderizarComVideo(clipe, saida, { melhorar: cena.melhorar });
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      } else {
        const [fonte] = await fontesDaCena(db, userId, cena);
        const foto = local(`foto${i}${extensaoDe(fonte)}`);
        await baixar(db, fonte, foto);
        const saida = local(nomeClipe);
        const r = await rodarFfmpeg(argsCenaFoto({ foto, saida, W, H, duracao: dur, efeito: cena.efeito ?? "aproximar", textos: textosDaCena(cena), topoOcupado: !!espec.titulo, cor, artes, pecas, ...forma }));
        await guardarClipe(saida, nomeClipe, dur, r.segundos);
      }

      p.cenaAtual = i + 1;
      await salvar({ etapa: p.cenaAtual >= espec.cenas.length ? proximaEtapaDepoisDasCenas() : "cena" });
      return progressoDe(espec, p);
    }

    // ---------- tela final ----------
    if (p.etapa === "marca") {
      // A marca ESCOLHIDA pra este vídeo (`espec.marca`), completada pela outra. Sem
      // escolha, a regra de sempre: a da pessoa com a da imobiliária como rede.
      const u = await marcaEfetiva(db, userId, espec.marca);
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
          // A cor escolhida PRA ESTE VÍDEO vence a da marca; sem escolha, nada muda pra quem
          // já usava (o saneador só deixa passar hex de 6 dígitos).
          argsTelaFinal({ saida, W, H, duracao: LIMITES.telaFinalSegundos, cor: espec.telaFinalCor ?? u.cor_marca ?? "#0F2D5B", logo, chamada: espec.chamada || undefined, nome: u.nome ?? "", creci: u.creci ?? undefined, whatsapp: u.whatsapp ?? undefined })
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
      // Voz que JÁ EXISTE no bucket: gravada no navegador, enviada, ou a de IA que este
      // vídeo (ou o anterior) já mandou gravar e volta reaproveitada. Em qualquer um dos
      // três o arquivo já foi conferido como dela em /api/video (dono, formato e
      // existência, lib/pedido-video.ts), não passa por modelo nenhum e não custa crédito
      // -- e NÃO entra em `temporarios`, senão a faxina do fim apagaria um arquivo que é
      // dela e que outros vídeos podem reusar.
      //
      // É aqui que a conta de `custoDoVideo` (0 crédito com `arquivo`) e o que o servidor
      // EXECUTA se encontram: sem esta linha, um pedido com `arquivo` pagaria 0 e o TTS
      // rodaria assim mesmo.
      if (espec.narracao?.arquivo) {
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
          // O estorno devolve o que foi COBRADO, não um valor de tabela (lib/pedido-video.ts).
          const motivo = e instanceof Error ? e.message.slice(0, 80) : "erro";
          const volta = estornoDaNarracao(espec.narracao, p.narracaoEstornada);
          if (volta > 0) {
            p.avisos.push(`A narração não pôde ser gravada (${motivo}); o crédito dela voltou.`);
            await creditar(db, contaDoVideo, userId, volta, "estorno_narracao", video.id).catch(() => null);
            p.narracaoEstornada = true;
          } else {
            p.avisos.push(`A narração não pôde ser gravada (${motivo}); o vídeo saiu sem voz.`);
          }
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
      // Com a linha do tempo (`espec.audios`) a música não é mais UMA faixa do vídeo
      // inteiro: cada trecho traz a sua, e quem acha o arquivo é o resolvedor, lá embaixo.
      const trechosDeVoz = (espec.audios ?? []).filter((a) => a.fonte.tipo === "voz").length;
      let musica: string | undefined;
      const faixa = espec.audios ? undefined : MUSICAS.find((m) => m.id === espec.musica);
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
      // Com a linha do tempo, a voz só é baixada se algum trecho a usa: narração ligada e
      // todos os trechos de voz apagados não precisa do arquivo.
      if (p.narracaoPath && (!espec.audios || trechosDeVoz > 0)) {
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
      // A MARCA D'ÁGUA: o logo por cima do vídeo inteiro. O espec guarda só a decisão; o
      // arquivo vem de `marcaEfetiva` agora, na montagem -- o mesmo logo que a capa e a
      // tela final usam, da pessoa ou da imobiliária.
      //
      // Pedida sem logo cadastrado, o vídeo sai SEM ela e com aviso, nunca falhando: o
      // espec pode ter sido montado quando havia logo, e quem apagou o logo depois não
      // devia perder o vídeo por isso.
      let marcaDagua: { arquivo: string; canto: PosicaoMarcaDagua; fracao: number; opacidade: number } | null = null;
      if (espec.marcaDagua) {
        const m = await marcaEfetiva(db, userId, espec.marca).catch(() => null);
        if (m?.logo_path) {
          const arquivo = local("marca-dagua.png");
          try {
            await baixar(db, m.logo_path, arquivo);
            marcaDagua = {
              arquivo,
              canto: espec.marcaDagua.canto,
              fracao: TAMANHOS_MARCA_DAGUA.find((t) => t.id === espec.marcaDagua!.tamanho)?.fracao ?? 0.16,
              opacidade: espec.marcaDagua.opacidade,
            };
          } catch {
            p.avisos.push("Não consegui baixar o logo pra marca d'água; o vídeo saiu sem ela.");
          }
        } else {
          p.avisos.push("Você pediu marca d'água, mas não há logo em Minha marca; o vídeo saiu sem ela.");
        }
      }

      // ---- trechos de áudio da linha do tempo ----
      //
      // Conferidos contra a duração REAL (`total`), que pode ser menor que a estimada pelo
      // saneador -- a tela final não sai quando o perfil não tem marca. O que não cabe mais
      // sai com aviso.
      let audios: AudioNaMontagem[] | undefined;
      if (espec.audios) {
        const resolvido = resolverAudiosDaMontagem({
          itens: espec.audios,
          total,
          caminhoDaMusica: (id) => {
            const arquivo = MUSICA_POR_ID[id]?.arquivo;
            if (!arquivo) return null;
            const candidato = path.join(process.cwd(), "public", "musica", arquivo);
            return fs.existsSync(candidato) ? candidato : null;
          },
          caminhoDaVoz: narracao ?? null,
        });
        audios = resolvido.audios;
        for (const aviso of resolvido.avisos) p.avisos.push(aviso);
        // A voz foi COBRADA e não sobrou nenhum trecho dela no vídeo: devolve o que foi
        // cobrado. Só quando o TTS de fato gravou (`narracaoPath`) e só uma vez -- a etapa
        // pode ser repetida. `estornoDaNarracao` é 0 pra voz gravada, enviada ou de IA
        // reaproveitada: elas não custaram nada, e devolver aí seria emitir saldo.
        const volta = p.narracaoPath && resolvido.vozDescartada ? estornoDaNarracao(espec.narracao, p.narracaoEstornada) : 0;
        if (volta > 0) {
          const voltou = await creditar(db, contaDoVideo, userId, volta, "estorno_narracao", video.id).then(
            () => true,
            () => false
          );
          p.narracaoEstornada = voltou;
          p.avisos.push(voltou ? "A voz ficou toda depois do fim do vídeo; o crédito da narração voltou." : "A voz ficou toda depois do fim do vídeo; o crédito da narração não voltou agora e será devolvido no suporte.");
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
          narracao: espec.audios ? undefined : narracao,
          titulo: espec.titulo || undefined,
          subtitulo: subtitulo || undefined,
          fimDoCarimbo,
          musicaVolume: espec.audios ? undefined : espec.musicaVolume,
          efeitoSonoro,
          vozVolume: espec.audios ? undefined : espec.narracao?.volume,
          vozInicio: espec.audios ? undefined : espec.narracao?.inicio,
          audios,
          legendas: espec.legendas,
          apresentador,
          marcaDagua,
        }),
        280_000
      );
      const sonda = await sondarMidia(saida);
      const caminhoFinal = caminhoVideoFinal(userId, video.id);
      await subir(db, saida, caminhoFinal, "video/mp4");
      p.segundosDeRender = (p.segundosDeRender ?? 0) + r.segundos;
      // A capa, a miniatura e a gravação como pronto são outra etapa: o ffmpeg da montagem
      // já passou perto do teto de 300s, e a capa montada leva até 40s a mais.
      await salvar({ etapa: "finalizar", saida: caminhoFinal, duracaoFinal: sonda.duracao ?? total });
      // Mas, com folga, emenda aqui mesmo. Nada faz o vídeo andar além de alguém consultar:
      // quem fecha a aba durante a montagem deixaria o vídeo parado em "finalizar" até o
      // corte de 25 minutos -- que estorna e apaga um vídeo que já estava pronto.
      if (Date.now() - inicioDaChamada > SEGUNDOS_PRA_EMENDAR_FINALIZAR * 1000) return progressoDe(espec, p);
      etapaDaChamada = "finalizar";
    }

    // ---------- capa, miniatura e pronto ----------
    if (p.etapa === "finalizar") {
      if (!p.saida) throw new Error("A montagem terminou sem o vídeo final.");
      const emendas = emendasDoVideo(espec).slice(0, Math.max(0, p.clipes.length - 1));
      const saida = local("video.mp4");
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

          const marcaCapa = await marcaEfetiva(db, userId, espec.marca).catch(() => null);
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
      if (!feita) {
        // O quadro cru sai do vídeo pronto, que já está no bucket: baixa só quando precisa.
        // (Se a montagem emendou nesta mesma chamada, o arquivo ainda está no disco.)
        await (fs.existsSync(saida) ? Promise.resolve() : baixar(db, p.saida, saida))
          .then(() => rodarFfmpeg(argsMiniatura(saida, thumb, segundoDaCapa), 30_000))
          .catch(() => null);
      }

      const caminhoThumb = caminhoMiniatura(userId, video.id);
      // Capa é acessório: uma falha ao subir o jpg não pode derrubar um vídeo pronto.
      const capaSubiu = fs.existsSync(thumb) && (await subir(db, thumb, caminhoThumb, "image/jpeg").then(() => true, () => false));

      const saldoDepois = await saldoFal(falKey);
      const custo = p.saldoAntes != null && saldoDepois != null ? Math.max(0, Number((p.saldoAntes - saldoDepois).toFixed(4))) : null;
      p.etapa = "concluido";
      p.saldoDepois = saldoDepois;
      cronometrar();
      await db
        .from("videos")
        .update({
          status: "concluido",
          output_path: p.saida,
          thumb_path: capaSubiu ? caminhoThumb : null,
          duracao_segundos: p.duracaoFinal ?? relogioDoEspec(espec, !!p.telaFinalRenderizada).total,
          custo_real: custo,
          concluido_em: new Date().toISOString(),
          pipeline: p,
        })
        .eq("id", video.id)
        .eq("status", "gerando");
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
  // O mp4 que subiu na montagem e não chegou a ser gravado como pronto também é sobra.
  const sobras = [...(p?.temporarios ?? []), ...(p?.saida && p.etapa !== "concluido" ? [p.saida] : [])];
  if (sobras.length) await apagarEntradas(db, sobras);
}
