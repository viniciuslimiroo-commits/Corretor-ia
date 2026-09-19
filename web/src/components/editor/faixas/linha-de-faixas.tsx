"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ORDEM_DAS_FAIXAS, type BlocoLinha, type FaixaId, type FaixasDaLinha, type Gesto, type RefItem, type ResultadoGesto } from "@/lib/linha-do-tempo";
import type { MusicaId } from "@/lib/video";
import type { PicosDaFaixa } from "@/lib/picos-audio";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";
import Controles from "./controles";
import Faixa from "./faixa";
import Regua from "./regua";
import TrilhaDeCenas from "./trilha-de-cenas";
import { MEDIDAS_CELULAR, MEDIDAS_COMPUTADOR, alturaDaLinha } from "./comum";
import { useRolagemCentrada } from "./usar-rolagem";
import { useGestosDaLinha } from "./usar-gestos";

// A LINHA DO TEMPO EM FAIXAS (docs/planos/linha-do-tempo-spec.md, D1-D4; pacote P5).
//
// Tudo que entra no vídeo aparece aqui: as fotos, e embaixo uma faixa por tipo -- Você,
// voz, música, textos, adesivos, legendas. Faixa vazia não aparece.
//
// CELULAR: o cabeçote fica parado no centro e a linha corre por baixo; só uma faixa fica
// aberta (44px) e as outras viram tiras de 8px que abrem com um toque; o botão Faixas abre
// todas (sem rolagem por dentro: quem encolhe é o palco). Seis faixas, uma aberta: 198px.
// COMPUTADOR: todas as faixas com conteúdo abertas em 28px, nomes numa coluna fixa de 72px,
// o cabeçote anda.
//
// Este componente não guarda estado de edição: recebe as faixas prontas (blocosDoEstado),
// pede ao dono a conta de cada gesto (simularGesto) e só avisa no fim (aoConfirmarGesto).
// A pinça e o seguir-o-relógio mexem no DOM direto, sem redesenhar.

export type { RelogioDaPrevia };

export type PropsLinhaDeFaixas = {
  faixas: FaixasDaLinha;
  total: number;
  relogio: RelogioDaPrevia;
  /** O tempo do cursor, com 100ms de folga (o relógio de cada quadro vem por `relogio`). */
  tempo: number;
  tocando: boolean;
  /** Pixels por segundo. */
  zoom: number;
  selecao: RefItem | null;
  faixaAberta: FaixaId | null;
  todasAbertas: boolean;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  gerando: boolean;
  celular: boolean;
  picos: Partial<Record<MusicaId, PicosDaFaixa>>;
  miniaturas: Record<string, string | null>;
  /** Chaves das cenas que são vídeo (▶ no bloco). */
  clipes?: Set<string>;
  capa: string | null;
  semSom: Set<string>;
  /** Chaves das cenas animadas (✨). */
  animadas?: Set<string>;
  /** Arrastar a música desliza o trecho (sub-barra "Trecho da música" aberta). */
  modoTrecho?: boolean;
  /** Barra da seleção, no computador: entra na fileira de controles. */
  barra?: ReactNode;
  simularGesto(ref: RefItem, g: Gesto): ResultadoGesto<never>;
  aoConfirmarGesto(ref: RefItem, g: Gesto): void;
  /** Chega na prévia SEM passo intermediário: é o gesto que libera o som no iOS. */
  aoTocar(tocar: boolean): void;
  aoBuscar(t: number, origem: "regua" | "rolagem" | "arraste"): void;
  aoZoom(px: number): void;
  aoAjustar(): void;
  aoAlternarFaixas(): void;
  aoAbrirFaixa(f: FaixaId): void;
  aoSelecionar(ref: RefItem | null): void;
  aoAbrirLista(grupo: BlocoLinha): void;
  aoMenu(ref: RefItem, x: number, y: number): void;
  aoDesfazer(): void;
  aoRefazer(): void;
  aoSoltarFoto?(chaveAlvo: string | null, ev: React.DragEvent): void;
  /** O + depois da última cena: abre as fotos e os vídeos. */
  aoAdicionarMidia?(): void;
};

export default function LinhaDeFaixas(p: PropsLinhaDeFaixas) {
  const m = p.celular ? MEDIDAS_CELULAR : MEDIDAS_COMPUTADOR;
  const origemX = p.celular ? 0 : m.rotulos;
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const [rolagem, setRolagem] = useState<HTMLDivElement | null>(null);
  const [conteudo, setConteudo] = useState<HTMLDivElement | null>(null);
  const [fantasma, setFantasma] = useState<HTMLDivElement | null>(null);
  const [guia, setGuia] = useState<HTMLDivElement | null>(null);
  const [cabecote, setCabecote] = useState<HTMLDivElement | null>(null);

  // Meia tela de folga de cada lado (celular): é o que deixa o segundo 0 e o último
  // chegarem no centro. Medida antes dos motores posicionarem a rolagem.
  useLayoutEffect(() => {
    if (!rolagem || !raiz) return;
    const medir = () => raiz.style.setProperty("--meia-tela", `${Math.round(rolagem.clientWidth / 2)}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(rolagem);
    return () => ro.disconnect();
  }, [rolagem, raiz]);

  const motor = useRolagemCentrada(rolagem, raiz, p.celular ? null : cabecote, {
    zoom: p.zoom,
    total: p.total,
    tempo: p.tempo,
    tocando: p.tocando,
    celular: p.celular,
    origemX,
    relogio: p.relogio,
    aoBuscar: p.aoBuscar,
    aoTocar: p.aoTocar,
    aoZoom: p.aoZoom,
  });
  useGestosDaLinha({ rolagem, conteudo, fantasma, guia }, motor, {
    faixas: p.faixas,
    selecao: p.selecao,
    celular: p.celular,
    origemX,
    modoTrecho: p.modoTrecho,
    simularGesto: p.simularGesto,
    aoConfirmarGesto: p.aoConfirmarGesto,
    aoSelecionar: p.aoSelecionar,
    aoAbrirLista: p.aoAbrirLista,
    aoMenu: p.aoMenu,
    aoAbrirFaixa: p.aoAbrirFaixa,
  });

  // O zoom que vem do dono vale também pro --pxs (a pinça já escreveu o mesmo valor).
  useEffect(() => {
    raiz?.style.setProperty("--pxs", `${p.zoom}px`);
  }, [raiz, p.zoom]);

  const faixas = ORDEM_DAS_FAIXAS.filter((f) => p.faixas.trilhas[f].length > 0);
  const aberta = (f: FaixaId) => (p.celular ? p.todasAbertas || p.faixaAberta === f : true);
  const altura = alturaDaLinha(m, faixas.map((f) => ({ aberta: aberta(f) })));
  // Folga depois do fim: o + da trilha das cenas mora ali.
  const larguraConteudo = p.celular ? `calc(var(--pxs) * ${p.total} + 64px)` : `calc(var(--pxs) * ${p.total} + ${m.rotulos + 88}px)`;
  const estilo = { "--pxs": `${p.zoom}px`, height: altura, WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" } as CSSProperties;

  return (
    <div ref={setRaiz} data-area="linha" data-altura={altura} className="relative flex shrink-0 flex-col border-t border-[var(--ed-linha)] bg-[var(--ed-base)]" style={estilo}>
      <Controles
        tocando={p.tocando}
        tempo={p.tempo}
        relogio={p.relogio}
        total={p.total}
        zoom={p.zoom}
        podeDesfazer={p.podeDesfazer}
        podeRefazer={p.podeRefazer}
        todasAbertas={p.todasAbertas}
        medidas={m}
        celular={p.celular}
        barra={p.barra}
        aoTocar={p.aoTocar}
        aoDesfazer={p.aoDesfazer}
        aoRefazer={p.aoRefazer}
        aoAjustar={p.aoAjustar}
        aoZoom={p.aoZoom}
        aoAlternarFaixas={p.aoAlternarFaixas}
      />
      <div
        ref={setRolagem}
        data-rolagem="1"
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x", overscrollBehaviorX: "contain" }}
      >
        <div className="flex w-max">
          {p.celular && <div className="shrink-0" style={{ width: "var(--meia-tela, 50vw)" }} aria-hidden="true" />}
          <div ref={setConteudo} className="relative shrink-0" style={{ width: larguraConteudo }}>
            <Regua total={p.total} pxs={p.zoom} medidas={m} celular={p.celular} />
            <TrilhaDeCenas
              blocos={p.faixas.trilhas.cenas}
              marcas={p.faixas.marcasDeEfeito}
              medidas={m}
              pxs={p.zoom}
              total={p.total}
              selecao={p.selecao}
              miniaturas={p.miniaturas}
              clipes={p.clipes}
              capa={p.capa}
              animadas={p.animadas}
              celular={p.celular}
              aoSoltarFoto={p.aoSoltarFoto}
              aoAdicionarMidia={p.gerando ? undefined : p.aoAdicionarMidia}
            />
            <div className="flex flex-col" style={{ gap: m.entre }}>
              {faixas.map((f) => (
                <Faixa
                  key={f}
                  id={f}
                  blocos={p.faixas.trilhas[f]}
                  aberta={aberta(f)}
                  medidas={m}
                  pxs={p.zoom}
                  selecao={p.selecao}
                  picos={p.picos}
                  semSom={p.semSom}
                  celular={p.celular}
                />
              ))}
            </div>
            <div
              ref={setFantasma}
              data-fantasma="1"
              className="pointer-events-none absolute z-30 rounded-[10px] border-2 border-dashed border-marca-coral bg-marca-coral/15 shadow-[0_8px_24px_-8px_rgb(240_107_79/0.6)] data-[borda=1]:border-solid"
              style={{ display: "none" }}
            />
            <div
              ref={setGuia}
              data-guia="1"
              className="pointer-events-none absolute top-0 bottom-0 z-30 w-0 border-l-2 border-dashed border-[var(--linha-guia)]"
              style={{ display: "none" }}
            />
            {!p.celular && (
              <div
                ref={setCabecote}
                data-cabecote="1"
                className="pointer-events-none absolute top-0 bottom-0 left-0 z-40 w-0"
                style={{ transform: `translateX(${origemX + p.tempo * p.zoom}px)` }}
              >
                <div className="absolute -left-px top-0 bottom-0 w-[2px] bg-marca-coral shadow-[0_0_8px_rgb(240_107_79/0.6)]" />
                <div className="absolute -left-[6px] top-0.5 h-4 w-3 rounded-[4px] bg-marca-coral shadow-[0_2px_6px_rgb(0_0_0/0.5)]" />
              </div>
            )}
          </div>
          {p.celular && <div className="shrink-0" style={{ width: "var(--meia-tela, 50vw)" }} aria-hidden="true" />}
        </div>
      </div>
      {p.celular && (
        <div data-cabecote="1" className="pointer-events-none absolute left-1/2 z-40 w-0" style={{ top: m.controles, bottom: 0 }} aria-hidden="true">
          <div className="absolute -left-px top-0 bottom-0 w-[2px] bg-marca-coral shadow-[0_0_8px_rgb(240_107_79/0.6)]" />
          <div className="absolute -left-[6px] top-0.5 h-4 w-3 rounded-[4px] bg-marca-coral shadow-[0_2px_6px_rgb(0_0_0/0.5)]" />
        </div>
      )}
    </div>
  );
}
