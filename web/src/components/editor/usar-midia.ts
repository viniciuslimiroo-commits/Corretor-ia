"use client";

import { useEffect, useState } from "react";

/**
 * Se a tela bate com a consulta de mídia AGORA, e acompanha quando ela muda (girar o
 * celular, redimensionar a janela). Começa em `inicial` até o navegador responder.
 */
export function useMidia(consulta: string, inicial = false): boolean {
  // Já nasce com a resposta certa quando há janela: sem isso o celular abria um instante no
  // layout do computador e pulava pro dele (e o que a pessoa tocou nesse instante se perdia).
  const [bate, setBate] = useState(() => (typeof window !== "undefined" ? window.matchMedia(consulta).matches : inicial));
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const mudou = () => setBate(m.matches);
    Promise.resolve().then(mudou);
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, [consulta]);
  return bate;
}
