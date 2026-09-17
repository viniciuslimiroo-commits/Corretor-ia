"use client";

import { useEffect, useRef, useState } from "react";
import type { FormatoId } from "@/lib/video";
import { useMovimento } from "@/components/editor/com-movimento";

// UM TEXTO COM EFEITO no palco, desenhado pelo servidor.
//
// O efeito é contorno de fonte de verdade, e a fonte só existe no servidor -- então a tela
// pede o SVG pronto à rota /api/editor/efeito-texto, que usa a MESMA função da montagem
// do vídeo. A resposta vem num quadro de 1000 de altura e aqui vira porcentagem do palco:
// o tamanho na tela é o tamanho no vídeo, inclusive quando a frase longa é reduzida pra
// caber na largura.
//
// `movimento` (pulsar, balançar...) anima com os mesmos números do vídeo; `caber` é pro
// cartão da galeria, onde o texto ocupa a caixa em vez da fração do vídeo.

type Desenho = { svg: string; largura: number; altura: number; W: number; H: number };

/** Desenhos já pedidos, por endereço: redesenhar o palco não pode refazer a requisição. */
const cache = new Map<string, Promise<Desenho | null>>();

function pedir(url: string): Promise<Desenho | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<Desenho>) : null))
      .catch(() => null);
    cache.set(url, p);
    // Falhou: sai do cache, senão uma queda de rede vira texto sumido até recarregar.
    p.then((d) => {
      if (!d) cache.delete(url);
    });
  }
  return p;
}

export default function TextoComEfeito({
  efeito,
  texto,
  formato,
  n,
  movimento,
  caber = false,
}: {
  efeito: string;
  texto: string;
  formato: FormatoId;
  n: number;
  movimento?: string;
  caber?: boolean;
}) {
  const url = `/api/editor/efeito-texto?id=${encodeURIComponent(efeito)}&texto=${encodeURIComponent(texto)}&formato=${encodeURIComponent(formato)}&n=${n}`;
  const [desenho, setDesenho] = useState<{ url: string; d: Desenho } | null>(null);
  const alvo = useRef<HTMLSpanElement | null>(null);
  const aspecto = caber ? 1 : desenho ? desenho.d.largura / Math.max(1, desenho.d.altura) : 1;
  useMovimento(alvo, desenho ? movimento : undefined, aspecto);

  useEffect(() => {
    let vivo = true;
    pedir(url).then((d) => {
      if (vivo && d) setDesenho({ url, d });
    });
    return () => {
      vivo = false;
    };
  }, [url]);

  // Enquanto o desenho novo não chega, o antigo fica na tela (é o mesmo efeito com o texto
  // de um instante atrás) -- piscar vazio a cada letra digitada seria pior.
  if (!desenho) return <span className={caber ? "block h-1/3 w-2/3 animate-pulse rounded bg-white/15" : "inline-block h-[4%] w-[40%] animate-pulse rounded bg-white/20"} />;
  const { d } = desenho;
  return (
    <span
      ref={alvo}
      className={caber ? "pointer-events-none block h-full w-full" : "pointer-events-auto block"}
      style={caber ? undefined : { width: `${(d.largura / d.W) * 100}%`, aspectRatio: `${d.largura} / ${d.altura}` }}
      // SVG desenhado pelo nosso servidor, só com contornos: o texto não entra como texto.
      dangerouslySetInnerHTML={{ __html: d.svg.replace("<svg ", `<svg style="width:100%;height:100%;display:block" `) }}
    />
  );
}
