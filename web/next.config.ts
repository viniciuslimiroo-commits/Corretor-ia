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
      { source: "/biblioteca/material", destination: "/materiais/montar", permanent: true },
    ];
  },
};

export default nextConfig;
