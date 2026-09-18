"use client";

import { useEffect, useRef, useState } from "react";
import { FORMATOS_APRESENTADOR, TAMANHOS_APRESENTADOR, type Apresentador, type CantoApresentador } from "@/lib/video";

/**
 * O vídeo do Você no RELÓGIO da prévia (linha do tempo, P6): tocando dentro da janela, só
 * corrige quando escorrega mais de 0,15s (corrigir sempre engasga); parado, pausa e vai pro
 * quadro do cursor, no máximo a cada 100ms (arrastar a linha manda dezenas de tempos).
 */
function criarSincronia() {
  let ultimaBusca = 0;
  let pendente: ReturnType<typeof setTimeout> | null = null;
  const buscar = (v: HTMLVideoElement, alvo: number) => {
    ultimaBusca = performance.now();
    if (Math.abs(v.currentTime - alvo) > 0.02) v.currentTime = alvo;
  };
  return {
    sincronizar(v: HTMLVideoElement, o: { alvo: number; tocando: boolean; de: number; ate: number }) {
      const alvo = Math.min(Math.max(o.alvo, o.de), o.ate);
      if (pendente) clearTimeout(pendente);
      pendente = null;
      if (o.tocando) {
        if (v.paused) v.play().catch(() => {});
        if (Math.abs(v.currentTime - alvo) > 0.15) v.currentTime = alvo;
        return;
      }
      if (!v.paused) v.pause();
      const espera = 100 - (performance.now() - ultimaBusca);
      // Dentro dos 100ms: a busca fica marcada pro fim da janela, com o tempo MAIS NOVO --
      // senão o último tempo de um arraste se perdia e o Você parava num quadro velho.
      if (espera > 0) pendente = setTimeout(() => buscar(v, alvo), espera);
      else buscar(v, alvo);
    },
    parar() {
      if (pendente) clearTimeout(pendente);
      pendente = null;
    },
  };
}

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
  tempo,
  tocando,
  selecionado: selecionadoDeFora,
  aoSelecionar,
  aoMedirDuracao,
}: {
  apresentador: Apresentador;
  /** Endereço assinado do vídeo gravado. Sem ele não há o que tocar. */
  url: string;
  /** Largura ÷ altura do vídeo. */
  proporcao: number;
  aoMudar: (a: Apresentador) => void;
  /**
   * Linha do tempo (P6), tudo opcional: sem `tempo` o Você toca em laço como sempre. Com
   * `tempo`, ele segue o relógio da prévia -- aparece só dentro da janela dele (ou como
   * fantasma a 40% quando selecionado fora dela) e mostra o quadro do segundo certo.
   */
  tempo?: number;
  tocando?: boolean;
  /** Seleção controlada de fora (a linha do tempo). Sem isso, o toque liga e desliga aqui. */
  selecionado?: boolean;
  aoSelecionar?: () => void;
  /** Duração do arquivo gravado, assim que o navegador lê. */
  aoMedirDuracao?: (segundos: number) => void;
}) {
  const [selecionadoAqui, setSelecionado] = useState(false);
  const [aspectoClipe, setAspectoClipe] = useState(9 / 16);
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number } | null>(null);
  const inicioArrasto = useRef<{ x: number; y: number; moveu: boolean } | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [duracaoArquivo, setDuracaoArquivo] = useState<number | null>(null);
  const [sincronia] = useState(criarSincronia);

  const noRelogio = tempo !== undefined;
  const controlado = selecionadoDeFora !== undefined;
  const selecionado = controlado ? selecionadoDeFora : selecionadoAqui;
  const alternar = () => (aoSelecionar ? aoSelecionar() : setSelecionado((s) => !s));
  // A janela do Você no vídeo: a mesma conta da linha do tempo (lib/linha-do-tempo.ts).
  const entra = apresentador.entra ?? 0;
  const aparaInicio = apresentador.inicio ?? 0;
  const disponivel = (duracaoArquivo ?? aparaInicio + 8) - aparaInicio;
  const dura = Math.max(0, Math.min(apresentador.duracao ?? disponivel, disponivel));
  const dentro = noRelogio && tempo >= entra && tempo < entra + dura;
  const fantasma = noRelogio && !dentro;

  useEffect(() => {
    if (!noRelogio || !video) return;
    sincronia.sincronizar(video, { alvo: aparaInicio + (tempo - entra), tocando: !!tocando && dentro, de: aparaInicio, ate: aparaInicio + dura });
  }, [noRelogio, video, tempo, tocando, dentro, entra, aparaInicio, dura, sincronia]);
  useEffect(() => () => sincronia.parar(), [sincronia]);

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
      alternar();
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
        onKeyDown={(e) => e.key === "Enter" && alternar()}
        className={
          "pointer-events-auto absolute z-20 cursor-grab touch-none overflow-hidden bg-neutral-800 shadow-lg transition-[outline] active:cursor-grabbing " +
          // Só o círculo arredonda: o "canto" sai de quina reta no vídeo, e aqui também.
          (formato === "circulo" ? "rounded-full " : "") +
          (selecionado ? "outline-2 outline-offset-4 outline-dashed outline-[#ff9a84]" : "hover:outline-2 hover:outline-white/70")
        }
        style={{
          ...estilo,
          ...(arrasto ? { transform: `translate(${arrasto.dx}px, ${arrasto.dy}px)`, transition: "none" } : {}),
          // No relógio: fora da janela ele some; selecionado, fica de fantasma pra dar pra mexer.
          ...(fantasma ? (selecionado ? { opacity: 0.4 } : { visibility: "hidden" as const, pointerEvents: "none" as const }) : {}),
        }}
      >
        {noRelogio ? (
          // Sem autoPlay nem loop: quem manda no quadro é o relógio da prévia.
          <video
            ref={setVideo}
            src={url}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspectoClipe(v.videoWidth / v.videoHeight);
              if (Number.isFinite(v.duration)) {
                setDuracaoArquivo(v.duration);
                aoMedirDuracao?.(v.duration);
              }
            }}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <video
            src={url}
            muted
            autoPlay
            loop
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspectoClipe(v.videoWidth / v.videoHeight);
              if (Number.isFinite(v.duration)) aoMedirDuracao?.(v.duration);
            }}
            className="pointer-events-none h-full w-full object-cover"
          />
        )}
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
          {!controlado && (
            <>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
              <button type="button" onClick={() => setSelecionado(false)} className="rounded-lg px-2 py-1 text-neutral-400 hover:bg-white/10" aria-label="Fechar ajustes">
                ✕
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
