"use client";

import { useEffect, useState } from "react";

// O LEMBRETE de que dá pra se gravar ou gravar a voz, no espaço vazio ao lado do palco.
//
// Pedido dele: "algo numa moldura, sem chamar absurdamente muita atenção, lembrando que a
// pessoa pode se gravar e/ou gravar a sua voz", com opção de fechar. Das quatro propostas
// em imagem, ele escolheu a do celular pequeno com a pessoa (opção B).
//
// Fechado fica fechado NESTE navegador (localStorage). É conveniência de quem vê, não dado
// do vídeo -- e se o armazenamento falhar (aba anônima, bloqueio), o lembrete só volta.

const CHAVE = "encena:lembrete-gravar-fechado";

export default function LembreteGravar({ aoGravar }: { aoGravar: () => void }) {
  // Começa ESCONDIDO e só aparece depois de ler o navegador: começar visível piscava o
  // lembrete por um instante pra quem já tinha fechado.
  const [fechado, setFechado] = useState(true);
  useEffect(() => {
    let lido = false;
    try {
      lido = window.localStorage.getItem(CHAVE) === "1";
    } catch {
      lido = false;
    }
    Promise.resolve().then(() => setFechado(lido));
  }, []);

  if (fechado) return null;

  function fechar() {
    setFechado(true);
    try {
      window.localStorage.setItem(CHAVE, "1");
    } catch {
      // sem armazenamento: fecha só nesta visita
    }
  }

  return (
    <div className="relative w-[210px] text-center">
      <button type="button" onClick={fechar} aria-label="Fechar o lembrete" title="Fechar" className="absolute -top-2 right-0 rounded-md p-1 text-neutral-500 transition hover:bg-white/10 hover:text-neutral-300">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="relative mx-auto mb-3 grid h-[150px] w-[94px] place-items-center rounded-2xl border-[1.5px] border-[#22406b] bg-gradient-to-b from-[#143055] to-[#11284a]">
        <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-6 -translate-x-1/2 rounded bg-[#22406b]" />
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-[#7f97b8]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" />
        </svg>
        <span aria-hidden className="absolute top-[52px] -right-2.5 grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-[#22406b] bg-[#173257]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#b9c8dc]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
          </svg>
        </span>
        <span aria-hidden className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#f06b4f]/15 px-2 py-0.5 text-[10px] text-[#ffb3a4]">
          <i className="block h-1.5 w-1.5 rounded-full bg-[#f06b4f]" />
          gravar
        </span>
      </div>
      <p className="text-sm font-semibold text-neutral-100">Apareça no seu anúncio</p>
      <p className="mt-1 mb-2 text-xs leading-snug text-neutral-400">Sua voz ou você na câmera, direto daqui.</p>
      <button type="button" onClick={aoGravar} className="text-xs font-medium text-[#ff9a84] hover:underline">
        Gravar agora →
      </button>
    </div>
  );
}
