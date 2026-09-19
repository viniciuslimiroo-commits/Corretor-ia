"use client";

import { useEffect } from "react";
import Compartilhar from "@/components/compartilhar";
import { Icone } from "@/components/ui";
import { FORMATOS, type FormatoId } from "@/lib/video";
import { BotaoEd, BotaoIcone, Pilula } from "./ui-editor";

// O VÍDEO PRONTO (ou um vídeo da lista, pra assistir), numa janela de verdade.
//
// Antes o resultado entrava como um cartão EM CIMA do palco, empurrando o quadro pra baixo
// dentro da coluna -- e, pelo "Assistir" da lista, às vezes nem aparecia (a página tentava
// rolar pro topo de uma tela que não rola). Agora é uma janela centrada, com o fundo
// escurecido, que fecha no ✕, no Esc ou tocando fora. O editor atrás fica como estava.

export type VideoPronto = { videoId: string; url: string; miniatura: string | null; duracao: number | null; avisos: string[]; formato: string; titulo?: string };

type Props = {
  video: VideoPronto;
  token: () => Promise<string>;
  gerando: boolean;
  /** Há cenas no editor: dá pra fazer este mesmo vídeo em outro formato. */
  podeOutroFormato: boolean;
  aoFechar(): void;
  aoEditar(videoId: string): void;
  aoOutroFormato(f: FormatoId): void;
  aoUsarNaLinha?(): void;
};

export default function ModalVideoPronto({ video, token, gerando, podeOutroFormato, aoFechar, aoEditar, aoOutroFormato, aoUsarNaLinha }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  const vertical = video.formato === "9:16" || video.formato === "4:5";
  const nomeFormato = FORMATOS.find((f) => f.id === video.formato)?.rotulo ?? video.formato;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6" onPointerDown={(e) => e.target === e.currentTarget && aoFechar()} role="dialog" aria-modal="true" aria-label="Vídeo pronto" data-modal-video="1">
      <div className="ed-surgir flex max-h-[92svh] w-full max-w-[860px] flex-col overflow-hidden rounded-t-[24px] bg-[var(--ed-painel)] shadow-[var(--ed-sombra-3)] ring-1 ring-[var(--ed-linha)] md:rounded-[24px]">
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[rgb(44_177_163/0.15)] text-[#7fd6cb]">
            <Icone nome="check" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-[var(--ed-texto)]">{video.titulo ? video.titulo : "Seu vídeo está pronto"}</h2>
            <p className="text-[12.5px] text-[var(--ed-texto-2)]">
              {video.duracao ? `${Math.round(video.duracao)} segundos · ` : ""}
              {nomeFormato}
            </p>
          </div>
          <BotaoIcone rotulo="Fechar" icone="fechar" onClick={aoFechar} />
        </div>
        <div className="ed-rolagem grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-start justify-center rounded-2xl bg-[var(--ed-fundo)] p-3">
            <video key={video.url} src={video.url} poster={video.miniatura ?? undefined} controls playsInline className={`rounded-xl bg-black ${vertical ? "max-h-[62svh] w-auto" : "w-full"}`} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ed-acento)] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(240_107_79/0.7)] transition hover:bg-[var(--ed-acento-forte)]">
                <Icone nome="download" className="h-5 w-5" />
                Baixar MP4
              </a>
              <div className="grid grid-cols-2 gap-2">
                <BotaoEd icone="editar_prompt" onClick={() => aoEditar(video.videoId)} title="Reabre as cenas e os ajustes deste vídeo. Gerar de novo cria outro vídeo.">
                  Editar
                </BotaoEd>
                {aoUsarNaLinha ? (
                  <BotaoEd icone="mais" onClick={aoUsarNaLinha} title="Põe este vídeo como clipe no fim da linha do tempo">
                    Usar na linha
                  </BotaoEd>
                ) : (
                  <BotaoEd variante="fantasma" onClick={aoFechar}>
                    Fechar
                  </BotaoEd>
                )}
              </div>
            </div>
            {podeOutroFormato && (
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-[var(--ed-texto-2)]">Fazer também em (sem custo)</p>
                <div className="flex flex-wrap gap-2">
                  {FORMATOS.filter((f) => f.id !== video.formato).map((f) => (
                    <Pilula key={f.id} onClick={() => aoOutroFormato(f.id)} disabled={gerando} title={f.dica}>
                      {f.rotulo} · {f.id}
                    </Pilula>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Compartilhar token={token} videoId={video.videoId} texto="Olha o vídeo do imóvel:" />
            </div>
            {video.avisos.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-xl bg-[rgb(233_185_73/0.1)] p-3 text-[12px] text-[#f1c86a]">
                {video.avisos.map((a, i) => (
                  <li key={i}>⚠ {a}</li>
                ))}
              </ul>
            )}
            <p className="text-[12px] leading-relaxed text-[var(--ed-texto-3)]">No celular, toque em Baixar e depois em compartilhar para mandar pelo WhatsApp ou postar no Instagram.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
