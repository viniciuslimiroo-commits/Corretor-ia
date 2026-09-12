"use client";

import { useState } from "react";

// Antes e depois com divisória arrastável. É a peça que mais vende o produto na
// tela: o corretor vê a diferença, não lê sobre ela. Implementado com um <input
// type="range"> por baixo, então funciona com teclado e leitor de tela sem esforço.

export default function Comparador({
  antes,
  depois,
  rotuloAntes = "Antes",
  rotuloDepois = "Depois",
}: {
  antes: string;
  depois: string;
  rotuloAntes?: string;
  rotuloDepois?: string;
}) {
  const [pos, setPos] = useState(50);

  return (
    <div className="relative w-full select-none overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={depois} alt="Depois" className="block w-full" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={antes}
          alt="Antes"
          className="block h-full w-full object-cover"
          style={{ width: `${10000 / pos}%`, maxWidth: "none" }}
          draggable={false}
        />
      </div>

      {/* divisória */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(${pos}% - 1px)` }}>
        <div className="h-full w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" />
        <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-marca-indigo" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
          </svg>
        </div>
      </div>

      <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        {rotuloAntes}
      </span>
      <span className="absolute top-3 right-3 rounded-full bg-marca-coral px-2.5 py-1 text-xs font-medium text-white">
        {rotuloDepois}
      </span>

      <input
        type="range"
        min={2}
        max={98}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Arraste para comparar antes e depois"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
