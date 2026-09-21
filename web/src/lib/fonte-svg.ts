// A FONTE DO TEXTO QUE O SERVIDOR DESENHA.
//
// Achado em 21/09/2026, com a tela do Terreno na mão dele: as medidas, a área, o título e o
// aviso legal saíam como quadradinhos (▯▯▯) na imagem gerada. Reproduzido em produção.
//
// A causa não é o sharp nem o SVG: é a LISTA de fontes. O servidor da Vercel tem os arquivos
// da DejaVu, mas não tem a configuração do fontconfig que traduz os nomes genéricos. Então:
//
//   "DejaVu Sans, Verdana, Arial, Helvetica, sans-serif"   -> o selo das fotos sai perfeito
//   "Segoe UI, Arial, Helvetica, sans-serif"               -> tudo vira quadradinho
//
// A diferença é só uma: na primeira existe um nome de família que casa com um arquivo de
// fonte instalado. Segoe UI é da Microsoft, Arial e Helvetica não existem no Linux, e o
// `sans-serif` genérico não resolve sem os arquivos de alias do fontconfig -- sobra nada, e
// o Pango desenha o glifo vazio pra cada letra.
//
// Por isso esta constante existe e é uma SÓ: qualquer texto desenhado pelo servidor usa ela,
// e `scripts/testar-fontes-svg.ts` falha se alguém escrever outra lista num arquivo de
// servidor. A primeira da lista é a que o Linux tem; as seguintes são pra máquina de quem
// desenvolve (Windows e Mac não têm DejaVu, e caem no Geist/Segoe UI, como antes).
export const FONTE_SVG_SERVIDOR = "Geist, DejaVu Sans, Segoe UI, Verdana, Arial, Helvetica, sans-serif";

/** A família que precisa estar em toda lista: é a única que o servidor tem de verdade. */
export const FAMILIA_QUE_O_SERVIDOR_TEM = "Geist";
