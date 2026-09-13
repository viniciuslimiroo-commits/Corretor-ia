"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";
import { MODELOS, MODELOS_POR_ID, type Categoria, type ModeloMaterial } from "@/lib/materiais";
import { lerSelecao } from "@/lib/selecao-material";

// Montar material: escolher o modelo, mexer na ordem das páginas e trocar os textos antes
// de exportar. O PDF sai do servidor (as fotos moram em bucket privado), mas a ordem, a
// capa e os textos são decididos aqui -- é o "personalize antes de exportar" do pedido.
//
// A seleção chega por sessionStorage, não pela URL: trinta uuid não cabem numa query e a
// ordem importa. Quem entra sem seleção vê o caminho de volta, não uma tela vazia.

type Item = {
  id: string;
  categoria: Categoria;
  rotulo: string;
  detalhe: string;
  criadoEm: string;
  imovel: { id: string; titulo: string } | null;
  miniatura: string | null;
};
type Imovel = { id: string; titulo: string; endereco: string | null; compartilhado: boolean };

/** Quantas páginas o modelo vai gerar, pra pessoa saber o que está pedindo. */
function paginasDe(modelo: ModeloMaterial, fotos: number, grupos: number, temTexto: boolean) {
  if (fotos === 0) return 0;
  switch (modelo) {
    case "whatsapp":
      return 1;
    case "catalogo":
      return 1 + Math.ceil(grupos / 2) + 1;
    case "portfolio":
      return 1 + Math.ceil(fotos / 6) + 1;
    case "lancamento":
      return 1 + (temTexto ? 1 : 0) + (fotos - 1) + 1;
    case "investidores":
      return 1 + 1 + Math.ceil((fotos - 1) / 2) + 1;
    default:
      return 1 + Math.ceil((fotos - 1) / 2) + 1;
  }
}

export default function MontarMaterial() {
  const c = useConta();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [modelo, setModelo] = useState<ModeloMaterial>("book");
  const [titulo, setTitulo] = useState("");
  const [tituloTocado, setTituloTocado] = useState(false);
  const [subtitulo, setSubtitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [precoPorImovel, setPrecoPorImovel] = useState<Record<string, string>>({});
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { user, token } = c;

  const buscar = useCallback(async () => {
    const t = await token();
    const r = await fetch("/api/biblioteca", { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d as { itens: Item[]; imoveis: Imovel[] };
  }, [token]);

  useEffect(() => {
    if (!user) return;
    const escolhidos = lerSelecao();
    buscar()
      .then((d) => {
        setItens(d.itens);
        setImoveis(d.imoveis);
        const validos = escolhidos.filter((id) => d.itens.some((i) => i.id === id && i.categoria !== "video"));
        setOrdem(validos);
        const primeiro = d.itens.find((i) => i.id === validos[0]);
        const imovel = primeiro?.imovel ? d.imoveis.find((m) => m.id === primeiro.imovel!.id) : undefined;
        setTitulo(imovel?.titulo ?? primeiro?.imovel?.titulo ?? "");
        setSubtitulo(imovel?.endereco ?? "");
      })
      .catch((e: Error) => setErro(e.message));
  }, [user, buscar]);

  const porId = useMemo(() => new Map((itens ?? []).map((i) => [i.id, i])), [itens]);
  const def = MODELOS_POR_ID[modelo];
  const dentroDoLimite = useMemo(() => ordem.slice(0, def.maxFotos), [ordem, def.maxFotos]);

  /** Blocos do material: um por imóvel nos modelos de vários, um só nos demais. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, { chave: string; imovelId: string | null; titulo: string; subtitulo: string; ids: string[] }>();
    for (const id of dentroDoLimite) {
      const it = porId.get(id);
      if (!it) continue;
      const chave = it.imovel?.id ?? "sem-imovel";
      const atual = mapa.get(chave);
      if (atual) atual.ids.push(id);
      else {
        const m = it.imovel ? imoveis.find((x) => x.id === it.imovel!.id) : undefined;
        mapa.set(chave, {
          chave,
          imovelId: it.imovel?.id ?? null,
          titulo: m?.titulo ?? it.imovel?.titulo ?? "Sem imóvel",
          subtitulo: m?.endereco ?? "",
          ids: [id],
        });
      }
    }
    return [...mapa.values()];
  }, [dentroDoLimite, porId, imoveis]);

  const paginas = paginasDe(modelo, dentroDoLimite.length, grupos.length, !!descricao.trim());
  const imovelDoQr = useMemo(() => {
    for (const g of grupos) {
      const m = g.imovelId ? imoveis.find((x) => x.id === g.imovelId) : undefined;
      if (m?.compartilhado) return m;
    }
    return null;
  }, [grupos, imoveis]);

  function escolher(id: ModeloMaterial) {
    setModelo(id);
    if (!tituloTocado) {
      const d = MODELOS_POR_ID[id];
      const primeiro = porId.get(ordem[0]);
      const padraoDeUm = primeiro?.imovel?.titulo ?? "";
      setTitulo(d.variosImoveis ? (id === "portfolio" ? "Nosso portfólio" : "Catálogo de imóveis") : padraoDeUm);
    }
  }

  const mover = (id: string, delta: number) =>
    setOrdem((o) => {
      const i = o.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const copia = [...o];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const paraCapa = (id: string) => setOrdem((o) => [id, ...o.filter((x) => x !== id)]);
  const remover = (id: string) => setOrdem((o) => o.filter((x) => x !== id));

  const soltarEm = (destino: string) =>
    setOrdem((o) => {
      if (!arrastando || arrastando === destino) return o;
      const sem = o.filter((x) => x !== arrastando);
      const i = sem.indexOf(destino);
      return [...sem.slice(0, i), arrastando, ...sem.slice(i)];
    });

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const blocos = def.variosImoveis
        ? grupos.map((g) => ({ imovelId: g.imovelId, titulo: g.titulo, subtitulo: g.subtitulo, preco: precoPorImovel[g.chave] ?? "", jobIds: g.ids }))
        : [{ imovelId: grupos[0]?.imovelId ?? null, titulo: titulo || (grupos[0]?.titulo ?? "Imóvel"), subtitulo, preco, jobIds: dentroDoLimite }];
      const r = await fetch("/api/material", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ modelo, titulo, subtitulo, preco, descricao, blocos }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Não consegui montar o material.");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "material.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao montar o material.");
    } finally {
      setGerando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para montar um material.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <p className="text-sm">
        <Link href="/biblioteca" className="text-neutral-500 hover:text-marca-indigo">← Biblioteca</Link>
      </p>

      <h1 className="mt-2 text-2xl font-semibold">Montar material</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Escolha o modelo, ajuste a ordem e os textos. Sai em PDF com a sua marca. <strong>Não gasta crédito.</strong>
      </p>

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {itens !== null && ordem.length === 0 ? (
        <Cartao className="mt-6">
          <p className="font-medium">Nenhuma imagem escolhida.</p>
          <p className="mt-1 text-sm text-neutral-600">
            Volte pra <Link href="/biblioteca" className="text-marca-indigo underline">Biblioteca</Link>, marque as imagens na ordem que quiser e clique em
            &quot;Criar material&quot;. A primeira marcada vira a capa.
          </p>
        </Cartao>
      ) : (
        <>
          {/* ---- 1. modelo ---- */}
          <section className="mt-6">
            <Rotulo>1. O que você quer montar</Rotulo>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODELOS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => escolher(m.id)}
                  className={
                    "rounded-2xl border p-4 text-left shadow-sm transition " +
                    (modelo === m.id ? "border-marca-coral bg-marca-pessego/30 ring-2 ring-marca-coral/25" : "border-neutral-200 bg-white hover:border-neutral-400")
                  }
                >
                  <span className="flex items-center justify-between">
                    <span className="font-semibold">{m.rotulo}</span>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400">{m.orientacao === "paisagem" ? "deitado" : "em pé"}</span>
                  </span>
                  <span className="mt-1 block text-sm text-neutral-500">{m.para}</span>
                  <span className="mt-2 block text-[11px] text-neutral-400">
                    até {m.maxFotos} imagens{m.variosImoveis ? " · agrupa por imóvel" : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- 2. ordem ---- */}
          <section className="mt-8">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <Rotulo>2. Ordem das páginas</Rotulo>
              <p className="text-xs text-neutral-500">
                Arraste pra trocar de lugar, ou use as setas. {dentroDoLimite.length} de {ordem.length} imagens · aproximadamente {paginas} páginas
              </p>
            </div>
            {ordem.length > def.maxFotos && (
              <div className="mb-3">
                <Aviso tipo="atencao">
                  Este modelo leva até {def.maxFotos} imagens. Vão entrar as {def.maxFotos} primeiras; tire as que não quiser pra escolher outras.
                </Aviso>
              </div>
            )}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {ordem.map((id, i) => {
                const it = porId.get(id);
                if (!it) return null;
                const fora = i >= def.maxFotos;
                return (
                  <li
                    key={id}
                    draggable
                    onDragStart={() => setArrastando(id)}
                    onDragEnd={() => setArrastando(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => soltarEm(id)}
                    className={
                      "group relative overflow-hidden rounded-xl border bg-white shadow-sm " +
                      (fora ? "border-neutral-200 opacity-40" : arrastando === id ? "border-marca-coral opacity-60" : "border-neutral-200")
                    }
                  >
                    <div className="relative aspect-[4/3] cursor-grab bg-neutral-100 active:cursor-grabbing">
                      {it.miniatura && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.miniatura} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                      )}
                      <span className="absolute top-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/65 px-1 text-[10px] font-bold text-white">
                        {i === 0 ? "capa" : i + 1}
                      </span>
                      <button
                        onClick={() => remover(id)}
                        title="Tirar do material"
                        className="absolute top-1.5 right-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <Icone nome="fechar" className="h-3 w-3" />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => mover(id, -1)} title="Pra trás" className="rounded p-0.5 text-white hover:bg-white/20">
                          <Icone nome="cima" className="h-3.5 w-3.5 -rotate-90" />
                        </button>
                        {i !== 0 && (
                          <button onClick={() => paraCapa(id)} title="Usar como capa" className="rounded p-0.5 text-white hover:bg-white/20">
                            <Icone nome="estrela" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => mover(id, 1)} title="Pra frente" className="rounded p-0.5 text-white hover:bg-white/20">
                          <Icone nome="baixo" className="h-3.5 w-3.5 -rotate-90" />
                        </button>
                      </div>
                    </div>
                    <p className="truncate px-1.5 py-1 text-[10px] text-neutral-500">{it.imovel?.titulo ?? it.rotulo}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---- 3. textos ---- */}
          <section className="mt-8">
            <Rotulo>3. Textos e preço</Rotulo>
            <Cartao>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Título da capa</span>
                  <input
                    value={titulo}
                    onChange={(e) => {
                      setTitulo(e.target.value);
                      setTituloTocado(true);
                    }}
                    maxLength={90}
                    placeholder={def.variosImoveis ? "Ex.: Catálogo de imóveis" : "Ex.: Apto 302 · Setor Bueno"}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Subtítulo</span>
                  <input
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    maxLength={120}
                    placeholder="Endereço, bairro ou uma frase curta"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
                  />
                </label>
                {def.usaPreco && !def.variosImoveis && (
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Preço</span>
                    <input
                      value={preco}
                      onChange={(e) => setPreco(e.target.value)}
                      maxLength={40}
                      placeholder="R$ 690.000"
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
                    />
                  </label>
                )}
                <label className={"text-sm " + (def.usaPreco && !def.variosImoveis ? "" : "sm:col-span-2")}>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    {def.descricao === "topicos" ? "Números e observações" : "Descrição"}
                  </span>
                  <textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    maxLength={1200}
                    rows={def.descricao === "topicos" ? 5 : 3}
                    placeholder={
                      def.descricao === "topicos"
                        ? "Uma linha por número, no formato Rótulo: valor\nÁrea: 120 m²\nRentabilidade: 0,6% a.m.\nEntrega: dez/2027"
                        : "Duas ou três linhas sobre o imóvel"
                    }
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
                  />
                  {def.descricao === "topicos" && (
                    <span className="mt-1 block text-[11px] text-neutral-500">Cada linha com dois-pontos vira um quadradinho de número na segunda página.</span>
                  )}
                </label>
              </div>

              {/* preço por imóvel, nos modelos de vários */}
              {def.variosImoveis && grupos.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Preço de cada imóvel</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {grupos.map((g) => (
                      <li key={g.chave} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{g.titulo}</span>
                          <span className="block text-[11px] text-neutral-500">{g.ids.length} {g.ids.length === 1 ? "imagem" : "imagens"}</span>
                        </span>
                        {def.usaPreco && (
                          <input
                            value={precoPorImovel[g.chave] ?? ""}
                            onChange={(e) => setPrecoPorImovel((p) => ({ ...p, [g.chave]: e.target.value }))}
                            maxLength={40}
                            placeholder="R$"
                            className="w-28 shrink-0 rounded-lg border border-neutral-200 px-2 py-1 text-sm focus:border-marca-indigo focus:outline-none"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Cartao>
          </section>

          {/* ---- gerar ---- */}
          <div className="mt-6 flex flex-wrap items-center gap-3 pb-8">
            <Botao onClick={gerar} disabled={gerando || dentroDoLimite.length === 0}>
              <Icone nome="download" className="h-4 w-4" />
              {gerando ? "Montando…" : `Gerar ${def.rotulo.toLowerCase()}`}
            </Botao>
            <p className="text-xs text-neutral-500">
              {imovelDoQr
                ? `Vai sair com o QR do link de ${imovelDoQr.titulo}.`
                : "Sem QR: nenhum dos imóveis escolhidos está compartilhado. Ligue o link na página do imóvel se quiser o QR."}{" "}
              Sua marca vem de <Link href="/configuracoes" className="underline">Minha marca</Link>.
            </p>
          </div>
        </>
      )}
    </AppShell>
  );
}
