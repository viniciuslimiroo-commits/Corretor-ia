"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { passoDaRegua, type Medidas } from "./comum";

// A RÉGUA (D3/D4). Tocar nela leva o cursor pro ponto: no celular, a linha rola até o
// ponto ficar no centro, embaixo do cabeçote fixo; no computador, o cabeçote vai até lá.
// Os 14px são exceção documentada aos 44px de toque (D2).
//
// A régua encosta nos botões de 44px da fileira de cima. O Chrome "ajusta" o toque pro
// elemento clicável mais perto, e um div sem ouvinte de clique não conta: medido na
// bancada, o toque a 7px dentro da régua caía no botão de cima (Ajustar, Refazer). Um
// ouvinte NATIVO de clique (o do React fica na raiz e o Chrome não vê) põe a régua na
// disputa, e aí o ponto que está dentro dela ganha.

type Props = { total: number; pxs: number; medidas: Medidas; celular: boolean };

const nada = () => {};

function Regua({ total, pxs, medidas, celular }: Props) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    el.addEventListener("click", nada);
    return () => el.removeEventListener("click", nada);
  }, [el]);
  const passo = passoDaRegua(pxs);
  const marcas = useMemo(() => {
    const lista: number[] = [];
    for (let s = 0; s <= total + 1e-6; s += passo) lista.push(s);
    return lista;
  }, [total, passo]);
  return (
    <div className="relative flex" style={{ height: medidas.regua }}>
      {!celular && <div className="sticky left-0 z-20 shrink-0 border-r border-[var(--borda-editor)] bg-[var(--painel-editor)]" style={{ width: medidas.rotulos }} />}
      <div ref={setEl} data-alvo="regua" className="relative flex-1 cursor-pointer select-none" style={{ touchAction: "pan-x" }}>
        {marcas.map((s) => (
          <div key={s} className="pointer-events-none absolute top-0 bottom-0" style={{ left: `calc(var(--pxs) * ${s})` }}>
            <div className="h-[5px] w-px bg-[var(--letra-fraca)]" />
            <span className="absolute left-[3px] top-[2px] text-[9px] leading-none tabular-nums text-[var(--letra-fraca)]">{s}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(Regua);
