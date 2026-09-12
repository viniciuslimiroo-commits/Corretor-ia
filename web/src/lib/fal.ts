// Camada de acesso ao fal.ai pela API DE FILA (queue.fal.run), não pela síncrona
// (fal.run). Documentação: fal.ai/docs/model-endpoints/queue
//
// Motivo da troca, medido em 11/09/2026: "remover objeto" levou 99,9s e "mobiliar" 38,2s
// de ponta a ponta. Segurar uma requisição HTTP por 100 segundos funciona no meu
// computador e morre na Vercel (10s por padrão no Hobby, 60s no teto). Com a fila, cada
// requisição dura segundos: uma despacha, as seguintes perguntam se já acabou.
//
// O catálogo de ações (prompts, provedores por ação, máscara, selo) mora em
// `acoes.ts`. Aqui fica só o transporte: montar corpo, despachar, consultar, buscar.

export type Provedor =
  | "fal-ai/nano-banana/edit"
  | "fal-ai/flux-pro/kontext"
  | "fal-ai/object-removal/mask"
  | "fal-ai/flux-pro/v1/erase"
  | "fal-ai/flux-pro/v1/fill";

export const UPSCALER = "fal-ai/clarity-upscaler";

export type EntradaModelo = {
  prompt: string;
  imagemUrl: string;
  mascaraUrl?: string;
  /** Segunda imagem (ex.: "usar móveis de outra foto"). Só o nano-banana aceita. */
  referenciaUrl?: string;
};

export function corpoRequisicao(modelo: Provedor, e: EntradaModelo) {
  switch (modelo) {
    case "fal-ai/object-removal/mask":
      // mask_expansion cresce a máscara alguns pixels antes de apagar, pra pegar a
      // sombra e a borda do objeto -- que o dedo do usuário quase nunca cobre direito
      // no celular. 15 é o padrão da própria fal.
      return { image_url: e.imagemUrl, mask_url: e.mascaraUrl, mask_expansion: 15 };
    case "fal-ai/flux-pro/v1/erase":
      return { image_url: e.imagemUrl, mask_url: e.mascaraUrl };
    case "fal-ai/flux-pro/v1/fill":
      // Inpainting: branco na máscara = área a preencher com o que o prompt pede.
      // É como "mobiliar só onde eu pintei" funciona.
      return { prompt: e.prompt, image_url: e.imagemUrl, mask_url: e.mascaraUrl, output_format: "jpeg" as const, safety_tolerance: "2" };
    case "fal-ai/flux-pro/kontext":
      return { prompt: e.prompt, image_url: e.imagemUrl, output_format: "jpeg" as const };
    default: {
      const image_urls = e.referenciaUrl ? [e.imagemUrl, e.referenciaUrl] : [e.imagemUrl];
      return { prompt: e.prompt, image_urls, output_format: "jpeg" as const };
    }
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
export async function despachar(modelo: string, corpo: unknown, falKey: string): Promise<Despacho> {
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
  if (!resp.ok) return { estado: "erro", mensagem: `consulta de status falhou (${resp.status})` };
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

/**
 * Chamada SÍNCRONA (fal.run), só pra modelos que respondem em segundos -- hoje o
 * avaliador de estorno (any-llm/vision). Tudo que envolve gerar imagem continua na fila.
 * O timeout é obrigatório: uma chamada síncrona pendurada come o tempo da função inteira.
 */
export async function chamarSincrono(modelo: string, corpo: unknown, falKey: string, timeoutMs = 30_000): Promise<unknown> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resp = await fetch(`https://fal.run/${modelo}`, {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`${modelo} respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Busca a saída do modelo depois que a fila disse COMPLETED. */
export async function resultado(responseUrl: string, falKey: string) {
  const resp = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!resp.ok) throw new Error(`resultado indisponível (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

/**
 * Tira a imagem da resposta do modelo. Os modelos não concordam num formato só:
 * uns devolvem `images: [...]`, o upscaler devolve `image: {...}`. E `width`/`height`
 * são opcionais, então quem precisar do tamanho real mede com o sharp depois de baixar.
 */
export function extrairImagem(saida: unknown): { url: string; width?: number; height?: number } {
  const s = saida as { images?: { url?: string }[]; image?: { url?: string } };
  const img = s?.images?.[0] ?? s?.image;
  if (!img?.url) throw new Error(`resposta do modelo sem imagem: ${JSON.stringify(saida).slice(0, 200)}`);
  return img as { url: string; width?: number; height?: number };
}
