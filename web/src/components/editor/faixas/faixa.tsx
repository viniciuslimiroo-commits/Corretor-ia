"use client";

import { memo } from "react";
import { mesmoRef, type BlocoLinha, type FaixaId, type RefItem } from "@/lib/linha-do-tempo";
import type { MusicaId } from "@/lib/video";
import type { PicosDaFaixa } from "@/lib/picos-audio";
import Bloco from "./bloco";
import { COR_DA_FAIXA, ICONE_DA_FAIXA, NOME_DA_TRILHA, type Medidas } from "./comum";

// UMA FAIXA (D3). Fechada é a tira de 8px, com os blocos desenhados como barras de 6px na
// cor da faixa: diz que ali tem coisa, e onde, sem gastar altura. Tocar nela só ABRE a
// faixa -- nunca seleciona um bloco que a pessoa mal enxerga. Aberta tem 44px no celular
// (28 no computador), blocos com 2px de folga em cima e embaixo.
//
// Fundo vazio de faixa aberta desseleciona (`faixa-vazia`).

type Props = {
  id: FaixaId;
  blocos: BlocoLinha[];
  aberta: boolean;
  medidas: Medidas;
  pxs: number;
  selecao: RefItem | null;
  picos: Partial<Record<MusicaId, PicosDaFaixa>>;
  semSom: Set<string>;
  celular: boolean;
};

/** A chave estável do bloco pro motor de gestos: "trilha:índice". */
export const chaveDoBloco = (trilha: string, i: number) => `${trilha}:${i}`;


function Faixa({ id, blocos, aberta, medidas, pxs, selecao, picos, semSom, celular }: Props) {
  const altura = aberta ? medidas.faixa : medidas.fina;
  return (
    <div className="relative flex" style={{ height: altura }} data-faixa={id}>
      {!celular && (
        <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-[var(--ed-linha)] bg-[var(--ed-base)] px-3 text-[12px] font-medium text-[var(--ed-texto-2)]" style={{ width: medidas.rotulos }}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#0a1529]" style={{ backgroundColor: COR_DA_FAIXA[id] }}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONE_DA_FAIXA[id]} />
            </svg>
          </span>
          <span className="truncate">{NOME_DA_TRILHA[id]}</span>
        </div>
      )}
      <div
        data-alvo={aberta ? "faixa-vazia" : "faixa-fina"}
        data-faixa={id}
        className={`relative flex-1 ${aberta ? "rounded-lg" : ""}`}
        style={{ backgroundColor: aberta ? "var(--trilho-faixa)" : "transparent", touchAction: "pan-x" }}
      >
        {blocos.map((b, i) => {
          const chave = chaveDoBloco(id, i);
          const selecionado = !!selecao && (mesmoRef(b.ref, selecao) || !!b.itens?.some((r) => mesmoRef(r, selecao)));
          const onda = b.onda ? picos[b.onda.musica] : undefined;
          const semSomAqui = b.ref.faixa === "musica" || b.ref.faixa === "voz" ? semSom.has(b.ref.id) : b.ref.faixa === "voce" ? semSom.has("voce") : false;
          return <Bloco key={chave} chave={chave} bloco={semSomAqui ? { ...b, semSom: true } : b} pxs={pxs} selecionado={selecionado} picos={onda} fino={!aberta} />;
        })}
      </div>
    </div>
  );
}

export default memo(Faixa);
