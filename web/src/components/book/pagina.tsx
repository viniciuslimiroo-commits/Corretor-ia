"use client";

import type { Caixa, PaginaLayout } from "@/lib/book-layout";

// O DESENHISTA DE TELA. O gêmeo do pdf-lib: recebe as mesmas caixas e só posiciona.
//
// Três regras que fazem a tela bater com o arquivo:
//
// 1. Cada linha de texto vira um <div> próprio, com `white-space: pre`. O navegador NÃO
//    pode requebrar nada -- a quebra já veio pronta do servidor, feita com as métricas da
//    fonte do PDF. Deixar o texto fluir num parágrafo traria de volta a divergência que o
//    motor de layout existe pra eliminar.
//
// 2. A fonte é Helvetica/Arial, a mesma do PDF. No Windows resolve pra Arial, que tem as
//    mesmas larguras da Helvetica no alfabeto latino.
//
// 3. `y` de uma caixa de texto é o TOPO da primeira linha, não a linha de base. Quem
//    converte pro sistema do pdf-lib (origem embaixo, y na base) é o renderizador de PDF,
//    num lugar só.

export type DadosPagina = {
  layout: PaginaLayout;
  urls: Record<string, string>;
  logo: string | null;
};

/** Proporção do em-box acima da base. Usada aqui e no PDF -- as duas têm que combinar. */
export const ALTURA_ACIMA_DA_BASE = 0.8;

function Texto({ c, escala }: { c: Extract<Caixa, { tipo: "texto" }>; escala: number }) {
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
        fontFamily: "Helvetica, Arial, sans-serif",
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

function Uma({ c, dados, escala }: { c: Caixa; dados: DadosPagina; escala: number }) {
  const base = { position: "absolute" as const, left: c.x * escala, top: c.y * escala };

  if (c.tipo === "texto") return <Texto c={c} escala={escala} />;

  if (c.tipo === "retangulo") {
    return <div style={{ ...base, width: c.l * escala, height: c.a * escala, background: c.cor, opacity: c.opacidade ?? 1 }} />;
  }

  if (c.tipo === "imagem") {
    const url = dados.urls[c.jobId];
    // foco vai de -0.5 a 0.5; object-position trabalha em 0..100%
    const px = 50 + (c.foco?.x ?? 0) * 100;
    const py = 50 + (c.foco?.y ?? 0) * 100;
    return (
      <div style={{ ...base, width: c.l * escala, height: c.a * escala, overflow: "hidden", background: "#eef1f5" }}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: c.modo === "conter" ? "contain" : "cover", objectPosition: `${px}% ${py}%` }}
            draggable={false}
          />
        )}
      </div>
    );
  }

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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dados.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} draggable={false} />
      </div>
    );
  }

  if (c.tipo === "qr" && c.png) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.png} alt="" style={{ ...base, width: c.l * escala, height: c.a * escala }} draggable={false} />;
  }

  return null;
}

export default function Pagina({ dados, largura, className = "" }: { dados: DadosPagina; largura: number; className?: string }) {
  const escala = largura / dados.layout.largura;
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
      }}
    >
      {dados.layout.caixas.map((c, i) => (
        <Uma key={i} c={c} dados={dados} escala={escala} />
      ))}
    </div>
  );
}
