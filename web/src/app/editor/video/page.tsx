"use client";

import EditorDeVideo from "@/components/editor/editor-video";

// A ÁREA DE EDIÇÃO: tela cheia, escura, trilha de ferramentas e linha do tempo.
//
// Mesma máquina da página /video -- as cenas, o palco, o pedido ao servidor são os
// mesmos. O que muda é a FORMA: aqui uma ferramenta de cada vez, com a tela toda pro
// trabalho; lá tudo empilhado numa coluna, dentro do site.
//
// Uma máquina, duas formas. Duas cópias da mesma tela envelheceriam em direções
// diferentes, e o recurso novo acabaria existindo só em uma delas.
export default function PaginaEditorVideo() {
  return <EditorDeVideo modo="editor" />;
}
