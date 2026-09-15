"use client";

import { useCallback, useEffect, useState } from "react";
import { Icone, Rotulo } from "@/components/ui";

// A gaveta de mídia: as imagens que a pessoa já tem, dentro do editor.
//
// Não é galeria nova -- lê /api/materiais, a mesma Biblioteca. A ordem é pensada: primeiro
// as imagens DESTE imóvel que ainda não estão no book, depois as que já estão (marcadas),
// depois o resto da galeria. É a ordem em que a pessoa procura.
//
// Arrastar daqui pra cima de uma foto da página troca a foto. Clicar faz o mesmo, pro
// caso de celular e de quem não descobre o arrasto.

export type ItemMidia = {
  id: string;
  categoria: string;
  rotulo: string;
  detalhe: string;
  imovel: { id: string; titulo: string } | null;
  miniatura: string | null;
};

export default function GavetaMidia({
  aberta,
  aoFechar,
  token,
  imovelId,
  jaNoBook,
  aoEscolher,
  titulo = "Trocar a foto",
}: {
  aberta: boolean;
  aoFechar: () => void;
  token: () => Promise<string>;
  imovelId: string | null;
  jaNoBook: string[];
  /** Clicou numa imagem da gaveta. */
  aoEscolher: (jobId: string) => void;
  titulo?: string;
}) {
  const [itens, setItens] = useState<ItemMidia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [soDoImovel, setSoDoImovel] = useState(true);

  const buscar = useCallback(async () => {
    const r = await fetch("/api/materiais", { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return ((d.itens ?? []) as ItemMidia[]).filter((i) => i.categoria !== "video");
  }, [token]);

  useEffect(() => {
    if (!aberta || itens !== null) return;
    buscar()
      .then(setItens)
      .catch((e: Error) => setErro(e.message));
  }, [aberta, itens, buscar]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    if (aberta) window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  const doImovel = (itens ?? []).filter((i) => !imovelId || i.imovel?.id === imovelId);
  const lista = soDoImovel && doImovel.length > 0 ? doImovel : (itens ?? []);
  // Quem ainda não está no book vem primeiro: é o que a pessoa está procurando.
  const ordenada = [...lista].sort((a, b) => Number(jaNoBook.includes(a.id)) - Number(jaNoBook.includes(b.id)));

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <Rotulo>{titulo}</Rotulo>
        <button onClick={aoFechar} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" title="Fechar (Esc)">
          <Icone nome="fechar" className="h-4 w-4" />
        </button>
      </div>

      {imovelId && doImovel.length > 0 && (
        <div className="border-b border-neutral-100 px-3 py-2 text-xs">
          <button onClick={() => setSoDoImovel(true)} className={soDoImovel ? "font-semibold text-marca-indigo" : "text-neutral-500"}>
            Deste imóvel
          </button>
          <span className="mx-2 text-neutral-300">|</span>
          <button onClick={() => setSoDoImovel(false)} className={!soDoImovel ? "font-semibold text-marca-indigo" : "text-neutral-500"}>
            Todas
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {itens === null && !erro && <p className="text-sm text-neutral-500">Carregando…</p>}
        {itens !== null && ordenada.length === 0 && <p className="text-sm text-neutral-500">Nenhuma imagem.</p>}
        <ul className="grid grid-cols-3 gap-2">
          {ordenada.map((i) => {
            const usada = jaNoBook.includes(i.id);
            return (
              <li key={i.id}>
                <button
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/encena-job", i.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => aoEscolher(i.id)}
                  title={usada ? `${i.rotulo} · já está no book` : i.rotulo}
                  className="block w-full cursor-grab overflow-hidden rounded-lg border border-neutral-200 transition hover:border-marca-coral active:cursor-grabbing"
                >
                  <span className="relative block">
                    {i.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.miniatura} alt="" className={"aspect-square w-full object-cover " + (usada ? "opacity-45" : "")} loading="lazy" draggable={false} />
                    ) : (
                      <span className="block aspect-square w-full bg-neutral-100" />
                    )}
                    {usada && <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] text-white">já no book</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="border-t border-neutral-100 px-3 py-2 text-[11px] text-neutral-400">
        Arraste pra cima de uma foto da página, ou clique pra trocar a que está selecionada.
      </p>
    </aside>
  );
}
