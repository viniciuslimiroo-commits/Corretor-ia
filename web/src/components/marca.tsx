/**
 * A ASSINATURA escrita do produto: "Encena" forte e ".ai" discreto.
 *
 * Um componente só, e não a palavra solta em cada tela: quando o nome mudou de "Corretor
 * IA" pra "Encena" ele ficou meio trocado por semanas, porque estava escrito em oito
 * lugares. O ".ai" é menor, mais leve e mais claro de propósito -- ele diz o endereço,
 * não é o nome que se lê em voz alta.
 *
 * O tamanho vem de fora (`className`), como nas telas de hoje; o ".ai" acompanha em `em`.
 */
export function Marca({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap font-bold tracking-tight text-marca-indigo ${className}`}>
      Encena
      <span className="align-baseline text-[0.55em] font-semibold tracking-normal text-marca-indigo/50">.ai</span>
    </span>
  );
}
