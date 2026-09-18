"use client";

import { memo, useMemo } from "react";
import { caminhoDaOnda, type PicosDaFaixa } from "@/lib/picos-audio";

// A ONDA da música dentro do bloco (D3). Um SVG por bloco, com o caminho das voltas que o
// trecho cobre (laço = a mesma onda repetida), recortado pelo viewBox no pedaço do arquivo
// que toca: o x do caminho é "segundo do arquivo × 20", então `corte*20` a `(corte+dur)*20`
// é exatamente o trecho. Esticado na largura do bloco com preserveAspectRatio="none".
//
// O caminho é memorizado por (música, voltas): arrastar o bloco muda só o viewBox.

type Props = {
  picos: PicosDaFaixa | undefined;
  corte: number;
  duracao: number;
  laco: boolean;
  fades?: { entrada: number; saida: number };
};

function FormaDeOnda({ picos, corte, duracao, laco, fades }: Props) {
  const voltas = picos ? Math.max(1, Math.ceil((corte + duracao) / Math.max(picos.segundos, 0.1))) : 1;
  const caminho = useMemo(() => (picos ? caminhoDaOnda(picos.picos, { voltas: laco ? voltas : 1 }) : ""), [picos, voltas, laco]);
  if (!picos || duracao <= 0) return null;
  const k = picos.porSeg;
  const fi = Math.min(fades?.entrada ?? 0, duracao);
  const fo = Math.min(fades?.saida ?? 0, duracao);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`${corte * k} 0 ${Math.max(duracao * k, 0.1)} 255`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={caminho} fill="currentColor" opacity={0.55} />
      {fi > 0 && <path d={`M${corte * k} 0 L${(corte + fi) * k} 0 L${corte * k} 255 Z`} fill="#081227" opacity={0.35} />}
      {fo > 0 && <path d={`M${(corte + duracao) * k} 0 L${(corte + duracao - fo) * k} 0 L${(corte + duracao) * k} 255 Z`} fill="#081227" opacity={0.35} />}
    </svg>
  );
}

export default memo(FormaDeOnda);
