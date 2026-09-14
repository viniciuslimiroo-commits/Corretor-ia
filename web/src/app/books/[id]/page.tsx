"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import { Aviso, Botao, Icone } from "@/components/ui";
import Pagina, { type DadosPagina } from "@/components/book/pagina";
import type { PaginaLayout } from "@/lib/book-layout";
import type { DocumentoBook } from "@/lib/book-documento";

// O book aberto. Nesta versão ele FOLHEIA -- ainda não edita, e a tela diz isso.
//
// Folhear antes de editar é decisão de projeto, não falta de tempo: é aqui que se
// descobre se a montagem automática presta. Se prestar, boa parte do editor perde
// urgência; se não prestar, descobre-se antes de construir sete componentes em cima dela.
//
// Roda fora do AppShell de propósito: o editor é tela cheia, como todo editor.

type Book = {
  id: string;
  tipo: string;
  rotuloTipo: string;
  titulo: string | null;
  versao: number;
  imovel: { id: string | null; titulo: string } | null;
  compartilhado: boolean;
  atualizadoEm: string;
  faltaRegistro: boolean;
};

const LARGURA_PAGINA = 560;

export default function PaginaBook() {
  const c = useConta();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [documento, setDocumento] = useState<DocumentoBook | null>(null);
  const [layout, setLayout] = useState<PaginaLayout[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [atual, setAtual] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const centro = useRef<HTMLDivElement | null>(null);
  const { user, token } = c;

  const buscar = useCallback(async () => {
    const r = await fetch(`/api/books/${id}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d as { book: Book; documento: DocumentoBook; layout: PaginaLayout[]; urls: Record<string, string>; logo: string | null };
  }, [id, token]);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then((d) => {
        setBook(d.book);
        setDocumento(d.documento);
        setLayout(d.layout);
        setUrls(d.urls);
        setLogo(d.logo);
      })
      .catch((e: Error) => setErro(e.message));
  }, [user, buscar]);

  const irPara = useCallback(
    (i: number) => {
      const destino = Math.max(0, Math.min(layout.length - 1, i));
      setAtual(destino);
      centro.current?.querySelector(`[data-pagina="${destino}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [layout.length]
  );

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") irPara(atual + 1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") irPara(atual - 1);
      if (e.key === "Escape") router.push("/books");
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, irPara, router]);

  async function apagar() {
    if (!window.confirm("Apagar este book? As fotos continuam em Materiais — some só a montagem.")) return;
    setApagando(true);
    try {
      const r = await fetch(`/api/books/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
      if (!r.ok) throw new Error((await r.json()).error);
      router.push("/books");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao apagar.");
      setApagando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para abrir este book.</Link>
      </main>
    );
  }

  const dados = (i: number): DadosPagina => ({ layout: layout[i], urls, logo });

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      {/* barra de cima */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <Link href="/books" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-marca-indigo">
          <Icone nome="cima" className="h-4 w-4 -rotate-90" />
          Books
        </Link>
        <span className="min-w-0 truncate text-sm font-semibold">{book?.titulo ?? "…"}</span>
        {book && <span className="hidden text-xs text-neutral-400 sm:inline">{book.rotuloTipo} · {layout.length} páginas</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-neutral-400 md:inline">Este book não gasta crédito</span>
          <Botao variante="perigo" onClick={apagar} disabled={apagando} className="px-2 py-1 text-xs">
            <Icone nome="lixeira" className="h-4 w-4" />
            Apagar
          </Botao>
        </div>
      </header>

      {erro && (
        <div className="p-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {book?.faltaRegistro && (
        <div className="px-4 pt-3">
          <Aviso tipo="atencao">
            Falta o registro de incorporação deste empreendimento. A lei exige o número, a matrícula e o cartório em qualquer peça de divulgação de imóvel
            vendido antes da conclusão — sem ele, este book não vai poder ser exportado.
          </Aviso>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* faixa de páginas */}
        <nav className="w-[104px] shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-2">
          <ul className="flex flex-col gap-2">
            {layout.map((l, i) => (
              <li key={l.id}>
                <button
                  onClick={() => irPara(i)}
                  className={
                    "block w-full overflow-hidden rounded border-2 bg-white transition " +
                    (i === atual ? "border-marca-coral" : "border-neutral-200 hover:border-neutral-400")
                  }
                  title={`Página ${i + 1}`}
                >
                  <Pagina dados={dados(i)} largura={84} />
                </button>
                <span className="mt-0.5 block text-center text-[10px] text-neutral-400">{i === 0 ? "capa" : i + 1}</span>
              </li>
            ))}
          </ul>
        </nav>

        {/* as páginas */}
        <div ref={centro} className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {layout.map((l, i) => (
              <div key={l.id} data-pagina={i} className="shadow-lg ring-1 ring-black/5">
                <Pagina dados={dados(i)} largura={LARGURA_PAGINA} />
              </div>
            ))}
            {documento && (
              <p className="max-w-[560px] pb-10 text-center text-xs text-neutral-500">
                Este book foi montado sozinho a partir das imagens do imóvel: a capa foi escolhida, as fotos entraram na ordem da visita e a ficha veio dos
                dados do imóvel. <strong>Editar e exportar chegam no próximo passo</strong> — por enquanto ele serve pra você conferir se a montagem está boa.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
