"use client";

import { useEffect, useMemo, useRef } from "react";
import { Icone } from "@/components/ui";
import { LIMITES } from "@/lib/video";

// A LINHA DO TEMPO de verdade: régua, blocos proporcionais e cabeçote.
//
// Antes as cenas eram uma fila de cartões do MESMO tamanho. Isso é uma lista, não uma
// linha do tempo -- e era o motivo de a tela não parecer um editor por mais que a coluna
// estivesse no lugar certo. O que faz alguém reconhecer uma linha do tempo é:
//
//   1. o bloco ser LARGO NA MEDIDA DA DURAÇÃO (uma cena de 8s ocupa o dobro de uma de 4s);
//   2. existir uma RÉGUA em cima com o tempo marcado;
//   3. existir um CABEÇOTE que diz onde você está e que anda quando toca.
//
// Nada disso é enfeite: os três juntos respondem "quanto tempo tem meu vídeo e onde está
// cada coisa", que é a pergunta que a lista de cartões não respondia.
//
// Uma trilha só, de propósito. Doze trilhas é o que faz o corretor fechar a aba -- a
// música, a voz e as legendas do Encena valem pro vídeo inteiro, então não são blocos
// que se arrastam: são propriedades, e moram no painel.

export type BlocoCena = {
  chave: string;
  rotulo: string;
  miniatura: string | null;
  duracao: number;
  tipo: string;
  /** Rótulo curto da emenda desta cena pra próxima. */
  emenda: string;
  /** Tem vídeo correndo por baixo. Velocidade, congelar e aparar só valem aqui. */
  temVideo: boolean;
  /** Estado das ferramentas, pra barra mostrar o que já está ligado. */
  giro?: number;
  espelho?: boolean;
  velocidade?: number;
  congelado?: boolean;
};

/**
 * Um botão da barra de ferramentas.
 *
 * Só ícone, e o nome da ação vai no `title` e no `aria-label`: com dez ferramentas, texto
 * ao lado de cada uma não cabe num celular de 375px -- e é no celular que ele edita.
 */
function Ferramenta({
  icone,
  dica,
  ativo,
  desligado,
  aoClicar,
}: {
  icone: string;
  dica: string;
  ativo?: boolean;
  desligado?: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desligado}
      title={dica}
      aria-label={dica}
      className={`shrink-0 rounded-lg p-1.5 transition disabled:opacity-25 ${
        ativo ? "bg-marca-indigo/10 text-marca-indigo" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <Icone nome={icone} className="h-4 w-4" />
    </button>
  );
}

/** Marcações a cada 1, 2, 5, 10, 15, 30 ou 60s -- a primeira que der pelo menos 64px. */
function passoDaRegua(pxPorSegundo: number): number {
  for (const p of [1, 2, 5, 10, 15, 30, 60]) if (p * pxPorSegundo >= 64) return p;
  return 60;
}

export function relogio(segundos: number): string {
  // Em décimos inteiros, com folga de arredondamento: 14,2 guardado como 14,1999… saía
  // "00:14.1" -- e o relógio embaixo discordava do vídeo pronto por um décimo.
  const decimos = Math.floor(Math.max(0, segundos) * 10 + 1e-6);
  const m = Math.floor(decimos / 600);
  const r = Math.floor(decimos / 10) % 60;
  const d = decimos % 10;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}.${d}`;
}

export default function LinhaDoTempo({
  blocos,
  selecionada,
  capa,
  telaFinal,
  inicios,
  total,
  tempo,
  tocando,
  zoom,
  gerando,
  aoSelecionar,
  aoMoverTempo,
  aoTocar,
  aoZoom,
  aoComecarArraste,
  aoSoltarEm,
  aoDuplicar,
  aoApagar,
  aoDividir,
  aoAparar,
  aoGirar,
  aoEspelhar,
  aoVelocidade,
  aoCongelar,
  aoMenuContexto,
}: {
  blocos: BlocoCena[];
  selecionada: string | null;
  capa: string | null;
  telaFinal: boolean;
  /** Onde cada bloco começa no vídeo, em segundos (o relógio, com as emendas): um por
   *  cena e, com tela final, mais um no fim. */
  inicios: number[];
  /** Duração do vídeo pronto. */
  total: number;
  tempo: number;
  tocando: boolean;
  /** Pixels por segundo. É o zoom da linha do tempo. */
  zoom: number;
  gerando: boolean;
  aoSelecionar: (chave: string) => void;
  aoMoverTempo: (segundos: number) => void;
  aoTocar: (tocar: boolean) => void;
  aoZoom: (px: number) => void;
  aoComecarArraste: (chave: string) => void;
  aoSoltarEm: (chave: string, ev: React.DragEvent) => void;
  aoDuplicar: (chave: string) => void;
  aoApagar: (chave: string) => void;
  /** Parte a cena no cabeçote. */
  aoDividir: (chave: string) => void;
  /** Joga fora o pedaço da cena antes ("inicio") ou depois ("fim") do cabeçote. */
  aoAparar: (chave: string, lado: "inicio" | "fim") => void;
  aoGirar: (chave: string) => void;
  aoEspelhar: (chave: string) => void;
  aoVelocidade: (chave: string, velocidade: number) => void;
  aoCongelar: (chave: string) => void;
  aoMenuContexto?: (ev: React.MouseEvent, chave: string) => void;
}) {
  const trilho = useRef<HTMLDivElement | null>(null);

  /**
   * Quanto cada bloco ocupa na trilha: do começo dele ao começo do próximo.
   *
   * Não é a duração da cena. A emenda sobrepõe duas cenas, e a sobreposição fica com a
   * que entra: só assim os blocos encostam uns nos outros e a régua em cima deles diz o
   * segundo do vídeo pronto. Sem largura mínima pelo mesmo motivo -- um bloco esticado
   * empurra todos os seguintes pra fora do tempo deles.
   */
  const larguras = useMemo(() => {
    const n = blocos.length + (telaFinal ? 1 : 0);
    return Array.from({ length: n }, (_, k) => Math.max(0, (k + 1 < n ? (inicios[k + 1] ?? total) : total) - (inicios[k] ?? 0)));
  }, [blocos.length, telaFinal, inicios, total]);

  const passo = passoDaRegua(zoom);
  const marcas = useMemo(() => {
    const lista: number[] = [];
    for (let s = 0; s <= total + 0.001; s += passo) lista.push(s);
    return lista;
  }, [total, passo]);

  // O cabeçote segue o tempo: quando ele sai da vista, a trilha rola atrás.
  useEffect(() => {
    if (!tocando || !trilho.current) return;
    const x = tempo * zoom;
    const el = trilho.current;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: "smooth" });
    }
  }, [tempo, tocando, zoom]);

  /** Clique na régua ou na trilha leva o cabeçote pra lá. */
  function irPara(ev: React.MouseEvent<HTMLElement>) {
    const el = trilho.current;
    if (!el) return;
    const caixa = el.getBoundingClientRect();
    // Menos os 12px do `px-3` da trilha: a régua começa depois deles.
    const x = ev.clientX - caixa.left + el.scrollLeft - 12;
    aoMoverTempo(Math.max(0, Math.min(total, x / zoom)));
  }

  const larguraTotal = Math.max(240, total * zoom);
  const indiceDoBloco = blocos.findIndex((b) => b.chave === selecionada);
  const bloco = indiceDoBloco >= 0 ? blocos[indiceDoBloco] : null;

  /**
   * Onde o cabeçote está DENTRO da cena escolhida, em segundos.
   *
   * É o que separa "dividir" de "duplicar". Dividir no meio é chute; dividir onde a
   * pessoa parou o cabeçote é o corte que ela viu e quis. `null` quando o cabeçote está
   * fora da cena, ou colado numa das pontas -- cortar a zero segundos do começo não
   * produz duas cenas, produz uma cena e uma vazia.
   */
  const dentroDaCena = (() => {
    if (!bloco) return null;
    const d = tempo - inicios[indiceDoBloco];
    // O fim VISÍVEL do bloco (começo do próximo), não a duração da cena: na emenda já se
    // vê a cena seguinte.
    return d > 0.15 && d < (larguras[indiceDoBloco] ?? bloco.duracao) - 0.15 ? d : null;
  })();
  // Duração de cena é inteira e tem mínimo: dividir uma cena de 4s daria duas de 3s, ou
  // seja, o vídeo ficaria MAIS LONGO depois de um corte. Por isso o botão só acende
  // quando as duas partes cabem.
  const podeDividir =
    !!bloco && !gerando && bloco.tipo !== "animada" && dentroDaCena !== null && blocos.length < LIMITES.cenasMax && bloco.duracao >= LIMITES.duracaoMin * 2;

  return (
    <div className="flex shrink-0 flex-col border-t border-neutral-200">
      {/* ---------- barra de reprodução ----------
           Tocar, onde estou, e o que fazer com a cena escolhida. Fica ENTRE o palco e a
           trilha porque é o que liga os dois: o botão toca, o cabeçote anda e o palco
           acompanha. */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5">
        <button
          type="button"
          onClick={() => aoTocar(!tocando)}
          disabled={blocos.length === 0}
          title={tocando ? "Pausar" : "Tocar a prévia"}
          className="rounded-lg p-1.5 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40"
        >
          {tocando ? <Icone nome="fechar" className="h-4 w-4" /> : <Icone nome="play" className="h-4 w-4" />}
        </button>
        <span className="tabular-nums text-xs text-neutral-500">
          {relogio(tempo)} <span className="text-neutral-400">/ {relogio(total)}</span>
        </span>

        <span className="mx-1 h-4 w-px shrink-0 bg-neutral-200" />

        {/* ---------- ferramentas da cena escolhida ----------
             Todas trabalham sobre UMA cena e, as três primeiras, sobre o lugar do
             cabeçote. É por isso que moram aqui e não num painel: o corte que se quer é
             o que se está vendo.

             A faixa rola de lado no celular em vez de quebrar linha -- barra de
             ferramenta que muda de altura empurra a linha do tempo pra fora da tela. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <Ferramenta
            icone="dividir"
            dica={
              bloco?.tipo === "animada"
                ? "Cena animada não se divide: cada parte seria animada de novo"
                : bloco && dentroDaCena === null
                  ? "Leve o cabeçote pra dentro da cena pra dividir ali"
                  : "Dividir em duas, no cabeçote"
            }
            desligado={!podeDividir}
            aoClicar={() => bloco && aoDividir(bloco.chave)}
          />
          <Ferramenta
            icone="aparar_inicio"
            dica={bloco?.tipo === "animada" ? "Cena animada não se corta: mude a duração no painel" : "Cortar fora o que vem antes do cabeçote"}
            desligado={!bloco || gerando || bloco.tipo === "animada" || dentroDaCena === null}
            aoClicar={() => bloco && aoAparar(bloco.chave, "inicio")}
          />
          <Ferramenta
            icone="aparar_fim"
            dica={bloco?.tipo === "animada" ? "Cena animada não se corta: mude a duração no painel" : "Cortar fora o que vem depois do cabeçote"}
            desligado={!bloco || gerando || bloco.tipo === "animada" || dentroDaCena === null}
            aoClicar={() => bloco && aoAparar(bloco.chave, "fim")}
          />

          <span className="mx-1 h-4 w-px shrink-0 bg-neutral-200" />

          <Ferramenta
            icone="girar"
            dica={bloco?.tipo === "tour360" ? "Foto 360 não gira: use o movimento da câmera" : `Girar um quarto de volta${bloco?.giro ? ` (está em ${bloco.giro}°)` : ""}`}
            ativo={!!bloco?.giro}
            desligado={!bloco || gerando || bloco.tipo === "tour360"}
            aoClicar={() => bloco && aoGirar(bloco.chave)}
          />
          <Ferramenta
            icone="espelhar"
            dica={bloco?.tipo === "tour360" ? "Foto 360 não espelha" : "Virar na horizontal"}
            ativo={!!bloco?.espelho}
            desligado={!bloco || gerando || bloco.tipo === "tour360"}
            aoClicar={() => bloco && aoEspelhar(bloco.chave)}
          />
          <Ferramenta
            icone="congelar"
            dica={bloco && !bloco.temVideo ? "Só vale onde há vídeo correndo" : "Parar no quadro do cabeçote"}
            ativo={!!bloco?.congelado}
            desligado={!bloco || gerando || !bloco.temVideo}
            aoClicar={() => bloco && aoCongelar(bloco.chave)}
          />

          {/* Velocidade é escolha entre quatro, não botão que liga e desliga -- então é
              lista, e lista nativa, que no celular abre a roda do sistema. */}
          <label className="flex shrink-0 items-center gap-1 pl-1" title={bloco && !bloco.temVideo ? "Só vale onde há vídeo correndo" : "Velocidade do clipe"}>
            <Icone nome="velocidade" className={`h-4 w-4 ${bloco?.velocidade && bloco.velocidade !== 1 ? "text-marca-indigo" : "text-neutral-600"}`} />
            <select
              value={bloco?.velocidade ?? 1}
              onChange={(e) => bloco && aoVelocidade(bloco.chave, Number(e.target.value))}
              disabled={!bloco || gerando || !bloco.temVideo}
              aria-label="Velocidade do clipe"
              className="rounded-lg border border-neutral-200 bg-transparent px-1 py-0.5 text-[11px] text-neutral-600 disabled:opacity-25"
            >
              <option value={0.5}>0,5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1,5x</option>
              <option value={2}>2x</option>
            </select>
          </label>

          <span className="mx-1 h-4 w-px shrink-0 bg-neutral-200" />

          <Ferramenta icone="copiar" dica="Duplicar a cena escolhida" desligado={!bloco || gerando} aoClicar={() => bloco && aoDuplicar(bloco.chave)} />
          <Ferramenta icone="lixeira" dica="Tirar a cena escolhida" desligado={!bloco || gerando} aoClicar={() => bloco && aoApagar(bloco.chave)} />
        </div>

        <span className="hidden min-w-0 max-w-[22rem] shrink truncate px-2 text-[11px] text-neutral-400 xl:block">
          {blocos.length === 0 ? "Escolha as fotos em Mídia." : "arraste pra trocar a ordem · arraste uma foto da biblioteca pra entrar no meio"}
        </span>

        {/* Zoom: quantos pixels cabe um segundo. Com vídeo curto ninguém precisa, mas com
            doze cenas a trilha inteira não cabe na tela, e é aqui que ela encolhe. */}
        <Icone nome="lote" className="hidden h-3.5 w-3.5 text-neutral-400 sm:block" />
        <input
          type="range"
          min={8}
          max={90}
          step={2}
          value={zoom}
          onChange={(e) => aoZoom(Number(e.target.value))}
          title="Zoom da linha do tempo"
          className="hidden w-24 accent-marca-coral sm:block"
        />
      </div>

      {/* ---------- régua e trilha ---------- */}
      <div ref={trilho} className="relative overflow-x-auto px-3 pb-3">
        <div style={{ width: larguraTotal }}>
          {/* régua */}
          <div className="relative h-5 cursor-pointer select-none" onClick={irPara}>
            {marcas.map((s) => (
              <span key={s} className="absolute top-0 flex h-full flex-col items-start" style={{ left: s * zoom }}>
                <span className="h-1.5 w-px bg-neutral-300" />
                <span className="mt-0.5 -translate-x-px text-[9px] tabular-nums text-neutral-400">{relogio(s).slice(0, 5)}</span>
              </span>
            ))}
          </div>

          {/* trilha */}
          <ul
            className="relative flex items-stretch"
            onClick={irPara}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              aoSoltarEm(blocos[blocos.length - 1]?.chave ?? "fim", e);
            }}
          >
            {blocos.map((b, i) => {
              const ativa = selecionada === b.chave;
              const largura = larguras[i] * zoom;
              return (
                <li key={b.chave} className="relative shrink-0" style={{ width: largura }}>
                  <button
                    type="button"
                    draggable={!gerando}
                    onDragStart={() => aoComecarArraste(b.chave)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      aoSoltarEm(b.chave, e);
                    }}
                    onContextMenu={(e) => {
                      if (aoMenuContexto) {
                        e.preventDefault();
                        e.stopPropagation();
                        aoSelecionar(b.chave);
                        aoMenuContexto(e, b.chave);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      aoSelecionar(b.chave);
                      aoMoverTempo(inicios[i]);
                    }}
                    title={`${b.rotulo} · ${b.duracao}s · clique com botão direito para opções`}
                    className={
                      "relative block h-16 w-full overflow-hidden rounded-md border-2 text-left transition " +
                      (ativa ? "border-marca-coral" : "border-transparent hover:border-neutral-300")
                    }
                  >
                    {b.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.miniatura} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-neutral-100 text-neutral-400">
                        <Icone nome="video" className="h-4 w-4" />
                      </span>
                    )}
                    <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">{i + 1}</span>
                    {capa === b.chave && <span className="absolute top-0.5 right-0.5 rounded bg-amber-400 px-1 text-[9px] font-bold text-white">★</span>}
                    {b.tipo === "animada" && <span className="absolute right-0.5 bottom-0.5 rounded bg-marca-coral/90 px-1 text-[9px] text-white">✨</span>}
                    {largura > 48 && (
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] tabular-nums text-white">{b.duracao}s</span>
                    )}
                  </button>
                  {/* A emenda mora na divisa entre dois blocos, que é onde ela acontece. */}
                  {i < blocos.length - 1 && b.emenda && (
                    <span
                      className="pointer-events-none absolute top-1/2 -right-3 z-10 -translate-y-1/2 rounded bg-neutral-900/80 px-1 text-[8px] leading-tight text-white"
                      title={`Emenda: ${b.emenda}`}
                    >
                      {b.emenda.slice(0, 4)}
                    </span>
                  )}
                </li>
              );
            })}

            {telaFinal && (
              <li className="shrink-0" style={{ width: (larguras[blocos.length] ?? 0) * zoom }}>
                <span
                  className="grid h-16 w-full place-items-center rounded-md border-2 border-dashed border-neutral-200 text-center text-[9px] leading-tight text-neutral-500"
                  title="Tela final com nome, CRECI, WhatsApp e logo da sua marca"
                >
                  <Icone nome="marca" className="h-3.5 w-3.5" />
                  Tela final
                </span>
              </li>
            )}

            {blocos.length === 0 && (
              <li
                className="grid h-16 w-full place-items-center rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50/50 text-xs text-neutral-500 hover:border-marca-coral hover:bg-marca-coral/5 transition cursor-pointer"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  aoSoltarEm("fim", e);
                }}
              >
                Arraste imagens ou vídeos pra cá, ou escolha nas abas laterais.
              </li>
            )}
          </ul>

          {/* ---------- cabeçote ----------
               Uma linha e uma cabeça, por cima de tudo. Sem `pointer-events`, pra não
               roubar o clique de quem está mirando um bloco. */}
          {blocos.length > 0 && (
            <div className="pointer-events-none absolute top-3 bottom-3 z-20 w-px bg-marca-coral" style={{ left: 12 + tempo * zoom }}>
              <span className="absolute -top-1 -left-[5px] h-2.5 w-2.5 rounded-sm bg-marca-coral" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
