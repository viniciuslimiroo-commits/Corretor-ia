"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ARRASTAR PARA REORDENAR, com o dedo.
//
// Por que não o arraste nativo do HTML (draggable + dragstart): ele NÃO EXISTE no celular.
// E o celular é onde ele usa. Então é evento de ponteiro, que vale nos dois.
//
// Duas decisões que vêm de erro anterior (obs. do log: "setPointerCapture numa alça de 14px
// não segura o arraste"):
//   1. a escuta de mover e soltar vai no DOCUMENTO, não na alça. O dedo sai da alça de 20px
//      no primeiro milímetro, e ali o arraste morria na metade;
//   2. a alça precisa de `touch-action: none`, senão o navegador entende rolagem e rouba o
//      gesto antes do primeiro pointermove.
//
// Não reordena durante o arraste: mostra uma LINHA onde vai cair e move só ao soltar. Mexer
// na lista enquanto o dedo está em cima faz os itens fugirem do dedo.

export type Arraste = {
  /** Guarda o elemento de cada linha, pra saber onde cada uma está na tela. */
  registrar: (chave: string) => (el: HTMLElement | null) => void;
  /** Põe no elemento que inicia o arraste (a alça). */
  pegar: (chave: string) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: { touchAction: "none" };
  };
  /** A chave que está sendo arrastada, pra apagar a linha original. */
  arrastando: string | null;
  /** O índice ONDE vai cair (a linha entra ANTES deste item; length = no fim). */
  alvo: number | null;
};

export function useArrastarLista(chaves: string[], aoSoltar: (de: number, para: number) => void): Arraste {
  const elementos = useRef(new Map<string, HTMLElement>());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  // Em refs também: os ouvintes do documento são criados uma vez e leem o valor de agora.
  const arrastandoRef = useRef<string | null>(null);
  const alvoRef = useRef<number | null>(null);
  const chavesRef = useRef(chaves);
  const aoSoltarRef = useRef(aoSoltar);
  // Sincroniza DEPOIS do desenho, não durante: o compilador do React proíbe escrever em ref
  // no meio do render, e com razão -- ali o valor pode mudar sem a tela saber.
  useEffect(() => {
    chavesRef.current = chaves;
    aoSoltarRef.current = aoSoltar;
  });

  const registrar = useCallback(
    (chave: string) => (el: HTMLElement | null) => {
      if (el) elementos.current.set(chave, el);
      else elementos.current.delete(chave);
    },
    []
  );

  /** Onde o dedo está cairia: antes do item cuja metade ainda não passou. */
  const calcularAlvo = useCallback((y: number) => {
    const lista = chavesRef.current;
    for (let i = 0; i < lista.length; i++) {
      const el = elementos.current.get(lista[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return lista.length;
  }, []);

  useEffect(() => {
    function mover(e: PointerEvent) {
      if (!arrastandoRef.current) return;
      // Sem isto o celular rola a página em vez de arrastar.
      e.preventDefault();
      const novo = calcularAlvo(e.clientY);
      if (novo !== alvoRef.current) {
        alvoRef.current = novo;
        setAlvo(novo);
      }
      // Perto da borda, a tela acompanha -- senão não dá pra levar a cena 8 pro topo.
      const margem = 90;
      if (e.clientY < margem) window.scrollBy({ top: -14 });
      else if (e.clientY > window.innerHeight - margem) window.scrollBy({ top: 14 });
    }
    function soltar() {
      const chave = arrastandoRef.current;
      const destino = alvoRef.current;
      arrastandoRef.current = null;
      alvoRef.current = null;
      setArrastando(null);
      setAlvo(null);
      if (!chave || destino === null) return;
      const de = chavesRef.current.indexOf(chave);
      if (de < 0) return;
      // A linha some do lugar antigo antes de entrar no novo: cair "depois" de si mesmo
      // é ficar parado, e cair mais pra baixo anda um a menos.
      const para = destino > de ? destino - 1 : destino;
      if (para !== de) aoSoltarRef.current(de, para);
    }
    document.addEventListener("pointermove", mover, { passive: false });
    document.addEventListener("pointerup", soltar);
    document.addEventListener("pointercancel", soltar);
    return () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.removeEventListener("pointercancel", soltar);
    };
  }, [calcularAlvo]);

  const pegar = useCallback(
    (chave: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Só o botão principal (ou o dedo): o direito abre menu, não arrasta.
        if (e.button !== 0) return;
        e.preventDefault();
        arrastandoRef.current = chave;
        const inicio = chavesRef.current.indexOf(chave);
        alvoRef.current = inicio;
        setArrastando(chave);
        setAlvo(inicio);
      },
      style: { touchAction: "none" as const },
    }),
    []
  );

  return { registrar, pegar, arrastando, alvo };
}
