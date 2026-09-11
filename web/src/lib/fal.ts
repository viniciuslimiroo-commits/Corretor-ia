// Camada de acesso ao fal.ai pela API DE FILA (queue.fal.run), não pela síncrona
// (fal.run). Documentação: fal.ai/docs/model-endpoints/queue
//
// Motivo da troca, medido em 11/09/2026: "remover objeto" levou 99,9s e "mobiliar" 38,2s
// de ponta a ponta. Segurar uma requisição HTTP por 100 segundos funciona no meu
// computador e morre na Vercel (10s por padrão no Hobby, 60s no teto). Com a fila, cada
// requisição dura segundos: uma despacha, as seguintes perguntam se já acabou.
//
// Estas constantes moravam dentro de /api/gerar. Saíram de lá porque agora DUAS rotas
// precisam delas: quem despacha e quem avança a etapa.

export const PROMPTS: Record<string, string> = {
  mobiliar:
    "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result.",
  esvaziar:
    "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  melhorar:
    "This real estate photo has already been color- and exposure-corrected. Refine it further: remove noise and grain, recover fine detail, make the lighting look natural and professional like a real estate listing photo, gently balance any remaining color cast. Keep the composition, furniture, walls, and all objects exactly the same -- do not change anything structural, only refine lighting quality and clarity.",
  trocar_ceu:
    "Replace ONLY the sky in this photo with a soft golden-hour sky (gentle warm gradient, not overly dark or saturated). Keep the building, any neighboring buildings or structures, landscaping, and foreground EXACTLY the same -- do not extend the sky over any structure. Adjust lighting and reflections on the facade subtly to match the new sky naturally, without darkening the overall image.",
};

export type Provedor =
  | "fal-ai/nano-banana/edit"
  | "fal-ai/flux-pro/kontext"
  | "fal-ai/object-removal/mask"
  | "fal-ai/flux-pro/v1/erase";

export const UPSCALER = "fal-ai/clarity-upscaler";

// Ações que exigem o usuário pintar a área na foto. Não usam prompt de texto: o que sai
// é decidido pela máscara, não por uma frase.
export const ACOES_COM_MASCARA = new Set(["remover_objeto"]);

export const PROVEDORES_POR_ACAO: Record<string, [Provedor, Provedor]> = {
  mobiliar: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  esvaziar: ["fal-ai/flux-pro/kontext", "fal-ai/nano-banana/edit"],
  melhorar: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  trocar_ceu: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  // Os dois são modelos de apagar-por-máscara, não de editar-por-texto. Convenção
  // confirmada na doc dos dois: branco 255 = apaga, preto 0 = mantém.
  remover_objeto: ["fal-ai/object-removal/mask", "fal-ai/flux-pro/v1/erase"],
};

export function corpoRequisicao(
  modelo: Provedor,
  prompt: string,
  imagemUrl: string,
  mascaraUrl?: string
) {
  switch (modelo) {
    case "fal-ai/object-removal/mask":
      // mask_expansion cresce a máscara alguns pixels antes de apagar, pra pegar a
      // sombra e a borda do objeto -- que o dedo do usuário quase nunca cobre direito
      // no celular. 15 é o padrão da própria fal.
      return { image_url: imagemUrl, mask_url: mascaraUrl, mask_expansion: 15 };
    case "fal-ai/flux-pro/v1/erase":
      return { image_url: imagemUrl, mask_url: mascaraUrl };
    case "fal-ai/flux-pro/kontext":
      return { prompt, image_url: imagemUrl, output_format: "jpeg" as const };
    default:
      return { prompt, image_urls: [imagemUrl], output_format: "jpeg" as const };
  }
}

export type Despacho = {
  request_id: string;
  status_url: string;
  response_url: string;
};

/**
 * Coloca um pedido na fila e volta na hora. NÃO espera o modelo rodar.
 *
 * Guardamos `status_url` e `response_url` como o fal devolveu, em vez de remontar as
 * URLs a partir do id: o caminho do modelo tem barras ("fal-ai/flux-pro/v1/erase"), e
 * remontar à mão é um jeito silencioso de errar pra modelo de caminho aninhado.
 */
export async function despachar(
  modelo: string,
  corpo: unknown,
  falKey: string
): Promise<Despacho> {
  const resp = await fetch(`https://queue.fal.run/${modelo}`, {
    method: "POST",
    headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!resp.ok) {
    throw new Error(`${modelo} recusou o despacho (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }
  const data = await resp.json();
  if (!data.request_id || !data.status_url || !data.response_url) {
    throw new Error(`${modelo} devolveu despacho sem urls: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { request_id: data.request_id, status_url: data.status_url, response_url: data.response_url };
}

export type EstadoFila =
  | { estado: "esperando"; posicao: number | null }
  | { estado: "pronto" }
  | { estado: "erro"; mensagem: string };

/**
 * Pergunta à fila se já acabou. Três respostas possíveis, e a terceira é a que costuma
 * ser esquecida: a fila também devolve erro, e um erro do modelo tem que virar falha do
 * job (com estorno), não um "esperando" eterno que deixa o usuário olhando um spinner
 * e o crédito preso.
 */
export async function consultar(statusUrl: string, falKey: string): Promise<EstadoFila> {
  const resp = await fetch(statusUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!resp.ok) {
    return { estado: "erro", mensagem: `consulta de status falhou (${resp.status})` };
  }
  const data = await resp.json();
  switch (data.status) {
    case "COMPLETED":
      return { estado: "pronto" };
    case "IN_QUEUE":
      return { estado: "esperando", posicao: data.queue_position ?? null };
    case "IN_PROGRESS":
      return { estado: "esperando", posicao: null };
    default:
      return { estado: "erro", mensagem: `status inesperado da fila: ${data.status}` };
  }
}

/** Busca a saída do modelo depois que a fila disse COMPLETED. */
export async function resultado(responseUrl: string, falKey: string) {
  const resp = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!resp.ok) {
    throw new Error(`resultado indisponível (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  }
  return resp.json();
}

/**
 * Tira a imagem da resposta do modelo. Os modelos não concordam num formato só:
 * uns devolvem `images: [...]`, o upscaler devolve `image: {...}`. E `width`/`height`
 * são opcionais -- o flux erase não documenta esses campos -- então quem precisar do
 * tamanho real mede com o sharp depois de baixar, em vez de confiar no que veio.
 */
export function extrairImagem(saida: unknown): { url: string; width?: number; height?: number } {
  const s = saida as { images?: { url?: string }[]; image?: { url?: string } };
  const img = s?.images?.[0] ?? s?.image;
  if (!img?.url) {
    throw new Error(`resposta do modelo sem imagem: ${JSON.stringify(saida).slice(0, 200)}`);
  }
  return img as { url: string; width?: number; height?: number };
}
