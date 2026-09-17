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
    "/api/video/\\[id\\]": ["./bin/ffmpeg", "./assets/**", "./public/adesivos/**", "./public/musica/**", "./public/efeitos/**"],
    // O efeito de texto desenha com as fontes do disco; as outras rotas do editor, não.
    "/api/editor/efeito-texto": ["./assets/fontes/**"],
  },
  // As miniaturas dos GIFs são só da galeria (o navegador baixa do CDN); o vídeo usa o GIF
  // grande. Fora do pacote da função, que já leva o ffmpeg.
  outputFileTracingExcludes: {
    "/api/video/\\[id\\]": ["./public/adesivos/mini/**"],
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
