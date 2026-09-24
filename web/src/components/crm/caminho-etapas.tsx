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

      {/* ERA CLICÁVEL E NÃO PARECIA. Ele testou e não descobriu: "a pessoa tem que clicar
          manualmente? eu mesmo testando não sabia". A frase abaixo diz o que é automático e o
          que é dele -- e os degraus ganharam cursor, hover e um tracejado que respira no
          próximo. Affordance que só existe no código não existe. */}
      <p className="mt-2 text-xs text-neutral-500">
        <strong className="font-semibold text-neutral-700">Você avança no toque.</strong> O Encena marca sozinho só o <strong className="font-semibold text-neutral-700">Novo → Em conversa</strong>, quando
        você manda a primeira mensagem ou diz que ela respondeu. Visita, proposta e fechado só você sabe que aconteceram.
      </p>

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
            /**
             * O degrau seguinte: é o que a pessoa vai marcar quando acontecer.
             *
             * Sai de `ate` e não de `i` porque num DESVIO (sem resposta, perdido) o `i` é -1 e
             * nenhum degrau seria o próximo -- justo quando o convite é mais necessário, que é
             * a conversa parada esperando alguém retomar. Lá `ate` vale 1, então o convite cai
             * em "Visita", que é o próximo passo de verdade.
             */
            const proximo = k === ate + 1 && ate + 1 < CAMINHO.length;
            return (
              <li key={e} className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => aoMudar(e)}
                  aria-current={atual ? "step" : undefined}
                  aria-label={`Marcar ${ETAPA_POR_ID[e].rotulo}`}
                  title={atual ? "É aqui que a conversa está" : `Marcar como ${ETAPA_POR_ID[e].rotulo}`}
                  className="group flex min-h-11 cursor-pointer flex-col items-center gap-1.5"
                >
                  <span
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300 " +
                      (atual
                        ? "scale-110 border-marca-coral bg-marca-coral text-white shadow-md shadow-marca-coral/30"
                        : feito
                          ? "border-marca-coral bg-white text-marca-coral group-hover:scale-110"
                          : // O PRÓXIMO degrau pisca de leve e é tracejado: é ele que a pessoa
                            // vai marcar quando a visita acontecer, e era isso que não se via.
                            (proximo ? "border-dashed border-marca-coral/60 text-marca-coral/70 respirar " : "border-neutral-200 text-neutral-400 ") +
                            "bg-white group-hover:scale-110 group-hover:border-marca-coral group-hover:text-marca-coral")
                    }
                  >
                    {feito ? "✓" : k + 1}
                  </span>
                  <span className={`text-center text-[11px] leading-tight transition sm:text-xs ${atual ? "font-semibold text-neutral-900" : "text-neutral-500 group-hover:text-marca-indigo"}`}>
                    {ETAPA_POR_ID[e].rotulo}
                  </span>
                  {/* O CONVITE ESCRITO, embaixo do próximo degrau.

                      Esta é a segunda tentativa. Na primeira eu dei cursor, hover e um
                      tracejado que respira -- e ele voltou dizendo "eu mesmo não havia
                      percebido e acho que continua escondido". A lição: animação sutil não
                      ensina o que fazer, ela só sugere que algo é vivo. Quem ensina é frase.

                      Fica sempre visível, não no hover: no celular não existe hover, e é no
                      celular que o corretor mexe no cliente depois da visita. */}
                  {proximo && !ocupado && (
                    <span className="-mt-0.5 rounded-full bg-marca-coral/10 px-1.5 py-px text-[9px] font-semibold text-marca-coral sm:text-[10px]">
                      toque aqui
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Cartao>
  );
}
