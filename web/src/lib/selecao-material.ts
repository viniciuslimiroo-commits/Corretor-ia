// Passa a seleção da Biblioteca pro montador de material.
//
// Por que não vai na URL: trinta uuid dão mais de mil caracteres de query, e a ordem
// importa (a primeira imagem é a capa). sessionStorage guarda a ordem, morre quando a
// aba fecha e não deixa link estranho no histórico do navegador.

const CHAVE = "encena.material.selecao";

export function guardarSelecao(ids: string[]) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(ids));
  } catch {
    // navegação privada sem storage: o montador cai no aviso de "nada escolhido"
  }
}

export function lerSelecao(): string[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
