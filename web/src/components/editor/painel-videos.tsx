"use client";

import { Icone } from "@/components/ui";
import type { Selecao } from "@/lib/usar-selecao";
import { Vazio } from "./ui-editor";

// SEUS VÍDEOS, prontos pra entrar na linha do tempo.
//
// Antes, tocar num vídeo desta lista abria um cartão de "vídeo pronto" em cima do palco (e
// às vezes nada aparecia); pôr o vídeo na linha do tempo não existia -- o servidor recusava.
// Agora o gesto principal é o que a pessoa tentava fazer: TOCAR põe o vídeo no fim da
// linha do tempo (em partes de até 8s, se for longo), ARRASTAR põe onde soltar. Assistir,
// reabrir o projeto e apagar ficam no "⋯" de cada vídeo.

export type VideoDaLista = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null };

type Props = {
  videos: VideoDaLista[] | null;
  /** Vídeos sendo buscados pra entrar (o toque já foi): mostra que está indo. */
  entrando: Set<string>;
  /** Quantas cenas da linha já usam cada vídeo. */
  usados: Record<string, number>;
  gerando: boolean;
  aoAdicionar(v: VideoDaLista): void;
  aoMais(v: VideoDaLista, x: number, y: number): void;
  /** Marcar vários pra apagar de uma vez. Enquanto ligada, TOCAR marca em vez de adicionar. */
  selecao: Selecao;
  apagando: boolean;
  aoApagarMarcados(): void;
};

const duracaoCurta = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export default function PainelVideos({ videos, entrando, usados, gerando, aoAdicionar, aoMais, selecao, apagando, aoApagarMarcados }: Props) {
  if (videos === null) {
    return (
      <ul className="grid grid-cols-2 gap-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[var(--ed-elevado)]" />
        ))}
      </ul>
    );
  }
  if (videos.length === 0) {
    return <Vazio icone="video" titulo="Nenhum vídeo ainda" texto="Os vídeos que você gerar aparecem aqui e podem virar parte de outro vídeo." />;
  }
  const marcados = selecao.marcados.length;
  return (
    <div className="flex flex-col gap-3">
      {/* A BARRA DE MARCAR. Fora do modo ela é um link discreto: apagar sempre à mão
          convida ao acidente, e o gesto principal desta lista é PÔR o vídeo na linha. */}
      <div className="flex items-center justify-between gap-2 text-[12px]">
        {selecao.ligada ? (
          <>
            <span className="text-[var(--ed-texto-2)]">
              {marcados === 0 ? "Toque nos vídeos pra marcar" : `${marcados} marcado${marcados > 1 ? "s" : ""}`}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={selecao.marcarTodos} className="rounded-md px-2 py-1 font-medium text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]">
                Todos
              </button>
              <button type="button" onClick={selecao.desligar} className="rounded-md px-2 py-1 font-medium text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]">
                Cancelar
              </button>
              <button
                type="button"
                onClick={aoApagarMarcados}
                disabled={marcados === 0 || apagando}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 font-semibold text-white transition hover:bg-red-500 disabled:opacity-35 disabled:hover:bg-red-600"
              >
                <Icone nome="lixeira" className="h-3.5 w-3.5" />
                {apagando ? "Apagando…" : `Apagar · ${marcados}`}
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="text-[var(--ed-texto-3)]">Toque pra pôr na linha do tempo</span>
            <button type="button" onClick={selecao.ligar} className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]">
              <Icone nome="check" className="h-3.5 w-3.5" />
              Selecionar
            </button>
          </>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3" data-lista-videos="1">
      {videos.map((v) => {
        const pronto = v.status === "concluido";
        const indo = entrando.has(v.id);
        const n = usados[v.id] ?? 0;
        const marcado = selecao.marcado(v.id);
        return (
          <li key={v.id} className="group relative min-w-0">
            <button
              type="button"
              data-video-id={v.id}
              data-marcado={marcado ? "1" : undefined}
              // Marcando, nada é arrastável nem desligado: o que mais se quer tirar da
              // lista é justamente o que falhou, e desligado não dá pra marcar.
              draggable={!selecao.ligada && pronto && !gerando}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/encena-video", v.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(e) => (selecao.ligada ? selecao.alternar(v.id, e.shiftKey) : pronto && !indo && aoAdicionar(v))}
              disabled={!selecao.ligada && (!pronto || gerando)}
              title={
                selecao.ligada
                  ? `${marcado ? "Desmarcar" : "Marcar"} ${v.titulo} · com Shift marca daqui até o último`
                  : pronto
                    ? `${v.titulo} · toque pra pôr no fim da linha do tempo, ou arraste pro lugar`
                    : v.status === "gerando"
                      ? "Ainda gerando"
                      : "Este vídeo falhou"
              }
              className={
                "relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[var(--ed-elevado)] ring-1 ring-inset transition disabled:cursor-not-allowed " +
                (marcado ? "ring-2 ring-red-500" : "ring-[var(--ed-linha)] hover:ring-2 hover:ring-[var(--ed-acento)] disabled:hover:ring-[var(--ed-linha)]")
              }
            >
              {v.miniatura ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.miniatura} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" draggable={false} />
              ) : (
                <span className="grid h-full w-full place-items-center text-[var(--ed-texto-3)]">
                  <Icone nome="video" className="h-8 w-8" />
                </span>
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />
              {n > 0 && (
                <span className="absolute top-2 left-2 rounded-full bg-[var(--ed-acento)] px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                  Na linha{n > 1 ? ` ×${n}` : ""}
                </span>
              )}
              {v.duracao ? <span className="absolute right-2 bottom-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{duracaoCurta(v.duracao)}</span> : null}
              {!pronto && (
                <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] font-medium text-white">{v.status === "gerando" ? "Gerando…" : "Falhou"}</span>
              )}
              {/* Marcando, a bolinha fica SEMPRE à vista (também no celular, que não tem
                  passar o mouse): sem ela não dá pra saber o que já foi marcado. */}
              {selecao.ligada && (
                <span
                  className={
                    "absolute top-2 left-2 grid h-7 w-7 place-items-center rounded-full border-2 transition " +
                    (marcado ? "border-red-500 bg-red-500 text-white" : "border-white/80 bg-black/30 text-transparent")
                  }
                >
                  <Icone nome="check" className="h-4 w-4" />
                </span>
              )}
              {pronto && !selecao.ligada && (
                <span className={`absolute inset-0 grid place-items-center transition ${indo ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-md:hidden"}`}>
                  <span className="flex items-center gap-1.5 rounded-full bg-[var(--ed-acento)] px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg">
                    {indo ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Entrando…
                      </>
                    ) : (
                      <>
                        <Icone nome="mais" className="h-4 w-4" />
                        Adicionar
                      </>
                    )}
                  </span>
                </span>
              )}
            </button>
            <div className="mt-2 flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--ed-texto)]">{v.titulo}</p>
                <p className="truncate text-[11.5px] text-[var(--ed-texto-3)]">
                  {dataCurta(v.criadoEm)} · {v.formato}
                </p>
              </div>
              {/* Marcando, o "⋯" some: ele abre assistir/editar/apagar DE UM, e dois jeitos
                  de apagar na mesma tela ao mesmo tempo é onde o dedo erra. */}
              {!selecao.ligada && (
                <button
                  type="button"
                  aria-label={`Mais opções de ${v.titulo}`}
                  title="Assistir, editar o projeto ou apagar"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    aoMais(v, r.left, r.bottom + 4);
                  }}
                  className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)] max-md:h-10 max-md:w-10"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
