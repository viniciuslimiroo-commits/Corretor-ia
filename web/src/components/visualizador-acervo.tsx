"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Comparador from "@/components/comparador";
import Compartilhar from "@/components/compartilhar";
import { BotaoConfirma, Icone } from "@/components/ui";

// O visualizador do Acervo: a imagem (ou o vídeo) grande, e o que dá pra fazer com ela,
// sem sair da lista. Antes, clicar num item só marcava; ver a foto de verdade exigia
// abrir o histórico ou o imóvel -- e um acervo em que não se olha a foto é um depósito.
//
// O que fica aqui é o que já existe em outros cantos, chamado pelo mesmo id do job:
// refinar e versões (o editor), animar (o vídeo), material (o montador), imóvel (o PATCH
// do job). Nada é reimplementado; o visualizador é um lugar de partida.
//
// Teclado: Esc fecha, ← → andam. Celular: arrastar pro lado anda, a tela é inteira.

export type ItemAcervo = {
  id: string;
  categoria: "foto" | "planta" | "terreno" | "video";
  tipo?: string;
  rotulo: string;
  detalhe: string;
  criadoEm: string;
  imovel: { id: string; titulo: string } | null;
  /** A imagem inteira (assinada) ou a miniatura do vídeo. */
  miniatura: string | null;
  /** A foto original, quando o job guardou: liga o antes/depois. */
  antes?: string | null;
  /** Só imagem (migração 16). */
  favorito?: boolean;
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function VisualizadorAcervo({
  itens,
  indice,
  imoveis,
  token,
  aoFechar,
  aoIr,
  aoApagar,
  aoApagarVideo,
  aoUsarEmMaterial,
  aoMudarImovel,
  aoFavoritar,
}: {
  itens: ItemAcervo[];
  indice: number;
  imoveis: { id: string; titulo: string }[];
  token: () => Promise<string>;
  aoFechar: () => void;
  aoIr: (indice: number) => void;
  aoApagar: (id: string) => Promise<void> | void;
  aoApagarVideo: (id: string) => Promise<void> | void;
  aoUsarEmMaterial: (id: string) => void;
  aoMudarImovel: (id: string, imovelId: string | null) => Promise<void> | void;
  aoFavoritar: (id: string, favorito: boolean) => Promise<void> | void;
}) {
  const item = itens[indice];
  const [zoom, setZoom] = useState(false);
  const [comparar, setComparar] = useState(false);
  const [video, setVideo] = useState<{ id: string; url: string; miniatura: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const toque = useRef<number | null>(null);
  const temAnterior = indice > 0;
  const temProximo = indice < itens.length - 1;

  /** Andar zera zoom e comparação: cada imagem abre do jeito simples. */
  function ir(n: number) {
    if (n < 0 || n >= itens.length) return;
    setZoom(false);
    setComparar(false);
    aoIr(n);
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
      else if (e.key === "ArrowRight") ir(indice + 1);
      else if (e.key === "ArrowLeft") ir(indice - 1);
    }
    window.addEventListener("keydown", tecla);
    // A página de trás não rola enquanto o visualizador está aberto.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ir` muda a cada render; o que importa é o índice
  }, [indice, aoFechar]);

  // A lista só tem a miniatura do vídeo; o arquivo assinado vem da rota dele.
  useEffect(() => {
    if (!item || item.categoria !== "video") return;
    let vivo = true;
    token()
      .then((t) => fetch(`/api/video/${item.id}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d.url) setVideo({ id: item.id, url: d.url, miniatura: d.miniatura ?? null });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [item, token]);

  if (!item) return null;
  const ehVideo = item.categoria === "video";
  const videoAtual = video && video.id === item.id ? video : null;

  async function rodar(fn: () => Promise<void> | void) {
    setOcupado(true);
    try {
      await fn();
    } finally {
      setOcupado(false);
    }
  }

  const acao = "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.rotulo}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white"
      onTouchStart={(e) => {
        toque.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const inicio = toque.current;
        toque.current = null;
        if (inicio === null || zoom) return;
        const dx = (e.changedTouches[0]?.clientX ?? inicio) - inicio;
        if (dx < -60) ir(indice + 1);
        else if (dx > 60) ir(indice - 1);
      }}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {item.rotulo}
            {item.detalhe ? <span className="text-white/60"> · {item.detalhe}</span> : null}
          </p>
          <p className="truncate text-xs text-white/60">
            {item.imovel?.titulo ?? "Sem imóvel"} · {quando(item.criadoEm)}
          </p>
        </div>
        <span className="text-xs tabular-nums text-white/60">
          {indice + 1} / {itens.length}
        </span>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-2 hover:bg-white/10">
          <Icone nome="fechar" className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => ir(indice - 1)}
          disabled={!temAnterior}
          aria-label="Anterior"
          className="absolute top-1/2 left-2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl hover:bg-black/70 disabled:opacity-20 sm:flex"
        >
          ‹
        </button>

        {ehVideo ? (
          videoAtual ? (
            <video key={videoAtual.url} src={videoAtual.url} poster={videoAtual.miniatura ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full" />
          ) : (
            <p className="text-sm text-white/60">Abrindo o vídeo…</p>
          )
        ) : comparar && item.antes && item.miniatura ? (
          <div className="w-full max-w-5xl px-4">
            <Comparador antes={item.antes} depois={item.miniatura} />
          </div>
        ) : item.miniatura ? (
          <div
            className={zoom ? "h-full w-full cursor-zoom-out overflow-auto" : "flex h-full w-full cursor-zoom-in items-center justify-center"}
            onClick={() => setZoom((v) => !v)}
            title={zoom ? "Clique pra ajustar à tela" : "Clique pra ver no tamanho real"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.miniatura} alt={item.rotulo} className={zoom ? "max-w-none" : "max-h-full max-w-full object-contain"} draggable={false} />
          </div>
        ) : (
          <p className="text-sm text-white/60">Sem imagem.</p>
        )}

        <button
          type="button"
          onClick={() => ir(indice + 1)}
          disabled={!temProximo}
          aria-label="Próximo"
          className="absolute top-1/2 right-2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl hover:bg-black/70 disabled:opacity-20 sm:flex"
        >
          ›
        </button>
      </div>

      {/* O que fazer com este arquivo. No celular a fileira rola pro lado. */}
      <footer className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:thin]">
        {ehVideo ? (
          <>
            {videoAtual && (
              <a href={videoAtual.url} target="_blank" rel="noopener noreferrer" className={acao}>
                <Icone nome="download" className="h-4 w-4" />
                Baixar
              </a>
            )}
            <Link href={`/video?editar=${item.id}`} className={acao} title="Reabre as cenas e os ajustes deste vídeo">
              <Icone nome="editar_prompt" className="h-4 w-4" />
              Editar
            </Link>
            <span className="shrink-0 [&_button]:border-white/15 [&_button]:text-white">
              <Compartilhar token={token} videoId={item.id} texto="Olha o vídeo do imóvel:" />
            </span>
            <BotaoConfirma
              pergunta="Apagar este vídeo?"
              detalhe="Sai o arquivo montado e a miniatura. As fotos que entraram nele continuam no acervo."
              confirmar="Apagar"
              aoConfirmar={() => rodar(() => aoApagarVideo(item.id))}
              disabled={ocupado}
              className={acao + " ml-auto"}
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              Apagar
            </BotaoConfirma>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => rodar(() => aoFavoritar(item.id, !item.favorito))}
              disabled={ocupado}
              aria-pressed={!!item.favorito}
              className={acao + (item.favorito ? " border-amber-300/60 bg-amber-400/20 text-amber-200" : "")}
              title={item.favorito ? "Tirar dos favoritos" : "Guardar nos favoritos"}
            >
              <Icone nome="estrela" className="h-4 w-4" />
              {item.favorito ? "Favorito" : "Favoritar"}
            </button>
            {item.antes && (
              <button type="button" onClick={() => setComparar((v) => !v)} className={acao + (comparar ? " bg-white/20" : "")} title="A foto original guardada, lado a lado com a editada">
                <Icone nome="olho" className="h-4 w-4" />
                {comparar ? "Só o depois" : "Antes e depois"}
              </button>
            )}
            {item.miniatura && (
              <a href={item.miniatura} target="_blank" rel="noopener noreferrer" className={acao}>
                <Icone nome="download" className="h-4 w-4" />
                Baixar
              </a>
            )}
            <Link href={`/editar?job=${item.id}`} className={acao} title="Pede uma mudança em cima desta imagem. As versões ficam guardadas.">
              <Icone nome="magica" className="h-4 w-4" />
              Refinar
            </Link>
            <Link href={`/video?job=${item.id}`} className={acao} title="Vira uma cena com movimento de câmera">
              <Icone nome="play" className="h-4 w-4" />
              Animar
            </Link>
            <button type="button" onClick={() => aoUsarEmMaterial(item.id)} className={acao} title="Leva esta imagem pro montador de material">
              <Icone nome="materiais" className="h-4 w-4" />
              Usar em material
            </button>
            <label className="inline-flex shrink-0 items-center gap-1.5 text-sm text-white/80">
              <Icone nome="imoveis" className="h-4 w-4" />
              <select
                value={item.imovel?.id ?? ""}
                disabled={ocupado}
                onChange={(e) => rodar(() => aoMudarImovel(item.id, e.target.value || null))}
                className="rounded-lg border border-white/15 bg-neutral-900 px-2 py-1.5 text-sm text-white"
                aria-label="Imóvel desta imagem"
              >
                <option value="">Sem imóvel</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.titulo}</option>
                ))}
              </select>
            </label>
            <BotaoConfirma
              pergunta="Apagar esta imagem?"
              detalhe="Sai do seu acervo e do armazenamento. Não tem volta e não devolve crédito."
              confirmar="Apagar"
              aoConfirmar={() => rodar(() => aoApagar(item.id))}
              disabled={ocupado}
              className={acao + " ml-auto"}
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              Apagar
            </BotaoConfirma>
          </>
        )}
      </footer>
    </div>
  );
}
