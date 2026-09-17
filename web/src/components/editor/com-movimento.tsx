"use client";

import { useEffect, type RefObject } from "react";
import { periodoDoMovimento, quadrosChaveDoMovimento, temMovimento } from "@/lib/movimentos";

// O movimento em laço no PALCO, com os mesmos números do vídeo.
//
// Web Animations API em vez de @keyframes no CSS: os quadros-chave saem de
// `poseDoMovimento`, a mesma função com que o servidor desenha os quadros. Uma animação
// CSS escrita à mão seria uma segunda versão do balanço -- e a primeira a divergir.

export function useMovimento(ref: RefObject<HTMLElement | null>, movimento: string | undefined, aspecto: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !temMovimento(movimento) || typeof el.animate !== "function") return;
    const animacao = el.animate(quadrosChaveDoMovimento(movimento, aspecto), {
      duration: periodoDoMovimento(movimento) * 1000,
      iterations: Infinity,
    });
    return () => animacao.cancel();
  }, [ref, movimento, aspecto]);
}
