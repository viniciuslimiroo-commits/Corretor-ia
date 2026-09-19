"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BotaoIcone } from "./ui-editor";

// A FOLHA DO CELULAR: o painel de uma ferramenta subindo de baixo, como no CapCut.
//
// Antes, no celular, o painel da aba ficava ESPREMIDO numa faixa de ~200px entre a fileira
// de abas e a linha do tempo, rolando por dentro -- a biblioteca de músicas mostrava duas
// linhas por vez. A folha usa a altura que a tela tem, por cima da linha do tempo, e a
// fileira de ferramentas continua embaixo dela: trocar de ferramenta é um toque, e tocar
// de novo na mesma fecha. O palco continua à vista em cima (o que se escolhe, se vê).
//
// Fecha no ✕, no Esc, ou puxando a alça pra baixo (mais de 80px, ou rápido).

type Props = {
  aberta: boolean;
  titulo: ReactNode;
  aoFechar(): void;
  children: ReactNode;
  /** Distância do pé da tela: a fileira de ferramentas fica embaixo da folha. */
  base: number;
  /** Altura máxima (CSS). */
  altura?: string;
  acao?: ReactNode;
};

export default function Folha({ aberta, titulo, aoFechar, children, base, altura = "min(60svh, 560px)", acao }: Props) {
  const [dy, setDy] = useState(0);
  const [puxando, setPuxando] = useState(false);
  const arrasto = useRef<{ y0: number; t0: number } | null>(null);

  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  const soltar = (y: number) => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a) return;
    const d = Math.max(0, y - a.y0);
    const rapido = d / Math.max(1, performance.now() - a.t0) > 0.6;
    setDy(0);
    setPuxando(false);
    if (d > 80 || (rapido && d > 24)) aoFechar();
  };

  return (
    <div className="fixed inset-x-0 z-40" style={{ bottom: base }} data-folha="1" role="dialog" aria-label={typeof titulo === "string" ? titulo : undefined}>
      <div
        className="ed-folha flex flex-col overflow-hidden rounded-t-[22px] bg-[var(--ed-painel)] shadow-[0_-18px_48px_-12px_rgb(0_0_0/0.7)] ring-1 ring-[var(--ed-linha)]"
        style={{ height: altura, transform: dy ? `translateY(${dy}px)` : undefined, transition: puxando ? "none" : "transform 160ms ease-out" }}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            arrasto.current = { y0: e.clientY, t0: performance.now() };
            setPuxando(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => arrasto.current && setDy(Math.max(0, e.clientY - arrasto.current.y0))}
          onPointerUp={(e) => soltar(e.clientY)}
          onPointerCancel={() => {
            arrasto.current = null;
            setDy(0);
            setPuxando(false);
          }}
        >
          <div className="flex justify-center pt-2">
            <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 px-4 pb-2 pt-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[var(--ed-texto)]">{titulo}</h2>
            {acao}
            <BotaoIcone rotulo="Fechar" icone="fechar" onClick={aoFechar} />
          </div>
        </div>
        <div className="ed-rolagem min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}
