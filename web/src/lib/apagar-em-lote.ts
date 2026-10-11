// APAGAR VÁRIOS DE UMA VEZ, dizendo a verdade sobre o que saiu e o que ficou.
//
// Ele em 10/10/2026: "na opção de vídeos no editor e em outros locais que seja possível ter
// a opção de escolher vários arquivos de uma vez para apagar".
//
// Vídeo sai um por um pela rota dele (`DELETE /api/video/:id`), que é quem confere o dono.
// Mandar dez pedidos e mostrar "apagados!" porque a função não estourou é a armadilha: se
// três falharem, a tela mente e a pessoa só descobre quando os três reaparecem. Então aqui
// cada id volta com o seu desfecho, e quem chama é obrigado a olhar.

/** O que aconteceu com cada id. `falharam` vazio é a única forma de "deu tudo certo". */
export type ResultadoLote = { apagados: string[]; falharam: { id: string; motivo: string }[] };

/** Quantos pedidos ao mesmo tempo. Apagar não tem pressa, e o servidor é o dele. */
const DE_CADA_VEZ = 4;

/**
 * Apaga vídeos em lote. Nunca estoura: devolve o que saiu e o que ficou, com motivo.
 *
 * `apagarUm` existe pra o teste poder rodar sem rede -- e não pra chamar outra coisa.
 */
export async function apagarVideosEmLote(
  ids: string[],
  token: string,
  apagarUm: (id: string, token: string) => Promise<Response> = (id, t) => fetch(`/api/video/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } })
): Promise<ResultadoLote> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const apagados: string[] = [];
  const falharam: { id: string; motivo: string }[] = [];

  for (let i = 0; i < unicos.length; i += DE_CADA_VEZ) {
    const bloco = unicos.slice(i, i + DE_CADA_VEZ);
    const saidas = await Promise.all(
      bloco.map(async (id) => {
        try {
          const r = await apagarUm(id, token);
          if (r.ok) return { id, ok: true as const };
          // O corpo costuma dizer melhor que o número; o número é o fiador.
          const d = await r.json().catch(() => ({}) as { error?: string });
          return { id, ok: false as const, motivo: d.error || `o servidor respondeu ${r.status}` };
        } catch (e) {
          return { id, ok: false as const, motivo: e instanceof Error ? e.message : "falhou a conexão" };
        }
      })
    );
    for (const s of saidas) {
      if (s.ok) apagados.push(s.id);
      else falharam.push({ id: s.id, motivo: s.motivo });
    }
  }
  return { apagados, falharam };
}

/** Uma frase em português sobre o lote. `null` quando tudo saiu -- aí a lista já conta. */
export function recadoDoLote(r: ResultadoLote, singular = "vídeo", plural = "vídeos"): string | null {
  if (r.falharam.length === 0) return null;
  const quantos = (n: number) => `${n} ${n === 1 ? singular : plural}`;
  // Motivo repetido não vira lista de motivos iguais.
  const motivos = [...new Set(r.falharam.map((f) => f.motivo))];
  const porque = motivos.length === 1 ? motivos[0] : motivos.slice(0, 2).join("; ");
  if (r.apagados.length === 0) return `Não consegui apagar ${quantos(r.falharam.length)}: ${porque}.`;
  return `Apaguei ${quantos(r.apagados.length)}, mas ${r.falharam.length === 1 ? "um ficou" : `${r.falharam.length} ficaram`}: ${porque}.`;
}
