// QUANTO FALTA PRO VÍDEO FICAR PRONTO, dito de um jeito que não pareça defeito.
//
// 24/09/2026. Ele gerou um vídeo de 12 cenas e mandou a foto da tela:
//
//   "Animando a cena 1 com IA… Etapa 1 de 15.
//    9min 16s de cerca de 9 min esperados."
//
// E disse: "o tempo fica contando mas é irregular, fala 9 minutos, 8, depois 11; ajustar isso
// pra não parecer ruim, senão o cliente vai achar ruim e não entender".
//
// Tinha dois defeitos no mesmo par de linhas.
//
//   1. O NÚMERO DE COMPARAÇÃO. "9min16s de cerca de 9 min" se contradiz sozinho: no segundo
//      em que o decorrido passa do estimado, a frase vira uma denúncia de que algo deu errado
//      -- e não deu, a fila da IA só estava mais lenta que a média.
//   2. A ESTIMATIVA VINDA DE FÓRMULA. Ela era calculada das cenas e mudava quando a lista
//      mudava, então o "cerca de N min" pulava de 9 pra 8 pra 11 sem nada ter acontecido.
//
// A troca é de régua: em vez de comparar com um palpite feito antes de começar, mede-se o
// ritmo DESTA geração. Uma etapa pronta já diz quanto custa uma etapa nesta fila, hoje, com
// estas fotos -- informação melhor que qualquer fórmula, porque a fila varia de hora em hora.
//
// Este arquivo é puro: entra número, sai número e texto.

/**
 * Quanto falta, em segundos, pelo ritmo medido até agora.
 *
 * `menorAteAgora` é o menor valor já mostrado nesta geração, e a função nunca devolve mais
 * que ele. Estimativa que SOBE é a que faz o corretor achar que travou, mesmo quando está
 * tudo certo -- e quando a fila piora de verdade, quem tem que avisar é uma frase em
 * português, não um número maior piscando na tela.
 *
 * Devolve `null` enquanto nenhuma etapa fechou: aí não há ritmo medido, e a tela mostra só o
 * que está fazendo e o tempo que já passou. Inventar um número nessa hora foi o defeito.
 */
export function restanteDaGeracao(feitas: number, total: number, decorridoSegundos: number, menorAteAgora: number): number | null {
  const etapas = Math.max(1, total);
  if (feitas < 1 || decorridoSegundos <= 0) return Number.isFinite(menorAteAgora) ? menorAteAgora : null;
  const porEtapa = decorridoSegundos / feitas;
  const cru = Math.max(0, (etapas - feitas) * porEtapa);
  const novo = Math.min(menorAteAgora, cru);
  return Number.isFinite(novo) ? novo : null;
}

/**
 * "menos de 1 min", "cerca de 4 min", "mais de 10 min".
 *
 * Grosso de propósito. O relógio do que já passou pode correr de segundo em segundo, porque é
 * um fato; o que FALTA é previsão, e previsão que muda a cada 2,5 s (o intervalo da consulta)
 * pisca na tela e parece instável mesmo quando está certa. Arredondado no minuto, o texto
 * muda no máximo uma vez por minuto.
 */
export function falta(segundos: number): string {
  if (segundos < 45) return "menos de 1 min";
  if (segundos > 10 * 60) return "mais de 10 min";
  return `cerca de ${Math.max(1, Math.round(segundos / 60))} min`;
}
