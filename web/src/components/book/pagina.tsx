"use client";

import { useMemo, useRef } from "react";
import type { Caixa, PaginaLayout } from "@/lib/book-layout";
import { FONTE_POR_ID, type FonteBook } from "@/lib/book-documento";
import { ALTURA_ACIMA_DA_BASE } from "@/lib/book-constantes";

// O DESENHISTA DE TELA. O gêmeo do pdf-lib: recebe as mesmas caixas e só posiciona.
//
// Três regras que fazem a tela bater com o arquivo:
//
// 1. Cada linha de texto vira um <div> próprio, com `white-space: pre`. O navegador NÃO
//    pode requebrar nada -- a quebra já veio pronta do servidor, feita com as métricas da
//    fonte do PDF. Deixar o texto fluir num parágrafo traria de volta a divergência que o
//    motor de layout existe pra eliminar.
//
// 2. A fonte é a da identidade do documento, sempre uma família metricamente igual à do
//    PDF: Helvetica/Arial (Arial tem as mesmas larguras no alfabeto latino) ou Times/Times
//    New Roman. Vem carimbada no layout, então tela e arquivo não têm como discordar.
//
// 3. `y` de uma caixa de texto é o TOPO da primeira linha, não a linha de base. Quem
//    converte pro sistema do pdf-lib (origem embaixo, y na base) é o renderizador de PDF,
//    num lugar só.
//
// A interação (soltar imagem, arrastar pra enquadrar) é OPCIONAL e só liga na página
// selecionada. Sem ela o componente é o mesmo em miniatura, na prévia e na faixa lateral.

export { ALTURA_ACIMA_DA_BASE };

export type DadosPagina = {
  layout: PaginaLayout;
  urls: Record<string, string>;
  logo: string | null;
};

export type Interacao = {
  /** Soltou uma imagem da Biblioteca em cima desta caixa. */
  aoSoltar?: (jobId: string, indiceNaPagina: number) => void;
  /** Arrastou a imagem dentro do quadro. dx/dy vão de -1 a 1 em fração da caixa. */
  aoMoverFoco?: (jobId: string, dx: number, dy: number) => void;
  /** Clique numa caixa de imagem (abre a gaveta pra trocar). */
  aoClicarImagem?: (jobId: string, indiceNaPagina: number) => void;
};

function Texto({ c, escala, fonte }: { c: Extract<Caixa, { tipo: "texto" }>; escala: number; fonte: FonteBook }) {
  return (
    <div
      style={{
        position: "absolute",
        left: c.x * escala,
        top: c.y * escala,
        width: c.l * escala,
        color: c.cor,
        fontSize: c.tamanho * escala,
        lineHeight: `${c.entrelinha * escala}px`,
        fontWeight: c.negrito ? 700 : 400,
        textAlign: c.alinhamento === "direita" ? "right" : "left",
        // A família da identidade do documento, metricamente igual à do PDF (Arial =
        // Helvetica, Times New Roman = Times). É o que deixa a quebra de linha do
        // servidor cair no mesmo lugar aqui.
        fontFamily: FONTE_POR_ID[fonte].css,
        pointerEvents: "none",
      }}
    >
      {c.linhas.map((linha, i) => (
        <div key={i} style={{ whiteSpace: "pre" }}>
          {linha}
        </div>
      ))}
    </div>
  );
}

function Imagem({
  c,
  dados,
  escala,
  indice,
  interacao,
}: {
  c: Extract<Caixa, { tipo: "imagem" }>;
  dados: DadosPagina;
  escala: number;
  indice: number;
  interacao?: Interacao;
}) {
  const url = dados.urls[c.jobId];
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  // foco vai de -0.5 a 0.5; object-position trabalha em 0..100%
  const px = 50 + (c.foco?.x ?? 0) * 100;
  const py = 50 + (c.foco?.y ?? 0) * 100;
  const podeEnquadrar = !!interacao?.aoMoverFoco && c.modo === "cobrir" && !!url;

  return (
    <div
      style={{
        position: "absolute",
        left: c.x * escala,
        top: c.y * escala,
        width: c.l * escala,
        height: c.a * escala,
        overflow: "hidden",
        background: "#eef1f5",
        cursor: podeEnquadrar ? "grab" : interacao?.aoClicarImagem ? "pointer" : undefined,
        outline: interacao ? "1px dashed rgba(240,107,79,0.45)" : undefined,
        outlineOffset: -1,
      }}
      onDragOver={interacao?.aoSoltar ? (e) => e.preventDefault() : undefined}
      onDrop={
        interacao?.aoSoltar
          ? (e) => {
              e.preventDefault();
              const jobId = e.dataTransfer.getData("text/encena-job");
              if (jobId) interacao.aoSoltar?.(jobId, indice);
            }
          : undefined
      }
      onClick={interacao?.aoClicarImagem ? () => interacao.aoClicarImagem?.(c.jobId, indice) : undefined}
      onPointerDown={
        podeEnquadrar
          ? (e) => {
              arrastando.current = { x: e.clientX, y: e.clientY };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }
          : undefined
      }
      onPointerMove={
        podeEnquadrar
          ? (e) => {
              if (!arrastando.current) return;
              const dx = (e.clientX - arrastando.current.x) / (c.l * escala);
              const dy = (e.clientY - arrastando.current.y) / (c.a * escala);
              if (Math.abs(dx) < 0.004 && Math.abs(dy) < 0.004) return;
              arrastando.current = { x: e.clientX, y: e.clientY };
              interacao?.aoMoverFoco?.(c.jobId, dx, dy);
            }
          : undefined
      }
      onPointerUp={podeEnquadrar ? () => (arrastando.current = null) : undefined}
      onPointerCancel={podeEnquadrar ? () => (arrastando.current = null) : undefined}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: c.modo === "conter" ? "contain" : "cover", objectPosition: `${px}% ${py}%` }}
          draggable={false}
        />
      )}
      {!url && interacao && (
        <span style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 11 * escala * 3, color: "#94a0b5" }}>arraste uma foto aqui</span>
      )}
    </div>
  );
}

function Uma({ c, dados, escala, indice, interacao }: { c: Caixa; dados: DadosPagina; escala: number; indice: number; interacao?: Interacao }) {
  const base = { position: "absolute" as const, left: c.x * escala, top: c.y * escala };

  if (c.tipo === "texto") return <Texto c={c} escala={escala} fonte={dados.layout.fonte ?? "moderna"} />;

  if (c.tipo === "retangulo") {
    return <div style={{ ...base, width: c.l * escala, height: c.a * escala, background: c.cor, opacity: c.opacidade ?? 1, pointerEvents: "none" }} />;
  }

  if (c.tipo === "imagem") return <Imagem c={c} dados={dados} escala={escala} indice={indice} interacao={interacao} />;

  if (c.tipo === "logo") {
    if (!dados.logo) return null;
    return (
      <div
        style={{
          ...base,
          width: c.l * escala,
          height: c.a * escala,
          background: c.placa ? "#ffffff" : "transparent",
          padding: c.placa ? 6 * escala : 0,
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dados.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} draggable={false} />
      </div>
    );
  }

  if (c.tipo === "qr" && c.png) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.png} alt="" style={{ ...base, width: c.l * escala, height: c.a * escala, pointerEvents: "none" }} draggable={false} />;
  }

  return null;
}

export default function Pagina({
  dados,
  largura,
  className = "",
  interacao,
}: {
  dados: DadosPagina;
  largura: number;
  className?: string;
  interacao?: Interacao;
}) {
  const escala = largura / dados.layout.largura;
  // O índice da imagem DENTRO da página (0, 1, …) não está na caixa, e o renderizador
  // precisa dele pra dizer qual foto foi trocada. Calculado de uma vez, fora do corpo do
  // render: contador mutável durante o render é o que o React Compiler recusa.
  const indiceDaImagem = useMemo(
    () =>
      dados.layout.caixas.map((c, i) =>
        c.tipo === "imagem" ? dados.layout.caixas.slice(0, i).filter((x) => x.tipo === "imagem").length : -1
      ),
    [dados.layout.caixas]
  );
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: largura,
        height: dados.layout.altura * escala,
        background: "#ffffff",
        overflow: "hidden",
        flexShrink: 0,
        userSelect: interacao ? "none" : undefined,
      }}
    >
      {dados.layout.caixas.map((c, i) => (
        <Uma key={i} c={c} dados={dados} escala={escala} indice={indiceDaImagem[i]} interacao={interacao} />
      ))}
    </div>
  );
}
