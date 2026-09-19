"use client";

import { useEffect, useState } from "react";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";

// O TEMPO AO VIVO, só pra quem precisa dele a cada instante.
//
// Enquanto o Play toca, o editor INTEIRO não redesenha mais a cada 100ms (eram quatro mil
// linhas de interface, painéis incluídos, dez vezes por segundo -- é o que fazia a página
// "travar" no celular). Quem precisa do segundo exato enquanto toca -- o relógio da barra,
// a legenda no palco, o Você, o clipe no palco -- assina o relógio da prévia por aqui e
// redesenha SOZINHO. Parado, vale o tempo que o editor guarda (`parado`).

export function useTempoAoVivo(relogio: RelogioDaPrevia | null | undefined, parado: number, tocando: boolean, passoMs = 100): number {
  const [aoVivo, setAoVivo] = useState(parado);
  useEffect(() => {
    if (!tocando || !relogio) return;
    let ultimo = 0;
    const desassinar = relogio.assinar((t) => {
      const agora = performance.now();
      if (agora - ultimo < passoMs) return;
      ultimo = agora;
      setAoVivo(Math.round(t * 100) / 100);
    });
    return desassinar;
  }, [relogio, tocando, passoMs]);
  return tocando ? aoVivo : parado;
}
