"use client";

import { useCallback, useMemo, useRef, useState } from "react";

// MARCAR VÁRIOS NUMA LISTA -- a mesma regra pras telas que têm lista de arquivos.
//
// Escrever isto três vezes (vídeos do editor, página de vídeos, galeria) é escrever três
// jeitos sutilmente diferentes de desmarcar, e um deles vai guardar id de coisa já apagada.
// Aqui a lista visível manda: o que não está nela não está marcado, ponto.

export type Selecao = {
  /** O modo de marcar está ligado? Nas telas onde tocar já faz outra coisa, isto é o pedal. */
  ligada: boolean;
  ligar(): void;
  /** Desliga E limpa: sair do modo com marcas invisíveis guardadas é pegadinha. */
  desligar(): void;
  /** Os marcados que AINDA existem na lista, na ordem em que a lista os mostra. */
  marcados: string[];
  marcado(id: string): boolean;
  /** Com `shift`, marca do último clicado até este -- lista grande sem clicar cinquenta vezes. */
  alternar(id: string, shift?: boolean): void;
  marcarTodos(): void;
  limpar(): void;
  /** Tira ids da marcação (depois de apagar de verdade). */
  tirar(ids: string[]): void;
};

export function usarSelecao(idsVisiveis: string[]): Selecao {
  const [ligada, setLigada] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const ultimo = useRef<string | null>(null);

  // A chave muda só quando a lista muda de verdade: `idsVisiveis` costuma ser array novo
  // a cada render, e isso refaria a conta (e a tela) sem motivo.
  const chave = idsVisiveis.join("\u0000");
  const validos = useMemo(() => {
    const visiveis = chave ? chave.split("\u0000") : [];
    const tem = new Set(marcados);
    return visiveis.filter((id) => tem.has(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` É `idsVisiveis`, em forma estável
  }, [chave, marcados]);

  const alternar = useCallback(
    (id: string, shift = false) => {
      const visiveis = chave ? chave.split("\u0000") : [];
      setMarcados((m) => {
        const de = ultimo.current ? visiveis.indexOf(ultimo.current) : -1;
        const ate = visiveis.indexOf(id);
        if (shift && de >= 0 && ate >= 0 && de !== ate) {
          const faixa = visiveis.slice(Math.min(de, ate), Math.max(de, ate) + 1);
          // Faixa SOMA, não inverte: quem arrasta a seleção espera juntar, não trocar.
          return [...new Set([...m, ...faixa])];
        }
        return m.includes(id) ? m.filter((x) => x !== id) : [...m, id];
      });
      ultimo.current = id;
    },
    [chave]
  );

  const marcarTodos = useCallback(() => setMarcados(chave ? chave.split("\u0000") : []), [chave]);
  const limpar = useCallback(() => {
    setMarcados([]);
    ultimo.current = null;
  }, []);
  const tirar = useCallback((ids: string[]) => setMarcados((m) => m.filter((x) => !ids.includes(x))), []);
  const desligar = useCallback(() => {
    setLigada(false);
    limpar();
  }, [limpar]);

  return {
    ligada,
    ligar: useCallback(() => setLigada(true), []),
    desligar,
    marcados: validos,
    marcado: useCallback((id: string) => validos.includes(id), [validos]),
    alternar,
    marcarTodos,
    limpar,
    tirar,
  };
}
