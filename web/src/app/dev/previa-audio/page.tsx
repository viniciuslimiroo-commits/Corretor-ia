import PreviaAudioDev from "./previa-audio-dev";

// Bancada da PRÉVIA DE ÁUDIO (docs/planos/linha-do-tempo-spec.md, P4).
//
// O que o Node não consegue provar: que o AudioContext sai de "suspended" depois do Play,
// que sai SOM do grafo (AnalyserNode), que a busca cai no lugar certo e que uma URL quebrada
// vira aviso em vez de silêncio calado. Tudo isso precisa de navegador de verdade, e o
// editor de vídeo inteiro é caro demais (login, fotos, upload) pra medir áudio.
//
// Fechada em produção pelo `notFound()` de `../layout.tsx`, que vale pra toda bancada de
// /dev. SEM trava própria de propósito: é isso que faz o 404 desta rota ser prova de que o
// layout funciona, e não uma coincidência.
export default function Pagina() {
  return <PreviaAudioDev />;
}
