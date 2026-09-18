"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// DESFAZER E REFAZER do editor (docs/planos/linha-do-tempo-spec.md, D1 e D7; pacote P6).
//
// O editor tem trinta e tantos `useState`; o histórico não conhece nenhum. Ele recebe um
// `doc` MEMORIZADO (useMemo com tudo que é edição: cenas, áudios, Você, legendas, textos...)
// e uma função `restaurar` que chama todos os setters de uma vez. Cada vez que o `doc` muda,
// o anterior vai pra pilha -- a não ser que a mudança venha colada na anterior (menos de
// 600ms, sem `novoPasso()` no meio): aí é a mesma rajada (um controle deslizante, uma frase
// digitada) e vira UM passo só.
//
// Três armadilhas que o desenho evita:
//   - o `doc` que volta pelo `restaurar` também "muda": a bandeira `restaurando` faz esse
//     retorno não virar passo novo;
//   - restaurar um retrato IGUAL ao atual não muda nada, o efeito não roda e a bandeira
//     ficaria presa pra sempre: retrato igual campo a campo é descartado antes;
//   - nada de ref lida no render: a pilha é um objeto criado uma vez e lido por
//     useSyncExternalStore.
//
// A conta mora em `historicoPuro`, sem React, pro teste rodar no Node.

export type Pilha<D> = {
  desfazer: D[];
  refazer: D[];
  /** O último `doc` visto: o estado ANTES da próxima mudança. */
  atual: D | undefined;
  ultimaEm: number;
  forcar: boolean;
  restaurando: boolean;
  /** Até quando as mudanças são o PONTO DE PARTIDA (logo depois de limpar), não passos. */
  absorverAte: number;
};

export type OpcoesHistorico = { limite?: number; juntarMs?: number };
const LIMITE = 50;
const JUNTAR_MS = 600;

/** Iguais campo a campo (por referência em cada campo): é assim que o `doc` memorizado se compara. */
export function iguaisPorCampo(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export const historicoPuro = {
  criar<D>(doc?: D): Pilha<D> {
    return { desfazer: [], refazer: [], atual: doc, ultimaEm: -Infinity, forcar: false, restaurando: false, absorverAte: -Infinity };
  },

  /** O `doc` mudou (ou foi visto pela primeira vez). */
  mudou<D>(p: Pilha<D>, doc: D, agora: number, o?: OpcoesHistorico): Pilha<D> {
    if (p.atual === undefined || agora <= p.absorverAte) return { ...p, atual: doc };
    if (p.restaurando) return { ...p, atual: doc, restaurando: false, ultimaEm: -Infinity };
    if (iguaisPorCampo(p.atual, doc)) return { ...p, atual: doc };
    const juntar = o?.juntarMs ?? JUNTAR_MS;
    const novo = p.forcar || agora - p.ultimaEm > juntar;
    let desfazer = p.desfazer;
    if (novo) {
      desfazer = [...p.desfazer, p.atual];
      const limite = o?.limite ?? LIMITE;
      if (desfazer.length > limite) desfazer = desfazer.slice(desfazer.length - limite);
    }
    return { ...p, desfazer, refazer: novo ? [] : p.refazer, atual: doc, ultimaEm: agora, forcar: false };
  },

  /** A próxima mudança é um passo novo, mesmo colada na anterior (botão, gesto confirmado). */
  novoPasso<D>(p: Pilha<D>): Pilha<D> {
    return { ...p, forcar: true };
  },

  desfazer<D>(p: Pilha<D>): { pilha: Pilha<D>; restaurar?: D } {
    const desfazer = [...p.desfazer];
    let alvo: D | undefined;
    while (desfazer.length) {
      const d = desfazer.pop() as D;
      if (!iguaisPorCampo(d, p.atual)) {
        alvo = d;
        break;
      }
    }
    if (alvo === undefined || p.atual === undefined) return { pilha: { ...p, desfazer } };
    return { pilha: { ...p, desfazer, refazer: [...p.refazer, p.atual], restaurando: true, forcar: false }, restaurar: alvo };
  },

  refazer<D>(p: Pilha<D>): { pilha: Pilha<D>; restaurar?: D } {
    const refazer = [...p.refazer];
    let alvo: D | undefined;
    while (refazer.length) {
      const d = refazer.pop() as D;
      if (!iguaisPorCampo(d, p.atual)) {
        alvo = d;
        break;
      }
    }
    if (alvo === undefined || p.atual === undefined) return { pilha: { ...p, refazer } };
    return { pilha: { ...p, refazer, desfazer: [...p.desfazer, p.atual], restaurando: true, forcar: false }, restaurar: alvo };
  },

  /**
   * Zera as pilhas (abrir outro vídeo, começar do zero). Quem limpa costuma trocar o estado
   * inteiro no MESMO clique; essas mudanças chegam logo depois e são o novo ponto de partida,
   * não um passo -- senão "Desfazer" voltaria pro vídeo anterior. A janela é curta (300ms)
   * pra, se nada mudar, a próxima edição de verdade continuar desfazível.
   */
  limpar<D>(p: Pilha<D>, doc: D, agora: number): Pilha<D> {
    return { ...historicoPuro.criar(doc), absorverAte: agora + 300 };
  },
};

type Loja<D> = {
  pilha: Pilha<D>;
  versao: number;
  ouvintes: Set<() => void>;
  assinar(fn: () => void): () => void;
  trocar(p: Pilha<D>): void;
};

function criarLoja<D>(): Loja<D> {
  const loja: Loja<D> = {
    pilha: historicoPuro.criar<D>(),
    versao: 0,
    ouvintes: new Set(),
    assinar(fn) {
      loja.ouvintes.add(fn);
      return () => loja.ouvintes.delete(fn);
    },
    trocar(p) {
      loja.pilha = p;
      loja.versao++;
      loja.ouvintes.forEach((f) => f());
    },
  };
  return loja;
}

export type Historico = {
  desfazer(): boolean;
  refazer(): boolean;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  novoPasso(): void;
  limpar(): void;
  contagem(): { desfazer: number; refazer: number };
};

export function useHistorico<D>(doc: D, restaurar: (d: D) => void, o?: OpcoesHistorico): Historico {
  const [loja] = useState<Loja<D>>(criarLoja);
  const podeDesfazer = useSyncExternalStore(loja.assinar, () => loja.pilha.desfazer.length > 0, () => false);
  const podeRefazer = useSyncExternalStore(loja.assinar, () => loja.pilha.refazer.length > 0, () => false);
  const limite = o?.limite;
  const juntarMs = o?.juntarMs;

  useEffect(() => {
    loja.trocar(historicoPuro.mudou(loja.pilha, doc, performance.now(), { limite, juntarMs }));
  }, [loja, doc, limite, juntarMs]);

  const desfazer = useCallback(() => {
    const r = historicoPuro.desfazer(loja.pilha);
    loja.trocar(r.pilha);
    if (r.restaurar === undefined) return false;
    restaurar(r.restaurar);
    return true;
  }, [loja, restaurar]);
  const refazer = useCallback(() => {
    const r = historicoPuro.refazer(loja.pilha);
    loja.trocar(r.pilha);
    if (r.restaurar === undefined) return false;
    restaurar(r.restaurar);
    return true;
  }, [loja, restaurar]);
  const novoPasso = useCallback(() => loja.trocar(historicoPuro.novoPasso(loja.pilha)), [loja]);
  const limpar = useCallback(() => loja.trocar(historicoPuro.limpar(loja.pilha, loja.pilha.atual as D, performance.now())), [loja]);
  const contagem = useCallback(() => ({ desfazer: loja.pilha.desfazer.length, refazer: loja.pilha.refazer.length }), [loja]);

  return { desfazer, refazer, podeDesfazer, podeRefazer, novoPasso, limpar, contagem };
}
