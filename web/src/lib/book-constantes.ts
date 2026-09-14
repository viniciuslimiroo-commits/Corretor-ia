// Constantes que a TELA e o PDF precisam enxergar iguais.
//
// Moram aqui, e não no componente, porque o componente é "use client" e o gerador de PDF
// é servidor: se cada lado tivesse a sua cópia, um dia elas se separariam -- e o jeito
// como isso apareceria é o texto do arquivo saindo alguns pontos acima ou abaixo do que a
// tela mostrou.

/**
 * Quanto do corpo da fonte fica ACIMA da linha de base, em fração do tamanho.
 *
 * No layout, o `y` de um texto é o TOPO da primeira linha (natural do HTML). O pdf-lib
 * desenha a partir da linha de BASE. Esta é a constante que converte um no outro.
 *
 * 0,8 é a altura de ascendente da Helvetica arredondada -- e o que importa aqui não é
 * estar certa na terceira casa, é ser a MESMA dos dois lados.
 */
export const ALTURA_ACIMA_DA_BASE = 0.8;
