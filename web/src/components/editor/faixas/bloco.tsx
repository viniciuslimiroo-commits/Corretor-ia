"use client";

import { memo } from "react";
import type { BlocoLinha } from "@/lib/linha-do-tempo";
import type { PicosDaFaixa } from "@/lib/picos-audio";
import { COR_DA_FAIXA, ICONE_DA_FAIXA as ICONE, zonaDaAlca } from "./comum";
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
      className={`absolute overflow-visible ${fino ? "top-[2px] bottom-[2px] rounded-full" : "top-[3px] bottom-[3px] rounded-lg"}`}
      style={{
        left: `calc(var(--pxs) * ${bloco.de})`,
        width: `calc(var(--pxs) * ${dur} - 1px)`,
        minWidth: fino ? 2 : 3,
        backgroundColor: cor,
        backgroundImage: hachura ?? (fino ? undefined : "linear-gradient(to bottom, rgb(255 255 255 / 0.18), rgb(255 255 255 / 0) 55%)"),
        color: "#0a1529",
        touchAction: toque,
        boxShadow: selecionado && !fino ? "0 0 0 2px var(--ed-base, #0a1529), 0 0 0 4px var(--marca-coral), 0 0 0 8px rgb(240 107 79 / 0.18)" : fino ? undefined : "inset 0 0 0 1px rgb(0 0 0 / 0.12)",
        zIndex: selecionado ? 3 : 1,
      }}
    >
      {bloco.onda && !fino && (
        <div className="absolute inset-0 overflow-hidden rounded-lg opacity-80">
          <FormaDeOnda picos={picos} corte={bloco.onda.corte} duracao={bloco.onda.duracao} laco={bloco.onda.laco} fades={bloco.fades} />
        </div>
      )}
      {comTexto && (
        <div className="pointer-events-none relative flex h-full min-w-0 items-center gap-1.5 px-2 text-[11.5px] font-semibold leading-none">
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
          className="absolute top-[-3px] bottom-[-3px] z-10 cursor-ew-resize"
          style={{ left: -zona.fora, width: 44, touchAction: "none" }}
        >
          <div className="absolute top-0 bottom-0 grid w-2.5 place-items-center rounded-l-lg bg-marca-coral" style={{ left: zona.fora - 2 }}>
            <span className="h-3 w-0.5 rounded-full bg-white/90" />
          </div>
        </div>
      )}
      {alcas.fim && (
        <div
          data-alvo="alca-fim"
          data-chave={chave}
          className="absolute top-[-3px] bottom-[-3px] z-10 cursor-ew-resize"
          style={{ right: -zona.fora, width: 44, touchAction: "none" }}
        >
          <div className="absolute top-0 bottom-0 grid w-2.5 place-items-center rounded-r-lg bg-marca-coral" style={{ right: zona.fora - 2 }}>
            <span className="h-3 w-0.5 rounded-full bg-white/90" />
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Bloco);
