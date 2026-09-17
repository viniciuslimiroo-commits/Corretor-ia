import { notFound } from "next/navigation";
import PreviaAudioDev from "./previa-audio-dev";

// Bancada da PRÉVIA DE ÁUDIO (docs/planos/linha-do-tempo-spec.md, P4).
//
// O que o Node não consegue provar: que o AudioContext sai de "suspended" depois do Play,
// que sai SOM do grafo (AnalyserNode), que a busca cai no lugar certo e que uma URL quebrada
// vira aviso em vez de silêncio calado. Tudo isso precisa de navegador de verdade, e o
// editor de vídeo inteiro é caro demais (login, fotos, upload) pra medir áudio.
//
// `notFound()` em produção: a rota existe no build, e responde 404 fora do desenvolvimento
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md -- a
// chamada tem que estar no caminho do render, e está: é o corpo do componente de servidor).
export default function Pagina() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviaAudioDev />;
}
