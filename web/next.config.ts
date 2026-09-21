import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O ffmpeg estático e os arquivos que o render de vídeo lê do disco (fonte, músicas)
  // não são importados por código, então o rastreio de dependências da Vercel não os
  // veria. Aqui eles entram no bundle das rotas de vídeo explicitamente.
  outputFileTracingIncludes: {
    // `public/adesivos` e `assets/fontes` são lidos do DISCO pela montagem do vídeo: sem
    // entrar aqui, funcionam local e somem na Vercel, onde a função só leva o que é listado.
    //
    // A chave é a ROTA, e só a que RENDERIZA leva esse peso. Com `/api/video/**` as cinco
    // rotas de vídeo (criar, upload, legendas, roteiro e esta) levavam ffmpeg + músicas +
    // adesivos, uns 110 MB CADA, guardados por deploy: foi o que estourou o armazenamento
    // de funções da Vercel (50,85 GB de 10 GB em 17/09/2026). Criar o vídeo e assinar
    // upload não abrem o ffmpeg -- quem monta é `/api/video/[id]`.
    //
    // Só os arquivos do NÍVEL de cima de adesivos, músicas e efeitos (`*`, não `**`): as
    // subpastas `mini/` e `previa/` são do navegador. Com `**` elas voltavam pro pacote
    // mesmo listadas nas exclusões abaixo -- a inclusão ganha da exclusão (medido em 18/09:
    // 11 MB de prévia dentro da função de montagem).
    // Nos adesivos, por EXTENSÃO: `./public/adesivos/*` também casa a PASTA `mini`, e pasta
    // incluída entra inteira.
    "/api/video/\\[id\\]": ["./bin/ffmpeg", "./assets/**", "./public/adesivos/*.png", "./public/adesivos/*.gif", "./public/musica/*.m4a", "./public/efeitos/*.m4a"],
    // O efeito de texto desenha com as fontes do disco; as outras rotas do editor, não.
    "/api/editor/efeito-texto": ["./assets/fontes/**"],

    // TEXTO DESENHADO PELO SERVIDOR (21/09/2026). O servidor da Vercel não tem fonte
    // nenhuma: todo `<text>` saía como glifo vazio -- as medidas do terreno, os nomes dos
    // cômodos, o selo de imagem ilustrativa. Agora `lib/texto-svg.ts` lê o .ttf e desenha a
    // letra como CONTORNO, que não depende de fonte instalada em lugar nenhum. Mas o arquivo
    // só chega na função se estiver LISTADO aqui: ele é lido do disco em tempo de execução,
    // e o rastreio de dependências não enxerga isso.
    //
    // Só a Geist (73 KB), e não `fontes/**` (2,4 MB de fontes de cartaz que só o vídeo usa):
    // esta lista se repete por rota, e foi peso repetido assim que estourou o armazenamento
    // de funções em 17/09.
    ...Object.fromEntries(
      [
        "/api/terreno",
        "/api/terreno/ia",
        "/api/planta",
        "/api/planta/humanizar",
        "/api/exportar",
        "/api/gerar",
        "/api/job/\\[id\\]",
        "/api/materiais/enviar",
        "/api/imoveis/\\[id\\]/zip",
      ].map((rota) => [rota, ["./assets/fontes/Geist-SemiBold.ttf"]])
    ),
  },
  // As miniaturas dos GIFs são só da galeria (o navegador baixa do CDN); o vídeo usa o GIF
  // grande. Fora do pacote da função, que já leva o ffmpeg.
  //
  // `musica/previa` e `efeitos/previa` (48 kHz, scripts/preparar-previa-catalogo.mjs) são
  // do NAVEGADOR: quem monta o vídeo usa os arquivos de 96 kHz que estão um nível acima.
  // Sem esta linha eles entram no pacote da função pelo `./public/musica/**` de cima e
  // custam ~11 MB de função pra nada.
  outputFileTracingExcludes: {
    "/api/video/\\[id\\]": ["./public/adesivos/mini/**", "./public/musica/previa/**", "./public/efeitos/previa/**"],
    // CRIAR o vídeo não roda o ffmpeg, mas importa o pipeline (pipelineInicial,
    // animacoesGuardadas), que importa a montagem -- e o rastreio seguia os caminhos até o
    // binário, as músicas, os adesivos e as fontes: ~130 MB numa rota que só grava a linha
    // no banco (medido em 18/09). Quem monta é /api/video/[id], e ela leva tudo acima.
    "/api/video": ["./node_modules/ffmpeg-static/**", "./bin/**", "./assets/**", "./public/musica/**", "./public/efeitos/**", "./public/adesivos/**"],
  },
  serverExternalPackages: ["ffmpeg-static"],

  // /biblioteca virou /materiais no mesmo dia em que nasceu. O redirect fica porque o
  // endereço antigo já saiu daqui em mensagem, e link que morre é pior que rota a mais.
  async redirects() {
    return [
      { source: "/biblioteca", destination: "/materiais", permanent: true },
      // /acervo virou /galeria: "acervo" é palavra de museu, e ninguém chama as próprias
      // fotos assim. Mesmo motivo do redirect acima, e mesma solução.
      { source: "/acervo", destination: "/galeria", permanent: true },
      { source: "/biblioteca/material", destination: "/materiais/montar", permanent: true },
      // O material se mudou pra dentro do Editor; o endereço antigo continua de pé pelo
      // mesmo motivo dos de cima.
      //
      // A página de vídeo é /videos, e continua existindo dentro do site, com o menu em
      // volta -- o Editor é a porta de quem quer mexer mais, não a substituta de quem só
      // quer o vídeo. As duas rodam o MESMO componente, em formas diferentes.
      //
      // Por que PLURAL, e não o /video de sempre: por um dia /video respondeu 308 pra
      // /editor/video, e redirecionamento PERMANENTE fica guardado no navegador. Tirar a
      // regra do código não desfaz o que já está no cache de quem passou por lá -- medido
      // aqui: o servidor devolvia 200 em /video e o navegador continuava indo pro editor.
      // Endereço novo é o único jeito de sair de um 308 que já saiu.
      { source: "/video", destination: "/videos", permanent: false },
      { source: "/materiais/:id((?!montar$)[0-9a-f-]{36})", destination: "/editor/material/:id", permanent: true },
    ];
  },
};

export default nextConfig;
