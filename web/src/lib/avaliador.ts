import { chamarSincrono } from "./fal";
import type { DefAcao } from "./acoes";

// Classificador de estorno: quando a pessoa pede o crédito de volta, um modelo de visão
// olha ANTES e DEPOIS, sabe o que foi pedido, lê o relato dela e diz se a geração falhou.
// A Pedra faz o mesmo (o teste de 09/09 achou a justificativa em inglês no (i) do
// histórico); aqui a justificativa sai em português e fica gravada em jobs.avaliacao.
//
// O veredito NÃO é a única palavra: a política em /api/job/[id]/reportar combina isto
// com o limite diário. O modelo decide se o estorno ultrapassa o limite de cortesia; ele
// não decide sozinho negar. Ver comentário lá.
//
// Custo: gemini-2.5-flash-lite via fal, centavos de dólar por chamada; só roda em reporte.

export const MODELO_AVALIADOR = "google/gemini-2.5-flash-lite";

export type Veredito = "falhou" | "ok" | "indeterminado";

export type Avaliacao = {
  veredito: Veredito;
  justificativa: string;
  modelo: string;
  em: string;
};

const SISTEMA = `You are a strict quality inspector for AI-edited real-estate photos. You receive the ORIGINAL photo (image 1) and the AI RESULT (image 2), the operation that was requested, and the user's complaint. Decide whether the result FAILED to deliver what was requested, or whether it is acceptable.

A result FAILS when, for example: the requested change is missing or barely visible; the wrong room type or wrong style was produced; walls, windows, doors or the camera angle were altered when they should have stayed; objects that should have been removed are still visible; obvious artifacts, warped geometry, floating furniture, duplicated or melted objects, unreadable areas; the image is blurry, dark or distorted compared with the original.

A result is OK when the requested change is present, plausible and photorealistic, even if the user's taste differs. Minor imperfections do not make it fail.

Reply ONLY with JSON: {"veredito":"falhou"|"ok","justificativa":"<one or two sentences in Brazilian Portuguese, concrete, naming what you saw>"}`;

export async function avaliarResultado(args: {
  falKey: string;
  acao: DefAcao;
  parametros: Record<string, string>;
  usouMascara: boolean;
  relato: string | null;
  urlAntes: string;
  urlDepois: string;
}): Promise<Avaliacao> {
  const { acao, parametros } = args;
  const esperado = acao.esperado ? acao.esperado(parametros) : acao.descricao;
  const prompt = [
    `Requested operation: "${acao.rotulo}" (${acao.id}).`,
    `What a correct result looks like: ${esperado}`,
    Object.keys(parametros).length ? `Parameters chosen: ${JSON.stringify(parametros)}.` : "",
    args.usouMascara ? "The user painted a mask: only the painted region was supposed to change." : "",
    args.relato ? `User's complaint (may be exaggerated, verify it against the images): "${args.relato.slice(0, 400)}"` : "The user did not describe the problem.",
    "Image 1 is the original, image 2 is the AI result.",
  ]
    .filter(Boolean)
    .join("\n");

  const em = new Date().toISOString();
  try {
    const saida = (await chamarSincrono(
      "fal-ai/any-llm/vision",
      { model: MODELO_AVALIADOR, system_prompt: SISTEMA, prompt, image_urls: [args.urlAntes, args.urlDepois], temperature: 0, max_tokens: 300 },
      args.falKey,
      45_000
    )) as { output?: string; error?: string | null };
    if (saida.error) throw new Error(saida.error);
    const texto = (saida.output ?? "").trim();
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error(`sem JSON na resposta: ${texto.slice(0, 120)}`);
    const parsed = JSON.parse(json) as { veredito?: string; justificativa?: string };
    const veredito: Veredito = parsed.veredito === "falhou" ? "falhou" : parsed.veredito === "ok" ? "ok" : "indeterminado";
    return { veredito, justificativa: String(parsed.justificativa ?? "").slice(0, 500), modelo: MODELO_AVALIADOR, em };
  } catch (e) {
    return {
      veredito: "indeterminado",
      justificativa: `O avaliador não respondeu (${e instanceof Error ? e.message.slice(0, 160) : "erro"}).`,
      modelo: MODELO_AVALIADOR,
      em,
    };
  }
}
