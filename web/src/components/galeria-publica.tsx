"use client";

import Comparador from "./comparador";

// Galeria da página compartilhada: cada foto com o comparador antes/depois quando a
// original existe. É o que o cliente do corretor vê no celular, então uma coluna, foto
// grande, texto mínimo.

export type FotoPublica = {
  id: string;
  antes: string | null;
  depois: string;
  rotulo: string;
  detalhe: string;
};

export default function GaleriaPublica({ fotos }: { fotos: FotoPublica[] }) {
  return (
    <div className={"grid gap-6 " + (fotos.length > 1 ? "md:grid-cols-2" : "")}>
      {fotos.map((f) => (
        <figure key={f.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {f.antes ? (
            <Comparador antes={f.antes} depois={f.depois} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.depois} alt={f.rotulo} className="block w-full" />
          )}
          <figcaption className="flex items-baseline justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-neutral-800">{f.rotulo}</span>
            {f.detalhe && <span className="truncate text-xs text-neutral-500">{f.detalhe}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
