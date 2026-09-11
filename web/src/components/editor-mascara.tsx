"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// Editor de máscara: o usuário pinta com o dedo (ou com o mouse) o que quer apagar da
// foto. Era a peça de interface que faltava pra destravar a 5ª ação do MVP ("Remover
// objeto") -- os modelos de apagar não aceitam descrição em texto, só máscara.
//
// Dois canvas sobrepostos, os dois no tamanho NATURAL da foto:
//   - o visível pinta em vermelho translúcido, só pro usuário enxergar o que marcou;
//   - o da máscara pinta branco sobre fundo preto, que é o formato que o fal.ai espera
//     (branco 255 = apaga, preto 0 = mantém).
//
// Manter os dois no tamanho natural, e não no tamanho da tela, é o detalhe que importa:
// a máscara já sai na resolução da foto, sem nenhuma conversão depois, então não tem
// como ficar deslocada de onde a pessoa pintou.

export type EditorMascaraRef = {
  obterMascara: () => Promise<Blob | null>;
  limpar: () => void;
};

type Ponto = { x: number; y: number };
type Traco = { pontos: Ponto[]; raio: number };

type Props = {
  src: string;
  aoMudar?: (temTraco: boolean) => void;
};

const EditorMascara = forwardRef<EditorMascaraRef, Props>(function EditorMascara(
  { src, aoMudar },
  ref
) {
  const canvasVisivelRef = useRef<HTMLCanvasElement>(null);
  const canvasMascaraRef = useRef<HTMLCanvasElement>(null);
  const tracosRef = useRef<Traco[]>([]);
  const pintandoRef = useRef(false);

  const [dimensoes, setDimensoes] = useState<{ largura: number; altura: number } | null>(null);
  // Pincel medido em % da LARGURA da foto, não em pixels de tela: assim a marcação fica
  // do mesmo tamanho relativo numa foto de 1200px e numa de 5000px, e no celular.
  const [pincelPct, setPincelPct] = useState(6);
  const [temTraco, setTemTraco] = useState(false);

  // Descobre o tamanho natural da foto. O navegador já aplica a orientação do EXIF
  // aqui, então estas dimensões são as que a pessoa realmente vê na tela.
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setDimensoes({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.src = src;
  }, [src]);

  const redesenhar = useCallback(() => {
    const visivel = canvasVisivelRef.current;
    const mascara = canvasMascaraRef.current;
    if (!visivel || !mascara) return;
    const ctxV = visivel.getContext("2d");
    const ctxM = mascara.getContext("2d");
    if (!ctxV || !ctxM) return;

    ctxV.clearRect(0, 0, visivel.width, visivel.height);
    ctxM.fillStyle = "#000000";
    ctxM.fillRect(0, 0, mascara.width, mascara.height);

    for (const traco of tracosRef.current) {
      for (const ctx of [ctxV, ctxM]) {
        const cor = ctx === ctxV ? "rgba(255, 70, 70, 0.55)" : "#ffffff";
        ctx.strokeStyle = cor;
        ctx.fillStyle = cor;
        ctx.lineWidth = traco.raio * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (traco.pontos.length === 1) {
          // Um toque só também marca. Sem isto, um tap rápido não pinta nada e o
          // usuário acha que o pincel está quebrado.
          ctx.beginPath();
          ctx.arc(traco.pontos[0].x, traco.pontos[0].y, traco.raio, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(traco.pontos[0].x, traco.pontos[0].y);
        for (const p of traco.pontos.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }, []);

  // Foto trocada = marcação antiga não vale mais.
  useEffect(() => {
    tracosRef.current = [];
    setTemTraco(false);
    aoMudar?.(false);
  }, [src, aoMudar]);

  useEffect(() => {
    redesenhar();
  }, [dimensoes, redesenhar]);

  function posicao(e: React.PointerEvent<HTMLCanvasElement>): Ponto {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function aoApertar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dimensoes) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pintandoRef.current = true;
    const raio = (pincelPct / 100) * dimensoes.largura * 0.5;
    tracosRef.current.push({ pontos: [posicao(e)], raio });
    redesenhar();
    if (!temTraco) {
      setTemTraco(true);
      aoMudar?.(true);
    }
  }

  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pintandoRef.current) return;
    tracosRef.current[tracosRef.current.length - 1].pontos.push(posicao(e));
    redesenhar();
  }

  function aoSoltar() {
    pintandoRef.current = false;
  }

  function desfazer() {
    tracosRef.current.pop();
    redesenhar();
    const sobrou = tracosRef.current.length > 0;
    setTemTraco(sobrou);
    aoMudar?.(sobrou);
  }

  function limpar() {
    tracosRef.current = [];
    redesenhar();
    setTemTraco(false);
    aoMudar?.(false);
  }

  useImperativeHandle(ref, () => ({
    limpar,
    obterMascara: () =>
      new Promise<Blob | null>((resolve) => {
        const mascara = canvasMascaraRef.current;
        if (!mascara || tracosRef.current.length === 0) return resolve(null);
        mascara.toBlob((blob) => resolve(blob), "image/png");
      }),
  }));

  if (!dimensoes) {
    return <p className="text-sm text-neutral-500">Carregando a foto...</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-600">
        Pinte em cima do que você quer remover. Pode passar por cima da sombra também.
      </p>

      <div className="relative w-full overflow-hidden rounded border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto original" className="block w-full" />
        <canvas
          ref={canvasVisivelRef}
          width={dimensoes.largura}
          height={dimensoes.altura}
          onPointerDown={aoApertar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onPointerLeave={aoSoltar}
          // touch-none impede o celular de ROLAR A PÁGINA enquanto o dedo pinta. Sem
          // isto o editor fica inutilizável justamente no aparelho em que o corretor
          // vai usar ele.
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        />
        {/* O canvas da máscara não aparece: ele é dado, não interface. */}
        <canvas
          ref={canvasMascaraRef}
          width={dimensoes.largura}
          height={dimensoes.altura}
          className="hidden"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          Pincel
          <input
            type="range"
            min={2}
            max={15}
            step={1}
            value={pincelPct}
            onChange={(e) => setPincelPct(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={desfazer}
          disabled={!temTraco}
          className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-40"
        >
          Desfazer
        </button>
        <button
          type="button"
          onClick={limpar}
          disabled={!temTraco}
          className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-40"
        >
          Limpar seleção
        </button>
      </div>
    </div>
  );
});

export default EditorMascara;
