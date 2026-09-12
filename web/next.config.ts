import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O ffmpeg estático e os arquivos que o render de vídeo lê do disco (fonte, músicas)
  // não são importados por código, então o rastreio de dependências da Vercel não os
  // veria. Aqui eles entram no bundle das rotas de vídeo explicitamente.
  outputFileTracingIncludes: {
    "/api/video/**": ["./bin/ffmpeg", "./assets/**"],
  },
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
