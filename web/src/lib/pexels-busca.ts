// A BUSCA de clipes do Pexels, separada do download.
//
// Separado de `pexels-servidor.ts` por PESO: aquele arquivo abre o ffmpeg pra cortar o
// clipe, e o rastreio de dependências da Vercel põe o binário (79 MB) e as pastas que o
// render lê do disco em TODA rota que importa a cadeia, guardado por deploy. A rota
// /api/editor/pexels só procura clipe, e agora leva só isto.
import { ehUrlDoPexels, type ClipePexels } from "./pexels";

// A chave do Pexels mora SÓ no servidor (variável PEXELS_API_KEY no servidor). O navegador pede a
// busca pela rota /api/editor/pexels; a montagem do vídeo pede o arquivo pelo id.
//
// Duas regras da API do Pexels viram código: buscas iguais ficam em cache (limite de 200
// por hora e 20 mil por mês), e só se baixa o arquivo do clipe que alguém ESCOLHEU -- nada
// de baixar acervo.

const API = "https://api.pexels.com";
const CACHE_MS = 24 * 60 * 60 * 1000;

type ArquivoApi = { quality: string | null; file_type: string; width: number | null; height: number | null; link: string };
export type VideoApi = {
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

export async function chamar<T>(caminho: string): Promise<T> {
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
export function escolher(v: VideoApi, ladoMin: number) {
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

