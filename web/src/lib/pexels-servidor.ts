import fs from "node:fs";
import path from "node:path";
import { rodarFfmpeg } from "./ffmpeg";
import { LOOP_CLIPE_S } from "./pexels";
import { chamar, escolher, type VideoApi } from "./pexels-busca";

// O DOWNLOAD do clipe escolhido, que corta com ffmpeg. A busca (sem ffmpeg) está em
// pexels-busca.ts -- ver o porquê lá.

/**
 * Baixa o clipe ESCOLHIDO e corta o laço curto, sem som, na altura que a cena usa.
 *
 * O endereço do arquivo vem da API pelo id (nunca do navegador): assim a montagem não
 * baixa uma URL arbitrária que alguém mandou no pedido.
 */
export async function prepararClipePexels(id: number, alturaNaCena: number, pasta: string, prefixo: string): Promise<{ arquivo: string; largura: number; altura: number } | null> {
  // O ffmpeg entra SÓ AQUI, e por `import()`: quem só BUSCA clipes (a rota do editor) não
  // pode arrastar o binário de 79 MB nem as pastas que o render lê do disco. O rastreio de
  // dependências da Vercel guarda esse peso por rota e por deploy -- foi o que estourou o
  // armazenamento de funções (50,85 GB de 10 GB em 17/09/2026).
  const v = await chamar<VideoApi>(`/videos/videos/${id}`);
  const arq = escolher(v, Math.min(720, Math.max(360, alturaNaCena)));
  if (!arq) return null;
  const bruto = path.join(pasta, `${prefixo}-pexels-bruto.mp4`);
  const r = await fetch(arq.link);
  if (!r.ok) return null;
  fs.writeFileSync(bruto, Buffer.from(await r.arrayBuffer()));

  const altura = Math.max(40, Math.round(alturaNaCena / 2) * 2);
  const largura = Math.max(40, Math.round((altura * arq.width) / arq.height / 2) * 2);
  const saida = path.join(pasta, `${prefixo}-pexels.mp4`);
  const ok = await rodarFfmpeg(
    [
      "-t", String(LOOP_CLIPE_S), "-i", bruto,
      "-an",
      // Borda branca fina: separa o clipe da foto do imóvel, como um adesivo recortado.
      "-vf", `fps=30,scale=${largura - 8}:${altura - 8}:flags=lanczos,pad=${largura}:${altura}:4:4:white,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      saida,
    ],
    60_000
  )
    .then(() => true)
    .catch(() => false);
  fs.rmSync(bruto, { force: true });
  if (!ok || !fs.existsSync(saida)) return null;
  return { arquivo: saida, largura, altura };
}
