// Custo real por geração. A coluna `jobs.custo_real` existia desde o Sprint 0 e nunca
// foi preenchida -- e sem ela não dá pra responder "quanto custa um cliente por mês",
// que é exatamente a conta que decide o preço da assinatura.
//
// ACHADO DE 11/09/2026, medido pela variação do saldo no fal ao longo de 4 gerações
// reais: US$ 0,3482 por geração completa, com upscale. O plano técnico trabalhava com
// "~US$0,04/imagem" (do teste de pipeline) e "~US$0,01/imagem" de upscale. O custo real
// é quase 7 vezes a premissa.
//
// A causa está publicada na página do modelo: o `clarity-upscaler` cobra **US$ 0,03 por
// megapixel de saída**. Subir pra 4096px de largura gera 4096x2728 = 11,2 megapixels,
// ou seja ~US$ 0,34 só de upscale -- várias vezes o custo do modelo de IA que ele está
// "polindo". O gasto não estava na inteligência, estava na resolução.
//
// Por que isso importa mais do que parece: o plano fala em "R$ 69/mês = 80 créditos".
// A 0,3482 dólar por crédito, 80 créditos custam ~US$ 28, uns R$ 150. O plano vendia
// por menos da metade do custo.

export const PRECO_UPSCALE_POR_MEGAPIXEL = 0.03; // fonte: fal.ai/models/fal-ai/clarity-upscaler

/**
 * Largura-alvo do upscale.
 *
 * Era 4096. Baixou pra 2048 em 11/09/2026, e a razão é que 4096 nunca chegava ao
 * anúncio: os presets de export reduzem pra 3840 (ZAP/VivaReal/OLX) ou 1920 (genérico),
 * e o `fit: inside` derruba ainda mais. Estávamos pagando por megapixel que o próprio
 * app jogava fora no passo seguinte.
 *
 * A conta, a US$ 0,03/MP de saída:
 *   4096 de largura -> 11,2 MP -> ~US$ 0,34
 *   2048 de largura ->  2,8 MP -> ~US$ 0,08
 *
 * O modelo de IA entrega ~1248px, então 2048 ainda é um upscale real de 1,6x, dentro da
 * faixa em que o clarity agrega nitidez de verdade em vez de inventar detalhe caro.
 * Se algum portal publicar exigência maior, sobe aqui -- sabendo o preço.
 */
// 1600px: o ZAP/VivaReal/OLX aceitam de 260 a 3840 de largura, e 1600 já passa do que
// qualquer anúncio mostra na tela. Estava em 2048, e a bateria de 12/09/2026 mediu
// US$ 0,13 por geração (o upscaler cobra por megapixel de SAÍDA), o que deixava o plano
// Imobiliária no vermelho se o cliente usasse tudo. 1600 corta ~40% desse custo.
// Quem precisa de mais tem a ação "Converter em HD", que vai a 2560.
export const ALVO_LARGURA_UPSCALE = 1600;

export function custoEstimadoUpscale(largura: number, altura: number): number {
  return ((largura * altura) / 1_000_000) * PRECO_UPSCALE_POR_MEGAPIXEL;
}

/**
 * Saldo da conta no fal, em dólares.
 *
 * Serve pra medir o custo REAL de um job: lê antes de despachar, lê de novo ao
 * concluir, e a diferença é o que aquele job custou. É mais confiável que tabela de
 * preço, que envelhece calada.
 *
 * Limite conhecido: se duas gerações rodarem ao mesmo tempo, uma contamina a medição da
 * outra. Com o volume de hoje (um usuário testando) a medição é exata; quando houver
 * concorrência de verdade, trocar por relatório de uso do fal e deixar esta medição como
 * conferência. Está documentado aqui pra ninguém confiar no número além do que ele vale.
 */
export async function saldoFal(falKey: string): Promise<number | null> {
  try {
    const resp = await fetch("https://rest.alpha.fal.ai/billing/user_balance", {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!resp.ok) return null;
    const valor = parseFloat(await resp.text());
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null; // medir custo nunca pode derrubar uma geração
  }
}
