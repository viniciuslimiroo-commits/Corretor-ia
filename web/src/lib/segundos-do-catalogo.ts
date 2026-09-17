// GERADO por scripts/gerar-picos-audio.ts -- não editar à mão; rode o script de novo.
//
// Duração exata (em segundos, com 3 casas) de cada arquivo da biblioteca de áudio, pela
// contagem de amostras decodificadas. A linha do tempo usa pra saber onde a música acaba
// sem laço e quanto dá pra deslizar o trecho, sem baixar o arquivo no navegador.

import type { EfeitoSonoroId, MusicaId } from "./video";

export const SEGUNDOS_MUSICA: Readonly<Partial<Record<MusicaId, number>>> = {
  calma: 45.003,
  sereno: 45.003,
  aconchego: 45.003,
  elegante: 45.003,
  sofisticado: 45.003,
  lounge: 45.003,
  moderna: 45.003,
  urbano: 45.003,
  minimal: 45.003,
  alegre: 45.003,
  familia: 45.003,
  verao: 45.003,
  cinematografica: 45.003,
  epico: 45.003,
  inspirador: 45.003,
};

export const SEGUNDOS_EFEITO: Readonly<Partial<Record<EfeitoSonoroId, number>>> = {
  passagem: 2.603,
  clique: 2.005,
  brilho: 2.912,
  impacto: 2.912,
  sino: 2.859,
  toque: 2.005,
};
