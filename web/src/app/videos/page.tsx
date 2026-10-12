"use client";

// VÍDEOS: o caminho RÁPIDO, do jeito que a página era antes do Editor.
//
// Restaurada da versão de 15/09 (commit 9fbab02) de propósito. Em 16/09 ele repetiu três
// vezes: "a parte de vídeos era pra ter algo como havia antes, mais simples", "parte de
// vídeos é pra ser algo rápido". Eu tinha tentado fazer desta página uma forma enxuta do
// Editor, e mesmo cortando ficava informação demais -- porque a régua de "enxuto" era a
// do Editor, não a de quem só quer o vídeo.
//
// Então aqui é a página de antes: 1) o que entra, 2) as cenas na ordem, o botão de gerar,
// e os Ajustes FECHADOS. Quem quer mexer mais tem o botão "Mesa de edição" no alto (até
// 10/10/2026 chamado "Editor completo"), que leva pra /editor/video com todas as ferramentas.
//
// As rotas de API que ela chama são as mesmas do Editor (conferido) e o saneador do
// servidor aceita o espec antigo -- os campos novos são todos opcionais.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import {
  ANIMACOES,
  animacoesOferecidas,
  BUCKET_UPLOADS,
  CHAMADAS,
  CORES_TELA_FINAL,
  CREDITOS,
  EFEITOS,
  FORMATOS,
  LIMITES,
  MOVIMENTOS_360,
  MUSICAS,
  MUSICA_PADRAO,
  VOZES,
  custoDoVideo,
  duracaoEstimada,
  precisaDoEditor,
  vozDeIA,
  ehTransicao,
  type TransicaoId,
  type AnimacaoId,
  type Cena,
  type EfeitoId,
  type EspecVideo,
  type FormatoId,
  type Movimento360Id,
  type MusicaId,
  type Narracao,
  type OrigemVoz,
  type VozId,
} from "@/lib/video";
import { resumoDaFicha, valorComPeriodo } from "@/lib/ficha-imovel";
import { falta } from "@/lib/espera-da-geracao";
import { useGeracao } from "@/components/geracao-em-andamento";
import AppShell from "@/components/app-shell";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import OuvirMusica from "@/components/ouvir-musica";
import { sugerirMontagem, type Olhada } from "@/lib/video-automatico";
import { useArrastarLista } from "@/components/usar-arrastar-lista";
import { Aviso, Botao, BotaoConfirma, Cartao, Chip, Icone, Rotulo } from "@/components/ui";
import { apagarVideosEmLote, recadoDoLote } from "@/lib/apagar-em-lote";
import { usarSelecao } from "@/lib/usar-selecao";
import DemoEstilo, { type EstiloDemo } from "@/components/demo-estilo";
import MesaRecursos from "@/components/mesa-recursos";
import TelaFinalPrevia from "@/components/tela-final-previa";

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
  /** Cena animada cujo clipe já existe no servidor: gerar de novo com o mesmo movimento
   *  e a mesma duração não custa crédito. Vem do servidor ao editar um vídeo pronto. */
  animacaoGuardada?: { animacao: AnimacaoId; duracao: number } | null;
  /** Por que esta foto está nesta posição. Vem da montagem automática e vai pro roteiro. */
  motivo?: string;
  /** A montagem decidiu que esta cena merece a câmera de IA (que custa) e não o zoom. */
  camera?: boolean;
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

/** `imovel` a rota já mandava; faltava a tela saber que existe pra poder juntar por imóvel. */
type VideoResumo = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null; compartilhado: boolean; erro: string | null; imovel: { id: string; titulo: string } | null };

// `musica` entra aqui porque o painel do vídeo pronto precisa saber qual trilha ESTE vídeo
// tem -- e não qual está escolhida na montagem lá em cima, que a pessoa pode ter mexido
// depois de gerar. É o que faz o botão "Trocar a música" saber quando não há nada a trocar.
type Resultado = { videoId: string; url: string; miniatura: string | null; duracao: number | null; avisos: string[]; formato: string; musica: MusicaId };

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
    duracao: c.duracao ?? LIMITES.duracaoPadrao,
    melhorar: c.melhorar ?? false,
    animacaoGuardada: info[i]?.animacaoGuardada ?? null,
  }));
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PaginaVideo() {
  const c = useConta();
  const router = useRouter();
  const { user, token } = c;

  const [imovelId, setImovelId] = useState<string | null>(null);
  const [geracoes, setGeracoes] = useState<Geracao[]>([]);
  const [cenas, setCenas] = useState<CenaUI[]>([]);
  const [formato, setFormato] = useState<FormatoId>("9:16");
  const [musica, setMusica] = useState<MusicaId>(MUSICA_PADRAO);
  /**
   * A música escolhida no painel do vídeo PRONTO.
   *
   * É um estado separado do `musica` da montagem de propósito: aqui a pessoa está ouvindo e
   * comparando trilhas num vídeo que já existe, e a escolha só vale quando ela aperta
   * "Trocar a música". Usar o mesmo estado faria o seletor mexer na próxima geração sem
   * ninguém ter pedido.
   */
  const [musicaDoPronto, setMusicaDoPronto] = useState<MusicaId>(MUSICA_PADRAO);
  const [trocandoMusica, setTrocandoMusica] = useState(false);
  /**
   * O preço conferido no servidor, com a assinatura das cenas que ele respondeu.
   *
   * Guardar a assinatura junto é o que faz o preço se invalidar sozinho: mudou a cena, a
   * assinatura não bate mais e a conta local volta a valer até a resposta nova chegar. Sem
   * isso seria preciso zerar o estado dentro do efeito -- que o compilador do React proíbe,
   * e proíbe com razão: é um render a mais a cada mudança.
   */
  const [precoDoServidor, setPrecoDoServidor] = useState<{ assinatura: string; custo: number; gratis: number[] } | null>(null);
  // "suave" virou "dissolver" quando as transições passaram de duas pra cinco.
  const [transicao, setTransicao] = useState<TransicaoId>("dissolver");
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
  const [gravando, setGravando] = useState(false);
  const [segundosGravando, setSegundosGravando] = useState(0);
  const [enviandoVoz, setEnviandoVoz] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [montando, setMontando] = useState(false);
  /** Qual foto está armada pra apagar (o primeiro toque arma, o segundo apaga). */
  const [apagando, setApagando] = useState<string | null>(null);
  const [apagandoAgora, setApagandoAgora] = useState(false);
  /**
   * O estilo da geração.
   *
   * "tour" FOI o padrão de 23/09 a 10/10/2026, a pedido dele: "quero que já fique então como
   * tour, já padrão, aí caso a pessoa queira modificar modifique". Ele viu o resultado por
   * duas semanas e pediu o contrário em 10/10: "gostaria que o padrão fosse Movimento na
   * foto (...) e a parte de tour pela casa não fosse mais padrão".
   *
   * O argumento de antes continua de pé e por isso o Tour continua ali, a um toque: é o
   * único estilo que dá profundidade de verdade (a porta abre no fundo, a janela gira), e
   * isso não sai de zoom sobre foto parada. O que mudou foi quem paga pela escolha quando
   * ninguém escolhe: Tour custa {CREDITOS.animada} créditos por cena com câmera, e padrão
   * que gasta cobra de quem só apertou "gerar". "Movimento na foto" é grátis.
   */
  const [estilo, setEstilo] = useState<"recomendado" | "tour" | "meu">("recomendado");
  /** Abriu os controles de cada cena. Fechado depois da montagem: primeiro o resultado. */
  const [mexendo, setMexendo] = useState(false);
  /** A lista de agora, pro relógio da montagem automática não ler a de dois renders atrás. */
  const cenasRef = useRef<CenaUI[]>([]);
  const relogioDaMontagem = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O que o "Montar sozinho" fez da última vez, pra poder contar e desfazer. */
  const [montagem, setMontagem] = useState<{ antes: CenaUI[]; quantas: number; fora: string[]; semOlhar: boolean } | null>(null);

  /** O pedido POST esta em voo. Dura um instante; o resto da espera e do provedor. */
  const [pedindo, setPedindo] = useState(false);
  /**
   * O acompanhamento vive no LAYOUT RAIZ, nao aqui.
   *
   * Enquanto o laco morava nesta pagina, sair dela matava a geracao: clicar em Clientes ou
   * Imoveis destruia a pagina e, com ela, quem perguntava ao servidor. Ele bateu nisso em
   * 24/09/2026 -- recarregou no meio, o video congelou em "gerando" e os creditos ficaram
   * presos. Agora a pagina so PEDE pra acompanhar e LE o que o provedor devolve.
   */
  const geracao = useGeracao();
  /**
   * "Gerando" e uma coisa so pra tela: pedindo OU acompanhando.
   *
   * O relogio de quanto tempo passou tambem vem do provedor -- ele que sabe quando comecou,
   * e continua sabendo mesmo se a pessoa passar pelo CRM no meio e voltar.
   */
  const gerando = pedindo || !!geracao.andamento;
  const segundosGerando = Math.round(geracao.decorrido);

  // O relógio zera em `gerar()`, na hora do clique; aqui só se conta enquanto gera.
  // O ref acompanha a lista, e a sincronia vai em efeito: escrever ref durante o render é
  // proibido pelo compilador do React, e com razão -- ali o valor muda sem a tela saber.
  useEffect(() => {
    cenasRef.current = cenas;
  }, [cenas]);

  // Sair da página com a montagem agendada seria montar uma tela que não existe mais.
  useEffect(() => () => { if (relogioDaMontagem.current) clearTimeout(relogioDaMontagem.current); }, []);

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
  /**
   * O vídeo pronto que a tela mostra.
   *
   * Duas origens: o que ESTA tela abriu (`resultadoAberto`) e o que o acompanhamento em
   * segundo plano terminou (`geracao.pronto`). É derivado em vez de copiado com setState
   * dentro de efeito -- que o compilador do React proíbe, e proíbe com razão.
   */
  const [resultadoAberto, setResultado] = useState<Resultado | null>(null);
  /**
   * O video pronto que a tela mostra: o que ELA abriu, ou o que o provedor terminou.
   *
   * Derivado, e nao copiado com setState dentro de efeito -- que o compilador do React
   * proibe. `musica` vem do estado da tela porque o provedor nao tem por que saber de
   * trilha: ele acompanha, nao monta.
   */
  const resultado: Resultado | null =
    resultadoAberto ?? (geracao.pronto ? { ...geracao.pronto, musica } : null);
  const [erro, setErro] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoResumo[] | null>(null);
  const [apagandoVideos, setApagandoVideos] = useState(false);
  /** Qual estilo está com a janelinha de demonstração aberta (pedido dele em 10/10/2026). */
  const [demo, setDemo] = useState<EstiloDemo | null>(null);
  const relogioDemo = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A janelinha com os recursos da Mesa de edição (pedido dele em 12/10/2026). */
  const [mostrarMesa, setMostrarMesa] = useState(false);
  const relogioMesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A cor que a tela final vai ter de fato: a escolhida, ou a da marca, ou o índigo. */
  // (definida logo abaixo de `marca`, que é de onde vem o padrão)
  /** Personalizar a tela final (pedido dele em 12/10/2026): cor e frase, com prévia. */
  const [personalizarFim, setPersonalizarFim] = useState(false);
  /** `null` = usar a cor da MARCA. Guardar null em vez de copiar a cor mantém o vídeo
   *  acompanhando a marca se ela mudar depois. */
  const [telaFinalCor, setTelaFinalCor] = useState<string | null>(null);
  const [marca, setMarca] = useState<{ logoUrl: string | null; cor: string | null; nome: string; creci: string; whatsapp: string; fundoVale: boolean } | null>(null);
  const [limpandoLogo, setLimpandoLogo] = useState(false);
  const corDaTelaFinal = telaFinalCor ?? marca?.cor ?? "#0F2D5B";

  const espec: EspecVideo = useMemo(
    () => ({
      formato,
      cenas: cenas.map((s) => ({ tipo: s.tipo, jobId: s.jobId, arquivo: s.arquivo, efeito: s.efeito, animacao: s.animacao, movimento: s.movimento, legenda: s.legenda || undefined, duracao: s.duracao, melhorar: s.melhorar })),
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
      telaFinalCor: telaFinal && telaFinalCor ? telaFinalCor : undefined,
      transicao,
      capa: Math.max(0, cenas.findIndex((s) => s.chave === capa)),
    }),
    [formato, cenas, musica, musicaVolume, narrar, origemVoz, roteiro, voz, vozArquivo, vozVolume, vozInicio, titulo, preco, local, telaFinal, chamada, telaFinalCor, transicao, capa]
  );
  // Resumo dos ajustes em uma linha: quem não abriu ainda vê o que está valendo.
  const resumoDosAjustes = [
    FORMATOS.find((f) => f.id === formato)?.rotulo ?? formato,
    MUSICAS.find((m) => m.id === musica)?.rotulo ?? musica,
    transicao === "corte" ? "corte seco" : "transição suave",
    titulo ? `“${titulo}”` : null,
    espec.narracao ? (vozDeIA(espec.narracao) ? `narrado (${VOZES.find((v) => v.id === voz)?.rotulo ?? voz})` : "com a sua voz") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Cena animada reaberta de um vídeo pronto, com o mesmo movimento e duração: o clipe já
  // existe e o servidor não cobra (ele confere por conta própria; isto só mostra a conta).
  const animadasGratis = cenas.filter((s) => s.tipo === "animada" && s.animacaoGuardada && s.animacaoGuardada.animacao === s.animacao && s.animacaoGuardada.duracao === s.duracao).length;
  // O PREÇO QUE O SERVIDOR VAI COBRAR, e não o que a tela consegue adivinhar sozinha.
  //
  // A conta local só enxerga clipe guardado quando o vídeo foi REABERTO -- é de lá que vem
  // `animacaoGuardada`. Escolhendo fotos da galeria ela não tem como saber, e em 24/09/2026
  // isso fez o botão prometer 8 créditos num vídeo que o servidor cobrou 4: duas das quatro
  // cenas animadas já tinham clipe dos testes do mesmo dia.
  //
  // Cobrar menos do que promete é o erro de preço que ninguém reclama -- e por isso ninguém
  // descobre. Mas quem olha o preço cheio e desiste, desiste de um vídeo mais barato.
  const custoLocal = Math.max(0, custoDoVideo(espec) - animadasGratis * CREDITOS.animada);
  const esperaTotal = esperaEmSegundos(espec.cenas.map((c) => ({ tipo: c.tipo, duracao: c.duracao ?? 4 })));
  const duracao = duracaoEstimada(espec);

  // PERGUNTAR O PRECO AO SERVIDOR quando o conjunto de cenas ANIMADAS muda.
  //
  // A assinatura e o que o servidor usa pra achar clipe guardado: quais cenas sao animadas,
  // de qual foto, com qual movimento, por quanto tempo, em qual formato. Trocar o titulo ou
  // a musica nao muda preco nenhum, entao nao pergunta.
  const assinaturaAnimadas = useMemo(
    () =>
      espec.cenas
        .map((c, k) => (c.tipo === "animada" ? `${k}:${c.jobId ?? c.arquivo ?? ""}:${c.animacao}:${c.duracao}` : ""))
        .filter(Boolean)
        .join("|") + `@${espec.formato}`,
    [espec]
  );
  // O espec vive num ref pra este efeito nao depender dele: dependendo, cada tecla digitada
  // no titulo dispararia uma consulta de preco que nao mudou.
  const especRef = useRef(espec);
  useEffect(() => {
    especRef.current = espec;
  }, [espec]);
  useEffect(() => {
    if (!user || !assinaturaAnimadas.includes(":")) return;
    let vivo = true;
    const relogio = setTimeout(async () => {
      try {
        const r = await fetch("/api/video/preco", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ espec: especRef.current }),
        });
        const d = await r.json();
        // Falhar aqui nao pode atrapalhar: sem resposta, vale a conta local, que e a de antes.
        if (vivo && r.ok && typeof d.custo === "number") setPrecoDoServidor({ assinatura: assinaturaAnimadas, custo: d.custo, gratis: Array.isArray(d.gratis) ? d.gratis : [] });
      } catch {
        /* o preco local continua valendo */
      }
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(relogio);
    };
  }, [assinaturaAnimadas, user, token]);

  const precoConferido = precoDoServidor?.assinatura === assinaturaAnimadas ? precoDoServidor : null;
  const custo = precoConferido ? precoConferido.custo : custoLocal;
  /**
   * As cenas cujo clipe da IA JÁ existe -- essas não geram de novo e não cobram.
   *
   * Pedido dele em 24/09/2026: "a última cena ficou ruim, existe uma forma de editar apenas
   * essa cena sem precisar gerar o vídeo inteiro novamente? [...] algo pra a pessoa ver que é
   * possível ajustar, bem interativo de fácil observação".
   *
   * O sistema JÁ fazia isso: o clipe é guardado por foto + movimento + duração + formato, e
   * mudar uma cena só invalida a dela. O que faltava era inteiramente a tela DIZER -- sem
   * isso, quem trocasse o movimento da última cena olharia o preço cheio e concluiria que ia
   * pagar o vídeo inteiro de novo.
   */
  const cenasProntas = new Set(precoConferido?.gratis ?? []);

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

  // A MARCA, pra prévia da tela final poder mostrar o logo e o contato DE VERDADE.
  // Falhar aqui não atrapalha nada: sem marca a prévia usa o índigo e some o que não tem.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/marca", { headers: { Authorization: `Bearer ${await token()}` } });
        const d = await r.json();
        if (vivo && r.ok) setMarca({ logoUrl: d.logoUrl ?? null, cor: d.cor ?? null, nome: d.nome ?? "", creci: d.creci ?? "", whatsapp: d.whatsapp ?? "", fundoVale: !!d.fundo?.vale });
      } catch {
        // sem marca a tela final sai no padrão, como sempre saiu
      }
    })();
    return () => {
      vivo = false;
    };
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
    // `?imovel=`: vem do botão "Fazer vídeo" da página do imóvel, com ele já escolhido.
    const imovelDaUrl = params.get("imovel");
    if (imovelDaUrl && /^[0-9a-f-]{36}$/.test(imovelDaUrl) && jobDaUrl.current !== `imovel:${imovelDaUrl}`) {
      jobDaUrl.current = `imovel:${imovelDaUrl}`;
      setImovelId((atual) => atual ?? imovelDaUrl);
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
        setPreco((atual) => atual || valorComPeriodo(d.imovel.ficha?.preco, d.imovel.ficha?.negocio));
        setFichaResumo(resumoDaFicha(d.imovel.ficha, LIMITES.legendaMax));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, imovelId, token]);

  /**
   * A cena recém-criada já nasce no estilo escolhido.
   *
   * Sem isto, mandar UMA foto com o Tour ligado daria uma cena parada: quem aplicava o
   * estilo era a montagem automática, e ela só roda a partir de duas fotos. O estilo
   * escrito na tela e o que está na cena têm que ser a mesma coisa em qualquer caminho.
   */
  function nascerNoEstilo(nova: CenaUI): CenaUI {
    const animavel = !nova.ehClipe && !nova.eh360 && !nova.ehPanoramica;
    return estilo === "tour" && animavel ? { ...nova, tipo: "animada" as const, duracao: 4 } : nova;
  }

  function adicionarGeracao(g: Geracao) {
    setCenas((lista) => [
      ...lista,
      nascerNoEstilo({
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
      }),
    ]);
    // ESCOLHER DA GALERIA TAMBÉM MONTA SOZINHO. O envio já fazia; escolher uma a uma,
    // não -- e é esse o caminho de quem já tem as fotos guardadas no imóvel, que passou
    // a ser a maioria. Espera 1,2 s parado pra não reordenar no meio da escolha.
    if (relogioDaMontagem.current) clearTimeout(relogioDaMontagem.current);
    relogioDaMontagem.current = setTimeout(() => {
      const lista = cenasRef.current;
      if (estilo !== "meu" && lista.length > 1 && !montagem) void montarSozinho(lista);
    }, 1200);
  }

  async function enviarArquivos(arquivos: FileList | null) {
    if (!arquivos || !supabase) return;
    setErro(null);
    // A lista de verdade, acumulada aqui: `cenas` do closure não anda durante o envio.
    const juntas: CenaUI[] = [...cenas];
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
        // A FOTO PASSA A EXISTIR. Antes ela subia, servia pra renderizar aquele vídeo e
        // sumia: o imóvel dele tinha 3 vídeos e ZERO fotos, e a tela dizia "este imóvel
        // ainda não tem fotos prontas" com razão. Agora vira foto do imóvel, como já
        // acontece na tela de Materiais -- sem crédito e sem selo.
        //
        // Não trava o envio: se falhar, a cena entra do mesmo jeito e o vídeo sai. Perder o
        // registro é chato; perder o vídeo por causa do registro seria pior.
        const ch = chave();
        // O id volta pra cena ANTES dela existir: é por ele que o "Montar sozinho" pergunta o
        // que a foto é, e a montagem automática roda logo depois do envio -- se o id chegasse
        // atrasado, ela olharia uma lista sem identificação. Se o registro falhar, `undefined`
        // e a cena entra assim mesmo: perder o vídeo por causa do registro seria pior.
        let jobIdDaFoto: string | undefined;
        if (!ehVideo) {
          jobIdDaFoto = await fetch("/api/video/registrar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
            body: JSON.stringify({ caminho: d.caminho, imovelId, nome: f.name }),
          })
            .then((r) => r.json())
            .then((reg) => reg?.jobId as string | undefined)
            .catch(() => undefined);
        }
        const formato = ehVideo ? "comum" : await formatoDaFoto(f);
        const eh360 = formato === "esferica";
        const ehPanoramica = formato === "panoramica";
        const nova: CenaUI = nascerNoEstilo({
            chave: ch,
            jobId: jobIdDaFoto,
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
        });
        juntas.push(nova);
        setCenas((lista) => [...lista, nova]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha no envio.");
      } finally {
        setEnviando((n) => n - 1);
      }
    }

    // MONTA SOZINHO ASSIM QUE AS FOTOS ENTRAM. Ele pediu duas vezes: "deixar isso já
    // automático" e "quando for gerar o vídeo gerar algo padrão". Mandar dez fotos e
    // receber dez cenas na ordem do celular, todas com o mesmo movimento, é deixar o
    // trabalho pra ele -- e era isso que fazia o vídeo do concorrente parecer melhor
    // já na primeira tela.
    //
    // Só quando ele NÃO mexeu ainda: se já arrastou ou já montou, a máquina não passa
    // por cima. E o aviso com "desfazer" continua aparecendo, porque montagem que
    // acontece sozinha e em silêncio é a que assusta.
    if (estilo !== "meu" && juntas.length > 1 && !montagem) await montarSozinho(juntas);
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
  /**
   * Apaga a foto de vez: sai do banco e do armazenamento. Sem volta, por isso os dois toques.
   *
   * Se ela estiver dentro de um book, o servidor recusa na primeira vez e diz em quais --
   * aí a tela pergunta antes de insistir, em vez de estragar o book calada.
   */
  async function apagarFoto(id: string) {
    setApagandoAgora(true);
    setErro(null);
    try {
      const enviar = (forcar: boolean) =>
        fetch("/api/materiais/apagar", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAtual}` },
          body: JSON.stringify({ ids: [id], forcar }),
        });
      const tokenAtual = await token();
      let r = await enviar(false);
      if (r.status === 409) {
        const d = await r.json();
        const onde = Array.isArray(d.books) ? d.books.map((b: { titulo?: string }) => b.titulo ?? "material").join(", ") : "";
        if (!confirm(`Esta foto está em ${onde || "um material"}. Apagar mesmo assim deixa aquelas páginas sem a imagem.`)) return;
        r = await enviar(true);
      }
      if (!r.ok) throw new Error((await r.json()).error ?? "Não consegui apagar.");
      // Sai da galeria E das cenas: cena apontando pra foto que não existe mais não gera.
      setGeracoes((lista) => lista.filter((g) => g.id !== id));
      setCenas((lista) => lista.filter((s) => s.jobId !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui apagar.");
    } finally {
      setApagando(null);
      setApagandoAgora(false);
    }
  }

  /**
   * Trocar de estilo mexe nas CENAS na hora, não só numa variável.
   *
   * "Tour pela casa" é o que ele estava pedindo desde o começo e eu não entendi: no vídeo do
   * concorrente a câmera ANDA pelo cômodo -- a porta abre em profundidade, a janela gira --
   * e isso não é zoom numa foto parada, é a IA movendo a câmera. O Encena já tinha
   * ("Mover a câmera"), mas o automático nunca usava porque custa crédito. Agora é uma
   * escolha, com o preço à vista no próprio botão de gerar.
   *
   * Clipe, 360 e panorâmica ficam fora: já têm movimento próprio, e animar não faria sentido.
   */
  function aplicarEstilo(novo: "recomendado" | "tour" | "meu") {
    setEstilo(novo);
    if (novo === "meu") {
      setMexendo(true);
      return;
    }
    const animavel = (s: CenaUI) => !s.ehClipe && !s.eh360 && !s.ehPanoramica;
    setCenas((lista) =>
      lista.map((s) =>
        !animavel(s)
          ? s
          : novo === "tour"
            // Só o TIPO muda, e só nas cenas que a montagem marcou pra câmera. `animacao` e
            // `duracao` não entram aqui de propósito: quem escolheu a direção foi a montagem,
            // olhando o ambiente, e quem escolheu o tempo foi a posição. Fixar valores aqui
            // desfazia as duas coisas a cada toque no botão de estilo.
            //
            // `?? true` é pra cena que nunca passou pela montagem -- uma foto só, por exemplo.
            // Nesse caso ela É a capa, e a capa sempre ganha câmera.
            ? (s.camera ?? true)
              ? { ...s, tipo: "animada" as const, duracao: Math.min(5, Math.max(3, s.duracao)) }
              : { ...s, tipo: "foto" as const }
            : { ...s, tipo: "foto" as const }
      )
    );
  }

  /**
   * MONTAR SOZINHO: olha as fotos e decide a ordem, a capa, a legenda e o movimento.
   *
   * A IA só diz o QUE É cada foto (ambiente, nota, legenda curta); quem decide é a regra em
   * lib/video-automatico.ts. Se a decisão fosse da IA, o mesmo conjunto daria uma ordem hoje
   * e outra amanhã, e o corretor veria o vídeo mudar sem ter mexido em nada.
   *
   * Nunca perde o que a pessoa fez: guarda a lista de antes e oferece desfazer.
   */
  async function montarSozinho(lista?: CenaUI[]) {
    // A lista vem por parâmetro quando quem chama acabou de mexer nela: depois de um
    // `await`, o `cenas` deste closure ainda é o do render anterior, e montar a partir
    // dele montaria uma lista que não existe mais.
    const cenasAgora = lista ?? cenas;
    if (cenasAgora.length === 0 || montando) return;
    setMontando(true);
    setErro(null);
    const antes = cenasAgora;
    try {
      const comId = cenasAgora.filter((s) => s.jobId);
      let olhadas: { jobId: string; ambiente: string | null; qualidade: number; legenda: string }[] = [];
      if (comId.length > 0) {
        const r = await fetch("/api/video/montar", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ jobIds: comId.map((s) => s.jobId) }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "não consegui olhar as fotos");
        olhadas = d.olhadas ?? [];
      }
      const porJob = new Map(olhadas.map((o) => [o.jobId, o]));
      // Cena sem análise (clipe, ou foto que a visão não alcançou) entra do mesmo jeito: fica
      // no meio da ordem e mantém o movimento que já tinha.
      const entrada: Olhada[] = cenasAgora.map((s) => {
        const o = s.jobId ? porJob.get(s.jobId) : undefined;
        return {
          chave: s.chave,
          ambiente: o?.ambiente ?? null,
          qualidade: o?.qualidade ?? 5,
          legenda: o?.legenda ?? "",
          ehPanoramica: s.ehPanoramica,
          eh360: s.eh360,
          ehClipe: s.ehClipe,
        };
      });
      const s = sugerirMontagem(entrada, LIMITES.duracaoPadrao);
      const porChave = new Map(cenasAgora.map((c) => [c.chave, c]));
      const ajustes = new Map(s.cenas.map((c) => [c.chave, c]));
      setCenas(
        s.ordem.map((k) => {
          const base = porChave.get(k)!;
          const a = ajustes.get(k);
          const arrumada = a ? { ...base, legenda: base.legenda || a.legenda, efeito: a.efeito, animacao: a.animacao, duracao: a.duracao, motivo: a.motivo, camera: a.camera } : base;
          // O estilo vale também pras cenas que a montagem acabou de organizar: escolher
          // "Tour" e DEPOIS mandar as fotos tem que dar o mesmo resultado que o contrário.
          const animavel = !arrumada.ehClipe && !arrumada.eh360 && !arrumada.ehPanoramica;
          // A CÂMERA SÓ VAI NAS QUE VALEM. A animação veio do ambiente, a duração veio da
          // posição, e agora o direito à câmera vem da montagem também: no Tour de dez fotos
          // são quatro cenas animadas e seis com movimento na foto, não dez animadas.
          //
          // As duas pontas são escritas de propósito. A cena NASCE animada (nascerNoEstilo,
          // que é o que faz uma foto só já entrar com câmera), então deixar a que não ganhou
          // câmera "como estava" a mantinha animada -- e o vídeo saía todo caro do mesmo
          // jeito, com a tela dizendo o contrário.
          if (!(estilo === "tour" && animavel)) return arrumada;
          return (arrumada.camera ?? true) ? { ...arrumada, tipo: "animada" as const } : { ...arrumada, tipo: "foto" as const };
        })
      );
      if (s.capa) setCapa(s.capa);
      const nomeDe = (k: string) => porChave.get(k)?.rotulo ?? "foto";
      setMontagem({
        antes,
        quantas: s.ordem.length,
        fora: s.fora.map((f) => `${nomeDe(f.chave)} — ${f.motivo}`),
        semOlhar: comId.length === 0 || olhadas.length === 0,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui montar agora.");
    } finally {
      setMontando(false);
    }
  }

  /** Tira de uma posição e põe em outra — o que o arraste faz, e as setas não sabiam fazer. */
  function reordenar(de: number, para: number) {
    setCenas((lista) => {
      if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return lista;
      const nova = [...lista];
      const [movida] = nova.splice(de, 1);
      nova.splice(para, 0, movida);
      return nova;
    });
  }
  // Arrastar pela alça: a ordem das cenas é a ordem do vídeo, e mexer nela com duas setas
  // custa um toque por posição. Com oito cenas, levar a última pro topo eram sete toques.
  const arraste = useArrastarLista(cenas.map((s) => s.chave), reordenar);

  function remover(k: string) {
    setCenas((lista) => lista.filter((s) => s.chave !== k));
  }
  function duplicar(k: string) {
    setCenas((lista) => {
      const i = lista.findIndex((s) => s.chave === k);
      if (i < 0) return lista;
      return [...lista.slice(0, i + 1), { ...lista[i], chave: chave() }, ...lista.slice(i + 1)];
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

  async function gerar() {
    if (cenas.length === 0 || gerando) return;
    setErro(null);
    setResultado(null);
    geracao.limpar();
    setPedindo(true);
    try {
      const t = await token();
      const r = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ imovelId, espec }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Nao consegui iniciar o video.");
      c.recarregar();
      // Daqui em diante quem acompanha e o provedor do layout raiz: a geracao sobrevive a
      // sair desta tela.
      geracao.acompanhar(d.videoId as string, token);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      c.recarregar();
    } finally {
      setPedindo(false);
    }
  }

  /**
   * RETOMAR UM VIDEO QUE FICOU PARADO.
   *
   * Nao recomeca: continua. Cada etapa concluida esta guardada no servidor, e o credito foi
   * cobrado no pedido -- entao continuar nao cobra de novo. E e o unico jeito de um video
   * abandonado acabar: quem estorna o credito de um video que estourou o prazo e o servidor,
   * na consulta. Sem ninguem consultar, ele fica parado pra sempre e o credito nao volta.
   */
  function retomarVideo(v: VideoResumo) {
    if (gerando || v.status !== "gerando") return;
    setErro(null);
    setResultado(null);
    geracao.limpar();
    geracao.acompanhar(v.id, token);
  }

  /**
   * Trocar a trilha do video que ja esta pronto, sem refazer nada.
   *
   * Recarrega o `src` com um parametro novo de proposito: o arquivo foi gravado no MESMO
   * caminho (pro link ja compartilhado continuar valendo), e sem mudar a URL o navegador
   * tocaria o que tem em cache -- a musica velha, com a tela dizendo que trocou.
   */
  async function trocarMusica() {
    if (!resultado || trocandoMusica) return;
    setTrocandoMusica(true);
    setErro(null);
    try {
      const r = await fetch(`/api/video/${resultado.videoId}/musica`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ musica: musicaDoPronto === "nenhuma" ? null : musicaDoPronto, volume: musicaVolume }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Nao consegui trocar a musica.");
      // Promove pra estado local: o resultado pode ter vindo do provedor, que nao guarda
      // musica nem tem por que guardar.
      setResultado({ ...resultado, musica: musicaDoPronto, url: `${d.url as string}${(d.url as string).includes("?") ? "&" : "?"}t=${Date.now()}` });
      geracao.limpar();
      carregarVideos().then(setVideos).catch(() => {});
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Nao consegui trocar a musica.");
    } finally {
      setTrocandoMusica(false);
    }
  }

  async function abrirVideo(v: VideoResumo) {
    if (v.status !== "concluido") return;
    const rr = await fetch(`/api/video/${v.id}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const dd = await rr.json();
    if (rr.ok && dd.status === "concluido") {
      const guardada = dd.espec?.musica;
      const musicaDele: MusicaId = MUSICAS.some((m) => m.id === guardada) ? (guardada as MusicaId) : "nenhuma";
      setResultado({ videoId: v.id, url: dd.url, miniatura: dd.miniatura, duracao: dd.duracao, avisos: dd.avisos ?? [], formato: dd.formato, musica: musicaDele });
      setMusicaDoPronto(musicaDele);
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
      // Resposta que não é JSON (500 do Next vem em HTML): `rr.json()` estouraria com
      // "Unexpected token '<'", que não diz nada a ninguém. Lê como texto e conta o que deu.
      const cru = await rr.text();
      let dd: { status?: string; espec?: unknown; error?: string; titulo?: string; edicao?: { imovelId?: string | null; cenas?: unknown; vozUrl?: string | null } };
      try {
        dd = JSON.parse(cru);
      } catch {
        throw new Error(`O servidor respondeu ${rr.status} sem JSON ao abrir este vídeo. Começo da resposta: ${cru.slice(0, 120)}`);
      }
      if (!rr.ok) throw new Error(dd.error ?? `O servidor recusou abrir este vídeo (${rr.status}).`);
      if (dd.status !== "concluido") throw new Error(dd.error ?? `Este vídeo está como "${dd.status ?? "sem status"}", e só dá pra editar vídeo concluído.`);
      if (!dd.espec) throw new Error("Este vídeo foi gravado sem a receita das cenas (espec), então não dá pra reabrir. Dá pra baixar e trocar a música normalmente.");
      const e = dd.espec as EspecVideo;
      // Vídeo com coisa que esta página não conhece (textos, peças, legendas, Você, cor,
      // cortes): abre no EDITOR. Reabrir aqui e gerar de novo apagava tudo isso calado.
      if (precisaDoEditor(e)) {
        router.replace(`/editor/video?editar=${encodeURIComponent(id)}`);
        return;
      }
      const novas = cenasDoEspec(e, (dd.edicao?.cenas ?? []) as EdicaoCena[]);
      setImovelId(dd.edicao?.imovelId ?? null);
      setCenas(novas);
      setFormato(e.formato);
      setMusica(e.musica);
      setTransicao(e.transicao ? ehTransicao(e.transicao) : "dissolver");
      setTitulo(e.titulo ?? "");
      setPreco(e.preco ?? "");
      setLocal(e.local ?? "");
      setTelaFinal(e.telaFinal !== false);
      setChamada(e.chamada ?? "");
      setTelaFinalCor(e.telaFinalCor ?? null);
      setMusicaVolume(e.musicaVolume ?? LIMITES.musicaVolumePadrao);
      setNarrar(!!e.narracao);
      setOrigemVoz(e.narracao?.origem ?? "ia");
      setRoteiro(e.narracao?.roteiro ?? "");
      setVoz(e.narracao?.voz ?? "laura");
      setVozVolume(e.narracao?.volume ?? 1);
      setVozInicio(e.narracao?.inicio ?? 0.7);
      // A voz própria volta tocável: o servidor assina a URL do arquivo junto do espec.
      setVozArquivo(e.narracao?.arquivo && dd.edicao?.vozUrl ? { caminho: e.narracao.arquivo, url: dd.edicao.vozUrl, nome: "Áudio deste vídeo" } : null);
      setCapa(novas[e.capa ?? 0]?.chave ?? null);
      setEditandoDe({ id, titulo: dd.titulo || e.titulo || "Vídeo" });
      // FECHA O CARTÃO PELAS DUAS PONTAS. `resultado` é derivado de DUAS origens
      // (`resultadoAberto ?? geracao.pronto`, lá em cima), e `setResultado(null)` só apaga a
      // primeira. Num vídeo recém-gerado o cartão vem da segunda, então ele CONTINUAVA na
      // tela: a edição abria de verdade, a página rolava pro topo, e a pessoa via o mesmo
      // cartão de antes -- "cliquei em Editar e não acontece nada" (relatado em 29/09/2026).
      // `gerar` e `retomarVideo` já limpavam as duas; só esta aqui esquecia.
      setResultado(null);
      geracao.limpar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui abrir o vídeo pra editar.");
      // O aviso de erro mora no TOPO da página; o cartão do vídeo pronto fica bem abaixo.
      // Sem rolar, quem clica em "Editar" olhando pro cartão não vê nada acontecer -- foi
      // exatamente o que o dono relatou em 29/09/2026 ("clico em editar e não acontece
      // nada"). O caminho que dá certo já rolava pro topo; o que falha, não.
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    setChamada(CHAMADAS[0]);
    setTelaFinalCor(null);
    setTelaFinal(true);
  }

  // AS FOTOS QUE A JANELINHA DE DEMONSTRAÇÃO USA: as DELE, quando já escolheu alguma.
  // "Como ficaria" com a foto do imóvel dele vale muito mais que com a nossa de exemplo --
  // e o componente cai nas de exemplo sozinho quando a lista vem vazia. Clipe e 360 ficam
  // de fora: o movimento demonstrado é o da FOTO.
  const fotosDaDemo = useMemo(
    () => cenas.filter((s) => !s.ehClipe && !s.eh360 && s.miniatura).map((s) => s.miniatura as string).slice(0, 2),
    [cenas]
  );

  // A MESMA ORDEM QUE A LISTA MOSTRA. O `sort` vivia dentro do JSX; marcar com Shift
  // precisa saber quem vem antes de quem, e "antes" é o que está NA TELA, não no estado.
  const videosOrdenados = useMemo(
    () => [...(videos ?? [])].sort((a, b) => Number(b.imovel?.id === imovelId) - Number(a.imovel?.id === imovelId)),
    [videos, imovelId]
  );
  const idsDosVideos = useMemo(() => videosOrdenados.map((v) => v.id), [videosOrdenados]);
  const selecaoVideos = usarSelecao(idsDosVideos);

  /**
   * Tira o fundo do logo GUARDADO (a mesma chamada de Minha marca) e recarrega a marca,
   * pra prévia da tela final mostrar o resultado na hora.
   *
   * Muda o logo, não este vídeo -- é o que o aviso ao lado do botão diz. A URL assinada é
   * a mesma de antes do corte, então o navegador serviria a imagem velha do cache: por isso
   * a resposta da própria chamada é que alimenta o estado, e não uma leitura nova.
   */
  async function tirarFundoDoLogo() {
    if (limpandoLogo) return;
    setLimpandoLogo(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("tirarFundo", "1");
      const r = await fetch("/api/marca", { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui tirar o fundo do logo.");
      // `fundoVale: false` de propósito, e não `!!d.fundo?.vale`: a resposta deste caminho
      // não traz veredito, e o logo que acabou de sair daqui está transparente -- oferecer
      // "tirar o fundo" de novo seria oferecer o que já foi feito.
      setMarca({ logoUrl: d.logoUrl ?? null, cor: d.cor ?? null, nome: d.nome ?? "", creci: d.creci ?? "", whatsapp: d.whatsapp ?? "", fundoVale: false });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui tirar o fundo do logo.");
    } finally {
      setLimpandoLogo(false);
    }
  }

  async function apagarVideo(id: string) {
    await fetch(`/api/video/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
    setVideos((lista) => (lista ?? []).filter((v) => v.id !== id));
    if (resultado?.videoId === id) setResultado(null);
  }

  /**
   * Apaga de uma vez os vídeos marcados -- e tira da tela SÓ os que o servidor confirmou.
   * O recado do lote conta o que ficou; sem ele, o que falhou reapareceria sem explicação.
   */
  async function apagarVideosMarcados() {
    const ids = selecaoVideos.marcados;
    if (ids.length === 0 || apagandoVideos) return;
    setApagandoVideos(true);
    setErro(null);
    try {
      const r = await apagarVideosEmLote(ids, await token());
      setVideos((lista) => (lista ?? []).filter((v) => !r.apagados.includes(v.id)));
      if (resultado?.videoId && r.apagados.includes(resultado.videoId)) setResultado(null);
      selecaoVideos.tirar(r.apagados);
      const recado = recadoDoLote(r);
      if (recado) setErro(recado);
      else selecaoVideos.desligar();
    } finally {
      setApagandoVideos(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para criar vídeos.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  const semSaldo = (c.conta.creditos ?? 0) < custo;
  const vertical = resultado ? resultado.formato === "9:16" || resultado.formato === "4:5" : false;
  /**
   * O nome com que o arquivo chega na pasta de downloads.
   *
   * Sem isto ele chega como o id do vídeo -- "d2f5e82b-f019-4f67-9967-784b3252e4eb.mp4" --, que
   * é o que os vídeos dele estavam virando. Com dez imóveis na pasta, nenhum deles é
   * reconhecível sem abrir um por um.
   */
  const nomeDoArquivo = `${(titulo || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "video"}.mp4`;
  /** `&download=` faz o armazenamento responder "attachment", que e o que o navegador obedece. */
  const urlParaBaixar = resultado ? `${resultado.url}${resultado.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nomeDoArquivo)}` : "";

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Vídeo do imóvel</h1>
          <p className="mt-1 text-sm text-neutral-500">Fotos viram um vídeo com movimento, música, seus textos e sua marca. Pronto pra Reels, Stories e WhatsApp.</p>
        </div>
        {/* A porta pro Editor: um botão, no alto, e só. Quem só quer o vídeo não precisa
            ler nada sobre ele; quem quer mais sabe onde clicar.
            Chamava-se "Editor completo". Ele em 10/10/2026: "esse nome estranho, queria que
            as pessoas entendessem melhor". "Completo" não diz o que tem lá dentro e ainda
            avisa que é coisa grande -- o contrário de convidar. "Mesa de edição" é termo de
            vídeo que o brasileiro reconhece, e a linha de baixo diz o que se faz nela. */}
        {/* A janelinha com os recursos é IRMÃ do link (o `<a>` não aceita painel dentro), e
            o invólucro é quem escuta o mouse: entrando no link ou na janelinha, ela fica. */}
        <div
          className="relative shrink-0"
          onMouseEnter={() => {
            if (relogioMesa.current) clearTimeout(relogioMesa.current);
            relogioMesa.current = setTimeout(() => setMostrarMesa(true), 180);
          }}
          onMouseLeave={() => {
            if (relogioMesa.current) clearTimeout(relogioMesa.current);
            setMostrarMesa(false);
          }}
        >
          <Link
            href={imovelId ? `/editor/video?imovel=${imovelId}` : "/editor/video"}
            title="Você narrando ou aparecendo, legenda automática, seus clipes, música, ficha do imóvel e corte fino"
            onFocus={() => setMostrarMesa(true)}
            onBlur={() => setMostrarMesa(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-neutral-400"
          >
            <Icone nome="magica" className="h-4 w-4 shrink-0" />
            <span className="leading-tight">
              Mesa de edição
              {/* A linha dizia "seus vídeos, sua voz ou música, cortar e pôr texto". Ele:
                  "a pessoa pode gravar vídeo dela falando também, queria que mostrasse ali
                  os principais recursos". "Sua voz" se lia como MANDAR um áudio, e o que
                  mais convence -- você narrando ou aparecendo, gravado ali mesmo, sem
                  crédito -- não estava escrito. A lista inteira vai na janelinha; aqui fica
                  o que diferencia, porque no celular esta linha é tudo que a pessoa lê. */}
              <span className="block text-[11px] text-neutral-500">você narra ou aparece · corte, texto e música</span>
            </span>
          </Link>
          {mostrarMesa && <MesaRecursos />}
        </div>
      </div>

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {editandoDe && (
        <div className="mt-4">
          <Aviso tipo="info">
            Editando <strong>{editandoDe.titulo}</strong>. Gerar cria um vídeo novo — o atual continua em Seus vídeos. Cena animada que não mudou não custa de novo.{" "}
            <button type="button" onClick={comecarDoZero} className="underline">Começar do zero</button>
          </Aviso>
        </div>
      )}

      {resultado && (
        <Cartao className="mt-5">
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
                {/* BAIXA, não abre. Pedido dele em 24/09/2026: "qualquer vídeo que baixe é pra
                    aparecer naquela parte de downloads e baixar automaticamente, e não abrir
                    outra janela e a pessoa ter que ver como baixar".

                    O `download` do HTML sozinho não resolve: o navegador o IGNORA quando o
                    arquivo vem de outro domínio, e o nosso vem do armazenamento. Quem manda é
                    o servidor -- o `&download=` faz o Supabase responder com
                    `Content-Disposition: attachment`, e aí o navegador salva em vez de tocar.
                    Sem `target="_blank"` de propósito: com o cabeçalho certo, a página nem
                    navega, só aparece na barra de downloads. */}
                <a href={urlParaBaixar} download={nomeDoArquivo} className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                  <Icone nome="download" className="h-4 w-4" />
                  Baixar MP4
                </a>
                <Botao variante="secundaria" onClick={() => editarVideo(resultado.videoId)} title="Reabre as cenas e os ajustes deste vídeo. Gerar de novo cria outro vídeo.">
                  <Icone nome="editar_prompt" className="h-4 w-4" />
                  Editar
                </Botao>
                <Botao variante="discreta" onClick={() => setResultado(null)}>Fechar</Botao>
              </div>
              {/* TROCAR A MÚSICA COM O VÍDEO JÁ PRONTO. Pedido dele em 24/09/2026: "quero ter
                  opção de trocar música ou áudio do vídeo mesmo depois que o vídeo for feito,
                  até porque é algo simples".

                  É simples por um motivo técnico que vale a pena aproveitar: num mp4 a imagem
                  e o som são faixas separadas, então dá pra copiar a imagem byte a byte e
                  reescrever só o som. Leva segundos, não perde qualidade e não custa crédito
                  nenhum -- nem num vídeo cheio de cena animada. Refazer o vídeo pra ouvir
                  outra trilha seria minutos de fila de IA pra trocar uma faixa de áudio. */}
              <div className="mt-3 rounded-xl border border-neutral-200 p-3">
                <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Música</p>
                <OuvirMusica escolhida={musicaDoPronto} aoEscolher={setMusicaDoPronto} volume={musicaVolume} desligado={trocandoMusica} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Botao variante="secundaria" onClick={trocarMusica} disabled={trocandoMusica || musicaDoPronto === resultado.musica}>
                    {trocandoMusica ? "Trocando…" : "Trocar a música deste vídeo"}
                  </Botao>
                  {musicaDoPronto === resultado.musica && <span className="text-xs text-neutral-400">É a que está tocando.</span>}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Leva segundos e não gasta crédito: só a faixa de som é reescrita, a imagem fica intacta. O link que você já mandou passa a tocar a nova.
                </p>
              </div>
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
              <p className="mt-3 text-xs text-neutral-500">O arquivo vai direto pros seus downloads. No celular, toque em Baixar e depois em compartilhar pra mandar no WhatsApp ou postar no Instagram.</p>
            </div>
          </div>
        </Cartao>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* ---------- coluna das cenas ---------- */}
        <section className="flex flex-col gap-4 lg:col-span-7">
          <Cartao>
            <Rotulo>1 · O que entra no vídeo</Rotulo>
            <div className="flex flex-wrap items-center gap-3">
              <SeletorImovel token={token} valor={imovelId} onChange={setImovelId} disabled={gerando} />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400">
                <Icone nome="mais" className="h-4 w-4" />
                {enviando > 0 ? `Enviando ${enviando}…` : "Enviar fotos ou clipes"}
                <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple className="hidden" onChange={(e) => enviarArquivos(e.target.files)} disabled={gerando} />
              </label>
            </div>
            {/* O AVISO DO 360 MORA AQUI, e não lá embaixo perto da galeria.

                Ele perguntou por que o software fala em 360 e panorâmica se não dá pra usar.
                Dá -- mas só aparece DEPOIS de subir uma foto na proporção certa, e ninguém
                sobe uma foto que não sabe que serve. E o argumento que fechou a questão foi
                dele: "eu mesmo não sabia". Se o dono do produto não sabia, o corretor não vai
                descobrir sozinho.

                Então fica colado no botão de enviar, que é onde a pessoa decide O QUE mandar,
                e some assim que existe uma 360 na lista -- aí o aviso já cumpriu o papel. */}
            {!cenas.some((s) => s.eh360 || s.ehPanoramica) && (
              <p className="mt-2 text-xs text-neutral-500">
                Tem foto <strong className="font-medium text-neutral-700">360</strong> ou tirada no modo <strong className="font-medium text-neutral-700">Panorâmica</strong> do celular? Manda também: ela vira um passeio com a câmera andando por dentro, e não gasta crédito.
              </p>
            )}
            {imovelId && geracoes.length === 0 && <p className="mt-3 text-sm text-neutral-500">Este imóvel ainda não tem fotos prontas. Envie fotos ou edite algumas primeiro.</p>}
            {geracoes.length > 0 && (
              <>
                <p className="mt-3 text-xs text-neutral-500">Toque numa foto pra adicionar como cena. Fotos com original guardada podem virar &quot;antes e depois&quot;.</p>
                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {geracoes.map((g) => {
                    const usada = cenas.some((s) => s.jobId === g.id);
                    return (
                      <li key={g.id} className="group relative">
                        <button type="button" onClick={() => adicionarGeracao(g)} disabled={gerando} className={"relative block w-full overflow-hidden rounded-lg border-2 " + (usada ? "border-marca-coral" : "border-transparent hover:border-neutral-400")} title={g.acao}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.depois ?? ""} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                          {usada && <span className="absolute top-1 right-1 rounded-full bg-marca-coral px-1.5 text-[10px] font-semibold text-white">{cenas.filter((s) => s.jobId === g.id).length}×</span>}
                          {g.antes && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">antes/depois</span>}
                        </button>
                        {/* APAGAR AQUI. Dava pra apagar foto -- só que lá na Galeria, e ele
                            estava olhando as repetidas AQUI ("1jpg.jpg" e "1jpg (1).jpg").
                            Ir pra outra tela e voltar é o atrito.
                            Fora do <button> de propósito: dentro, tocar no × adicionaria a
                            cena junto. E em DOIS toques, porque apagar tira do banco e do
                            armazenamento -- não tem volta. */}
                        <button
                          type="button"
                          onClick={() => (apagando === g.id ? apagarFoto(g.id) : setApagando(g.id))}
                          onBlur={() => apagando === g.id && setApagando(null)}
                          disabled={gerando || apagandoAgora}
                          aria-label={apagando === g.id ? "Toque de novo pra apagar de vez" : "Apagar esta foto"}
                          title={apagando === g.id ? "Toque de novo pra apagar de vez" : "Apagar esta foto"}
                          className={
                            "absolute top-1 left-1 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold shadow transition disabled:opacity-40 " +
                            (apagando === g.id
                              ? "bg-red-600 text-white"
                              : "bg-black/45 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100")
                          }
                        >
                          {apagando === g.id ? "apagar?" : "×"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Cartao>

          <Cartao>
            {/* MONTAR SOZINHO EM PRIMEIRO LUGAR. Ele pediu que "aquele estilo de montagem e
                efeitos" fosse a primeira opção automática -- então o botão fica no alto das
                cenas, e não escondido num menu. Não custa crédito: olhar foto é visão, não
                geração, e foto já vista (por um book, por outro vídeo) volta de graça. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Rotulo>2 · Cenas, na ordem</Rotulo>
              {cenas.length > 1 && (
                <Botao onClick={() => montarSozinho()} disabled={montando || gerando} className="min-h-9 px-3 text-sm">
                  <Icone nome="magica" className="h-4 w-4" />
                  {montando ? "Olhando as fotos…" : "Montar sozinho"}
                </Botao>
              )}
            </div>
            {cenas.length > 1 && !montagem && !montando && (
              <p className="mt-1 mb-2 text-xs text-neutral-500">
                Põe na ordem da visita, escolhe a capa, escreve as legendas e dá movimento a cada foto. Sem crédito.
              </p>
            )}
            {/* O QUE ELE FEZ, dito em voz alta -- e com volta. Montagem automática que troca
                tudo em silêncio é montagem que a pessoa não confia na segunda vez. */}
            {montagem && (
              <div className="surgir mt-1 mb-2 rounded-xl border border-marca-teal/40 bg-marca-teal/5 px-3 py-2 text-sm">
                {/* DIZER QUANTAS FORAM OLHADAS, e não só quantas entraram. "Montei com 10
                    cenas" some com o trabalho: quem mandou 12 fotos não sabe se as outras
                    duas foram esquecidas ou recusadas. O número de partida é o que mostra
                    que houve escolha -- e é o que dá sentido à lista de recusadas embaixo. */}
                <p className="font-medium text-neutral-700">
                  Olhei as {montagem.quantas + montagem.fora.length} fotos e escolhi {montagem.quantas}, na ordem da visita.
                  {montagem.semOlhar && " (Não consegui olhar as fotos desta vez: mantive a ordem em que você mandou.)"}
                </p>
                {montagem.fora.length > 0 && (
                  /* Recolhidas: são a exceção, e uma lista aberta de recusas rouba a atenção
                     do roteiro, que é o que ele precisa conferir. Abre quem quiser saber. */
                  <details className="mt-1">
                    <summary className="min-h-7 cursor-pointer text-xs font-medium text-neutral-600">
                      {montagem.fora.length} {montagem.fora.length === 1 ? "foto não entrou" : "fotos não entraram"}
                    </summary>
                    <ul className="mt-1 ml-1 text-xs text-neutral-600">
                      {montagem.fora.map((f) => (
                        <li key={f}>· {f}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCenas(montagem.antes);
                    setMontagem(null);
                    setMexendo(true);
                  }}
                  className="mt-1 min-h-8 text-xs font-medium text-marca-indigo underline underline-offset-2"
                >
                  Desfazer e voltar como estava
                </button>
              </div>
            )}
            {cenas.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhuma cena ainda. Escolha um imóvel acima ou envie fotos.</p>
            ) : montagem && !mexendo ? (
              /* O SOFTWARE JÁ FEZ; ELE SÓ CONFERE. Pedido dele: "sinto que o UX conduz
                 primeiro o usuário a montar e decidir tudo por conta própria antes de gerar
                 -- quero o contrário". Depois da montagem automática, o que aparece é o
                 ROTEIRO pronto, em miniatura, e não os seis controles de cada cena. Quem
                 quiser mexer abre; quem só quer o vídeo, aperta Gerar e pronto. */
              <div>
                {/* O ROTEIRO MOSTRA O TRABALHO: posição, tempo, ambiente e POR QUÊ.
                    Antes era uma tira de miniaturas de 96px com uma legenda cortada -- dava
                    pra ver que algo tinha sido feito, não o que tinha sido decidido. A tela
                    do concorrente que ele mandou em 23/09/2026 declara foto por foto ("4s ·
                    Cozinha · Cozinha com bancada, ambiente social importante"), e é isso que
                    faz a montagem automática parecer trabalho em vez de sorte.
                    O motivo é escrito pela regra (lib/video-automatico.ts), não pela IA:
                    explicação que não bate com a decisão é pior que nenhuma. */}
                <ol className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3">
                  {cenas.map((s, i) => (
                    <li key={s.chave} className="rounded-lg border border-neutral-200 bg-white p-1.5">
                      <div className="relative overflow-hidden rounded">
                        {s.miniatura ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.miniatura} alt="" className="aspect-[4/3] w-full object-cover" />
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100">
                            <Icone nome="video" className="h-5 w-5 text-neutral-400" />
                          </div>
                        )}
                        <span className="absolute top-1 left-1 rounded bg-marca-indigo px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                        {/* O tempo de cada cena, à vista. É o que deixa o ritmo 4-4-4-3-3-3-3-4-4-4
                            visível em vez de escondido num campo que só aparece se abrir os detalhes. */}
                        <span className="absolute top-1 right-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">{s.duracao}s</span>
                        {(capa ?? cenas[0]?.chave) === s.chave && <span className="absolute bottom-1 left-1 rounded bg-marca-coral px-1.5 text-[9px] font-semibold text-white">capa</span>}
                        {/* CÂMERA ou ZOOM, dito nas duas. Mostrar o selo só nas animadas
                            deixaria as outras parecendo esquecidas; dizer nas duas mostra que
                            a mescla foi decidida -- e é onde ele vai conferir se a câmera cara
                            caiu nas fotos certas antes de gastar crédito. */}
                        <span className={"absolute right-1 bottom-1 rounded px-1.5 text-[9px] font-semibold " + (s.tipo === "animada" ? "bg-marca-indigo text-white" : "bg-white/90 text-neutral-500")}>
                          {s.tipo === "animada" ? "câmera" : "zoom"}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-neutral-700">{s.legenda || s.rotulo}</p>
                      {s.motivo && <p className="mt-0.5 text-[11px] leading-tight text-neutral-500">{s.motivo}</p>}
                    </li>
                  ))}
                </ol>
                {/* O total, porque é o número que decide se o vídeo serve pro Reels: a faixa
                    que o algoritmo empurra é de 15 a 30 s, e ninguém soma dez cenas de cabeça. */}
                <p className="mt-1.5 text-xs text-neutral-500">
                  {cenas.length} {cenas.length === 1 ? "cena" : "cenas"} · {Math.round(duracao)} s no total
                </p>
                <button
                  type="button"
                  onClick={() => setMexendo(true)}
                  disabled={gerando}
                  className="mt-1 min-h-9 text-sm font-medium text-marca-indigo underline underline-offset-2 disabled:opacity-40"
                >
                  Mexer na ordem e nos detalhes
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {cenas.map((s, i) => (
                  <li
                    key={s.chave}
                    ref={arraste.registrar(s.chave)}
                    className={
                      "relative rounded-xl border p-3 transition " +
                      (arraste.arrastando === s.chave ? "border-marca-coral bg-marca-pessego/20 opacity-60" : "border-neutral-200")
                    }
                  >
                    {/* Onde a cena vai cair. Sem esta linha, arrastar é adivinhação. */}
                    {arraste.arrastando && arraste.alvo === i && arraste.arrastando !== s.chave && (
                      <span className="pointer-events-none absolute -top-2 right-0 left-0 h-1 rounded-full bg-marca-coral" />
                    )}
                    {arraste.arrastando && arraste.alvo === cenas.length && i === cenas.length - 1 && arraste.arrastando !== s.chave && (
                      <span className="pointer-events-none absolute right-0 -bottom-2 left-0 h-1 rounded-full bg-marca-coral" />
                    )}
                    <div className="flex gap-3">
                      {/* A ALÇA. Arrastar a ficha inteira brigaria com a rolagem no celular;
                          por isso o gesto começa aqui, e só aqui. As setas continuam pra
                          quem prefere tocar, e pra quem usa teclado. */}
                      <button
                        type="button"
                        {...arraste.pegar(s.chave)}
                        disabled={gerando}
                        aria-label={`Arrastar a cena ${i + 1} para mudar a ordem`}
                        title="Segure e arraste para mudar a ordem"
                        className="-my-1 -ml-1 flex w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-500 active:cursor-grabbing disabled:opacity-30"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                          <circle cx="9" cy="6" r="1.6" />
                          <circle cx="15" cy="6" r="1.6" />
                          <circle cx="9" cy="12" r="1.6" />
                          <circle cx="15" cy="12" r="1.6" />
                          <circle cx="9" cy="18" r="1.6" />
                          <circle cx="15" cy="18" r="1.6" />
                        </svg>
                      </button>
                      <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                        {s.miniatura ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.miniatura} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icone nome="video" className="h-6 w-6 text-neutral-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {i + 1}. {s.rotulo}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => mover(s.chave, -1)} disabled={gerando || i === 0} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Subir">
                              <Icone nome="cima" className="h-4 w-4" />
                            </button>
                            <button onClick={() => mover(s.chave, 1)} disabled={gerando || i === cenas.length - 1} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Descer">
                              <Icone nome="baixo" className="h-4 w-4" />
                            </button>
                            <button onClick={() => duplicar(s.chave)} disabled={gerando || cenas.length >= LIMITES.cenasMax} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" title="Duplicar">
                              <Icone nome="copiar" className="h-4 w-4" />
                            </button>
                            <button onClick={() => remover(s.chave)} disabled={gerando} className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600" title="Remover">
                              <Icone nome="fechar" className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Chip ativo={(capa ?? cenas[0]?.chave) === s.chave} onClick={() => setCapa(s.chave)} title="A miniatura do vídeo (o que aparece antes do play) sai desta cena.">
                            ★ Capa
                          </Chip>
                          {s.tipo === "animada" && s.animacaoGuardada && s.animacaoGuardada.animacao === s.animacao && s.animacaoGuardada.duracao === s.duracao && (
                            <span className="rounded-full bg-marca-teal/15 px-2.5 py-1 text-xs font-medium text-marca-teal" title="O clipe desta animação já foi gerado num vídeo anterior. Com o mesmo movimento e duração, não custa de novo.">
                              animação já feita · grátis
                            </span>
                          )}
                          {s.ehPanoramica && (
                            <span
                              className="rounded-full bg-marca-teal/15 px-2.5 py-1 text-xs font-medium text-marca-teal"
                              title="Panorâmica não cabe parada no quadro do vídeo: mostrada assim, as pontas seriam cortadas. Já deixei no efeito que desliza."
                            >
                              panorâmica · deslizando
                            </span>
                          )}
                          {!s.ehClipe && !s.eh360 && (
                            <>
                              <Chip ativo={s.tipo === "foto"} onClick={() => mudarCena(s.chave, { tipo: "foto" })}>Foto</Chip>
                              {s.temAntes && <Chip ativo={s.tipo === "antes_depois"} onClick={() => mudarCena(s.chave, { tipo: "antes_depois" })}>Antes e depois</Chip>}
                              {/* O PREÇO DESTA CENA, e não o do vídeo. Pedido dele em 24/09/2026:
                                  "a última cena ficou ruim, existe uma forma de editar apenas essa
                                  cena sem gerar o vídeo inteiro? [...] algo pra a pessoa ver que é
                                  possível ajustar, bem interativo de fácil observação".

                                  O sistema já fazia: o clipe fica guardado por foto + movimento +
                                  duração + formato, então trocar o movimento de UMA cena invalida
                                  só a dela. Faltava a tela dizer -- sem isso, quem mexe numa cena
                                  olha o preço cheio e conclui que vai pagar o vídeo todo de novo. */}
                              <Chip
                                ativo={s.tipo === "animada"}
                                onClick={() => mudarCena(s.chave, { tipo: "animada" })}
                                title={
                                  cenasProntas.has(i)
                                    ? "Esta cena já foi gerada com este movimento e esta duração: o clipe está guardado e não cobra de novo. Mudar o movimento ou o tempo faz ela gerar outra vez."
                                    : `+${CREDITOS.animada} créditos. A câmera se move pelo ambiente.`
                                }
                              >
                                ✨ Mover a câmera {s.tipo === "animada" && cenasProntas.has(i) ? "· pronta" : `(+${CREDITOS.animada})`}
                              </Chip>
                            </>
                          )}
                          {s.eh360 && (
                            <>
                              <Chip ativo={s.tipo === "tour360"} onClick={() => mudarCena(s.chave, { tipo: "tour360", duracao: Math.max(s.duracao, 6) })} title="Sua foto 360 (ou panorâmica) vira passeio: a câmera anda dentro dela de verdade, sem IA e sem crédito.">🧭 Passear na sua 360</Chip>
                              <Chip ativo={s.tipo === "foto"} onClick={() => mudarCena(s.chave, { tipo: "foto" })}>Foto comum</Chip>
                            </>
                          )}
                          {s.ehClipe && (
                            <>
                              <Chip ativo={s.tipo === "clipe"} onClick={() => mudarCena(s.chave, { tipo: "clipe" })}>Clipe</Chip>
                              <Chip ativo={s.tipo === "tour360"} onClick={() => mudarCena(s.chave, { tipo: "tour360", duracao: Math.max(s.duracao, 6) })} title="Só pra foto ou vídeo de câmera 360">🧭 Passear na sua 360</Chip>
                              {s.tipo === "clipe" && (
                                <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                                  <input type="checkbox" checked={s.melhorar} onChange={(e) => mudarCena(s.chave, { melhorar: e.target.checked })} className="accent-marca-coral" />
                                  Melhorar cor e nitidez
                                </label>
                              )}
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {s.tipo === "foto" && (
                            <select value={s.efeito} onChange={(e) => mudarCena(s.chave, { efeito: e.target.value as EfeitoId })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" aria-label="Movimento">
                              {EFEITOS.map((e) => (
                                <option key={e.id} value={e.id}>{e.rotulo}</option>
                              ))}
                            </select>
                          )}
                          {s.tipo === "animada" && (
                            <select value={s.animacao} onChange={(e) => mudarCena(s.chave, { animacao: e.target.value as AnimacaoId })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" aria-label="Animação" title={ANIMACOES.find((a) => a.id === s.animacao)?.descricao}>
                              {animacoesOferecidas().map((a) => (
                                <option key={a.id} value={a.id}>{a.rotulo}</option>
                              ))}
                            </select>
                          )}
                          {/* O que vai sair, escrito, antes de gastar crédito. O nome do
                              movimento sozinho não diz o resultado -- foi o que fez
                              "Animar" e "Caminhar" serem entendidos errado.
                              Daqui saiu, em 12/10/2026, "só a câmera se move — o imóvel fica
                              como está, e não entra pessoa, bicho nem móvel novo; quanto
                              maior a duração, mais demora". Ele: "parece explicação que fiz
                              pra IA criar o recurso, não precisa disso pro usuário ler".
                              Ficou o que ele decide com: QUAL movimento e QUANTO espera. */}
                          {s.tipo === "animada" && (
                            <span className="basis-full text-[11px] leading-relaxed text-neutral-500">
                              {ANIMACOES.find((a) => a.id === s.animacao)?.descricao} Leva{" "}
                              <strong className="font-medium text-neutral-700">alguns minutos</strong>.
                            </span>
                          )}
                          {s.tipo === "tour360" && (
                            <select value={s.movimento} onChange={(e) => mudarCena(s.chave, { movimento: e.target.value as Movimento360Id })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" aria-label="Movimento da câmera 360" title={MOVIMENTOS_360.find((m) => m.id === s.movimento)?.descricao}>
                              {MOVIMENTOS_360.map((m) => (
                                <option key={m.id} value={m.id}>{m.rotulo}</option>
                              ))}
                            </select>
                          )}
                          <select value={s.duracao} onChange={(e) => mudarCena(s.chave, { duracao: Number(e.target.value) })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" aria-label="Duração">
                            {/* Cena animada para em 5s: 8s pedem 161 quadros ao modelo, o
                                máximo que ele aceita, e a espera passou de 8 minutos num
                                teste real. Tempo de espera é parte do preço. */}
                            {(s.tipo === "tour360" ? [4, 6, 8, 10] : s.tipo === "animada" ? [3, 4, 5] : [3, 4, 5, 6, 8]).map((d) => (
                              <option key={d} value={d}>{d} s</option>
                            ))}
                          </select>
                          <input type="text" value={s.legenda} onChange={(e) => mudarCena(s.chave, { legenda: e.target.value })} maxLength={LIMITES.legendaMax} placeholder="Legenda (ex.: Sala de estar · 32 m²)" className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm focus:border-marca-indigo focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </section>

        {/* ---------- coluna dos ajustes ----------

             Formato, música, textos e narração vivem FECHADOS aqui dentro.
             Eram quatro cartões abertos, 28 escolhas antes do botão de gerar, numa tela
             que ninguém terminava. Todos têm padrão que funciona: quem só quer o vídeo
             sobe as fotos e clica em gerar; quem quer mexer, abre. O resumo em uma linha
             mostra o que está valendo, pra ninguém precisar abrir só pra conferir. */}
        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <div className="mb-3 flex items-baseline justify-between text-sm">
              <span className="text-neutral-600">{cenas.length} {cenas.length === 1 ? "cena" : "cenas"} · ≈ {Math.round(duracao)} s</span>
              <span className="font-semibold text-marca-indigo">{custo === 0 ? "sem crédito" : `${custo} ${custo === 1 ? "crédito" : "créditos"}`}</span>
            </div>
            {/* O ESTILO, E O TOUR É O PADRÃO. Ele pediu duas vezes, e a segunda foi decisiva:
                primeiro "quero que já tenha uma opção de gerar que irá criar essa opção já
                como recomendada [...] e ser primeira opção de gerar vídeo, somente se a
                pessoa quiser mudar ela poderá"; depois, ao ver que o Recomendado é zoom
                sobre foto parada e nunca ia parecer com o vídeo que ele gostou, "quero que
                já fique então como tour, já padrão".

                O Tour custa crédito, e por isso o preço está no rótulo do botão E na linha
                de cima da coluna, atualizado a cada foto que entra: padrão que gasta tem que
                dizer quanto gasta ANTES, não na hora de gerar. */}
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Estilo</p>
              <div className="grid gap-2">
                {[
                  { id: "tour" as const, titulo: "Tour pela casa", dica: `A câmera anda pelo cômodo nas fotos que vendem; o resto ganha movimento na foto. ${CREDITOS.animada} créditos por cena com câmera.` },
                  { id: "recomendado" as const, titulo: "Movimento na foto", dica: "Ordem da visita e um movimento leve em cada foto. Sem crédito." },
                  { id: "meu" as const, titulo: "Do meu jeito", dica: "Nada é mexido: a ordem e os ajustes são seus" },
                ].map((o) => (
                  // A janelinha é IRMÃ do botão, não filha: `<button>` só aceita conteúdo
                  // de frase, e um painel inteiro dentro dele é HTML inválido (e o clique
                  // dentro da janela voltaria pro botão).
                  <div
                    key={o.id}
                    className="relative"
                    // Ele pediu a demonstração "assim que o cursor ficar em cima". Com um
                    // respiro de 180ms: sem ele, atravessar a coluna pra chegar no botão de
                    // gerar abre e fecha três janelinhas no caminho.
                    // "Do meu jeito" NÃO abre janelinha. Ele em 12/10/2026: "do meu jeito —
                    // não precisa ter janelinha de exemplo". É o estilo que não mexe em
                    // nada, então o exemplo seria a foto parada: uma janela que abre pra
                    // não mostrar nada ensina a ignorar as outras duas.
                    onMouseEnter={() => {
                      if (o.id === "meu") return;
                      if (relogioDemo.current) clearTimeout(relogioDemo.current);
                      relogioDemo.current = setTimeout(() => setDemo(o.id), 180);
                    }}
                    onMouseLeave={() => {
                      if (relogioDemo.current) clearTimeout(relogioDemo.current);
                      setDemo((d) => (d === o.id ? null : d));
                    }}
                  >
                    {demo === o.id && o.id !== "meu" && <DemoEstilo estilo={o.id} fotos={fotosDaDemo} />}
                    <button
                      type="button"
                      onClick={() => aplicarEstilo(o.id)}
                      disabled={gerando}
                      aria-pressed={estilo === o.id}
                      // Pelo teclado também: quem chega no botão tabulando vê o mesmo exemplo.
                      onFocus={() => o.id !== "meu" && setDemo(o.id)}
                      onBlur={() => setDemo((d) => (d === o.id ? null : d))}
                      className={
                        "w-full rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 " +
                        (estilo === o.id ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                      }
                    >
                      <span className="block text-sm font-medium">
                        {o.titulo}
                        {/* O selo acompanha o padrão de verdade (o `useState` lá em cima). Em
                            10/10/2026 o padrão passou de "tour" pra "recomendado"; o selo tem
                            que ir junto, senão a tela anuncia um padrão e o código usa outro. */}
                        {o.id === "recomendado" && <span className="ml-1 rounded-full bg-marca-teal/15 px-1.5 text-[10px] font-semibold text-marca-teal">padrão</span>}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">{o.dica}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* COMO TERMINA, aqui fora e não lá dentro. A opção já existia -- um quadradinho
                dentro de "Textos e marca", dentro dos Ajustes, que começam fechados -- e ele
                olhou o vídeo pronto e disse "não tem opção". Escolha que muda o vídeo inteiro
                não pode morar dois cliques abaixo do botão de gerar. O tempo estimado logo
                acima se mexe junto, então dá pra ver a diferença sem gerar nada. */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {[
                { on: true, titulo: "Com meu contato", dica: "Termina numa tela com nome, CRECI e WhatsApp" },
                { on: false, titulo: "Sem tela final", dica: "Acaba na última foto, sem despedida" },
              ].map((o) => (
                <button
                  key={String(o.on)}
                  type="button"
                  onClick={() => setTelaFinal(o.on)}
                  disabled={gerando}
                  aria-pressed={telaFinal === o.on}
                  className={
                    "rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 " +
                    (telaFinal === o.on ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                  }
                >
                  <span className="block text-sm font-medium">{o.titulo}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">{o.dica}</span>
                </button>
              ))}
            </div>

            {/* PERSONALIZAR A TELA FINAL, aqui e não dentro dos Ajustes.
                Ele: "ali no 'Com meu contato' e 'Sem tela final' poderia ter uma opção de
                personalizar esta tela? cores, logo, texto e etc".
                A frase JÁ dava pra trocar -- só que dentro dos Ajustes, o painel que ele
                mesmo não sabia que abria. A cor não dava de jeito nenhum: saía sempre a da
                marca. E faltava o principal: VER antes de gastar uma geração. */}
            {telaFinal && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setPersonalizarFim((v) => !v)}
                  aria-expanded={personalizarFim}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left transition hover:bg-neutral-50"
                >
                  <span className="text-[12.5px] font-medium text-neutral-700">Personalizar a tela final</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-marca-indigo">
                    {personalizarFim ? "Fechar" : "Cor, frase e logo"}
                    <Icone nome={personalizarFim ? "cima" : "baixo"} className="h-3.5 w-3.5" />
                  </span>
                </button>

                {personalizarFim && (
                  <div className="mt-2 flex gap-3 rounded-xl border border-neutral-200 p-3">
                    <TelaFinalPrevia
                      cor={corDaTelaFinal}
                      logoUrl={marca?.logoUrl ?? null}
                      chamada={chamada}
                      nome={marca?.nome ?? ""}
                      creci={marca?.creci ?? ""}
                      whatsapp={marca?.whatsapp ?? ""}
                      altura={230}
                    />
                    <div className="min-w-0 flex-1">
                      <Rotulo>Frase</Rotulo>
                      <div className="mb-1 flex flex-wrap gap-1.5">
                        {CHAMADAS.map((f) => (
                          <Chip key={f} ativo={chamada === f} onClick={() => setChamada(f)}>{f}</Chip>
                        ))}
                        <Chip ativo={chamada === ""} onClick={() => setChamada("")}>Sem frase</Chip>
                      </div>
                      <input
                        value={chamada}
                        onChange={(e) => setChamada(e.target.value)}
                        maxLength={LIMITES.chamadaMax}
                        placeholder="Ou escreva a sua"
                        aria-label="Frase da tela final"
                        className={campo}
                      />

                      <div className="mt-3">
                        <Rotulo>Cor do fundo</Rotulo>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* A cor da marca é a PRIMEIRA e é o padrão: quem não quiser
                              escolher nada continua recebendo o que sempre recebeu. */}
                          <button
                            type="button"
                            onClick={() => setTelaFinalCor(null)}
                            aria-pressed={telaFinalCor === null}
                            title="A cor da sua marca"
                            className={"h-7 w-7 rounded-full ring-2 ring-offset-2 transition " + (telaFinalCor === null ? "ring-marca-indigo" : "ring-transparent hover:ring-neutral-300")}
                            style={{ background: marca?.cor ?? "#0F2D5B" }}
                          />
                          <span className="mr-1 text-[10px] text-neutral-400">sua marca</span>
                          {CORES_TELA_FINAL.filter((x) => x.hex.toLowerCase() !== (marca?.cor ?? "").toLowerCase()).map((x) => (
                            <button
                              key={x.id}
                              type="button"
                              onClick={() => setTelaFinalCor(x.hex)}
                              aria-pressed={telaFinalCor === x.hex}
                              title={x.rotulo}
                              className={"h-7 w-7 rounded-full ring-2 ring-offset-2 transition " + (telaFinalCor === x.hex ? "ring-marca-indigo" : "ring-transparent hover:ring-neutral-300")}
                              style={{ background: x.hex }}
                            />
                          ))}
                          <label className="ml-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-neutral-500">
                            <input
                              type="color"
                              value={corDaTelaFinal}
                              onChange={(e) => setTelaFinalCor(e.target.value)}
                              aria-label="Escolher outra cor"
                              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                            />
                            outra
                          </label>
                        </div>
                      </div>

                      {/* TIRAR O FUNDO DO LOGO, AQUI -- porque é aqui que o problema aparece.
                          Ele olhou a prévia e disse: "poderia ter algo para tirar o fundo da
                          imagem nesta parte e não naquela primeira parte da logo".
                          A ferramenta já existia em Minha marca, e o logo dele precisava dela
                          (medido: 447x447, 0% transparente, fundo rgb(30,34,43) em 92% do
                          quadro) -- só que nada nunca o avisou disso. O erro não era o lugar
                          do botão: era ninguém contar que havia fundo pra tirar.

                          Mas o que ele aperta aqui muda o LOGO, não este vídeo. O mesmo
                          arquivo vai pra tela final, pra marca d'água das fotos e pros
                          materiais; um "sem fundo só neste vídeo" seriam duas versões da
                          marca dele circulando. Por isso o texto diz onde vale. */}
                      {marca?.fundoVale && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                          <p className="text-[11px] leading-tight text-amber-900">
                            O seu logo tem fundo, e ele vira esse quadrado na tela final e nas fotos. Dá pra tirar.
                          </p>
                          <button
                            type="button"
                            onClick={tirarFundoDoLogo}
                            disabled={limpandoLogo}
                            className="mt-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-[11.5px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                          >
                            {limpandoLogo ? "Tirando…" : "Tirar o fundo do logo"}
                          </button>
                          <p className="mt-1 text-[10px] text-amber-800/80">Vale pra todos os seus materiais, não só pra este vídeo.</p>
                        </div>
                      )}
                      {/* O LOGO NÃO SE TROCA AQUI. Ele é da marca e sai em todo material; um
                          logo "só deste vídeo" viraria duas marcas e nenhuma identidade. */}
                      <p className="mt-3 text-[11px] leading-tight text-neutral-500">
                        O logo e o contato vêm de{" "}
                        <Link href="/marca" className="text-marca-indigo underline">Minha marca</Link>
                        {marca && !marca.logoUrl ? " — você ainda não enviou um logo." : "."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* A sugestão está pronta: o botão deixa de ser "o fim de um trabalho" e passa
                a ser "o começo" -- é a inversão que ele pediu. */}
            {montagem && !gerando && (
              <p className="mb-2 text-center text-sm font-medium text-marca-teal">Sugestão pronta. É só gerar.</p>
            )}
            <Botao onClick={gerar} disabled={gerando || cenas.length === 0 || semSaldo || enviando > 0} className="w-full py-3 text-base">
              {gerando ? geracao.andamento?.mensagem ?? "Gerando…" : custo === 0 ? "Gerar vídeo · grátis" : `Gerar vídeo · ${custo} ${custo === 1 ? "crédito" : "créditos"}`}
            </Botao>
            {cenas.length === 0 && !gerando && (
              <p className="mt-2 text-center text-xs text-neutral-500">Envie as fotos ao lado. O resto já vem pronto.</p>
            )}
            {custo === 0 && !gerando && cenas.length > 0 && (
              <p className="mt-2 text-center text-xs text-neutral-500">Vídeo e tour 360 não gastam crédito. Só cena animada por IA ({CREDITOS.animada}) e narração ({CREDITOS.narracao}).</p>
            )}
            {/* QUANTAS CENAS JÁ ESTÃO PRONTAS. É a frase que transforma "posso mexer numa cena
                só?" em algo que a pessoa VÊ antes de mexer.

                Só aparece quando há o que dizer: sem cena pronta ela seria ruído, e com todas
                prontas o botão já diz "grátis", que é mais forte que qualquer explicação. */}
            {!gerando && cenasProntas.size > 0 && cenasProntas.size < cenas.filter((s) => s.tipo === "animada").length && (
              <p className="mt-2 rounded-lg bg-marca-teal/10 px-2.5 py-1.5 text-center text-xs text-neutral-600">
                <strong className="font-medium text-neutral-700">{cenasProntas.size} de {cenas.filter((s) => s.tipo === "animada").length} cenas com câmera já estão prontas.</strong>{" "}
                Só as que você mudou vão ser geradas de novo — o resto é reaproveitado.
              </p>
            )}
            {/* O TEMPO TÍPICO, ANTES de apertar. É aqui que o número da fórmula serve: como
                aviso de quanto costuma levar, pra ninguém ser pego de surpresa. Durante a
                geração ele some, porque lá vale o ritmo medido e não o palpite. */}
            {!gerando && cenas.length > 0 && (
              <p className="mt-1 text-center text-xs text-neutral-400">
                Costuma levar {esperaTotal <= 60 ? "menos de 1 min" : `cerca de ${Math.round(esperaTotal / 60)} min`}.
              </p>
            )}
            {geracao.andamento && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-marca-coral transition-all" style={{ width: `${Math.max(6, Math.round((geracao.andamento.feitas / Math.max(1, geracao.andamento.total)) * 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {/* "Mantenha esta aba aberta" era um pedido sem consequência dita. Agora diz
                      o que acontece se fechar E que dá pra voltar -- porque dá, e não saber
                      disso foi o que fez ele achar que tinha perdido o vídeo e os créditos. */}
                  {geracao.andamento.mensagem} Etapa {Math.min(geracao.andamento.feitas + 1, geracao.andamento.total)} de {geracao.andamento.total}. Pode ir usar o resto do Encena: o vídeo continua andando e aparece uma barrinha em qualquer tela. Só não feche a aba — aí ele pausa, e volta com um toque em “Seus vídeos”.
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {relogio(segundosGerando)} rodando
                  {geracao.andamento.restante !== null && ` · faltam ${falta(geracao.andamento.restante)}`}
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

          {/* ISTO NÃO PARECIA CLICÁVEL, e quem disse foi o dono: "a parte de ajustes abaixo
              fica muito escondido, eu mesmo não sabia que podia clicar ali onde aparecia o
              formato". Se ELE não sabia, ninguém sabe.

              Eram quatro ausências somadas, e nenhuma delas sozinha resolve:
                1. nenhum VERBO -- "Vertical · Elegante · transição suave" se lê como
                   status, igual a um rodapé que informa, não como menu que abre;
                2. nenhuma reação ao passar o mouse, então o cursor não descobria sozinho;
                3. a setinha era cinza-claro no canto, do tamanho de um enfeite;
                4. nada dizia o que havia ATRÁS, e ninguém abre o que não sabe que existe.
              Agora: pílula "Abrir"/"Fechar" com a seta dentro, fundo que responde ao mouse,
              e, fechado, a lista do que tem lá. */}
          <Cartao className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setAjustesAbertos((v) => !v)}
              aria-expanded={ajustesAbertos}
              title={ajustesAbertos ? "Fechar os ajustes" : "Abrir: formato, música, textos, tela final e sua marca"}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold tracking-wider text-neutral-500 uppercase">Ajustes</span>
                <span className="mt-0.5 block truncate text-sm text-neutral-700">{resumoDosAjustes}</span>
                {!ajustesAbertos && (
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-400">formato, música, textos, tela final e sua marca</span>
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                {ajustesAbertos ? "Fechar" : "Abrir"}
                <Icone nome={ajustesAbertos ? "cima" : "baixo"} className="h-3.5 w-3.5" />
              </span>
            </button>
          </Cartao>

          {/* Conteúdo dos ajustes: FILHO da mesma coluna, não outro item da grade -- como
              item separado ele caía na linha de baixo e abria um buraco que crescia junto
              com a coluna da esquerda. */}
          <div className={"flex-col gap-4 " + (ajustesAbertos ? "flex" : "hidden")}>
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

          <Cartao>
            <Rotulo>Música e transição</Rotulo>
            {/* Cada ficha tem o seu ▶: escolher trilha pelo NOME era escolher no escuro, e
                o corretor só ouvia o que pegou depois do vídeo pronto -- que custa crédito. */}
            <OuvirMusica escolhida={musica} aoEscolher={setMusica} volume={musicaVolume} desligado={gerando} />
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
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Transição:</span>
              <Chip ativo={transicao !== "corte"} onClick={() => setTransicao("dissolver")}>Suave</Chip>
              <Chip ativo={transicao === "corte"} onClick={() => setTransicao("corte")}>Corte</Chip>
            </div>
          </Cartao>

          <Cartao>
            <Rotulo>Textos e marca</Rotulo>
            <div className="grid gap-2">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={LIMITES.tituloMax} placeholder="Título (ex.: Apto 302 · Setor Bueno)" className={campo} />
              <div className="grid grid-cols-2 gap-2">
                <input value={preco} onChange={(e) => setPreco(e.target.value)} maxLength={30} placeholder="Preço (ex.: R$ 690.000)" className={campo} />
                <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={50} placeholder="Bairro · Cidade" className={campo} />
              </div>
              {/* O liga/desliga saiu daqui pro cartão do botão de gerar: escondido aqui, ele
                  não era achado. O que fica é o que só interessa a quem já quis a tela. */}
              {!telaFinal && <p className="text-xs text-neutral-500">A tela final está desligada — o vídeo acaba na última foto. Dá pra ligar ao lado do botão de gerar.</p>}
              {telaFinal && (
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-xs text-neutral-500">
                    Frase da tela final <span className="text-neutral-400">· com nome, CRECI, WhatsApp e logo de <Link href="/marca" className="underline">Minha marca</Link></span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {CHAMADAS.map((f) => (
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

          <Cartao>
            <Rotulo>Voz</Rotulo>
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

          </div>

          <Cartao>
            {/* ESCOLHEU O IMÓVEL, VEJA O QUE JÁ EXISTE DELE. Era uma lista de TODOS os
                vídeos, sem relação com o imóvel que a pessoa acabou de escolher -- ele
                perguntou: "não seria legal abrir já as coisas que já criei desse imóvel?".
                Os do imóvel escolhido sobem pro topo e ganham etiqueta; o resto continua
                embaixo, porque esconder o que ela tem seria trocar um problema por outro. */}
            <div className="flex items-baseline justify-between gap-2">
              <Rotulo>Seus vídeos</Rotulo>
              {imovelId && (videos ?? []).some((v) => v.imovel?.id === imovelId) && (
                <span className="text-xs text-neutral-500">
                  {(videos ?? []).filter((v) => v.imovel?.id === imovelId).length} deste imóvel
                </span>
              )}
            </div>
            {/* MARCAR VÁRIOS PRA APAGAR (pedido dele em 10/10/2026). Fora do modo é um link
                discreto; o botão vermelho só existe com algo marcado. */}
            {(videos ?? []).length > 0 && (
              <div className="mt-1 mb-2 flex items-center justify-between gap-2 text-xs">
                {selecaoVideos.ligada ? (
                  <>
                    <span className="text-neutral-500">
                      {selecaoVideos.marcados.length === 0 ? "Marque os vídeos" : `${selecaoVideos.marcados.length} marcado${selecaoVideos.marcados.length > 1 ? "s" : ""}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={selecaoVideos.marcarTodos} className="text-marca-indigo underline">Todos</button>
                      <button onClick={selecaoVideos.desligar} className="text-neutral-500 underline">Cancelar</button>
                      {selecaoVideos.marcados.length > 0 && (
                        <BotaoConfirma
                          pergunta={`Apagar ${selecaoVideos.marcados.length} ${selecaoVideos.marcados.length === 1 ? "vídeo" : "vídeos"}?`}
                          detalhe="Sai o arquivo montado e a miniatura. As fotos que entraram neles continuam em Materiais."
                          confirmar="Apagar"
                          aoConfirmar={apagarVideosMarcados}
                          disabled={apagandoVideos}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          <Icone nome="lixeira" className="h-3.5 w-3.5" />
                          {apagandoVideos ? "Apagando…" : `Apagar · ${selecaoVideos.marcados.length}`}
                        </BotaoConfirma>
                      )}
                    </span>
                  </>
                ) : (
                  <button onClick={selecaoVideos.ligar} className="ml-auto flex items-center gap-1.5 text-marca-indigo underline">
                    <Icone nome="check" className="h-3.5 w-3.5" />
                    Selecionar vários
                  </button>
                )}
              </div>
            )}
            {videos === null ? (
              <p className="text-sm text-neutral-500">Carregando…</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum ainda.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {videosOrdenados.map((v) => (
                  <li key={v.id} className={"flex items-center gap-3 py-2 " + (selecaoVideos.marcado(v.id) ? "bg-red-50/60" : "")}>
                    {selecaoVideos.ligada && (
                      <button
                        type="button"
                        onClick={(e) => selecaoVideos.alternar(v.id, e.shiftKey)}
                        aria-pressed={selecaoVideos.marcado(v.id)}
                        aria-label={selecaoVideos.marcado(v.id) ? `Desmarcar ${v.titulo}` : `Marcar ${v.titulo}`}
                        title="Com Shift, marca daqui até o último"
                        className={
                          "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition " +
                          (selecaoVideos.marcado(v.id) ? "border-red-600 bg-red-600 text-white" : "border-neutral-300 text-transparent hover:border-neutral-400")
                        }
                      >
                        <Icone nome="check" className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* O VÍDEO PARADO TEM QUE RESPONDER AO CLIQUE. Em 24/09/2026 ele
                        recarregou a página no meio de uma geração e o vídeo ficou aqui em
                        "gerando" pra sempre: "não é possível fazer nada, não abre e ao clicar
                        não acontece nada, e os créditos não foram devolvidos".

                        Não era travamento nenhum -- o vídeo só anda enquanto uma aba pergunta
                        por ele, e ninguém estava perguntando. Agora o clique retoma de onde
                        parou, e o texto diz isso em português antes de ele precisar descobrir. */}
                    <button
                      onClick={(e) => (selecaoVideos.ligada ? selecaoVideos.alternar(v.id, e.shiftKey) : v.status === "gerando" ? retomarVideo(v) : abrirVideo(v))}
                      disabled={!selecaoVideos.ligada && gerando && v.status === "gerando"}
                      className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 disabled:opacity-50"
                      title={selecaoVideos.ligada ? "Marcar ou desmarcar" : v.status === "gerando" ? "Continuar de onde parou" : "Abrir"}
                    >
                      {v.miniatura ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.miniatura} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icone nome={v.status === "gerando" ? "video" : "play"} className="h-5 w-5 text-neutral-400" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.titulo}</p>
                      <p className="text-xs text-neutral-500">
                        {dataCurta(v.criadoEm)} · {v.formato}
                        {v.duracao ? ` · ${Math.round(v.duracao)} s` : ""}
                        {v.status === "gerando" && (gerando ? " · continuando…" : <span className="font-medium text-marca-indigo"> · parou no meio — toque pra continuar</span>)}
                        {v.status === "falhou" && " · falhou"}
                        {imovelId && v.imovel?.id === imovelId && <span className="ml-1 rounded-full bg-marca-pessego/60 px-1.5 text-[10px] font-medium text-marca-indigo">deste imóvel</span>}
                      </p>
                    </div>
                    {/* Marcando, os botões de UM somem: duas lixeiras na mesma linha ao
                        mesmo tempo é onde o dedo erra. */}
                    {!selecaoVideos.ligada && v.status === "concluido" && (
                      <button onClick={() => editarVideo(v.id)} disabled={gerando} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-marca-indigo disabled:opacity-30" title="Editar: reabre as cenas e os ajustes">
                        <Icone nome="editar_prompt" className="h-4 w-4" />
                      </button>
                    )}
                    {!selecaoVideos.ligada && (
                      <BotaoConfirma
                        pergunta="Apagar este vídeo?"
                        detalhe="Sai o arquivo montado e a miniatura. As fotos que entraram nele continuam em Materiais."
                        aoConfirmar={() => apagarVideo(v.id)}
                        className="p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        title="Apagar"
                      >
                        <Icone nome="lixeira" className="h-4 w-4" />
                      </BotaoConfirma>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
