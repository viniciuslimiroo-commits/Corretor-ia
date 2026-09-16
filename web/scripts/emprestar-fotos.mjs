// EMPRESTAR fotos reais pra um imóvel de teste -- e devolvê-las de onde vieram.
//
// Por que existe: os testes de material precisam de fotos ligadas a um imóvel, e as
// fotos de verdade da conta já pertencem a imóveis de verdade. Reatribuir e seguir em
// frente MEXE NO DADO DA PESSOA: quando o imóvel de teste é apagado no fim, o
// `property_id` da foto vira nulo e ela perde o imóvel original. Foi exatamente o que
// aconteceu -- fotos ficaram soltas depois de uma bateria de testes, e não há histórico
// pra reconstruir a ligação.
//
// A regra que sai disso: teste que escreve no banco de produção anota o valor anterior
// ANTES de mexer e devolve no fim, inclusive quando falha no meio.
//
//   const devolver = await emprestarFotos(BASE, cabecalhos, fotos, imovelDeTeste);
//   try { ... } finally { await devolver(); }

/**
 * Liga as fotos ao imóvel de teste e devolve uma função que restaura o dono original.
 *
 * `fotos` são itens de /api/materiais, que já trazem `imovel: { id } | null`.
 */
export async function emprestarFotos(base, cabecalhos, fotos, imovelDeTeste) {
  const antes = fotos.map((f) => ({ id: f.id, imovelId: f.imovel?.id ?? null }));

  const ligar = async (id, imovelId) =>
    fetch(`${base}/api/job/${id}`, {
      method: "PATCH",
      headers: cabecalhos,
      body: JSON.stringify({ imovelId }),
    }).catch(() => null);

  for (const f of antes) await ligar(f.id, imovelDeTeste);

  let devolvido = false;
  return async function devolver() {
    if (devolvido) return;
    devolvido = true;
    // Devolve na ordem inversa, e cada uma independente: uma falha não pode deixar as
    // outras penduradas no imóvel de teste.
    for (const f of [...antes].reverse()) await ligar(f.id, f.imovelId);
  };
}
