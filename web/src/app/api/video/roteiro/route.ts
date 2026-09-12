import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { chamarSincrono } from "@/lib/fal";

// Roteiro da narração escrito por IA a partir do que a pessoa já preencheu (título,
// preço, local, legendas das cenas). Curto de propósito: 3 a 4 frases, cabe em 20-25s
// de fala, que é o tamanho de um Reels. A pessoa edita antes de gerar.

const MODELO = "google/gemini-2.5-flash-lite";

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const titulo = texto(corpo?.titulo, 80);
  const preco = texto(corpo?.preco, 30);
  const local = texto(corpo?.local, 60);
  const observacoes = texto(corpo?.observacoes, 300);
  const legendas = Array.isArray(corpo?.legendas) ? corpo.legendas.map((l: unknown) => texto(l, 40)).filter(Boolean).slice(0, 12) : [];

  const prompt = [
    "Escreva a narração de um vídeo curto de anúncio de imóvel para redes sociais, em português do Brasil.",
    "Regras: 3 a 4 frases, no máximo 60 palavras no total, tom acolhedor e direto, sem exageros nem promessas (nada de 'melhor da cidade'), sem emojis, sem hashtags, sem preço inventado. Termine convidando a chamar no WhatsApp para agendar uma visita. Responda só com o texto da narração.",
    titulo ? `Imóvel: ${titulo}.` : "",
    local ? `Local: ${local}.` : "",
    preco ? `Preço: ${preco}.` : "",
    legendas.length ? `Ambientes mostrados, em ordem: ${legendas.join("; ")}.` : "",
    observacoes ? `Detalhes que o corretor quer destacar: ${observacoes}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const saida = (await chamarSincrono("fal-ai/any-llm", { model: MODELO, prompt, temperature: 0.7, max_tokens: 220 }, falKey, 40_000)) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(saida.error);
    const roteiro = (saida.output ?? "").replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim().slice(0, 700);
    if (roteiro.length < 10) throw new Error("resposta vazia");
    return NextResponse.json({ roteiro });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui escrever o roteiro agora (${e instanceof Error ? e.message.slice(0, 100) : "erro"}). Escreva o seu ou tente de novo.` }, { status: 502 });
  }
}
