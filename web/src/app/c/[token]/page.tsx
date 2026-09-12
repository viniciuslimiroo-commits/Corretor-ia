import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { ehToken } from "@/lib/compartilhar";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";
import { marcaEfetiva } from "@/lib/cobranca";
import GaleriaPublica, { type FotoPublica } from "@/components/galeria-publica";

// Página PÚBLICA de uma foto ou de um imóvel compartilhado. Quem chega aqui é o cliente
// do corretor, pelo WhatsApp, no celular. Renderizada no servidor a cada visita: lê com
// service role, assina as imagens por 1h e não guarda nada -- revogar o token no app
// corta o acesso na próxima visita. Sem índice de busca (robots noindex).

export const dynamic = "force-dynamic";

type Dono = { nome: string | null; creci: string | null; whatsapp: string | null; logo: string | null; cor: string | null };

type VideoPublico = { url: string; poster: string | null; vertical: boolean; duracao: number | null };

type Pagina = {
  titulo: string;
  subtitulo: string | null;
  fotos: FotoPublica[];
  video: VideoPublico | null;
  dono: Dono;
};

async function donoDe(db: NonNullable<ReturnType<typeof supabaseServer>>, userId: string): Promise<Dono> {
  // Marca da pessoa completada pela da imobiliária (nome "Ana · Lima Imóveis", logo da casa).
  const u = await marcaEfetiva(db, userId);
  return {
    nome: u.nome,
    creci: u.creci,
    whatsapp: u.whatsapp,
    logo: u.logo_path ? await assinar(db, u.logo_path).catch(() => null) : null,
    cor: u.cor_marca,
  };
}

async function carregar(token: string): Promise<Pagina | null> {
  const db = supabaseServer();
  if (!db || !ehToken(token)) return null;

  let userId: string | null = null;
  let titulo = "";
  let subtitulo: string | null = null;
  type Job = { id: string; tipo: string; parametros: Record<string, string> | null; input_path: string | null; output_path: string | null };
  let jobs: Job[] = [];

  // Vídeo compartilhado: um player e a marca do corretor, nada mais.
  const { data: video } = await db
    .from("videos")
    .select("id, user_id, titulo, formato, output_path, thumb_path, duracao_segundos, property_id")
    .eq("share_token", token)
    .eq("status", "concluido")
    .maybeSingle();
  if (video?.output_path) {
    let sub: string | null = null;
    if (video.property_id) {
      const { data: imovel } = await db.from("properties").select("titulo, endereco").eq("id", video.property_id).maybeSingle();
      sub = imovel?.endereco ?? null;
      if (!video.titulo && imovel?.titulo) video.titulo = imovel.titulo;
    }
    return {
      titulo: video.titulo ?? "Vídeo do imóvel",
      subtitulo: sub,
      fotos: [],
      video: {
        url: await assinar(db, video.output_path),
        poster: video.thumb_path ? await assinar(db, video.thumb_path).catch(() => null) : null,
        vertical: video.formato === "9:16" || video.formato === "4:5",
        duracao: video.duracao_segundos,
      },
      dono: await donoDe(db, video.user_id),
    };
  }

  const { data: job } = await db
    .from("jobs")
    .select("id, user_id, tipo, parametros, input_path, output_path, property_id")
    .eq("share_token", token)
    .eq("status", "concluido")
    .maybeSingle();

  if (job) {
    userId = job.user_id;
    jobs = [job];
    titulo = rotuloDoTipo(job.tipo);
    if (job.property_id) {
      const { data: imovel } = await db.from("properties").select("titulo, endereco").eq("id", job.property_id).maybeSingle();
      if (imovel) {
        titulo = imovel.titulo ?? titulo;
        subtitulo = imovel.endereco;
      }
    }
  } else {
    const { data: imovel } = await db.from("properties").select("id, user_id, titulo, endereco").eq("share_token", token).maybeSingle();
    if (!imovel) return null;
    userId = imovel.user_id;
    titulo = imovel.titulo ?? "Imóvel";
    subtitulo = imovel.endereco;
    const { data: lista } = await db
      .from("jobs")
      .select("id, tipo, parametros, input_path, output_path")
      .eq("property_id", imovel.id)
      .eq("status", "concluido")
      .order("criado_em", { ascending: false });
    jobs = (lista ?? []) as Job[];
  }

  const fotos = (
    await Promise.all(
      jobs.map(async (j): Promise<FotoPublica | null> => {
        if (!j.output_path) return null;
        const def = ACOES_POR_ID[j.tipo];
        const depois = await assinar(db, j.output_path).catch(() => null);
        if (!depois) return null;
        return {
          id: j.id,
          antes: j.input_path ? await assinar(db, j.input_path).catch(() => null) : null,
          depois,
          rotulo: rotuloDoTipo(j.tipo),
          detalhe: def ? resumirParametros(def, j.parametros ?? {}) : "",
        };
      })
    )
  ).filter((f): f is FotoPublica => f !== null);

  return { titulo, subtitulo, fotos, video: null, dono: await donoDe(db, userId!) };
}

export async function generateMetadata({ params }: PageProps<"/c/[token]">): Promise<Metadata> {
  const { token } = await params;
  const pagina = await carregar(token);
  return {
    title: pagina ? pagina.titulo : "Link indisponível",
    robots: { index: false, follow: false },
  };
}

function linkWhatsapp(numero: string, titulo: string) {
  const digitos = numero.replace(/\D/g, "");
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(`Olá! Vi as fotos de "${titulo}" e quero saber mais.`)}`;
}

export default async function PaginaCompartilhada({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const pagina = await carregar(token);
  if (!pagina) notFound();

  const { titulo, subtitulo, fotos, video, dono } = pagina;
  const cor = dono.cor && /^#[0-9a-fA-F]{6}$/.test(dono.cor) ? dono.cor : "#0f2d5b";

  return (
    <main className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
          {dono.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dono.logo} alt="" className="h-10 max-w-[140px] object-contain" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white" style={{ background: cor }}>
              {(dono.nome ?? "E").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            {dono.nome && <p className="truncate font-semibold">{dono.nome}</p>}
            {dono.creci && <p className="text-xs text-neutral-500">CRECI {dono.creci}</p>}
          </div>
          {dono.whatsapp && (
            <a
              href={linkWhatsapp(dono.whatsapp, titulo)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm"
              style={{ background: cor }}
            >
              Falar no WhatsApp
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-neutral-600">{subtitulo}</p>}
        {!video && (
          <p className="mt-2 text-sm text-neutral-500">
            {fotos.length === 1 ? "Arraste a divisória para comparar antes e depois." : `${fotos.length} fotos. Arraste a divisória para comparar antes e depois.`}
          </p>
        )}

        <div className="mt-6">
          {video ? (
            <div className={"mx-auto overflow-hidden rounded-2xl border border-neutral-200 bg-black shadow-sm " + (video.vertical ? "max-w-sm" : "")}>
              <video src={video.url} poster={video.poster ?? undefined} controls playsInline preload="metadata" className="block w-full" />
            </div>
          ) : fotos.length ? (
            <GaleriaPublica fotos={fotos} />
          ) : (
            <p className="text-sm text-neutral-500">Nenhuma foto pronta ainda.</p>
          )}
        </div>

        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          As imagens editadas são ilustrativas: mostram possibilidades de decoração e acabamento e não substituem a visita ao imóvel.
        </p>
      </section>

      <footer className="mx-auto flex max-w-4xl items-center justify-between px-4 pb-10 text-xs text-neutral-400 sm:px-6">
        <span>Fotos editadas com inteligência artificial.</span>
        <Link href="/" className="flex items-center gap-1.5 text-neutral-500 hover:text-marca-indigo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca-encena.svg" alt="" width={16} height={16} className="h-4 w-4" />
          Feito com Encena
        </Link>
      </footer>
    </main>
  );
}
