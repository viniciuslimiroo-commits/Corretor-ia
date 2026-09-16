"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import {
  ANIMACOES,
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
  DURACOES_CENA,
  LIMITES,
  MOVIMENTOS_360,
  MUSICAS,
  EFEITOS_SONOROS,
  POSICOES_TEXTO,
  SELOS_IMOVEL,
  TRANSICOES,
  VOZES,
  custoDoVideo,
  duracaoEstimada,
  ehTransicao,
  textosDaCena,
  vozDeIA,
  type AnimacaoId,
  type AnimacaoTexto,
  type Apresentador,
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
import SeletorImovel from "@/components/seletor-imovel";
import LinhaDoTempo, { type BlocoCena } from "@/components/editor/linha-do-tempo";
import BibliotecaAudio from "@/components/editor/biblioteca-audio";
import GaleriaTexto from "@/components/editor/galeria-texto";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, BotaoConfirma, Cartao, Chip, Icone, Rotulo } from "@/components/ui";

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
  /** Acabamento de cor desta cena. Ausente = o do vídeo. */
  filtro?: FiltroId;
  /** Correção de luz, de -0.25 a 0.25. */
  luz?: number;
  /** Clipe: de que segundo do arquivo esta cena começa. */
  inicio?: number;
  /** A emenda desta cena pra próxima. Ausente = a do vídeo. */
  transicao?: TransicaoId;
  /** Cena animada cujo clipe já existe no servidor: gerar de novo com o mesmo movimento
   *  e a mesma duração não custa crédito. Vem do servidor ao editar um vídeo pronto. */
  animacaoGuardada?: { animacao: AnimacaoId; duracao: number } | null;
};

/** O que o servidor devolve por cena, ao lado do espec, pra reabrir um vídeo pronto. */
type EdicaoCena = { miniatura: string | null; rotulo: string; temAntes: boolean; ehClipe: boolean; animacaoGuardada: { animacao: AnimacaoId; duracao: number } | null };

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

type VideoResumo = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null; compartilhado: boolean; erro: string | null };

type Resultado = { videoId: string; url: string; miniatura: string | null; duracao: number | null; avisos: string[]; formato: string };

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
    duracao: c.duracao ?? LIMITES.duracaoPadrao,
    melhorar: c.melhorar ?? false,
    filtro: c.filtro,
    luz: c.luz,
    inicio: c.inicio,
    // O espec vem cru do banco: vídeo antigo guarda "suave", que não está mais no
    // catálogo. Normalizar aqui é o que impede o chip de aparecer em branco.
    transicao: c.transicao ? ehTransicao(c.transicao) : undefined,
    animacaoGuardada: info[i]?.animacaoGuardada ?? null,
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
  { id: "midia", rotulo: "Mídia", icone: "materiais", dica: "As fotos e os clipes deste imóvel" },
  { id: "modelos", rotulo: "Modelos", icone: "lote", dica: "Um ponto de partida por tipo de imóvel" },
  { id: "audio", rotulo: "Áudio", icone: "som", dica: "Músicas e efeitos sonoros, com prévia" },
  { id: "texto", rotulo: "Texto", icone: "editar_prompt", dica: "Modelos de texto e efeitos de entrada" },
  { id: "legendas", rotulo: "Legendas", icone: "compartilhar", dica: "Narração e legenda automática" },
  { id: "transicoes", rotulo: "Transições", icone: "converter_hd", dica: "Como uma cena vira a outra" },
  { id: "voce", rotulo: "Você", icone: "equipe", dica: "Você aparecendo no próprio vídeo" },
  { id: "cor", rotulo: "Cor", icone: "magica", dica: "Acabamento de cor e luz" },
  { id: "formato", rotulo: "Formato", icone: "planta", dica: "Reels, feed, quadrado ou horizontal" },
  { id: "marca", rotulo: "Marca", icone: "marca", dica: "Logo, cor e contato que entram no vídeo" },
  { id: "videos", rotulo: "Vídeos", icone: "historico", dica: "Os vídeos que você já fez" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** A proporção de cada formato, pro palco mostrar o quadro certo. */
const PROPORCAO: Record<FormatoId, string> = { "9:16": "9 / 16", "16:9": "16 / 9", "1:1": "1 / 1", "4:5": "4 / 5" };

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PaginaVideo() {
  const c = useConta();
  const { user, token } = c;
  // O idioma vale pras palavras que entram DENTRO do vídeo -- "3 quartos", "Preço",
  // "/mês". Elas não são interface: saem desenhadas no arquivo que vai pro cliente.
  const { idioma } = useIdioma();

  const [imovelId, setImovelId] = useState<string | null>(null);
  const [geracoes, setGeracoes] = useState<Geracao[]>([]);
  const [cenas, setCenas] = useState<CenaUI[]>([]);
  /** A cena aberta no painel. É o que faz isto ser um editor e não um formulário. */
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const arrastando = useRef<string | null>(null);
  const [formato, setFormato] = useState<FormatoId>("9:16");
  const [musica, setMusica] = useState<MusicaId>("calma");
  const [transicao, setTransicao] = useState<TransicaoId>("dissolver");
  /** Acabamento de cor do vídeo inteiro. Cada cena pode sair da linha no painel dela. */
  const [filtro, setFiltro] = useState<FiltroId>("natural");
  /** Capa com o nome e o preço escritos por cima do quadro. */
  const [capaMontada, setCapaMontada] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [local, setLocal] = useState("");
  const [telaFinal, setTelaFinal] = useState(true);
  const [chamada, setChamada] = useState(CHAMADAS[0]);
  /** Chave da cena que vira a miniatura. null = a primeira. */
  const [capa, setCapa] = useState<string | null>(null);
  /** Vídeo pronto que foi reaberto pra edição. Gerar cria outro; este continua na lista. */
  const [editandoDe, setEditandoDe] = useState<{ id: string; titulo: string } | null>(null);
  /** "3 quartos · 2 vagas · 120 m²", da ficha do imóvel escolhido. */
  const [fichaResumo, setFichaResumo] = useState("");
  /** A ficha crua e a marca: viram as PEÇAS que o editor oferece pra virar texto. */
  const [ficha, setFicha] = useState<Record<string, unknown> | null>(null);
  const [marca, setMarca] = useState<{ nome?: string | null; creci?: string | null; whatsapp?: string | null; cor?: string | null; logo?: string | null; instagram?: string | null } | null>(null);
  const [narrar, setNarrar] = useState(false);
  /** De onde vem a voz: IA, gravada aqui, ou um arquivo que a pessoa já tinha. */
  const [origemVoz, setOrigemVoz] = useState<OrigemVoz>("ia");
  const [roteiro, setRoteiro] = useState("");
  const [voz, setVoz] = useState<VozId>("laura");
  /** Voz própria pronta: caminho no bucket + URL local pra ouvir antes de gerar. */
  const [vozArquivo, setVozArquivo] = useState<{ caminho: string; url: string; nome: string } | null>(null);
  const [vozVolume, setVozVolume] = useState(1);
  const [vozInicio, setVozInicio] = useState(0.7);
  const [musicaVolume, setMusicaVolume] = useState(LIMITES.musicaVolumePadrao);
  /** Legendas queimadas no vídeo, com o tempo de cada trecho. */
  const [legendas, setLegendas] = useState<Legendas | null>(null);
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
  const [aba, setAba] = useState<AbaId>("midia");
  /** Onde o cabeçote está, em segundos. É o que o palco mostra. */
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  /** O tempo atual pro efeito de tocar ler sem virar dependência dele. */
  const tempoRef = useRef(0);
  /** Zoom da linha do tempo, em pixels por segundo. */
  const [zoomLinha, setZoomLinha] = useState(30);
  /** Som curto em cada virada de cena. */
  const [efeitoSonoro, setEfeitoSonoro] = useState<EfeitoSonoroId>("nenhum");

  /** Move o cabeçote. Guarda no ref junto, que é de onde o laço de tocar lê o início. */
  const moverTempo = useCallback((segundos: number) => {
    tempoRef.current = segundos;
    setTempo(segundos);
  }, []);

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

  const espec: EspecVideo = useMemo(
    () => ({
      formato,
      cenas: cenas.map((s) => ({ tipo: s.tipo, jobId: s.jobId, arquivo: s.arquivo, efeito: s.efeito, animacao: s.animacao, movimento: s.movimento, legenda: s.legenda || undefined, textos: s.textos, duracao: s.duracao, melhorar: s.melhorar, inicio: s.inicio, transicao: s.transicao, filtro: s.filtro, luz: s.luz })),
      musica,
      musicaVolume,
      // A voz só entra quando está PRONTA: roteiro escrito, ou arquivo já no servidor.
      // Meio caminho (gravou e não usou) não vira vídeo mudo por engano.
      narracao: !narrar
        ? null
        : origemVoz === "ia"
          ? roteiro.trim().length >= 10
            ? ({ origem: "ia", roteiro: roteiro.trim(), voz, volume: vozVolume, inicio: vozInicio } as Narracao)
            : null
          : vozArquivo
            ? ({ origem: origemVoz, arquivo: vozArquivo.caminho, volume: vozVolume, inicio: vozInicio } as Narracao)
            : null,
      titulo,
      preco,
      local,
      telaFinal,
      chamada: telaFinal ? chamada : "",
      transicao,
      capa: Math.max(0, cenas.findIndex((s) => s.chave === capa)),
      legendas,
      apresentador,
      filtro,
      capaMontada,
      efeitoSonoro,
    }),
    [formato, cenas, musica, musicaVolume, narrar, origemVoz, roteiro, voz, vozArquivo, vozVolume, vozInicio, titulo, preco, local, telaFinal, chamada, transicao, capa, legendas, apresentador, filtro, capaMontada, efeitoSonoro]
  );
  // Resumo dos ajustes em uma linha: quem não abriu ainda vê o que está valendo.
  // As peças que o editor oferece: o que está preenchido na ficha e na marca, e nada mais.
  const pecas = pecasDoImovel(ficha, marca, idioma);

  /**
   * O modelo aberto pra conferência. Clicar num modelo NÃO aplica: mostra o que vai
   * mudar e espera o segundo clique. Aplicar troca os textos das cenas, e aqui não
   * existe desfazer -- então a lista do que muda vem antes, não depois.
   */
  const [templateAberto, setTemplateAberto] = useState<TemplateVideo | null>(null);

  function aplicarTemplate(t: TemplateVideo) {
    const novo = aplicarTemplateVideo(t, espec, pecas, { temWhatsapp: !!marca?.whatsapp });
    setFormato(novo.formato);
    setMusica(novo.musica);
    setTransicao(novo.transicao);
    setTelaFinal(novo.telaFinal);
    setChamada(novo.chamada || CHAMADAS[0]);
    setFiltro(novo.filtro ?? "natural");
    setCenas((atuais) =>
      atuais.map((s, i) => {
        const c = novo.cenas[i];
        if (!c) return s;
        return { ...s, efeito: c.efeito ?? s.efeito, duracao: c.duracao ?? s.duracao, textos: c.textos, legenda: "", transicao: undefined, filtro: undefined, luz: undefined };
      })
    );
    setTemplateAberto(null);
  }

  const resumoDosAjustes = [
    FORMATOS.find((f) => f.id === formato)?.rotulo ?? formato,
    MUSICAS.find((m) => m.id === musica)?.rotulo ?? musica,
    TRANSICOES.find((t) => t.id === transicao)?.rotulo ?? transicao,
    titulo ? `“${titulo}”` : null,
    espec.narracao ? (vozDeIA(espec.narracao) ? `narrado (${VOZES.find((v) => v.id === voz)?.rotulo ?? voz})` : "com a sua voz") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Cena animada reaberta de um vídeo pronto, com o mesmo movimento e duração: o clipe já
  // existe e o servidor não cobra (ele confere por conta própria; isto só mostra a conta).
  const animadasGratis = cenas.filter((s) => s.tipo === "animada" && s.animacaoGuardada && s.animacaoGuardada.animacao === s.animacao && s.animacaoGuardada.duracao === s.duracao).length;
  const custo = Math.max(0, custoDoVideo(espec) - animadasGratis * CREDITOS.animada);
  const esperaTotal = esperaEmSegundos(espec.cenas.map((c) => ({ tipo: c.tipo, duracao: c.duracao ?? 4 })));
  const duracao = duracaoEstimada(espec);

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
      .then((d) => setMarca({ nome: d.nome, creci: d.creci, whatsapp: d.whatsapp, cor: d.cor_marca ?? d.cor, logo: d.logoUrl ?? d.logo_url ?? null, instagram: d.instagram }))
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
    setCenas((lista) => {
      const nova: CenaUI = {
        chave: chave(),
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
    for (const f of Array.from(arquivos)) {
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
        const formato = ehVideo ? "comum" : await formatoDaFoto(f);
        const eh360 = formato === "esferica";
        const ehPanoramica = formato === "panoramica";
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
      setVozArquivo({ caminho: d.caminho, url: URL.createObjectURL(arquivo), nome });
      setNarrar(true);
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
      setLegendas(d.legendas ?? null);
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
      setApresentador({ arquivo: d.caminho, formato: "canto", canto: "inferior_direito", tamanho: "medio", entra: 0, inicio: 0, volume: 1, fundo: "manter" });
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

  /**
   * Divide a cena em duas, no meio.
   *
   * Pra foto é só repartir o tempo. Pra clipe é o que importa: a segunda metade começa
   * no arquivo exatamente onde a primeira parou, senão as duas mostrariam o mesmo
   * trecho -- que é o erro que faz "dividir" parecer "duplicar".
   */
  function dividir(k: string) {
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === k);
      if (i < 0 || lista.length >= LIMITES.cenasMax) return lista;
      const s = lista[i];
      if (s.duracao < LIMITES.duracaoMin * 2) return lista;
      const metade = Math.max(LIMITES.duracaoMin, Math.round(s.duracao / 2));
      const resto = Math.max(LIMITES.duracaoMin, s.duracao - metade);
      const primeira = { ...s, duracao: metade };
      const segunda = { ...s, chave: chave(), duracao: resto, inicio: s.ehClipe ? (s.inicio ?? 0) + metade : s.inicio };
      return [...lista.slice(0, i), primeira, segunda, ...lista.slice(i + 1)];
    });
  }

  // ---- textos da cena ----
  function adicionarTexto(k: string, novo: TextoCena) {
    setCenas((lista) =>
      lista.map((s) => {
        if (s.chave !== k) return s;
        const atuais = s.textos ?? [];
        if (atuais.length >= LIMITES.textosPorCena) return s;
        return { ...s, textos: [...atuais, novo] };
      })
    );
  }
  function mudarTexto(k: string, i: number, mudanca: Partial<TextoCena>) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, textos: (s.textos ?? []).map((t, j) => (j === i ? { ...t, ...mudanca } : t)) } : s)));
  }
  function removerTexto(k: string, i: number) {
    setCenas((lista) => lista.map((s) => (s.chave === k ? { ...s, textos: (s.textos ?? []).filter((_, j) => j !== i) } : s)));
  }

  /**
   * Soltar na linha do tempo. Duas origens, um alvo:
   *
   * - uma CENA que já está na linha: troca de lugar;
   * - uma FOTO da biblioteca: entra ali, empurrando o resto pra frente.
   *
   * A foto vem pelo `dataTransfer` do próprio navegador, e não por um ref, porque é o
   * único jeito de o arraste sobreviver a sair de uma coluna e entrar na outra.
   */
  function soltarEm(alvo: string, ev?: React.DragEvent) {
    const jobId = ev?.dataTransfer?.getData("text/encena-foto");
    if (jobId) {
      ev?.preventDefault();
      const g = geracoes.find((x) => x.id === jobId);
      if (g) adicionarGeracao(g, alvo);
      arrastando.current = null;
      return;
    }
    const de = arrastando.current;
    arrastando.current = null;
    if (!de || de === alvo) return;
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === de);
      const j = lista.findIndex((s) => s.chave === alvo);
      if (i < 0 || j < 0) return lista;
      const nova = [...lista];
      const [movida] = nova.splice(i, 1);
      nova.splice(j, 0, movida);
      return nova;
    });
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
        body: JSON.stringify({ imovelId, espec: sobrepor ? { ...espec, ...sobrepor } : espec }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui iniciar o vídeo.");
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
          setResultado({ videoId: id, url: dd.url, miniatura: dd.miniatura ?? null, duracao: dd.duracao ?? null, avisos: dd.avisos ?? [], formato: dd.formato ?? formato });
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
      setResultado({ videoId: v.id, url: dd.url, miniatura: dd.miniatura, duracao: dd.duracao, avisos: dd.avisos ?? [], formato: dd.formato });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
      setImovelId(dd.edicao?.imovelId ?? null);
      setCenas(novas);
      setFormato(e.formato);
      setMusica(e.musica);
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
      setVozVolume(e.narracao?.volume ?? 1);
      setVozInicio(e.narracao?.inicio ?? 0.7);
      // A voz volta tocável -- e, com ela, o arquivo que as legendas transcrevem. Vale
      // também pra voz de IA: a narração fica guardada depois que o vídeo é montado.
      setVozArquivo(dd.edicao?.vozArquivo && dd.edicao?.vozUrl ? { caminho: dd.edicao.vozArquivo, url: dd.edicao.vozUrl, nome: e.narracao?.arquivo ? "Áudio deste vídeo" : "Narração de IA deste vídeo" } : null);
      setLegendas(e.legendas ?? null);
      setApresentador(e.apresentador ?? null);
      setFiltro(e.filtro ?? "natural");
      setCapaMontada(e.capaMontada !== false);
      setEfeitoSonoro(e.efeitoSonoro ?? "nenhum");
      setApreUrl(dd.edicao?.apresentadorUrl ?? null);
      setCapa(novas[e.capa ?? 0]?.chave ?? null);
      setEditandoDe({ id, titulo: dd.titulo || e.titulo || "Vídeo" });
      setResultado(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    setVozVolume(1);
    setVozInicio(0.7);
    setMusicaVolume(LIMITES.musicaVolumePadrao);
    setLegendas(null);
    setApresentador(null);
    setFiltro("natural");
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


  /**
   * Os blocos da linha do tempo, e onde cada um começa.
   *
   * A largura do bloco é a DURAÇÃO -- é isso que transforma uma fila de cartões numa
   * linha do tempo de verdade, e é o que responde "quanto tempo tem meu vídeo" sem
   * ninguém somar nada de cabeça.
   */
  const blocosDaLinha: BlocoCena[] = useMemo(
    () =>
      cenas.map((s) => ({
        chave: s.chave,
        rotulo: s.rotulo,
        miniatura: s.miniatura,
        duracao: s.duracao,
        tipo: s.tipo,
        emenda: TRANSICOES.find((t) => t.id === (s.transicao ?? transicao))?.rotulo ?? "",
      })),
    [cenas, transicao]
  );

  /** Em que segundo cada cena começa. Serve pro cabeçote saber quem está no ar. */
  const iniciosDasCenas = useMemo(() => {
    // Acumulador local do laço, não um `let` capturado por closure de `map`: o
    // compilador do React recusa o segundo, e com razão.
    const lista: number[] = [];
    for (let i = 0, acc = 0; i < cenas.length; i++) {
      lista.push(acc);
      acc += cenas[i].duracao;
    }
    return lista;
  }, [cenas]);

  const duracaoDaLinha = cenas.reduce((t, s) => t + s.duracao, 0) + (telaFinal ? LIMITES.telaFinalSegundos : 0);

  /**
   * A PRÉVIA que toca.
   *
   * Não é o vídeo montado -- é o cabeçote andando e o palco trocando de cena na hora
   * certa. Serve pra ver o RITMO antes de gerar: se uma cena está longa demais, isso
   * aparece assistindo, nunca olhando um número de duração.
   */
  useEffect(() => {
    if (!tocando) return;
    // Intervalo com DELTA REAL, não requestAnimationFrame: o rAF para quando a aba não
    // está à frente, e aí a prévia congela sem ninguém entender por quê. O delta vem do
    // relógio, então o cabeçote anda no tempo certo mesmo se um quadro atrasar.
    const inicio = performance.now();
    const daquiAPouco = tempoRef.current;
    const id = setInterval(() => {
      const decorrido = (performance.now() - inicio) / 1000;
      const novo = daquiAPouco + decorrido;
      if (novo >= duracaoDaLinha) {
        setTempo(duracaoDaLinha);
        setTocando(false);
      } else {
        setTempo(novo);
      }
    }, 50);
    return () => clearInterval(id);
  }, [tocando, duracaoDaLinha, moverTempo]);

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

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para criar vídeos.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  // A cena aberta no painel. Sem escolha, é a primeira: editor sem nada selecionado é
  // uma tela que não responde ao que a pessoa clica.
  const indiceAtual = tocando ? indiceDoCabecote : Math.max(0, cenas.findIndex((s) => s.chave === selecionada));
  const cenaAtual: CenaUI | null = cenas[indiceAtual] ?? null;
  const semSaldo = (c.conta.creditos ?? 0) < custo;
  const vertical = resultado ? resultado.formato === "9:16" || resultado.formato === "4:5" : false;

  return (
    // ---------- O EDITOR É UM APLICATIVO, NÃO UMA PÁGINA ----------
    //
    // Tela inteira, sem o cabeçalho nem o menu do site. Não é enfeite: numa página do
    // site sobravam 300px de altura pro palco depois do menu, do título e das margens,
    // e a linha do tempo caía abaixo da dobra. A pessoa abria o editor e via um
    // retângulo preto sem nenhuma ferramenta à vista.
    //
    // A saída é pela seta no canto, que volta pro Editor. Enquanto se edita, a tela é
    // do trabalho -- é o que todo editor faz, e é o que faz a tela parecer um.
    <div className="editor-escuro fixed inset-0 z-30 flex flex-col">
      {/* ---------- barra do editor ---------- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-3 py-2">
        <Link href="/editor" title="Sair do editor" className="shrink-0 rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
          <Icone nome="cima" className="h-4 w-4 -rotate-90" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{editandoDe?.titulo || titulo || "Vídeo do imóvel"}</h1>
          <p className="truncate text-[11px] text-neutral-500">
            {cenas.length} {cenas.length === 1 ? "cena" : "cenas"} · ≈ {Math.round(duracao)} s · {resumoDosAjustes}
            {custo === 0 ? " · sem crédito" : ` · ${custo} ${custo === 1 ? "crédito" : "créditos"}`}
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">{c.conta.creditos ?? "…"} cr.</span>
        <Botao onClick={() => gerar()} disabled={gerando || cenas.length === 0 || semSaldo || enviando > 0} className="shrink-0 px-3 py-2">
          <Icone nome="play" className="h-4 w-4" />
          {gerando ? progresso?.mensagem ?? "Gerando…" : "Gerar vídeo"}
        </Botao>
      </header>

      {/* ---------- miolo: trilha · painel · palco ---------- */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ---------- trilha de ferramentas ---------- */}
        <nav className="order-2 flex shrink-0 gap-1 overflow-x-auto border-neutral-200 px-2 py-1 md:order-1 md:w-[76px] md:flex-col md:overflow-y-auto md:border-r md:px-1 md:py-2">
          {ABAS.map((a) => {
            const ativa = aba === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                title={a.dica}
                aria-pressed={ativa}
                className={
                  "flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] transition lg:w-full " +
                  (ativa ? "bg-marca-indigo/10 text-marca-indigo" : "text-neutral-500 hover:bg-neutral-100")
                }
              >
                <Icone nome={a.icone} className="h-5 w-5" />
                {a.rotulo}
              </button>
            );
          })}
        </nav>

        {/* ---------- painel da aba ---------- */}
        <div className="order-3 flex flex-col gap-3 overflow-y-auto border-neutral-200 p-3 md:order-2 md:w-[300px] md:shrink-0 md:border-r lg:w-[340px]">
          {aba === "midia" && (
          <Cartao>
            <Rotulo>Mídia</Rotulo>
            <div className="flex flex-wrap items-center gap-3">
              <SeletorImovel token={token} valor={imovelId} onChange={setImovelId} disabled={gerando} />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400">
                <Icone nome="mais" className="h-4 w-4" />
                {enviando > 0 ? `Enviando ${enviando}…` : "Enviar fotos ou clipes"}
                <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple className="hidden" onChange={(e) => enviarArquivos(e.target.files)} disabled={gerando} />
              </label>
            </div>
            {imovelId && geracoes.length === 0 && <p className="mt-3 text-sm text-neutral-500">Este imóvel ainda não tem fotos prontas. Envie fotos ou edite algumas primeiro.</p>}
            {geracoes.length > 0 && (
              <>
                <p className="mt-3 text-xs text-neutral-500">Toque numa foto pra adicionar como cena. Fotos com original guardada podem virar &quot;antes e depois&quot;.</p>
                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {geracoes.map((g) => {
                    const usada = cenas.some((s) => s.jobId === g.id);
                    return (
                      <li key={g.id}>
                        {/* Arrastável: solta num ponto da linha do tempo e a foto entra
                            ALI. Clicar continua mandando pro fim -- é o gesto de quem
                            está montando na ordem, e não se perde por causa do arraste. */}
                        <button
                          type="button"
                          draggable={!gerando}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/encena-foto", g.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => adicionarGeracao(g)}
                          disabled={gerando}
                          className={"relative block w-full overflow-hidden rounded-lg border-2 " + (usada ? "border-marca-coral" : "border-transparent hover:border-neutral-400")}
                          title={`${g.acao} · clique pra pôr no fim, arraste pra escolher o lugar`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.depois ?? ""} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                          {usada && <span className="absolute top-1 right-1 rounded-full bg-marca-coral px-1.5 text-[10px] font-semibold text-white">{cenas.filter((s) => s.jobId === g.id).length}×</span>}
                          {g.antes && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">antes/depois</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Cartao>
          )}

          {aba === "modelos" && (
          <Cartao>
            <Rotulo>Modelos</Rotulo>
            <p className="-mt-1 mb-3 text-xs text-neutral-500">
              Um ponto de partida por tipo de imóvel: ritmo, música, transição e os dados do imóvel já nas cenas. Depois é só ajustar.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES_VIDEO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={gerando || cenas.length === 0}
                  onClick={() => setTemplateAberto((a) => (a?.id === t.id ? null : t))}
                  className={
                    "rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 " +
                    (templateAberto?.id === t.id ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 hover:border-neutral-400")
                  }
                >
                  <span className="font-medium">{t.nome}</span>
                  <span className="block text-xs text-neutral-500">{t.para}</span>
                </button>
              ))}
            </div>
            {cenas.length === 0 && <p className="mt-2 text-xs text-neutral-500">Escolha as fotos primeiro — o modelo se aplica às cenas.</p>}
            {templateAberto && (
              <div className="mt-3 rounded-xl border border-marca-indigo/30 bg-marca-indigo/5 p-3">
                <p className="text-xs text-neutral-600">{templateAberto.descricao}</p>
                <ul className="mt-2 space-y-1">
                  {mudancasDoTemplate(templateAberto, pecas).map((m) => (
                    <li key={m} className="flex gap-1.5 text-xs text-neutral-700">
                      <span className="text-marca-coral">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
                {templateVaiApagarTexto(espec) && (
                  <p className="mt-2 text-xs text-marca-coral">Os textos que você escreveu nas cenas vão ser trocados pelos do modelo.</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Botao onClick={() => aplicarTemplate(templateAberto)} className="px-3 py-1.5">
                    Aplicar modelo
                  </Botao>
                  <Botao variante="discreta" onClick={() => setTemplateAberto(null)} className="px-3 py-1.5">
                    Agora não
                  </Botao>
                </div>
              </div>
            )}
          </Cartao>
          )}

          {aba === "audio" && (
          <Cartao>
            <Rotulo>Música e transição</Rotulo>
            <BibliotecaAudio
              escolhida={musica}
              aoEscolher={setMusica}
              efeito={efeitoSonoro}
              aoEscolherEfeito={(id) => setEfeitoSonoro(id as EfeitoSonoroId)}
              efeitos={EFEITOS_SONOROS.filter((e) => e.arquivo)}
              desabilitado={gerando}
            />
            {musica !== "nenhuma" && (
              <label className="mt-3 block text-xs text-neutral-600">
                Volume da música · {Math.round(musicaVolume * 100)}%
                <input type="range" min={0} max={1} step={0.05} value={musicaVolume} onChange={(e) => setMusicaVolume(Number(e.target.value))} className="mt-1 w-full accent-marca-coral" />
                {espec.narracao && (
                  <span className="mt-1 block text-[11px] text-neutral-500">
                    Com voz no vídeo, a música abaixa sozinha enquanto você fala e volta no silêncio.
                  </span>
                )}
              </label>
            )}
          </Cartao>
          )}

          {/* ---------- transições ----------
               Cada cartão DESENHA o que a emenda faz: dois quadros e o jeito como um vira
               o outro. "Dissolver" e "Deslizar" são palavras que só querem dizer alguma
               coisa depois de ver -- e o vídeo inteiro muda de ritmo com essa escolha. */}
          {aba === "transicoes" && (
          <Cartao>
            <Rotulo>Transições</Rotulo>
            <p className="-mt-1 mb-3 text-xs text-neutral-500">
              Como uma cena vira a outra. Vale pro vídeo inteiro; uma cena pode sair da linha no painel dela.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TRANSICOES.map((t) => {
                const ativa = transicao === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={gerando}
                    onClick={() => { setTransicao(t.id); setCenas((lista) => lista.map((s) => ({ ...s, transicao: undefined }))); }}
                    title={`${t.rotulo} · ${t.segundos}s de emenda`}
                    className={
                      "overflow-hidden rounded-lg border-2 p-2 text-left transition disabled:opacity-40 " +
                      (ativa ? "border-marca-coral" : "border-neutral-200 hover:border-neutral-400")
                    }
                  >
                    <span className="flex h-9 items-center gap-0.5 overflow-hidden rounded bg-neutral-800">
                      <span className="h-full flex-1 bg-marca-indigo/70" />
                      <span
                        className="h-full shrink-0 bg-gradient-to-r from-marca-indigo/70 to-marca-coral/80"
                        style={{ width: t.id === "corte" ? 2 : t.id === "desfoque" ? 26 : 18, filter: t.id === "desfoque" ? "blur(3px)" : undefined }}
                      />
                      <span className="h-full flex-1 bg-marca-coral/80" />
                    </span>
                    <span className={"mt-1 block text-xs " + (ativa ? "text-marca-indigo" : "text-neutral-600")}>{t.rotulo}</span>
                    <span className="block text-[10px] text-neutral-500">{t.segundos}s</span>
                  </button>
                );
              })}
            </div>
          </Cartao>
          )}

          {aba === "legendas" && (
          <Cartao>
            <Rotulo>Voz e legendas</Rotulo>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={narrar} onChange={(e) => setNarrar(e.target.checked)} className="accent-marca-coral" />
              Falar por cima do vídeo
            </label>

            {narrar && (
              <div className="mt-3">
                {/* Três origens, e só uma delas cobra. A voz da pessoa não passa por
                    modelo nenhum -- é ffmpeg misturando o arquivo dela. */}
                <div className="flex flex-wrap gap-2">
                  <Chip ativo={origemVoz === "ia"} onClick={() => setOrigemVoz("ia")} title="A IA lê o texto que você escrever">
                    Voz de IA (+{CREDITOS.narracao})
                  </Chip>
                  <Chip ativo={origemVoz === "gravada"} onClick={() => setOrigemVoz("gravada")} title="Grave aqui mesmo, pelo microfone. Não gasta crédito.">
                    🎙 Gravar minha voz
                  </Chip>
                  <Chip ativo={origemVoz === "enviada"} onClick={() => setOrigemVoz("enviada")} title="MP3, M4A ou WAV que você já tem. Não gasta crédito.">
                    Enviar áudio
                  </Chip>
                </div>

                {origemVoz === "ia" ? (
                  <div className="mt-3">
                    <textarea value={roteiro} onChange={(e) => setRoteiro(e.target.value)} rows={4} maxLength={LIMITES.roteiroMax} placeholder="Escreva o texto da narração ou peça pra IA escrever a partir do título, preço, local e legendas." className={campo + " resize-none"} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Botao variante="secundaria" onClick={escreverRoteiro} disabled={escrevendo || gerando} className="px-3 py-1.5 text-xs">
                        <Icone nome="magica" className="h-4 w-4" />
                        {escrevendo ? "Escrevendo…" : "Escrever com IA"}
                      </Botao>
                      <span className="text-xs text-neutral-500">{roteiro.length}/{LIMITES.roteiroMax}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {VOZES.map((v) => (
                        <Chip key={v.id} ativo={voz === v.id} onClick={() => setVoz(v.id)}>{v.rotulo} · {v.genero}</Chip>
                      ))}
                    </div>
                    {roteiro.trim().length < 10 && <p className="mt-2 text-xs text-amber-700">Escreva pelo menos uma frase pra narração entrar.</p>}
                  </div>
                ) : (
                  <div className="mt-3">
                    {origemVoz === "gravada" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {gravando ? (
                          <>
                            <Botao variante="secundaria" onClick={pararGravacao} className="px-3 py-1.5 text-xs">
                              ⏹ Parar
                            </Botao>
                            <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-red-600">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                              {relogio(segundosGravando)}
                            </span>
                          </>
                        ) : (
                          <Botao variante="secundaria" onClick={gravarVoz} disabled={enviandoVoz || gerando} className="px-3 py-1.5 text-xs">
                            🎙 {enviandoVoz ? "Guardando…" : vozArquivo ? "Gravar de novo" : "Gravar"}
                          </Botao>
                        )}
                        {!gravando && !vozArquivo && <span className="text-xs text-neutral-500">O navegador vai pedir o microfone.</span>}
                      </div>
                    ) : (
                      <label className={"inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400 " + (enviandoVoz ? "pointer-events-none opacity-50" : "")}>
                        <Icone nome="mais" className="h-4 w-4" />
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

                    {vozArquivo && (
                      <div className="mt-2 rounded-lg bg-neutral-50 p-2">
                        <p className="truncate text-xs text-neutral-600">{vozArquivo.nome}</p>
                        <audio src={vozArquivo.url} controls className="mt-1 h-8 w-full" />
                      </div>
                    )}
                    {!vozArquivo && <p className="mt-2 text-xs text-amber-700">Sem áudio, o vídeo sai sem voz.</p>}
                  </div>
                )}

                {/* ---------- legendas ----------
                     Reel de imóvel circula com o som desligado. As legendas saem do
                     áudio da VOZ (nunca da música) e ficam editáveis: transcrição erra
                     nome de bairro e de rua, que é o que o vídeo está anunciando. */}
                <div className="mt-3 rounded-lg bg-neutral-50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-neutral-600">Legendas</span>
                    {legendas ? (
                      <button onClick={() => setLegendas(null)} className="text-xs text-neutral-500 underline">Tirar</button>
                    ) : (
                      <Botao variante="secundaria" onClick={gerarLegendas} disabled={!vozArquivo || transcrevendo} className="px-2.5 py-1 text-xs">
                        <Icone nome="magica" className="h-3.5 w-3.5" />
                        {transcrevendo ? "Ouvindo…" : "Gerar legendas"}
                      </Botao>
                    )}
                  </div>

                  {!vozArquivo && !legendas && (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {origemVoz === "ia"
                        ? "Com voz de IA, gere o vídeo uma vez — depois, ao editar, as legendas saem da narração que ficou gravada."
                        : "Grave ou envie o áudio primeiro: a legenda sai da fala."}
                    </p>
                  )}

                  {legendas && (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ESTILOS_LEGENDA.map((e) => (
                          <Chip key={e.id} ativo={(legendas.estilo ?? "faixa") === e.id} onClick={() => setLegendas({ ...legendas, estilo: e.id })} title={e.dica}>
                            {e.rotulo}
                          </Chip>
                        ))}
                        <Chip ativo={(legendas.posicao ?? "base") === "base"} onClick={() => setLegendas({ ...legendas, posicao: "base" })}>Embaixo</Chip>
                        <Chip ativo={legendas.posicao === "centro"} onClick={() => setLegendas({ ...legendas, posicao: "centro" })}>No meio</Chip>
                      </div>
                      <p className="mt-2 text-[11px] text-neutral-500">{legendas.trechos.length} trechos · corrija o que a transcrição errou</p>
                      <ul className="mt-1 max-h-52 space-y-1 overflow-y-auto">
                        {legendas.trechos.map((t, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-neutral-400">{t.inicio.toFixed(1)}s</span>
                            <input
                              type="text"
                              value={t.texto}
                              onChange={(e) => mudarTrecho(i, e.target.value)}
                              maxLength={LIMITES.trechoMax}
                              className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs focus:border-marca-indigo focus:outline-none"
                            />
                            <button onClick={() => removerTrecho(i)} className="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Tirar este trecho">
                              <Icone nome="fechar" className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {/* Ajuste fino da voz: só aparece quando existe voz pra ajustar. */}
                {espec.narracao && (
                  <div className="mt-3 grid gap-2 rounded-lg bg-neutral-50 p-2.5 sm:grid-cols-2">
                    <label className="text-xs text-neutral-600">
                      Volume da voz · {Math.round(vozVolume * 100)}%
                      <input type="range" min={0.2} max={2} step={0.05} value={vozVolume} onChange={(e) => setVozVolume(Number(e.target.value))} className="mt-1 w-full accent-marca-coral" />
                    </label>
                    <label className="text-xs text-neutral-600">
                      Começa em {vozInicio.toFixed(1)}s
                      <input type="range" min={0} max={LIMITES.vozInicioMax} step={0.1} value={vozInicio} onChange={(e) => setVozInicio(Number(e.target.value))} className="mt-1 w-full accent-marca-coral" />
                    </label>
                  </div>
                )}
              </div>
            )}
          </Cartao>
          )}

          {/* A galeria vem ANTES dos campos de marca: o que a pessoa abre a aba Texto
              pra fazer é por uma frase na cena, não preencher título do vídeo. */}
          {aba === "texto" && cenaAtual && (
          <Cartao>
            <Rotulo>Texto na cena {indiceAtual + 1}</Rotulo>
            <GaleriaTexto
              pecas={pecas}
              aoAdicionar={(t) => adicionarTexto(cenaAtual.chave, t)}
              aoTrocarAnimacao={(id) => mudarTexto(cenaAtual.chave, (cenaAtual.textos ?? []).length - 1, { animacao: id as AnimacaoTexto })}
              animacaoAtual={(cenaAtual.textos ?? []).at(-1)?.animacao ?? null}
              temTextoSelecionado={(cenaAtual.textos ?? []).length > 0}
              cheio={(cenaAtual.textos ?? []).length >= LIMITES.textosPorCena}
              desabilitado={gerando}
            />
          </Cartao>
          )}

          {aba === "texto" && (
          <Cartao>
            <Rotulo>Textos e marca</Rotulo>
            <div className="grid gap-2">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={LIMITES.tituloMax} placeholder="Título (ex.: Apto 302 · Setor Bueno)" className={campo} />
              <div className="grid grid-cols-2 gap-2">
                <input value={preco} onChange={(e) => setPreco(e.target.value)} maxLength={30} placeholder="Preço (ex.: R$ 690.000)" className={campo} />
                <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={50} placeholder="Bairro · Cidade" className={campo} />
              </div>
              {/* A capa é o que aparece ANTES de alguém tocar no play -- no feed, no
                  WhatsApp, na lista. Quadro cru vende o cômodo; capa montada vende o
                  anúncio, e é o único lugar em que o preço é lido por quem ainda não
                  decidiu assistir. Só oferecida quando há o que escrever nela. */}
              {(titulo.trim() || preco.trim()) && (
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={capaMontada} onChange={(e) => setCapaMontada(e.target.checked)} className="mt-0.5 accent-marca-coral" />
                  <span>
                    Capa com o nome e o preço escritos
                    <span className="block text-xs text-neutral-500">
                      A imagem que aparece antes de tocar o vídeo. Sem isso, a capa é o quadro cru da cena escolhida.
                    </span>
                  </span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={telaFinal} onChange={(e) => setTelaFinal(e.target.checked)} className="mt-0.5 accent-marca-coral" />
                <span>
                  Tela final com meu contato
                  <span className="block text-xs text-neutral-500">
                    Nome, CRECI, WhatsApp e logo de <Link href="/marca" className="underline">Minha marca</Link>.
                  </span>
                </span>
              </label>
              {telaFinal && (
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-xs text-neutral-500">Frase da tela final</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {/* "Chame no WhatsApp" some quando a marca não tem número: a tela
                        final monta o contato a partir de Minha marca, e sem número a
                        frase manda o cliente pra lugar nenhum. */}
                    {CHAMADAS.filter((f) => marca?.whatsapp || !/whatsapp/i.test(f)).map((f) => (
                      <Chip key={f} ativo={chamada === f} onClick={() => setChamada(f)}>{f}</Chip>
                    ))}
                    <Chip ativo={chamada === ""} onClick={() => setChamada("")}>Sem frase</Chip>
                  </div>
                  <input value={chamada} onChange={(e) => setChamada(e.target.value)} maxLength={LIMITES.chamadaMax} placeholder="Ou escreva a sua" className={campo + " mt-2"} aria-label="Frase da tela final" />
                </div>
              )}
              {fichaResumo && (
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={cenas.length > 0 && cenas[0].legenda === fichaResumo}
                    disabled={cenas.length === 0 || gerando}
                    onChange={(e) => {
                      const primeira = cenas[0];
                      if (primeira) mudarCena(primeira.chave, { legenda: e.target.checked ? fichaResumo : "" });
                    }}
                    className="mt-0.5 accent-marca-coral"
                  />
                  <span>
                    Dados do imóvel na primeira cena
                    <span className="block text-xs text-neutral-500">“{fichaResumo}” — vem da ficha do imóvel, sem digitar de novo.</span>
                  </span>
                </label>
              )}
            </div>
          </Cartao>
          )}

          {/* ---------- apresentador ----------
               Você aparecendo no próprio vídeo. Anúncio com rosto é anúncio com gente por
               trás, e é a peça que mais falta nas ferramentas genéricas -- porque exige
               gravar, cortar e sobrepor sem sair da tela. */}
          {aba === "voce" && (
          <Cartao>
            <Rotulo>Você no vídeo</Rotulo>

            {camera ? (
              <div>
                <video ref={previaCamera} autoPlay muted playsInline className="w-full rounded-xl bg-black" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {gravandoVideo ? (
                    <>
                      <Botao variante="secundaria" onClick={() => gravadorVideo.current?.stop()} className="px-3 py-1.5 text-xs">⏹ Parar</Botao>
                      <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-red-600">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                        {relogio(segundosVideo)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Botao onClick={gravarVideo} className="px-3 py-1.5 text-xs">● Gravar</Botao>
                      <Botao variante="discreta" onClick={fecharCamera} className="px-3 py-1.5 text-xs">Fechar a câmera</Botao>
                    </>
                  )}
                </div>
              </div>
            ) : apresentador ? (
              <div>
                {apreUrl && <video src={apreUrl} controls playsInline className="w-full rounded-xl bg-black" />}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FORMATOS_APRESENTADOR.map((f) => (
                    <Chip key={f.id} ativo={apresentador.formato === f.id} onClick={() => setApresentador({ ...apresentador, formato: f.id })} title={f.dica}>
                      {f.rotulo}
                    </Chip>
                  ))}
                </div>
                {apresentador.formato !== "rodape" && (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CANTOS_APRESENTADOR.map((c) => (
                        <Chip key={c.id} ativo={(apresentador.canto ?? "inferior_direito") === c.id} onClick={() => setApresentador({ ...apresentador, canto: c.id })}>
                          {c.rotulo}
                        </Chip>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TAMANHOS_APRESENTADOR.map((t) => (
                        <Chip key={t.id} ativo={(apresentador.tamanho ?? "medio") === t.id} onClick={() => setApresentador({ ...apresentador, tamanho: t.id })}>
                          {t.rotulo}
                        </Chip>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-2 grid gap-2 rounded-lg bg-neutral-50 p-2.5 sm:grid-cols-2">
                  <label className="text-xs text-neutral-600">
                    Entra em {(apresentador.entra ?? 0).toFixed(1)}s
                    <input type="range" min={0} max={Math.max(1, Math.round(duracao))} step={0.5} value={apresentador.entra ?? 0} onChange={(e) => setApresentador({ ...apresentador, entra: Number(e.target.value) })} className="mt-1 w-full accent-marca-coral" />
                  </label>
                  <label className="text-xs text-neutral-600">
                    Volume da sua voz · {Math.round((apresentador.volume ?? 1) * 100)}%
                    <input type="range" min={0} max={2} step={0.05} value={apresentador.volume ?? 1} onChange={(e) => setApresentador({ ...apresentador, volume: Number(e.target.value) })} className="mt-1 w-full accent-marca-coral" />
                  </label>
                  <label className="text-xs text-neutral-600 sm:col-span-2">
                    Começar o clipe em {(apresentador.inicio ?? 0).toFixed(1)}s
                    <input type="range" min={0} max={30} step={0.5} value={apresentador.inicio ?? 0} onChange={(e) => setApresentador({ ...apresentador, inicio: Number(e.target.value) })} className="mt-1 w-full accent-marca-coral" />
                  </label>
                </div>
                <button
                  onClick={() => {
                    setApresentador(null);
                    setApreUrl(null);
                  }}
                  className="mt-2 text-xs text-neutral-500 underline"
                >
                  Tirar do vídeo
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Botao variante="secundaria" onClick={abrirCamera} disabled={enviandoApre || gerando} className="px-3 py-1.5 text-xs">
                  📹 {enviandoApre ? "Guardando…" : "Gravar com a câmera"}
                </Botao>
                <label className={"inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400 " + (enviandoApre ? "pointer-events-none opacity-50" : "")}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Enviar vídeo
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
                <span className="basis-full text-xs text-neutral-500">Não gasta crédito. A câmera só é pedida depois do clique.</span>
              </div>
            )}
          </Cartao>
          )}

          {aba === "cor" && (
          <Cartao>
            <Rotulo>Cor do vídeo</Rotulo>
            <p className="-mt-1 mb-3 text-xs text-neutral-500">
              O acabamento vale pro vídeo inteiro. Uma cena pode sair da linha no painel dela.
            </p>
            {/* A prévia mostra o filtro NA FOTO da cena aberta, não num quadradinho de
                cor: "Cinema" só quer dizer alguma coisa aplicado à sala que a pessoa
                está editando. O CSS é a aproximação do que o ffmpeg vai fazer -- não é a
                mesma conta, mas é o bastante pra escolher sem gerar o vídeo. */}
            <div className="grid grid-cols-3 gap-1.5">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  disabled={gerando}
                  title={f.dica}
                  className={
                    "overflow-hidden rounded-lg border-2 text-left transition disabled:opacity-40 " +
                    (filtro === f.id ? "border-marca-coral" : "border-transparent hover:border-neutral-400")
                  }
                >
                  <span className="block aspect-[4/3] overflow-hidden bg-neutral-800">
                    {cenaAtual?.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cenaAtual.miniatura} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} draggable={false} />
                    ) : (
                      <span className="grid h-full place-items-center text-[10px] text-neutral-500">sem foto</span>
                    )}
                  </span>
                  <span className={"block truncate px-1 py-1 text-[11px] " + (filtro === f.id ? "text-marca-indigo" : "text-neutral-600")}>{f.rotulo}</span>
                </button>
              ))}
            </div>
          </Cartao>
          )}

          {aba === "formato" && (
          <Cartao>
            <Rotulo>Formato</Rotulo>
            <div className="grid grid-cols-2 gap-2">
              {FORMATOS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormato(f.id)} disabled={gerando} className={"rounded-xl border px-3 py-2 text-left text-sm transition " + (formato === f.id ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 hover:border-neutral-400")}>
                  <span className="font-medium">{f.rotulo} · {f.id}</span>
                  <span className="block text-xs text-neutral-500">{f.dica}</span>
                </button>
              ))}
            </div>
          </Cartao>
          )}

          {/* ---------- kit de marca ----------
               Não é um formulário: é o ESPELHO do que já está em Minha marca, mostrando o
               que vai entrar no vídeo sem ninguém pedir. Editar é lá -- a marca vale pro
               produto inteiro, e ter dois lugares que a mudam é ter duas verdades. */}
          {aba === "marca" && (
          <Cartao>
            <Rotulo>Kit de marca</Rotulo>
            <p className="-mt-1 mb-3 text-xs text-neutral-500">
              Entra sozinho na tela final, na capa e nos carimbos. Mexer aqui é em <Link href="/marca" className="underline">Minha marca</Link>, e vale pro produto inteiro.
            </p>
            <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-white">
                {marca?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={marca.logo} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <Icone nome="marca" className="h-5 w-5 text-neutral-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{marca?.nome || "Sem nome cadastrado"}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[marca?.creci ? `CRECI ${marca.creci}` : null, marca?.whatsapp, marca?.instagram].filter(Boolean).join(" · ") || "Sem CRECI nem contato"}
                </p>
              </div>
              <span className="h-8 w-8 shrink-0 rounded-lg border border-neutral-200" style={{ background: marca?.cor || "#0f2d5b" }} title={`Cor da marca: ${marca?.cor || "#0f2d5b"}`} />
            </div>

            <ul className="mt-3 flex flex-col gap-1.5 text-xs text-neutral-600">
              {[
                ["Tela final", telaFinal ? "ligada" : "desligada"],
                ["Capa do vídeo", capaMontada && (titulo.trim() || preco.trim()) ? "com nome e preço" : "quadro cru"],
                ["Cor dos textos", "sai da cor da marca"],
              ].map(([o, q]) => (
                <li key={o} className="flex items-baseline justify-between gap-2 border-b border-neutral-100 pb-1">
                  <span>{o}</span>
                  <span className="text-neutral-400">{q}</span>
                </li>
              ))}
            </ul>

            {!marca?.nome && !marca?.whatsapp && !marca?.logo && (
              <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                Sem nome, WhatsApp ou logo, o vídeo sai sem tela final. <Link href="/marca" className="underline">Preencher agora</Link>.
              </p>
            )}
          </Cartao>
          )}

          {aba === "videos" && (
          <Cartao>
            <Rotulo>Seus vídeos</Rotulo>
            {videos === null ? (
              <p className="text-sm text-neutral-500">Carregando…</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum ainda.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {videos.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => abrirVideo(v)} className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100" title="Abrir">
                      {v.miniatura ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.miniatura} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icone nome="play" className="h-5 w-5 text-neutral-400" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.titulo}</p>
                      <p className="text-xs text-neutral-500">
                        {dataCurta(v.criadoEm)} · {v.formato}
                        {v.duracao ? ` · ${Math.round(v.duracao)} s` : ""}
                        {v.status === "gerando" && " · gerando"}
                        {v.status === "falhou" && " · falhou"}
                      </p>
                    </div>
                    {v.status === "concluido" && (
                      <button onClick={() => editarVideo(v.id)} disabled={gerando} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-marca-indigo disabled:opacity-30" title="Editar: reabre as cenas e os ajustes">
                        <Icone nome="editar_prompt" className="h-4 w-4" />
                      </button>
                    )}
                    <BotaoConfirma
                      pergunta="Apagar este vídeo?"
                      detalhe="Sai o arquivo montado e a miniatura. As fotos que entraram nele continuam em Materiais."
                      aoConfirmar={() => apagarVideo(v.id)}
                      className="p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      title="Apagar"
                    >
                      <Icone nome="lixeira" className="h-4 w-4" />
                    </BotaoConfirma>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          )}

        </div>

        {/* ---------- palco e painel da cena ---------- */}
        <section className="palco order-1 flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:order-3">
      {erro && (
        <div className="mx-auto w-full max-w-2xl text-sm">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {editandoDe && (
        <div className="mx-auto w-full max-w-2xl text-sm">
          <Aviso tipo="info">
            Editando <strong>{editandoDe.titulo}</strong>. Gerar cria um vídeo novo — o atual continua em Seus vídeos. Cena animada que não mudou não custa de novo.{" "}
            <button type="button" onClick={comecarDoZero} className="underline">Começar do zero</button>
          </Aviso>
        </div>
      )}

      {resultado && (
        <Cartao className="mx-auto w-full max-w-3xl">
          <div className="grid gap-5 lg:grid-cols-12">
            <div className={"lg:col-span-5 " + (vertical ? "mx-auto w-full max-w-[280px]" : "lg:col-span-7")}>
              <video key={resultado.url} src={resultado.url} poster={resultado.miniatura ?? undefined} controls playsInline className="w-full rounded-xl bg-black" />
            </div>
            <div className={vertical ? "lg:col-span-7" : "lg:col-span-5"}>
              <Rotulo>Seu vídeo está pronto</Rotulo>
              <p className="text-sm text-neutral-600">
                {resultado.duracao ? `${Math.round(resultado.duracao)} segundos · ` : ""}
                {FORMATOS.find((f) => f.id === resultado.formato)?.rotulo ?? resultado.formato}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={resultado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                  <Icone nome="download" className="h-4 w-4" />
                  Baixar MP4
                </a>
                <Botao variante="secundaria" onClick={() => editarVideo(resultado.videoId)} title="Reabre as cenas e os ajustes deste vídeo. Gerar de novo cria outro vídeo.">
                  <Icone nome="editar_prompt" className="h-4 w-4" />
                  Editar
                </Botao>
                <Botao variante="discreta" onClick={() => setResultado(null)}>Fechar</Botao>
              </div>
              {/* Adaptar pra outro formato.
                  O mesmo vídeo serve pro Reels e pro feed, e refazer tudo à mão pra
                  trocar o enquadramento era o passo que mandava a pessoa pro CapCut.
                  As cenas, os textos e o áudio são os mesmos; muda o quadro. Não custa
                  crédito: o clipe animado já existe e é reaproveitado. */}
              {cenas.length > 0 && (
                <div className="mt-3 rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-xs text-neutral-500">Fazer também em</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {FORMATOS.filter((f) => f.id !== resultado.formato).map((f) => (
                      <Chip key={f.id} ativo={false} onClick={() => gerar({ formato: f.id })} disabled={gerando} title={f.dica}>
                        {f.rotulo} · {f.id}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <Compartilhar token={token} videoId={resultado.videoId} texto="Olha o vídeo do imóvel:" />
              </div>
              {resultado.avisos.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-700">
                  {resultado.avisos.map((a, i) => (
                    <li key={i}>⚠ {a}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-neutral-500">No celular, toque em Baixar e depois em compartilhar para mandar pelo WhatsApp ou postar no Instagram.</p>
            </div>
          </div>
        </Cartao>
      )}

          {/* ---------- palco ----------
               A cena escolhida no tamanho e na proporção em que ela vai sair, com o
               título e a legenda por cima. Não é o vídeo tocando -- é o quadro. Ver o
               enquadramento antes de gastar crédito é metade do trabalho do editor. */}
          <Cartao className="p-3 sm:p-4">
            {/* O palco tem TETO DE ALTURA nas telas pequenas.
                Um vídeo 9:16 numa largura de 360 dá 640 de altura: sozinho, ele comia a
                tela inteira do celular e empurrava a trilha de ferramentas e a linha do
                tempo pra fora da vista. A pessoa abria o editor e via um retângulo preto.
                Com altura fixa em 44vh e largura derivada da proporção, o quadro continua
                exato e sobra tela pro resto. No computador volta a ser a largura que manda. */}
            <div className="mx-auto w-full" style={{ maxWidth: formato === "16:9" ? 680 : formato === "1:1" ? 440 : 360 }}>
              <div
                className="relative mx-auto h-[44vh] w-auto overflow-hidden rounded-xl bg-neutral-900 md:h-auto md:w-full"
                style={{ aspectRatio: PROPORCAO[formato] }}
              >
                {cenaAtual?.miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cenaAtual.miniatura} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
                    <Icone nome={cenaAtual ? "video" : "foto"} className="h-9 w-9" />
                    <span className="px-6 text-center text-xs">{cenaAtual ? "Clipe — aparece no vídeo montado" : "Escolha as fotos em Mídia"}</span>
                  </div>
                )}
                {titulo && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                    <span className="truncate rounded bg-marca-indigo/90 px-2 py-1 text-[11px] font-semibold text-white">{titulo}</span>
                  </span>
                )}
                {/* Os textos da cena, no lugar em que vão sair. Não é o render (isso é
                    ffmpeg), é o ensaio: dá pra ver se o preço cobriu a janela. */}
                {cenaAtual &&
                  textosDaCena({ legenda: cenaAtual.legenda || undefined, textos: cenaAtual.textos }).map((t, i) => {
                    const est = ESTILO_TEXTO_POR_ID[t.estilo ?? "faixa"];
                    const pos = t.posicao ?? "base";
                    return (
                      <span
                        key={i}
                        className={
                          "pointer-events-none absolute inset-x-0 flex justify-center px-3 " +
                          (pos === "topo" ? "top-[7%]" : pos === "centro" ? "top-1/2 -translate-y-1/2" : "bottom-[8%]")
                        }
                      >
                        <span
                          className="max-w-full truncate rounded px-2 py-1 text-white"
                          style={{
                            background: est.id === "etiqueta" ? "rgba(240,107,79,0.88)" : "rgba(15,45,91,0.88)",
                            fontSize: est.id === "destaque" ? 20 : est.id === "etiqueta" ? 10 : 12,
                            fontWeight: est.id === "destaque" ? 700 : 500,
                          }}
                        >
                          {t.texto || "texto"}
                        </span>
                      </span>
                    );
                  })}
              </div>
              <p className="mt-2 truncate text-center text-xs text-neutral-500">
                {cenaAtual ? `Cena ${indiceAtual + 1} de ${cenas.length} · ${cenaAtual.rotulo}` : "Nenhuma cena ainda"}
              </p>
            </div>
          </Cartao>
          {/* ---------- painel da cena ----------
               Tudo que dá pra mexer na cena escolhida, num lugar só. Antes cada cena
               carregava os próprios controles na lista, e a lista virava uma parede de
               chips: doze cenas, doze cópias de tudo. */}
          {cenaAtual && (
            <Cartao>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Rotulo>Cena {indiceAtual + 1}</Rotulo>
                  <p className="-mt-1 truncate text-xs text-neutral-500">{cenaAtual.rotulo}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* Arrastar reordena na linha do tempo; estas setas fazem o mesmo pra
                      quem está no teclado ou no celular, onde arrastar não vai bem. */}
                  <button onClick={() => mover(cenaAtual.chave, -1)} disabled={gerando || indiceAtual === 0} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Mover pra trás">
                    <Icone nome="cima" className="h-4 w-4 -rotate-90" />
                  </button>
                  <button onClick={() => mover(cenaAtual.chave, 1)} disabled={gerando || indiceAtual === cenas.length - 1} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Mover pra frente">
                    <Icone nome="cima" className="h-4 w-4 rotate-90" />
                  </button>
                  <button onClick={() => dividir(cenaAtual.chave)} disabled={gerando || cenas.length >= LIMITES.cenasMax || cenaAtual.duracao < LIMITES.duracaoMin * 2} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Dividir em duas">
                    <Icone nome="corrigir_perspectiva" className="h-4 w-4" />
                  </button>
                  <button onClick={() => duplicar(cenaAtual.chave)} disabled={gerando || cenas.length >= LIMITES.cenasMax} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Duplicar">
                    <Icone nome="copiar" className="h-4 w-4" />
                  </button>
                  <button onClick={() => remover(cenaAtual.chave)} disabled={gerando} className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600" title="Remover">
                    <Icone nome="lixeira" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip ativo={(capa ?? cenas[0]?.chave) === cenaAtual.chave} onClick={() => setCapa(cenaAtual.chave)} title="A miniatura do vídeo (o que aparece antes do play) sai desta cena.">
                  ★ Capa
                </Chip>
                {cenaAtual.tipo === "animada" && cenaAtual.animacaoGuardada && cenaAtual.animacaoGuardada.animacao === cenaAtual.animacao && cenaAtual.animacaoGuardada.duracao === cenaAtual.duracao && (
                  <span className="rounded-full bg-marca-teal/15 px-2.5 py-1 text-xs font-medium text-marca-teal" title="O clipe desta animação já foi gerado num vídeo anterior. Com o mesmo movimento e duração, não custa de novo.">
                    animação já feita · grátis
                  </span>
                )}
                {cenaAtual.ehPanoramica && (
                  <span className="rounded-full bg-marca-teal/15 px-2.5 py-1 text-xs font-medium text-marca-teal" title="Panorâmica não cabe parada no quadro do vídeo: mostrada assim, as pontas seriam cortadas. Já deixei no efeito que desliza.">
                    panorâmica · deslizando
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!cenaAtual.ehClipe && !cenaAtual.eh360 && (
                  <>
                    <Chip ativo={cenaAtual.tipo === "foto"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "foto" })}>Foto</Chip>
                    {cenaAtual.temAntes && <Chip ativo={cenaAtual.tipo === "antes_depois"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "antes_depois" })}>Antes e depois</Chip>}
                    <Chip ativo={cenaAtual.tipo === "animada"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "animada" })} title={`+${CREDITOS.animada} créditos. A IA move a CÂMERA pelo ambiente. Não entra pessoa, bicho nem móvel novo.`}>
                      ✨ Mover a câmera (+{CREDITOS.animada})
                    </Chip>
                  </>
                )}
                {cenaAtual.eh360 && (
                  <>
                    <Chip ativo={cenaAtual.tipo === "tour360"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "tour360", duracao: Math.max(cenaAtual.duracao, 6) })} title="Sua foto 360 (ou panorâmica) vira passeio: a câmera anda dentro dela de verdade, sem IA e sem crédito.">🧭 Passear na sua 360</Chip>
                    <Chip ativo={cenaAtual.tipo === "foto"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "foto" })}>Foto comum</Chip>
                  </>
                )}
                {cenaAtual.ehClipe && (
                  <>
                    <Chip ativo={cenaAtual.tipo === "clipe"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "clipe" })}>Clipe</Chip>
                    <Chip ativo={cenaAtual.tipo === "tour360"} onClick={() => mudarCena(cenaAtual.chave, { tipo: "tour360", duracao: Math.max(cenaAtual.duracao, 6) })} title="Só se o vídeo foi gravado com câmera 360 (equirretangular)">🧭 Passear na sua 360</Chip>
                  </>
                )}
              </div>

              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {cenaAtual.tipo === "foto" && (
                    <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                      Movimento
                      <select
                        value={cenaAtual.efeito}
                        onChange={(e) => mudarCena(cenaAtual.chave, { efeito: e.target.value as EfeitoId })}
                        title={EFEITOS.find((e) => e.id === cenaAtual.efeito)?.dica}
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm"
                      >
                        {EFEITOS.map((e) => (
                          <option key={e.id} value={e.id} title={e.dica}>{e.rotulo}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {cenaAtual.tipo === "animada" && (
                    <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                      Câmera
                      <select value={cenaAtual.animacao} onChange={(e) => mudarCena(cenaAtual.chave, { animacao: e.target.value as AnimacaoId })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" title={ANIMACOES.find((a) => a.id === cenaAtual.animacao)?.descricao}>
                        {ANIMACOES.map((a) => (
                          <option key={a.id} value={a.id}>{a.rotulo}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {cenaAtual.tipo === "tour360" && (
                    <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                      Passeio
                      <select value={cenaAtual.movimento} onChange={(e) => mudarCena(cenaAtual.chave, { movimento: e.target.value as Movimento360Id })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" title={MOVIMENTOS_360.find((m) => m.id === cenaAtual.movimento)?.descricao}>
                        {MOVIMENTOS_360.map((m) => (
                          <option key={m.id} value={m.id}>{m.rotulo}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                    Duração
                    <select value={cenaAtual.duracao} onChange={(e) => mudarCena(cenaAtual.chave, { duracao: Number(e.target.value) })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm">
                      {DURACOES_CENA[cenaAtual.tipo === "tour360" ? "tour360" : cenaAtual.tipo === "animada" ? "animada" : "foto"].map((d) => (
                        <option key={d} value={d}>{d} s</option>
                      ))}
                    </select>
                  </label>
                  {/* Acabamento DESTA cena. "Igual ao vídeo" é o estado normal: o
                      acabamento é do vídeo inteiro, e a cena só sai da linha quando a
                      pessoa quer -- a foto da fachada em preto e branco no meio de um
                      vídeo claro, por exemplo. */}
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                    Cor
                    <select
                      value={cenaAtual.filtro ?? ""}
                      onChange={(e) => mudarCena(cenaAtual.chave, { filtro: (e.target.value || undefined) as FiltroId | undefined })}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm"
                    >
                      <option value="">Igual ao vídeo</option>
                      {FILTROS.map((f) => (
                        <option key={f.id} value={f.id}>{f.rotulo}</option>
                      ))}
                    </select>
                  </label>
                  {cenaAtual.ehClipe && cenaAtual.tipo === "clipe" && (
                    <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                      <input type="checkbox" checked={cenaAtual.melhorar} onChange={(e) => mudarCena(cenaAtual.chave, { melhorar: e.target.checked })} className="accent-marca-coral" />
                      Melhorar cor
                    </label>
                  )}
                </div>

                {cenaAtual.tipo === "animada" && (
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    {ANIMACOES.find((a) => a.id === cenaAtual.animacao)?.descricao} <strong className="font-medium text-neutral-700">Só a câmera se move</strong> — o imóvel fica
                    como está, e não entra pessoa, bicho nem móvel novo. Leva <strong className="font-medium text-neutral-700">alguns minutos</strong>.
                  </p>
                )}

                {/* Aparar: o começo do clipe é onde a pessoa ainda estava acertando o celular. */}
                {cenaAtual.ehClipe && (
                  <label className="text-xs text-neutral-600">
                    Começar o clipe em {(cenaAtual.inicio ?? 0).toFixed(1)}s
                    <input type="range" min={0} max={30} step={0.5} value={cenaAtual.inicio ?? 0} onChange={(e) => mudarCena(cenaAtual.chave, { inicio: Number(e.target.value) })} className="mt-1 w-full accent-marca-coral" />
                  </label>
                )}

                {/* Luz: o único número solto do editor, e ele está aqui porque é o
                    único defeito que toda foto de imóvel tem de vez em quando -- o
                    cômodo saiu escuro. O resto de cor vem com nome. */}
                <label className="block text-xs text-neutral-600">
                  Luz {cenaAtual.luz ? (cenaAtual.luz > 0 ? `+${Math.round(cenaAtual.luz * 100)}%` : `${Math.round(cenaAtual.luz * 100)}%`) : "normal"}
                  <input
                    type="range"
                    min={-LIMITES.luzMax}
                    max={LIMITES.luzMax}
                    step={0.01}
                    value={cenaAtual.luz ?? 0}
                    onChange={(e) => mudarCena(cenaAtual.chave, { luz: Number(e.target.value) || undefined })}
                    className="mt-1 w-full accent-marca-coral"
                  />
                </label>

                <input
                  type="text"
                  value={cenaAtual.legenda}
                  onChange={(e) => mudarCena(cenaAtual.chave, { legenda: e.target.value })}
                  maxLength={LIMITES.legendaMax}
                  placeholder="Legenda (ex.: Sala de estar · 32 m²)"
                  className={campo}
                />

                {/* ---------- textos da cena ----------
                     Etiquetas prontas e as PEÇAS do imóvel: ninguém abre um editor pra
                     digitar "Lançamento" nem pra escrever de novo um preço que já está
                     no cadastro. Três posições e três estilos, porque posição livre num
                     vídeo de celular quase sempre sai torta. */}
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-xs font-medium text-neutral-600">Textos nesta cena</p>

                  {(cenaAtual.textos ?? []).map((t, i) => (
                    <div key={i} className="mt-2 rounded-lg border border-neutral-200 bg-white p-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={t.texto}
                          onChange={(e) => mudarTexto(cenaAtual.chave, i, { texto: e.target.value })}
                          maxLength={LIMITES.textoMax}
                          placeholder="Escreva o texto"
                          className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm focus:border-marca-indigo focus:outline-none"
                        />
                        <button onClick={() => removerTexto(cenaAtual.chave, i)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Tirar este texto">
                          <Icone nome="fechar" className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <select value={t.posicao ?? "base"} onChange={(e) => mudarTexto(cenaAtual.chave, i, { posicao: e.target.value as PosicaoTexto })} className="rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs" aria-label="Posição do texto">
                          {POSICOES_TEXTO.map((p) => (
                            <option key={p.id} value={p.id}>{p.rotulo}</option>
                          ))}
                        </select>
                        <select value={t.estilo ?? "faixa"} onChange={(e) => mudarTexto(cenaAtual.chave, i, { estilo: e.target.value as EstiloTexto })} className="rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs" aria-label="Estilo do texto" title={ESTILOS_TEXTO.find((x) => x.id === (t.estilo ?? "faixa"))?.dica}>
                          {ESTILOS_TEXTO.map((x) => (
                            <option key={x.id} value={x.id}>{x.rotulo}</option>
                          ))}
                        </select>
                        <select value={t.animacao ?? "nenhuma"} onChange={(e) => mudarTexto(cenaAtual.chave, i, { animacao: e.target.value as AnimacaoTexto })} className="rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs" aria-label="Entrada do texto">
                          {ANIMACOES_TEXTO.map((a) => (
                            <option key={a.id} value={a.id}>{a.rotulo}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}

                  {(cenaAtual.textos ?? []).length < LIMITES.textosPorCena ? (
                    <div className="mt-2">
                      {pecas.length > 0 && (
                        <>
                          <p className="text-[11px] text-neutral-500">Do imóvel — já preenchido</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {pecas.map((p) => (
                              <Chip
                                key={p.id}
                                ativo={false}
                                onClick={() => adicionarTexto(cenaAtual.chave, { texto: p.texto, estilo: p.id === "preco" ? "destaque" : "faixa", posicao: "base", animacao: "surgir" })}
                                title={`${p.rotulo}: ${p.texto}`}
                              >
                                + {p.rotulo}
                              </Chip>
                            ))}
                          </div>
                        </>
                      )}
                      <p className="mt-2 text-[11px] text-neutral-500">Etiquetas</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {SELOS_IMOVEL.map((s) => (
                          <Chip key={s.id} ativo={false} onClick={() => adicionarTexto(cenaAtual.chave, { texto: s.texto, estilo: s.estilo, posicao: s.posicao, animacao: "surgir" })}>
                            {s.texto}
                          </Chip>
                        ))}
                        <Chip ativo={false} onClick={() => adicionarTexto(cenaAtual.chave, { texto: "", estilo: "faixa", posicao: "centro", animacao: "nenhuma" })}>
                          + Escrever
                        </Chip>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-neutral-500">Três textos já é o limite desta cena.</p>
                  )}
                </div>

                {indiceAtual < cenas.length - 1 && (
                  <div>
                    <p className="text-xs text-neutral-500">Emenda com a cena {indiceAtual + 2}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {TRANSICOES.map((t) => (
                        <Chip key={t.id} ativo={(cenaAtual.transicao ?? transicao) === t.id} onClick={() => mudarCena(cenaAtual.chave, { transicao: t.id })}>
                          {t.rotulo}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Cartao>
          )}
          {/* Status: só aparece quando tem o que dizer. Cartão vazio é caixa à toa. */}
          {(cenas.length === 0 || gerando || semSaldo || custo === 0) && (
          <Cartao>
            {cenas.length === 0 && !gerando && (
              <p className="text-center text-xs text-neutral-500">Escolha as fotos em Mídia, na trilha da esquerda. O resto já vem pronto.</p>
            )}
            {custo === 0 && !gerando && cenas.length > 0 && (
              <p className="text-center text-xs text-neutral-500">Vídeo e tour 360 não gastam crédito. Só cena animada por IA ({CREDITOS.animada}) e voz de IA ({CREDITOS.narracao}).</p>
            )}
            {gerando && progresso && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-marca-coral transition-all" style={{ width: `${Math.max(6, Math.round((progresso.feitas / Math.max(1, progresso.total)) * 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {progresso.mensagem} Etapa {Math.min(progresso.feitas + 1, progresso.total)} de {progresso.total}. Mantenha esta aba aberta.
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {relogio(segundosGerando)} de {esperaTotal <= 60 ? "menos de 1 min" : `cerca de ${Math.round(esperaTotal / 60)} min`} esperados.
                </p>
                {segundosGerando > esperaTotal * 2 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Está demorando mais que o normal. A fila da IA às vezes engarrafa — costuma sair. Se passar de 15 minutos, feche e tente de novo: o
                    crédito de uma cena que não voltou é devolvido.
                  </p>
                )}
              </div>
            )}
            {semSaldo && !gerando && (
              <div className="mt-3">
                <Aviso tipo="atencao">
                  Faltam créditos pra este vídeo. <Link href="/planos" className="underline">Veja os planos e pacotes.</Link>
                </Aviso>
              </div>
            )}
          </Cartao>
          )}
        </section>
      </div>

      {/* ---------- linha do tempo ----------
           Régua, blocos do tamanho da duração e cabeçote que anda. O componente inteiro
           mora em components/editor/linha-do-tempo.tsx -- ver lá o porquê de cada peça. */}
      <LinhaDoTempo
        blocos={blocosDaLinha}
        selecionada={cenaAtual?.chave ?? null}
        capa={capa ?? cenas[0]?.chave ?? null}
        telaFinal={telaFinal}
        segundosDaTelaFinal={LIMITES.telaFinalSegundos}
        tempo={tempo}
        tocando={tocando}
        zoom={zoomLinha}
        gerando={gerando}
        aoSelecionar={setSelecionada}
        aoMoverTempo={moverTempo}
        aoTocar={(t) => { if (t && tempo >= duracaoDaLinha - 0.05) moverTempo(0); setTocando(t); }}
        aoZoom={setZoomLinha}
        aoComecarArraste={(k) => (arrastando.current = k)}
        aoSoltarEm={soltarEm}
        aoDuplicar={duplicar}
        aoApagar={remover}
      />
    </div>
  );
}
