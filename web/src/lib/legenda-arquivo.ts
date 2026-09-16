import { LIMITES, type TrechoLegenda } from "./video";

// Ler um arquivo de legenda que a pessoa já tem.
//
// Quem já legendou o vídeo noutro lugar (ou recebeu a transcrição do cliente) não deve
// digitar tudo de novo nem pagar uma transcrição pra ter o que já está no disco. São
// dois formatos, e os dois são texto:
//
//   SRT   numeração, tempo com vírgula nos milésimos, linha em branco entre blocos
//   VTT   o mesmo com "WEBVTT" no topo e ponto no lugar da vírgula
//
// ASS fica de fora de propósito: ele carrega estilo, posição e fonte próprios, e importar
// isso significaria ou ignorar metade do arquivo (e mentir) ou implementar um motor de
// estilo que a Encena não tem. Quem tem ASS converte pra SRT em qualquer lugar.

/** "00:01:02,500" ou "00:01:02.500" -> 62.5 */
function segundos(marca: string): number | null {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(marca.trim());
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
  // Alguns arquivos trazem só mm:ss,mmm.
  const c = /^(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(marca.trim());
  if (c) return Number(c[1]) * 60 + Number(c[2]) + Number(c[3].padEnd(3, "0")) / 1000;
  return null;
}

/**
 * Lê SRT ou VTT e devolve os trechos, ou uma mensagem dizendo o que está errado.
 *
 * Nunca lança: arquivo torto é coisa do dia a dia, e o que a pessoa precisa é saber o
 * motivo -- não ver a tela quebrar.
 */
export function lerLegenda(conteudo: string): { trechos: TrechoLegenda[]; erro: null } | { trechos: null; erro: string } {
  const limpo = conteudo.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!limpo) return { trechos: null, erro: "O arquivo está vazio." };

  const trechos: TrechoLegenda[] = [];
  for (const bloco of limpo.split(/\n\s*\n/)) {
    const linhas = bloco.split("\n").filter((l) => l.trim() && !/^WEBVTT/i.test(l));
    if (!linhas.length) continue;
    // O índice numérico do SRT é descartável; o que importa é achar a linha de tempo.
    const iTempo = linhas.findIndex((l) => l.includes("-->"));
    if (iTempo < 0) continue;
    const [de, ate] = linhas[iTempo].split("-->");
    const inicio = segundos((de ?? "").trim());
    // O fim pode vir com parâmetros de posição colados ("00:00:04.000 align:start").
    const fim = segundos((ate ?? "").trim().split(/\s+/)[0] ?? "");
    const texto = linhas
      .slice(iTempo + 1)
      .join(" ")
      // Tags de estilo do SRT/VTT: viram texto cru, que é o que a Encena desenha.
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (inicio === null || fim === null || !texto) continue;
    if (fim <= inicio) continue;
    trechos.push({ inicio, fim, texto: texto.slice(0, LIMITES.trechoMax) });
    if (trechos.length >= LIMITES.trechosMax) break;
  }

  if (!trechos.length) {
    return { trechos: null, erro: "Não achei nenhuma legenda com tempo aí dentro. Envie um arquivo .srt ou .vtt." };
  }
  return { trechos: trechos.sort((a, b) => a.inicio - b.inicio), erro: null };
}
