/**
 * O e-mail de contato do Encena, num lugar só.
 *
 * Hoje é a caixa comercial que o dono LÊ todo dia. Quando existir uma caixa no domínio do
 * produto (contato@encena.ai), troca aqui e muda em todas as telas de uma vez -- o nome
 * do produto já ficou meio trocado por semanas quando estava escrito em oito arquivos.
 *
 * Termos e Privacidade citam este endereço como canal oficial: mudar aqui muda lá também.
 */
export const EMAIL_SUPORTE = "contato@limirobrasil.com";

/** `mailto:` com assunto pronto: quem escreve já chega dizendo de onde veio. */
export function linkDeSuporte(assunto = "Suporte Encena.ai"): string {
  return `mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(assunto)}`;
}
