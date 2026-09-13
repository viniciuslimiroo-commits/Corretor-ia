// Entrega de arquivos entre telas.
//
// Existe porque "Uma foto" e "Em lote" deixaram de ser duas escolhas do usuário: ele joga
// as fotos na tela de edição e, se vier mais de uma, o app manda pro lote sozinho. Só que
// File não atravessa navegação de rota -- não dá pra serializar em query nem em storage.
//
// Então os arquivos ficam aqui, na memória do módulo, entre o push e a montagem da outra
// tela. É intencionalmente frágil: se a pessoa recarregar no meio, some, e a tela de
// destino tem a própria área de envio pra isso. Guardar em IndexedDB seria mais robusto e
// muito mais código pra uma janela de 200 ms.
let pendentes: File[] = [];

export function guardarArquivos(arquivos: File[]) {
  pendentes = arquivos;
}

/** Pega e limpa: a entrega vale uma vez só, senão a foto volta sozinha na próxima visita. */
export function retirarArquivos(): File[] {
  const f = pendentes;
  pendentes = [];
  return f;
}
