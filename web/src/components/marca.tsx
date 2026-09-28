/**
 * A ASSINATURA escrita do produto: "Encena".
 *
 * Um componente só, e não a palavra solta em cada tela: quando o nome mudou de "Corretor
 * IA" pra "Encena" ele ficou meio trocado por semanas, porque estava escrito em oito
 * lugares.
 *
 * O ".ai" que vinha depois do nome SAIU em 28/09/2026. Ele existia para "dizer o endereço",
 * mas o endereço que ele dizia não é nosso: `encena.ai` não está registrado e não pertence
 * ao dono. Uma assinatura que anuncia um domínio de terceiro manda a pessoa para lugar
 * nenhum hoje, e para o site de outra empresa no dia em que alguém registrar.
 *
 * O domínio do dono é `encena.app.br` (registrado; DNS ainda não apontado). Quando ele
 * estiver no ar, e se fizer sentido, o sufixo volta -- com esse endereço, não com o outro.
 *
 * O tamanho vem de fora (`className`), como nas telas de hoje.
 */
export function Marca({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap font-bold tracking-tight text-marca-indigo ${className}`}>
      Encena
    </span>
  );
}
