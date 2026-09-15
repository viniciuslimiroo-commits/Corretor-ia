"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  type AnimacaoId,
  type Cena,
  type EfeitoId,
  type EspecVideo,
  type FormatoId,
  type Movimento360Id,
  type MusicaId,
  type VozId,
} from "@/lib/video";
import { resumoDaFicha, valorComPeriodo } from "@/lib/ficha-imovel";
import AppShell from "@/components/app-shell";
import SeletorImovel from "@/components/seletor-imovel";
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
  const { user, token } = c;

  const [imovelId, setImovelId] = useState<string | null>(null);
  const [geracoes, setGeracoes] = useState<Geracao[]>([]);
  const [cenas, setCenas] = useState<CenaUI[]>([]);
  const [formato, setFormato] = useState<FormatoId>("9:16");
  const [musica, setMusica] = useState<MusicaId>("calma");
  const [transicao, setTransicao] = useState<"suave" | "corte">("suave");
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
  const [roteiro, setRoteiro] = useState("");
  const [voz, setVoz] = useState<VozId>("laura");
  const [escrevendo, setEscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

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
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoResumo[] | null>(null);

  const espec: EspecVideo = useMemo(
    () => ({
      formato,
      cenas: cenas.map((s) => ({ tipo: s.tipo, jobId: s.jobId, arquivo: s.arquivo, efeito: s.efeito, animacao: s.animacao, movimento: s.movimento, legenda: s.legenda || undefined, duracao: s.duracao, melhorar: s.melhorar })),
      musica,
      narracao: narrar && roteiro.trim().length >= 10 ? { roteiro: roteiro.trim(), voz } : null,
      titulo,
      preco,
      local,
      telaFinal,
      chamada: telaFinal ? chamada : "",
      transicao,
      capa: Math.max(0, cenas.findIndex((s) => s.chave === capa)),
    }),
    [formato, cenas, musica, narrar, roteiro, voz, titulo, preco, local, telaFinal, chamada, transicao, capa]
  );
  // Resumo dos ajustes em uma linha: quem não abriu ainda vê o que está valendo.
  const resumoDosAjustes = [
    FORMATOS.find((f) => f.id === formato)?.rotulo ?? formato,
    MUSICAS.find((m) => m.id === musica)?.rotulo ?? musica,
    transicao === "suave" ? "transição suave" : "corte seco",
    titulo ? `“${titulo}”` : null,
    narrar ? `narrado (${VOZES.find((v) => v.id === voz)?.rotulo ?? voz})` : null,
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
      const novas = cenasDoEspec(e, (dd.edicao?.cenas ?? []) as EdicaoCena[]);
      setImovelId(dd.edicao?.imovelId ?? null);
      setCenas(novas);
      setFormato(e.formato);
      setMusica(e.musica);
      setTransicao(e.transicao);
      setTitulo(e.titulo ?? "");
      setPreco(e.preco ?? "");
      setLocal(e.local ?? "");
      setTelaFinal(e.telaFinal !== false);
      setChamada(e.chamada ?? "");
      setNarrar(!!e.narracao);
      setRoteiro(e.narracao?.roteiro ?? "");
      setVoz(e.narracao?.voz ?? "laura");
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
      <h1 className="text-2xl font-semibold">Vídeo do imóvel</h1>
      <p className="mt-1 text-sm text-neutral-500">Fotos viram um vídeo com movimento, música, seus textos e sua marca. Pronto pra Reels, Stories e WhatsApp.</p>

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
                      <li key={g.id}>
                        <button type="button" onClick={() => adicionarGeracao(g)} disabled={gerando} className={"relative block w-full overflow-hidden rounded-lg border-2 " + (usada ? "border-marca-coral" : "border-transparent hover:border-neutral-400")} title={g.acao}>
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

          <Cartao>
            <Rotulo>2 · Cenas, na ordem</Rotulo>
            {cenas.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhuma cena ainda. Escolha um imóvel acima ou envie fotos.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {cenas.map((s, i) => (
                  <li key={s.chave} className="rounded-xl border border-neutral-200 p-3">
                    <div className="flex gap-3">
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
            <div className="flex flex-wrap gap-2">
              {MUSICAS.map((m) => (
                <Chip key={m.id} ativo={musica === m.id} onClick={() => setMusica(m.id)} title={m.descricao}>{m.rotulo}</Chip>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Transição:</span>
              <Chip ativo={transicao === "suave"} onClick={() => setTransicao("suave")}>Suave</Chip>
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
            <Rotulo>Narração (+{CREDITOS.narracao} crédito)</Rotulo>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={narrar} onChange={(e) => setNarrar(e.target.checked)} className="accent-marca-coral" />
              Narrar o vídeo com voz de IA
            </label>
            {narrar && (
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
                {narrar && roteiro.trim().length < 10 && <p className="mt-2 text-xs text-amber-700">Escreva pelo menos uma frase pra narração entrar.</p>}
              </div>
            )}
          </Cartao>

          </div>

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
        </aside>
      </div>
    </AppShell>
  );
}
