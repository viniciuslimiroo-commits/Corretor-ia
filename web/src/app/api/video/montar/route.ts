import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { verFotos } from "@/lib/book-ia";

// MONTAR SOZINHO: o que cada foto É.
//
// Pedido dele em 22/09/2026, depois de comparar com o vídeo do concorrente: "quero que a
// geração automática seja parecida com este vídeo, quando a pessoa mandar as fotos, analisa
// as fotos... deixar isso já automático".
//
// Esta rota só faz a parte que precisa de olho: chama a visão e devolve, por foto, o
// ambiente (de uma lista fechada), a nota de 0 a 10 e uma legenda curta. QUEM DECIDE ordem,
// capa, movimento e descarte é o código puro em lib/video-automatico.ts, no navegador --
// porque regra não pode variar entre execuções, e a mesma foto tem que dar sempre a mesma
// ordem. (A leitura de planta ensinou isso: repetir a instrução no prompt não segurou a
// "laje técnica" fora da lista; um filtro de três linhas segurou.)
//
// Custo: `verFotos` GUARDA o resultado na linha da foto. Foto já vista -- por um book, por
// outro vídeo -- volta de graça. Foto nova custa uma chamada de visão, que é centavos do
// saldo fal e ZERO crédito do corretor. O teto existe pra um envio de 40 fotos não virar 40
// chamadas sem ninguém ter pedido.

export const maxDuration = 120;

/** Teto de fotos NOVAS por chamada. As já vistas entram todas, porque não custam nada. */
const MAX_NOVAS = 24;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = (await req.json().catch(() => ({}))) as { jobIds?: unknown };
  const jobIds = Array.isArray(corpo.jobIds)
    ? corpo.jobIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 60)
    : [];
  if (jobIds.length === 0) return NextResponse.json({ olhadas: [], semChave: false });

  const falKey = process.env.FAL_KEY;
  const vistos = await verFotos(db, userId, jobIds, falKey, MAX_NOVAS);

  // Sem chave da IA, a rota não quebra: devolve o que já estava guardado e avisa. A tela
  // então monta com o que tem -- ordem de envio -- em vez de deixar a pessoa sem nada.
  return NextResponse.json({
    semChave: !falKey,
    olhadas: jobIds
      .map((id) => vistos.get(id))
      .filter(Boolean)
      .map((o) => ({ jobId: o!.jobId, ambiente: o!.ambiente, qualidade: o!.qualidade, legenda: o!.legenda })),
  });
}
