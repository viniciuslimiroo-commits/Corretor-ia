"use client";

import { Cartao } from "@/components/ui";
import { ETAPA_POR_ID, type EtapaId } from "@/lib/crm";
import { COR_ETAPA } from "./comum";

// As etapas como um CAMINHO (Novo -> Em conversa -> Visita -> Proposta -> Fechado), com a
// barra enchendo até onde a pessoa está. "Sem resposta" e "Perdido" não são degraus do
// caminho -- são desvios -- e ficam à parte. Tocar num ponto muda a etapa.

const CAMINHO: EtapaId[] = ["novo", "em_contato", "visita", "proposta", "fechado"];
const DESVIOS: EtapaId[] = ["sem_resposta", "perdido"];

export default function CaminhoEtapas({ etapa, ocupado, aoMudar }: { etapa: EtapaId; ocupado: boolean; aoMudar: (e: EtapaId) => void }) {
  const i = CAMINHO.indexOf(etapa);
  // Fora do caminho (desvio), a barra fica onde a conversa parou: em "Em conversa".
  const ate = i >= 0 ? i : 1;
  const fracao = ate / (CAMINHO.length - 1);

  return (
    <Cartao className="surgir" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Etapa</p>
        <div className="flex gap-1.5">
          {DESVIOS.map((d) => (
            <button
              key={d}
              type="button"
              disabled={ocupado}
              onClick={() => aoMudar(d)}
              aria-pressed={etapa === d}
              className={
                "min-h-10 rounded-full px-3 text-xs font-medium transition sm:min-h-8 " +
                (etapa === d ? `${COR_ETAPA[d].fundo} ${COR_ETAPA[d].texto} ring-1 ring-current` : "text-neutral-500 hover:bg-neutral-100")
              }
            >
              {ETAPA_POR_ID[d].rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-5 px-1">
        {/* O trilho e o quanto já andou. */}
        <div className="absolute top-4 right-[10%] left-[10%] h-1 rounded-full bg-neutral-200" />
        <div
          className={`absolute top-4 left-[10%] h-1 rounded-full transition-all duration-700 ease-out ${i >= 0 ? "bg-marca-coral" : "bg-neutral-300"}`}
          style={{ width: `${fracao * 80}%` }}
        />
        <ol className="relative grid grid-cols-5">
          {CAMINHO.map((e, k) => {
            const feito = i >= 0 && k < i;
            const atual = e === etapa;
            return (
              <li key={e} className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => aoMudar(e)}
                  aria-current={atual ? "step" : undefined}
                  aria-label={ETAPA_POR_ID[e].rotulo}
                  className="group flex min-h-11 flex-col items-center gap-1.5"
                >
                  <span
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300 " +
                      (atual
                        ? "scale-110 border-marca-coral bg-marca-coral text-white shadow-md shadow-marca-coral/30"
                        : feito
                          ? "border-marca-coral bg-white text-marca-coral"
                          : "border-neutral-200 bg-white text-neutral-400 group-hover:border-neutral-400")
                    }
                  >
                    {feito ? "✓" : k + 1}
                  </span>
                  <span className={`text-center text-[11px] leading-tight sm:text-xs ${atual ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>{ETAPA_POR_ID[e].rotulo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Cartao>
  );
}
