"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Chip, Icone, Rotulo } from "@/components/ui";
import { CATEGORIAS, type Categoria } from "@/lib/materiais";
import { guardarSelecao } from "@/lib/selecao-material";

// Materiais: tudo que a pessoa já produziu num lugar só, pra escolher e virar material.
//
// Chamava-se "Biblioteca" e o nome estava errado: biblioteca é onde coisa fica guardada, e
// esta tela é onde o material é feito. Guardar é meio; o fim é o arquivo que vai pro
// cliente. Por isso o botão de criar vem antes da grade, não depois.
//
// Por que não é um terceiro lugar onde o arquivo mora: ela LÊ os mesmos jobs e vídeos que
// o Histórico e a galeria do imóvel. A diferença é o propósito -- aqui o critério é
// "serve pra montar alguma coisa", então o que manda é a seleção múltipla.
//
// Vídeo aparece (é material que a pessoa produziu e vai querer achar), mas não entra no
// PDF: clicar abre a página do vídeo em vez de marcar.

type Item = {
  id: string;
  categoria: Categoria;
  rotulo: string;
  detalhe: string;
  criadoEm: string;
  imovel: { id: string; titulo: string } | null;
  miniatura: string | null;
};

const MAX_DE_UMA_VEZ = 30;

function quando(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function Materiais() {
  const c = useConta();
  const router = useRouter();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [imoveis, setImoveis] = useState<{ id: string; titulo: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria | "tudo">("tudo");
  const [imovelFiltro, setImovelFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const { user, token } = c;

  const buscar = useCallback(async () => {
    const t = await token();
    const r = await fetch("/api/materiais", { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d as { itens: Item[]; imoveis: { id: string; titulo: string }[] };
  }, [token]);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then((d) => {
        setItens(d.itens);
        setImoveis(d.imoveis);
      })
      .catch((e: Error) => setErro(e.message));
  }, [user, buscar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => {
      if (categoria !== "tudo" && i.categoria !== categoria) return false;
      if (imovelFiltro && i.imovel?.id !== imovelFiltro) return false;
      if (termo && !`${i.rotulo} ${i.detalhe} ${i.imovel?.titulo ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [itens, categoria, imovelFiltro, busca]);

  /** Só imagem entra em PDF -- vídeo fica de fora da seleção. */
  const selecionaveis = useMemo(() => filtrados.filter((i) => i.categoria !== "video"), [filtrados]);
  const selecionados = useMemo(() => marcados.filter((id) => (itens ?? []).some((i) => i.id === id)), [marcados, itens]);

  function alternar(id: string) {
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  /** A ordem de clique é a ordem das páginas: quem marca primeiro vira capa. */
  function criarMaterial(ids: string[]) {
    if (ids.length === 0) return;
    guardarSelecao(ids);
    router.push("/materiais/montar");
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seus materiais.</Link>
      </main>
    );
  }

  const vazia = itens !== null && itens.length === 0;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Materiais</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tudo que você já criou. Marque o que quer usar e monte um book, um catálogo ou uma apresentação.
          </p>
        </div>
        <Botao
          onClick={() => criarMaterial(selecionados.length ? selecionados : selecionaveis.slice(0, MAX_DE_UMA_VEZ).map((i) => i.id))}
          disabled={selecionaveis.length === 0}
          title={selecionados.length ? `${selecionados.length} escolhidas` : "Usa as imagens que estão à vista"}
        >
          <Icone nome="materiais" className="h-4 w-4" />
          {selecionados.length ? `Criar material · ${selecionados.length}` : "Criar material"}
        </Botao>
      </div>

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {!vazia && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {CATEGORIAS.map((k) => (
            <Chip key={k.id} ativo={categoria === k.id} onClick={() => setCategoria(k.id)}>
              {k.rotulo}
            </Chip>
          ))}
          {imoveis.length > 0 && (
            <select
              value={imovelFiltro}
              onChange={(e) => setImovelFiltro(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
            >
              <option value="">Todos os imóveis</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>{i.titulo}</option>
              ))}
            </select>
          )}
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar"
            className="w-36 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
          />
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button onClick={() => setMarcados(selecionaveis.map((i) => i.id))} className="text-marca-indigo underline">
              Marcar as {selecionaveis.length} à vista
            </button>
            {selecionados.length > 0 && (
              <button onClick={() => setMarcados([])} className="text-neutral-500 underline">Limpar</button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 pb-24">
        {itens === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : vazia ? (
          <Cartao>
            <p className="font-medium">Você ainda não tem material.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Tudo que você gerar aparece aqui: foto editada, planta, terreno e vídeo. Comece por{" "}
              <Link href="/editar" className="text-marca-indigo underline">uma foto</Link> ou por uma{" "}
              <Link href="/planta" className="text-marca-indigo underline">planta</Link> (essa não gasta crédito).
            </p>
          </Cartao>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada com esse filtro.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtrados.map((i) => {
              const marcado = selecionados.includes(i.id);
              const ordem = selecionados.indexOf(i.id) + 1;
              const video = i.categoria === "video";
              const conteudo = (
                <>
                  <div className="relative aspect-[4/3] bg-neutral-100">
                    {i.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <Icone nome={video ? "video" : "foto"} className="h-8 w-8" />
                      </div>
                    )}
                    {video ? (
                      <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                        <Icone nome="play" className="h-3 w-3" /> vídeo
                      </span>
                    ) : (
                      <span
                        className={
                          "absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold transition " +
                          (marcado ? "border-marca-coral bg-marca-coral text-white" : "border-white bg-black/25 text-transparent")
                        }
                      >
                        {ordem}
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{i.rotulo}</p>
                    <p className="truncate text-[11px] text-neutral-500">{i.imovel?.titulo ?? i.detalhe ?? ""}</p>
                    <p className="text-[10px] text-neutral-400">{quando(i.criadoEm)}</p>
                  </div>
                </>
              );
              const borda = marcado ? "border-marca-coral ring-2 ring-marca-coral/30" : "border-neutral-200 hover:border-neutral-400";
              return (
                <li key={i.id}>
                  {video ? (
                    <Link href="/video" className={`block overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${borda}`} title="Vídeo não entra no PDF; abre na página de vídeo">
                      {conteudo}
                    </Link>
                  ) : (
                    <button onClick={() => alternar(i.id)} className={`block w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${borda}`}>
                      {conteudo}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* barra de baixo: aparece só com algo marcado, e diz a ordem das páginas */}
      {selecionados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm">
              <strong>{selecionados.length}</strong> {selecionados.length === 1 ? "imagem marcada" : "imagens marcadas"}
              <span className="ml-2 hidden text-xs text-neutral-500 sm:inline">a primeira vira a capa · a ordem é a de marcação</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Botao variante="discreta" onClick={() => setMarcados([])}>Limpar</Botao>
              <Botao onClick={() => criarMaterial(selecionados)}>
                <Icone nome="materiais" className="h-4 w-4" />
                Criar material
              </Botao>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2">
        <Rotulo>Como funciona</Rotulo>
        <p className="text-sm text-neutral-600">
          O material sai em PDF com a sua marca de <Link href="/configuracoes" className="text-marca-indigo underline">Minha marca</Link>, o aviso
          de imagem ilustrativa e o QR do link do imóvel, quando ele estiver compartilhado. <strong>Não gasta crédito</strong>: é diagramação, não IA.
        </p>
      </div>
    </AppShell>
  );
}
