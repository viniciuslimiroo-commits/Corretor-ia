"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import {
  ANIMACOES,
  animacoesOferecidas,
  ANIMACOES_TEXTO,
  BUCKET_UPLOADS,
  CANTOS_APRESENTADOR,
  CHAMADAS,
  CREDITOS,
  EFEITOS,
  ESTILOS_LEGENDA,
  ESTILOS_TEXTO,
  FILTROS,
  ESTILO_TEXTO_POR_ID,
  FORMATOS,
  FORMATOS_APRESENTADOR,
  TAMANHOS_APRESENTADOR,
  TAMANHOS_MARCA_DAGUA,
  OPACIDADE_MARCA_DAGUA_PADRAO,
  DURACOES_CENA,
  LIMITES,
  MOVIMENTOS_360,
  MUSICAS,
  MUSICA_PADRAO,
  EFEITOS_SONOROS,
  POSICOES_TEXTO,
  SELOS_IMOVEL,
  TRANSICOES,
  VOZES,
  VOZ_PADRAO,
  canonizarAudio,
  custoDoVideo,
  itensDeAudioDoEspec,
  ehTransicao,
  relogioDoEspec,
  textosDaCena,
  gradeDaCena,
  temVideoCorrendo,
  type AnimacaoId,
  type AnimacaoTexto,
  type Apresentador,
  type MarcaDagua,
  type Cena,
  type EfeitoId,
  type EspecVideo,
  type EstiloTexto,
  type FiltroId,
  type Legendas,
  type FormatoId,
  type Movimento360Id,
  type MusicaId,
  type EfeitoSonoroId,
  type ElementoCena,
  type ItemAudio,
  type Narracao,
  type OrigemVoz,
  type PosicaoTexto,
  type TextoCena,
  type TransicaoId,
  type VozId,
} from "@/lib/video";
import { aplicarTemplateVideo, mudancasDoTemplate, TEMPLATES_VIDEO, templateVaiApagarTexto, type TemplateVideo } from "@/lib/video-templates";
import { pecasDoImovel, resumoDaFicha, valorComPeriodo } from "@/lib/ficha-imovel";
import { useIdioma } from "@/i18n/cliente";
import MenuContexto, { useMenuContexto, type ItemMenu } from "@/components/editor/menu-contexto";
import SeletorImovel from "@/components/seletor-imovel";
import LinhaDeFaixas from "@/components/editor/faixas/linha-de-faixas";
import BarraDaSelecao, { DeslizanteDaSubBarra } from "@/components/editor/barra-da-selecao";
import { useAvisos } from "@/components/editor/aviso-desfazer";
import ListaDaFoto from "@/components/editor/lista-da-foto";
import LegendaNoPalco from "@/components/editor/legenda-no-palco";
import { useHistorico } from "@/components/editor/usar-historico";
import { usePreviaDeAudio, type RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";
import { useTempoAoVivo } from "@/components/editor/usar-tempo-ao-vivo";
import { decodificarPicos, type PicosDaFaixa } from "@/lib/picos-audio";
import BibliotecaAudio from "@/components/editor/biblioteca-audio";
import GaleriaTexto from "@/components/editor/galeria-texto";
import GaleriaElementos, { type RespostaClipes } from "@/components/editor/galeria-elementos";
import ElementosNoPalco from "@/components/editor/elementos-no-palco";
import TextoComEfeito from "@/components/editor/texto-com-efeito";
import ApresentadorNoPalco from "@/components/editor/apresentador-no-palco";
import LembreteGravar from "@/components/editor/lembrete-gravar";
import { IDS_EFEITOS_TEXTO } from "@/lib/efeitos-texto/lista";
import PainelFiltros, { type EscopoCor } from "@/components/editor/painel-filtros";
import FotoComCor from "@/components/editor/foto-com-cor";
import { AJUSTES_NEUTROS, type Ajustes } from "@/lib/filtros";
import { COR_ELEMENTO_PADRAO, type IconeFicha } from "@/lib/elementos";
import { lerLegenda } from "@/lib/legenda-arquivo";
import { Icone } from "@/components/ui";
import { Alternar, BotaoEd, BotaoIcone, CartaoOpcao, Deslizante, Divisor, Nota, Pilula, Secao, Segmentado, Vazio, areaEd, campoEd, seletorEd } from "@/components/editor/ui-editor";
import Folha from "@/components/editor/folha";
import CabecalhoEditor from "@/components/editor/cabecalho-editor";
import TrilhoFerramentas from "@/components/editor/trilho-ferramentas";
import ModalVideoPronto from "@/components/editor/modal-video-pronto";
import PainelVideos, { type VideoDaLista } from "@/components/editor/painel-videos";
import VideoNoPalco from "@/components/editor/video-no-palco";
import { useMidia } from "@/components/editor/usar-midia";
import { continuaNaProxima, partesDoClipe } from "@/lib/clipes-do-editor";
import { useResumoEdicao } from "@/components/editor/usar-resumo-edicao";
import {
  acoesDaSelecao,
  aplicarGesto,
  apagar as apagarDaLinha,
  audiosEfetivos,
  blocosDoEstado,
  botaoDeslocar,
  botaoFimAqui,
  botaoInicioAqui,
  ctxDoEstado,
  dividirNoTempo,
  duplicarNaFoto,
  faixaAberta as qualFaixaAbre,
  legendasDaTranscricao,
  mesmoRef,
  moverParaFoto,
  pontosDeEncaixe,
  realinharSelecao,
  zoomParaAjustar,
  type BlocoLinha,
  type EstadoLinha,
  type FaixaId,
  type Gesto,
  type Medidas,
  type RefItem,
} from "@/lib/linha-do-tempo";
import { escolherMusica, inicioDaVoz, itensDaPrevia, marcasDaPrevia, musicaNova, novoIdDeAudio, volumeDaMusica, volumeDaVoz, vozNova, type FontesDoEditor } from "@/lib/audio-do-editor";

// Vídeo: escolhe as fotos (do imóvel ou enviadas), ordena as cenas, ajusta efeito,
// legenda e duração de cada uma, escolhe formato, música, textos, narração e gera. O
// resultado toca aqui mesmo, com baixar e compartilhar. As cenas animadas e a narração
// custam crédito extra e o botão mostra a conta antes de cobrar.

type Geracao = { id: string; acao: string; detalhe: string; status: string; antes: string | null; depois: string | null };

type CenaUI = {
  chave: string;
  tipo: Cena["tipo"];
  jobId?: string;
  arquivo?: string;
  miniatura: string | null;
  rotulo: string;
  temAntes: boolean;
  ehClipe: boolean;
  /** Foto (ou vídeo) equirretangular, detectada pela proporção 2:1: vira tour 360. */
  eh360: boolean;
  /** Panorâmica de celular (mais larga que 2.2:1): não tem esfera, mas pede deslizar. */
  ehPanoramica?: boolean;
  efeito: EfeitoId;
  animacao: AnimacaoId;
  movimento: Movimento360Id;
  legenda: string;
  duracao: number;
  melhorar: boolean;
  /** Textos por cima da cena, além da legenda. */
  textos?: TextoCena[];
  /** Peças gráficas por cima da cena: ficha, selo, seta, moldura, contato. */
  elementos?: ElementoCena[];
  /** Acabamento de cor desta cena. Ausente = o do vídeo. */
  filtro?: FiltroId;
  /** Quanto do filtro desta cena entra (0 a 1). */
  intensidade?: number;
  /** Ajustes finos desta cena. Ausente = os do vídeo. */
  ajustes?: Partial<Ajustes>;
  /** Correção de luz, de -0.25 a 0.25. */
  luz?: number;
  /** Clipe: de que segundo do arquivo esta cena começa. */
  inicio?: number;
  /** Giro no sentido do relógio: 0, 90, 180 ou 270. */
  giro?: number;
  espelho?: boolean;
  /** Só onde há vídeo: 0,5x a 2x. */
  velocidade?: number;
  /** Só onde há vídeo: para no quadro de `inicio`. */
  congelar?: boolean;
  /** A emenda desta cena pra próxima. Ausente = a do vídeo. */
  transicao?: TransicaoId;
  /** Cena animada cujo clipe já existe no servidor: gerar de novo com o mesmo movimento
   *  e a mesma duração não custa crédito. Vem do servidor ao editar um vídeo pronto. */
  animacaoGuardada?: { animacao: AnimacaoId; duracao: number } | null;
  /** Clipe: um endereço que o navegador toca (o arquivo local enviado, ou o assinado do
   *  servidor). É o que faz o palco mostrar o vídeo de verdade. */
  videoUrl?: string | null;
  /** Clipe: quanto dura o arquivo inteiro (limita o "Começar em"). */
  duracaoArquivo?: number;
};

/** O que o servidor devolve por cena, ao lado do espec, pra reabrir um vídeo pronto. */
type EdicaoCena = { miniatura: string | null; rotulo: string; temAntes: boolean; ehClipe: boolean; animacaoGuardada: { animacao: AnimacaoId; duracao: number } | null; clipeUrl?: string | null };

/**
 * Quanto tempo a geração costuma levar.
 *
 * O que pesa é a cena animada: o modelo de vídeo recebe `duracao × 24` quadros, e 8s
 * pedem 161 -- o máximo que ele aceita, e a requisição mais cara que dá pra fazer. As
 * outras cenas são ffmpeg local e andam rápido. Números medidos, não chutados.
 */
function esperaEmSegundos(cenas: { tipo: string; duracao: number }[]): number {
  let s = 20; // montagem final, miniatura, upload
  for (const c of cenas) {
    if (c.tipo === "animada") s += 45 + c.duracao * 18;
    else if (c.tipo === "tour360") s += c.duracao * 7;
    else s += c.duracao * 2;
  }
  return Math.round(s);
}

function relogio(seg: number): string {
  const m = Math.floor(seg / 60);
  const r = seg % 60;
  return m > 0 ? `${m}min ${String(r).padStart(2, "0")}s` : `${r}s`;
}

/**
 * O que a foto é pela proporção: 2:1 é a assinatura da 360 equirretangular; mais larga
 * que isso é panorâmica de celular.
 *
 * A distinção importa porque o produto trata as duas de jeitos diferentes, e por muito
 * tempo só avisou sobre uma. A 360 vira passeio de verdade (v360, a câmera anda DENTRO da
 * esfera). A panorâmica comum não tem esfera nenhuma -- o que ela pede é a câmera
 * deslizando na horizontal, que já existia como efeito "Passear →" e ninguém ligava,
 * porque o padrão era "Aproximar" e nada na tela dizia o contrário. O cartão do Início
 * prometia "foto 360 ou panorâmica vira passeio" e, pra metade da promessa, a pessoa tinha
 * que adivinhar.
 */
type Formato = "comum" | "esferica" | "panoramica";

async function formatoDaFoto(f: File): Promise<Formato> {
  if (!f.type.startsWith("image/")) return "comum";
  try {
    const bmp = await createImageBitmap(f);
    const { width, height } = bmp;
    bmp.close();
    const razao = width / height;
    if (razao > 1.9 && razao < 2.1 && width >= 2000) return "esferica";
    // 2.2:1 pra cima é foto que não cabe no quadro do vídeo de jeito nenhum: mostrar
    // parada significa cortar as pontas, que é justamente o que a pessoa não quer.
    if (razao >= 2.2) return "panoramica";
    return "comum";
  } catch {
    return "comum";
  }
}

/**
 * Duração e um quadro de miniatura de um vídeo do aparelho, antes de subir. Sem isso o clipe
 * entrava com 6s fixos (fosse de 2s ou de 40s) e sem imagem nenhuma na linha do tempo.
 */
function lerVideoLocal(f: File): Promise<{ url: string; duracao: number; miniatura: string | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    let feito = false;
    const fim = (duracao: number, miniatura: string | null) => {
      if (feito) return;
      feito = true;
      v.removeAttribute("src");
      resolve({ url, duracao: Number.isFinite(duracao) ? duracao : 0, miniatura });
    };
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = Math.max(1, Math.round((320 * v.videoHeight) / Math.max(1, v.videoWidth)));
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        fim(v.duration, c.toDataURL("image/jpeg", 0.72));
      } catch {
        fim(v.duration, null);
      }
    };
    v.onerror = () => fim(0, null);
    setTimeout(() => fim(v.duration, null), 8000);
    v.src = url;
  });
}

type VideoResumo = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null; compartilhado: boolean; erro: string | null };

type Resultado = { videoId: string; url: string; miniatura: string | null; duracao: number | null; avisos: string[]; formato: string; titulo?: string; doEditor?: boolean };

let contador = 0;
const chave = () => `c${Date.now()}-${contador++}`;

/**
 * Do espec guardado no banco de volta pras cenas da tela. É o caminho inverso do `useMemo`
 * que monta o espec: o que a tela precisa e o espec não tem (miniatura, rótulo, se há
 * "antes") vem em `info`, cena a cena, do servidor.
 */
function cenasDoEspec(e: EspecVideo, info: EdicaoCena[]): CenaUI[] {
  return e.cenas.map((c, i) => ({
    chave: chave(),
    tipo: c.tipo,
    jobId: c.jobId,
    arquivo: c.arquivo,
    miniatura: info[i]?.miniatura ?? null,
    rotulo: info[i]?.rotulo ?? (c.jobId ? "Imagem da Encena" : "Foto enviada"),
    temAntes: info[i]?.temAntes ?? false,
    ehClipe: info[i]?.ehClipe ?? c.tipo === "clipe",
    eh360: c.tipo === "tour360",
    efeito: c.efeito ?? "aproximar",
    animacao: c.animacao ?? "caminhar",
    movimento: c.movimento ?? "olhar_volta",
    legenda: c.legenda ?? "",
    textos: c.textos,
    elementos: c.elementos,
    duracao: c.duracao ?? LIMITES.duracaoPadrao,
    melhorar: c.melhorar ?? false,
    filtro: c.filtro,
    intensidade: c.intensidade,
    ajustes: c.ajustes,
    luz: c.luz,
    inicio: c.inicio,
    giro: c.giro,
    espelho: c.espelho,
    velocidade: c.velocidade,
    congelar: c.congelar,
    // O espec vem cru do banco: vídeo antigo guarda "suave", que não está mais no
    // catálogo. Normalizar aqui é o que impede o chip de aparecer em branco.
    transicao: c.transicao ? ehTransicao(c.transicao) : undefined,
    animacaoGuardada: info[i]?.animacaoGuardada ?? null,
    videoUrl: info[i]?.clipeUrl ?? null,
  }));
}

/**
 * A trilha de ferramentas do editor.
 *
 * Oito assuntos, um por ícone. É a mesma lista que estava empilhada numa coluna só --
 * o que muda é que agora aparece um de cada vez, e o ícone diz onde procurar.
 *
 * A ordem é a do trabalho: primeiro a mídia, depois o modelo que dá o ritmo, depois som,
 * texto, você, cor e enquadramento. "Vídeos" fica por último porque é arquivo, não edição.
 */
const ABAS = [
  { id: "midia", rotulo: "Mídia", icone: "materiais", dica: "Fotos do imóvel e arquivos do seu aparelho" },
  { id: "videos", rotulo: "Vídeos", icone: "video", dica: "Seus vídeos prontos: toque pra pôr na linha do tempo" },
  { id: "modelos", rotulo: "Modelos", icone: "lote", dica: "Um ponto de partida por tipo de imóvel" },
  { id: "audio", rotulo: "Áudio", icone: "som", dica: "Músicas e efeitos sonoros, com prévia" },
  { id: "texto", rotulo: "Texto", icone: "editar_prompt", dica: "Modelos de texto e efeitos de entrada" },
  { id: "elementos", rotulo: "Elementos", icone: "elementos", dica: "Ficha do imóvel, selos, setas, molduras e contato" },
  { id: "legendas", rotulo: "Legendas", icone: "legenda", dica: "Narração e legenda automática" },
  { id: "transicoes", rotulo: "Transições", icone: "converter_hd", dica: "Como uma cena vira a outra" },
  { id: "voce", rotulo: "Você", icone: "equipe", dica: "Você no vídeo: aparecendo, ou só a sua voz" },
  { id: "cor", rotulo: "Filtros", icone: "magica", dica: "Filtros e ajustes de luz e cor, vendo na foto" },
  { id: "ajustes", rotulo: "Ajustes", icone: "configuracoes", dica: "Formato, título, capa, tela final e marca" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** A proporção de cada formato, pro palco mostrar o quadro certo. */
const PROPORCAO: Record<FormatoId, string> = { "9:16": "9 / 16", "16:9": "16 / 9", "1:1": "1 / 1", "4:5": "4 / 5" };
const PROPORCAO_NUM: Record<FormatoId, number> = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5 };

/**
 * Um pedaço do palco que precisa do segundo exato ENQUANTO toca (legenda, Você): ele assina o
 * relógio e redesenha sozinho, sem o editor inteiro redesenhar junto.
 */
function AoVivo({ relogio, tempo, tocando, children }: { relogio: RelogioDaPrevia; tempo: number; tocando: boolean; children: (t: number) => React.ReactNode }) {
  const t = useTempoAoVivo(relogio, tempo, tocando);
  return <>{children(t)}</>;
}

/**
 * O Editor Encena de vídeo: tela cheia, escura, uma ferramenta de cada vez na trilha da
 * esquerda e a linha do tempo embaixo -- pra quem quer mexer mais.
 *
 * O caminho RÁPIDO é outra página (/videos), a de antes do Editor. Houve uma tentativa de
 * fazer dela uma "forma simples" deste componente, e mesmo enxuta ficava informação
 * demais: a régua de "enxuto" era a do Editor. Foi desfeita a pedido de quem usa.
 */
export default function EditorDeVideo() {
  const c = useConta();
  const { user, token } = c;
  // O idioma vale pras palavras que entram DENTRO do vídeo -- "3 quartos", "Preço",
  // "/mês". Elas não são interface: saem desenhadas no arquivo que vai pro cliente.
  const { idioma } = useIdioma();

  const [imovelId, setImovelId] = useState<string | null>(null);
  const [geracoes, setGeracoes] = useState<Geracao[]>([]);
  const [cenas, setCenas] = useState<CenaUI[]>([]);
  /**
   * O que está selecionado: uma cena, um trecho de música ou de voz, um texto, um adesivo, o
   * Você, uma legenda (RefItem, lib/linha-do-tempo.ts). Antes só cena podia ser escolhida.
   */
  const [selecao, setSelecao] = useState<RefItem | null>(null);
  /** A cena selecionada, quando o selecionado é uma cena. */
  const selecionada = selecao?.faixa === "cenas" ? selecao.chave : null;
  /** Seleciona (ou tira) uma CENA. Tirar não mexe numa seleção que não é de cena. */
  const setSelecionada = useCallback((k: string | null | ((atual: string | null) => string | null)) => {
    setSelecao((atual) => {
      const antes = atual?.faixa === "cenas" ? atual.chave : null;
      const novo = typeof k === "function" ? k(antes) : k;
      if (novo) return { faixa: "cenas", chave: novo };
      return atual?.faixa === "cenas" ? null : atual;
    });
  }, []);
  const arrastando = useRef<string | null>(null);
  const [formato, setFormato] = useState<FormatoId>("9:16");
  /**
   * O ÁUDIO como TRECHOS na linha do tempo (música e voz). Começa como sempre: "Calma" do
   * começo ao fim. Antes era um valor só (`musica`): a música não aparecia na linha do tempo,
   * não cortava e não tocava no Play.
   */
  const [audios, setAudios] = useState<ItemAudio[]>(() => [musicaNova(MUSICA_PADRAO, LIMITES.musicaVolumePadrao, "musica00")]);
  /** A música "da vez" (a do primeiro trecho), pro que pensa em uma música só: resumo, modelos, biblioteca. */
  const musicaDoPrimeiroTrecho = audios.find((a) => a.fonte.tipo === "musica");
  const musica: MusicaId = musicaDoPrimeiroTrecho && musicaDoPrimeiroTrecho.fonte.tipo === "musica" ? musicaDoPrimeiroTrecho.fonte.id : "nenhuma";
  const [transicao, setTransicao] = useState<TransicaoId>("dissolver");
  /** Acabamento de cor do vídeo inteiro. Cada cena pode sair da linha no painel dela. */
  const [filtro, setFiltro] = useState<FiltroId>("natural");
  const [intensidadeFiltro, setIntensidadeFiltro] = useState(1);
  const [ajustesVideo, setAjustesVideo] = useState<Partial<Ajustes> | undefined>(undefined);
  /** A aba Filtros mexe no vídeo inteiro ou só na cena aberta. */
  const [escopoCor, setEscopoCor] = useState<EscopoCor>("video");
  /** Capa com o nome e o preço escritos por cima do quadro. */
  const [capaMontada, setCapaMontada] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [local, setLocal] = useState("");
  const [telaFinal, setTelaFinal] = useState(true);
  // A marca d'água: nula = desligada. Nasce desligada porque ela escreve por cima do
  // imóvel, e ninguém deve ganhar isso sem pedir.
  const [marcaDagua, setMarcaDagua] = useState<MarcaDagua | null>(null);
  const [chamada, setChamada] = useState(CHAMADAS[0]);
  /** Chave da cena que vira a miniatura. null = a primeira. */
  const [capa, setCapa] = useState<string | null>(null);
  /** Vídeo pronto que foi reaberto pra edição. Gerar cria outro; este continua na lista. */
  const [editandoDe, setEditandoDe] = useState<{ id: string; titulo: string } | null>(null);
  /** "3 quartos · 2 vagas · 120 m²", da ficha do imóvel escolhido. */
  const [fichaResumo, setFichaResumo] = useState("");
  /** A ficha crua e a marca: viram as PEÇAS que o editor oferece pra virar texto. */
  const [ficha, setFicha] = useState<Record<string, unknown> | null>(null);
  const [marca, setMarca] = useState<{ nome?: string | null; creci?: string | null; whatsapp?: string | null; cor?: string | null; logo?: string | null; instagram?: string | null; telaFinalPossivel?: boolean } | null>(null);
  const [narrar, setNarrar] = useState(false);
  /** De onde vem a voz: IA, gravada aqui, ou um arquivo que a pessoa já tinha. */
  const [origemVoz, setOrigemVoz] = useState<OrigemVoz>("ia");
  const [roteiro, setRoteiro] = useState("");
  const [voz, setVoz] = useState<VozId>("laura");
  /** Voz própria pronta: caminho no bucket + URL local pra ouvir antes de gerar. */
  const [vozArquivo, setVozArquivo] = useState<{ caminho: string; url: string; nome: string } | null>(null);
  /** Histórico de gravações e áudios enviados no editor, permitindo reutilização. */
  const [gravacoesVoz, setGravacoesVoz] = useState<Array<{ id: string; caminho: string; url: string; nome: string; criadoEm: string }>>([]);
  /** Cena copiada para colar via menu de contexto. */
  const [cenaCopiada, setCenaCopiada] = useState<CenaUI | null>(null);
  // Volume e início da voz saem dos TRECHOS de voz: o controle mostra o primeiro e mexe em todos.
  const primeiraVoz = audios.filter((a) => a.fonte.tipo === "voz").reduce<ItemAudio | null>((p, a) => (!p || a.noVideo < p.noVideo ? a : p), null) ?? VOZ_PADRAO;
  const vozVolume = primeiraVoz.volume;
  const vozInicio = primeiraVoz.noVideo;
  /** Duração do arquivo de voz (gravada, enviada ou de IA já gerada), quando o navegador já leu. */
  const [segundosDaVoz, setSegundosDaVoz] = useState<number | null>(null);
  const [musicaVolume, setMusicaVolume] = useState(LIMITES.musicaVolumePadrao);
  /** Legendas queimadas no vídeo, com o tempo de cada trecho. */
  const [legendas, setLegendas] = useState<Legendas | null>(null);
  /** De qual arquivo de voz a transcrição saiu: trocando a voz, a legenda fica fora de sincronia. */
  const [legendasDaVoz, setLegendasDaVoz] = useState<string | null>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  /** Você aparecendo no vídeo: o arquivo, os ajustes e a câmera enquanto grava. */
  const [apresentador, setApresentador] = useState<Apresentador | null>(null);
  const [apreUrl, setApreUrl] = useState<string | null>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [gravandoVideo, setGravandoVideo] = useState(false);
  const [segundosVideo, setSegundosVideo] = useState(0);
  const [enviandoApre, setEnviandoApre] = useState(false);
  const gravadorVideo = useRef<MediaRecorder | null>(null);
  const previaCamera = useRef<HTMLVideoElement | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundosGravando, setSegundosGravando] = useState(0);
  const [enviandoVoz, setEnviandoVoz] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(0);
  /** Aba aberta na trilha de ferramentas. Uma de cada vez, como em qualquer editor. */
  const [aba, setAbaCrua] = useState<AbaId>("midia");
  /** O painel da ferramenta está à vista (computador: a coluna; celular: a folha). */
  const [painelAberto, setPainelAberto] = useState(() => !(typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches));
  /** Celular: a folha mostra os ajustes da cena, em vez de uma ferramenta. */
  const [inspetorNaFolha, setInspetorNaFolha] = useState(false);
  /** Ir pra uma aba sempre MOSTRA o painel dela (quem chama quer que a pessoa veja). */
  const setAba = useCallback((a: AbaId) => {
    setAbaCrua(a);
    setPainelAberto(true);
    setInspetorNaFolha(false);
  }, []);
  /** Vídeos da lista sendo buscados pra entrar na linha do tempo. */
  const [videosEntrando, setVideosEntrando] = useState<Set<string>>(() => new Set());
  /** Clipes enviados do aparelho nesta sessão: dá pra pôr de novo sem enviar de novo. */
  const [enviados, setEnviados] = useState<{ chave: string; arquivo: string; url: string; miniatura: string | null; duracao: number; nome: string }[]>([]);
  /** Depois de pôr uma cena: o cursor vai até ela (o palco mostra o que entrou). */
  const [irPara, setIrPara] = useState<string | null>(null);
  // Texto escolhido na aba Texto ANTES de existir foto. Ele pediu que as opções de texto
  // aparecessem "independente de ter imagem": a galeria fica sempre à vista, e o texto
  // tocado sem cena espera aqui e entra na primeira cena que aparecer.
  const [textoPendente, setTextoPendente] = useState<TextoCena | null>(null);
  // Mexer na coisa, EM CIMA da coisa: botão direito (ou dedo segurado) no palco.
  const menu = useMenuContexto();
  /** Qual texto do palco está aberto pra digitar. `null` = nenhum; `-1` = a legenda. */
  const [editando, setEditando] = useState<{ chave: string; indice: number } | null>(null);
  const [textoEmDigitacao, setTextoEmDigitacao] = useState<string>("");
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  /** Onde o cabeçote está, em segundos (100ms de folga; o quadro a quadro vem do relógio da prévia). */
  const [tempo, setTempo] = useState(0);
  /** Zoom da linha do tempo, em pixels por segundo. */
  const [zoomLinha, setZoomLinha] = useState(30);
  /** Som curto em cada virada de cena. */
  const [efeitoSonoro, setEfeitoSonoro] = useState<EfeitoSonoroId>("nenhum");
  // ---- linha do tempo com faixas: o que é só de interface (não entra no desfazer) ----
  /** A última faixa aberta à mão (celular: uma aberta por vez). */
  const [ultimaFaixa, setUltimaFaixa] = useState<FaixaId | null>(null);
  /** Botão "Faixas": todas abertas (o palco encolhe). */
  const [todasAbertas, setTodasAbertas] = useState(false);
  /** A sub-barra aberta na barra da seleção, presa ao item em que foi aberta. */
  const [subBarra, setSubBarra] = useState<{ tipo: "volume" | "fade" | "trecho" | "velocidade" | "texto"; de: string } | null>(null);
  /** Uma foto com vários textos/adesivos: a lista pra escolher um. */
  const [listaAberta, setListaAberta] = useState<BlocoLinha | null>(null);
  /** A forma de onda de cada música do catálogo (public/musica/picos.json). */
  const [picos, setPicos] = useState<Partial<Record<MusicaId, PicosDaFaixa>>>({});
  /** Duração do vídeo do Você, quando o navegador já leu. */
  const [segundosDoVoce, setSegundosDoVoce] = useState<number | null>(null);
  /** Altura do palco em px (a legenda no palco se mede por ela). */
  const [alturaPalco, setAlturaPalco] = useState(0);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; mensagem: string } | null>(null);
  /** Segundos desde que a geração começou. Barra que anda sozinha não distingue
   *  "processando" de "travado" -- quem paga 2 créditos e olha isso por três minutos
   *  conclui que quebrou. O relógio e a estimativa fazem essa distinção. */
  const [segundosGerando, setSegundosGerando] = useState(0);

  // O relógio zera em `gerar()`, na hora do clique; aqui só se conta enquanto gera.
  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => setSegundosGerando((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [gerando]);

  // A prévia da câmera: o fluxo entra no <video> num efeito, não durante o render.
  useEffect(() => {
    if (previaCamera.current && camera) previaCamera.current.srcObject = camera;
  }, [camera]);

  // Relógio da gravação de vídeo, com o mesmo teto da voz.
  useEffect(() => {
    if (!gravandoVideo) return;
    const t = setInterval(() => {
      setSegundosVideo((v) => {
        if (v + 1 >= LIMITES.vozSegundosMax) gravadorVideo.current?.stop();
        return v + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [gravandoVideo]);

  // Relógio da gravação. Para sozinho no teto: gravação esquecida virava arquivo grande
  // e espera longa, e ninguém narra um Reel por três minutos.
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => {
      setSegundosGravando((v) => {
        if (v + 1 >= LIMITES.vozSegundosMax) gravador.current?.stop();
        return v + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [gravando]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoResumo[] | null>(null);

  /**
   * A narração SEM o tempo (o tempo está nos trechos de voz). A voz só entra quando está
   * PRONTA: roteiro escrito, ou arquivo já no servidor. Meio caminho (gravou e não usou) não
   * vira vídeo mudo por engano.
   */
  const narracaoBase: Narracao | null = useMemo(
    () =>
      !narrar
        ? null
        : origemVoz === "ia"
          ? roteiro.trim().length >= 10
            ? ({ origem: "ia", roteiro: roteiro.trim(), voz } as Narracao)
            : null
          : vozArquivo
            ? ({ origem: origemVoz, arquivo: vozArquivo.caminho } as Narracao)
            : null,
    [narrar, origemVoz, roteiro, voz, vozArquivo]
  );

  const espec: EspecVideo = useMemo(
    () => ({
      formato,
      cenas: cenas.map((s) => ({ tipo: s.tipo, jobId: s.jobId, arquivo: s.arquivo, efeito: s.efeito, animacao: s.animacao, movimento: s.movimento, legenda: s.legenda || undefined, textos: s.textos, elementos: s.elementos, duracao: s.duracao, melhorar: s.melhorar, inicio: s.inicio, transicao: s.transicao, filtro: s.filtro, intensidade: s.intensidade, ajustes: s.ajustes, luz: s.luz, giro: s.giro, espelho: s.espelho, velocidade: s.velocidade, congelar: s.congelar })),
      // Música e voz na forma CANÔNICA (video.ts, `canonizarAudio`): o que não foi cortado nem
      // dividido volta pro formato antigo, byte a byte; o resto vai como trechos (versão 2).
      ...canonizarAudio({ itens: audiosEfetivos(audios, narracaoBase), narracao: narracaoBase, musicaVolume }),
      titulo,
      preco,
      local,
      telaFinal,
      chamada: telaFinal ? chamada : "",
      transicao,
      capa: Math.max(0, cenas.findIndex((s) => s.chave === capa)),
      legendas,
      apresentador,
      marcaDagua,
      filtro,
      intensidadeFiltro: filtro !== "natural" && intensidadeFiltro < 1 ? intensidadeFiltro : undefined,
      ajustes: ajustesVideo,
      capaMontada,
      efeitoSonoro,
    }),
    [formato, cenas, audios, narracaoBase, musicaVolume, titulo, preco, local, telaFinal, chamada, transicao, capa, legendas, apresentador, marcaDagua, filtro, intensidadeFiltro, ajustesVideo, capaMontada, efeitoSonoro]
  );
  // Resumo dos ajustes em uma linha: quem não abriu ainda vê o que está valendo.
  // As peças que o editor oferece: o que está preenchido na ficha e na marca, e nada mais.
  const pecas = pecasDoImovel(ficha, marca, idioma);

  /**
   * Os dados do imóvel no formato que as peças gráficas desenham: ícone + palavra.
   *
   * O mapa é explícito, e não um `id as IconeFicha`: a ficha ganha campo novo de vez em
   * quando, e um id desconhecido viraria um ícone que não existe -- que o librsvg
   * desenha como nada, sem erro.
   */
  const itensDaFicha = useMemo(() => {
    const mapa: Record<string, IconeFicha> = {
      preco: "preco",
      dormitorios: "quarto",
      suites: "suite",
      banheiros: "banheiro",
      vagas: "vaga",
      area: "area",
      bairro: "local",
      cidade: "local",
    };
    return pecas
      .filter((p) => mapa[p.id])
      .slice(0, LIMITES.itensDaFichaMax)
      .map((p) => ({ icone: mapa[p.id], texto: p.texto }));
  }, [pecas]);

  const corDaMarca = /^#[0-9a-fA-F]{6}$/.test(marca?.cor ?? "") ? (marca?.cor as string) : COR_ELEMENTO_PADRAO;

  /**
   * O modelo aberto pra conferência. Clicar num modelo NÃO aplica: mostra o que vai
   * mudar e espera o segundo clique. Aplicar troca os textos das cenas, e aqui não
   * existe desfazer -- então a lista do que muda vem antes, não depois.
   */
  const [templateAberto, setTemplateAberto] = useState<TemplateVideo | null>(null);

  /**
   * Escolheu uma música na aba Áudio (D6): cria, troca ou tira o trecho -- e MOSTRA: a faixa
   * Música abre, o trecho novo fica selecionado e o aviso diz o que aconteceu, com Desfazer.
   */
  function escolherMusicaDaBiblioteca(id: MusicaId) {
    const m = escolherMusica(audios, selecao, id, musicaVolume);
    if (m.audios === audios) return;
    historico.novoPasso();
    setAudios(m.audios);
    setSelecao(m.selecao);
    if (m.abrir) setUltimaFaixa(m.abrir);
    if (m.aviso) avisar(m.aviso, { desfazer: () => historico.desfazer() });
    resumoEdicao.registrarEdicao("musica", "botao");
    // No celular a folha desce: a música aparece selecionada na linha do tempo, com a barra
    // de cortar à mão (como no CapCut, que volta pra linha depois de "Usar").
    if (celular && m.abrir) setPainelAberto(false);
  }

  function aplicarTemplate(t: TemplateVideo) {
    const novo = aplicarTemplateVideo(t, espec, pecas, { temWhatsapp: !!marca?.whatsapp });
    setFormato(novo.formato);
    // A música do modelo entra como uma escolha na biblioteca, sem seleção (troca todos os trechos).
    setAudios((l) => escolherMusica(l, null, novo.musica, musicaVolume).audios);
    setTransicao(novo.transicao);
    setTelaFinal(novo.telaFinal);
    setChamada(novo.chamada || CHAMADAS[0]);
    setFiltro(novo.filtro ?? "natural");
    setCenas((atuais) =>
      atuais.map((s, i) => {
        const c = novo.cenas[i];
        if (!c) return s;
        // Partes seguidas do mesmo vídeo não mudam de duração nem de emenda: é o que as mantém
        // emendando sem soluço (lib/clipes-do-editor.ts).
        const parte = continuaNaProxima(atuais, i) || (i > 0 && continuaNaProxima(atuais, i - 1));
        return { ...s, efeito: c.efeito ?? s.efeito, duracao: parte ? s.duracao : c.duracao ?? s.duracao, textos: c.textos, legenda: "", transicao: continuaNaProxima(atuais, i) ? s.transicao : undefined, filtro: undefined, luz: undefined };
      })
    );
    setTemplateAberto(null);
  }


  // Cena animada reaberta de um vídeo pronto, com o mesmo movimento e duração: o clipe já
  // existe e o servidor não cobra (ele confere por conta própria; isto só mostra a conta).
  const animadasGratis = cenas.filter((s) => s.tipo === "animada" && s.animacaoGuardada && s.animacaoGuardada.animacao === s.animacao && s.animacaoGuardada.duracao === s.duracao).length;
  const custo = Math.max(0, custoDoVideo(espec) - animadasGratis * CREDITOS.animada);
  const esperaTotal = esperaEmSegundos(espec.cenas.map((c) => ({ tipo: c.tipo, duracao: c.duracao ?? 4 })));
  /**
   * O RELÓGIO do vídeo: onde cada clipe começa e quanto o vídeo dura, com as emendas.
   *
   * É a mesma conta da montagem (video.ts, `relogioDoVideo`). Antes a linha do tempo
   * somava as durações e ignorava que cada emenda sobrepõe duas cenas: com 8 cenas e
   * Dissolver, a régua dizia 4s a mais que o vídeo pronto.
   *
   * A tela final só conta se vai sair: sem nome, WhatsApp nem logo (da pessoa ou da
   * imobiliária) a montagem pula, e o vídeo fica 3,4s mais curto do que a régua dizia.
   */
  const telaFinalEntra = telaFinal && marca?.telaFinalPossivel !== false;
  const relogioDaLinha = useMemo(() => relogioDoEspec(espec, telaFinalEntra), [espec, telaFinalEntra]);
  const duracao = relogioDaLinha.total;

  /** Os trechos de voz, com o padrão quando a narração está ligada e ainda não há nenhum. */
  const comVoz = (l: ItemAudio[]) => (l.some((a) => a.fonte.tipo === "voz") ? l : [...l, { ...VOZ_PADRAO, fonte: { tipo: "voz" as const } }]);
  function setVozVolume(v: number) {
    setAudios((l) => volumeDaVoz(comVoz(l), v));
  }
  /** "Começa em": a voz inteira anda, e as legendas (que escrevem a fala dela) vão junto. */
  function setVozInicio(v: number) {
    const r = inicioDaVoz(comVoz(audios), v, duracao);
    setAudios(r.audios);
    if (r.delta && legendas) {
      setLegendas({ ...legendas, trechos: legendas.trechos.map((t) => ({ ...t, inicio: Math.max(0, Math.round((t.inicio + r.delta) * 100) / 100), fim: Math.max(0.1, Math.round((t.fim + r.delta) * 100) / 100) })) });
    }
  }

  // Quanto dura o arquivo de voz: sem isso, o bloco da voz na linha do tempo não tem fim.
  useEffect(() => {
    const url = vozArquivo?.url;
    if (!url) {
      Promise.resolve().then(() => setSegundosDaVoz(null));
      return;
    }
    let vivo = true;
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      if (vivo && Number.isFinite(a.duration) && a.duration > 0) setSegundosDaVoz(Math.round(a.duration * 100) / 100);
    };
    a.src = url;
    return () => {
      vivo = false;
      a.removeAttribute("src");
    };
  }, [vozArquivo?.url]);

  const carregarVideos = useCallback(async () => {
    const t = await token();
    const r = await fetch("/api/video", { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    return (d.videos ?? []) as VideoResumo[];
  }, [token]);

  useEffect(() => {
    if (!user) return;
    carregarVideos()
      .then(setVideos)
      .catch(() => setVideos([]));
  }, [user, carregarVideos]);

  // A marca vira PEÇA de texto (nome, CRECI, WhatsApp) junto com a ficha do imóvel.
  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/marca", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => setMarca({ nome: d.nome, creci: d.creci, whatsapp: d.whatsapp, cor: d.cor_marca ?? d.cor, logo: d.logoUrl ?? d.logo_url ?? null, instagram: d.instagram, telaFinalPossivel: d.telaFinalPossivel !== false }))
      .catch(() => {});
  }, [user, token]);

  // Chegou com `?job=`: uma imagem da Encena querendo virar cena. É o caminho "Animar esta
  // imagem" / "Usar em vídeo" do editor -- sem baixar e subir de novo. Roda uma vez por
  // job, e antes de qualquer imóvel estar escolhido: a imagem pode não ter imóvel nenhum.
  const jobDaUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    // `?editar=`: um vídeo pronto (da Galeria) abrindo direto em edição.
    const editar = params.get("editar");
    if (editar && jobDaUrl.current !== `editar:${editar}`) {
      jobDaUrl.current = `editar:${editar}`;
      window.history.replaceState(null, "", window.location.pathname);
      editarVideo(editar);
      return;
    }
    // `?imovel=`: veio da página do imóvel. Só escolhe o imóvel; as fotos dele aparecem
    // sozinhas na coluna da esquerda, e quem monta a linha do tempo é a pessoa.
    const doImovel = params.get("imovel");
    if (doImovel && jobDaUrl.current !== `imovel:${doImovel}`) {
      jobDaUrl.current = `imovel:${doImovel}`;
      setImovelId((atual) => atual ?? doImovel);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    const id = params.get("job");
    if (!id || jobDaUrl.current === id) return;
    jobDaUrl.current = id;
    token()
      .then((t) => fetch(`/api/job/${id}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (d.status !== "concluido" || !d.url) return;
        if (d.imovelId) setImovelId((atual) => atual ?? d.imovelId);
        adicionarGeracao({ id, acao: "Imagem da Encena", detalhe: "", status: "concluido", antes: null, depois: d.url });
        // Limpa a URL: um F5 não deve pendurar a mesma cena de novo.
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editarVideo muda a cada render; o ref garante uma vez por id
  }, [user, token]);

  // Chegou a primeira cena com um texto esperando: ele entra nela.
  useEffect(() => {
    if (!textoPendente || cenas.length === 0) return;
    const alvo = cenas[Math.max(0, cenas.findIndex((s) => s.chave === selecionada))] ?? cenas[0];
    const t = textoPendente;
    Promise.resolve().then(() => {
      setTextoPendente(null);
      adicionarTexto(alvo.chave, t);
    });
  }, [textoPendente, cenas, selecionada]);

  // Trocou de imóvel: carrega as gerações dele e sugere título/local.
  useEffect(() => {
    if (!user || !imovelId) {
      Promise.resolve().then(() => {
        setGeracoes([]);
        setFichaResumo("");
      });
      return;
    }
    let vivo = true;
    token()
      .then((t) => fetch(`/api/imoveis/${imovelId}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (!vivo || !d.imovel) return;
        setGeracoes((d.geracoes ?? []).filter((g: Geracao) => g.status === "concluido" && g.depois));
        setTitulo((atual) => atual || d.imovel.titulo || "");
        setLocal((atual) => atual || d.imovel.endereco || "");
        // Preço e dados vêm da ficha: o que está lá não se digita de novo, e o que não
        // está lá não se inventa.
        setPreco((atual) => atual || valorComPeriodo(d.imovel.ficha?.preco, d.imovel.ficha?.negocio, idioma));
        setFichaResumo(resumoDaFicha(d.imovel.ficha, LIMITES.legendaMax, idioma));
        setFicha(d.imovel.ficha ?? null);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, imovelId, token, idioma]);

  /**
   * Põe uma foto da biblioteca na linha do tempo.
   *
   * `antes` é a chave da cena onde ela deve entrar; sem isso, vai pro fim. É o que faz
   * arrastar a foto pra um ponto da linha do tempo colocá-la ALI -- clicar continua
   * mandando pro fim, que é o gesto rápido de quem está montando na ordem.
   */
  function adicionarGeracao(g: Geracao, antes?: string) {
    if (cenas.length >= LIMITES.cenasMax) {
      avisar(`No máximo ${LIMITES.cenasMax} cenas por vídeo`);
      return;
    }
    const k = chave();
    historico.novoPasso();
    setIrPara(k);
    avisar(antes ? "Foto posta no lugar" : "Foto adicionada no fim", { desfazer: () => historico.desfazer() });
    setCenas((lista) => {
      const nova: CenaUI = {
        chave: k,
        tipo: "foto",
        jobId: g.id,
        miniatura: g.depois,
        rotulo: `${g.acao}${g.detalhe ? " · " + g.detalhe : ""}`,
        temAntes: !!g.antes,
        ehClipe: false,
        eh360: false,
        efeito: EFEITOS[lista.length % 2 === 0 ? 0 : 1].id,
        animacao: "caminhar",
        movimento: "olhar_volta",
        legenda: "",
        duracao: LIMITES.duracaoPadrao,
        melhorar: false,
      };
      const i = antes ? lista.findIndex((s) => s.chave === antes) : -1;
      if (i < 0) return [...lista, nova];
      const copia = [...lista];
      copia.splice(i, 0, nova);
      return copia;
    });
  }

  async function enviarArquivos(arquivos: FileList | null) {
    if (!arquivos || !supabase) return;
    setErro(null);
    // Áudio solto aqui virava cena de FOTO e a exportação quebrava no ffmpeg. Áudio tem
    // lugar próprio (narração ou música); aqui só entra imagem e vídeo.
    const todos = Array.from(arquivos);
    const audios = todos.filter((f) => f.type.startsWith("audio/"));
    const cabem = Math.max(0, LIMITES.cenasMax - cenas.length);
    const midias = todos.filter((f) => !f.type.startsWith("audio/")).slice(0, cabem);
    const sobraram = todos.length - audios.length - midias.length;
    if (audios.length || sobraram)
      setErro(
        [
          audios.length ? "Áudio não vira cena: use Narração pra sua voz ou Música pra trilha." : "",
          sobraram ? `No máximo ${LIMITES.cenasMax} cenas por vídeo: ${sobraram} arquivo(s) ficaram de fora.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
    let vagas = cabem;
    for (const f of midias) {
      if (vagas <= 0) break;
      setEnviando((n) => n + 1);
      try {
        const r = await fetch("/api/video/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ tipo: f.type, tamanho: f.size }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const { error } = await supabase.storage.from(BUCKET_UPLOADS).uploadToSignedUrl(d.caminho, d.token, f, { contentType: f.type });
        if (error) throw new Error(error.message);
        const ehVideo = !!d.ehVideo;
        if (ehVideo) {
          // Clipe: com a duração e a imagem de verdade, em partes de até 8s se for longo.
          const local = await lerVideoLocal(f);
          const nome = f.name.replace(/\.[^.]+$/, "");
          setEnviados((l) => [{ chave: chave(), arquivo: d.caminho, url: local.url, miniatura: local.miniatura, duracao: local.duracao, nome }, ...l]);
          const n = inserirClipe({ arquivo: d.caminho, url: local.url, miniatura: local.miniatura, duracao: local.duracao, nome }, vagas);
          vagas -= n;
          continue;
        }
        const formato = await formatoDaFoto(f);
        const eh360 = formato === "esferica";
        const ehPanoramica = formato === "panoramica";
        vagas -= 1;
        setCenas((lista) => [
          ...lista,
          {
            chave: chave(),
            tipo: eh360 ? "tour360" : ehVideo ? "clipe" : "foto",
            arquivo: d.caminho,
            miniatura: ehVideo ? null : URL.createObjectURL(f),
            rotulo: eh360 ? `Foto 360 · ${f.name}` : ehPanoramica ? `Panorâmica · ${f.name}` : ehVideo ? `Clipe · ${f.name}` : f.name,
            temAntes: false,
            ehClipe: ehVideo,
            eh360,
            ehPanoramica,
            // Numa panorâmica, "Aproximar" corta as pontas -- que é exatamente a parte da
            // foto pela qual a pessoa tirou uma panorâmica. Deslizar mostra tudo.
            efeito: ehPanoramica ? "direita" : "aproximar",
            animacao: "caminhar",
            movimento: "olhar_volta",
            legenda: "",
            duracao: eh360 ? 10 : ehVideo ? 6 : LIMITES.duracaoPadrao,
            melhorar: ehVideo,
          },
        ]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha no envio.");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
  }

  /**
   * Manda o áudio pro bucket e deixa pronto pra entrar no vídeo.
   *
   * Mesmo caminho das fotos: o servidor só assina a URL e o navegador sobe direto. Um
   * áudio de 2 minutos passa dos 4,5 MB que a Vercel aceita no corpo da requisição.
   */
  async function usarAudio(arquivo: File | Blob, nome: string) {
    if (!supabase) return;
    setEnviandoVoz(true);
    setErro(null);
    try {
      const tipo = arquivo.type || "audio/webm";
      const r = await fetch("/api/video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ tipo, tamanho: arquivo.size }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const { error } = await supabase.storage.from(BUCKET_UPLOADS).uploadToSignedUrl(d.caminho, d.token, arquivo, { contentType: tipo });
      if (error) throw new Error(error.message);
      const url = URL.createObjectURL(arquivo);
      const novoItem = { caminho: d.caminho, url, nome };
      setVozArquivo(novoItem);
      setGravacoesVoz((lista) => [{ id: chave(), caminho: d.caminho, url, nome, criadoEm: new Date().toISOString() }, ...lista]);
      setNarrar(true);
      // Na linha do tempo: um trecho de voz (ou os cortes da gravação velha voltam a ser um só).
      const m = vozNova(audios);
      historico.novoPasso();
      setAudios(m.audios);
      setSelecao(m.selecao);
      setUltimaFaixa("voz");
      if (m.aviso) avisar(m.aviso, { desfazer: () => historico.desfazer() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui enviar o áudio.");
    } finally {
      setEnviandoVoz(false);
    }
  }

  /**
   * Gravar a voz aqui mesmo.
   *
   * O microfone só é pedido DEPOIS do clique -- nunca ao abrir a tela. Navegador que pede
   * permissão sem a pessoa ter pedido nada é navegador que leva "bloquear" e nunca mais
   * consegue gravar. A trilha é desligada no fim, senão a luzinha da câmera/microfone fica
   * acesa com a aba aberta.
   */
  async function gravarVoz() {
    setErro(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const pedacos: BlobPart[] = [];
      const rec = new MediaRecorder(fluxo);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.push(e.data);
      };
      rec.onstop = async () => {
        for (const t of fluxo.getTracks()) t.stop();
        setGravando(false);
        const blob = new Blob(pedacos, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) await usarAudio(blob, "Sua voz");
      };
      gravador.current = rec;
      rec.start();
      setSegundosGravando(0);
      setGravando(true);
    } catch {
      setErro("Não consegui usar o microfone. Verifique a permissão do navegador e tente de novo.");
    }
  }

  function pararGravacao() {
    gravador.current?.stop();
    gravador.current = null;
  }

  /**
   * Transcreve o áudio da voz em trechos com tempo.
   *
   * Não gasta crédito, e o que volta é SUGESTÃO: os trechos ficam editáveis, porque
   * transcrição erra justamente o que o vídeo está anunciando -- nome de bairro, de rua
   * e de condomínio.
   */
  async function gerarLegendas() {
    if (!vozArquivo || transcrevendo) return;
    setTranscrevendo(true);
    setErro(null);
    try {
      const r = await fetch("/api/video/legendas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ arquivo: vozArquivo.caminho }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui transcrever.");
      // A transcrição vem no tempo do ARQUIVO de voz; a legenda é queimada no tempo do
      // VÍDEO, e a voz só começa em `vozInicio`. Sem somar, toda legenda saía adiantada.
      // Só as novas: as já salvas foram ajustadas à mão contra o que se via.
      // Com a voz cortada ou dividida, cada frase vai pro trecho que a fala (legendasDaTranscricao);
      // frase que caiu num pedaço cortado fora não vira legenda.
      const novas = d.legendas as Legendas | null;
      setLegendasDaVoz(vozArquivo.caminho);
      const trechos = novas ? legendasDaTranscricao(novas.trechos, audiosEfetivos(audios, narracaoBase), segundosDaVoz) : [];
      setLegendas(novas && trechos.length ? { ...novas, trechos } : null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar as legendas.");
    } finally {
      setTranscrevendo(false);
    }
  }

  // ---- apresentador ----
  //
  // A câmera só é pedida DEPOIS do clique, e é desligada assim que a gravação termina ou
  // a pessoa fecha: navegador com a luzinha acesa numa aba esquecida é o jeito mais rápido
  // de perder a confiança de quem usa.
  async function abrirCamera() {
    setErro(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setCamera(fluxo);
    } catch {
      setErro("Não consegui abrir a câmera. Verifique a permissão do navegador e tente de novo.");
    }
  }

  function fecharCamera() {
    camera?.getTracks().forEach((t) => t.stop());
    setCamera(null);
    setGravandoVideo(false);
    gravadorVideo.current = null;
  }

  function gravarVideo() {
    if (!camera) return;
    const pedacos: BlobPart[] = [];
    const rec = new MediaRecorder(camera);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.push(e.data);
    };
    rec.onstop = async () => {
      setGravandoVideo(false);
      const blob = new Blob(pedacos, { type: rec.mimeType || "video/webm" });
      camera.getTracks().forEach((t) => t.stop());
      setCamera(null);
      if (blob.size > 0) await usarVideoApresentador(blob, "Sua gravação");
    };
    gravadorVideo.current = rec;
    rec.start();
    setSegundosVideo(0);
    setGravandoVideo(true);
  }

  async function usarVideoApresentador(arquivo: File | Blob, nome: string) {
    if (!supabase) return;
    setEnviandoApre(true);
    setErro(null);
    try {
      const tipo = (arquivo.type || "video/webm").split(";")[0];
      const r = await fetch("/api/video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ tipo, tamanho: arquivo.size }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const { error } = await supabase.storage.from(BUCKET_UPLOADS).uploadToSignedUrl(d.caminho, d.token, arquivo, { contentType: tipo });
      if (error) throw new Error(error.message);
      setApreUrl(URL.createObjectURL(arquivo));
      // Círculo no canto de baixo: é como a proposta aprovada por ele mostra a gravação chegando.
      setApresentador({ arquivo: d.caminho, formato: "circulo", canto: "inferior_direito", tamanho: "medio", entra: 0, inicio: 0, volume: 1, fundo: "manter" });
      void nome;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui enviar o vídeo.");
    } finally {
      setEnviandoApre(false);
    }
  }

  function mudarTrecho(i: number, texto: string) {
    setLegendas((l) => (l ? { ...l, trechos: l.trechos.map((t, j) => (j === i ? { ...t, texto } : t)) } : l));
  }
  function removerTrecho(i: number) {
    setLegendas((l) => {
      if (!l) return l;
      const trechos = l.trechos.filter((_, j) => j !== i);
      return trechos.length ? { ...l, trechos } : null;
    });
  }

  function mudarCena(k: string, mudanca: Partial<CenaUI>) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, ...mudanca } : s)));
  }
  function mover(k: string, delta: number) {
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === k);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= lista.length) return lista;
      const nova = [...lista];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });
  }
  function remover(k: string) {
    setCenas((lista) => lista.filter((s) => s.chave !== k));
    setSelecionada((atual) => (atual === k ? null : atual));
  }
  function duplicar(k: string) {
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === k);
      if (i < 0) return lista;
      return [...lista.slice(0, i + 1), { ...lista[i], chave: chave() }, ...lista.slice(i + 1)];
    });
  }

  // ---- textos da cena ----
  function adicionarTexto(k: string, novo: TextoCena) {
    setCenas((lista) =>
      lista.map((s) => {
        if (s.chave !== k) return s;
        const atuais = s.textos ?? [];
        if (atuais.length >= LIMITES.textosPorCena) return s;
        // Lugar já ocupado: vai pro primeiro livre. Dois efeitos no centro ficavam um EM
        // CIMA do outro no palco ("À VENDA" atravessado pelo carimbo), e quem toca num
        // segundo efeito quer ver os dois.
        const ocupadas = new Set(atuais.map((t) => t.posicao ?? "base"));
        const lugar = ocupadas.has(novo.posicao ?? "base") ? (["centro", "topo", "base"] as const).find((p) => !ocupadas.has(p)) : undefined;
        return { ...s, textos: [...atuais, lugar ? { ...novo, posicao: lugar } : novo] };
      })
    );
  }
  function mudarTexto(k: string, i: number, mudanca: Partial<TextoCena>) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, textos: (s.textos ?? []).map((t, j) => (j === i ? { ...t, ...mudanca } : t)) } : s)));
  }
  function removerTexto(k: string, i: number) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, textos: (s.textos ?? []).filter((_, j) => j !== i) } : s)));
  }

  // ---- elementos da cena ----
  // Clipes de reação do Pexels, pelo servidor (a chave fica lá). Estável entre renders: a
  // galeria refaz a busca quando esta função muda.
  const buscarClipes = useCallback(
    async (termo: string, pagina: number, livre: boolean): Promise<RespostaClipes> => {
      const t = await token();
      const r = await fetch(`/api/editor/pexels?q=${encodeURIComponent(termo)}&pagina=${pagina}${livre ? "&livre=1" : ""}`, { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { clipes: [], temMais: false, erro: d.error ?? "falhou" };
      return { clipes: d.clipes ?? [], temMais: !!d.temMais };
    },
    [token]
  );

  function adicionarElemento(k: string, novo: ElementoCena) {
    setCenas((lista) =>
      lista.map((s) => {
        if (s.chave !== k) return s;
        const atuais = s.elementos ?? [];
        if (atuais.length >= LIMITES.elementosPorCena) return s;
        return { ...s, elementos: [...atuais, novo] };
      })
    );
  }
  function mudarElemento(k: string, i: number, mudanca: Partial<ElementoCena>) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, elementos: (s.elementos ?? []).map((e, j) => (j === i ? { ...e, ...mudanca } : e)) } : s)));
  }
  function removerElemento(k: string, i: number) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, elementos: (s.elementos ?? []).filter((_, j) => j !== i) } : s)));
  }
  function moverCamadaElemento(k: string, i: number, direcao: "frente" | "tras") {
    setCenas((lista) =>
      lista.map((s) => {
        if (s.chave !== k) return s;
        const atuais = [...(s.elementos ?? [])];
        if (atuais.length <= 1) return s;
        const destino = direcao === "frente" ? Math.min(atuais.length - 1, i + 1) : Math.max(0, i - 1);
        if (destino === i) return s;
        const [removido] = atuais.splice(i, 1);
        atuais.splice(destino, 0, removido);
        return { ...s, elementos: atuais };
      })
    );
  }


  /**
   * Soltar na linha do tempo. Aceita:
   * - ARQUIVOS externos (imagens ou vídeos do computador/SO);
   * - VÍDEOS da aba de vídeos;
   * - FOTOS da biblioteca de materiais;
   * - CENAS que já estão na linha (troca de lugar).
   */
  function soltarEm(alvo: string, ev?: React.DragEvent) {
    // Durante a geração o vídeo está sendo montado com as cenas de agora: não muda nada.
    if (gerando) {
      arrastando.current = null;
      return;
    }
    if (ev) {
      if (ev.dataTransfer?.files && ev.dataTransfer.files.length > 0) {
        ev.preventDefault();
        enviarArquivos(ev.dataTransfer.files);
        arrastando.current = null;
        return;
      }
      const videoId = ev.dataTransfer?.getData("text/encena-video");
      if (videoId) {
        ev.preventDefault();
        const v = (videos ?? []).find((x) => x.id === videoId);
        if (v) adicionarVideoPronto(v, alvo === "fim" ? undefined : alvo);
        arrastando.current = null;
        return;
      }
      const jobId = ev.dataTransfer?.getData("text/encena-foto");
      if (jobId) {
        ev.preventDefault();
        const g = geracoes.find((x) => x.id === jobId);
        if (g) adicionarGeracao(g, alvo);
        arrastando.current = null;
        return;
      }
    }
    const de = arrastando.current;
    arrastando.current = null;
    if (!de || de === alvo) return;
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === de);
      // "fim": solta no espaço vazio depois do último bloco.
      const j = alvo === "fim" ? lista.length - 1 : lista.findIndex((s) => s.chave === alvo);
      if (i < 0 || j < 0) return lista;
      const nova = [...lista];
      const [movida] = nova.splice(i, 1);
      nova.splice(j, 0, movida);
      return nova;
    });
  }

  /**
   * Um arquivo de vídeo entrando na linha do tempo como clipe: em partes de até 8s que
   * emendam sem soluço (lib/clipes-do-editor.ts), no fim ou antes da cena `antes`. Devolve
   * quantas cenas entraram. O cursor vai até a primeira, e o aviso diz o que aconteceu.
   */
  function inserirClipe(c: { arquivo: string; url: string | null; miniatura: string | null; duracao: number; nome: string }, vagas: number, antes?: string): number {
    const { partes, sobrou } = partesDoClipe(c.duracao || LIMITES.duracaoPadrao, vagas);
    if (!partes.length) {
      avisar(`No máximo ${LIMITES.cenasMax} cenas por vídeo`);
      return 0;
    }
    const novas: CenaUI[] = partes.map((pt, i) => ({
      chave: chave(),
      tipo: "clipe",
      arquivo: c.arquivo,
      miniatura: c.miniatura,
      videoUrl: c.url,
      duracaoArquivo: c.duracao || undefined,
      rotulo: partes.length > 1 ? `${c.nome} · parte ${i + 1} de ${partes.length}` : c.nome,
      temAntes: false,
      ehClipe: true,
      eh360: false,
      efeito: "aproximar",
      animacao: "caminhar",
      movimento: "olhar_volta",
      legenda: "",
      duracao: pt.duracao,
      inicio: pt.inicio > 0 ? pt.inicio : undefined,
      transicao: pt.transicao,
      melhorar: false,
    }));
    historico.novoPasso();
    setCenas((lista) => {
      const i = antes ? lista.findIndex((s) => s.chave === antes) : -1;
      if (i < 0) return [...lista, ...novas];
      return [...lista.slice(0, i), ...novas, ...lista.slice(i)];
    });
    setIrPara(novas[0].chave);
    resumoEdicao.registrarEdicao("cenas", "botao");
    const extra = sobrou >= 1 ? ` · ${Math.round(sobrou)}s ficaram de fora (limite de ${LIMITES.cenasMax} cenas)` : "";
    avisar(partes.length > 1 ? `Vídeo adicionado em ${partes.length} partes${extra}` : `Vídeo adicionado${extra}`, { desfazer: () => historico.desfazer(), ms: 5000 });
    return partes.length;
  }

  /** Um vídeo que a pessoa já fez, da aba Vídeos, entrando como clipe. */
  async function adicionarVideoPronto(v: VideoResumo | VideoDaLista, antes?: string) {
    if (gerando || videosEntrando.has(v.id)) return;
    const vagas = LIMITES.cenasMax - cenas.length;
    if (vagas <= 0) {
      avisar(`No máximo ${LIMITES.cenasMax} cenas por vídeo`);
      return;
    }
    setVideosEntrando((s) => new Set(s).add(v.id));
    try {
      const rr = await fetch(`/api/video/${v.id}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const dd = await rr.json();
      if (!rr.ok || dd.status !== "concluido" || !dd.arquivo) throw new Error(dd.error ?? "Esse vídeo ainda não está pronto.");
      // A miniatura da lista primeiro: ela já está carregada na tela (a do servidor é outro
      // link assinado, e o bloco ficava escuro até baixar de novo).
      inserirClipe({ arquivo: dd.arquivo, url: dd.url ?? null, miniatura: v.miniatura ?? dd.miniatura ?? null, duracao: Number(dd.duracao ?? v.duracao) || LIMITES.duracaoPadrao, nome: v.titulo || "Vídeo" }, vagas, antes);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não consegui pôr esse vídeo na linha do tempo");
    } finally {
      setVideosEntrando((s) => {
        const n = new Set(s);
        n.delete(v.id);
        return n;
      });
    }
  }

  /** O "⋯" de um vídeo da lista: pôr na linha, assistir, reabrir o projeto, apagar. */
  function abrirMaisDoVideo(v: VideoDaLista, x: number, y: number) {
    const pronto = v.status === "concluido";
    menu.abrir(x, y, [
      { rotulo: "Pôr na linha do tempo", icone: "mais", desligado: !pronto || gerando, aoEscolher: () => adicionarVideoPronto(v) },
      { rotulo: "Assistir", icone: "play", desligado: !pronto, aoEscolher: () => abrirVideo(v as VideoResumo) },
      { rotulo: "Editar este projeto", icone: "editar_prompt", dica: "Troca o que está no editor pelas cenas dele (dá pra desfazer)", desligado: !pronto || gerando, aoEscolher: () => editarVideo(v.id) },
      { divisor: true },
      {
        rotulo: "Apagar vídeo…",
        icone: "lixeira",
        perigo: true,
        aoEscolher: () =>
          setTimeout(
            () =>
              menu.abrir(x, y, [
                { rotulo: "Apagar de vez", icone: "lixeira", perigo: true, dica: "Sai o arquivo e a miniatura. As fotos continuam em Materiais.", aoEscolher: () => apagarVideo(v.id) },
                { rotulo: "Cancelar", icone: "fechar" },
              ]),
            0
          ),
      },
    ]);
  }

  async function escreverRoteiro() {
    setEscrevendo(true);
    setErro(null);
    try {
      const r = await fetch("/api/video/roteiro", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ titulo, preco, local, legendas: cenas.map((s) => s.legenda).filter(Boolean) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRoteiro(d.roteiro);
      setNarrar(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui escrever.");
    } finally {
      setEscrevendo(false);
    }
  }

  // O resumo da edição vai junto com o pedido (lib/resumo-edicao.ts). Celular = layout max-md.
  // Acompanha a tela (girar o celular, redimensionar a janela), não só a do primeiro instante.
  const celular = useMidia("(max-width: 767.98px)");
  /** Tela larga: os ajustes da cena ganham uma coluna à direita do palco. */
  const largo = useMidia("(min-width: 1200px)");
  // No celular o editor abre com a folha fechada (o palco e a linha do tempo à vista); virar
  // a tela ou redimensionar a janela entre os dois tamanhos também troca.
  const celularAntes = useRef(celular);
  useEffect(() => {
    if (celularAntes.current === celular) return;
    celularAntes.current = celular;
    Promise.resolve().then(() => setPainelAberto(!celular));
  }, [celular]);
  const resumoEdicao = useResumoEdicao(celular);

  /**
   * Gera o vídeo. `sobrepor` troca alguns campos do espec SEM mexer no editor -- é o que
   * faz "fazer também em quadrado" ser um clique: as mesmas cenas, os mesmos textos, o
   * mesmo áudio, outro enquadramento. E não custa crédito de novo: o clipe animado já
   * existe e o servidor confere isso por conta própria.
   */
  async function gerar(sobrepor?: Partial<EspecVideo>) {
    if (cenas.length === 0 || gerando) return;
    setSegundosGerando(0);
    setGerando(true);
    setErro(null);
    setResultado(null);
    setProgresso({ feitas: 0, total: cenas.length + 1, mensagem: "Enviando o pedido…" });
    try {
      const t = await token();
      const r = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ imovelId, espec: sobrepor ? { ...espec, ...sobrepor } : espec, resumo: resumoEdicao.resumo() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui iniciar o vídeo.");
      resumoEdicao.aposGerar();
      c.recarregar();
      const id: string = d.videoId;
      const inicio = Date.now();
      let tropecos = 0;
      while (Date.now() - inicio < 30 * 60 * 1000) {
        // Instabilidade de rede ou do servidor (5xx) não é o vídeo falhando: tenta de
        // novo algumas vezes antes de desistir. Só 4xx (falhou de verdade) encerra.
        let rr: Response;
        let dd: { status?: string; error?: string; url?: string; miniatura?: string | null; duracao?: number | null; avisos?: string[]; formato?: string; feitas?: number; total?: number; mensagem?: string };
        try {
          rr = await fetch(`/api/video/${id}`, { headers: { Authorization: `Bearer ${await c.token()}` } });
          dd = await rr.json();
        } catch {
          if (++tropecos > 6) throw new Error("Perdi a conexão com o servidor. Recarregue a página e veja em Seus vídeos.");
          await new Promise((res) => setTimeout(res, 4000));
          continue;
        }
        if (!rr.ok) {
          if (rr.status >= 500 && ++tropecos <= 6) {
            await new Promise((res) => setTimeout(res, 4000));
            continue;
          }
          throw new Error(dd.error || "O vídeo falhou.");
        }
        tropecos = 0;
        if (dd.status === "concluido" && dd.url) {
          setResultado({ videoId: id, url: dd.url, miniatura: dd.miniatura ?? null, duracao: dd.duracao ?? null, avisos: dd.avisos ?? [], formato: dd.formato ?? formato, titulo: titulo || undefined, doEditor: true });
          setProgresso(null);
          carregarVideos().then(setVideos).catch(() => {});
          return;
        }
        setProgresso({ feitas: dd.feitas ?? 0, total: dd.total ?? 1, mensagem: dd.mensagem ?? "Gerando…" });
        await new Promise((res) => setTimeout(res, 2500));
      }
      throw new Error("Passou de 30 minutos. Recarregue a página e veja em Seus vídeos.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      setProgresso(null);
      c.recarregar();
    } finally {
      setGerando(false);
    }
  }

  async function abrirVideo(v: VideoResumo) {
    if (v.status !== "concluido") return;
    const rr = await fetch(`/api/video/${v.id}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const dd = await rr.json();
    if (rr.ok && dd.status === "concluido") {
      setResultado({ videoId: v.id, url: dd.url, miniatura: dd.miniatura, duracao: dd.duracao, avisos: dd.avisos ?? [], formato: dd.formato, titulo: v.titulo });
    } else avisar(dd.error ?? "Não consegui abrir esse vídeo agora");
  }

  /**
   * Reabre um vídeo pronto pra edição: o espec dele volta pras cenas e pros ajustes.
   * Gerar depois cria um vídeo NOVO -- o pronto fica como está na lista. Cena animada
   * que não mudou não custa de novo (o clipe fica guardado no servidor).
   */
  async function editarVideo(id: string) {
    setErro(null);
    try {
      const rr = await fetch(`/api/video/${id}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const dd = await rr.json();
      if (!rr.ok || dd.status !== "concluido" || !dd.espec) throw new Error(dd.error ?? "Esse vídeo ainda não pode ser editado.");
      const e = dd.espec as EspecVideo;
      const novas = cenasDoEspec(e, (dd.edicao?.cenas ?? []) as EdicaoCena[]);
      // Trocar o que está no editor pelo projeto reaberto é um passo de desfazer como outro.
      historico.novoPasso();
      setImovelId(dd.edicao?.imovelId ?? null);
      setCenas(novas);
      setFormato(e.formato);
      // Todos os trechos de áudio do vídeo (ou o que o formato antigo quer dizer).
      setAudios(itensDeAudioDoEspec(e));
      setSelecao(null);
      setTransicao(ehTransicao(e.transicao));
      setTitulo(e.titulo ?? "");
      setPreco(e.preco ?? "");
      setLocal(e.local ?? "");
      setTelaFinal(e.telaFinal !== false);
      setChamada(e.chamada ?? "");
      setMusicaVolume(e.musicaVolume ?? LIMITES.musicaVolumePadrao);
      setNarrar(!!e.narracao);
      setOrigemVoz(e.narracao?.origem ?? "ia");
      setRoteiro(e.narracao?.roteiro ?? "");
      setVoz(e.narracao?.voz ?? "laura");
      // A voz volta tocável -- e, com ela, o arquivo que as legendas transcrevem. Vale
      // também pra voz de IA: a narração fica guardada depois que o vídeo é montado.
      setVozArquivo(dd.edicao?.vozArquivo && dd.edicao?.vozUrl ? { caminho: dd.edicao.vozArquivo, url: dd.edicao.vozUrl, nome: e.narracao?.arquivo ? "Áudio deste vídeo" : "Narração de IA deste vídeo" } : null);
      setLegendas(e.legendas ?? null);
      setApresentador(e.apresentador ?? null);
      // Sem esta linha, reabrir um vídeo com marca d'água e gerar de novo devolvia o vídeo
      // SEM ela, sem avisar: o estado nascia nulo e sobrescrevia o que o espec trazia.
      setMarcaDagua(e.marcaDagua ?? null);
      setFiltro(e.filtro ?? "natural");
      setIntensidadeFiltro(e.intensidadeFiltro ?? 1);
      setAjustesVideo(e.ajustes);
      setCapaMontada(e.capaMontada !== false);
      setEfeitoSonoro(e.efeitoSonoro ?? "nenhum");
      setApreUrl(dd.edicao?.apresentadorUrl ?? null);
      setCapa(novas[e.capa ?? 0]?.chave ?? null);
      setEditandoDe({ id, titulo: dd.titulo || e.titulo || "Vídeo" });
      setResultado(null);
      avisar("Projeto reaberto: gerar cria um vídeo novo", { desfazer: () => historico.desfazer() });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui abrir o vídeo pra editar.");
    }
  }

  function comecarDoZero() {
    setEditandoDe(null);
    setCenas([]);
    setCapa(null);
    setTitulo("");
    setPreco("");
    setLocal("");
    setNarrar(false);
    setRoteiro("");
    setOrigemVoz("ia");
    setVozArquivo(null);
    // A música volta ao começo também (antes ficava a do vídeo anterior).
    setAudios([musicaNova(MUSICA_PADRAO, LIMITES.musicaVolumePadrao, "musica00")]);
    setSelecao(null);
    setMusicaVolume(LIMITES.musicaVolumePadrao);
    setLegendas(null);
    setApresentador(null);
    setMarcaDagua(null);
    setFiltro("natural");
    setIntensidadeFiltro(1);
    setAjustesVideo(undefined);
    setCapaMontada(true);
    setEfeitoSonoro("nenhum");
    setApreUrl(null);
    setChamada(CHAMADAS[0]);
    setTelaFinal(true);
  }

  async function apagarVideo(id: string) {
    await fetch(`/api/video/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
    setVideos((lista) => (lista ?? []).filter((v) => v.id !== id));
    if (resultado?.videoId === id) setResultado(null);
  }


  /** Em que segundo cada cena começa. Serve pro cabeçote saber quem está no ar. */
  const iniciosDasCenas = useMemo(() => relogioDaLinha.clipes.slice(0, cenas.length).map((c) => c.inicio), [relogioDaLinha, cenas.length]);
  /** Inícios de todos os blocos da linha, com a tela final quando ela entra. */
  const iniciosDaLinha = useMemo(() => relogioDaLinha.clipes.map((c) => c.inicio), [relogioDaLinha]);
  const duracaoDaLinha = relogioDaLinha.total;
  // ================= LINHA DO TEMPO COM FAIXAS (docs/planos/linha-do-tempo-spec.md, P7) =================
  //
  // Tudo o que entra no vídeo aparece numa faixa: fotos, Você, voz, música, textos, adesivos,
  // legendas. Toque seleciona; a barra de baixo mostra o que dá pra fazer com o selecionado;
  // arrastar move ou apara o que já está selecionado; tudo tem Desfazer.
  const { avisar, elemento: avisos } = useAvisos();
  const estadoLinha: EstadoLinha<CenaUI> = useMemo(
    () => ({ cenas, transicao, telaFinal: telaFinalEntra, titulo, audios, narracao: narracaoBase, musicaVolume, efeitoSonoro, apresentador, legendas }),
    [cenas, transicao, telaFinalEntra, titulo, audios, narracaoBase, musicaVolume, efeitoSonoro, apresentador, legendas]
  );
  // Voz de IA ainda não tem arquivo novo (a montagem grava de novo): o bloco é estimativa e
  // não se corta. Cortar a voz de IA fica pra quando a voz gravada for reaproveitada.
  const medidas: Medidas = useMemo(
    () => ({ segundosDaVoz: origemVoz === "ia" ? null : segundosDaVoz, vozEstimada: !!narracaoBase && origemVoz === "ia", segundosEstimadosDaVoz: roteiro.trim().length / 15, segundosDoVoce }),
    [segundosDaVoz, narracaoBase, origemVoz, roteiro, segundosDoVoce]
  );
  const ctxLinha = useMemo(() => ctxDoEstado(estadoLinha, medidas), [estadoLinha, medidas]);
  const faixas = useMemo(() => blocosDoEstado(ctxLinha), [ctxLinha]);

  // ---- a PRÉVIA COM SOM (P4): o Play toca música, voz, Você e os sons das viradas ----
  const fontesDaPrevia: FontesDoEditor = useMemo(
    () => ({
      voz: narracaoBase && origemVoz !== "ia" && vozArquivo ? { chave: vozArquivo.caminho, url: vozArquivo.url } : null,
      voce: apresentador && apreUrl ? { chave: `voce/${apresentador.arquivo}`, url: apreUrl } : null,
    }),
    [narracaoBase, origemVoz, vozArquivo, apresentador, apreUrl]
  );
  const itensPrevia = useMemo(() => itensDaPrevia(faixas, audiosEfetivos(audios, narracaoBase), apresentador, fontesDaPrevia), [faixas, audios, narracaoBase, apresentador, fontesDaPrevia]);
  const marcasPrevia = useMemo(() => marcasDaPrevia(faixas, efeitoSonoro), [faixas, efeitoSonoro]);
  const aoTerminarPrevia = useCallback(() => {}, []);
  const aoSemSomPrevia = useCallback(
    (motivo: "contexto" | "decodificar" | "elemento") => {
      avisar(motivo === "contexto" ? "Prévia sem som — toque em Play de novo" : motivo === "elemento" ? "Prévia sem o som do Você" : "Um dos áudios não carregou: ele fica mudo na prévia");
      resumoEdicao.registrar({ tipo: "semSom" } as never);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resumoEdicao é estável (useMemo); avisar também (useCallback)
    [avisar]
  );
  const previa = usePreviaDeAudio({ itens: itensPrevia, marcas: marcasPrevia, total: faixas.total, aoTerminar: aoTerminarPrevia, aoSemSom: aoSemSomPrevia });
  const tocando = previa.tocando;
  const { preparar: prepararPrevia, relogio: relogioDaPrevia } = previa;
  // Os arquivos são baixados e decodificados já: no primeiro Play o som sai na hora.
  useEffect(() => {
    prepararPrevia([...itensPrevia.map((i) => i.fonte), ...marcasPrevia.map((m) => m.fonte)]);
  }, [prepararPrevia, itensPrevia, marcasPrevia]);
  // O tempo da tela e o relógio da prévia. TOCANDO, o editor só redesenha quando a CENA no ar
  // muda: o cursor da linha anda sozinho (usar-rolagem.ts), e quem precisa do segundo exato
  // (o relógio da barra, a legenda e o Você no palco) assina o relógio por conta própria
  // (usar-tempo-ao-vivo.ts). Antes o editor inteiro redesenhava a cada 100ms enquanto tocava.
  // Parado (busca, pausa, fim), todo instante vale.
  useEffect(() => {
    let cenaNoAr = -2;
    return relogioDaPrevia.assinar((t) => {
      const r = Math.round(t * 100) / 100;
      if (!relogioDaPrevia.tocando?.()) {
        cenaNoAr = -2;
        setTempo(r);
        return;
      }
      let i = -1;
      for (let k = 0; k < iniciosDasCenas.length; k++) if (t >= iniciosDasCenas[k]) i = k;
      if (i === cenaNoAr) return;
      cenaNoAr = i;
      setTempo(r);
    });
  }, [relogioDaPrevia, iniciosDasCenas]);
  // A forma de onda de cada música (gerada no build: public/musica/picos.json).
  useEffect(() => {
    let vivo = true;
    fetch("/musica/picos.json")
      .then((r) => r.json())
      .then((j) => vivo && setPicos(decodificarPicos(j)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // ---- DESFAZER (P6): tudo que muda o vídeo; não o tempo, a seleção, a aba nem o zoom ----
  const docEdicao = useMemo(
    () => ({ cenas, audios, apresentador, marcaDagua, legendas, telaFinal, chamada, efeitoSonoro, transicao, musicaVolume, titulo, preco, local, narrar, origemVoz, roteiro, voz, vozArquivo, capa, filtro, intensidadeFiltro, ajustesVideo, capaMontada, formato }),
    [cenas, audios, apresentador, marcaDagua, legendas, telaFinal, chamada, efeitoSonoro, transicao, musicaVolume, titulo, preco, local, narrar, origemVoz, roteiro, voz, vozArquivo, capa, filtro, intensidadeFiltro, ajustesVideo, capaMontada, formato]
  );
  const restaurar = useCallback(
    (d: typeof docEdicao) => {
      setCenas(d.cenas);
      setAudios(d.audios);
      setApresentador(d.apresentador);
      setMarcaDagua(d.marcaDagua);
      setLegendas(d.legendas);
      setTelaFinal(d.telaFinal);
      setChamada(d.chamada);
      setEfeitoSonoro(d.efeitoSonoro);
      setTransicao(d.transicao);
      setMusicaVolume(d.musicaVolume);
      setTitulo(d.titulo);
      setPreco(d.preco);
      setLocal(d.local);
      setNarrar(d.narrar);
      setOrigemVoz(d.origemVoz);
      setRoteiro(d.roteiro);
      setVoz(d.voz);
      setVozArquivo(d.vozArquivo);
      setCapa(d.capa);
      setFiltro(d.filtro);
      setIntensidadeFiltro(d.intensidadeFiltro);
      setAjustesVideo(d.ajustesVideo);
      setCapaMontada(d.capaMontada);
      setFormato(d.formato);
      // A seleção continua valendo? (o item pode ter sumido com o desfazer)
      const ctx = ctxDoEstado({ ...estadoLinha, cenas: d.cenas, audios: d.audios, apresentador: d.apresentador, legendas: d.legendas, titulo: d.titulo, transicao: d.transicao, efeitoSonoro: d.efeitoSonoro }, medidas);
      setSelecao((sel) => realinharSelecao(ctx, sel));
    },
    [estadoLinha, medidas]
  );
  const historico = useHistorico(docEdicao, restaurar);
  // Depois de pôr uma cena (foto, vídeo), o cursor vai até ela: o palco mostra o que entrou.
  useEffect(() => {
    if (!irPara) return;
    const i = cenas.findIndex((s) => s.chave === irPara);
    if (i < 0 || iniciosDasCenas[i] === undefined) return;
    const t = Math.round((iniciosDasCenas[i] + 0.05) * 100) / 100;
    Promise.resolve().then(() => {
      setIrPara(null);
      previa.buscar(t);
      setTempo(t);
    });
  }, [irPara, cenas, iniciosDasCenas, previa]);

  // Só em desenvolvimento: os testes de navegador leem o pedido que SERIA mandado, sem gerar.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __encenaEditor?: unknown }).__encenaEditor = { espec: () => espec, selecao: () => selecao, tempo: () => tempo };
  });
  // ---------- ferramentas da barra da linha do tempo ----------
  //
  // Todas trabalham sobre o CABEÇOTE, não sobre um número digitado num campo. É a
  // diferença entre "corta aos 3,4 segundos" e "corta aqui": a segunda é a que alguém
  // consegue fazer olhando o vídeo.

  /** Onde o cabeçote está dentro desta cena, em segundos. `null` se estiver fora. */
  function cabecoteDentroDe(k: string): number | null {
    const i = cenas.findIndex((s) => s.chave === k);
    if (i < 0) return null;
    const d = tempo - iniciosDasCenas[i];
    // Até onde o BLOCO dela vai na linha (o começo da próxima), não a duração: na emenda
    // o que se vê já é a cena seguinte, e cortar ali cortaria a cena errada.
    const fimVisivel = (iniciosDaLinha[i + 1] ?? duracaoDaLinha) - iniciosDasCenas[i];
    return d > 0.15 && d < fimVisivel - 0.15 ? d : null;
  }

  /**
   * Parte a cena em duas, no cabeçote.
   *
   * Pra foto é repartir o tempo. Pra clipe é o que importa: a segunda parte começa no
   * arquivo exatamente onde a primeira acabou, senão as duas mostram o mesmo trecho --
   * que é o erro que faz "dividir" parecer "duplicar".
   *
   * A duração de cena é inteira e tem mínimo, então o corte é arredondado pro segundo
   * mais próximo que ainda deixa as duas partes válidas.
   */
  function dividirNoCabecote(k: string) {
    const ondeClicou = cabecoteDentroDe(k);
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === k);
      if (i < 0 || lista.length >= LIMITES.cenasMax) return lista;
      const s = lista[i];
      // Cena animada não divide: cada metade seria um pedido novo ao modelo, e cobrado.
      if (s.duracao < LIMITES.duracaoMin * 2 || s.tipo === "animada") return lista;
      const bruto = Math.round(ondeClicou ?? s.duracao / 2);
      const primeira = Math.min(s.duracao - LIMITES.duracaoMin, Math.max(LIMITES.duracaoMin, bruto));
      const resto = s.duracao - primeira;
      return [
        ...lista.slice(0, i),
        { ...s, duracao: primeira },
        { ...s, chave: chave(), duracao: resto, inicio: temVideoCorrendo(s.tipo) ? (s.inicio ?? 0) + primeira : s.inicio },
        ...lista.slice(i + 1),
      ];
    });
  }

  /**
   * Corta fora o que vem antes ou depois do cabeçote.
   *
   * Aparar o começo avança o ponto de entrada no arquivo: a cena continua mostrando o
   * mesmo trecho, só sem o pedaço em que a pessoa ainda estava acertando o celular.
   */
  function apararNoCabecote(k: string, lado: "inicio" | "fim") {
    const ondeClicou = cabecoteDentroDe(k);
    // Cena animada não apara: a duração nova é outro pedido ao modelo, e cobrado.
    if (ondeClicou === null || cenas.find((s) => s.chave === k)?.tipo === "animada") return;
    setCenas((lista) =>
      lista.map((s) => {
        if (s.chave !== k) return s;
        const ponto = Math.round(ondeClicou);
        if (lado === "fim") {
          const nova = Math.max(LIMITES.duracaoMin, ponto);
          return nova >= s.duracao ? s : { ...s, duracao: nova };
        }
        const nova = Math.max(LIMITES.duracaoMin, s.duracao - ponto);
        if (nova >= s.duracao) return s;
        const cortado = s.duracao - nova;
        return { ...s, duracao: nova, inicio: temVideoCorrendo(s.tipo) ? Math.min(LIMITES.aparaMax, (s.inicio ?? 0) + cortado) : s.inicio };
      })
    );
  }

  // ---------- o que o botão direito oferece no palco ----------
  //
  // Os itens saem daqui e não de dentro da marcação: no meio do JSX eles somem entre as
  // aspas e ninguém acha de novo pra mudar uma palavra.

  /** Abre a digitação direta do texto no palco com o valor inicial preenchido. */
  function abrirEdicaoTexto(k: string, indice: number, textoInicial?: string) {
    setEditando({ chave: k, indice });
    setTextoEmDigitacao(textoInicial ?? "");
  }

  /**
   * Toque num texto do palco. Arrastar move (posição livre, x/y em % do centro -- a mesma
   * regra que o vídeo usa); toque curto edita. Não edita quando: o dedo ficou segurado (o
   * menu de toque longo abre aos 450ms), o toque foi cancelado (a página rolou) ou o texto
   * já está em edição (reabrir punha o valor antigo de volta no campo). O movimento entra
   * uma vez por quadro: a cada `pointermove` este componente inteiro redesenhava.
   * A legenda (índice -1) não se arrasta: ela tem lugar fixo no vídeo.
   */
  function tocarTextoDoPalco(e: React.PointerEvent<HTMLElement>, k: string, indice: number, texto: string, emEdicao: boolean) {
    if (e.button !== 0 || emEdicao) return;
    const el = e.currentTarget;
    const palco = palcoRef.current?.getBoundingClientRect();
    if (!palco) return;
    el.setPointerCapture(e.pointerId);
    const caixa = el.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const t0 = performance.now();
    const cx = ((caixa.left + caixa.width / 2 - palco.left) / palco.width) * 100;
    const cy = ((caixa.top + caixa.height / 2 - palco.top) / palco.height) * 100;
    // O texto inteiro fica dentro do quadro, como o vídeo faz (min/max no drawtext e na arte):
    // o centro não passa da metade da largura/altura dele a partir da borda.
    const meiaL = Math.max(5, (caixa.width / 2 / palco.width) * 100);
    const meiaA = Math.max(5, (caixa.height / 2 / palco.height) * 100);
    const decimo = (v: number, meia: number) => Math.round(Math.min(100 - meia, Math.max(meia, v)) * 10) / 10;
    let arrastou = false;
    let pendente: { x: number; y: number } | null = null;
    let quadro = 0;
    const mover = (m: PointerEvent) => {
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (!arrastou && Math.hypot(dx, dy) > 6) arrastou = true;
      if (!arrastou || indice < 0) return;
      pendente = { x: decimo(cx + (dx / palco.width) * 100, meiaL), y: decimo(cy + (dy / palco.height) * 100, meiaA) };
      if (!quadro)
        quadro = requestAnimationFrame(() => {
          quadro = 0;
          if (pendente) mudarTexto(k, indice, pendente);
        });
    };
    const terminar = (cancelado: boolean) => {
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("pointercancel", cancelar);
      if (quadro) cancelAnimationFrame(quadro);
      if (arrastou && pendente && indice >= 0) mudarTexto(k, indice, pendente);
      if (!arrastou && !cancelado && performance.now() - t0 < 450) abrirEdicaoTexto(k, indice, texto);
    };
    const soltar = () => terminar(false);
    const cancelar = () => terminar(true);
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", cancelar);
  }

  /** Grava o que foi digitado em cima do elemento. Índice -1 é a legenda da cena. */
  function salvarTextoDoPalco(k: string, indice: number, valor: string) {
    const limpo = valor.trim();
    if (indice < 0) mudarCena(k, { legenda: limpo.slice(0, LIMITES.legendaMax) });
    else mudarTexto(k, indice, { texto: limpo.slice(0, LIMITES.textoMax) });
    setEditando(null);
  }

  function itensDoTexto(cena: CenaUI, indice: number, t: TextoCena): ItemMenu[] {
    const ehLegenda = indice < 0;
    const mover = (posicao: PosicaoTexto, rotulo: string): ItemMenu => ({
      rotulo,
      desligado: (t.posicao ?? "base") === posicao,
      aoEscolher: () => mudarTexto(cena.chave, indice, { posicao }),
    });
    return [
      { rotulo: "Editar o texto", icone: "editar_prompt", aoEscolher: () => abrirEdicaoTexto(cena.chave, indice, ehLegenda ? (cena.legenda || "") : (t.texto || "")) },
      ...(ehLegenda
        ? []
        : [
            mover("topo", "Mover pra cima"),
            mover("centro", "Mover pro meio"),
            mover("base", "Mover pra baixo"),
            {
              rotulo: "Trocar o modelo",
              icone: "magica",
              dica: "Abre a galeria de modelos de texto",
              aoEscolher: () => setAba("texto"),
            } as ItemMenu,
            {
              rotulo: "Duplicar",
              icone: "copiar",
              desligado: (cena.textos?.length ?? 0) >= LIMITES.textosPorCena,
              aoEscolher: () => adicionarTexto(cena.chave, { ...t }),
            } as ItemMenu,
          ]),
      {
        rotulo: ehLegenda ? "Apagar a legenda" : "Apagar o texto",
        icone: "lixeira",
        perigo: true,
        aoEscolher: () => (ehLegenda ? mudarCena(cena.chave, { legenda: "" }) : removerTexto(cena.chave, indice)),
      },
    ];
  }

  /**
   * O menu do FUNDO do palco: o que se faz com a cena.
   *
   * "Pôr um texto aqui" usa a altura do clique dentro do quadro pra decidir se o texto
   * nasce em cima, no meio ou embaixo -- é o que faz "aqui" querer dizer alguma coisa.
   */
  function colarCenaApos(chaveAlvo: string) {
    if (!cenaCopiada) return;
    const novaChave = chave();
    const nova: CenaUI = {
      ...cenaCopiada,
      chave: novaChave,
    };
    setCenas((lista) => {
      const idx = lista.findIndex((s) => s.chave === chaveAlvo);
      if (idx < 0) return [...lista, nova];
      const copia = [...lista];
      copia.splice(idx + 1, 0, nova);
      return copia;
    });
    setSelecionada(novaChave);
  }

  /**
   * O menu contextual completo da CENA (botão direito ou toque longo na timeline / palco).
   *
   * Divisão, apara no cabeçote, velocidade, cópia/cola, rotação, espelho e ordenação.
   *
   * O que depende do CABEÇOTE diz a verdade quando ele está fora desta cena (o clique direito
   * na linha do tempo não move o cabeçote): "Dividir" vira "Dividir no meio", "Congelar"
   * congela o primeiro quadro, e aparar fica desligado com o motivo -- antes, aparar não fazia
   * nada, sem aviso.
   */
  function abrirMenuDaCena(ev: React.MouseEvent<HTMLElement | Element>, cena: CenaUI) {
    ev.preventDefault();
    // "Pôr um texto aqui" usa a altura do clique só quando ele foi NO PALCO: na linha do
    // tempo, o bloco tem 64px e a fração não quer dizer nada sobre a foto.
    const noPalco = !!palcoRef.current?.contains(ev.currentTarget as Node);
    const caixa = ev.currentTarget.getBoundingClientRect();
    const fracao = (ev.clientY - caixa.top) / Math.max(1, caixa.height);
    const posicao: PosicaoTexto = !noPalco ? "base" : fracao < 0.33 ? "topo" : fracao < 0.66 ? "centro" : "base";
    const noCabecote = cabecoteDentroDe(cena.chave);
    const foraDoCabecote = "Pare o cabeçote dentro desta cena";
    const cheio = (cena.textos?.length ?? 0) >= LIMITES.textosPorCena;
    const idxCena = cenas.findIndex((s) => s.chave === cena.chave);
    const podeMoverTras = idxCena > 0;
    const podeMoverFrente = idxCena >= 0 && idxCena < cenas.length - 1;

    menu.abrir(ev.clientX, ev.clientY, [
      // ---- Corte & Edição ----
      {
        rotulo: noCabecote === null ? "Dividir no meio" : "Dividir no cabeçote",
        icone: "dividir",
        dica: cena.tipo === "animada" ? "Cena animada não se divide" : undefined,
        desligado: gerando || cena.tipo === "animada" || cenas.length >= LIMITES.cenasMax || cena.duracao < LIMITES.duracaoMin * 2,
        aoEscolher: () => dividirNoCabecote(cena.chave),
      },
      {
        rotulo: "Cortar início até o cabeçote",
        icone: "aparar_inicio",
        dica: noCabecote === null ? foraDoCabecote : undefined,
        desligado: gerando || noCabecote === null || cena.tipo === "animada" || cena.duracao < LIMITES.duracaoMin * 2,
        aoEscolher: () => apararNoCabecote(cena.chave, "inicio"),
      },
      {
        rotulo: "Cortar fim a partir do cabeçote",
        icone: "aparar_fim",
        dica: noCabecote === null ? foraDoCabecote : undefined,
        desligado: gerando || noCabecote === null || cena.tipo === "animada" || cena.duracao < LIMITES.duracaoMin * 2,
        aoEscolher: () => apararNoCabecote(cena.chave, "fim"),
      },
      { divisor: true },

      // ---- Área de Transferência & Duplicação ----
      {
        rotulo: "Copiar cena",
        icone: "copiar",
        aoEscolher: () => setCenaCopiada(cena),
      },
      ...(cenaCopiada
        ? [
            {
              rotulo: "Colar cena copiada aqui",
              icone: "mais",
              desligado: gerando || cenas.length >= LIMITES.cenasMax,
              aoEscolher: () => colarCenaApos(cena.chave),
            } as ItemMenu,
          ]
        : []),
      {
        rotulo: "Duplicar cena",
        icone: "copiar",
        desligado: gerando || cenas.length >= LIMITES.cenasMax,
        aoEscolher: () => duplicar(cena.chave),
      },
      { divisor: true },

      // ---- Vídeo / Clipe Específico ----
      ...(cena.ehClipe
        ? [
            {
              rotulo: cena.melhorar ? "Desativar melhoria de cor" : "Melhorar cor do clipe",
              icone: "magica",
              aoEscolher: () => mudarCena(cena.chave, { melhorar: !cena.melhorar }),
            } as ItemMenu,
            {
              rotulo: (cena.velocidade ?? 1) === 1 ? "Acelerar (1.5x)" : (cena.velocidade ?? 1) === 1.5 ? "Super rápido (2x)" : (cena.velocidade ?? 1) === 2 ? "Câmera lenta (0.5x)" : "Velocidade normal (1x)",
              icone: "play",
              dica: `Velocidade atual: ${(cena.velocidade ?? 1)}x`,
              aoEscolher: () => {
                const proxima = (cena.velocidade ?? 1) === 1 ? 1.5 : (cena.velocidade ?? 1) === 1.5 ? 2 : (cena.velocidade ?? 1) === 2 ? 0.5 : 1;
                velocidadeDaCena(cena.chave, proxima);
              },
            } as ItemMenu,
            {
              rotulo: cena.congelar ? "Descongelar quadro" : noCabecote === null ? "Congelar o primeiro quadro" : "Congelar no cabeçote",
              icone: "converter_hd",
              aoEscolher: () => congelarCena(cena.chave),
            } as ItemMenu,
            { divisor: true },
          ]
        : []),

      // ---- Movimento & Orientação ----
      {
        rotulo: "Girar 90°",
        icone: "girar",
        desligado: gerando || cena.tipo === "tour360",
        aoEscolher: () => girarCena(cena.chave),
      },
      {
        rotulo: cena.espelho ? "Desfazer espelhamento" : "Espelhar horizontalmente",
        icone: "espelhar",
        desligado: gerando || cena.tipo === "tour360",
        aoEscolher: () => espelharCena(cena.chave),
      },
      {
        rotulo: "Mover pra trás",
        icone: "seta_esq",
        desligado: gerando || !podeMoverTras,
        aoEscolher: () => mover(cena.chave, -1),
      },
      {
        rotulo: "Mover pra frente",
        icone: "seta_dir",
        desligado: gerando || !podeMoverFrente,
        aoEscolher: () => mover(cena.chave, 1),
      },
      { divisor: true },

      // ---- Textos e Capa ----
      {
        rotulo: "Pôr um texto aqui",
        icone: "editar_prompt",
        dica: cheio ? `Esta cena já tem ${LIMITES.textosPorCena} textos` : posicao === "topo" ? "Em cima" : posicao === "centro" ? "No meio" : "Embaixo",
        desligado: cheio,
        aoEscolher: () => {
          adicionarTexto(cena.chave, { texto: "", posicao, estilo: "faixa", animacao: "nenhuma" });
          abrirEdicaoTexto(cena.chave, cena.textos?.length ?? 0, "");
        },
      },
      {
        rotulo: "Usar como capa do vídeo",
        icone: "estrela",
        desligado: (capa ?? cenas[0]?.chave) === cena.chave,
        aoEscolher: () => setCapa(cena.chave),
      },
      {
        rotulo: "Trocar mídia desta cena",
        icone: "foto",
        dica: "Abre a aba de mídias",
        aoEscolher: () => setAba("midia"),
      },
      { divisor: true },

      // ---- Exclusão ----
      {
        rotulo: "Apagar a cena",
        icone: "lixeira",
        perigo: true,
        desligado: gerando,
        aoEscolher: () => remover(cena.chave),
      },
    ]);
  }

  function girarCena(k: string) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, giro: ((s.giro ?? 0) + 90) % 360 || undefined } : s)));
  }
  function espelharCena(k: string) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, espelho: s.espelho ? undefined : true } : s)));
  }
  function velocidadeDaCena(k: string, v: number) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, velocidade: v === 1 ? undefined : v } : s)));
  }
  /** Congelar usa o quadro do cabeçote: é o que a pessoa está vendo quando aperta. */
  function congelarCena(k: string) {
    const ondeClicou = cabecoteDentroDe(k);
    setCenas((lista) =>
      lista.map((s) => (s.chave === k ? { ...s, congelar: s.congelar ? undefined : true, inicio: s.congelar ? s.inicio : Math.round(((s.inicio ?? 0) + (ondeClicou ?? 0)) * 10) / 10 } : s))
    );
  }

  // ---------- ações da linha do tempo (barra da seleção, menu, gestos) ----------

  /** O estado que uma ação da linha devolveu, de volta nos estados do editor. */
  function aplicarEstadoLinha(e: EstadoLinha<CenaUI>) {
    setCenas(e.cenas);
    setAudios(e.audios);
    setApresentador(e.apresentador);
    setLegendas(e.legendas);
    setTitulo(e.titulo);
    if (!e.narracao && narracaoBase) setNarrar(false);
  }

  /** Um passo de edição pela linha: desfazer volta a ele; o aviso diz o que aconteceu. */
  function aplicarLinha(r: { estado: EstadoLinha<CenaUI>; selecao: RefItem | null; mudou: boolean; motivo?: string }, ref: RefItem, aviso?: string) {
    if (!r.mudou) {
      if (r.motivo) avisar(r.motivo);
      return false;
    }
    historico.novoPasso();
    aplicarEstadoLinha(r.estado);
    setSelecao(r.selecao);
    resumoEdicao.registrarEdicao(ref.faixa, "botao");
    if (aviso) avisar(aviso, { desfazer: () => historico.desfazer() });
    return true;
  }

  const novoIdLinha = () => novoIdDeAudio(audios.map((a) => a.id));
  /** Uma ação de CENA feita pelas funções de sempre do editor, como um passo de desfazer. */
  function naCena(f: () => void, aviso?: string) {
    historico.novoPasso();
    f();
    resumoEdicao.registrarEdicao("cenas", "botao");
    if (aviso) avisar(aviso, { desfazer: () => historico.desfazer() });
  }
  const chaveDoRef = (r: RefItem | null) => (r ? JSON.stringify(r) : "");

  /** O botão da barra da seleção (ou o item do menu) com o nome `id`, sobre o item `ref`. */
  function executarAcao(id: string, ref: RefItem | null = selecao) {
    if (!ref) return;
    if (id === "ajustes_cena") {
      setInspetorNaFolha(true);
      return;
    }
    const t = tempo;
    const f = ref.faixa;
    // --- sub-barras: abrem (ou fecham) presas ao item ---
    if (id === "volume" || id === "fade" || id === "trecho" || id === "velocidade" || id === "editar_texto") {
      const tipo = id === "editar_texto" ? "texto" : id;
      setSubBarra((sb) => (sb && sb.tipo === tipo && sb.de === chaveDoRef(ref) ? null : { tipo, de: chaveDoRef(ref) }));
      return;
    }
    if (f === "musica" || f === "voz" || f === "voce" || f === "legendas") {
      if (id === "inicio_aqui") return void aplicarLinha(botaoInicioAqui(ctxLinha, ref, t), ref, "Cortado aqui");
      if (id === "fim_aqui") return void aplicarLinha(botaoFimAqui(ctxLinha, ref, t), ref, "Cortado aqui");
      if (id === "menos05") return void aplicarLinha(botaoDeslocar(ctxLinha, ref, -0.5), ref);
      if (id === "mais05") return void aplicarLinha(botaoDeslocar(ctxLinha, ref, 0.5), ref);
      if (id === "menos01") return void aplicarLinha(botaoDeslocar(ctxLinha, ref, -0.1), ref);
      if (id === "mais01") return void aplicarLinha(botaoDeslocar(ctxLinha, ref, 0.1), ref);
      if (id === "dividir") return void aplicarLinha(dividirNoTempo(ctxLinha, ref, t, novoIdLinha), ref, "Dividido no cursor");
      if (id === "trocar") return void setAba("audio");
      if (id === "mais_trecho" && f === "legendas") {
        const trechos = legendas?.trechos ?? [];
        const proximo = trechos.filter((x) => x.inicio > t).reduce((m, x) => Math.min(m, x.inicio), duracao);
        const novo = { inicio: Math.round(t * 100) / 100, fim: Math.round(Math.min(t + 2, proximo, duracao) * 100) / 100, texto: "" };
        const lista = [...trechos, novo].sort((a, b) => a.inicio - b.inicio);
        historico.novoPasso();
        setLegendas({ estilo: legendas?.estilo ?? ESTILOS_LEGENDA[0].id, ...(legendas ?? {}), trechos: lista } as Legendas);
        const i = lista.indexOf(novo);
        setSelecao({ faixa: "legendas", indice: i });
        setSubBarra({ tipo: "texto", de: chaveDoRef({ faixa: "legendas", indice: i }) });
        return;
      }
    }
    if (id === "apagar") {
      const r = apagarDaLinha(ctxLinha, ref);
      const extra = r.legendasApagadas && f === "voz" ? ` · ${r.legendasApagadas} legenda${r.legendasApagadas > 1 ? "s" : ""} junto` : "";
      const nome = f === "musica" ? "Música apagada" : f === "voz" ? `Voz apagada${extra}${r.narracaoDesligada ? " · narração desligada" : ""}` : f === "voce" ? "Você tirado" : f === "legendas" ? "Legenda apagada" : f === "cenas" ? "Cena apagada" : "Apagado";
      if (f === "cenas") return naCena(() => remover(ref.chave), nome);
      if (f === "telaFinal") return naCena(() => setTelaFinal(false), "Tela final tirada");
      return void aplicarLinha({ ...r, mudou: true }, ref, nome);
    }
    if (f === "textos" || f === "adesivos") {
      if (id === "foto_anterior") return void aplicarLinha(moverParaFoto(ctxLinha, ref, -1), ref, "Foi pra foto anterior");
      if (id === "proxima_foto") return void aplicarLinha(moverParaFoto(ctxLinha, ref, 1), ref, "Foi pra próxima foto");
      if (id === "duplicar") return void aplicarLinha(duplicarNaFoto(ctxLinha, ref), ref, "Duplicado");
      if (id === "editar") {
        if (f === "textos") {
          const texto = ref.indice < 0 ? (cenas.find((x) => x.chave === ref.chave)?.legenda ?? "") : (cenas.find((x) => x.chave === ref.chave)?.textos?.[ref.indice]?.texto ?? "");
          return abrirEdicaoTexto(ref.chave, ref.indice, texto);
        }
        return void setAba("elementos");
      }
      if (id === "animacao") return void setAba(f === "textos" ? "texto" : "elementos");
    }
    if (f === "titulo") {
      if (id === "editar_titulo") {
        setAba("texto");
        setEditandoTitulo(true);
        return;
      }
    }
    if (f === "telaFinal") {
      if (id === "frase") return void setAba("texto");
      if (id === "tirar") return naCena(() => setTelaFinal(false), "Tela final tirada");
    }
    if (f === "cenas") {
      const k = ref.chave;
      if (id === "dividir") return naCena(() => dividirNoCabecote(k), "Cena dividida");
      if (id === "aparar_inicio") return naCena(() => apararNoCabecote(k, "inicio"), "Início aparado");
      if (id === "aparar_fim") return naCena(() => apararNoCabecote(k, "fim"), "Fim aparado");
      if (id === "girar") return naCena(() => girarCena(k));
      if (id === "espelhar") return naCena(() => espelharCena(k));
      if (id === "congelar") return naCena(() => congelarCena(k));
      if (id === "duplicar") return naCena(() => duplicar(k), "Cena duplicada");
      if (id === "mover_esq") return naCena(() => mover(k, -1));
      if (id === "mover_dir") return naCena(() => mover(k, 1));
      if (id === "capa") return naCena(() => setCapa(k), "Esta cena virou a capa");
    }
  }

  /** Nome do selecionado, no alto da barra. */
  function tituloDaSelecao(r: RefItem): string {
    const n = (chave: string) => cenas.findIndex((x) => x.chave === chave) + 1;
    switch (r.faixa) {
      case "cenas":
        return `${cenas.find((x) => x.chave === r.chave)?.ehClipe ? "Vídeo" : "Foto"} ${n(r.chave)}`;
      case "musica": {
        const a = audios.find((x) => x.id === r.id);
        return `Música · ${a && a.fonte.tipo === "musica" ? (MUSICAS.find((m) => m.id === (a.fonte as { id: MusicaId }).id)?.rotulo ?? "") : ""}`;
      }
      case "voz":
        return "Voz";
      case "voce":
        return "Você";
      case "legendas":
        return `Legenda ${r.indice + 1}`;
      case "textos":
        return r.indice < 0 ? `Legenda da foto ${n(r.chave)}` : `Texto · foto ${n(r.chave)}`;
      case "adesivos":
        return `Adesivo · foto ${n(r.chave)}`;
      case "titulo":
        return "Título";
      case "telaFinal":
        return "Tela final";
    }
  }

  /** A sub-barra do item selecionado: volume, fade, trecho da música, velocidade, texto da legenda. */
  function subBarraDaSelecao(): React.ReactNode {
    if (!selecao || !subBarra || subBarra.de !== chaveDoRef(selecao)) return null;
    const r = selecao;
    const item = r.faixa === "musica" || r.faixa === "voz" ? audios.find((a) => a.id === r.id) : undefined;
    const mudarItem = (m: Partial<ItemAudio>) => item && setAudios((l) => l.map((a) => (a.id === item.id ? { ...a, ...m } : a)));
    if (subBarra.tipo === "volume") {
      if (item) return <DeslizanteDaSubBarra rotulo="Volume" valor={item.volume} min={r.faixa === "voz" ? 0.2 : 0} max={r.faixa === "voz" ? 2 : 1} passo={0.05} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={(v) => mudarItem({ volume: Math.round(v * 100) / 100 })} />;
      if (r.faixa === "voce" && apresentador) return <DeslizanteDaSubBarra rotulo="Volume" valor={apresentador.volume ?? 1} min={0} max={2} passo={0.1} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={(v) => setApresentador({ ...apresentador, volume: Math.round(v * 10) / 10 })} />;
    }
    if (subBarra.tipo === "fade" && item) {
      const b = faixas.trilhas[r.faixa as "musica"].find((x) => mesmoRef(x.ref, r));
      const dur = b ? b.ate - b.de : 10;
      return (
        <div className="flex w-full items-center gap-2">
          <DeslizanteDaSubBarra rotulo="Entrada" valor={item.fadeEntrada} min={0} max={Math.min(5, dur - item.fadeSaida)} passo={0.1} formatar={(v) => `${v.toFixed(1)}s`} aoMudar={(v) => mudarItem({ fadeEntrada: Math.round(v * 10) / 10 })} />
          <DeslizanteDaSubBarra rotulo="Saída" valor={item.fadeSaida} min={0} max={Math.min(5, dur - item.fadeEntrada)} passo={0.1} formatar={(v) => `${v.toFixed(1)}s`} aoMudar={(v) => mudarItem({ fadeSaida: Math.round(v * 10) / 10 })} />
        </div>
      );
    }
    if (subBarra.tipo === "trecho" && r.faixa === "musica") {
      const deslizar = (delta: number) => aplicarLinha(aplicarGesto(ctxLinha, r, { tipo: "deslizarTrecho", delta }, null), r);
      return (
        <div className="flex w-full items-center gap-1 text-xs text-neutral-300">
          <span className="min-w-0 flex-1 truncate px-2">Arraste a onda para escolher o trecho</span>
          <button type="button" onClick={() => deslizar(-1)} className="h-11 min-w-14 rounded-lg px-2 hover:bg-white/10">◀ 1s</button>
          <button type="button" onClick={() => deslizar(1)} className="h-11 min-w-14 rounded-lg px-2 hover:bg-white/10">1s ▶</button>
          <button type="button" onClick={() => setSubBarra(null)} className="h-11 min-w-14 rounded-lg px-2 font-semibold text-white hover:bg-white/10">Pronto</button>
        </div>
      );
    }
    if (subBarra.tipo === "velocidade" && r.faixa === "cenas") {
      const atual = cenas.find((x) => x.chave === r.chave)?.velocidade ?? 1;
      return (
        <div className="flex w-full items-center gap-1">
          {[0.5, 1, 1.5, 2].map((v) => (
            <button key={v} type="button" onClick={() => naCena(() => velocidadeDaCena(r.chave, v))} aria-pressed={atual === v} className={"h-11 min-w-14 rounded-lg px-3 text-sm " + (atual === v ? "bg-marca-coral text-white" : "text-neutral-300 hover:bg-white/10")}>
              {String(v).replace(".", ",")}x
            </button>
          ))}
        </div>
      );
    }
    if (subBarra.tipo === "texto" && r.faixa === "legendas") {
      const tr = legendas?.trechos[r.indice];
      if (!tr) return null;
      return (
        <div className="flex w-full items-center gap-2 px-1">
          <input autoFocus value={tr.texto} onChange={(e) => mudarTrecho(r.indice, e.target.value)} maxLength={LIMITES.legendaMax} placeholder="O que está sendo dito" className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-neutral-950 px-3 text-base text-white outline-none focus:border-white" />
          <button type="button" onClick={() => setSubBarra(null)} className="h-11 min-w-14 rounded-lg px-2 text-sm font-semibold text-white hover:bg-white/10">Pronto</button>
        </div>
      );
    }
    return null;
  }

  // Atalhos no computador (D4), os mesmos do CapCut/Premiere: Espaço toca/pausa; Delete apaga;
  // S ou Ctrl+B divide no cursor; ← → andam um quadro (com Shift, um segundo); Home/End vão
  // ao começo e ao fim; Ctrl+Z desfaz; Ctrl+Shift+Z / Ctrl+Y refaz.
  const atalhos = useRef<{ tocar(): void; apagar(): void; dividir(): void; andar(s: number): void; ir(t: number): void; desfazer(): void; refazer(): void } | null>(null);
  useEffect(() => {
    atalhos.current = {
      tocar: () => alternarTocar(),
      apagar: () => selecao && executarAcao("apagar"),
      dividir: () => {
        if (!selecao) return avisar("Toque num bloco da linha do tempo pra dividir");
        const a = acoesDaSelecao(ctxLinha, selecao, tempo, gerando).find((x) => x.id === "dividir");
        if (!a) return;
        if (!a.ativo) return avisar(a.motivo ?? "Não dá pra dividir aqui");
        executarAcao("dividir");
      },
      andar: (s) => atalhos.current?.ir(tempo + s),
      ir: (t) => {
        const alvo = Math.round(Math.min(Math.max(0, t), faixas.total) * 100) / 100;
        previa.buscar(alvo);
        setTempo(alvo);
      },
      desfazer: () => historico.desfazer() && resumoEdicao.registrar({ tipo: "desfazer" } as never),
      refazer: () => historico.refazer() && resumoEdicao.registrar({ tipo: "refazer" } as never),
    };
  });
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest?.("input, textarea, select, button, [contenteditable]")) return;
      const a = atalhos.current;
      if (!a) return;
      if (e.key === " ") {
        e.preventDefault();
        a.tocar();
      } else if (e.key === "Delete" || e.key === "Backspace") a.apagar();
      else if ((e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b")) {
        e.preventDefault();
        a.dividir();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        a.andar((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        a.ir(e.key === "Home" ? 0 : Infinity);
      }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        a.desfazer();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        a.refazer();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  /** Play/Pausa. Chamado DIRETO do toque (o iOS só libera o som dentro do gesto). */
  function alternarTocar() {
    if (tocando) {
      previa.pausar();
      setTempo(Math.round(previa.relogio.agora() * 100) / 100);
    } else previa.tocar(tempo >= faixas.total - 0.05 ? 0 : tempo);
  }

  // A altura do palco, pra legenda no palco ter o tamanho certo; e a da linha, pro layout do celular.
  const [raizEditor, setRaizEditor] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!raizEditor) return;
    const linha = raizEditor.querySelector<HTMLElement>('[data-area="linha"]');
    const palco = raizEditor.querySelector<HTMLElement>("[data-palco]");
    const medir = () => {
      if (linha) {
        raizEditor.style.setProperty("--altura-linha", `${linha.offsetHeight}px`);
        // Do pé da tela até o topo da linha do tempo (no celular inclui a fileira de
        // ferramentas): os avisos e a lista da foto abrem logo ACIMA disso.
        raizEditor.style.setProperty("--acima-da-linha", `${Math.max(0, window.innerHeight - linha.getBoundingClientRect().top)}px`);
      }
      if (palco) setAlturaPalco(palco.offsetHeight);
    };
    const ro = new ResizeObserver(medir);
    if (linha) ro.observe(linha);
    if (palco) ro.observe(palco);
    ro.observe(raizEditor);
    return () => ro.disconnect();
  }, [raizEditor, cenas.length, celular, painelAberto, largo]);

  /**
   * Que cena está no ar no segundo do cabeçote.
   *
   * DERIVADO, não guardado em estado. A primeira versão tinha um efeito que, enquanto
   * tocava, empurrava a seleção a cada quadro -- e isso é pedir um render em cascata 60
   * vezes por segundo. Quem manda enquanto toca é o tempo; parado, manda o clique.
   */
  const indiceDoCabecote = useMemo(() => {
    let i = 0;
    for (let k = 0; k < iniciosDasCenas.length; k++) if (tempo >= iniciosDasCenas[k]) i = k;
    return i;
  }, [tempo, iniciosDasCenas]);

  if (c.checando) return <main className="editor-escuro fixed inset-0 z-30 grid place-items-center text-sm text-[var(--ed-texto-2)]">Abrindo o editor…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para criar vídeos.</Link>
      </main>
    );
  }

  // A cena aberta no palco e nos ajustes. Tocando, manda o tempo; parado, manda a seleção
  // (se ela for de uma foto); sem seleção, o cursor. Editor sem nada escolhido é uma tela
  // que não responde ao que a pessoa clica.
  const chaveDaSelecao = selecao && (selecao.faixa === "cenas" || selecao.faixa === "textos" || selecao.faixa === "adesivos") ? selecao.chave : null;
  const indiceSelecionado = chaveDaSelecao ? cenas.findIndex((s) => s.chave === chaveDaSelecao) : -1;
  const indiceAtual = tocando || indiceSelecionado < 0 ? indiceDoCabecote : indiceSelecionado;
  const cenaAtual: CenaUI | null = cenas[indiceAtual] ?? null;
  const semSaldo = (c.conta.creditos ?? 0) < custo;
  const nomeDaAba = ABAS.find((a) => a.id === aba)?.rotulo ?? "";
  const proporcao = PROPORCAO_NUM[formato];
  const nomeDoFormato = FORMATOS.find((f) => f.id === formato)?.rotulo ?? formato;
  // Quantas vezes cada vídeo pronto já entrou na linha (a primeira parte de cada entrada).
  const usadosPorVideo: Record<string, number> = {};
  for (const s of cenas) {
    const m = s.arquivo?.match(/\/videos\/([0-9a-f-]{36})\.mp4$/);
    if (m && !s.inicio) usadosPorVideo[m[1]] = (usadosPorVideo[m[1]] ?? 0) + 1;
  }
  const podeGerar = !gerando && cenas.length > 0 && !semSaldo && enviando === 0;
  const motivoNaoGerar = cenas.length === 0 ? "Ponha pelo menos uma foto ou vídeo na linha do tempo" : semSaldo ? "Faltam créditos pra este vídeo" : enviando > 0 ? "Esperando os arquivos terminarem de subir" : undefined;
  const metaDoCabecalho = `${cenas.length} ${cenas.length === 1 ? "cena" : "cenas"} · ${Math.round(duracao)} s · ${nomeDoFormato}`;

  /** Tocar numa ferramenta abre o painel dela; tocar de novo na aberta fecha. */
  function escolherFerramenta(id: string) {
    const a = id as AbaId;
    if (aba === a && painelAberto && !inspetorNaFolha) setPainelAberto(false);
    else setAba(a);
  }

  /** Trocar a transição do vídeo zera a de cada cena -- menos as emendas entre partes do mesmo vídeo. */
  function transicaoDoVideo(t: TransicaoId) {
    historico.novoPasso();
    setTransicao(t);
    setCenas((lista) => lista.map((s, i) => (continuaNaProxima(lista, i) ? s : { ...s, transicao: undefined })));
  }

  const gravandoLinha = (texto: string, parar: () => void) => (
    <div className="flex items-center gap-3 rounded-2xl bg-[rgb(255_90_70/0.12)] p-3 ring-1 ring-inset ring-[rgb(255_90_70/0.3)]">
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute h-full w-full animate-ping rounded-full bg-red-500/60" />
        <span className="relative h-3 w-3 rounded-full bg-red-500" />
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold tabular-nums text-[#ffb3a5]">{texto}</span>
      <BotaoEd tamanho="p" onClick={parar}>
        Parar
      </BotaoEd>
    </div>
  );

  // ================= O PAINEL DE CADA FERRAMENTA =================
  // O mesmo conteúdo no computador (coluna à esquerda) e no celular (folha que sobe).
  function painelDaAba(): React.ReactNode {
    switch (aba) {
      case "midia":
        return (
          <div className="flex flex-col gap-6">
            {textoPendente && (
              <Nota>
                Escolha a foto: o texto <strong className="font-semibold">“{textoPendente.texto}”</strong> entra nela.{" "}
                <button type="button" onClick={() => setTextoPendente(null)} className="font-semibold underline">
                  Cancelar
                </button>
              </Nota>
            )}
            <Secao titulo="Imóvel">
              <SeletorImovel token={token} valor={imovelId} onChange={setImovelId} disabled={gerando} />
            </Secao>
            <label
              data-enviar="1"
              className={
                "group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[var(--ed-linha-forte)] px-4 py-3.5 transition hover:border-[var(--ed-acento)] hover:bg-[var(--ed-acento-suave)] " +
                (gerando ? "pointer-events-none opacity-50" : "")
              }
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--ed-elevado-2)] text-[var(--ed-texto)] transition group-hover:bg-[var(--ed-acento)] group-hover:text-white">
                <Icone nome="mais" className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[var(--ed-texto)]">{enviando > 0 ? `Enviando ${enviando}…` : "Enviar fotos ou vídeos"}</span>
                <span className="block text-[12px] text-[var(--ed-texto-2)]">Do computador ou do celular · JPG, PNG, MP4, MOV</span>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                multiple
                className="hidden"
                onChange={(e) => {
                  enviarArquivos(e.target.files);
                  e.target.value = "";
                }}
                disabled={gerando}
              />
            </label>
            {enviados.length > 0 && (
              <Secao titulo="Vídeos enviados agora" descricao="Toque pra pôr de novo no fim da linha do tempo.">
                <ul className="grid grid-cols-2 gap-2.5 max-md:grid-cols-3">
                  {enviados.map((e) => (
                    <li key={e.chave}>
                      <button
                        type="button"
                        onClick={() => inserirClipe({ arquivo: e.arquivo, url: e.url, miniatura: e.miniatura, duracao: e.duracao, nome: e.nome }, LIMITES.cenasMax - cenas.length)}
                        disabled={gerando}
                        title={`${e.nome} · pôr no fim da linha do tempo`}
                        className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--ed-elevado)] ring-1 ring-inset ring-[var(--ed-linha)] transition hover:ring-2 hover:ring-[var(--ed-acento)]"
                      >
                        {e.miniatura ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.miniatura} alt="" className="h-full w-full object-cover" draggable={false} />
                        ) : (
                          <span className="grid h-full place-items-center text-[var(--ed-texto-3)]">
                            <Icone nome="video" className="h-6 w-6" />
                          </span>
                        )}
                        <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">{Math.round(e.duracao)}s</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
            {imovelId && geracoes.length === 0 && <Vazio icone="foto" titulo="Nenhuma foto pronta neste imóvel" texto="Envie fotos acima, ou edite algumas no Encena primeiro." />}
            {!imovelId && geracoes.length === 0 && <Nota>Escolha um imóvel pra ver as fotos prontas dele, ou envie arquivos do aparelho.</Nota>}
            {geracoes.length > 0 && (
              <Secao titulo="Fotos do imóvel" descricao={celular ? "Toque numa foto pra pôr no fim do vídeo." : "Clique pra pôr no fim, ou arraste pro ponto certo da linha do tempo."}>
                <ul className="grid grid-cols-2 gap-2.5 max-md:grid-cols-3">
                  {geracoes.map((g) => {
                    const n = cenas.filter((s) => s.jobId === g.id).length;
                    return (
                      <li key={g.id}>
                        {/* Arrastável: solta num ponto da linha do tempo e a foto entra ALI.
                            Clicar continua mandando pro fim -- é o gesto de quem está montando
                            na ordem, e não se perde por causa do arraste. */}
                        <button
                          type="button"
                          draggable={!gerando}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/encena-foto", g.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => adicionarGeracao(g)}
                          disabled={gerando}
                          className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--ed-elevado)] ring-1 ring-inset ring-[var(--ed-linha)] transition hover:ring-2 hover:ring-[var(--ed-acento)] active:scale-[0.98]"
                          title={`${g.acao} · clique pra pôr no fim, arraste pra escolher o lugar`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.depois ?? ""} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" loading="lazy" draggable={false} />
                          {n > 0 && <span className="absolute top-1.5 right-1.5 rounded-full bg-[var(--ed-acento)] px-1.5 py-0.5 text-[10.5px] font-bold text-white shadow">{n}×</span>}
                          {g.antes && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">antes/depois</span>}
                          <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover:opacity-100 max-md:hidden">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ed-acento)] text-white shadow-lg">
                              <Icone nome="mais" className="h-5 w-5" />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Secao>
            )}
          </div>
        );

      case "videos":
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">
              {celular ? "Toque num vídeo pra pôr no fim da linha do tempo." : "Clique num vídeo pra pôr no fim da linha do tempo, ou arraste pro ponto certo."} Vídeo longo entra em partes de até 8s, emendadas sem corte.
            </p>
            <PainelVideos videos={videos as VideoDaLista[] | null} entrando={videosEntrando} usados={usadosPorVideo} gerando={gerando} aoAdicionar={(v) => adicionarVideoPronto(v)} aoMais={abrirMaisDoVideo} />
          </div>
        );

      case "modelos":
        return (
          <div className="flex flex-col gap-5">
            <p className="text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">Um ponto de partida por tipo de imóvel: ritmo, música, transição e os dados do imóvel já nas cenas. Depois é só ajustar.</p>
            {cenas.length === 0 && <Nota tipo="atencao">Escolha as fotos primeiro — o modelo se aplica às cenas.</Nota>}
            <div className="grid grid-cols-2 gap-2.5">
              {TEMPLATES_VIDEO.map((t) => (
                <CartaoOpcao key={t.id} ativo={templateAberto?.id === t.id} disabled={gerando || cenas.length === 0} onClick={() => setTemplateAberto((a) => (a?.id === t.id ? null : t))} titulo={t.nome} descricao={t.para} />
              ))}
            </div>
            {templateAberto && (
              <div className="ed-subir flex flex-col gap-3 rounded-2xl bg-[var(--ed-elevado)] p-4 ring-1 ring-inset ring-[var(--ed-linha)]">
                <p className="text-[14px] font-semibold text-[var(--ed-texto)]">{templateAberto.nome}</p>
                <p className="-mt-1.5 text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">{templateAberto.descricao}</p>
                <ul className="flex flex-col gap-1.5">
                  {mudancasDoTemplate(templateAberto, pecas).map((m) => (
                    <li key={m} className="flex gap-2 text-[12.5px] text-[var(--ed-texto)]">
                      <Icone nome="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ed-acento)]" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
                {templateVaiApagarTexto(espec) && <Nota tipo="atencao">Os textos que você escreveu nas cenas vão ser trocados pelos do modelo.</Nota>}
                <div className="flex gap-2">
                  <BotaoEd
                    variante="primaria"
                    onClick={() => {
                      historico.novoPasso();
                      aplicarTemplate(templateAberto);
                      avisar("Modelo aplicado", { desfazer: () => historico.desfazer() });
                    }}
                  >
                    Aplicar modelo
                  </BotaoEd>
                  <BotaoEd variante="fantasma" onClick={() => setTemplateAberto(null)}>
                    Agora não
                  </BotaoEd>
                </div>
              </div>
            )}
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col gap-5">
            <BibliotecaAudio
              escolhida={selecao?.faixa === "musica" ? (() => { const a = audios.find((x) => x.id === selecao.id); return a && a.fonte.tipo === "musica" ? a.fonte.id : musica; })() : musica}
              aoEscolher={(id) => escolherMusicaDaBiblioteca(id)}
              efeito={efeitoSonoro}
              aoEscolherEfeito={(id) => setEfeitoSonoro(id as EfeitoSonoroId)}
              efeitos={EFEITOS_SONOROS.filter((e) => e.arquivo)}
              desabilitado={gerando}
            />
            {musica !== "nenhuma" && (
              <div className="flex flex-col gap-2 rounded-2xl bg-[var(--ed-elevado)] p-4">
                <Deslizante
                  rotulo="Volume da música"
                  valor={musicaDoPrimeiroTrecho?.volume ?? musicaVolume}
                  min={0}
                  max={1}
                  passo={0.05}
                  formatar={(v) => `${Math.round(v * 100)}%`}
                  aoMudar={(v) => {
                    setMusicaVolume(v);
                    setAudios((l) => volumeDaMusica(l, v));
                  }}
                />
                {espec.narracao && <p className="text-[12px] text-[var(--ed-texto-3)]">Com voz no vídeo, a música abaixa sozinha enquanto você fala e volta no silêncio.</p>}
              </div>
            )}
          </div>
        );

      case "texto":
        return (
          <div className="flex flex-col gap-4">
            {cenaAtual ? (
              <p className="text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">
                Toque num modelo e ele entra na <strong className="font-semibold text-[var(--ed-texto)]">cena {indiceAtual + 1}</strong>. Pra mudar as palavras, toque no texto em cima do vídeo.
              </p>
            ) : (
              <Nota>Ainda não tem foto no vídeo. Toque num texto: você escolhe a foto em seguida e ele já entra nela.</Nota>
            )}
            <GaleriaTexto
              pecas={pecas}
              aoAdicionar={(t) => {
                if (cenaAtual) {
                  historico.novoPasso();
                  adicionarTexto(cenaAtual.chave, t);
                  avisar(`Texto posto na cena ${indiceAtual + 1}`, { desfazer: () => historico.desfazer() });
                  return;
                }
                setTextoPendente(t);
                setAba("midia");
              }}
              aoTrocarAnimacao={(id) => cenaAtual && mudarTexto(cenaAtual.chave, (cenaAtual.textos ?? []).length - 1, { animacao: id as AnimacaoTexto })}
              animacaoAtual={cenaAtual ? ((cenaAtual.textos ?? []).at(-1)?.animacao ?? null) : null}
              aoTrocarMovimento={(id) => cenaAtual && mudarTexto(cenaAtual.chave, (cenaAtual.textos ?? []).length - 1, { movimento: id })}
              movimentoAtual={(cenaAtual?.textos ?? []).at(-1)?.movimento ?? "nenhum"}
              ultimoTemEfeito={!!(cenaAtual?.textos ?? []).at(-1)?.arte && IDS_EFEITOS_TEXTO.has((cenaAtual?.textos ?? []).at(-1)?.arte as string)}
              temTextoSelecionado={(cenaAtual?.textos ?? []).length > 0}
              cheio={(cenaAtual?.textos ?? []).length >= LIMITES.textosPorCena}
              desabilitado={gerando}
            />
          </div>
        );

      case "elementos":
        return (
          <div className="flex flex-col gap-4">
            {cenaAtual ? (
              <p className="text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">
                As peças entram na <strong className="font-semibold text-[var(--ed-texto)]">cena {indiceAtual + 1}</strong>. No vídeo, arraste pra mudar de lugar.
              </p>
            ) : (
              <Nota>Escolha uma cena pra pôr uma peça nela.</Nota>
            )}
            <GaleriaElementos
              elementos={cenaAtual?.elementos ?? []}
              itensDaFicha={itensDaFicha}
              cor={corDaMarca}
              podeMais={!!cenaAtual && (cenaAtual.elementos?.length ?? 0) < LIMITES.elementosPorCena}
              aoAdicionar={(e) => {
                if (!cenaAtual) return;
                historico.novoPasso();
                adicionarElemento(cenaAtual.chave, e);
                avisar(`Peça posta na cena ${indiceAtual + 1}`, { desfazer: () => historico.desfazer() });
              }}
              buscarClipes={buscarClipes}
              aoMudar={(i, m) => cenaAtual && mudarElemento(cenaAtual.chave, i, m)}
              aoTirar={(i) => cenaAtual && removerElemento(cenaAtual.chave, i)}
            />
          </div>
        );

      case "legendas":
        return (
          <div className="flex flex-col gap-6">
            <Secao titulo="Narração">
              <Alternar ligado={narrar} aoMudar={setNarrar} titulo="Falar por cima do vídeo" descricao="Uma voz apresentando o imóvel. A música abaixa sozinha enquanto a voz fala." />
              {narrar && (
                <div className="flex flex-col gap-4">
                  {/* Três origens, e só uma delas cobra. A voz da pessoa não passa por modelo
                      nenhum -- é ffmpeg misturando o arquivo dela. */}
                  <Segmentado
                    rotulo="De onde vem a voz"
                    opcoes={[
                      { id: "ia", rotulo: `Voz de IA · ${CREDITOS.narracao} cr`, dica: "A IA lê o texto que você escrever" },
                      { id: "gravada", rotulo: "Gravar", icone: "microfone", dica: "Grave aqui mesmo, pelo microfone. Não gasta crédito." },
                      { id: "enviada", rotulo: "Enviar", dica: "MP3, M4A ou WAV que você já tem. Não gasta crédito." },
                    ]}
                    valor={origemVoz}
                    aoMudar={(v) => setOrigemVoz(v as OrigemVoz)}
                  />
                  {origemVoz === "ia" ? (
                    <div className="flex flex-col gap-3">
                      <textarea value={roteiro} onChange={(e) => setRoteiro(e.target.value)} rows={5} maxLength={LIMITES.roteiroMax} placeholder="Escreva o texto da narração, ou peça pra IA escrever a partir do título, preço, local e legendas." className={areaEd} aria-label="Texto da narração" />
                      <div className="flex items-center justify-between gap-2">
                        <BotaoEd icone="magica" tamanho="p" onClick={escreverRoteiro} disabled={escrevendo || gerando}>
                          {escrevendo ? "Escrevendo…" : "Escrever com IA"}
                        </BotaoEd>
                        <span className="text-[12px] tabular-nums text-[var(--ed-texto-3)]">
                          {roteiro.length}/{LIMITES.roteiroMax}
                        </span>
                      </div>
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Voz</p>
                        <div className="flex flex-wrap gap-2">
                          {VOZES.map((v) => (
                            <Pilula key={v.id} ativo={voz === v.id} onClick={() => setVoz(v.id)}>
                              {v.rotulo} · {v.genero}
                            </Pilula>
                          ))}
                        </div>
                      </div>
                      {roteiro.trim().length < 10 && <Nota tipo="atencao">Escreva pelo menos uma frase pra narração entrar.</Nota>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {origemVoz === "gravada" ? (
                        gravando ? (
                          gravandoLinha(`Gravando · ${relogio(segundosGravando)}`, pararGravacao)
                        ) : (
                          <BotaoEd icone="microfone" onClick={gravarVoz} disabled={enviandoVoz || gerando} className="w-full">
                            {enviandoVoz ? "Guardando…" : vozArquivo ? "Gravar de novo" : "Gravar minha voz"}
                          </BotaoEd>
                        )
                      ) : (
                        <label className={"inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--ed-elevado)] text-[13.5px] font-semibold text-[var(--ed-texto)] ring-1 ring-inset ring-[var(--ed-linha)] transition hover:bg-[var(--ed-elevado-2)] " + (enviandoVoz ? "pointer-events-none opacity-50" : "")}>
                          <Icone nome="mais" className="h-[18px] w-[18px]" />
                          {enviandoVoz ? "Enviando…" : vozArquivo ? "Trocar o áudio" : "Escolher áudio"}
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/aac,.mp3,.m4a,.wav"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) usarAudio(f, f.name);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {!gravando && !vozArquivo && origemVoz === "gravada" && <p className="text-[12px] text-[var(--ed-texto-3)]">O navegador vai pedir o microfone.</p>}
                      {vozArquivo && (
                        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--ed-acento-suave)] p-3 ring-1 ring-inset ring-[rgb(240_107_79/0.35)]">
                          <div className="flex items-center gap-2">
                            <Icone nome="microfone" className="h-4 w-4 shrink-0 text-[var(--ed-acento-forte)]" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ed-texto)]">{vozArquivo.nome}</span>
                            <BotaoEd variante="fantasma" tamanho="p" onClick={() => setVozArquivo(null)}>
                              Tirar
                            </BotaoEd>
                          </div>
                          <audio src={vozArquivo.url} controls className="h-9 w-full" />
                        </div>
                      )}
                      {gravacoesVoz.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[12.5px] font-medium text-[var(--ed-texto-2)]">Suas gravações ({gravacoesVoz.length})</p>
                          <ul className="flex flex-col gap-2">
                            {gravacoesVoz.map((g) => {
                              const estaAtivo = vozArquivo?.caminho === g.caminho;
                              return (
                                <li key={g.id} className={"flex flex-col gap-2 rounded-2xl p-3 ring-1 ring-inset transition " + (estaAtivo ? "bg-[var(--ed-elevado)] ring-[var(--ed-acento)]" : "bg-[var(--ed-elevado)] ring-[var(--ed-linha)]")}>
                                  <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ed-texto)]">{g.nome}</span>
                                    <Pilula
                                      ativo={estaAtivo}
                                      onClick={() => {
                                        setVozArquivo({ caminho: g.caminho, url: g.url, nome: g.nome });
                                        setNarrar(true);
                                        const m = vozNova(audios);
                                        historico.novoPasso();
                                        setAudios(m.audios);
                                        setSelecao(m.selecao);
                                        setUltimaFaixa("voz");
                                        if (m.aviso) avisar(m.aviso, { desfazer: () => historico.desfazer() });
                                      }}
                                    >
                                      {estaAtivo ? "Em uso" : "Usar esta"}
                                    </Pilula>
                                    <BotaoIcone
                                      rotulo={`Tirar ${g.nome} da lista`}
                                      icone="lixeira"
                                      perigo
                                      tamanho="p"
                                      onClick={() => {
                                        // Tirar da lista a que está EM USO tirava só da lista: ela
                                        // continuava indo pro vídeo.
                                        if (estaAtivo) setVozArquivo(null);
                                        URL.revokeObjectURL(g.url);
                                        setGravacoesVoz((lista) => lista.filter((item) => item.id !== g.id));
                                      }}
                                    />
                                  </div>
                                  <audio src={g.url} controls className="h-9 w-full" />
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {!vozArquivo && gravacoesVoz.length === 0 && <Nota tipo="atencao">Sem áudio, o vídeo sai sem voz.</Nota>}
                      {legendas && legendasDaVoz && vozArquivo && vozArquivo.caminho !== legendasDaVoz && <Nota tipo="atencao">As legendas são da outra gravação: gere de novo pra acompanhar esta voz.</Nota>}
                    </div>
                  )}
                </div>
              )}
            </Secao>

            <Divisor />

            {/* Legenda não depende de narração: quem não tem voz escreve na mão -- Reel de
                imóvel circula com o som desligado, então legenda sem voz também vale. */}
            <Secao
              titulo="Legendas"
              descricao={legendas ? `${legendas.trechos.length} trechos · corrija o que a transcrição errou` : "Reel de imóvel circula sem som: a legenda faz a mensagem chegar."}
              acao={
                legendas ? (
                  <BotaoEd variante="fantasma" tamanho="p" onClick={() => setLegendas(null)}>
                    Tirar
                  </BotaoEd>
                ) : undefined
              }
            >
              {!legendas ? (
                <div className="flex flex-col gap-2">
                  {[
                    {
                      id: "auto",
                      icone: "magica",
                      titulo: transcrevendo ? "Ouvindo a voz…" : "Legendas automáticas",
                      extra: "Grátis",
                      texto: vozArquivo ? "Ouve a sua voz e escreve sozinho. Dá pra corrigir depois." : origemVoz === "ia" && narrar ? "Com voz de IA, gere o vídeo uma vez — ao editar depois, a legenda sai da narração guardada." : "Grave ou envie a voz primeiro: a legenda sai da fala.",
                      desligado: !vozArquivo || transcrevendo,
                      acao: gerarLegendas,
                    },
                    { id: "mao", icone: "editar_prompt", titulo: "Escrever na mão", texto: "Você digita cada trecho. Não precisa de voz.", acao: () => setLegendas({ estilo: "faixa", trechos: [{ inicio: 0, fim: 3, texto: "" }] }) },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={o.acao}
                      disabled={o.desligado}
                      className="flex items-start gap-3 rounded-2xl bg-[var(--ed-elevado)] p-3.5 text-left ring-1 ring-inset ring-transparent transition hover:bg-[var(--ed-elevado-2)] hover:ring-[var(--ed-linha-forte)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--ed-elevado-2)] text-[var(--ed-texto)]">
                        <Icone nome={o.icone} className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--ed-texto)]">
                          {o.titulo}
                          {o.extra && <span className="rounded-full bg-[rgb(44_177_163/0.15)] px-2 py-0.5 text-[10.5px] font-semibold text-[#7fd6cb]">{o.extra}</span>}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--ed-texto-2)]">{o.texto}</span>
                      </span>
                    </button>
                  ))}
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--ed-elevado)] p-3.5 ring-1 ring-inset ring-transparent transition hover:bg-[var(--ed-elevado-2)] hover:ring-[var(--ed-linha-forte)]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--ed-elevado-2)] text-[var(--ed-texto)]">
                      <Icone nome="download" className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-[var(--ed-texto)]">Carregar arquivo de legenda</span>
                      <span className="mt-0.5 block text-[12px] text-[var(--ed-texto-2)]">Formatos .srt e .vtt</span>
                    </span>
                    <input
                      type="file"
                      accept=".srt,.vtt,text/plain"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const lido = lerLegenda(await f.text());
                        if (lido.trechos) setLegendas({ estilo: "faixa", trechos: lido.trechos });
                        else setErro(lido.erro);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {ESTILOS_LEGENDA.map((e) => (
                      <Pilula key={e.id} ativo={(legendas.estilo ?? "faixa") === e.id} onClick={() => setLegendas({ ...legendas, estilo: e.id })} title={e.dica}>
                        {e.rotulo}
                      </Pilula>
                    ))}
                    <Pilula ativo={(legendas.posicao ?? "base") === "base"} onClick={() => setLegendas({ ...legendas, posicao: "base" })}>
                      Embaixo
                    </Pilula>
                    <Pilula ativo={legendas.posicao === "centro"} onClick={() => setLegendas({ ...legendas, posicao: "centro" })}>
                      No meio
                    </Pilula>
                  </div>
                  <ul className="ed-rolagem flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                    {legendas.trechos.map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-11 shrink-0 text-right text-[11.5px] tabular-nums text-[var(--ed-texto-3)]">{t.inicio.toFixed(1)}s</span>
                        <input type="text" value={t.texto} onChange={(e) => mudarTrecho(i, e.target.value)} maxLength={LIMITES.trechoMax} className={campoEd + " h-10 text-[13px]"} aria-label={`Legenda ${i + 1}`} />
                        <BotaoIcone rotulo="Tirar este trecho" icone="fechar" perigo tamanho="p" onClick={() => removerTrecho(i)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Secao>

            {/* Ajuste fino da voz: só aparece quando existe voz pra ajustar. */}
            {espec.narracao && (
              <>
                <Divisor />
                <Secao titulo="Ajuste da voz">
                  <Deslizante rotulo="Volume da voz" valor={vozVolume} min={0.2} max={2} passo={0.05} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={setVozVolume} />
                  <Deslizante rotulo="Começa em" valor={vozInicio} min={0} max={LIMITES.vozInicioMax} passo={0.1} formatar={(v) => `${v.toFixed(1)}s`} aoMudar={setVozInicio} />
                </Secao>
              </>
            )}
          </div>
        );

      case "transicoes":
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">Como uma cena vira a outra. Vale pro vídeo inteiro; nos ajustes de cada cena dá pra escolher outra emenda.</p>
            {/* Cada cartão DESENHA o que a emenda faz: dois quadros e o jeito como um vira o
                outro. "Dissolver" e "Deslizar" só querem dizer alguma coisa depois de ver. */}
            <div className="grid grid-cols-2 gap-2.5">
              {TRANSICOES.map((t) => (
                <CartaoOpcao key={t.id} ativo={transicao === t.id} disabled={gerando} onClick={() => transicaoDoVideo(t.id)} title={`${t.rotulo} · ${t.segundos}s de emenda`} titulo={t.rotulo} descricao={`${t.segundos}s de emenda`}>
                  <span className="flex h-10 items-center gap-0.5 overflow-hidden rounded-lg bg-[var(--ed-fundo)]">
                    <span className="h-full flex-1 bg-[#34518a]" />
                    <span className="h-full shrink-0 bg-gradient-to-r from-[#34518a] to-[var(--ed-acento)]" style={{ width: t.id === "corte" ? 2 : t.id === "desfoque" ? 26 : 18, filter: t.id === "desfoque" ? "blur(3px)" : undefined }} />
                    <span className="h-full flex-1 bg-[var(--ed-acento)]/85" />
                  </span>
                </CartaoOpcao>
              ))}
            </div>
          </div>
        );

      case "voce":
        return (
          <div className="flex flex-col gap-6">
            <Secao titulo="Aparecer no vídeo" descricao="Você num canto, em círculo ou no pé do vídeo. Não gasta crédito.">
              {camera ? (
                <div className="flex flex-col gap-3">
                  <video ref={previaCamera} autoPlay muted playsInline className="w-full rounded-2xl bg-black" />
                  {gravandoVideo ? (
                    gravandoLinha(`Gravando · ${relogio(segundosVideo)}`, () => gravadorVideo.current?.stop())
                  ) : (
                    <div className="flex gap-2">
                      <BotaoEd variante="primaria" onClick={gravarVideo} className="flex-1">
                        <span className="h-3 w-3 rounded-full bg-[#ffffff]" />
                        Gravar
                      </BotaoEd>
                      <BotaoEd variante="fantasma" onClick={fecharCamera}>
                        Fechar a câmera
                      </BotaoEd>
                    </div>
                  )}
                </div>
              ) : apresentador ? (
                <div className="flex flex-col gap-4">
                  {apreUrl && <video src={apreUrl} controls playsInline className="w-full rounded-2xl bg-black" />}
                  <div>
                    <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Jeito</p>
                    <div className="flex flex-wrap gap-2">
                      {FORMATOS_APRESENTADOR.map((f) => (
                        <Pilula key={f.id} ativo={apresentador.formato === f.id} onClick={() => setApresentador({ ...apresentador, formato: f.id })} title={f.dica}>
                          {f.rotulo}
                        </Pilula>
                      ))}
                    </div>
                  </div>
                  {apresentador.formato !== "rodape" && (
                    <>
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Canto</p>
                        <div className="flex flex-wrap gap-2">
                          {CANTOS_APRESENTADOR.map((cn) => (
                            <Pilula key={cn.id} ativo={(apresentador.canto ?? "inferior_direito") === cn.id} onClick={() => setApresentador({ ...apresentador, canto: cn.id })}>
                              {cn.rotulo}
                            </Pilula>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Tamanho</p>
                        <div className="flex flex-wrap gap-2">
                          {TAMANHOS_APRESENTADOR.map((t) => (
                            <Pilula key={t.id} ativo={(apresentador.tamanho ?? "medio") === t.id} onClick={() => setApresentador({ ...apresentador, tamanho: t.id })}>
                              {t.rotulo}
                            </Pilula>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-3 rounded-2xl bg-[var(--ed-elevado)] p-4">
                    <Deslizante rotulo="Entra em" valor={apresentador.entra ?? 0} min={0} max={Math.max(1, Math.round(duracao))} passo={0.5} formatar={(v) => `${v.toFixed(1)}s`} aoMudar={(v) => setApresentador({ ...apresentador, entra: v })} />
                    <Deslizante rotulo="Volume da sua voz" valor={apresentador.volume ?? 1} min={0} max={2} passo={0.05} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={(v) => setApresentador({ ...apresentador, volume: v })} />
                    <Deslizante rotulo="Começar o clipe em" valor={apresentador.inicio ?? 0} min={0} max={30} passo={0.5} formatar={(v) => `${v.toFixed(1)}s`} aoMudar={(v) => setApresentador({ ...apresentador, inicio: v })} />
                  </div>
                  <BotaoEd
                    variante="perigo"
                    icone="lixeira"
                    onClick={() => {
                      historico.novoPasso();
                      setApresentador(null);
                      setApreUrl(null);
                      avisar("Você saiu do vídeo", { desfazer: () => historico.desfazer() });
                    }}
                    className="self-start"
                  >
                    Tirar do vídeo
                  </BotaoEd>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <BotaoEd icone="video" onClick={abrirCamera} disabled={enviandoApre || gerando} className="w-full">
                    {enviandoApre ? "Guardando…" : "Gravar com a câmera"}
                  </BotaoEd>
                  <label className={"inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--ed-elevado)] text-[13.5px] font-semibold text-[var(--ed-texto)] ring-1 ring-inset ring-[var(--ed-linha)] transition hover:bg-[var(--ed-elevado-2)] max-md:h-11 " + (enviandoApre ? "pointer-events-none opacity-50" : "")}>
                    <Icone nome="mais" className="h-[18px] w-[18px]" />
                    Enviar um vídeo seu
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) usarVideoApresentador(f, f.name);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="text-[12px] text-[var(--ed-texto-3)]">A câmera só é pedida depois do clique.</p>
                </div>
              )}
            </Secao>
            <Divisor />
            {/* Aparecer no vídeo e narrar são a mesma vontade -- "quero que seja MINHA voz".
                É a MESMA gravação da aba Legendas, não uma segunda: dois gravadores dariam
                dois áudios e a pergunta "qual deles entrou no vídeo?". */}
            <Secao titulo="Só a sua voz" descricao="Sem aparecer: você narra e o vídeo mostra o imóvel. Não gasta crédito.">
              {gravando ? (
                gravandoLinha(`Gravando · ${relogio(segundosGravando)}`, pararGravacao)
              ) : (
                <BotaoEd
                  icone="microfone"
                  onClick={() => {
                    // Liga a narração e escolhe "gravada" antes de pedir o microfone: sem isso
                    // o áudio seria guardado e o vídeo sairia sem ele.
                    setNarrar(true);
                    setOrigemVoz("gravada");
                    gravarVoz();
                  }}
                  disabled={enviandoVoz || gerando}
                  className="w-full"
                >
                  {enviandoVoz ? "Guardando…" : vozArquivo ? "Gravar a voz de novo" : "Gravar só a voz"}
                </BotaoEd>
              )}
              {vozArquivo && !gravando && <p className="text-[12px] text-[var(--ed-texto-2)]">Sua voz está no vídeo · {vozArquivo.nome}</p>}
            </Secao>
          </div>
        );

      case "cor": {
        // A miniatura de cada filtro é a FOTO da cena aberta passando pela mesma tabela de
        // cor que vira LUT no servidor -- não um CSS parecido.
        const naCenaCor = escopoCor === "cena" && !!cenaAtual;
        const cenaTemCor = !!cenaAtual && (!!cenaAtual.filtro || !!cenaAtual.ajustes);
        const filtroAtual = naCenaCor ? cenaAtual!.filtro ?? filtro : filtro;
        const intensidadeAtual = naCenaCor ? (cenaAtual!.filtro ? cenaAtual!.intensidade ?? 1 : intensidadeFiltro) : intensidadeFiltro;
        const ajustesAtuais: Ajustes = { ...AJUSTES_NEUTROS, ...(naCenaCor ? cenaAtual!.ajustes ?? ajustesVideo : ajustesVideo) };
        return (
          <PainelFiltros
            escopo={escopoCor}
            temCena={!!cenaAtual}
            cenaTemCorPropria={cenaTemCor}
            filtro={filtroAtual}
            intensidade={intensidadeAtual}
            ajustes={ajustesAtuais}
            desligado={gerando}
            aoEscopo={setEscopoCor}
            aoFiltro={(id) => {
              if (naCenaCor) mudarCena(cenaAtual!.chave, { filtro: id, intensidade: 1 });
              else {
                setFiltro(id);
                setIntensidadeFiltro(1);
              }
            }}
            aoIntensidade={(v) => {
              // Mexer na intensidade da cena sem filtro próprio cria o filtro próprio com o do
              // vídeo: senão o controle andaria e nada mudaria.
              if (naCenaCor) mudarCena(cenaAtual!.chave, { filtro: cenaAtual!.filtro ?? filtro, intensidade: v });
              else setIntensidadeFiltro(v);
            }}
            aoAjuste={(k, v) => {
              const novo = { ...ajustesAtuais, [k]: v };
              const limpo = Object.fromEntries(Object.entries(novo).filter(([, x]) => x)) as Partial<Ajustes>;
              const valor = Object.keys(limpo).length ? limpo : undefined;
              if (naCenaCor) mudarCena(cenaAtual!.chave, { ajustes: valor ?? {} });
              else setAjustesVideo(valor);
            }}
            aoZerar={() => {
              if (naCenaCor) mudarCena(cenaAtual!.chave, { ajustes: {} });
              else setAjustesVideo(undefined);
            }}
            aoVoltarProVideo={() => cenaAtual && mudarCena(cenaAtual.chave, { filtro: undefined, intensidade: undefined, ajustes: undefined, luz: undefined })}
          />
        );
      }

      case "ajustes":
        return (
          <div className="flex flex-col gap-6">
            <Secao titulo="Formato">
              <div className="grid grid-cols-2 gap-2.5">
                {FORMATOS.map((f) => (
                  <CartaoOpcao key={f.id} ativo={formato === f.id} disabled={gerando} onClick={() => setFormato(f.id)} titulo={`${f.rotulo} · ${f.id}`} descricao={f.dica}>
                    <span className="grid h-12 place-items-center text-[var(--ed-texto-2)]">
                      <span className="rounded-[5px] border-2 border-current" style={{ height: f.id === "16:9" ? 24 : 40, aspectRatio: PROPORCAO[f.id] }} />
                    </span>
                  </CartaoOpcao>
                ))}
              </div>
            </Secao>
            <Divisor />
            <Secao titulo="Título e dados" descricao="O título aparece no alto do vídeo; preço e local entram nos textos prontos.">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={LIMITES.tituloMax} placeholder="Título (ex.: Apto 302 · Setor Bueno)" className={campoEd} aria-label="Título do vídeo" />
              <div className="grid grid-cols-2 gap-2">
                <input value={preco} onChange={(e) => setPreco(e.target.value)} maxLength={30} placeholder="Preço" className={campoEd} aria-label="Preço" />
                <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={50} placeholder="Bairro · Cidade" className={campoEd} aria-label="Bairro e cidade" />
              </div>
            </Secao>
            <Divisor />
            <Secao
              titulo="Marca d'água"
              descricao="O seu logo por cima do vídeo inteiro. A capa e a tela final já levam a sua marca, mas quem corta as pontas do vídeo fica com o imóvel sem nada seu."
            >
              {/* Sem logo cadastrado não há o que carimbar, e ligar o botão só produziria um
                  aviso depois de esperar o vídeo montar. Melhor dizer aqui. */}
              {!marca?.logo ? (
                <Nota>
                  Para usar marca d&apos;água, primeiro envie seu logo em <strong>Minha marca</strong>.
                </Nota>
              ) : (
                <>
                  <Alternar
                    ligado={!!marcaDagua}
                    aoMudar={(v) => setMarcaDagua(v ? { canto: "inferior_direito", tamanho: "media", opacidade: OPACIDADE_MARCA_DAGUA_PADRAO } : null)}
                    titulo="Logo durante o vídeo todo"
                    descricao="Do primeiro ao último quadro, por cima de tudo."
                  />
                  {marcaDagua && (
                    <div className="flex flex-col gap-3.5 rounded-2xl bg-[var(--ed-elevado)] p-3.5">
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Canto</p>
                        <div className="flex flex-wrap gap-2">
                          {CANTOS_APRESENTADOR.map((cn) => (
                            <Pilula key={cn.id} ativo={marcaDagua.canto === cn.id} onClick={() => setMarcaDagua({ ...marcaDagua, canto: cn.id })}>
                              {cn.rotulo}
                            </Pilula>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Tamanho</p>
                        <div className="flex flex-wrap gap-2">
                          {TAMANHOS_MARCA_DAGUA.map((t) => (
                            <Pilula key={t.id} ativo={marcaDagua.tamanho === t.id} onClick={() => setMarcaDagua({ ...marcaDagua, tamanho: t.id })} title={`${Math.round(t.fracao * 100)}% da largura do vídeo`}>
                              {t.rotulo}
                            </Pilula>
                          ))}
                        </div>
                      </div>
                      <Deslizante
                        rotulo="Transparência"
                        valor={marcaDagua.opacidade}
                        min={0.15}
                        max={1}
                        passo={0.05}
                        formatar={(v) => `${Math.round(v * 100)}%`}
                        aoMudar={(v) => setMarcaDagua({ ...marcaDagua, opacidade: v })}
                      />
                      {/* O logo de verdade, no canto escolhido, sobre um retângulo com a
                          proporção do formato: é mais honesto que descrever em palavras. */}
                      <div>
                        <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Como vai ficar</p>
                        <div
                          className="relative mx-auto overflow-hidden rounded-xl bg-[var(--ed-fundo)] ring-1 ring-[var(--ed-linha)]"
                          style={{ width: 132, aspectRatio: `${FORMATOS.find((f) => f.id === formato)?.largura ?? 1080} / ${FORMATOS.find((f) => f.id === formato)?.altura ?? 1920}` }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket, some em minutos */}
                          <img
                            src={marca.logo}
                            alt=""
                            style={{
                              position: "absolute",
                              width: `${(TAMANHOS_MARCA_DAGUA.find((t) => t.id === marcaDagua.tamanho)?.fracao ?? 0.16) * 100}%`,
                              opacity: marcaDagua.opacidade,
                              ...(marcaDagua.canto.startsWith("superior") ? { top: "3.5%" } : { bottom: "6%" }),
                              ...(marcaDagua.canto.endsWith("direito") ? { right: "3.5%" } : { left: "3.5%" }),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Secao>
            <Divisor />
            <Secao titulo="Capa e tela final">
              {/* A capa é o que aparece ANTES de alguém tocar no play -- no feed, no WhatsApp,
                  na lista. Só oferecida quando há o que escrever nela. */}
              {(titulo.trim() || preco.trim()) && <Alternar ligado={capaMontada} aoMudar={setCapaMontada} titulo="Capa com nome e preço" descricao="A imagem que aparece antes de tocar o vídeo. Sem isso, a capa é o quadro cru da cena escolhida." />}
              <Alternar ligado={telaFinal} aoMudar={setTelaFinal} titulo="Tela final com seu contato" descricao="Nome, CRECI, WhatsApp e logo da sua marca." />
              {telaFinal && (
                <div className="flex flex-col gap-2.5 rounded-2xl bg-[var(--ed-elevado)] p-3.5">
                  <p className="text-[12.5px] font-medium text-[var(--ed-texto-2)]">Frase da tela final</p>
                  <div className="flex flex-wrap gap-2">
                    {/* "Chame no WhatsApp" some quando a marca não tem número: sem número a
                        frase manda o cliente pra lugar nenhum. */}
                    {CHAMADAS.filter((f) => marca?.whatsapp || !/whatsapp/i.test(f)).map((f) => (
                      <Pilula key={f} ativo={chamada === f} onClick={() => setChamada(f)}>
                        {f}
                      </Pilula>
                    ))}
                    <Pilula ativo={chamada === ""} onClick={() => setChamada("")}>
                      Sem frase
                    </Pilula>
                  </div>
                  <input value={chamada} onChange={(e) => setChamada(e.target.value)} maxLength={LIMITES.chamadaMax} placeholder="Ou escreva a sua" className={campoEd} aria-label="Frase da tela final" />
                </div>
              )}
              {fichaResumo && (
                <Alternar
                  ligado={cenas.length > 0 && cenas[0].legenda === fichaResumo}
                  disabled={cenas.length === 0 || gerando}
                  aoMudar={(v) => {
                    const primeira = cenas[0];
                    if (primeira) mudarCena(primeira.chave, { legenda: v ? fichaResumo : "" });
                  }}
                  titulo="Dados do imóvel na primeira cena"
                  descricao={`“${fichaResumo}” — vem da ficha do imóvel.`}
                />
              )}
            </Secao>
            <Divisor />
            {/* Não é um formulário: é o ESPELHO de Minha marca. Mexer é lá -- a marca vale pro
                produto inteiro, e dois lugares que a mudam são duas verdades. */}
            <Secao titulo="Sua marca" descricao={<>Entra sozinha na tela final, na capa e nos carimbos. Pra mudar, vá em <Link href="/marca" className="font-medium text-[var(--ed-texto)] underline">Minha marca</Link>.</>}>
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--ed-elevado)] p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#ffffff]">
                  {marca?.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={marca.logo} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <Icone nome="marca" className="h-5 w-5 text-[#7687a8]" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-[var(--ed-texto)]">{marca?.nome || "Sem nome cadastrado"}</p>
                  <p className="truncate text-[12px] text-[var(--ed-texto-2)]">{[marca?.creci ? `CRECI ${marca.creci}` : null, marca?.whatsapp, marca?.instagram].filter(Boolean).join(" · ") || "Sem CRECI nem contato"}</p>
                </div>
                <span className="h-8 w-8 shrink-0 rounded-lg ring-2 ring-white/10" style={{ background: marca?.cor || "#0f2d5b" }} title={`Cor da marca: ${marca?.cor || "#0f2d5b"}`} />
              </div>
              {!marca?.nome && !marca?.whatsapp && !marca?.logo && (
                <Nota tipo="atencao">
                  Sem nome, WhatsApp ou logo, o vídeo sai sem tela final.{" "}
                  <Link href="/marca" className="font-semibold underline">
                    Preencher agora
                  </Link>
                </Nota>
              )}
            </Secao>
          </div>
        );
    }
  }

  // ================= OS AJUSTES DA CENA =================
  // Tudo que dá pra mexer na cena aberta, num lugar só: a coluna da direita (tela larga),
  // embaixo do palco (tela média) ou a folha (celular, pelo botão Ajustes da barra).
  function inspetorDaCena(): React.ReactNode {
    if (!cenaAtual) return <Vazio icone="foto" titulo="Nenhuma cena ainda" texto="Ponha fotos ou vídeos na linha do tempo: os ajustes de cada cena aparecem aqui." />;
    const k = cenaAtual.chave;
    const ehCapa = (capa ?? cenas[0]?.chave) === k;
    const noCursor = cabecoteDentroDe(k) !== null;
    const podeDividir = !gerando && cenaAtual.tipo !== "animada" && cenas.length < LIMITES.cenasMax && cenaAtual.duracao >= LIMITES.duracaoMin * 2;
    const listaDuracoes = DURACOES_CENA[cenaAtual.tipo === "tour360" ? "tour360" : cenaAtual.tipo === "animada" ? "animada" : "foto"];
    // Dividir e aparar deixam durações fora da lista (7s, 2s...). Sem a opção, o seletor
    // mostrava a primeira da lista e mentia.
    const duracoes = listaDuracoes.includes(cenaAtual.duracao) ? listaDuracoes : [...listaDuracoes, cenaAtual.duracao].sort((a, b) => a - b);
    const rotuloCampo = "mb-1.5 block text-[12.5px] font-medium text-[var(--ed-texto-2)]";
    return (
      <div className="flex flex-col gap-5" data-inspetor="1">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--ed-elevado)] text-[var(--ed-texto-3)] ring-1 ring-inset ring-[var(--ed-linha)]">
            {cenaAtual.miniatura ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cenaAtual.miniatura} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icone nome={cenaAtual.ehClipe ? "video" : "foto"} className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--ed-texto)]">
              Cena {indiceAtual + 1} <span className="font-normal text-[var(--ed-texto-3)]">de {cenas.length}</span>
            </p>
            <p className="truncate text-[12px] text-[var(--ed-texto-2)]">{cenaAtual.rotulo}</p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 rounded-2xl bg-[var(--ed-elevado)] p-1" role="toolbar" aria-label="Ações da cena">
          <BotaoIcone rotulo="Mover pra trás" icone="seta_esq" tamanho="p" disabled={gerando || indiceAtual === 0} onClick={() => naCena(() => mover(k, -1), "Cena movida")} />
          <BotaoIcone rotulo="Mover pra frente" icone="seta_dir" tamanho="p" disabled={gerando || indiceAtual === cenas.length - 1} onClick={() => naCena(() => mover(k, 1), "Cena movida")} />
          <BotaoIcone rotulo={cenaAtual.tipo === "animada" ? "Cena animada não se divide" : noCursor ? "Dividir no cursor" : "Dividir no meio"} icone="dividir" tamanho="p" disabled={!podeDividir} onClick={() => naCena(() => dividirNoCabecote(k), "Cena dividida")} />
          <BotaoIcone rotulo="Duplicar" icone="copiar" tamanho="p" disabled={gerando || cenas.length >= LIMITES.cenasMax} onClick={() => naCena(() => duplicar(k), "Cena duplicada")} />
          <BotaoIcone rotulo={ehCapa ? "Esta cena é a capa" : "Usar como capa do vídeo"} icone="estrela" tamanho="p" ativo={ehCapa} onClick={() => !ehCapa && naCena(() => setCapa(k), "Esta cena virou a capa")} />
          <span className="flex-1" />
          <BotaoIcone rotulo="Apagar a cena" icone="lixeira" perigo tamanho="p" disabled={gerando} onClick={() => naCena(() => remover(k), "Cena apagada")} />
        </div>

        {(cenaAtual.tipo === "animada" && cenaAtual.animacaoGuardada && cenaAtual.animacaoGuardada.animacao === cenaAtual.animacao && cenaAtual.animacaoGuardada.duracao === cenaAtual.duracao) || cenaAtual.ehPanoramica ? (
          <div className="flex flex-wrap gap-2">
            {cenaAtual.tipo === "animada" && cenaAtual.animacaoGuardada && cenaAtual.animacaoGuardada.animacao === cenaAtual.animacao && cenaAtual.animacaoGuardada.duracao === cenaAtual.duracao && (
              <span className="rounded-full bg-[rgb(44_177_163/0.15)] px-2.5 py-1 text-[12px] font-medium text-[#7fd6cb]" title="O clipe desta animação já foi gerado num vídeo anterior. Com o mesmo movimento e duração, não custa de novo.">
                animação já feita · grátis
              </span>
            )}
            {cenaAtual.ehPanoramica && (
              <span className="rounded-full bg-[rgb(44_177_163/0.15)] px-2.5 py-1 text-[12px] font-medium text-[#7fd6cb]" title="Panorâmica não cabe parada no quadro: as pontas seriam cortadas. Já deixei no efeito que desliza.">
                panorâmica · deslizando
              </span>
            )}
          </div>
        ) : null}

        <div>
          <span className={rotuloCampo}>Tipo de cena</span>
          <div className="flex flex-wrap gap-2">
            {!cenaAtual.ehClipe && !cenaAtual.eh360 && (
              <>
                <Pilula ativo={cenaAtual.tipo === "foto"} onClick={() => mudarCena(k, { tipo: "foto" })}>
                  Foto
                </Pilula>
                {cenaAtual.temAntes && (
                  <Pilula ativo={cenaAtual.tipo === "antes_depois"} onClick={() => mudarCena(k, { tipo: "antes_depois" })}>
                    Antes e depois
                  </Pilula>
                )}
                <Pilula ativo={cenaAtual.tipo === "animada"} onClick={() => mudarCena(k, { tipo: "animada" })} title={`+${CREDITOS.animada} créditos. A IA move a CÂMERA pelo ambiente. Não entra pessoa, bicho nem móvel novo.`} icone="magica">
                  Mover a câmera · {CREDITOS.animada} cr
                </Pilula>
              </>
            )}
            {cenaAtual.eh360 && (
              <>
                <Pilula ativo={cenaAtual.tipo === "tour360"} onClick={() => mudarCena(k, { tipo: "tour360", duracao: Math.max(cenaAtual.duracao, 6) })} title="Sua foto 360 vira passeio: a câmera anda dentro dela de verdade, sem IA e sem crédito.">
                  Passear na 360
                </Pilula>
                <Pilula ativo={cenaAtual.tipo === "foto"} onClick={() => mudarCena(k, { tipo: "foto" })}>
                  Foto comum
                </Pilula>
              </>
            )}
            {cenaAtual.ehClipe && (
              <>
                <Pilula ativo={cenaAtual.tipo === "clipe"} onClick={() => mudarCena(k, { tipo: "clipe" })}>
                  Vídeo
                </Pilula>
                <Pilula ativo={cenaAtual.tipo === "tour360"} onClick={() => mudarCena(k, { tipo: "tour360", duracao: Math.max(cenaAtual.duracao, 6) })} title="Só se o vídeo foi gravado com câmera 360 (equirretangular)">
                  Passear na 360
                </Pilula>
              </>
            )}
          </div>
          {cenaAtual.tipo === "animada" && (
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--ed-texto-2)]">
              {ANIMACOES.find((a) => a.id === cenaAtual.animacao)?.descricao} <strong className="font-medium text-[var(--ed-texto)]">Só a câmera se move</strong> — o imóvel fica como está. Leva <strong className="font-medium text-[var(--ed-texto)]">alguns minutos</strong>.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {cenaAtual.tipo === "foto" && (
            <label className="col-span-2 block">
              <span className={rotuloCampo}>Movimento</span>
              <select value={cenaAtual.efeito} onChange={(e) => mudarCena(k, { efeito: e.target.value as EfeitoId })} title={EFEITOS.find((e) => e.id === cenaAtual.efeito)?.dica} className={seletorEd}>
                {EFEITOS.map((e) => (
                  <option key={e.id} value={e.id} title={e.dica}>
                    {e.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {cenaAtual.tipo === "animada" && (
            <label className="col-span-2 block">
              <span className={rotuloCampo}>Câmera</span>
              <select value={cenaAtual.animacao} onChange={(e) => mudarCena(k, { animacao: e.target.value as AnimacaoId })} className={seletorEd} title={ANIMACOES.find((a) => a.id === cenaAtual.animacao)?.descricao}>
                {animacoesOferecidas().map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {cenaAtual.tipo === "tour360" && (
            <label className="col-span-2 block">
              <span className={rotuloCampo}>Passeio</span>
              <select value={cenaAtual.movimento} onChange={(e) => mudarCena(k, { movimento: e.target.value as Movimento360Id })} className={seletorEd} title={MOVIMENTOS_360.find((m) => m.id === cenaAtual.movimento)?.descricao}>
                {MOVIMENTOS_360.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={rotuloCampo}>Duração</span>
            <select value={cenaAtual.duracao} onChange={(e) => mudarCena(k, { duracao: Number(e.target.value) })} className={seletorEd}>
              {duracoes.map((d) => (
                <option key={d} value={d}>
                  {d} s
                </option>
              ))}
            </select>
          </label>
          {/* Acabamento DESTA cena. "Igual ao vídeo" é o normal: a cena só sai da linha quando
              a pessoa quer -- a fachada em preto e branco no meio de um vídeo claro. */}
          <label className="block">
            <span className={rotuloCampo}>Cor</span>
            <select value={cenaAtual.filtro ?? ""} onChange={(e) => mudarCena(k, { filtro: (e.target.value || undefined) as FiltroId | undefined })} className={seletorEd}>
              <option value="">Igual ao vídeo</option>
              {FILTROS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {cenaAtual.ehClipe && (
          <div className="flex flex-col gap-3 rounded-2xl bg-[var(--ed-elevado)] p-4">
            {/* Aparar: o começo do clipe é onde a pessoa ainda estava acertando o celular. */}
            <Deslizante
              rotulo="Começa no segundo"
              valor={cenaAtual.inicio ?? 0}
              min={0}
              max={Math.max(0.5, Math.min(LIMITES.aparaMax, (cenaAtual.duracaoArquivo ?? 30) - 1))}
              passo={0.5}
              formatar={(v) => `${v.toFixed(1)}s`}
              aoMudar={(v) => mudarCena(k, { inicio: v || undefined })}
            />
            {cenaAtual.tipo === "clipe" && <Alternar ligado={cenaAtual.melhorar} aoMudar={(v) => mudarCena(k, { melhorar: v })} titulo="Melhorar a cor do vídeo" descricao="Um pouco mais de contraste, cor e nitidez." />}
          </div>
        )}

        {/* Luz: o único número solto, porque é o único defeito que toda foto de imóvel tem de
            vez em quando -- o cômodo saiu escuro. O resto de cor vem com nome. */}
        <Deslizante
          rotulo="Luz"
          valor={cenaAtual.luz ?? 0}
          min={-LIMITES.luzMax}
          max={LIMITES.luzMax}
          passo={0.01}
          formatar={(v) => (v ? (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`) : "normal")}
          aoMudar={(v) => mudarCena(k, { luz: v || undefined })}
        />

        <label className="block">
          <span className={rotuloCampo}>Legenda da cena</span>
          <input type="text" value={cenaAtual.legenda} onChange={(e) => mudarCena(k, { legenda: e.target.value })} maxLength={LIMITES.legendaMax} placeholder="Ex.: Sala de estar · 32 m²" className={campoEd} />
        </label>

        {/* Textos da cena: etiquetas prontas e as PEÇAS do imóvel -- ninguém abre um editor
            pra digitar de novo um preço que já está no cadastro. */}
        <Secao titulo="Textos nesta cena">
          {(cenaAtual.textos ?? []).map((t, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl bg-[var(--ed-elevado)] p-3">
              <div className="flex items-center gap-1.5">
                <input type="text" value={t.texto} onChange={(e) => mudarTexto(k, i, { texto: e.target.value })} maxLength={LIMITES.textoMax} placeholder="Escreva o texto" className={campoEd + " h-10"} aria-label={`Texto ${i + 1}`} />
                <BotaoIcone rotulo="Tirar este texto" icone="lixeira" perigo tamanho="p" onClick={() => naCena(() => removerTexto(k, i), "Texto tirado")} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <select value={t.posicao ?? "base"} onChange={(e) => mudarTexto(k, i, { posicao: e.target.value as PosicaoTexto })} className={seletorEd + " h-10 px-2 text-[12.5px]"} aria-label="Posição do texto">
                  {POSICOES_TEXTO.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
                <select value={t.estilo ?? "faixa"} onChange={(e) => mudarTexto(k, i, { estilo: e.target.value as EstiloTexto })} className={seletorEd + " h-10 px-2 text-[12.5px]"} aria-label="Estilo do texto" title={ESTILOS_TEXTO.find((x) => x.id === (t.estilo ?? "faixa"))?.dica}>
                  {ESTILOS_TEXTO.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.rotulo}
                    </option>
                  ))}
                </select>
                <select value={t.animacao ?? "nenhuma"} onChange={(e) => mudarTexto(k, i, { animacao: e.target.value as AnimacaoTexto })} className={seletorEd + " h-10 px-2 text-[12.5px]"} aria-label="Entrada do texto">
                  {ANIMACOES_TEXTO.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {(cenaAtual.textos ?? []).length < LIMITES.textosPorCena ? (
            <div className="flex flex-col gap-2">
              {pecas.length > 0 && (
                <>
                  <p className="text-[12px] text-[var(--ed-texto-3)]">Do imóvel — já preenchido</p>
                  <div className="flex flex-wrap gap-2">
                    {pecas.map((p) => (
                      <Pilula key={p.id} icone="mais" onClick={() => naCena(() => adicionarTexto(k, { texto: p.texto, estilo: p.id === "preco" ? "destaque" : "faixa", posicao: "base", animacao: "surgir" }), "Texto posto")} title={`${p.rotulo}: ${p.texto}`}>
                        {p.rotulo}
                      </Pilula>
                    ))}
                  </div>
                </>
              )}
              <p className="text-[12px] text-[var(--ed-texto-3)]">Etiquetas</p>
              <div className="flex flex-wrap gap-2">
                {SELOS_IMOVEL.map((s) => (
                  <Pilula key={s.id} onClick={() => naCena(() => adicionarTexto(k, { texto: s.texto, estilo: s.estilo, posicao: s.posicao, animacao: "surgir" }), "Texto posto")}>
                    {s.texto}
                  </Pilula>
                ))}
                <Pilula icone="editar_prompt" onClick={() => naCena(() => adicionarTexto(k, { texto: "", estilo: "faixa", posicao: "centro", animacao: "nenhuma" }))}>
                  Escrever
                </Pilula>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--ed-texto-3)]">Três textos já é o limite desta cena.</p>
          )}
        </Secao>

        {indiceAtual < cenas.length - 1 && (
          <Secao titulo={`Emenda com a cena ${indiceAtual + 2}`}>
            <div className="flex flex-wrap gap-2">
              {TRANSICOES.map((t) => (
                <Pilula key={t.id} ativo={(cenaAtual.transicao ?? transicao) === t.id} onClick={() => mudarCena(k, { transicao: t.id })}>
                  {t.rotulo}
                </Pilula>
              ))}
            </div>
          </Secao>
        )}
      </div>
    );
  }

  // ================= O PALCO =================
  // A cena no tamanho e na proporção em que ela vai sair, com o título, os textos, as
  // peças, o Você e a legenda por cima. O quadro é sempre o MAIOR que cabe na área (largura
  // e altura), centrado -- no computador e no celular, em qualquer formato.
  const quadroDoPalco = (
    <div
      ref={palcoRef}
      data-palco
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-[#0b1426] shadow-[var(--ed-sombra-3)] ring-1 ring-white/[0.06]"
      style={{ width: `min(calc(100cqw - ${celular ? 24 : 48}px), calc((100cqh - ${celular ? 16 : 32}px) * ${proporcao}))`, aspectRatio: PROPORCAO[formato] }}
      // Botão direito (ou dedo segurado) em cima do quadro: o que dá pra fazer com a cena. Os
      // textos por cima têm o menu DELES e param o evento aqui.
      onContextMenu={cenaAtual ? (ev) => abrirMenuDaCena(ev, cenaAtual) : undefined}
    >
      {cenaAtual?.ehClipe && cenaAtual.videoUrl ? (
        <VideoNoPalco
          key={cenaAtual.chave}
          url={cenaAtual.videoUrl}
          cena={cenaAtual}
          inicioDaCena={iniciosDasCenas[indiceAtual] ?? 0}
          tempo={tempo}
          tocando={tocando}
          relogio={previa.relogio}
          largura={alturaPalco * proporcao}
          altura={alturaPalco}
          miniatura={cenaAtual.miniatura}
        />
      ) : cenaAtual?.miniatura ? (
        // O palco mostra a foto COM a cor que vai sair: filtro, intensidade, ajustes e
        // vinheta, na mesma conta do servidor.
        <FotoComCor src={cenaAtual.miniatura} grade={gradeDaCena(cenaAtual, { filtro, intensidadeFiltro, ajustes: ajustesVideo })} proporcao={proporcao} lado={640} className="h-full w-full" />
      ) : cenaAtual ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--ed-texto-3)]">
          <Icone nome="video" className="h-9 w-9" />
          <span className="px-6 text-center text-xs">Clipe — aparece no vídeo montado</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center" data-palco-vazio="1">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] text-[var(--ed-texto-2)]">
            <Icone nome="video" className="h-7 w-7" />
          </span>
          <p className="text-[15px] font-semibold text-[var(--ed-texto)]">Monte o vídeo do imóvel</p>
          {alturaPalco > 330 && <p className="max-w-[230px] text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">Comece pelas fotos prontas do imóvel, por um vídeo seu ou por arquivos do aparelho.</p>}
          <div className="mt-1 flex w-full max-w-[220px] flex-col gap-2">
            <BotaoEd variante="primaria" icone="foto" onClick={() => setAba("midia")}>
              Fotos e arquivos
            </BotaoEd>
            <BotaoEd icone="video" onClick={() => setAba("videos")}>
              Seus vídeos
            </BotaoEd>
          </div>
        </div>
      )}
      {titulo && cenaAtual && (
        <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
          {editandoTitulo ? (
            <input
              autoFocus
              defaultValue={titulo}
              maxLength={LIMITES.tituloMax}
              onBlur={(e) => {
                setTitulo(e.target.value.trim());
                setEditandoTitulo(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditandoTitulo(false);
              }}
              className="pointer-events-auto w-full max-w-[85%] rounded-lg border border-white/40 bg-neutral-950/90 px-2.5 py-1 text-center text-[12px] font-semibold text-white shadow-xl outline-none ring-2 ring-white/60 backdrop-blur-md"
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={() => setEditandoTitulo(true)}
              onKeyDown={(e) => e.key === "Enter" && setEditandoTitulo(true)}
              {...menu.gatilho([
                { rotulo: "Editar o título", icone: "editar_prompt", aoEscolher: () => setEditandoTitulo(true) },
                { rotulo: "Tirar o título do vídeo", icone: "lixeira", perigo: true, dica: "A faixa some do topo de todas as cenas", aoEscolher: () => setTitulo("") },
              ])}
              title="Clique pra editar · botão direito pra mais"
              className="pointer-events-auto cursor-pointer truncate rounded-md bg-neutral-950/80 px-2 py-1 text-[11px] font-semibold text-white shadow backdrop-blur-sm transition hover:ring-2 hover:ring-white/70"
            >
              {titulo}
            </span>
          )}
        </span>
      )}
      {/* Os textos da cena, no lugar em que vão sair. Suporta posição livre ou ancorada. */}
      {cenaAtual &&
        textosDaCena({ legenda: cenaAtual.legenda || undefined, textos: cenaAtual.textos }).map((t, i) => {
          const est = ESTILO_TEXTO_POR_ID[t.estilo ?? "faixa"];
          const pos = t.posicao ?? "base";
          const ehLegenda = !!cenaAtual.legenda && i === 0;
          const indice = ehLegenda ? -1 : i - (cenaAtual.legenda ? 1 : 0);
          const emEdicao = editando?.chave === cenaAtual.chave && editando.indice === indice;
          const comEfeito = !!t.arte && IDS_EFEITOS_TEXTO.has(t.arte);
          const estiloLivre = typeof t.x === "number" && typeof t.y === "number";
          const wrapperClasses = estiloLivre
            ? "pointer-events-none absolute z-20 flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
            : "pointer-events-none absolute inset-x-0 z-20 flex justify-center " +
              (comEfeito
                ? pos === "topo"
                  ? titulo
                    ? "top-[19%]"
                    : "top-[8%]"
                  : pos === "centro"
                    ? "top-1/2 -translate-y-1/2"
                    : "bottom-[9%]"
                : "px-3 " + (pos === "topo" ? "top-[7%]" : pos === "centro" ? "top-1/2 -translate-y-1/2" : "bottom-[8%]"));
          const wrapperStyle: React.CSSProperties = estiloLivre ? { left: `${t.x}%`, top: `${t.y}%` } : {};
          const campoNoPalco = (
            <input
              autoFocus
              value={textoEmDigitacao}
              onChange={(e) => setTextoEmDigitacao(e.target.value)}
              maxLength={ehLegenda ? LIMITES.legendaMax : LIMITES.textoMax}
              onBlur={() => salvarTextoDoPalco(cenaAtual.chave, indice, textoEmDigitacao)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditando(null);
              }}
              placeholder="Digite o texto…"
              className="pointer-events-auto w-56 max-w-[90%] rounded-xl border border-white/40 bg-neutral-950/90 px-3 py-1.5 text-center text-[15px] font-semibold text-white shadow-2xl outline-none ring-2 ring-white/60 backdrop-blur-md"
            />
          );
          return (
            <span key={i} className={wrapperClasses} style={wrapperStyle}>
              {comEfeito ? (
                <div className="relative flex flex-col items-center">
                  <span
                    role="button"
                    tabIndex={0}
                    {...menu.gatilho(itensDoTexto(cenaAtual, indice, t))}
                    onPointerDown={(e) => tocarTextoDoPalco(e, cenaAtual.chave, indice, t.texto || "", emEdicao)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrirEdicaoTexto(cenaAtual.chave, indice, t.texto || "");
                      }
                    }}
                    title="Arraste pra mover · toque pra editar"
                    data-texto-palco="1"
                    className="pointer-events-auto flex cursor-grab touch-none select-none justify-center transition hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.9)] active:cursor-grabbing"
                  >
                    <TextoComEfeito efeito={t.arte as string} texto={emEdicao ? textoEmDigitacao || t.texto || "Texto" : t.texto || "Texto"} formato={formato} n={i} movimento={t.movimento} />
                  </span>
                  {emEdicao && (
                    // Na metade de baixo, o campo abre por cima: embaixo ele sai do palco.
                    <div className={`pointer-events-auto absolute z-30 flex flex-col items-center gap-1 ${(estiloLivre ? (t.y as number) > 55 : pos !== "topo") ? "bottom-full mb-2" : "top-full mt-2"}`}>
                      {campoNoPalco}
                      <span className="rounded bg-black/80 px-2 py-0.5 text-[10px] text-white/90">Enter pra salvar · Esc pra cancelar</span>
                    </div>
                  )}
                </div>
              ) : emEdicao ? (
                campoNoPalco
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  {...menu.gatilho(itensDoTexto(cenaAtual, indice, t))}
                  onPointerDown={(e) => tocarTextoDoPalco(e, cenaAtual.chave, indice, t.texto || "", emEdicao)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      abrirEdicaoTexto(cenaAtual.chave, indice, t.texto || "");
                    }
                  }}
                  title="Arraste pra mover · toque pra editar"
                  data-texto-palco="1"
                  className="pointer-events-auto max-w-full cursor-grab touch-none select-none truncate rounded-md px-2.5 py-1 text-white shadow backdrop-blur-sm transition hover:ring-2 hover:ring-white/70 active:cursor-grabbing"
                  style={{
                    // As cores do vídeo (video.ts, ESTILOS_TEXTO): etiqueta é coral lá, então é aqui.
                    background: est.id === "etiqueta" ? "rgba(240,107,79,0.88)" : "rgba(15,45,91,0.88)",
                    fontSize: est.id === "destaque" ? 20 : est.id === "etiqueta" ? 10 : 12,
                    fontWeight: est.id === "destaque" ? 700 : 500,
                  }}
                >
                  {t.texto || "texto"}
                </span>
              )}
            </span>
          );
        })}
      {/* As peças (adesivos, ficha, contato, moldura) no lugar em que saem no vídeo. */}
      {cenaAtual && (cenaAtual.elementos?.length ?? 0) > 0 && (
        <ElementosNoPalco
          elementos={cenaAtual.elementos ?? []}
          proporcao={proporcao}
          topoOcupado={!!titulo}
          cor={corDaMarca}
          itensDaFicha={itensDaFicha}
          gatilho={menu.gatilho}
          aoMudar={(i, m) => mudarElemento(cenaAtual.chave, i, m)}
          aoTirar={(i) => removerElemento(cenaAtual.chave, i)}
          aoDuplicar={(i) => {
            const el = cenaAtual.elementos?.[i];
            if (el) adicionarElemento(cenaAtual.chave, { ...el });
          }}
          aoMoverCamada={(i, direcao) => moverCamadaElemento(cenaAtual.chave, i, direcao)}
        />
      )}
      {/* Você por cima da foto, no lugar e no tamanho em que sai no vídeo. */}
      {apresentador && apreUrl && (
        <AoVivo relogio={previa.relogio} tempo={tempo} tocando={tocando}>
          {(t) => (
            <ApresentadorNoPalco
              apresentador={apresentador}
              url={apreUrl}
              proporcao={proporcao}
              aoMudar={setApresentador}
              tempo={t}
              tocando={tocando}
              selecionado={selecao?.faixa === "voce"}
              aoSelecionar={() => setSelecao({ faixa: "voce" })}
              aoMedirDuracao={(d) => setSegundosDoVoce(Math.round(d * 100) / 100)}
            />
          )}
        </AoVivo>
      )}
      {/* A legenda de agora, no lugar e no tamanho em que sai no vídeo. */}
      <AoVivo relogio={previa.relogio} tempo={tempo} tocando={tocando}>
        {(t) => (
          <LegendaNoPalco
            legendas={legendas}
            tempo={t}
            alturaPalco={alturaPalco}
            apresentadorNoPe={apresentador?.formato === "rodape"}
            selecionado={selecao?.faixa === "legendas" ? selecao.indice : null}
            aoSelecionar={(i) => setSelecao({ faixa: "legendas", indice: i })}
          />
        )}
      </AoVivo>
    </div>
  );

  // Gerando: o que está acontecendo, em cima do palco (e não um cartão empurrando o quadro).
  const avisoGerando = gerando && progresso && (
    <div className="ed-subir pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
      <div className="pointer-events-auto max-w-[520px] rounded-2xl bg-[rgb(10_21_41/0.92)] px-4 py-3 text-[12.5px] text-[var(--ed-texto-2)] shadow-[var(--ed-sombra-2)] ring-1 ring-[var(--ed-linha)] backdrop-blur">
        <p className="font-semibold text-[var(--ed-texto)]">
          {progresso.mensagem} <span className="font-normal text-[var(--ed-texto-2)]">· etapa {Math.min(progresso.feitas + 1, progresso.total)} de {progresso.total}</span>
        </p>
        <p className="mt-0.5">
          {relogio(segundosGerando)} de {esperaTotal <= 60 ? "menos de 1 min" : `cerca de ${Math.round(esperaTotal / 60)} min`} esperados · mantenha esta aba aberta
        </p>
        {segundosGerando > esperaTotal * 2 && <p className="mt-1 text-[#f1c86a]">Está demorando mais que o normal. A fila da IA às vezes engarrafa — costuma sair. Se passar de 15 minutos, feche e tente de novo: o crédito de uma cena que não voltou é devolvido.</p>}
      </div>
    </div>
  );

  const avisoErro = erro && (
    <div className="ed-subir absolute inset-x-3 top-3 z-30 flex justify-center" role="alert">
      <div className="flex max-w-[560px] items-start gap-2 rounded-2xl bg-[rgb(70_22_18/0.95)] py-2 pr-2 pl-4 text-[13px] text-[#ffc2b6] shadow-[var(--ed-sombra-2)] ring-1 ring-[rgb(255_110_90/0.35)] backdrop-blur">
        <span className="min-w-0 flex-1 py-1.5">{erro}</span>
        <BotaoIcone rotulo="Fechar o aviso" icone="fechar" tamanho="p" onClick={() => setErro(null)} />
      </div>
    </div>
  );

  // A barra da seleção: no celular ela troca a fileira de ferramentas; no computador entra
  // na barra da linha do tempo. "Ajustes" (só celular) abre os ajustes da cena na folha.
  const acoesDaBarra = selecao ? acoesDaSelecao(ctxLinha, selecao, tempo, gerando) : [];
  const barraDaSelecao = (compacta: boolean) =>
    selecao ? (
      <BarraDaSelecao
        compacta={compacta}
        titulo={tituloDaSelecao(selecao)}
        preso={selecao.faixa === "textos" || selecao.faixa === "adesivos"}
        acoes={!compacta && selecao.faixa === "cenas" ? [{ id: "ajustes_cena", rotulo: "Ajustes", icone: "configuracoes", ativo: true }, ...acoesDaBarra] : acoesDaBarra}
        aoAcao={(id) => executarAcao(id)}
        aoFechar={() => setSelecao(null)}
        aoMotivo={(t) => avisar(t)}
        subBarra={subBarraDaSelecao()}
      />
    ) : null;
  const barraNoCelular = celular && selecao && !painelAberto && !inspetorNaFolha;

  // ---------- O EDITOR É UM APLICATIVO, NÃO UMA PÁGINA ----------
  // Tela inteira, sem o cabeçalho nem o menu do site: numa página sobravam 300px pro palco.
  // Computador: ferramentas na coluna da esquerda (altura inteira), painel da ferramenta,
  // palco no meio, ajustes da cena à direita (tela larga), linha do tempo embaixo.
  // Celular: palco em cima, linha do tempo, ferramentas no pé; o painel sobe como folha.
  return (
    <div
      ref={setRaizEditor}
      className="editor-escuro fixed inset-0 z-30 flex flex-col"
      data-editor="1"
      // Com a folha aberta no celular, o aviso sobe pra cima dela (senão cobria o que a pessoa
      // estava escolhendo).
      style={celular && (painelAberto || inspetorNaFolha) ? ({ "--aviso-base": "calc(68px + min(60svh, 560px) + 10px)" } as React.CSSProperties) : undefined}
    >
      <CabecalhoEditor
        titulo={editandoDe?.titulo || titulo || "Vídeo do imóvel"}
        meta={metaDoCabecalho}
        creditos={c.conta.creditos ?? null}
        custo={custo}
        semSaldo={semSaldo}
        gerando={gerando}
        progresso={progresso}
        podeGerar={podeGerar}
        motivo={motivoNaoGerar}
        editandoDe={editandoDe}
        celular={celular}
        aoGerar={() => gerar()}
        aoComecarDoZero={comecarDoZero}
      />

      <div className="flex min-h-0 flex-1">
        {!celular && <TrilhoFerramentas ferramentas={ABAS} ativa={painelAberto ? aba : null} celular={false} aoEscolher={escolherFerramenta} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {!celular && painelAberto && (
              <aside className="ed-surgir flex w-[336px] shrink-0 flex-col border-r border-[var(--ed-linha)] bg-[var(--ed-painel)] lg:w-[360px]" data-painel="1" aria-label={nomeDaAba}>
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
                  <h2 className="text-[16px] font-semibold text-[var(--ed-texto)]">{nomeDaAba}</h2>
                  <BotaoIcone rotulo="Fechar o painel" icone="fechar" tamanho="p" onClick={() => setPainelAberto(false)} />
                </div>
                <div className="ed-rolagem min-h-0 flex-1 overflow-y-auto px-5 pb-10">{painelDaAba()}</div>
              </aside>
            )}

            <section className={`palco relative flex min-h-0 min-w-0 flex-1 flex-col ${!celular && !largo ? "ed-rolagem overflow-y-auto" : ""}`}>
              <div className={`relative flex min-h-0 flex-col ${!celular && !largo ? "h-full shrink-0" : "flex-1"}`}>
                {/* Lembrete de que dá pra se gravar, no espaço vazio ao lado do vídeo em pé. */}
                {!celular && !apresentador && !vozArquivo && cenas.length > 0 && (formato === "9:16" || formato === "4:5") && (
                  <div className="pointer-events-none absolute inset-y-0 left-5 z-10 hidden items-center min-[1500px]:flex">
                    <div className="pointer-events-auto">
                      <LembreteGravar aoGravar={() => setAba("voce")} />
                    </div>
                  </div>
                )}
                <div className="relative min-h-0 flex-1 [container-type:size]">{quadroDoPalco}</div>
                {!celular && (
                  <div className="flex h-11 shrink-0 items-center justify-center gap-2 text-[12.5px] text-[var(--ed-texto-3)]">
                    <span className="truncate">{cenaAtual ? `Cena ${indiceAtual + 1} de ${cenas.length} · ${cenaAtual.rotulo}` : "Nenhuma cena ainda"}</span>
                    <button type="button" onClick={() => setAba("ajustes")} title="Trocar o formato do vídeo" className="shrink-0 rounded-full bg-[var(--ed-elevado)] px-3 py-1 font-medium text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado-2)] hover:text-[var(--ed-texto)]">
                      {nomeDoFormato} · {formato}
                    </button>
                  </div>
                )}
                {avisoGerando}
                {avisoErro}
              </div>
              {!celular && !largo && cenas.length > 0 && <div className="shrink-0 border-t border-[var(--ed-linha)] bg-[var(--ed-painel)] px-5 py-5">{inspetorDaCena()}</div>}
            </section>

            {!celular && largo && (
              <aside className="flex w-[320px] shrink-0 flex-col border-l border-[var(--ed-linha)] bg-[var(--ed-painel)]" data-inspetor-coluna="1" aria-label="Ajustes da cena">
                <div className="flex h-14 shrink-0 items-center px-5">
                  <h2 className="text-[16px] font-semibold text-[var(--ed-texto)]">Ajustes da cena</h2>
                </div>
                <div className="ed-rolagem min-h-0 flex-1 overflow-y-auto px-5 pb-10">{inspetorDaCena()}</div>
              </aside>
            )}
          </div>

          {/* ---------- linha do tempo com faixas ----------
               Fotos, Você, voz, música, textos, adesivos e legendas, cada um na sua faixa
               (components/editor/faixas). Toque seleciona, a barra mostra o que dá pra fazer. */}
          <LinhaDeFaixas
            faixas={faixas}
            total={faixas.total}
            relogio={previa.relogio}
            tempo={tempo}
            tocando={tocando}
            zoom={zoomLinha}
            selecao={selecao}
            faixaAberta={qualFaixaAbre({ selecao, aba, ultima: ultimaFaixa, faixas })}
            todasAbertas={todasAbertas}
            podeDesfazer={historico.podeDesfazer}
            podeRefazer={historico.podeRefazer}
            gerando={gerando}
            celular={celular}
            picos={picos}
            miniaturas={Object.fromEntries(cenas.map((x) => [x.chave, x.miniatura]))}
            clipes={new Set(cenas.filter((x) => x.ehClipe).map((x) => x.chave))}
            capa={capa ?? cenas[0]?.chave ?? null}
            semSom={new Set(itensPrevia.filter((i) => previa.semSom.has(i.fonte.chave)).map((i) => i.id))}
            animadas={new Set(cenas.filter((x) => x.tipo === "animada").map((x) => x.chave))}
            modoTrecho={!!selecao && subBarra?.tipo === "trecho" && subBarra.de === chaveDoRef(selecao)}
            barra={!celular ? barraDaSelecao(true) ?? undefined : undefined}
            simularGesto={(ref: RefItem, g: Gesto) => aplicarGesto(ctxLinha, ref, g, { pontos: pontosDeEncaixe(ctxLinha, ref, tempo), limiarSeg: 10 / zoomLinha }) as never}
            aoConfirmarGesto={(ref: RefItem, g: Gesto) => {
              const r = aplicarGesto(ctxLinha, ref, g, { pontos: pontosDeEncaixe(ctxLinha, ref, tempo), limiarSeg: 10 / zoomLinha });
              if (r.mudou) {
                historico.novoPasso();
                aplicarEstadoLinha(r.estado);
                resumoEdicao.registrarEdicao(ref.faixa, "arraste");
              }
              setSelecao(r.selecao);
            }}
            aoTocar={(t) => {
              if (t === tocando) return;
              alternarTocar();
            }}
            aoBuscar={(t) => {
              previa.buscar(t);
              setTempo(Math.round(t * 100) / 100);
            }}
            aoZoom={setZoomLinha}
            aoAjustar={() => setZoomLinha(zoomParaAjustar(faixas.total, raizEditor?.querySelector<HTMLElement>("[data-rolagem]")?.clientWidth ?? 375))}
            aoAlternarFaixas={() => setTodasAbertas((v) => !v)}
            aoAbrirFaixa={(f) => {
              setUltimaFaixa(f);
              setSelecao(null);
            }}
            aoSelecionar={setSelecao}
            aoAbrirLista={(grupo) => setListaAberta(grupo)}
            aoMenu={(ref, x, y) => {
              setSelecao(ref);
              menu.abrir(
                x,
                y,
                acoesDaSelecao(ctxLinha, ref, tempo, gerando).map((a) => ({ rotulo: a.rotulo, icone: a.icone, desligado: !a.ativo, dica: a.motivo, perigo: a.perigo, aoEscolher: () => executarAcao(a.id, ref) }))
              );
            }}
            aoDesfazer={() => historico.desfazer() && resumoEdicao.registrar({ tipo: "desfazer" } as never)}
            aoRefazer={() => historico.refazer() && resumoEdicao.registrar({ tipo: "refazer" } as never)}
            aoSoltarFoto={(chaveAlvo, ev) => soltarEm(chaveAlvo ?? "fim", ev)}
            aoAdicionarMidia={() => setAba(videos && videos.length > 0 && geracoes.length === 0 ? "videos" : "midia")}
          />

          {celular && (barraNoCelular ? <div className="shrink-0 border-t border-[var(--ed-linha)] bg-[var(--ed-base)]">{barraDaSelecao(false)}</div> : <TrilhoFerramentas ferramentas={ABAS} ativa={painelAberto && !inspetorNaFolha ? aba : null} celular aoEscolher={escolherFerramenta} />)}
        </div>
      </div>

      {celular && (
        <Folha
          aberta={painelAberto || inspetorNaFolha}
          titulo={inspetorNaFolha ? (cenaAtual ? `Cena ${indiceAtual + 1}` : "Cena") : nomeDaAba}
          aoFechar={() => {
            setPainelAberto(false);
            setInspetorNaFolha(false);
          }}
          base={68}
        >
          {inspetorNaFolha ? inspetorDaCena() : painelDaAba()}
        </Folha>
      )}

      {/* Uma foto com vários textos ou adesivos: escolhe qual. */}
      {listaAberta?.itens && (
        <ListaDaFoto
          titulo={listaAberta.rotulo}
          itens={listaAberta.itens.map((ref) => {
            const cena = "chave" in ref ? cenas.find((x) => x.chave === ref.chave) : undefined;
            const rotulo =
              ref.faixa === "textos" ? (ref.indice < 0 ? `Legenda: ${cena?.legenda ?? ""}` : cena?.textos?.[ref.indice]?.texto || "Texto") : ref.faixa === "adesivos" ? (cena?.elementos?.[ref.indice]?.id.replace(/^adesivo:|^pexels:/, "") ?? "Adesivo") : "Item";
            return { ref, rotulo, icone: ref.faixa === "textos" ? "editar_prompt" : "elementos" };
          })}
          selecao={selecao}
          aoEscolher={(ref) => {
            setSelecao(ref);
            setListaAberta(null);
          }}
          aoFechar={() => setListaAberta(null)}
        />
      )}

      {/* Os avisos com Desfazer (acima da linha do tempo). */}
      {avisos}

      {/* O menu do botão direito (no celular, uma folha de ações). Um só, no fim, porque é
          `position: fixed` -- dentro do palco ele seria cortado pelo `overflow-hidden`. */}
      <MenuContexto aberto={menu.aberto} aoFechar={menu.fechar} celular={celular} />

      {resultado && (
        <ModalVideoPronto
          video={resultado}
          token={token}
          gerando={gerando}
          podeOutroFormato={cenas.length > 0 && !!resultado.doEditor}
          aoFechar={() => setResultado(null)}
          aoEditar={(id) => editarVideo(id)}
          aoOutroFormato={(f) => {
            setResultado(null);
            gerar({ formato: f });
          }}
          aoUsarNaLinha={() => {
            const v = (videos ?? []).find((x) => x.id === resultado.videoId) ?? { id: resultado.videoId, titulo: resultado.titulo ?? "Vídeo", formato: resultado.formato, status: "concluido", criadoEm: new Date().toISOString(), duracao: resultado.duracao, miniatura: resultado.miniatura, compartilhado: false, erro: null };
            setResultado(null);
            adicionarVideoPronto(v);
          }}
        />
      )}
    </div>
  );
}
