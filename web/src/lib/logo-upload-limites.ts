// Os limites da logo, separados da validação de propósito: a tela precisa deles pra
// avisar antes de mandar 9 MB pelo 4G do corretor, e `logo-upload.ts` importa o `sharp`,
// que não existe no navegador. Um arquivo só de números atravessa os dois lados.
//
// O servidor continua sendo quem decide -- estes números são cópia pra dar recado cedo,
// nunca a checagem que vale.

export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_LADO_MIN = 32;
export const LOGO_LADO_MAX = 6000;
/** O que vai pro storage: PNG com transparência, no máximo 800px, pra compor rápido. */
export const LOGO_LADO_SAIDA = 800;
