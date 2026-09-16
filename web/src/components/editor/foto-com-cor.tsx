"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { anguloDaVinheta, escurecerComVinheta, fatorDaVinheta, gradeNeutra, lerTabela, tabelaDaGrade, vinhetaDaGrade, type Grade } from "@/lib/filtros";

// A FOTO COM A COR DE VERDADE: a mesma conta que o servidor faz, rodando na tela.
//
// A miniatura de filtro com `filter: sepia() saturate()` do CSS era uma aproximação -- e
// escolher filtro olhando aproximação é escolher no escuro. Aqui a foto é desenhada num
// canvas e cada pixel passa pela TABELA 3D da grade, a mesma que vira LUT no ffmpeg. A
// borda escura usa a mesma fórmula do filtro `vignette`.
//
// Uma armadilha que custa caro se ninguém avisar: `getImageData` numa imagem de outro
// domínio sem CORS "suja" o canvas e LANÇA erro. Aí a foto aparece sem cor nenhuma -- e
// sem essa proteção, não apareceria foto nenhuma.

/** Imagens já carregadas, por endereço: vinte miniaturas da mesma foto baixam uma vez. */
const imagens = new Map<string, Promise<HTMLImageElement>>();

function carregar(src: string): Promise<HTMLImageElement> {
  let p = imagens.get(src);
  if (!p) {
    p = new Promise((ok, erro) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error("não carregou"));
      img.src = src;
    });
    imagens.set(src, p);
    // Falhou: sai do cache, senão uma rede instável vira foto quebrada pra sempre.
    p.catch(() => imagens.delete(src));
  }
  return p;
}

/** Tabelas por grade: mexer um controle recalcula uma, não as vinte da galeria. */
const tabelas = new Map<string, Float32Array>();
function tabela(grade: Grade, n: number): Float32Array {
  const chave = `${n}|${grade.filtro}|${grade.intensidade}|${JSON.stringify(grade.ajustes)}`;
  let t = tabelas.get(chave);
  if (!t) {
    t = tabelaDaGrade(grade, n);
    if (tabelas.size > 80) tabelas.clear();
    tabelas.set(chave, t);
  }
  return t;
}

export default function FotoComCor({
  src,
  grade,
  proporcao,
  lado = 320,
  pontos = 33,
  className = "",
}: {
  src: string;
  grade: Grade;
  /** Largura ÷ altura do quadro. A foto é recortada como `object-cover`. */
  proporcao: number;
  /** Maior lado desenhado, em pixels. Miniatura pede pouco; o palco pede mais. */
  lado?: number;
  /** Pontos por canal da tabela. 33 é o do servidor; 17 basta numa miniatura. */
  pontos?: number;
  className?: string;
}) {
  const tela = useRef<HTMLCanvasElement | null>(null);
  const [semCors, setSemCors] = useState(false);
  const chaveGrade = useMemo(() => `${grade.filtro}|${grade.intensidade}|${JSON.stringify(grade.ajustes)}`, [grade]);

  useEffect(() => {
    let vivo = true;
    carregar(src)
      .then((img) => {
        const c = tela.current;
        if (!vivo || !c) return;
        // Recorte de `object-cover`: o maior retângulo da foto na proporção do quadro.
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        let sw = iw;
        let sh = iw / proporcao;
        if (sh > ih) {
          sh = ih;
          sw = ih * proporcao;
        }
        const sx = (iw - sw) / 2;
        const sy = (ih - sh) / 2;
        const W = proporcao >= 1 ? lado : Math.round(lado * proporcao);
        const H = proporcao >= 1 ? Math.round(lado / proporcao) : lado;
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        if (gradeNeutra(grade)) return;

        const dados = ctx.getImageData(0, 0, W, H); // lança se o canvas estiver sujo
        const px = dados.data;
        const t = tabela(grade, pontos);
        const angulo = anguloDaVinheta(vinhetaDaGrade(grade));
        const saida = new Float32Array(3);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            lerTabela(t, pontos, px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, saida);
            if (angulo > 0) {
              const f = fatorDaVinheta(x, y, W, H, angulo);
              px[i] = escurecerComVinheta(saida[0], f) * 255;
              px[i + 1] = escurecerComVinheta(saida[1], f) * 255;
              px[i + 2] = escurecerComVinheta(saida[2], f) * 255;
            } else {
              px[i] = saida[0] * 255;
              px[i + 1] = saida[1] * 255;
              px[i + 2] = saida[2] * 255;
            }
          }
        }
        ctx.putImageData(dados, 0, 0);
      })
      .catch(() => {
        // Canvas sujo (CORS) ou foto que não carregou: mostra a foto crua em <img>. Sem
        // a cor, mas com a foto -- é melhor que um quadrado preto.
        if (vivo) setSemCors(true);
      });
    return () => {
      vivo = false;
    };
    // `chaveGrade` representa `grade` inteira: comparar o objeto redesenharia a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, chaveGrade, proporcao, lado, pontos]);

  if (semCors) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`object-cover ${className}`} draggable={false} />;
  }
  return <canvas ref={tela} className={className} />;
}
