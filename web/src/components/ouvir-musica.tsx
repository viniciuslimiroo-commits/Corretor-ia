"use client";

import { useEffect, useRef, useState } from "react";
import { musicasOferecidas, type MusicaId } from "@/lib/video";

// ESCOLHER MÚSICA SEM OUVIR é escolher pelo nome. "Sereno", "Aconchego" e "Minimal" não
// dizem nada até soarem -- e hoje o corretor só descobria o que escolheu depois do vídeo
// pronto, que custa crédito. Aqui ele ouve antes, de graça.
//
// Um tocador só, guardado num ref: com um <audio> por ficha, tocar a segunda deixava a
// primeira tocando junto. É o mesmo padrão da biblioteca de áudio do editor, e as duas
// respeitam o evento "encena:parar-audio".
//
// Toca os 30s de `public/musica/previa/`, não a faixa inteira: o arquivo é seis vezes menor
// e ninguém vai ouvir três minutos para escolher uma trilha.

export default function OuvirMusica({
  escolhida,
  aoEscolher,
  volume,
  desligado,
}: {
  escolhida: MusicaId;
  aoEscolher: (id: MusicaId) => void;
  /** O mesmo volume que vai pro vídeo: ouvir mais alto do que vai sair engana. */
  volume: number;
  desligado?: boolean;
}) {
  const tocador = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState<MusicaId | null>(null);

  useEffect(() => {
    const parar = () => {
      tocador.current?.pause();
      setTocando(null);
    };
    window.addEventListener("encena:parar-audio", parar);
    return () => {
      window.removeEventListener("encena:parar-audio", parar);
      // Sair da página com música tocando seria assombração.
      tocador.current?.pause();
      tocador.current = null;
    };
  }, []);

  // Mexer no volume enquanto toca muda o que se ouve na hora, senão o controle mente.
  useEffect(() => {
    if (tocador.current) tocador.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  function ouvir(id: MusicaId, arquivo: string) {
    if (tocando === id) {
      tocador.current?.pause();
      setTocando(null);
      return;
    }
    window.dispatchEvent(new Event("encena:parar-previa"));
    tocador.current?.pause();
    const a = new Audio(`/musica/previa/${arquivo}`);
    a.volume = Math.max(0, Math.min(1, volume));
    a.onended = () => setTocando(null);
    a.play().catch(() => setTocando(null));
    tocador.current = a;
    setTocando(id);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {musicasOferecidas().map((m) => {
        const ativa = escolhida === m.id;
        const soando = tocando === m.id;
        return (
          <span
            key={m.id}
            className={
              "inline-flex items-center overflow-hidden rounded-full border text-sm transition " +
              (ativa ? "border-marca-indigo bg-marca-indigo text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400")
            }
          >
            <button
              type="button"
              onClick={() => aoEscolher(m.id)}
              disabled={desligado}
              title={m.descricao}
              className="min-h-9 px-3 font-medium disabled:opacity-50"
            >
              {m.rotulo}
            </button>
            {/* "Sem música" não tem o que ouvir. */}
            {m.arquivo && (
              <button
                type="button"
                onClick={() => ouvir(m.id, m.arquivo!)}
                disabled={desligado}
                aria-label={soando ? `Parar ${m.rotulo}` : `Ouvir ${m.rotulo}`}
                title={soando ? "Parar" : "Ouvir 30 segundos"}
                className={
                  "flex min-h-9 w-8 items-center justify-center border-l transition disabled:opacity-50 " +
                  (ativa ? "border-white/30 hover:bg-white/15" : "border-neutral-200 text-marca-indigo hover:bg-neutral-100")
                }
              >
                {soando ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                )}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
