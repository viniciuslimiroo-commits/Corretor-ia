"use client";

import { useRef, useState } from "react";
import { FORMATOS_APRESENTADOR, TAMANHOS_APRESENTADOR, type Apresentador, type CantoApresentador } from "@/lib/video";

// VOCÊ NO PALCO: a gravação do corretor em cima da foto, no lugar em que sai no vídeo.
//
// Antes ele gravava, escolhia formato, canto e tamanho em botões na aba Você -- e só via
// onde tinha ficado depois de gerar o vídeo. Pedido dele (16/09, com a imagem da proposta
// aprovada): aparecer NA HORA sobre a foto e ajustar ali mesmo.
//
// A conta de posição é a MESMA do ffmpeg (video-ffmpeg.ts, "---- apresentador ----"):
//   margem = 4% da LARGURA; lado = fração da largura (P 26%, M 34%, G 44%);
//   em cima: y = margem; embaixo: sobra 12% da ALTURA (legenda e barra do Instagram);
//   faixa: largura toda, 30% da altura, no pé.
// Por isso as porcentagens aqui convertem margem (que é da largura) pra altura com a
// proporção do vídeo -- somar 4% direto no `top` erraria no 9:16.

export default function ApresentadorNoPalco({
  apresentador,
  url,
  proporcao,
  aoMudar,
}: {
  apresentador: Apresentador;
  /** Endereço assinado do vídeo gravado. Sem ele não há o que tocar. */
  url: string;
  /** Largura ÷ altura do vídeo. */
  proporcao: number;
  aoMudar: (a: Apresentador) => void;
}) {
  const [selecionado, setSelecionado] = useState(false);
  const [aspectoClipe, setAspectoClipe] = useState(9 / 16);
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number } | null>(null);
  const inicioArrasto = useRef<{ x: number; y: number; moveu: boolean } | null>(null);

  const formato = apresentador.formato;
  const canto: CantoApresentador = apresentador.canto ?? "inferior_direito";
  const fracao = TAMANHOS_APRESENTADOR.find((t) => t.id === (apresentador.tamanho ?? "medio"))?.fracao ?? 0.34;
  const margemX = 4; // % da largura
  const margemY = 4 * proporcao; // a mesma margem, em % da altura

  let estilo: React.CSSProperties;
  if (formato === "rodape") {
    estilo = { left: 0, right: 0, bottom: 0, height: "30%" };
  } else {
    const largura = fracao * 100;
    // No canto o clipe mantém a proporção dele; no círculo é quadrado.
    const alturaPct = formato === "circulo" ? largura * proporcao : (largura * proporcao) / aspectoClipe;
    estilo = {
      width: `${largura}%`,
      height: `${alturaPct}%`,
      ...(canto.endsWith("direito") ? { right: `${margemX}%` } : { left: `${margemX}%` }),
      ...(canto.startsWith("superior") ? { top: `${margemY}%` } : { bottom: "12%" }),
    };
  }

  // Arrastar leva pro canto mais perto de onde soltou. Faixa não arrasta: ela é o pé inteiro.
  function soltar(ev: React.PointerEvent<HTMLDivElement>) {
    const ini = inicioArrasto.current;
    inicioArrasto.current = null;
    setArrasto(null);
    if (!ini) return;
    if (!ini.moveu) {
      setSelecionado((s) => !s);
      return;
    }
    const palco = (ev.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const direito = ev.clientX > palco.left + palco.width / 2;
    const superior = ev.clientY < palco.top + palco.height / 2;
    aoMudar({ ...apresentador, canto: `${superior ? "superior" : "inferior"}_${direito ? "direito" : "esquerdo"}` as CantoApresentador });
  }

  const tamanhoAtual = apresentador.tamanho ?? "medio";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Você no vídeo: toque pra ajustar, arraste pra trocar de canto"
        title="Toque pra ajustar · arraste pra trocar de canto"
        onPointerDown={(ev) => {
          if (formato === "rodape") {
            inicioArrasto.current = { x: ev.clientX, y: ev.clientY, moveu: false };
            return;
          }
          // Captura o ponteiro pra o arrasto não se perder quando o dedo sai da bolha. Em
          // alguns navegadores isso falha com ponteiro que já acabou -- e o arrasto segue sem ela.
          try {
            ev.currentTarget.setPointerCapture(ev.pointerId);
          } catch {
            /* segue sem captura */
          }
          inicioArrasto.current = { x: ev.clientX, y: ev.clientY, moveu: false };
        }}
        onPointerMove={(ev) => {
          const ini = inicioArrasto.current;
          if (!ini || formato === "rodape") return;
          const dx = ev.clientX - ini.x;
          const dy = ev.clientY - ini.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) ini.moveu = true;
          if (ini.moveu) setArrasto({ dx, dy });
        }}
        onPointerUp={soltar}
        onPointerCancel={() => {
          inicioArrasto.current = null;
          setArrasto(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && setSelecionado((s) => !s)}
        className={
          "pointer-events-auto absolute z-20 cursor-grab touch-none overflow-hidden bg-neutral-800 shadow-lg transition-[outline] active:cursor-grabbing " +
          // Só o círculo arredonda: o "canto" sai de quina reta no vídeo, e aqui também.
          (formato === "circulo" ? "rounded-full " : "") +
          (selecionado ? "outline-2 outline-offset-4 outline-dashed outline-[#ff9a84]" : "hover:outline-2 hover:outline-white/70")
        }
        style={{ ...estilo, ...(arrasto ? { transform: `translate(${arrasto.dx}px, ${arrasto.dy}px)`, transition: "none" } : {}) }}
      >
        <video
          src={url}
          muted
          autoPlay
          loop
          playsInline
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setAspectoClipe(v.videoWidth / v.videoHeight);
          }}
          className="pointer-events-none h-full w-full object-cover"
        />
      </div>

      {/* A barrinha: formato e tamanho num toque, colada ao palco (em cima quando a gravação
          está embaixo, e vice-versa), pra nunca cobrir a própria gravação. */}
      {selecionado && (
        <div
          className={
            "pointer-events-auto absolute right-2 left-2 z-30 flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#0e2240]/95 p-1 text-[11px] shadow-lg " +
            (formato !== "rodape" && canto.startsWith("superior") ? "bottom-2" : "top-2")
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          {FORMATOS_APRESENTADOR.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => aoMudar({ ...apresentador, formato: f.id })}
              title={f.dica}
              className={"rounded-lg px-2 py-1 transition " + (formato === f.id ? "bg-[#f06b4f]/20 text-[#ffb3a4]" : "text-neutral-300 hover:bg-white/10")}
            >
              {f.id === "canto" ? "Canto" : f.id === "circulo" ? "Círculo" : "Faixa"}
            </button>
          ))}
          {formato !== "rodape" && (
            <>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
              {TAMANHOS_APRESENTADOR.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => aoMudar({ ...apresentador, tamanho: t.id })}
                  title={t.rotulo}
                  className={"w-7 rounded-lg py-1 transition " + (tamanhoAtual === t.id ? "bg-[#f06b4f]/20 text-[#ffb3a4]" : "text-neutral-300 hover:bg-white/10")}
                >
                  {t.rotulo[0]}
                </button>
              ))}
            </>
          )}
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
          <button type="button" onClick={() => setSelecionado(false)} className="rounded-lg px-2 py-1 text-neutral-400 hover:bg-white/10" aria-label="Fechar ajustes">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
