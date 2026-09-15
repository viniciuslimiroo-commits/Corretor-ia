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
  /** Camada livre: qual elemento está selecionado e o que fazer quando ele muda. */
  elementoSelecionado?: string | null;
  aoSelecionarElemento?: (id: string | null) => void;
  /** Soltou o elemento numa posição nova. x/y em fração da página. */
  aoMoverElemento?: (id: string, x: number, y: number) => void;
  /** Largura nova, em fração da largura da página. */
  aoRedimensionarElemento?: (id: string, l: number) => void;
};

/**
 * A alça de um elemento livre: um retângulo transparente exatamente em cima do que foi
 * desenhado, pra arrastar e redimensionar.
 *
 * Vem do LAYOUT, não do elemento: as caixas carregam `elementoId`, e a alça é a união
 * delas. Calcular a altura a partir do estilo daria um retângulo aproximado, e alça que
 * não coincide com o que se vê é pior que alça nenhuma -- a pessoa arrasta o vazio.
 *
 * Os números vão pro documento em FRAÇÃO da página, arredondados a meio por cento. O
 * arredondamento é o que faz dois elementos arrastados "pro mesmo lugar" acabarem de
 * fato alinhados.
 */
function Alca({
  id,
  caixa,
  escala,
  larguraPagina,
  alturaPagina,
  selecionado,
  interacao,
}: {
  id: string;
  caixa: { x: number; y: number; l: number; a: number };
  escala: number;
  larguraPagina: number;
  alturaPagina: number;
  selecionado: boolean;
  interacao: Interacao;
}) {
  /**
   * O arraste é ouvido no DOCUMENTO, não no próprio elemento.
   *
   * A primeira versão usava `setPointerCapture` na alça. Funciona na teoria e falhou na
   * prática: a bolinha de largura tem 12px, o ponteiro sai dela no primeiro movimento e
   * os `onPointerMove` do React param de chegar -- a alça ficava parada enquanto o
   * ponteiro andava. Ouvir no documento não depende de captura, de o ponteiro continuar
   * em cima nem de o navegador aceitar o `pointerId`.
   */
  function comecar(modo: "mover" | "largura", ev: React.PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    interacao.aoSelecionarElemento?.(id);
    const inicio = { px: ev.clientX, py: ev.clientY, x: caixa.x / larguraPagina, y: caixa.y / alturaPagina, l: caixa.l / larguraPagina };
    const passo = (v: number) => Math.round(v * 200) / 200;

    const mover = (e: PointerEvent) => {
      const dx = (e.clientX - inicio.px) / escala / larguraPagina;
      const dy = (e.clientY - inicio.py) / escala / alturaPagina;
      if (modo === "mover") interacao.aoMoverElemento?.(id, passo(inicio.x + dx), passo(inicio.y + dy));
      else interacao.aoRedimensionarElemento?.(id, passo(inicio.l + dx));
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.removeEventListener("pointercancel", soltar);
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
    document.addEventListener("pointercancel", soltar);
  }

  const lado = 14;
  return (
    <div
      onPointerDown={(e) => comecar("mover", e)}
      style={{
        position: "absolute",
        left: caixa.x * escala,
        top: caixa.y * escala,
        width: caixa.l * escala,
        height: caixa.a * escala,
        cursor: "move",
        outline: selecionado ? "2px solid #f06b4f" : "1px dashed rgba(240,107,79,0.45)",
        outlineOffset: 1,
        touchAction: "none",
      }}
    >
      {selecionado && (
        <div
          onPointerDown={(e) => comecar("largura", e)}
          title="Arraste para mudar a largura"
          style={{
            position: "absolute",
            right: -lado / 2,
            top: "50%",
            marginTop: -lado / 2,
            width: lado,
            height: lado,
            borderRadius: lado,
            background: "#f06b4f",
            border: "2px solid #fff",
            cursor: "ew-resize",
            touchAction: "none",
          }}
        />
      )}
    </div>
  );
}

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
        textAlign: c.alinhamento === "direita" ? "right" : c.alinhamento === "centro" ? "center" : "left",
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
  // A área de cada elemento livre: a união das caixas que ele desenhou. Uma etiqueta é
  // fundo + texto, e a alça precisa cobrir as duas.
  const areas = useMemo(() => {
    const por = new Map<string, { x: number; y: number; l: number; a: number }>();
    for (const c of dados.layout.caixas) {
      const id = (c as { elementoId?: string }).elementoId;
      if (!id) continue;
      const altura = c.tipo === "texto" ? c.linhas.length * c.entrelinha : c.tipo === "retangulo" ? c.a : 0;
      const atual = por.get(id);
      if (!atual) {
        por.set(id, { x: c.x, y: c.y, l: c.l, a: altura });
        continue;
      }
      const x = Math.min(atual.x, c.x);
      const y = Math.min(atual.y, c.y);
      por.set(id, { x, y, l: Math.max(atual.x + atual.l, c.x + c.l) - x, a: Math.max(atual.y + atual.a, c.y + altura) - y });
    }
    return [...por.entries()];
  }, [dados.layout.caixas]);

  const podeMexerNosElementos = !!interacao?.aoMoverElemento;

  return (
    <div
      className={className}
      onPointerDown={podeMexerNosElementos ? () => interacao?.aoSelecionarElemento?.(null) : undefined}
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
      {podeMexerNosElementos &&
        interacao &&
        areas.map(([id, area]) => (
          <Alca
            key={id}
            id={id}
            caixa={area}
            escala={escala}
            larguraPagina={dados.layout.largura}
            alturaPagina={dados.layout.altura}
            selecionado={interacao.elementoSelecionado === id}
            interacao={interacao}
          />
        ))}
    </div>
  );
}
