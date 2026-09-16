import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O ffmpeg estático e os arquivos que o render de vídeo lê do disco (fonte, músicas)
  // não são importados por código, então o rastreio de dependências da Vercel não os
  // veria. Aqui eles entram no bundle das rotas de vídeo explicitamente.
  outputFileTracingIncludes: {
    "/api/video/**": ["./bin/ffmpeg", "./assets/**"],
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
