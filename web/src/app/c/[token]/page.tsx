import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { ehToken } from "@/lib/compartilhar";
import { origemPublica } from "@/lib/capa-publica";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";
import { TIPO_POR_ID } from "@/lib/book-tipos";
import { marcaEfetiva } from "@/lib/cobranca";
import GaleriaPublica, { type FotoPublica } from "@/components/galeria-publica";

// Página PÚBLICA de uma foto ou de um imóvel compartilhado. Quem chega aqui é o cliente
// do corretor, pelo WhatsApp, no celular. Renderizada no servidor a cada visita: lê com
// service role, assina as imagens por 1h e não guarda nada -- revogar o token no app
// corta o acesso na próxima visita. Sem índice de busca (robots noindex).

export const dynamic = "force-dynamic";

type Dono = { nome: string | null; creci: string | null; whatsapp: string | null; logo: string | null; cor: string | null };

type VideoPublico = { url: string; poster: string | null; vertical: boolean; duracao: number | null; titulo: string | null };

/** Book ou catálogo do mesmo imóvel, que vira um cartão no fim da página. */
type MaterialPublico = { titulo: string; url: string };

type Pagina = {
  titulo: string;
  subtitulo: string | null;
  fotos: FotoPublica[];
  videos: VideoPublico[];
  materiais: MaterialPublico[];
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
  // Só o link do IMÓVEL junta tudo: foto solta continua sendo foto solta.
  let videos: VideoPublico[] = [];
  let materiais: MaterialPublico[] = [];

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
      videos: [
        {
          url: await assinar(db, video.output_path),
          poster: video.thumb_path ? await assinar(db, video.thumb_path).catch(() => null) : null,
          vertical: video.formato === "9:16" || video.formato === "4:5",
          duracao: video.duracao_segundos,
          titulo: null,
        },
      ],
      materiais: [],
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

    // UM LINK COM TUDO. Antes, fotos, vídeo e book eram três endereços soltos na mesma
    // mensagem: parece spam, multiplica a chance de bloqueio e só o primeiro ganha prévia.
    // O link do imóvel agora carrega os três -- uma mensagem, um cartão, uma página.
    const [{ data: vids }, { data: books }] = await Promise.all([
      db.from("videos").select("titulo, formato, output_path, thumb_path, duracao_segundos").eq("property_id", imovel.id).eq("status", "concluido").order("criado_em", { ascending: false }).limit(4),
      db.from("books").select("titulo, tipo, share_token").eq("property_id", imovel.id).order("atualizado_em", { ascending: false }).limit(6),
    ]);
    videos = (
      await Promise.all(
        (vids ?? []).map(async (v) => {
          const url = v.output_path ? await assinar(db, v.output_path).catch(() => null) : null;
          if (!url) return null;
          return {
            url,
            poster: v.thumb_path ? await assinar(db, v.thumb_path).catch(() => null) : null,
            vertical: v.formato === "9:16" || v.formato === "4:5",
            duracao: v.duracao_segundos,
            titulo: v.titulo ?? null,
          };
        })
      )
    ).filter((v): v is VideoPublico => v !== null);
    // Só entra book que JÁ tem link público: esta página só lê, e ligar um link aqui seria
    // publicar material por conta própria, sem a pessoa ter escolhido.
    materiais = (books ?? [])
      .filter((b) => ehToken(b.share_token))
      .map((b) => ({ titulo: b.titulo || TIPO_POR_ID[b.tipo as string]?.rotulo || "Material do imóvel", url: `/b/${b.share_token}` }));
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

  return { titulo, subtitulo, fotos, videos, materiais, dono: await donoDe(db, userId!) };
}

export async function generateMetadata({ params }: PageProps<"/c/[token]">): Promise<Metadata> {
  const { token } = await params;
  const pagina = await carregar(token);
  if (!pagina) return { title: "Link indisponível", robots: { index: false, follow: false } };

  // A PRÉVIA DO LINK. Sem isto o material chegava no WhatsApp como URL pelada -- quem recebe
  // não sabe se é o imóvel, um vídeo ou spam, e o corretor parecia estar mandando link
  // suspeito. Com título, descrição e capa, o link vira um cartão com a foto: é o mais perto
  // de "anexo" que dá pra chegar sem a API oficial do WhatsApp.
  //
  // `noindex` continua: prévia de link não é indexação. O robô que monta o cartão busca a
  // página de qualquer jeito; o que o noindex impede é o link cair na busca do Google.
  const descricao = [pagina.subtitulo, pagina.dono.nome ? `Com ${pagina.dono.nome}` : null].filter(Boolean).join(" · ") || "Fotos do imóvel";
  const capa = `${await origemPublica()}/c/${token}/capa`;
  return {
    title: pagina.titulo,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: pagina.titulo,
      description: descricao,
      images: [{ url: capa, alt: pagina.titulo }],
      siteName: "Encena",
    },
    twitter: { card: "summary_large_image", title: pagina.titulo, description: descricao, images: [capa] },
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

  const { titulo, subtitulo, fotos, videos, materiais, dono } = pagina;
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
        {fotos.length > 0 && (
          <p className="mt-2 text-sm text-neutral-500">
            {[
              fotos.length === 1 ? "1 foto" : `${fotos.length} fotos`,
              videos.length ? (videos.length === 1 ? "1 vídeo" : `${videos.length} vídeos`) : "",
              materiais.length ? (materiais.length === 1 ? "1 material" : `${materiais.length} materiais`) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            . Arraste a divisória para comparar antes e depois.
          </p>
        )}

        <div className="mt-6 grid gap-8">
          {fotos.length > 0 && <GaleriaPublica fotos={fotos} />}

          {videos.map((v, k) => (
            <div key={k}>
              {v.titulo && <h2 className="mb-2 font-semibold">{v.titulo}</h2>}
              <div className={"mx-auto overflow-hidden rounded-2xl border border-neutral-200 bg-black shadow-sm " + (v.vertical ? "max-w-sm" : "")}>
                <video src={v.url} poster={v.poster ?? undefined} controls playsInline preload="metadata" className="block w-full" />
              </div>
            </div>
          ))}

          {/* Os books do mesmo imóvel, como cartão -- pra a mensagem no WhatsApp continuar
              tendo UM link só, e não um por material. */}
          {materiais.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Material do imóvel</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {materiais.map((m) => (
                  <li key={m.url}>
                    <a
                      href={m.url}
                      className="flex min-h-14 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: cor, color: "#fff" }}>
                        ↗
                      </span>
                      <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fotos.length === 0 && videos.length === 0 && materiais.length === 0 && <p className="text-sm text-neutral-500">Nenhuma foto pronta ainda.</p>}
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
