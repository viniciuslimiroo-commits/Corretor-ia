/**
 * "Minhas fotos saem com o meu logo?" -- a escolha da pessoa, lembrada.
 *
 * POR QUE EXISTE (29/09/2026): o dono foi procurar onde se põe o logo na foto e não achou.
 * Achar era difícil por três motivos somados: o botão só existe DEPOIS que a foto fica
 * pronta, some por completo pra quem ainda não subiu logo, e -- o pior -- nascia
 * desmarcado em TODA exportação, sem guardar a escolha. Esquecer uma vez é uma foto no
 * portal sem a marca dele, e ninguém percebe até o anúncio estar no ar.
 *
 * Pior ainda, o produto se contradizia: baixar o imóvel INTEIRO (o ZIP) sempre mandou
 * `logo=1` fixo, então o lote saía carimbado enquanto a foto avulsa saía limpa. Mesmo
 * produto, defaults opostos.
 *
 * ONDE MORA E POR QUÊ: no navegador, não no banco. Guardar no perfil exigiria uma migração
 * SQL que só o dono aplica à mão no Supabase, e o recurso ficaria quebrado no intervalo
 * entre publicar o código e ele rodar o SQL. Como o PADRÃO já resolve o caso comum (quem
 * tem logo quer usá-lo), o que a memória acrescenta é só lembrar de um "não" deliberado --
 * e isso o navegador guarda bem. Se um dia virar campo do perfil, este arquivo é o único
 * lugar a mudar.
 *
 * `null` é resposta legítima e diferente de `false`: significa "essa pessoa nunca decidiu",
 * e é o que permite ao padrão valer sem apagar um "não" que alguém tenha dito.
 */

const CHAVE = "encena.logo-na-foto";

/** A escolha guardada, ou `null` se a pessoa nunca marcou nem desmarcou. */
export function logoNaFotoGuardado(): boolean | null {
  // No servidor não há navegador; e mesmo nele o acesso pode estourar (janela anônima,
  // dados de site bloqueados). Preferência é conforto: nunca pode derrubar a tela.
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

/** Guarda a escolha. Falhar aqui não é erro de ninguém: a exportação segue igual. */
export function guardarLogoNaFoto(valor: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, valor ? "1" : "0");
  } catch {
    // janela anônima ou armazenamento cheio: a escolha vale nesta sessão e pronto
  }
}

/**
 * O valor que a caixa deve mostrar.
 *
 * Sem logo cadastrado não há o que carimbar -- `false`, e a tela nem oferece.
 * Com logo e sem escolha registrada, vem LIGADO: subir um logo é o ato de quem quer usá-lo,
 * e é o mesmo que o ZIP do imóvel já fazia sozinho. Quem não quiser desmarca uma vez, e o
 * "não" fica guardado.
 */
export function logoNaFotoPadrao(temLogo: boolean): boolean {
  if (!temLogo) return false;
  const guardado = logoNaFotoGuardado();
  return guardado === null ? true : guardado;
}

/**
 * ONDE o logo cai na foto -- a escolha da pessoa, lembrada como a de usá-lo ou não.
 *
 * Mora ao lado de `logoNaFoto` pelo mesmo motivo e com os mesmos cuidados: é conforto, não
 * função, e por isso falhar aqui nunca pode derrubar a exportação. A diferença é que aqui
 * não há três estados -- não escolher é o padrão, e o padrão é uma posição de verdade.
 */
const CHAVE_POSICAO = "encena.logo-posicao";

export function posicaoLogoGuardada(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAVE_POSICAO);
  } catch {
    return null;
  }
}

export function guardarPosicaoLogo(valor: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE_POSICAO, valor);
  } catch {
    // janela anônima: vale nesta sessão e pronto
  }
}
