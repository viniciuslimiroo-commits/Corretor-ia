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
// e os Ajustes FECHADOS. Quem quer mexer mais tem o botão "Editor completo" no alto, que
// leva pra /editor/video com todas as ferramentas.
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
  BUCKET_UPLOADS,
  CHAMADAS,
  CREDITOS,
  EFEITOS,
  FORMATOS,
  LIMITES,
  MOVIMENTOS_360,
  MUSICAS,
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
import AppShell from "@/components/app-shell";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import OuvirMusica from "@/components/ouvir-musica";
import { sugerirMontagem, type Olhada } from "@/lib/video-automatico";
import { useArrastarLista } from "@/components/usar-arrastar-lista";
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

/** `imovel` a rota já mandava; faltava a tela saber que existe pra poder juntar por imóvel. */
type VideoResumo = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null; compartilhado: boolean; erro: string | null; imovel: { id: string; titulo: string } | null };

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
  const [musica, setMusica] = useState<MusicaId>("calma");
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
  /** O estilo da geração. "recomendado" é o padrão: a máquina arruma antes de gerar. */
  const [estilo, setEstilo] = useState<"recomendado" | "meu">("recomendado");
  /** A lista de agora, pro relógio da montagem automática não ler a de dois renders atrás. */
  const cenasRef = useRef<CenaUI[]>([]);
  const relogioDaMontagem = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O que o "Montar sozinho" fez da última vez, pra poder contar e desfazer. */
  const [montagem, setMontagem] = useState<{ antes: CenaUI[]; quantas: number; fora: string[]; semOlhar: boolean } | null>(null);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; mensagem: string } | null>(null);
  /** Segundos desde que a geração começou. Barra que anda sozinha não distingue
   *  "processando" de "travado" -- quem paga 2 créditos e olha isso por três minutos
   *  conclui que quebrou. O relógio e a estimativa fazem essa distinção. */
  const [segundosGerando, setSegundosGerando] = useState(0);

  // O relógio zera em `gerar()`, na hora do clique; aqui só se conta enquanto gera.
  // O ref acompanha a lista, e a sincronia vai em efeito: escrever ref durante o render é
  // proibido pelo compilador do React, e com razão -- ali o valor muda sem a tela saber.
  useEffect(() => {
    cenasRef.current = cenas;
  }, [cenas]);

  // Sair da página com a montagem agendada seria montar uma tela que não existe mais.
  useEffect(() => () => { if (relogioDaMontagem.current) clearTimeout(relogioDaMontagem.current); }, []);

  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => setSegundosGerando((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [gerando]);

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
      transicao,
      capa: Math.max(0, cenas.findIndex((s) => s.chave === capa)),
    }),
    [formato, cenas, musica, musicaVolume, narrar, origemVoz, roteiro, voz, vozArquivo, vozVolume, vozInicio, titulo, preco, local, telaFinal, chamada, transicao, capa]
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

  function adicionarGeracao(g: Geracao) {
    setCenas((lista) => [
      ...lista,
      {
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
      },
    ]);
    // ESCOLHER DA GALERIA TAMBÉM MONTA SOZINHO. O envio já fazia; escolher uma a uma,
    // não -- e é esse o caminho de quem já tem as fotos guardadas no imóvel, que passou
    // a ser a maioria. Espera 1,2 s parado pra não reordenar no meio da escolha.
    if (relogioDaMontagem.current) clearTimeout(relogioDaMontagem.current);
    relogioDaMontagem.current = setTimeout(() => {
      const lista = cenasRef.current;
      if (estilo === "recomendado" && lista.length > 1 && !montagem) void montarSozinho(lista);
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
        const nova: CenaUI = {
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
        };
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
    if (estilo === "recomendado" && juntas.length > 1 && !montagem) await montarSozinho(juntas);
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
          return a ? { ...base, legenda: base.legenda || a.legenda, efeito: a.efeito, duracao: a.duracao } : base;
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
        body: JSON.stringify({ imovelId, espec }),
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
    setChamada(CHAMADAS[0]);
    setTelaFinal(true);
  }

  async function apagarVideo(id: string) {
    await fetch(`/api/video/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
    setVideos((lista) => (lista ?? []).filter((v) => v.id !== id));
    if (resultado?.videoId === id) setResultado(null);
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

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Vídeo do imóvel</h1>
          <p className="mt-1 text-sm text-neutral-500">Fotos viram um vídeo com movimento, música, seus textos e sua marca. Pronto pra Reels, Stories e WhatsApp.</p>
        </div>
        {/* A porta pro Editor: um botão, no alto, e só. Quem só quer o vídeo não precisa
            ler nada sobre ele; quem quer mais sabe onde clicar. */}
        <Link
          href={imovelId ? `/editor/video?imovel=${imovelId}` : "/editor/video"}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm hover:border-neutral-400"
        >
          <Icone nome="magica" className="h-4 w-4" />
          Editor completo
        </Link>
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
                <p className="font-medium text-neutral-700">
                  Montei com {montagem.quantas} {montagem.quantas === 1 ? "cena" : "cenas"}, na ordem da visita.
                  {montagem.semOlhar && " (Não consegui olhar as fotos desta vez: mantive a ordem em que você mandou.)"}
                </p>
                {montagem.fora.length > 0 && (
                  <ul className="mt-1 text-xs text-neutral-600">
                    {montagem.fora.map((f) => (
                      <li key={f}>Fora: {f}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCenas(montagem.antes);
                    setMontagem(null);
                  }}
                  className="mt-1 min-h-8 text-xs font-medium text-marca-indigo underline underline-offset-2"
                >
                  Desfazer e voltar como estava
                </button>
              </div>
            )}
            {cenas.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhuma cena ainda. Escolha um imóvel acima ou envie fotos.</p>
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
                              <Chip
                                ativo={s.tipo === "animada"}
                                onClick={() => mudarCena(s.chave, { tipo: "animada" })}
                                title={`+${CREDITOS.animada} créditos. A IA move a CÂMERA pelo ambiente. Não entra pessoa, bicho nem móvel novo.`}
                              >
                                ✨ Mover a câmera (+{CREDITOS.animada})
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
                              <Chip ativo={s.tipo === "tour360"} onClick={() => mudarCena(s.chave, { tipo: "tour360", duracao: Math.max(s.duracao, 6) })} title="Só se o vídeo foi gravado com câmera 360 (equirretangular)">🧭 Passear na sua 360</Chip>
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
                              {ANIMACOES.map((a) => (
                                <option key={a.id} value={a.id}>{a.rotulo}</option>
                              ))}
                            </select>
                          )}
                          {/* O que vai sair, escrito, antes de gastar crédito. O nome do
                              movimento sozinho não diz o resultado -- foi o que fez
                              "Animar" e "Caminhar" serem entendidos errado. */}
                          {s.tipo === "animada" && (
                            <span className="basis-full text-[11px] leading-relaxed text-neutral-500">
                              {ANIMACOES.find((a) => a.id === s.animacao)?.descricao} <strong className="font-medium text-neutral-700">Só a câmera se move</strong> — o
                              imóvel fica como está, e não entra pessoa, bicho nem móvel novo. Leva{" "}
                              <strong className="font-medium text-neutral-700">alguns minutos</strong> pra ficar pronta: quanto maior a duração, mais demora.
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
            {/* O ESTILO, E O RECOMENDADO É O PADRÃO. Ele pediu com todas as letras: "quero que
                já tenha uma opção de gerar que irá criar essa opção já como recomendada [...]
                e ser primeira opção de gerar vídeo, somente se a pessoa quiser mudar ela
                poderá". A montagem automática já acontecia -- só que calada, e escolha que
                ninguém vê é escolha que ninguém sabe que tem. Aqui ela vira uma decisão de
                uma linha, ligada por padrão, e desligável. */}
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Estilo</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "recomendado" as const, titulo: "Recomendado", dica: "Ordem da visita, legendas e movimento escolhidos pra você" },
                  { id: "meu" as const, titulo: "Do meu jeito", dica: "Nada é mexido: a ordem e os ajustes são seus" },
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setEstilo(o.id)}
                    disabled={gerando}
                    aria-pressed={estilo === o.id}
                    className={
                      "rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 " +
                      (estilo === o.id ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                    }
                  >
                    <span className="block text-sm font-medium">
                      {o.titulo}
                      {o.id === "recomendado" && <span className="ml-1 rounded-full bg-marca-teal/15 px-1.5 text-[10px] font-semibold text-marca-teal">padrão</span>}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">{o.dica}</span>
                  </button>
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
            <Botao onClick={gerar} disabled={gerando || cenas.length === 0 || semSaldo || enviando > 0} className="w-full py-3 text-base">
              {gerando ? progresso?.mensagem ?? "Gerando…" : custo === 0 ? "Gerar vídeo · grátis" : `Gerar vídeo · ${custo} ${custo === 1 ? "crédito" : "créditos"}`}
            </Botao>
            {cenas.length === 0 && !gerando && (
              <p className="mt-2 text-center text-xs text-neutral-500">Envie as fotos ao lado. O resto já vem pronto.</p>
            )}
            {custo === 0 && !gerando && cenas.length > 0 && (
              <p className="mt-2 text-center text-xs text-neutral-500">Vídeo e tour 360 não gastam crédito. Só cena animada por IA ({CREDITOS.animada}) e narração ({CREDITOS.narracao}).</p>
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

          <Cartao className="p-0">
            <button
              type="button"
              onClick={() => setAjustesAbertos((v) => !v)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">Ajustes</span>
                <span className="mt-0.5 block truncate text-sm text-neutral-600">{resumoDosAjustes}</span>
              </span>
              <Icone nome={ajustesAbertos ? "cima" : "baixo"} className="h-4 w-4 shrink-0 text-neutral-400" />
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
            {videos === null ? (
              <p className="text-sm text-neutral-500">Carregando…</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum ainda.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {[...videos]
                  .sort((a, b) => Number(b.imovel?.id === imovelId) - Number(a.imovel?.id === imovelId))
                  .map((v) => (
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
                        {imovelId && v.imovel?.id === imovelId && <span className="ml-1 rounded-full bg-marca-pessego/60 px-1.5 text-[10px] font-medium text-marca-indigo">deste imóvel</span>}
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
        </aside>
      </div>
    </AppShell>
  );
}
