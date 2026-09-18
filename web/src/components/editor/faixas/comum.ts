// Medidas e rótulos das faixas (docs/planos/linha-do-tempo-spec.md, D2 e D3).
//
// As alturas moram aqui, e não espalhadas em classes, porque o editor soma elas pra saber
// quanto sobra pro palco no celular (--altura-linha), e a bancada confere as somas: 114 sem
// faixa, 198 com seis faixas e uma aberta, 378 com todas abertas.

import type { FaixaId, TrilhaId } from "@/lib/linha-do-tempo";

export type Medidas = {
  controles: number;
  regua: number;
  cenas: number;
  /** Faixa aberta. */
  faixa: number;
  /** Faixa fechada: a tira colorida de 8px. */
  fina: number;
  /** Espaço entre faixas abertas (só no computador). */
  entre: number;
  /** Coluna de nomes das faixas (só no computador). */
  rotulos: number;
};

export const MEDIDAS_CELULAR: Medidas = { controles: 44, regua: 14, cenas: 56, faixa: 44, fina: 8, entre: 0, rotulos: 0 };
export const MEDIDAS_COMPUTADOR: Medidas = { controles: 40, regua: 16, cenas: 52, faixa: 28, fina: 8, entre: 2, rotulos: 72 };

/** Altura da linha do tempo inteira, pela mesma conta que o CSS faz. */
export function alturaDaLinha(m: Medidas, faixas: { aberta: boolean }[]): number {
  const corpo = faixas.reduce((s, f) => s + (f.aberta ? m.faixa : m.fina), 0);
  return m.controles + m.regua + m.cenas + corpo + Math.max(0, faixas.length - 1) * m.entre;
}

export const COR_DA_FAIXA: Record<FaixaId, string> = {
  voce: "var(--faixa-voce)",
  voz: "var(--faixa-voz)",
  musica: "var(--faixa-musica)",
  textos: "var(--faixa-textos)",
  adesivos: "var(--faixa-adesivos)",
  legendas: "var(--faixa-legendas)",
};

export const NOME_DA_TRILHA: Record<TrilhaId, string> = {
  cenas: "Fotos",
  voce: "Você",
  voz: "Voz",
  musica: "Música",
  textos: "Textos",
  adesivos: "Adesivos",
  legendas: "Legendas",
};

/** "0:14.2/0:31.0": cabe nos 112px da fileira de controles do celular (D2). */
export function tempoCurto(s: number): string {
  // Em décimos inteiros com folga: 14,2 guardado como 14,1999… saía "0:14.1".
  const d = Math.floor(Math.max(0, s) * 10 + 1e-6);
  const m = Math.floor(d / 600);
  const r = Math.floor(d / 10) % 60;
  return `${m}:${String(r).padStart(2, "0")}.${d % 10}`;
}

/** Marcas da régua a cada 1, 2, 5, 10, 15, 30 ou 60s: a primeira que der pelo menos 56px. */
export function passoDaRegua(pxPorSegundo: number): number {
  for (const p of [1, 2, 5, 10, 15, 30, 60]) if (p * pxPorSegundo >= 56) return p;
  return 60;
}

/** Zona de toque da alça: sempre 44px, metade (até 22) dentro do bloco e o resto fora. */
export function zonaDaAlca(largura: number): { dentro: number; fora: number } {
  const dentro = Math.min(22, largura / 2);
  return { dentro, fora: 44 - dentro };
}
