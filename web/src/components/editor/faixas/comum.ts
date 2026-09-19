// Medidas e rótulos das faixas (docs/planos/linha-do-tempo-spec.md, D2 e D3).
//
// As alturas moram aqui, e não espalhadas em classes, porque o editor soma elas pra saber
// quanto sobra pro palco no celular (--altura-linha), e a bancada confere as somas: 128 sem
// faixa, 222 com seis faixas e uma aberta, 392 com todas abertas (364 no computador).
//
// Revisão de 2026-09: tudo um pouco maior -- a fileira de controles ganhou o zoom, a trilha
// das fotos virou uma tira de filme de 60-64px (dá pra ver o que é cada cena), as faixas
// abertas passaram de 28 pra 34px no computador e as fechadas de 8 pra 10px.

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

export const MEDIDAS_CELULAR: Medidas = { controles: 48, regua: 20, cenas: 60, faixa: 44, fina: 10, entre: 0, rotulos: 0 };
export const MEDIDAS_COMPUTADOR: Medidas = { controles: 52, regua: 24, cenas: 64, faixa: 34, fina: 10, entre: 4, rotulos: 108 };

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


/** O ícone de cada faixa, no nome dela (computador) e dentro dos blocos. */
export const ICONE_DA_FAIXA: Record<string, string> = {
  voce: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  voz: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 9a6 6 0 0 0 12 0M12 18v3",
  musica: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  textos: "M5 6h14M12 6v13M9 19h6",
  adesivos: "M12 3l2.6 5.6L20 9.3l-4 4.1.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-4.1 5.4-.7Z",
  legendas: "M4 6h16v12H4zM7 13h4M13 13h4M7 16h10",
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

/** "4s", "1:05": o rótulo da marca da régua. */
export function rotuloDaRegua(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** Zoom da linha: 4 a 120px por segundo, numa escala que cresce por proporção (o controle
 *  deslizante anda igual em qualquer ponto -- de 4 pra 8 é tanto quanto de 60 pra 120). */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 120;
export const zoomDaPosicao = (p: number) => Math.round(ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, Math.min(100, Math.max(0, p)) / 100));
export const posicaoDoZoom = (z: number) => (Math.log(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 100;

/** Zona de toque da alça: sempre 44px, metade (até 22) dentro do bloco e o resto fora. */
export function zonaDaAlca(largura: number): { dentro: number; fora: number } {
  const dentro = Math.min(22, largura / 2);
  return { dentro, fora: 44 - dentro };
}
