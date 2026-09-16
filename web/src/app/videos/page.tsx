"use client";

import EditorDeVideo from "@/components/editor/editor-video";

// VÍDEOS: a página de sempre, dentro do site.
//
// Escolher as fotos, o formato, a música, a voz e gerar -- tudo numa coluna, com o menu
// do Encena em volta. É o caminho de quem quer o vídeo e não quer aprender um editor.
//
// Quem quiser mexer mais tem o botão "Abrir no Editor", que leva a MESMA edição pra
// tela cheia, com trilha de ferramentas e linha do tempo. Nada se perde na passagem:
// é o mesmo componente, e o vídeo em edição continua de onde estava.
export default function PaginaVideo() {
  return <EditorDeVideo modo="simples" />;
}
