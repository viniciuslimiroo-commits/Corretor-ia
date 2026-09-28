"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import LinhaDeFaixas from "@/components/editor/faixas/linha-de-faixas";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";
import {
  aplicarGesto,
  blocosDoEstado,
  ctxDoEstado,
  estadoDoEspec,
  faixaAberta as qualFaixaAbre,
  pontosDeEncaixe,
  zoomParaAjustar,
  type BlocoLinha,
  type CenaBase,
  type EstadoLinha,
  type FaixaId,
  type Gesto,
  type Medidas,
  type RefItem,
} from "@/lib/linha-do-tempo";
import { decodificarPicos, type PicosDaFaixa } from "@/lib/picos-audio";
import type { ElementoCena, EspecVideo, MusicaId } from "@/lib/video";

type Caso = "seis" | "nenhuma" | "curto";

// ---------- o vídeo da bancada: fotos reais de /exemplos ----------

const FOTOS = ["/exemplos/sala-depois.jpg", "/exemplos/jantar-depois.jpg", "/exemplos/cozinha-depois.jpg", "/exemplos/parede-depois.jpg", "/exemplos/sala-antes.jpg"];
const LEGENDAS = ["Sala ampla e iluminada", "Quarto com closet", "Cozinha planejada", "Parede em terracota", "Varanda gourmet", "Agende sua visita"];

function especDoCaso(caso: Caso): EspecVideo {
  const vazio = caso === "nenhuma";
  const cenas = FOTOS.map((_, i) => ({
    tipo: "foto" as const,
    jobId: `bancada-${i}`,
    duracao: i === 1 ? 5 : 4,
    legenda: !vazio && i === 0 ? "Sala ampla" : undefined,
    textos: !vazio && i === 0 ? [{ texto: "À VENDA", posicao: "topo" as const }] : !vazio && i === 3 ? [{ texto: "BAIXOU!" }] : undefined,
    elementos: !vazio && i === 2 ? ([{ id: "selo-vendido" }, { id: "seta" }] as ElementoCena[]) : undefined,
  }));
  const base: EspecVideo = {
    formato: "9:16" as EspecVideo["formato"],
    cenas,
    musica: "nenhuma",
    musicaVolume: 0.8,
    narracao: null,
    titulo: vazio ? "" : "Apartamento 302",
    preco: "",
    local: "",
    telaFinal: true,
    transicao: "dissolver",
    efeitoSonoro: vazio ? "nenhum" : "clique",
  };
  if (vazio) return base;
  return {
    ...base,
    narracao: { origem: "gravada", arquivo: "uploads/bancada/voz.webm" },
    versao: 2,
    audios: [
      { id: "mus00001", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 0, duracao: 8, volume: 0.8, fadeEntrada: 1, fadeSaida: 0, laco: true },
      ...(caso === "curto" ? [{ id: "curto001", fonte: { tipo: "musica" as const, id: "calma" as const }, noVideo: 8.5, corteArquivo: 3, duracao: 0.75, volume: 0.8, fadeEntrada: 0, fadeSaida: 0, laco: true }] : []),
      { id: "mus00002", fonte: { tipo: "musica", id: "calma" }, noVideo: 10, corteArquivo: 12, volume: 0.8, fadeEntrada: 0, fadeSaida: 2, laco: true },
      { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 1.2, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 },
    ],
    legendas: { estilo: "faixa", trechos: LEGENDAS.map((texto, i) => ({ inicio: Math.round((1.2 + i * 1.5) * 100) / 100, fim: Math.round((2.5 + i * 1.5) * 100) / 100, texto })) },
    apresentador: { arquivo: "uploads/bancada/voce.webm", formato: "circulo", entra: 6, inicio: 0, duracao: 5 },
  };
}

const MEDIDAS: Medidas = { segundosDaVoz: 9.4, vozEstimada: false, segundosEstimadosDaVoz: 7, segundosDoVoce: 12.3 };

// ---------- um relógio de prévia sem som (a bancada mede a linha, não o áudio) ----------

type RelogioBancada = RelogioDaPrevia & { tocar(t: number): void; pausar(): number; buscar(t: number): void };

function criarRelogio(): RelogioBancada {
  let t0 = 0;
  let base = 0;
  let tocando = false;
  let quadro = 0;
  const fns = new Set<(t: number) => void>();
  const agora = () => (tocando ? t0 + (performance.now() - base) / 1000 : t0);
  const laco = () => {
    const t = agora();
    fns.forEach((f) => f(t));
    if (tocando) quadro = requestAnimationFrame(laco);
  };
  return {
    agora,
    assinar(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    tocar(t) {
      t0 = t;
      base = performance.now();
      tocando = true;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(laco);
    },
    pausar() {
      t0 = agora();
      tocando = false;
      cancelAnimationFrame(quadro);
      return t0;
    },
    buscar(t) {
      t0 = t;
      base = performance.now();
    },
  };
}

// ---------- celular ou computador ----------

const assinarLargura = (fn: () => void) => {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};
const larguraCelular = () => window.matchMedia("(max-width: 767px)").matches;

type Evento = { tipo: string; dado?: unknown; em: number };

export default function BancadaLinha({ caso, celular: forcado, aberta, todas }: { caso: Caso; celular: boolean | null; aberta: string | null; todas: boolean }) {
  const automatico = useSyncExternalStore(assinarLargura, larguraCelular, () => true);
  const celular = forcado ?? automatico;
  const [estado, setEstado] = useState<EstadoLinha<CenaBase>>(() => estadoDoEspec(especDoCaso(caso), FOTOS.map((_, i) => `cena${i}`)));
  const [selecao, setSelecao] = useState<RefItem | null>(null);
  const [tempo, setTempo] = useState(3);
  const [tocando, setTocando] = useState(false);
  const [zoom, setZoom] = useState(40);
  const [ultima, setUltima] = useState<FaixaId | null>((aberta as FaixaId) ?? null);
  const [todasAbertas, setTodasAbertas] = useState(todas);
  const [picos, setPicos] = useState<Partial<Record<MusicaId, PicosDaFaixa>>>({});
  const [relogio] = useState<RelogioBancada>(criarRelogio);
  const [eventos] = useState<Evento[]>(() => []);

  const ctx = useMemo(() => ctxDoEstado(estado, MEDIDAS), [estado]);
  const faixas = useMemo(() => blocosDoEstado(ctx), [ctx]);
  const total = ctx.relogio.total;
  const abre = qualFaixaAbre({ selecao, aba: null, ultima, faixas });

  const registrar = useCallback((tipo: string, dado?: unknown) => eventos.push({ tipo, dado, em: performance.now() }), [eventos]);

  useEffect(() => {
    fetch("/musica/picos.json")
      .then((r) => r.json())
      .then((j) => setPicos(decodificarPicos(j)))
      .catch(() => setPicos({}));
  }, []);

  // O tempo da tela anda de 100 em 100ms enquanto toca (o quadro a quadro vem pelo relógio).
  useEffect(() => {
    if (!tocando) return;
    const id = setInterval(() => {
      const t = relogio.agora();
      if (t >= total) {
        relogio.pausar();
        setTocando(false);
        setTempo(total);
      } else setTempo(Math.round(t * 100) / 100);
    }, 100);
    return () => clearInterval(id);
  }, [tocando, relogio, total]);

  // O que o teste lê: estado, seleção, tempo, zoom e o registro de eventos.
  useEffect(() => {
    (window as unknown as { __linha: unknown }).__linha = { estado, selecao, tempo, zoom, total, faixaAberta: abre, todasAbertas, eventos, celular };
  });

  const opcoesEncaixe = useCallback((ref: RefItem) => ({ pontos: pontosDeEncaixe(ctx, ref, tempo), limiarSeg: 10 / zoom }), [ctx, tempo, zoom]);

  const miniaturas = useMemo(() => Object.fromEntries(estado.cenas.map((c) => [c.chave, FOTOS[Number(c.chave.replace("cena", ""))] ?? null])), [estado.cenas]);
  const indiceNoPalco = Math.max(0, ctx.relogio.clipes.findLastIndex((c) => c.inicio <= tempo + 1e-6));
  const fotoNoPalco = miniaturas[estado.cenas[Math.min(indiceNoPalco, estado.cenas.length - 1)]?.chave ?? ""];

  return (
    <div className="editor-escuro flex h-[100svh] flex-col overflow-hidden">
      <div className="palco flex min-h-0 flex-1 items-center justify-center p-2">
        {fotoNoPalco && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoNoPalco} alt="" className="max-h-full max-w-full rounded object-contain" />
        )}
      </div>
      <LinhaDeFaixas
        faixas={faixas}
        total={total}
        relogio={relogio}
        tempo={tempo}
        tocando={tocando}
        zoom={zoom}
        selecao={selecao}
        faixaAberta={abre}
        todasAbertas={todasAbertas}
        podeDesfazer={false}
        podeRefazer={false}
        gerando={false}
        celular={celular}
        picos={picos}
        miniaturas={miniaturas}
        capa="cena0"
        semSom={new Set<string>()}
        animadas={new Set(["cena1"])}
        simularGesto={(ref: RefItem, g: Gesto) => aplicarGesto(ctx, ref, g, opcoesEncaixe(ref)) as never}
        aoConfirmarGesto={(ref: RefItem, g: Gesto) => {
          const r = aplicarGesto(ctx, ref, g, opcoesEncaixe(ref));
          registrar("confirmar", { ref, g, mudou: r.mudou, de: r.de, ate: r.ate, guia: r.guia });
          if (r.mudou) setEstado(r.estado);
          setSelecao(r.selecao);
        }}
        aoTocar={(t: boolean) => {
          registrar("tocar", t);
          if (t) relogio.tocar(tempo >= total - 0.05 ? 0 : tempo);
          else setTempo(Math.round(relogio.pausar() * 100) / 100);
          setTocando(t);
        }}
        aoBuscar={(t: number, origem) => {
          registrar("buscar", { t, origem });
          relogio.buscar(t);
          setTempo(Math.round(t * 100) / 100);
        }}
        aoZoom={(px: number) => {
          registrar("zoom", px);
          setZoom(px);
        }}
        aoAjustar={() => {
          const w = document.querySelector<HTMLElement>("[data-rolagem]")?.clientWidth ?? 375;
          const z = zoomParaAjustar(total, w);
          registrar("ajustar", z);
          setZoom(z);
        }}
        aoAlternarFaixas={() => {
          registrar("faixas", !todasAbertas);
          setTodasAbertas((v) => !v);
        }}
        aoAbrirFaixa={(f: FaixaId) => {
          registrar("abrirFaixa", f);
          setUltima(f);
          setSelecao(null);
        }}
        aoSelecionar={(ref: RefItem | null) => {
          registrar("selecionar", ref);
          setSelecao(ref);
        }}
        aoAbrirLista={(grupo: BlocoLinha) => registrar("lista", grupo.itens)}
        aoMenu={(ref: RefItem, x: number, y: number) => registrar("menu", { ref, x, y })}
        aoDesfazer={() => registrar("desfazer")}
        aoRefazer={() => registrar("refazer")}
      />
    </div>
  );
}
