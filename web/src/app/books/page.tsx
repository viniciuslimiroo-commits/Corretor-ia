"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";
import { TIPOS, paginasEstimadas, tipoSugerido, type TipoBook } from "@/lib/book-tipos";

// Meus books: a lista do que já foi montado, e a porta para montar outro.
//
// Criar tem três escolhas, nessa ordem: o imóvel, as imagens e o tipo. As duas últimas já
// vêm respondidas -- todas as imagens marcadas, e o tipo sugerido pelo que existe --, de
// forma que o caminho principal continua sendo clicar em "Montar" e pronto.
//
// As imagens vêm de /api/materiais, a mesma Biblioteca. Nenhuma listagem nova.

type Book = {
  id: string;
  tipo: string;
  rotuloTipo: string;
  titulo: string;
  paginas: number;
  imovel: { id: string; titulo: string } | null;
  compartilhado: boolean;
  aberturas: number;
  atualizadoEm: string;
  capa: string | null;
};

type Imovel = { id: string; titulo: string; fotos: number; capa: string | null };

/** Item de /api/materiais. */
type ItemBiblioteca = { id: string; categoria: string; rotulo: string; detalhe: string; criadoEm: string; imovel: { id: string } | null; miniatura: string | null };

function quando(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function Books() {
  const c = useConta();
  const router = useRouter();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaMigracao, setPrecisaMigracao] = useState(false);
  const [criando, setCriando] = useState(false);
  const [imovelEscolhido, setImovelEscolhido] = useState<string | null>(null);
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoBook>("book");
  const [imagens, setImagens] = useState<ItemBiblioteca[] | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [montando, setMontando] = useState(false);
  const { user, token } = c;

  const buscar = useCallback(async () => {
    const t = await token();
    const cab = { Authorization: `Bearer ${t}` };
    const [rb, ri] = await Promise.all([fetch("/api/books", { headers: cab }), fetch("/api/imoveis", { headers: cab })]);
    const db = await rb.json();
    const di = await ri.json();
    if (!rb.ok) throw Object.assign(new Error(db.error), { migracao: !!db.migracao });
    return { books: db.books as Book[], imoveis: (di.imoveis ?? []) as Imovel[] };
  }, [token]);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then((d) => {
        setBooks(d.books);
        setImoveis(d.imoveis);
      })
      .catch((e: Error & { migracao?: boolean }) => {
        setErro(e.message);
        setPrecisaMigracao(!!e.migracao);
        setBooks([]);
      });
  }, [user, buscar]);

  const carregarImagens = useCallback(
    async (imovel: string) => {
      const r = await fetch("/api/materiais", { headers: { Authorization: `Bearer ${await token()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // Vídeo não entra em PDF -- mesma regra da Biblioteca.
      return ((d.itens ?? []) as ItemBiblioteca[]).filter((i) => i.categoria !== "video" && i.imovel?.id === imovel);
    },
    [token]
  );

  const comFotos = useMemo(() => imoveis.filter((i) => i.fotos > 0), [imoveis]);
  const imovel = comFotos.find((i) => i.id === imovelEscolhido) ?? null;
  const quantas = marcadas.length || imovel?.fotos || 0;
  const sugestao = quantas ? tipoSugerido(quantas, 1) : null;

  const escolherImovel = useCallback(
    (id: string) => {
      setImovelEscolhido(id);
      setImagens(null);
      setMarcadas([]);
      carregarImagens(id)
        .then((lista) => {
          setImagens(lista);
          // Tudo marcado por padrão: o caminho principal é montar sem escolher nada.
          setMarcadas(lista.map((x) => x.id));
          setTipoEscolhido(tipoSugerido(lista.length, 1).tipo);
        })
        .catch(() => setImagens([]));
    },
    [carregarImagens]
  );

  function abrirCriacao() {
    setCriando(true);
    const primeiro = comFotos[0] ?? null;
    if (primeiro) escolherImovel(primeiro.id);
    else setImovelEscolhido(null);
  }

  function alternar(jobId: string) {
    setMarcadas((m) => (m.includes(jobId) ? m.filter((x) => x !== jobId) : [...m, jobId]));
  }

  async function montar() {
    if (!imovelEscolhido || marcadas.length === 0) return;
    setMontando(true);
    setErro(null);
    try {
      const r = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ imovelId: imovelEscolhido, tipo: tipoEscolhido, jobIds: marcadas }),
      });
      const d = await r.json();
      if (!r.ok) throw Object.assign(new Error(d.error), { migracao: !!d.migracao });
      router.push(`/books/${d.book.id}`);
    } catch (e) {
      const err = e as Error & { migracao?: boolean };
      setErro(err.message);
      setPrecisaMigracao(!!err.migracao);
      setMontando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seus books.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Books</h1>
          <p className="mt-1 text-sm text-neutral-500">O material do imóvel montado sozinho, guardado e pronto pra mandar. Não gasta crédito.</p>
        </div>
        {!precisaMigracao && !criando && (
          <Botao onClick={abrirCriacao} disabled={comFotos.length === 0}>
            <Icone nome="materiais" className="h-4 w-4" />
            Criar book
          </Botao>
        )}
      </div>

      {erro && (
        <div className="mt-4">
          <Aviso tipo={precisaMigracao ? "atencao" : "erro"}>{erro}</Aviso>
        </div>
      )}

      {criando && (
        <Cartao className="mt-5">
          <Rotulo>1 · De qual imóvel</Rotulo>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {comFotos.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => escolherImovel(i.id)}
                  className={
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition " +
                    (imovelEscolhido === i.id ? "border-marca-coral bg-marca-pessego/30" : "border-neutral-200 hover:border-neutral-400")
                  }
                >
                  {i.capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.capa} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                      <Icone nome="imoveis" className="h-4 w-4 text-neutral-400" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.titulo}</span>
                    <span className="block text-[11px] text-neutral-500">{i.fotos} {i.fotos === 1 ? "imagem" : "imagens"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {imovelEscolhido && (
            <div className="mt-5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <Rotulo>2 · Quais imagens</Rotulo>
                {imagens && imagens.length > 0 && (
                  <span className="pb-1 text-xs text-neutral-500">
                    {marcadas.length} de {imagens.length} · a ordem de marcação é a ordem das páginas ·{" "}
                    <button onClick={() => setMarcadas(imagens.map((x) => x.id))} className="text-marca-indigo underline">marcar todas</button>
                  </span>
                )}
              </div>
              {imagens === null ? (
                <p className="text-sm text-neutral-500">Carregando as imagens…</p>
              ) : imagens.length === 0 ? (
                <p className="text-sm text-neutral-500">Nenhuma imagem pronta neste imóvel.</p>
              ) : (
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {imagens.map((i) => {
                    const ordem = marcadas.indexOf(i.id) + 1;
                    return (
                      <li key={i.id}>
                        <button
                          onClick={() => alternar(i.id)}
                          title={i.rotulo}
                          className={
                            "relative block w-full overflow-hidden rounded-lg border-2 transition " +
                            (ordem > 0 ? "border-marca-coral" : "border-neutral-200 hover:border-neutral-400")
                          }
                        >
                          {i.miniatura ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.miniatura} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="block aspect-square w-full bg-neutral-100" />
                          )}
                          <span
                            className={
                              "absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold " +
                              (ordem > 0 ? "border-marca-coral bg-marca-coral text-white" : "border-white bg-black/25 text-transparent")
                            }
                          >
                            {ordem > 0 ? ordem : 0}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5">
            <Rotulo>3 · Que tipo de book</Rotulo>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TIPOS.filter((t) => !t.variosImoveis).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTipoEscolhido(t.id)}
                  className={
                    "rounded-xl border p-3 text-left transition " +
                    (tipoEscolhido === t.id ? "border-marca-coral bg-marca-pessego/30 ring-2 ring-marca-coral/25" : "border-neutral-200 bg-white hover:border-neutral-400")
                  }
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{t.rotulo}</span>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                      {t.formato === "widescreen" ? "deitado" : t.formato === "quadrado" ? "quadrado" : "em pé"}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">{t.para}</span>
                  <span className="mt-1.5 block text-[11px] text-neutral-400">
                    {quantas ? `${paginasEstimadas(t.id, quantas)} páginas com estas imagens` : `até ${t.maxFotos} imagens`}
                    {sugestao?.tipo === t.id ? ` · recomendado: ${sugestao.porque}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Botao onClick={montar} disabled={montando || !imovelEscolhido || marcadas.length === 0}>
              {montando ? "Montando…" : "Montar book"}
            </Botao>
            <Botao variante="discreta" onClick={() => setCriando(false)}>Cancelar</Botao>
            <span className="text-xs text-neutral-500">Sai pronto. Editar depois é opcional.</span>
          </div>
        </Cartao>
      )}

      <div className="mt-6">
        {books === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : books.length === 0 && !precisaMigracao ? (
          <Cartao>
            <p className="font-medium">Nenhum book ainda.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Um book é o material do imóvel: capa, as fotos na ordem da visita, ficha técnica e a sua página de contato com QR.
              {comFotos.length === 0 ? (
                <> Antes disso, <Link href="/editar" className="text-marca-indigo underline">edite a primeira foto</Link> de um imóvel.</>
              ) : (
                " Clique em Criar book."
              )}
            </p>
          </Cartao>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <li key={b.id}>
                <Link href={`/books/${b.id}`} className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-400">
                  <div className="aspect-[4/3] bg-neutral-100">
                    {b.capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.capa} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <Icone nome="materiais" className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="truncate font-semibold">{b.titulo}</p>
                    <p className="truncate text-sm text-neutral-500">{b.rotuloTipo}</p>
                    <p className="mt-2 text-xs text-neutral-400">
                      {b.paginas} {b.paginas === 1 ? "página" : "páginas"} · {quando(b.atualizadoEm)}
                      {b.compartilhado &&
                        (b.aberturas > 0 ? ` · ${b.aberturas} ${b.aberturas === 1 ? "abertura" : "aberturas"}` : " · link ativo")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
