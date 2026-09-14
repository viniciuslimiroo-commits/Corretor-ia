import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { ehToken } from "@/lib/compartilhar";
import { marcaEfetiva } from "@/lib/cobranca";
import { limparDocumento, imagensDoDocumento } from "@/lib/book-documento";
import { fichaDoImovel, type ImovelMontagem } from "@/lib/book-montagem";

// O book como PÁGINA WEB. Quem chega aqui é o cliente do corretor, pelo WhatsApp, no
// celular -- e é esta página, não o PDF, que transforma o book em canal: ela conta quantas
// vezes foi aberta.
//
// NÃO renderiza as páginas do PDF em miniatura. Um A4 espremido em 375px deixa o texto de
// 11pt com 7px, ilegível. O que sai aqui é o MESMO conteúdo remontado pro celular: foto
// grande, preço, descrição, fotos numa coluna, ficha em lista e o botão de WhatsApp fixo.
//
// Renderizada no servidor a cada visita: lê com service role, assina as imagens por 1h e
// não guarda nada. Desligar o link no editor corta o acesso na visita seguinte.

export const dynamic = "force-dynamic";

type Foto = { url: string; legenda: string };

type Conteudo = {
  titulo: string;
  subtitulo: string | null;
  preco: string | null;
  descricao: string | null;
  capa: string | null;
  fotos: Foto[];
  destaques: { titulo: string; itens: string[] }[];
  /** Catálogo: um cartão por imóvel, em vez do passeio de fotos. */
  imoveis: { titulo: string; endereco: string; preco: string; ficha: string; url: string | null }[];
  local: { titulo: string; endereco: string; nota: string; mapa: string | null } | null;
  ficha: { rotulo: string; valor: string }[];
  dono: { nome: string | null; creci: string | null; whatsapp: string | null; logo: string | null; cor: string | null };
};

function corSegura(hex: string | null): string {
  return hex && /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#0f2d5b";
}

async function carregar(token: string): Promise<Conteudo | null> {
  const db = supabaseServer();
  if (!db || !ehToken(token)) return null;

  const { data: book } = await db.from("books").select("*").eq("share_token", token).maybeSingle();
  if (!book) return null;

  const documento = limparDocumento(book.documento);
  if (!documento) return null;

  // Conta a abertura. Falhar aqui não pode derrubar a página do cliente: é métrica, não
  // conteúdo.
  await db
    .from("books")
    .update({ aberturas: Number(book.aberturas ?? 0) + 1 })
    .eq("id", book.id)
    .then(undefined, () => {});

  let imovel: ImovelMontagem | null = null;
  if (book.property_id) {
    const { data } = await db.from("properties").select("*").eq("id", book.property_id).maybeSingle();
    if (data) {
      const p = data as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || null);
      imovel = {
        id: String(p.id),
        titulo: texto(p.titulo) ?? "Imóvel",
        endereco: texto(p.endereco),
        preco: texto(p.preco),
        descricao: texto(p.descricao),
        area_total: numero(p.area_total),
        area_util: numero(p.area_util),
        dormitorios: numero(p.dormitorios),
        suites: numero(p.suites),
        banheiros: numero(p.banheiros),
        vagas: numero(p.vagas),
        ano_construcao: numero(p.ano_construcao),
        condominio: texto(p.condominio),
        iptu: texto(p.iptu),
        capa_job_id: texto(p.capa_job_id),
      };
    }
  }

  const ids = imagensDoDocumento(documento);
  const urls: Record<string, string> = {};
  if (ids.length) {
    const { data: jobs } = await db.from("jobs").select("id, output_path").eq("user_id", book.user_id).in("id", ids);
    await Promise.all(
      ((jobs ?? []) as { id: string; output_path: string | null }[]).map(async (j) => {
        if (!j.output_path) return;
        const url = await assinar(db, j.output_path).catch(() => null);
        if (url) urls[j.id] = url;
      })
    );
  }

  const capaPagina = documento.paginas.find((p) => p.tipo === "capa");
  const capaJob = capaPagina?.imagens[0];

  const pagDestaques = documento.paginas.find((p) => p.tipo === "destaques");
  const emLista = (chave: string) =>
    (pagDestaques?.textos[chave] ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const grupos = [
    { titulo: pagDestaques?.textos.titulo || "O imóvel", itens: emLista("corpo") },
    { titulo: pagDestaques?.textos.titulo2 || "O que tem a mais", itens: emLista("corpo2") },
  ].filter((g) => g.itens.length > 0);

  const pagLocal = documento.paginas.find((p) => p.tipo === "localizacao");
  const jobDoMapa = pagLocal?.imagens[0];

  const imoveis = documento.paginas
    .filter((p) => p.tipo === "imovel")
    .map((p) => ({
      titulo: p.textos.titulo ?? "",
      endereco: p.textos.endereco ?? "",
      preco: p.textos.preco ?? "",
      ficha: p.textos.ficha ?? "",
      url: p.imagens[0] ? (urls[p.imagens[0]] ?? null) : null,
    }))
    .filter((i) => i.titulo);

  const fotos: Foto[] = [];
  for (const p of documento.paginas) {
    if (p.tipo !== "foto" && p.tipo !== "planta") continue;
    p.imagens.forEach((jobId, i) => {
      const url = urls[jobId];
      if (!url || jobId === capaJob) return;
      fotos.push({ url, legenda: (i === 0 ? p.textos.legenda : p.textos.legenda2) ?? "" });
    });
  }

  const marca = await marcaEfetiva(db, book.user_id);

  return {
    titulo: capaPagina?.textos.titulo || (book.titulo as string | null) || imovel?.titulo || "Imóvel",
    subtitulo: capaPagina?.textos.subtitulo || imovel?.endereco || null,
    preco: capaPagina?.textos.preco || imovel?.preco || null,
    descricao: capaPagina?.textos.descricao || imovel?.descricao || null,
    capa: capaJob ? (urls[capaJob] ?? null) : null,
    fotos,
    destaques: grupos,
    imoveis,
    local: pagLocal?.textos.endereco
      ? {
          titulo: pagLocal.textos.titulo || "Localização",
          endereco: pagLocal.textos.endereco,
          nota: pagLocal.textos.corpo ?? "",
          mapa: jobDoMapa ? (urls[jobDoMapa] ?? null) : null,
        }
      : null,
    ficha: imovel ? fichaDoImovel(imovel) : [],
    dono: {
      nome: marca.nome,
      creci: marca.creci,
      whatsapp: marca.whatsapp,
      logo: marca.logo_path ? await assinar(db, marca.logo_path).catch(() => null) : null,
      cor: marca.cor_marca,
    },
  };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const c = await carregar(token);
  return {
    title: c ? `${c.titulo} · Encena` : "Material do imóvel",
    description: c?.descricao ?? undefined,
    // Link privado: quem tem vê, quem não tem não acha. Fora dos buscadores.
    robots: { index: false, follow: false },
  };
}

export default async function BookPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await carregar(token);
  if (!c) notFound();

  const cor = corSegura(c.dono.cor);
  const zap = c.dono.whatsapp?.replace(/\D/g, "");
  const mensagem = encodeURIComponent(`Olá! Vi o material de ${c.titulo} e queria saber mais.`);

  return (
    <main className="min-h-screen bg-neutral-50 pb-24 font-sans text-neutral-900">
      {/* capa */}
      <header className="relative">
        {c.capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.capa} alt="" className="h-[58vh] max-h-[520px] w-full object-cover sm:h-[60vh]" />
        ) : (
          <div className="h-40 w-full" style={{ background: cor }} />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pt-16 pb-5 text-white">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.titulo}</h1>
            {c.subtitulo && <p className="mt-1 text-sm text-white/85">{c.subtitulo}</p>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5">
        {(c.preco || c.descricao) && (
          <section className="border-b border-neutral-200 py-6">
            {c.preco && (
              <p className="text-3xl font-bold tracking-tight" style={{ color: cor }}>
                {c.preco}
              </p>
            )}
            {c.descricao && <p className="mt-3 text-[15px] leading-relaxed text-neutral-700">{c.descricao}</p>}
          </section>
        )}

        {c.imoveis.length > 0 && (
          <section className="border-b border-neutral-200 py-6">
            <ul className="flex flex-col gap-6">
              {c.imoveis.map((i) => (
                <li key={i.titulo + i.endereco}>
                  {i.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                  )}
                  <p className="mt-2.5 text-lg font-semibold">{i.titulo}</p>
                  {i.endereco && <p className="text-sm text-neutral-500">{i.endereco}</p>}
                  {i.preco && (
                    <p className="mt-1.5 text-xl font-bold" style={{ color: cor }}>
                      {i.preco}
                    </p>
                  )}
                  {i.ficha && <p className="mt-0.5 text-sm text-neutral-600">{i.ficha}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.destaques.length > 0 && (
          <section className="flex flex-col gap-5 border-b border-neutral-200 py-6">
            {c.destaques.map((g) => (
              <div key={g.titulo}>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.titulo}</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {g.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-neutral-700">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-[1px]" style={{ background: cor }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {c.local && (
          <section className="border-b border-neutral-200 py-6">
            <h2 className="text-lg font-semibold">{c.local.titulo}</h2>
            <p className="mt-2 text-[17px] font-semibold" style={{ color: cor }}>
              {c.local.endereco}
            </p>
            {c.local.nota && <p className="mt-1.5 text-sm text-neutral-600">{c.local.nota}</p>}
            {c.local.mapa && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.local.mapa} alt="Mapa" className="mt-4 w-full rounded-xl object-contain" loading="lazy" />
            )}
          </section>
        )}

        {c.ficha.length > 0 && (
          <section className="border-b border-neutral-200 py-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              {c.ficha.map((f) => (
                <div key={f.rotulo}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{f.rotulo}</dt>
                  <dd className="mt-0.5 text-lg font-semibold" style={{ color: cor }}>
                    {f.valor}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {c.fotos.length > 0 && (
          <section className="py-6">
            <ul className="flex flex-col gap-5">
              {c.fotos.map((f, i) => (
                <li key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.legenda} className="w-full rounded-xl object-cover" loading={i < 2 ? "eager" : "lazy"} />
                  {f.legenda && <p className="mt-1.5 text-sm text-neutral-500">{f.legenda}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="border-t border-neutral-200 py-8">
          <div className="flex items-center gap-4">
            {c.dono.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.dono.logo} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-neutral-200" />
            )}
            <div className="min-w-0">
              {c.dono.nome && <p className="font-semibold">{c.dono.nome}</p>}
              {c.dono.creci && <p className="text-sm text-neutral-500">CRECI {c.dono.creci}</p>}
            </div>
          </div>
        </section>

        <p className="pb-6 text-xs text-neutral-400">
          Imagens ilustrativas · algumas editadas digitalmente. Feito com Encena IA.
        </p>
      </div>

      {/* O botão que fecha: fixo no rodapé, do jeito que se usa no celular. */}
      {zap && (
        <a
          href={`https://wa.me/55${zap}?text=${mensagem}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 px-5 py-3 text-center text-base font-semibold text-white shadow-lg"
          style={{ background: cor }}
        >
          Falar {c.dono.nome ? `com ${c.dono.nome.split(" ")[0]}` : "no WhatsApp"}
        </a>
      )}
    </main>
  );
}
