"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Cartao, Icone, Rotulo } from "@/components/ui";

// O EDITOR ENCENA: a porta da área de edição.
//
// Dois contextos, e eles não se misturam: vídeo é TEMPO (cenas em fila, emendas, som) e
// material é PÁGINA (blocos, texto, imagem, PDF). Cada um tem a sua tela porque as duas
// coisas se editam com gestos diferentes -- um editor que tentasse servir aos dois
// serviria mal aos dois.
//
// O que eles dividem não é a tela, é a BASE: a mesma marca, a mesma ficha do imóvel, a
// mesma galeria de mídia e a mesma IA de texto. Trocar a cor da marca muda o vídeo e o
// book juntos, e ninguém digita o preço duas vezes.
//
// Esta página não é uma lista a mais: ela abre no que a pessoa estava editando. Quem
// volta ao produto quase nunca quer começar do zero -- quer terminar o que parou.

type VideoResumo = { id: string; titulo: string; formato: string; status: string; criadoEm: string; duracao: number | null; miniatura: string | null };
type BookResumo = { id: string; titulo: string | null; rotuloTipo?: string; paginas?: number; atualizadoEm?: string; criadoEm?: string; capa?: string | null };

function quando(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function Editor() {
  const c = useConta();
  const { user, token } = c;
  const [videos, setVideos] = useState<VideoResumo[] | null>(null);
  const [books, setBooks] = useState<BookResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const t = await token();
    const cab = { Authorization: `Bearer ${t}` };
    const [v, b] = await Promise.all([
      fetch("/api/video", { headers: cab }).then((r) => r.json()),
      fetch("/api/books", { headers: cab }).then((r) => r.json()),
    ]);
    return { videos: (v.videos ?? []) as VideoResumo[], books: (b.books ?? b.materiais ?? []) as BookResumo[] };
  }, [token]);

  useEffect(() => {
    if (!user) return;
    carregar()
      .then((d) => {
        setVideos(d.videos);
        setBooks(d.books);
      })
      .catch(() => setErro("Não consegui carregar o que você estava editando."));
  }, [user, carregar]);

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para usar o editor.</Link>
      </main>
    );
  }

  const prontos = (videos ?? []).filter((v) => v.status === "concluido");
  const vazio = videos !== null && books !== null && prontos.length === 0 && books.length === 0;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <h1 className="text-2xl font-semibold">Editor</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Onde o conteúdo do imóvel vira peça pronta. Sua marca, a ficha do imóvel e a sua galeria já estão aqui dentro — nada se digita duas vezes.
      </p>

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {/* ---------- os dois contextos ---------- */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Link
          href="/editor/video"
          className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-marca-coral hover:shadow-md"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca-coral/10 text-marca-coral">
            <Icone nome="video" className="h-6 w-6" />
          </span>
          <strong className="mt-3 text-lg">Vídeo</strong>
          <span className="mt-1 text-sm text-neutral-600">
            Reels, Stories e anúncios. As fotos viram cenas numa linha do tempo, com movimento, emenda, música e a sua voz.
          </span>
          <span className="mt-3 text-xs text-neutral-400">montar e editar não gasta crédito</span>
        </Link>

        <Link
          href="/materiais"
          className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-marca-indigo hover:shadow-md"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca-indigo/10 text-marca-indigo">
            <Icone nome="planta" className="h-6 w-6" />
          </span>
          <strong className="mt-3 text-lg">Material</strong>
          <span className="mt-1 text-sm text-neutral-600">
            Book, PDF de WhatsApp, catálogo e apresentação. Páginas montadas sozinhas, com os dados do imóvel e a sua marca.
          </span>
          <span className="mt-3 text-xs text-neutral-400">não gasta crédito</span>
        </Link>
      </div>

      {/* ---------- continuar ---------- */}
      <div className="mt-8">
        <Rotulo>Continuar editando</Rotulo>
        {videos === null || books === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : vazio ? (
          <Cartao>
            <p className="font-medium">Nada em edição ainda.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Comece por um <Link href="/editor/video" className="text-marca-indigo underline">vídeo</Link> ou por um{" "}
              <Link href="/materiais" className="text-marca-indigo underline">material</Link>. As duas coisas saem das fotos que já estão na sua{" "}
              <Link href="/galeria" className="text-marca-indigo underline">galeria</Link>.
            </p>
          </Cartao>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {prontos.slice(0, 8).map((v) => (
              <li key={v.id}>
                <Link href={`/editor/video?editar=${v.id}`} className="block overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-marca-coral">
                  <div className="relative aspect-[4/3] bg-neutral-100">
                    {v.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <Icone nome="video" className="h-7 w-7" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-marca-coral px-2 py-0.5 text-[10px] font-semibold text-white">vídeo</span>
                    {v.duracao ? <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 text-[10px] tabular-nums text-white">{Math.round(v.duracao)}s</span> : null}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{v.titulo}</p>
                    <p className="text-[10px] text-neutral-400">{v.formato} · {quando(v.criadoEm)}</p>
                  </div>
                </Link>
              </li>
            ))}
            {books.slice(0, 8).map((b) => (
              <li key={b.id}>
                <Link href={`/editor/material/${b.id}`} className="block overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-marca-indigo">
                  <div className="relative aspect-[4/3] bg-neutral-100">
                    {b.capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.capa} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <Icone nome="planta" className="h-7 w-7" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-marca-indigo px-2 py-0.5 text-[10px] font-semibold text-white">material</span>
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{b.titulo ?? "Material"}</p>
                    <p className="text-[10px] text-neutral-400">
                      {b.rotuloTipo ?? "Book"}
                      {b.paginas ? ` · ${b.paginas} páginas` : ""} · {quando(b.atualizadoEm ?? b.criadoEm)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <Rotulo>O que o editor usa sozinho</Rotulo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Cartao className="p-4">
            <strong className="text-sm">Sua marca</strong>
            <p className="mt-1 text-xs text-neutral-600">
              Logo, cor, nome, CRECI e WhatsApp entram no vídeo e no material sem você pedir.{" "}
              <Link href="/marca" className="text-marca-indigo underline">Minha marca</Link>
            </p>
          </Cartao>
          <Cartao className="p-4">
            <strong className="text-sm">A ficha do imóvel</strong>
            <p className="mt-1 text-xs text-neutral-600">
              Preço, metragem, quartos e vagas vêm do cadastro. Mudar aqui não mexe no imóvel.{" "}
              <Link href="/imoveis" className="text-marca-indigo underline">Imóveis</Link>
            </p>
          </Cartao>
          <Cartao className="p-4">
            <strong className="text-sm">Sua galeria</strong>
            <p className="mt-1 text-xs text-neutral-600">
              Fotos, plantas, terrenos e vídeos que você já produziu, prontos pra entrar.{" "}
              <Link href="/galeria" className="text-marca-indigo underline">Galeria</Link>
            </p>
          </Cartao>
        </div>
      </div>
    </AppShell>
  );
}
