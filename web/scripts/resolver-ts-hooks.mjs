// O gancho em si: tenta resolver como veio; se não achar e for caminho relativo, tenta
// com `.ts`. Só isso -- nada de reimplementar resolução de módulo.

export async function resolve(especificador, contexto, proximo) {
  try {
    return await proximo(especificador, contexto);
  } catch (e) {
    if ((especificador.startsWith("./") || especificador.startsWith("../")) && !/\.[mc]?[jt]s$/.test(especificador)) {
      return proximo(`${especificador}.ts`, contexto);
    }
    throw e;
  }
}
