import fs from "node:fs";
import path from "node:path";
import { rodarFfmpeg } from "./ffmpeg";
import { LOOP_CLIPE_S, ehUrlDoPexels, type ClipePexels } from "./pexels";

// A chave do Pexels mora SÓ aqui (variável PEXELS_API_KEY no servidor). O navegador pede a
// busca pela rota /api/editor/pexels; a montagem do vídeo pede o arquivo pelo id.
//
// Duas regras da API do Pexels viram código: buscas iguais ficam em cache (limite de 200
// por hora e 20 mil por mês), e só se baixa o arquivo do clipe que alguém ESCOLHEU -- nada
// de baixar acervo.

const API = "https://api.pexels.com";
const CACHE_MS = 24 * 60 * 60 * 1000;

type ArquivoApi = { quality: string | null; file_type: string; width: number | null; height: number | null; link: string };
type VideoApi = {
  id: number;
  url: string;
  width: number;
  height: number;
  duration: number;
  image: string;
  user: { name: string; url: string };
  video_files: ArquivoApi[];
};

export function temChavePexels(): boolean {
  return !!process.env.PEXELS_API_KEY;
}

async function chamar<T>(caminho: string): Promise<T> {
  const chave = process.env.PEXELS_API_KEY;
  if (!chave) throw new Error("sem_chave");
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: chave } });
  if (r.status === 429) throw new Error("limite");
  if (!r.ok) throw new Error(`pexels_${r.status}`);
  return (await r.json()) as T;
}

/** Os MP4 do vídeo, do menor pro maior (pela largura). */
function mp4s(v: VideoApi): (ArquivoApi & { width: number; height: number })[] {
  return v.video_files
    .filter((f): f is ArquivoApi & { width: number; height: number } => f.file_type === "video/mp4" && !!f.width && !!f.height && ehUrlDoPexels(f.link))
    .sort((a, b) => a.width * a.height - b.width * b.height);
}

/** O arquivo mais leve cujo MENOR lado tem pelo menos `ladoMin` px. */
function escolher(v: VideoApi, ladoMin: number) {
  const lista = mp4s(v);
  return lista.find((f) => Math.min(f.width, f.height) >= ladoMin) ?? lista[lista.length - 1] ?? null;
}

function paraClipe(v: VideoApi): ClipePexels | null {
  const previa = escolher(v, 300);
  if (!previa || !ehUrlDoPexels(v.image)) return null;
  return {
    id: v.id,
    url: v.url,
    autor: v.user?.name ?? "",
    autorUrl: v.user?.url ?? "",
    duracao: v.duration,
    largura: previa.width,
    altura: previa.height,
    capa: v.image,
    previa: previa.link,
  };
}

const buscas = new Map<string, { em: number; valor: { clipes: ClipePexels[]; temMais: boolean } }>();

export async function buscarClipesPexels(termo: string, pagina: number, emPortugues = false): Promise<{ clipes: ClipePexels[]; temMais: boolean }> {
  const q = termo.trim().slice(0, 80);
  const chave = `${q.toLowerCase()}|${pagina}|${emPortugues ? "pt" : "en"}`;
  const guardada = buscas.get(chave);
  if (guardada && Date.now() - guardada.em < CACHE_MS) return guardada.valor;
  // Clipe CURTO: um de 2 minutos serve igual, mas a prévia pesa à toa.
  const dados = await chamar<{ videos: VideoApi[]; next_page?: string }>(
    `/videos/search?query=${encodeURIComponent(q)}&per_page=18&page=${pagina}&size=small&max_duration=30${emPortugues ? "&locale=pt-BR" : ""}`
  );
  const valor = { clipes: dados.videos.map(paraClipe).filter((c): c is ClipePexels => !!c), temMais: !!dados.next_page };
  if (buscas.size > 300) buscas.clear();
  buscas.set(chave, { em: Date.now(), valor });
  return valor;
}

/**
 * Baixa o clipe ESCOLHIDO e corta o laço curto, sem som, na altura que a cena usa.
 *
 * O endereço do arquivo vem da API pelo id (nunca do navegador): assim a montagem não
 * baixa uma URL arbitrária que alguém mandou no pedido.
 */
export async function prepararClipePexels(id: number, alturaNaCena: number, pasta: string, prefixo: string): Promise<{ arquivo: string; largura: number; altura: number } | null> {
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
