"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, BotaoConfirma, Cartao, Chip, Icone, Rotulo } from "@/components/ui";
import { CATEGORIAS, type Categoria } from "@/lib/materiais";
import { guardarSelecao } from "@/lib/selecao-material";
import VisualizadorAcervo, { type ItemAcervo } from "@/components/visualizador-acervo";

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
// PDF: no visualizador ele toca, e os botões são os dele (editar, compartilhar).
//
// Clicar no item ABRE (o visualizador, em tela cheia); marcar é a bolinha no canto. Era o
// contrário -- clicar marcava, e olhar a foto de verdade não tinha jeito. Um acervo em
// que não se olha a foto é um depósito.

type Item = ItemAcervo;

type Periodo = "" | "hoje" | "7" | "30";
type Ordem = "recentes" | "antigos";

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
  const [apagando, setApagando] = useState(false);
  /** Imagens em algum book: o aviso diz quais, e guarda os ids pra "apagar assim mesmo". */
  const [emUso, setEmUso] = useState<{ texto: string; ids: string[] } | null>(null);
  /** O período vira um instante ("desde") no clique, não no render: relógio não é puro. */
  const [periodo, setPeriodo] = useState<{ id: Periodo; desde: number }>({ id: "", desde: 0 });
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  /** Índice (em `filtrados`) do item aberto no visualizador. */
  const [aberto, setAberto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(0);
  const [recado, setRecado] = useState<string | null>(null);
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
    const desde = periodo.desde;
    const lista = (itens ?? []).filter((i) => {
      if (categoria !== "tudo" && i.categoria !== categoria) return false;
      if (imovelFiltro && i.imovel?.id !== imovelFiltro) return false;
      if (desde && new Date(i.criadoEm).getTime() < desde) return false;
      if (termo && !`${i.rotulo} ${i.detalhe} ${i.imovel?.titulo ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
    // A lista já vem do servidor do mais novo pro mais velho; "antigos" só inverte.
    return ordem === "antigos" ? [...lista].reverse() : lista;
  }, [itens, categoria, imovelFiltro, busca, periodo, ordem]);

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
    router.push("/materiais?novo=1");
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seus materiais.</Link>
      </main>
    );
  }

  /**
   * Apagar de vez: sai do banco e do armazenamento.
   *
   * Duas perguntas, não uma. A primeira é a de sempre. A segunda só aparece quando o
   * servidor responde que alguma imagem está num book -- e aí ela diz QUAIS books, porque
   * "tem certeza?" sem dizer o que quebra não é pergunta, é formalidade.
   */
  async function apagarIds(ids: string[], forcarAgora = false) {
    if (ids.length === 0 || apagando) return;
    setApagando(true);
    setErro(null);
    try {
      const pedir = async (forcar: boolean) => {
        const r = await fetch("/api/materiais/apagar", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ ids, forcar }),
        });
        const bruto = await r.text();
        let d: { error?: string; emUso?: boolean; apagados?: number } = {};
        try {
          d = JSON.parse(bruto);
        } catch {
          throw new Error("Resposta inesperada do servidor.");
        }
        return { ok: r.ok, status: r.status, d };
      };

      const saida = await pedir(forcarAgora);
      // Em uso num book: em vez de perguntar de novo num diálogo, o aviso fica NA TELA,
      // dizendo em quais books, com o botão de confirmar ao lado.
      if (saida.status === 409 && saida.d.emUso) {
        setEmUso({ texto: saida.d.error ?? "Estas imagens estão em algum book.", ids });
        setApagando(false);
        return;
      }
      if (!saida.ok) throw new Error(saida.d.error ?? "Não consegui apagar.");

      setEmUso(null);
      setMarcados((m) => m.filter((id) => !ids.includes(id)));
      setAberto(null);
      const d = await buscar();
      setItens(d.itens);
      setImoveis(d.imoveis);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao apagar.");
    } finally {
      setApagando(false);
    }
  }
  const apagarMarcados = (forcar = false) => apagarIds(selecionados, forcar);

  /** Vídeo sai pela rota dele (arquivo montado + miniatura). */
  async function apagarVideo(id: string) {
    setErro(null);
    try {
      const r = await fetch(`/api/video/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
      if (!r.ok) throw new Error("Não consegui apagar o vídeo.");
      setAberto(null);
      const d = await buscar();
      setItens(d.itens);
      setImoveis(d.imoveis);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao apagar.");
    }
  }

  /** Move a imagem pra um imóvel (ou tira dela). É o PATCH do job, que já existia. */
  async function mudarImovel(id: string, imovelId: string | null) {
    setErro(null);
    try {
      const r = await fetch(`/api/job/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ imovelId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui mover.");
      const titulo = imoveis.find((i) => i.id === imovelId)?.titulo ?? "Imóvel";
      setItens((lista) => (lista ?? []).map((i) => (i.id === id ? { ...i, imovel: imovelId ? { id: imovelId, titulo } : null } : i)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao mover.");
    }
  }

  /**
   * Envia foto pronta. Não passa por IA e não debita: é guardar, não gerar.
   *
   * O filtro de imóvel manda: se a pessoa está olhando um imóvel, a foto entra nele. É
   * onde ela está quando percebe que falta uma.
   */
  async function enviarFotos(fotos: File[]) {
    if (fotos.length === 0) return;
    setEnviando(fotos.length);
    setErro(null);
    setRecado(null);
    try {
      const form = new FormData();
      for (const f of fotos.slice(0, 10)) form.append("fotos", f);
      if (imovelFiltro) form.append("imovelId", imovelFiltro);
      const r = await fetch("/api/materiais/enviar", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
        body: form,
      });
      const bruto = await r.text();
      let d: { entraram?: { id: string }[]; recusadas?: string[]; error?: string } = {};
      try {
        d = JSON.parse(bruto);
      } catch {
        throw new Error("Resposta inesperada do servidor.");
      }
      if (!r.ok) throw new Error(d.error ?? "Não consegui enviar.");
      const n = d.entraram?.length ?? 0;
      setRecado(
        `${n} ${n === 1 ? "foto entrou" : "fotos entraram"} no acervo, sem gastar crédito.` +
          (d.recusadas?.length ? ` Ficaram de fora: ${d.recusadas.join(" · ")}` : "")
      );
      const novo = await buscar();
      setItens(novo.itens);
      setImoveis(novo.imoveis);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setEnviando(0);
    }
  }

  const vazia = itens !== null && itens.length === 0;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Acervo</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Suas fotos, plantas, terrenos e vídeos. Marque o que quer usar e monte o material.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Só aparece com algo marcado: botão de apagar sempre à vista convida ao acidente. */}
          {selecionados.length > 0 && (
            <BotaoConfirma
              pergunta={`Apagar ${selecionados.length} ${selecionados.length === 1 ? "imagem" : "imagens"}?`}
              detalhe="Sai do seu acervo e do armazenamento. Não tem volta e não devolve crédito."
              confirmar="Apagar"
              aoConfirmar={() => apagarMarcados(false)}
              disabled={apagando}
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              {apagando ? "Apagando…" : `Apagar · ${selecionados.length}`}
            </BotaoConfirma>
          )}
          <label
            className={
              "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 " +
              (enviando ? "pointer-events-none opacity-40" : "")
            }
            title="Foto que já está pronta. Não passa por IA e não gasta crédito."
          >
            <Icone nome="foto" className="h-4 w-4" />
            {enviando ? `Enviando ${enviando}…` : "Enviar fotos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                enviarFotos(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>

          {/* Diz o que carrega, e só age no que a pessoa marcou.
              Antes, sem nada marcado, ele pegava "as que estão à vista" -- que depende do
              filtro e de onde a rolagem parou. Comportamento que ninguém adivinha. */}
          <Botao
            onClick={() => criarMaterial(selecionados)}
            disabled={selecionados.length === 0}
            title={selecionados.length ? `Leva ${selecionados.length} imagens pro criador` : "Marque as imagens primeiro"}
          >
            <Icone nome="materiais" className="h-4 w-4" />
            {selecionados.length ? `Criar material com ${selecionados.length}` : "Criar material"}
          </Botao>
        </div>
      </div>

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {recado && (
        <div className="mt-4">
          <Aviso tipo="ok">{recado}</Aviso>
        </div>
      )}

      {emUso && (
        <div className="mt-4">
          <Aviso tipo="atencao">
            {emUso.texto}
            <span className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => apagarIds(emUso.ids, true)} disabled={apagando} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                {apagando ? "Apagando…" : "Apagar assim mesmo"}
              </button>
              <button onClick={() => setEmUso(null)} className="rounded-lg px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100">
                Cancelar
              </button>
            </span>
          </Aviso>
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
          <select
            value={periodo.id}
            onChange={(e) => {
              const id = e.target.value as Periodo;
              const desde = id === "hoje" ? new Date().setHours(0, 0, 0, 0) : id ? Date.now() - Number(id) * 86400000 : 0;
              setPeriodo({ id, desde });
            }}
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
            aria-label="Período"
          >
            <option value="">Qualquer data</option>
            <option value="hoje">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:border-marca-indigo focus:outline-none" aria-label="Ordem">
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
          </select>
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
            {filtrados.map((i, indice) => {
              const marcado = selecionados.includes(i.id);
              const posicao = selecionados.indexOf(i.id) + 1;
              const video = i.categoria === "video";
              const borda = marcado ? "border-marca-coral ring-2 ring-marca-coral/30" : "border-neutral-200 hover:border-neutral-400";
              return (
                <li key={i.id} className={`relative overflow-hidden rounded-xl border bg-white shadow-sm transition ${borda}`}>
                  {/* O item inteiro abre o visualizador; a bolinha (irmã, não filha: botão
                      dentro de botão não é HTML) marca. */}
                  <button type="button" onClick={() => setAberto(indice)} className="block w-full text-left" title={video ? "Ver o vídeo" : "Ver em tela cheia"}>
                    <div className="relative aspect-[4/3] bg-neutral-100">
                      {i.miniatura ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-neutral-300">
                          <Icone nome={video ? "video" : "foto"} className="h-8 w-8" />
                        </div>
                      )}
                      {video && (
                        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                          <Icone nome="play" className="h-3 w-3" /> vídeo
                        </span>
                      )}
                      {i.antes && !video && (
                        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 text-[10px] text-white">antes/depois</span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium">{i.rotulo}</p>
                      <p className="truncate text-[11px] text-neutral-500">{i.imovel?.titulo ?? i.detalhe ?? ""}</p>
                      <p className="text-[10px] text-neutral-400">{quando(i.criadoEm)}</p>
                    </div>
                  </button>
                  {!video && (
                    <button
                      type="button"
                      onClick={() => alternar(i.id)}
                      aria-pressed={marcado}
                      aria-label={marcado ? "Desmarcar" : "Marcar pra usar em material"}
                      title={marcado ? "Desmarcar" : "Marcar pra usar em material"}
                      className={
                        "absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition " +
                        (marcado ? "border-marca-coral bg-marca-coral text-white" : "border-white bg-black/25 text-transparent hover:bg-black/40 hover:text-white/80")
                      }
                    >
                      {marcado ? posicao : "✓"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {aberto !== null && filtrados[aberto] && (
        <VisualizadorAcervo
          itens={filtrados}
          indice={aberto}
          imoveis={imoveis}
          token={token}
          aoFechar={() => setAberto(null)}
          aoIr={(n) => setAberto(Math.max(0, Math.min(filtrados.length - 1, n)))}
          aoApagar={(id) => apagarIds([id], false)}
          aoApagarVideo={apagarVideo}
          aoUsarEmMaterial={(id) => criarMaterial([id])}
          aoMudarImovel={mudarImovel}
        />
      )}

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
          O material sai em PDF com a sua marca de <Link href="/marca" className="text-marca-indigo underline">Minha marca</Link>, o aviso
          de imagem ilustrativa e o QR do link do imóvel, quando ele estiver compartilhado. <strong>Não gasta crédito</strong>: é diagramação, não IA.
        </p>
      </div>
    </AppShell>
  );
}
