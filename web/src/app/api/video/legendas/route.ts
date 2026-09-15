import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { chamarSincrono } from "@/lib/fal";
import { LIMITES, limparLegendas } from "@/lib/video";

// Transcreve o áudio de voz de um vídeo em trechos com tempo, pras legendas.
//
// NÃO custa crédito, e isso é decisão de produto: transcrever um minuto de fala custa
// centavos de centavo, e legenda é o que faz o vídeo funcionar no Instagram com o som
// desligado. Cobrar por ela seria cobrar pra o produto entregar o que prometeu.
//
// Só transcreve arquivo que é da pessoa (uploads/{userId}/) -- o mesmo cuidado das cenas.
// O que volta é sugestão: os trechos são gravados no espec e ficam editáveis, porque
// transcrição erra nome de bairro, de rua e de condomínio, que é justamente o que o
// vídeo está anunciando.

export const maxDuration = 120;

const MODELO = "fal-ai/whisper";

type Pedaco = { timestamp?: [number | null, number | null]; text?: string };

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const arquivo = typeof corpo?.arquivo === "string" ? corpo.arquivo : "";
  if (!arquivo.startsWith(`uploads/${userId}/`) || arquivo.includes("..")) {
    return NextResponse.json({ error: "Áudio não reconhecido." }, { status: 400 });
  }

  let url: string;
  try {
    url = await assinar(db, arquivo);
  } catch {
    return NextResponse.json({ error: "Não consegui abrir o áudio." }, { status: 400 });
  }

  let saida: { chunks?: Pedaco[]; text?: string };
  try {
    saida = (await chamarSincrono(
      MODELO,
      // `chunk_level: "segment"` devolve frases, não palavras soltas: legenda de Reel é
      // lida em frase, e palavra a palavra viraria oitenta trechos pra corrigir à mão.
      { audio_url: url, task: "transcribe", language: "pt", chunk_level: "segment" },
      falKey,
      110_000
    )) as { chunks?: Pedaco[]; text?: string };
  } catch (e) {
    return NextResponse.json({ error: `A transcrição falhou: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}` }, { status: 502 });
  }

  const trechos = (saida.chunks ?? [])
    .map((c) => ({
      inicio: Number(c.timestamp?.[0] ?? NaN),
      fim: Number(c.timestamp?.[1] ?? NaN),
      texto: String(c.text ?? "").trim(),
    }))
    .filter((t) => t.texto && Number.isFinite(t.inicio) && Number.isFinite(t.fim) && t.fim > t.inicio)
    .slice(0, LIMITES.trechosMax);

  // Sem pedaços com tempo (áudio curto demais, ou o modelo devolveu só o texto corrido),
  // não dá pra sincronizar nada -- e uma legenda fora de hora é pior que nenhuma.
  if (trechos.length === 0) {
    return NextResponse.json({ error: "Não consegui separar a fala em trechos. Tente com um áudio mais longo ou mais claro." }, { status: 422 });
  }

  // Passa pela mesma limpeza do espec: o que não sobrevive aqui não sobreviveria lá.
  const legendas = limparLegendas({ trechos, estilo: "faixa", posicao: "base" });
  return NextResponse.json({ legendas, texto: saida.text ?? "" });
}
