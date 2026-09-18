"use client";

import { memo } from "react";
import type { BlocoLinha } from "@/lib/linha-do-tempo";
import type { PicosDaFaixa } from "@/lib/picos-audio";
import { COR_DA_FAIXA, zonaDaAlca } from "./comum";
import FormaDeOnda from "./forma-de-onda";

// UM BLOCO numa faixa aberta (D3).
//
// Posição e largura em `calc(var(--pxs) * segundos)`: a pinça muda só a variável na raiz,
// e todos os blocos acompanham sem o React redesenhar nada.
//
// Os gestos não moram aqui: o bloco só se descreve em `data-*` (qual é, se está
// selecionado, se se move) e o motor de gestos da linha lê isso no toque. É o que deixa um
// ouvinte só, no contêiner, decidir entre rolar, arrastar, aparar, tocar e segurar.
//
// Alça: a zona de toque tem SEMPRE 44px, mesmo num bloco de 30px -- metade (até 22) pra
// dentro do bloco, o resto pra fora, por cima do vizinho enquanto o bloco está selecionado.

type Props = {
  bloco: BlocoLinha;
  chave: string;
  pxs: number;
  selecionado: boolean;
  picos?: PicosDaFaixa;
  /** Sem ícone e sem texto: a tira de 6px da faixa fechada. */
  fino?: boolean;
};

const ICONE: Record<string, string> = {
  voce: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  voz: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 9a6 6 0 0 0 12 0M12 18v3",
  musica: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  textos: "M5 6h14M12 6v13M9 19h6",
  adesivos: "M12 3l2.6 5.6L20 9.3l-4 4.1.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-4.1 5.4-.7Z",
  legendas: "M4 6h16v12H4zM7 13h4M13 13h4M7 16h10",
};

function Bloco({ bloco, chave, pxs, selecionado, picos, fino }: Props) {
  const faixa = bloco.trilha === "cenas" ? null : bloco.trilha;
  const cor = faixa ? COR_DA_FAIXA[faixa] : "var(--letra-fraca)";
  const dur = Math.max(0, bloco.ate - bloco.de);
  const largura = dur * pxs;
  const comTexto = !fino && largura >= 48;
  const alcas = selecionado && !fino ? bloco.alcas : { inicio: false, fim: false };
  const zona = zonaDaAlca(largura);
  const hachura = bloco.foraDoVideo
    ? "repeating-linear-gradient(135deg, rgb(240 107 79 / .55) 0 4px, transparent 4px 8px)"
    : bloco.estimado
      ? "repeating-linear-gradient(135deg, rgb(8 18 39 / .22) 0 4px, transparent 4px 8px)"
      : undefined;
  // Toque num bloco NÃO selecionado rola a linha (pan-x). O selecionado para de rolar: o
  // dedo nele arrasta. A alça, idem.
  const toque = selecionado && !fino ? "none" : "pan-x";

  return (
    <div
      data-alvo={fino ? "faixa-fina" : "bloco"}
      data-chave={chave}
      data-selecionado={selecionado ? "1" : undefined}
      data-largura={Math.round(largura)}
      title={bloco.foraDoVideo ? "Depois do fim do vídeo — sai fora" : bloco.rotulo}
      className={`absolute overflow-visible ${fino ? "top-[1px] bottom-[1px] rounded-[3px]" : "top-[2px] bottom-[2px] rounded-md"}`}
      style={{
        left: `calc(var(--pxs) * ${bloco.de})`,
        width: `calc(var(--pxs) * ${dur})`,
        minWidth: fino ? 2 : 3,
        backgroundColor: cor,
        backgroundImage: hachura,
        color: "#081227",
        touchAction: toque,
        outline: selecionado && !fino ? "2px solid var(--marca-coral)" : undefined,
        outlineOffset: selecionado && !fino ? 1 : undefined,
        zIndex: selecionado ? 3 : 1,
      }}
    >
      {bloco.onda && !fino && (
        <div className="absolute inset-0 overflow-hidden rounded-md">
          <FormaDeOnda picos={picos} corte={bloco.onda.corte} duracao={bloco.onda.duracao} laco={bloco.onda.laco} fades={bloco.fades} />
        </div>
      )}
      {comTexto && (
        <div className="pointer-events-none relative flex h-full min-w-0 items-center gap-1 px-1.5 text-[11px] font-semibold leading-none">
          {faixa && (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONE[faixa]} />
            </svg>
          )}
          {bloco.preso && (
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-label="Preso à foto">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
          )}
          <span className="truncate">{bloco.estimado ? `≈ ${bloco.rotulo}` : bloco.rotulo}</span>
          {bloco.semSom && (
            <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-label="Prévia sem som">
              <path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" />
            </svg>
          )}
        </div>
      )}
      {!fino && (bloco.contagem ?? 0) > 1 && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#081227] px-1 text-[10px] font-bold text-white">
          {bloco.contagem}
        </span>
      )}
      {alcas.inicio && (
        <div
          data-alvo="alca-inicio"
          data-chave={chave}
          className="absolute top-[-2px] bottom-[-2px] z-10"
          style={{ left: -zona.fora, width: 44, touchAction: "none" }}
        >
          <div className="absolute top-0 bottom-0 w-[6px] rounded-l-md bg-marca-coral" style={{ left: zona.fora - 1 }} />
        </div>
      )}
      {alcas.fim && (
        <div
          data-alvo="alca-fim"
          data-chave={chave}
          className="absolute top-[-2px] bottom-[-2px] z-10"
          style={{ right: -zona.fora, width: 44, touchAction: "none" }}
        >
          <div className="absolute top-0 bottom-0 w-[6px] rounded-r-md bg-marca-coral" style={{ right: zona.fora - 1 }} />
        </div>
      )}
    </div>
  );
}

export default memo(Bloco);
