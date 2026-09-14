"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import { useBook } from "@/lib/use-book";
import { Aviso, Botao, Icone } from "@/components/ui";
import Pagina, { type DadosPagina } from "@/components/book/pagina";
import PainelPagina from "@/components/book/painel-pagina";
import type { ContextoLayout } from "@/lib/book-layout";
import { definirCapa, mover, podeRemover, remover, type DocumentoBook } from "@/lib/book-documento";

// O editor do book. Três faixas: páginas à esquerda, a página no meio, o que dá pra mexer
// nela à direita -- e nada mais.
//
// Roda fora do AppShell de propósito: editor é tela cheia.
//
// Nesta etapa dá pra reordenar, tirar página, trocar textos e escolher a capa. Trocar foto
// e exportar chegam no passo seguinte, e a tela diz isso em vez de deixar procurar botão.

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

type Carga = {
  book: Book;
  documento: DocumentoBook;
  urls: Record<string, string>;
  logo: string | null;
  ctx: ContextoLayout;
  qrs: Record<string, string>;
};

const LARGURA_PAGINA = 520;

const RECADO: Record<string, string> = {
  salvo: "Salvo",
  salvando: "Salvando…",
  pendente: "Salvando…",
  falhou: "Não consegui salvar",
  conflito: "Alterado em outro lugar",
};

export default function PaginaBook() {
  const c = useConta();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [carga, setCarga] = useState<Carga | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [atual, setAtual] = useState(0);
  const [apagando, setApagando] = useState(false);
  const centro = useRef<HTMLDivElement | null>(null);
  const { user, token } = c;

  const buscar = useCallback(async () => {
    const r = await fetch(`/api/books/${id}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d as Carga;
  }, [id, token]);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then(setCarga)
      .catch((e: Error) => setErroCarga(e.message));
  }, [user, buscar]);

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para abrir este book.</Link>
      </main>
    );
  }
  if (erroCarga) {
    return (
      <main className="mx-auto max-w-xl p-12">
        <Aviso tipo="erro">{erroCarga}</Aviso>
        <p className="mt-4 text-sm">
          <Link href="/books" className="text-marca-indigo underline">Voltar para os books</Link>
        </p>
      </main>
    );
  }
  if (!carga) return <main className="p-12 text-sm text-neutral-500">Abrindo o book…</main>;

  return (
    <Editor
      carga={carga}
      token={token}
      atual={atual}
      setAtual={setAtual}
      centro={centro}
      apagando={apagando}
      setApagando={setApagando}
      aoSair={() => router.push("/books")}
    />
  );
}

// Componente separado porque o hook do book precisa dos dados carregados -- e hook não
// pode ficar atrás de `if`.
function Editor({
  carga,
  token,
  atual,
  setAtual,
  centro,
  apagando,
  setApagando,
  aoSair,
}: {
  carga: Carga;
  token: () => Promise<string>;
  atual: number;
  setAtual: (n: number) => void;
  centro: React.RefObject<HTMLDivElement | null>;
  apagando: boolean;
  setApagando: (v: boolean) => void;
  aoSair: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const book = useBook({
    id: carga.book.id,
    inicial: carga.documento,
    ctx: carga.ctx,
    qrs: carga.qrs,
    versaoInicial: carga.book.versao,
    token,
  });

  const paginaAtual = book.documento.paginas[Math.min(atual, book.documento.paginas.length - 1)];

  const irPara = useCallback(
    (i: number) => {
      const destino = Math.max(0, Math.min(book.documento.paginas.length - 1, i));
      setAtual(destino);
      centro.current?.querySelector(`[data-pagina="${destino}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [book.documento.paginas.length, setAtual, centro]
  );

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        book.desfazer();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") irPara(atual + 1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") irPara(atual - 1);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, irPara, book]);

  async function apagar() {
    if (!window.confirm("Apagar este book? As fotos continuam em Materiais — some só a montagem.")) return;
    setApagando(true);
    try {
      const r = await fetch(`/api/books/${carga.book.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
      if (!r.ok) throw new Error((await r.json()).error);
      aoSair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao apagar.");
      setApagando(false);
    }
  }

  const dados = (i: number): DadosPagina => ({ layout: book.layout[i], urls: carga.urls, logo: carga.logo });

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <Link href="/books" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-marca-indigo">
          <Icone nome="cima" className="h-4 w-4 -rotate-90" />
          Books
        </Link>
        <span className="min-w-0 truncate text-sm font-semibold">{carga.book.titulo ?? "Book"}</span>
        <span className="hidden text-xs text-neutral-400 sm:inline">{carga.book.rotuloTipo} · {book.documento.paginas.length} páginas</span>
        <span
          className={
            "text-xs " +
            (book.estado === "falhou" || book.estado === "conflito" ? "font-medium text-amber-600" : "text-neutral-400")
          }
        >
          · {RECADO[book.estado]}
          {book.estado === "falhou" && (
            <button onClick={book.salvarAgora} className="ml-1 underline">tentar agora</button>
          )}
          {book.estado === "conflito" && (
            <button onClick={() => window.location.reload()} className="ml-1 underline">recarregar</button>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Botao variante="discreta" onClick={book.desfazer} disabled={!book.podeDesfazer} title="Ctrl+Z">
            <Icone nome="cima" className="h-4 w-4 -rotate-90" />
            Desfazer
          </Botao>
          <span className="hidden text-xs text-neutral-400 lg:inline">Não gasta crédito</span>
          <Botao variante="perigo" onClick={apagar} disabled={apagando} className="px-2 py-1 text-xs">
            <Icone nome="lixeira" className="h-4 w-4" />
            Apagar
          </Botao>
        </div>
      </header>

      {(erro || book.erro) && (
        <div className="px-4 pt-3">
          <Aviso tipo="erro">{erro ?? book.erro}</Aviso>
        </div>
      )}

      {carga.book.faltaRegistro && (
        <div className="px-4 pt-3">
          <Aviso tipo="atencao">
            Falta o registro de incorporação. A lei exige o número, a matrícula e o cartório em qualquer peça de divulgação de imóvel vendido antes da
            conclusão — sem ele este book não vai poder ser exportado.
          </Aviso>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* faixa de páginas */}
        <nav className="w-[112px] shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-2">
          <ul className="flex flex-col gap-2">
            {book.documento.paginas.map((p, i) => (
              <li key={p.id} className="group relative">
                <button
                  onClick={() => irPara(i)}
                  className={
                    "block w-full overflow-hidden rounded border-2 bg-white transition " +
                    (i === atual ? "border-marca-coral" : "border-neutral-200 hover:border-neutral-400")
                  }
                  title={`Página ${i + 1}`}
                >
                  {book.layout[i] && <Pagina dados={dados(i)} largura={92} />}
                </button>
                <span className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-neutral-400">
                  <button
                    onClick={() => {
                      book.aplicar((d) => mover(d, p.id, i - 1));
                      irPara(i - 1);
                    }}
                    disabled={i === 0}
                    className="rounded px-1 hover:bg-neutral-100 disabled:opacity-30"
                    title="Subir"
                  >
                    ↑
                  </button>
                  {i === 0 ? "capa" : i + 1}
                  <button
                    onClick={() => {
                      book.aplicar((d) => mover(d, p.id, i + 1));
                      irPara(i + 1);
                    }}
                    disabled={i === book.documento.paginas.length - 1}
                    className="rounded px-1 hover:bg-neutral-100 disabled:opacity-30"
                    title="Descer"
                  >
                    ↓
                  </button>
                </span>
                {podeRemover(p) && (
                  <button
                    onClick={() => book.aplicar((d) => remover(d, p.id))}
                    className="absolute top-1 right-1 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    title="Tirar do book — a foto continua em Materiais"
                  >
                    <Icone nome="fechar" className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* as páginas */}
        <div ref={centro} className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {book.documento.paginas.map((p, i) =>
              book.layout[i] ? (
                <div
                  key={p.id}
                  data-pagina={i}
                  onClick={() => setAtual(i)}
                  className={"cursor-pointer shadow-lg ring-1 transition " + (i === atual ? "ring-2 ring-marca-coral" : "ring-black/5")}
                >
                  <Pagina dados={dados(i)} largura={LARGURA_PAGINA} />
                </div>
              ) : null
            )}
            <p className="max-w-[520px] pb-10 text-center text-xs text-neutral-500">
              Trocar foto, escolher o enquadramento e exportar em PDF chegam no próximo passo. Por enquanto dá pra reordenar, tirar página, trocar os textos e
              escolher a capa — e tudo isso já fica salvo.
            </p>
          </div>
        </div>

        {/* painel da página */}
        <aside className="w-[236px] shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-3">
          {paginaAtual && (
            <PainelPagina
              pagina={paginaAtual}
              numero={Math.min(atual, book.documento.paginas.length - 1) + 1}
              documento={book.documento}
              urls={carga.urls}
              aoMudar={book.aplicar}
              aoEscolherCapa={(jobId) => book.aplicar((d) => definirCapa(d, jobId))}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
