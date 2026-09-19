"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { passoDaRegua, rotuloDaRegua, type Medidas } from "./comum";

// A RÉGUA (D3/D4). Tocar nela leva o cursor pro ponto; no computador, apertar e ARRASTAR
// passeia o cursor pelo vídeo (usar-gestos.ts). Marca grande com o segundo a cada passo, e
// marquinhas no meio quando cabem.
//
// A régua encosta nos botões da fileira de cima. O Chrome "ajusta" o toque pro elemento
// clicável mais perto, e um div sem ouvinte de clique não conta: medido na bancada, o toque
// a 7px dentro da régua caía no botão de cima. Um ouvinte NATIVO de clique põe a régua na
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
  const meio = passo * pxs >= 24 ? passo / 2 : 0;
  const marcas = useMemo(() => {
    const lista: { s: number; grande: boolean }[] = [];
    const fim = total + 1e-6;
    const unidade = meio || passo;
    for (let s = 0; s <= fim; s += unidade) lista.push({ s: Math.round(s * 100) / 100, grande: Math.abs(s / passo - Math.round(s / passo)) < 1e-6 });
    return lista;
  }, [total, passo, meio]);
  return (
    <div className="relative flex" style={{ height: medidas.regua }}>
      {!celular && <div className="sticky left-0 z-20 shrink-0 border-r border-[var(--ed-linha)] bg-[var(--ed-base)]" style={{ width: medidas.rotulos }} />}
      <div ref={setEl} data-alvo="regua" className="relative flex-1 cursor-pointer select-none" style={{ touchAction: "pan-x" }}>
        {marcas.map(({ s, grande }) => (
          <div key={s} className="pointer-events-none absolute bottom-0" style={{ left: `calc(var(--pxs) * ${s})` }}>
            <div className={`w-px ${grande ? "h-2 bg-[var(--ed-texto-3)]" : "h-1 bg-[var(--ed-linha-forte)]"}`} />
            {grande && <span className="absolute bottom-2.5 left-1 text-[10.5px] leading-none tabular-nums text-[var(--ed-texto-3)]">{rotuloDaRegua(s)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(Regua);
