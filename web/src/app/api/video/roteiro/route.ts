import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { chamarSincrono } from "@/lib/fal";
import { conferirFatos } from "@/lib/book-fatos";
import { REGRA_IDIOMA, idiomaDaRequisicao } from "@/i18n/idiomas";

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
    "Escreva a narração de um vídeo curto de anúncio de imóvel para redes sociais.",
    REGRA_IDIOMA[idiomaDaRequisicao(req)],
    "Regras: 3 a 4 frases, no máximo 60 palavras no total, tom acolhedor e direto, sem exageros nem promessas (nada de 'melhor da cidade'), sem emojis, sem hashtags, sem preço inventado. Termine convidando a chamar no WhatsApp para agendar uma visita. Responda só com o texto da narração.",
    titulo ? `Imóvel: ${titulo}.` : "",
    local ? `Local: ${local}.` : "",
    preco ? `Preço: ${preco}.` : "",
    legendas.length ? `Ambientes mostrados, em ordem: ${legendas.join("; ")}.` : "",
    observacoes ? `Detalhes que o corretor quer destacar: ${observacoes}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // O guarda de fatos vale aqui também. A narração vai num vídeo que o corretor publica,
  // e "a 5 minutos do shopping" dito em voz alta é tão afirmação quanto escrito num PDF.
  //
  // Aqui o "cadastro" é o que a PESSOA digitou nesta tela: título, preço, local e
  // observações. Qualquer número fora disso é invenção do modelo.
  const doFormulario = {
    id: null,
    titulo,
    endereco: local,
    preco,
    descricao: [observacoes, ...legendas].filter(Boolean).join(" "),
  };

  async function narrar(pedido: string): Promise<string> {
    const saida = (await chamarSincrono("fal-ai/any-llm", { model: MODELO, prompt: pedido, temperature: 0.7, max_tokens: 220 }, falKey as string, 40_000)) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(saida.error);
    return (saida.output ?? "").replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim().slice(0, 700);
  }

  try {
    let roteiro = await narrar(prompt);
    const v1 = conferirFatos(roteiro, doFormulario);
    if (v1.length > 0) {
      const recado = v1.map((x) => `"${x.trecho.trim()}"`).join("; ");
      roteiro = await narrar(`${prompt}

A resposta anterior foi recusada porque afirmou o que eu não te dei: ${recado}. Escreva de novo sem esses números.`);
      const v2 = conferirFatos(roteiro, doFormulario);
      if (v2.length > 0) {
        return NextResponse.json(
          { error: `A IA insistiu em afirmar o que você não escreveu (${v2.map((x) => x.trecho.trim()).join(", ")}). Escreva a narração você mesmo.` },
          { status: 422 }
        );
      }
    }
    if (roteiro.length < 10) throw new Error("resposta vazia");
    return NextResponse.json({ roteiro });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui escrever o roteiro agora (${e instanceof Error ? e.message.slice(0, 100) : "erro"}). Escreva o seu ou tente de novo.` }, { status: 502 });
  }
}
