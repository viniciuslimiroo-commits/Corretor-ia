"use client";

import { memo } from "react";
import type { Legendas } from "@/lib/video";

// A LEGENDA NO PALCO (docs/planos/linha-do-tempo-spec.md, D1 e D9; pacote P6), no lugar e
// no tamanho em que o ffmpeg a queima (video-ffmpeg.ts, `filtrosDeLegenda`):
//
//   letra = 3,4% da altura; largura útil = 86% (a frase quebra dentro dela);
//   embaixo: 14% acima do pé -- 36% quando o Você está em faixa no pé (legenda atrás de
//   rosto não é legenda); "no meio": centro vertical;
//   "com fundo": caixa preta a 60% com folga de 0,4 da letra; "sem fundo": contorno preto.
//
// Mostra o trecho do segundo atual. Um toque seleciona o trecho (a linha do tempo abre
// nele); selecionado ganha o tracejado coral, como as outras peças do palco.

type Props = {
  legendas: Legendas | null;
  tempo: number;
  /** Altura do quadro do palco, em px: a letra é 3,4% dela. */
  alturaPalco: number;
  apresentadorNoPe: boolean;
  selecionado?: number | null;
  aoSelecionar?(i: number): void;
};

function LegendaNoPalco({ legendas, tempo, alturaPalco, apresentadorNoPe, selecionado, aoSelecionar }: Props) {
  if (!legendas?.trechos.length || alturaPalco <= 0) return null;
  const i = legendas.trechos.findIndex((t) => tempo >= t.inicio && tempo < t.fim);
  if (i < 0) return null;
  const t = legendas.trechos[i];
  const letra = alturaPalco * 0.034;
  const comFundo = (legendas.estilo ?? "faixa") === "faixa";
  const centro = legendas.posicao === "centro";
  const contorno = Math.max(1, letra * 0.09);
  return (
    <div
      data-legenda-palco={i}
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
      style={centro ? { top: "50%", transform: "translateY(-50%)" } : { bottom: `${apresentadorNoPe ? 36 : 14}%` }}
    >
      <span
        role={aoSelecionar ? "button" : undefined}
        tabIndex={aoSelecionar ? 0 : undefined}
        onClick={aoSelecionar ? () => aoSelecionar(i) : undefined}
        className={`pointer-events-auto max-w-[86%] whitespace-pre-wrap text-center font-medium text-white ${selecionado === i ? "outline-2 outline-offset-2 outline-dashed outline-[#f06b4f]" : ""}`}
        style={{
          fontSize: letra,
          lineHeight: 1.25,
          ...(comFundo
            ? { backgroundColor: "rgb(0 0 0 / .6)", padding: `${letra * 0.4}px`, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
            : { textShadow: `0 0 ${contorno}px #000, 0 0 ${contorno}px #000, 0 0 ${contorno}px #000` }),
        }}
      >
        {t.texto}
      </span>
    </div>
  );
}

export default memo(LegendaNoPalco);
