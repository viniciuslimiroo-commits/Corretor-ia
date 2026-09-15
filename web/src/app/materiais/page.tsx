"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";
import { TIPOS, TIPO_POR_ID, paginasEstimadas, tipoSugerido, type TipoBook } from "@/lib/book-tipos";
import { lerSelecao, limparSelecao } from "@/lib/selecao-material";

// Meus books: a lista do que já foi montado, e a porta para montar outro.
//
// Dois caminhos, e o primeiro é o principal:
//
//   AUTOMÁTICO -- escolhe o imóvel e pronto. O sistema olha as fotos, separa as melhores,
//     põe na ordem da visita, escreve os textos, monta as páginas e aplica a sua marca.
//   ESCOLHER EU MESMO -- os três passos de sempre: imóvel, imagens, tipo.
//
// O manual continua existindo porque corretor com material próprio quer mandar na ordem.
// Mas quem abre a tela pela primeira vez cai no automático, que é onde o produto ganha.
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

/**
 * A porta: três destinos, não sete formatos.
 *
 * A leitura dos materiais reais e o uso mostram a mesma coisa -- quem monta material não
 * pensa "quero A4 em pé", pensa "vou mandar no zap" ou "vou apresentar numa reunião". O
 * formato é consequência da resposta, não a pergunta.
 */
const DESTINOS: { tipo: TipoBook; rotulo: string; para: string }[] = [
  { tipo: "whatsapp", rotulo: "Mandar no WhatsApp", para: "Uma página só, leve, abre rápido no celular" },
  { tipo: "post", rotulo: "Postar no Instagram", para: "Imagem quadrada em JPG, pronta pra publicar" },
  { tipo: "story", rotulo: "Story", para: "Em pé, tela cheia, do jeito que o Story abre" },
  { tipo: "book", rotulo: "Book completo", para: "Todas as fotos, ficha e seu contato" },
  { tipo: "lancamento", rotulo: "Apresentar numa reunião", para: "Deitado, do jeito que se projeta" },
];

/** O resto continua existindo, atrás de um clique: é cauda longa, não caminho principal. */
const OUTROS: TipoBook[] = ["carrossel", "alto_padrao", "investidores", "catalogo", "portfolio"];

/** O que dizer enquanto monta. Descreve o que o servidor está fazendo, na ordem real. */
const PASSOS = [
  "Olhando cada foto…",
  "Separando as melhores e pondo na ordem da visita…",
  "Escrevendo os textos com os dados do imóvel…",
  "Montando as páginas e aplicando a sua marca…",
  "Quase lá…",
];

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
  const [modo, setModo] = useState<"auto" | "manual">("auto");
  /** Só o catálogo usa: os outros tipos falam de um imóvel só. */
  const [imoveisDoCatalogo, setImoveisDoCatalogo] = useState<string[]>([]);
  const [recado, setRecado] = useState(0);
  const [outrosAbertos, setOutrosAbertos] = useState(false);
  /** Quantas imagens vieram marcadas da Galeria. Zero = a pessoa começou aqui. */
  const [veioDaGaleria, setVeioDaGaleria] = useState(0);
  // Indireção pra chamar abrirCriacao de um efeito sem o React Compiler reclamar de
  // função declarada depois do uso.
  const abrirCriacaoRef = useRef<(() => void) | null>(null);
  const { user, token } = c;

  // Montar automaticamente leva de 10 a 40 segundos: a IA olha cada foto. Barra de
  // progresso mentiria (não dá pra saber a fração); dizer o que está acontecendo, não.
  useEffect(() => {
    if (!montando || modo !== "auto") return;
    setRecado(0);
    const t = setInterval(() => setRecado((r) => Math.min(r + 1, PASSOS.length - 1)), 5000);
    return () => clearInterval(t);
  }, [montando, modo]);

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
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("novo") === "1") abrirCriacaoRef.current?.();
  }, []);

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

  /**
   * Quem chega da Galeria com fotos marcadas cai no modo manual, com a seleção já feita.
   *
   * É a porta única: a Galeria escolhe O QUE entra, esta tela escolhe O QUE VIRA. Antes
   * havia um segundo montador só pra isso, com outro motor e outro resultado.
   */
  useEffect(() => {
    if (!user || !criando) return;
    const vindas = lerSelecao();
    if (vindas.length === 0) return;
    limparSelecao();
    setModo("manual");
    setMarcadas(vindas);
    setVeioDaGaleria(vindas.length);
  }, [user, criando]);

  // Quem manda é a definição do tipo, não o id: catálogo E portfólio falam de vários
  // imóveis, e comparar com "catalogo" deixava o portfólio preso na escolha de um só.
  const ehVarios = !!TIPO_POR_ID[tipoEscolhido]?.variosImoveis;

  function alternarImovelDoCatalogo(id: string) {
    setImoveisDoCatalogo((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  abrirCriacaoRef.current = abrirCriacao;

  function alternar(jobId: string) {
    setMarcadas((m) => (m.includes(jobId) ? m.filter((x) => x !== jobId) : [...m, jobId]));
  }

  async function montar(auto = false) {
    // Sem imóvel mas COM imagens marcadas o caminho continua válido: a rota deduz o imóvel
    // pelas fotos. É o que acontece quando a pessoa chega da Galeria com uma seleção.
    const temAlvo = ehVarios ? imoveisDoCatalogo.length > 0 : !!imovelEscolhido || (!auto && marcadas.length > 0);
    if (!temAlvo) return;
    setMontando(true);
    setErro(null);
    try {
      const r = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        // No automático não mandamos jobIds: quem escolhe as imagens é o servidor, olhando.
        body: JSON.stringify(
          ehVarios
            ? { tipo: tipoEscolhido, imovelIds: imoveisDoCatalogo, auto }
            : auto
              ? { imovelId: imovelEscolhido, tipo: tipoEscolhido, auto: true }
              : { imovelId: imovelEscolhido, tipo: tipoEscolhido, jobIds: marcadas }
        ),
      });
      const d = await r.json();
      if (!r.ok) throw Object.assign(new Error(d.error), { migracao: !!d.migracao });
      // O relatório atravessa pro editor pela sessão do navegador: é recado de uma vez só,
      // não merece coluna no banco nem parâmetro na URL.
      if (d.relatorio) {
        try {
          sessionStorage.setItem(`book:${d.book.id}:relatorio`, JSON.stringify(d.relatorio));
        } catch {}
      }
      router.push(`/editor/material/${d.book.id}`);
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
        <Link href="/login" className="underline">Entre para ver seus materiais.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Materiais</h1>
          <p className="mt-1 text-sm text-neutral-500">Book, catálogo, portfólio e apresentação: montados sozinhos, guardados e prontos pra mandar. Não gastam crédito.</p>
        </div>
        {!precisaMigracao && !criando && (
          <Botao onClick={abrirCriacao} disabled={comFotos.length === 0}>
            <Icone nome="materiais" className="h-4 w-4" />
            Criar material
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
          {/* Os dois caminhos. O automático primeiro, e marcado como tal. */}
          <div className="mb-5 grid gap-2 sm:grid-cols-2">
            {([
              // Dois caminhos com o MESMO peso. A versão anterior deixava o não escolhido
              // com borda cinza-clara e texto cinza -- a cara de botão desabilitado -- e
              // o usuário não percebeu que havia dois jeitos. Aqui os dois têm ícone,
              // borda firme e a mesma altura; o escolhido ganha fundo, check e a palavra.
              ["auto", "Criar automaticamente", "A Encena escolhe as fotos, escreve os textos e monta tudo. Você só revisa.", "✨"],
              ["manual", "Escolher eu mesmo", "Você marca as imagens, a ordem e o tipo. Controle total do que entra.", "👆"],
            ] as const).map(([id, titulo, texto, icone]) => {
              const ativo = modo === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setModo(id)}
                  className={
                    "relative flex min-h-[96px] items-start gap-3 rounded-2xl border-2 p-4 text-left transition " +
                    (ativo
                      ? "border-marca-coral bg-marca-pessego/35 shadow-sm"
                      : "border-neutral-300 bg-white hover:-translate-y-0.5 hover:border-marca-indigo hover:shadow-md")
                  }
                >
                  <span
                    className={
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg " +
                      (ativo ? "bg-marca-coral text-white" : "bg-neutral-100")
                    }
                    aria-hidden="true"
                  >
                    {icone}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-neutral-900">{titulo}</span>
                      {ativo ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-marca-coral px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                          ✓ Selecionado
                        </span>
                      ) : id === "auto" ? (
                        <span className="shrink-0 rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Recomendado</span>
                      ) : null}
                    </span>
                    <span className={"mt-1 block text-[13px] leading-snug " + (ativo ? "text-neutral-700" : "text-neutral-600")}>{texto}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Migalha de pão: sem isto a pessoa marca 5 fotos numa tela e cai noutra, com
              outro cabeçalho, sem nada dizendo que a escolha dela veio junto. */}
          {veioDaGaleria > 0 && (
            <p className="mb-4 rounded-lg border border-marca-teal/40 bg-marca-teal/10 px-3 py-2 text-sm text-marca-indigo">
              Você trouxe <strong className="font-semibold">{veioDaGaleria} {veioDaGaleria === 1 ? "imagem" : "imagens"}</strong> da Galeria. Elas já estão marcadas
              no passo 2.
            </p>
          )}

          <Rotulo>{ehVarios ? `1 · Quais imóveis (${imoveisDoCatalogo.length} ${imoveisDoCatalogo.length === 1 ? "escolhido" : "escolhidos"})` : "1 · De qual imóvel"}</Rotulo>
          {comFotos.length === 0 && (
            <p className="mb-1 text-sm text-neutral-500">
              Nenhum imóvel com foto ainda. <Link href="/materiais" className="text-marca-indigo underline">Envie fotos na Galeria</Link> ou{" "}
              <Link href="/editar" className="text-marca-indigo underline">edite a primeira</Link>.
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {comFotos.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => (ehVarios ? alternarImovelDoCatalogo(i.id) : escolherImovel(i.id))}
                  className={
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition " +
                    ((ehVarios ? imoveisDoCatalogo.includes(i.id) : imovelEscolhido === i.id)
                      ? "border-marca-coral bg-marca-pessego/30"
                      : "border-neutral-200 hover:border-neutral-400")
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

          {(imovelEscolhido || marcadas.length > 0) && modo === "manual" && !ehVarios && (
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
            <Rotulo>{modo === "auto" ? "2 · Pra onde vai" : "3 · Pra onde vai"}</Rotulo>

            {/* A pergunta é o DESTINO, não o formato. Corretor não escolhe "quadrado" nem
                "widescreen" -- escolhe pra quem vai mandar, e o formato é consequência.
                Sete opções de cara era a lista que eu mesmo tinha criticado e reproduzido. */}
            <div className="grid gap-2 sm:grid-cols-3">
              {DESTINOS.map((d) => (
                <button
                  key={d.tipo}
                  onClick={() => setTipoEscolhido(d.tipo)}
                  className={
                    "rounded-xl border p-3 text-left transition " +
                    (tipoEscolhido === d.tipo
                      ? "border-marca-coral bg-marca-pessego/30 ring-2 ring-marca-coral/25"
                      : "border-neutral-200 bg-white hover:border-neutral-400")
                  }
                >
                  <span className="block text-sm font-semibold">{d.rotulo}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{d.para}</span>
                  <span className="mt-1.5 block text-[11px] text-neutral-400">
                    {quantas ? `${paginasEstimadas(d.tipo, quantas)} páginas` : TIPO_POR_ID[d.tipo]?.rotulo}
                    {sugestao?.tipo === d.tipo ? ` · recomendado: ${sugestao.porque}` : ""}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setOutrosAbertos((v) => !v)}
              className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-800"
            >
              {outrosAbertos ? "Esconder os outros formatos" : `Outros formatos (${OUTROS.length})`}
            </button>

            <div className={"grid gap-2 sm:grid-cols-2 lg:grid-cols-4 " + (outrosAbertos || OUTROS.some((o) => o === tipoEscolhido) ? "mt-2" : "hidden")}>
              {TIPOS.filter((t) => OUTROS.includes(t.id)).map((t) => (
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
                    {t.variosImoveis
                      ? imoveisDoCatalogo.length
                        ? `${imoveisDoCatalogo.length + 2} páginas com estes imóveis`
                        : `um imóvel por página, até ${t.maxFotos}`
                      : quantas
                        ? `${paginasEstimadas(t.id, quantas)} páginas com estas imagens`
                        : `até ${t.maxFotos} imagens`}
                    {sugestao?.tipo === t.id ? ` · recomendado: ${sugestao.porque}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {modo === "auto" ? (
              <Botao onClick={() => montar(true)} disabled={montando || (ehVarios ? imoveisDoCatalogo.length === 0 : !imovelEscolhido)}>
                <Icone nome="magica" className="h-4 w-4" />
                {montando ? "Montando…" : ehVarios ? `Criar ${TIPO_POR_ID[tipoEscolhido]?.rotulo.toLowerCase()}` : "Criar automaticamente"}
              </Botao>
            ) : (
              <Botao onClick={() => montar(false)} disabled={montando || (ehVarios ? imoveisDoCatalogo.length === 0 : marcadas.length === 0 && !imovelEscolhido)}>
                {montando ? "Montando…" : "Montar"}
              </Botao>
            )}
            <Botao variante="discreta" onClick={() => setCriando(false)} disabled={montando}>Cancelar</Botao>
            <span className="text-xs text-neutral-500">
              {montando && modo === "auto" ? PASSOS[recado] : "Sai pronto. Editar depois é opcional."}
            </span>
          </div>

          {ehVarios && !montando && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-[11px] leading-relaxed text-neutral-500">
              {tipoEscolhido === "portfolio" ? (
                <>
                  O portfólio mostra o seu <strong className="font-medium text-neutral-700">trabalho</strong>, não imóveis à venda: seis fotos por página, com o
                  nome do imóvel embaixo de cada uma, e sem preço. É material de captação.
                </>
              ) : (
                <>
                  Cada imóvel ocupa uma página, com os mesmos campos no mesmo lugar — é o que deixa comparar.
                  <strong className="font-medium text-neutral-700"> Nome, endereço, preço e ficha saem do cadastro</strong>, sem texto de venda por imóvel.
                </>
              )}
              {modo === "auto" ? " No automático, a IA só escolhe qual foto de cada imóvel entra." : ""}
            </p>
          )}

          {modo === "auto" && !ehVarios && !montando && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-[11px] leading-relaxed text-neutral-500">
              A IA lê as fotos e escreve os textos. <strong className="font-medium text-neutral-700">Ela não inventa característica:</strong> metragem,
              quartos, vagas, endereço, condomínio e preço saem só do cadastro do imóvel, e toda frase com número que não bate é descartada antes de entrar
              no book.
            </p>
          )}
        </Cartao>
      )}

      <div className="mt-6">
        {books === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : books.length === 0 && !precisaMigracao ? (
          <Cartao>
            <p className="font-medium">Nenhum material ainda.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Um book é o material do imóvel: capa, as fotos na ordem da visita, ficha técnica e a sua página de contato com QR.
              {comFotos.length === 0 ? (
                <> Antes disso, <Link href="/editar" className="text-marca-indigo underline">edite a primeira foto</Link> de um imóvel.</>
              ) : (
                " Clique em Criar material."
              )}
            </p>
          </Cartao>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <li key={b.id}>
                <Link href={`/editor/material/${b.id}`} className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-400">
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
