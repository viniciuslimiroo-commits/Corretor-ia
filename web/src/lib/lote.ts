"use client";

// Fila de lote no navegador: envia N fotos pro /api/gerar respeitando um limite de
// simultâneas e acompanha cada job até o fim. Não inventa rota nova -- é o mesmo
// caminho de uma foto só, repetido com disciplina.
//
// Por que no navegador e não no servidor: cada geração já é assíncrona (despacha no fal
// e volta), então quem coordena só precisa perguntar "acabou?". Fazer isso no servidor
// exigiria uma tabela de lote e um worker; no cliente, é um laço. O preço é a aba
// precisar ficar aberta -- e é por isso que a tela avisa isso em letra grande, e o
// histórico guarda tudo mesmo se ela fechar (cada foto é um job independente).
//
// TRÊS ao mesmo tempo: acima disso a fila do fal enfileira do mesmo jeito e o navegador
// só acumula requisições paradas; abaixo, o lote de 20 fotos passa de 10 minutos.
export const SIMULTANEAS = 3;

export type ItemLote = {
  id: string;
  arquivo: File;

  estado: "esperando" | "gerando" | "pronto" | "erro";
  jobId?: string;
  resultado?: string;
  erro?: string;
  etapa?: string;
};

export type Passo = (id: string, mudanca: Partial<ItemLote>) => void;

async function acompanhar(jobId: string, token: () => Promise<string>, aoAndar: (etapa: string) => void) {
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const resp = await fetch(`/api/job/${jobId}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const data = await resp.json();
    if (resp.status >= 500) continue; // instabilidade: tenta de novo
    if (!resp.ok) throw new Error(data.error || "A geração falhou.");
    if (data.status === "concluido") return data as { url: string };
    aoAndar(data.status === "upscaling" ? "Melhorando a resolução…" : data.posicaoNaFila ? `Na fila (${data.posicaoNaFila})…` : "Gerando…");
  }
  throw new Error("Demorou demais. Veja no histórico daqui a pouco.");
}

async function umaFoto(item: ItemLote, comum: { acao: string; parametros: Record<string, string>; imovelId: string | null }, token: () => Promise<string>, passo: Passo) {
  passo(item.id, { estado: "gerando", etapa: "Enviando…" });
  const form = new FormData();
  form.append("foto", item.arquivo);
  form.append("acao", comum.acao);
  form.append("parametros", JSON.stringify(comum.parametros));
  if (comum.imovelId) form.append("imovelId", comum.imovelId);

  const resp = await fetch("/api/gerar", { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: form });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Não consegui iniciar.");
  passo(item.id, { jobId: data.jobId, etapa: "Na fila…" });
  const final = await acompanhar(data.jobId, token, (etapa) => passo(item.id, { etapa }));
  passo(item.id, { estado: "pronto", resultado: final.url, etapa: undefined });
}

/**
 * Roda o lote inteiro. Devolve quantas deram certo. Não lança: cada foto que falha
 * fica marcada como erro e as outras seguem -- uma foto ruim não pode derrubar o lote.
 */
export async function rodarLote(
  itens: ItemLote[],
  comum: { acao: string; parametros: Record<string, string>; imovelId: string | null },
  token: () => Promise<string>,
  passo: Passo,
  cancelado: () => boolean
): Promise<{ prontas: number; falhas: number }> {
  const fila = [...itens];
  let prontas = 0;
  let falhas = 0;

  async function trabalhador() {
    for (;;) {
      const item = fila.shift();
      if (!item || cancelado()) return;
      try {
        await umaFoto(item, comum, token, passo);
        prontas++;
      } catch (e) {
        falhas++;
        passo(item.id, { estado: "erro", erro: e instanceof Error ? e.message : "Erro.", etapa: undefined });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, fila.length) }, trabalhador));
  return { prontas, falhas };
}
