"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import { useBook } from "@/lib/use-book";
import { Aviso, Botao, Icone } from "@/components/ui";
import Pagina, { type DadosPagina } from "@/components/book/pagina";
import PainelPagina from "@/components/book/painel-pagina";
import GavetaMidia from "@/components/book/gaveta-midia";
import Previa from "@/components/book/previa";
import type { ContextoLayout } from "@/lib/book-layout";
import {
  definirFoco,
  imagensDoDocumento,
  inserir,
  mover,
  paginaVazia,
  podeRemover,
  porImagem,
  remover,
  type DocumentoBook,
} from "@/lib/book-documento";

// O editor do book. Três faixas: páginas à esquerda, a página no meio, o que dá pra mexer
// nela à direita -- e nada mais.
//
// O que ele NÃO é, de propósito: não há tela em branco, caixa de texto solta, seletor de
// fonte, roda de cores, camada, régua nem alinhamento. O TEMPLATE segura a estrutura, e é
// isso que impede alguém sem prática de fazer material feio. Construir Canva aqui dentro
// multiplicaria a complexidade sem melhorar um book.

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

type Relatorio = { fotosVistas: number; fotosNoBook: number; textosPorIA: boolean; reprovados: string[] };

type Carga = {
  book: Book;
  documento: DocumentoBook;
  urls: Record<string, string>;
  logo: string | null;
  ctx: ContextoLayout;
  qrs: Record<string, string>;
};

const LARGURA_BASE = 520;
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.6];

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

  return <Editor carga={carga} token={token} aoSair={() => router.push("/books")} />;
}

// Separado porque o hook do book precisa dos dados carregados -- e hook não pode ficar
// atrás de `if`.
function Editor({ carga, token, aoSair }: { carga: Carga; token: () => Promise<string>; aoSair: () => void }) {
  const [atual, setAtual] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [gaveta, setGaveta] = useState<{ modo: "trocar" | "adicionar"; indice?: number } | null>(null);
  const [previa, setPrevia] = useState<"celular" | "impresso" | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ texto: string; comDesfazer: boolean } | null>(null);
  const [menuBaixar, setMenuBaixar] = useState(false);
  const [exportando, setExportando] = useState<"leve" | "alta" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [ligandoLink, setLigandoLink] = useState(false);
  const [painelCelular, setPainelCelular] = useState(false);
  const [menuMais, setMenuMais] = useState(false);
  // Recado de uma vez só, deixado pela tela de criação quando o book saiu no automático.
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const centro = useRef<HTMLDivElement | null>(null);
  // No celular a página acompanha a largura da tela; no computador vale o zoom da barra.
  const [larguraTela, setLarguraTela] = useState(1200);
  useEffect(() => {
    // clientWidth, não innerWidth: innerWidth cresce junto com a página quando algo
    // estoura pra fora da tela, e aí a conta de largura se retroalimenta.
    const medir = () => setLarguraTela(document.documentElement.clientWidth || window.innerWidth);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const larguraPagina = larguraTela < 1024 ? Math.min(LARGURA_BASE, larguraTela - 48) : LARGURA_BASE * zoom;

  useEffect(() => {
    const chave = `book:${carga.book.id}:relatorio`;
    try {
      const cru = sessionStorage.getItem(chave);
      if (!cru) return;
      sessionStorage.removeItem(chave);
      setRelatorio(JSON.parse(cru) as Relatorio);
    } catch {}
  }, [carga.book.id]);

  const book = useBook({
    id: carga.book.id,
    inicial: carga.documento,
    ctx: carga.ctx,
    qrs: carga.qrs,
    versaoInicial: carga.book.versao,
    token,
  });

  const indice = Math.min(atual, book.documento.paginas.length - 1);
  const paginaAtual = book.documento.paginas[indice];

  const irPara = useCallback(
    (i: number) => {
      const destino = Math.max(0, Math.min(book.documento.paginas.length - 1, i));
      setAtual(destino);
      centro.current?.querySelector(`[data-pagina="${destino}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [book.documento.paginas.length]
  );

  /**
   * Aviso curto no rodapé. Com desfazer quando a ação MUDA o book (no lugar de um modal
   * de confirmação); sem, quando só informa -- oferecer "desfazer" depois de baixar um
   * arquivo é prometer algo que não existe.
   */
  const avisar = useCallback((texto: string, comDesfazer = false) => {
    setRecado({ texto, comDesfazer });
    setTimeout(() => setRecado(null), 8000);
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvoTecla = e.target as HTMLElement | null;
      const digitando = alvoTecla && (alvoTecla.tagName === "INPUT" || alvoTecla.tagName === "TEXTAREA");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) book.refazer();
        else book.desfazer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        book.refazer();
        return;
      }
      if (digitando) return;
      if (e.key === "Escape") {
        if (previa) setPrevia(null);
        else if (gaveta) setGaveta(null);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") irPara(indice + 1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") irPara(indice - 1);
      if (e.key === "Delete" && paginaAtual && podeRemover(paginaAtual)) {
        book.aplicar((d) => remover(d, paginaAtual.id));
        avisar("Página removida do book. A foto continua em Materiais.", true);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, irPara, book, paginaAtual, previa, gaveta, avisar]);

  /**
   * Gera e baixa o PDF. Salva o que estiver pendente antes: o arquivo tem que sair com o
   * que está na tela, não com a versão de oito segundos atrás.
   *
   * `paraWhatsApp` abre a conversa com o texto pronto depois de baixar. O navegador não
   * anexa arquivo por conta própria -- por isso o aviso diz pra anexar, em vez de fingir
   * que já foi.
   */
  async function baixar(qualidade: "leve" | "alta", paraWhatsApp = false) {
    setMenuBaixar(false);
    setExportando(qualidade);
    setErro(null);
    book.salvarAgora();
    try {
      const r = await fetch(`/api/books/${carga.book.id}/exportar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ qualidade }),
      });
      if (!r.ok) {
        const texto = await r.text();
        let d: { error?: string } = {};
        try {
          if (texto) d = JSON.parse(texto);
        } catch {
          d = { error: `O servidor respondeu ${r.status}.` };
        }
        throw new Error(d.error ?? "Não consegui gerar o PDF.");
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "book.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
      const mb = (blob.size / 1024 / 1024).toFixed(1).replace(".", ",");
      if (paraWhatsApp) {
        const texto = `Olha o material de ${carga.book.titulo ?? "este imóvel"}:`;
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
        avisar(`PDF de ${mb} MB baixado. Anexe na conversa que abriu.`);
      } else {
        avisar(`PDF de ${mb} MB baixado.`);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar o PDF.");
    } finally {
      setExportando(null);
    }
  }

  /**
   * Publica o book como página e copia o endereço. Um segundo clique copia de novo, em
   * vez de desligar -- desligar por engano quebraria o link que a pessoa já mandou. Quem
   * quiser desligar usa o "desligar" que aparece no aviso.
   */
  async function alternarLink(ligar = true) {
    setLigandoLink(true);
    setErro(null);
    try {
      const r = await fetch(`/api/books/${carga.book.id}/compartilhar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ ligar }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setLink(d.url ?? null);
      if (d.url) {
        await navigator.clipboard.writeText(d.url).catch(() => {});
        avisar("Link copiado. Quem tiver o link vê este book.");
      } else {
        avisar("Link desligado. Quem já tinha o endereço não vê mais.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar o link.");
    } finally {
      setLigandoLink(false);
    }
  }

  /**
   * Escreve um campo com IA. O texto entra pelo mesmo caminho de uma digitação -- vira
   * uma alteração normal do documento, então o Ctrl+Z desfaz e o autosave grava sozinho.
   * Sem crédito: a listagem de books promete que não gasta.
   */
  async function escreverComIA(paginaId: string, campo: string): Promise<string> {
    const r = await fetch(`/api/books/${carga.book.id}/textos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ paginaId, campo }),
    });
    const bruto = await r.text();
    let d: { texto?: string; error?: string } = {};
    try {
      d = JSON.parse(bruto);
    } catch {
      throw new Error("Resposta inesperada do servidor.");
    }
    if (!r.ok || !d.texto) throw new Error(d.error ?? "Não consegui escrever agora.");
    return d.texto;
  }

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
  const usadas = imagensDoDocumento(book.documento);

  function escolherDaGaveta(jobId: string) {
    if (!gaveta) return;
    if (gaveta.modo === "adicionar") {
      const nova = paginaVazia("foto");
      nova.imagens = [jobId];
      book.aplicar((d) => inserir(d, nova, paginaAtual?.id));
      irPara(indice + 1);
    } else {
      book.aplicar((d) => porImagem(d, paginaAtual.id, jobId, gaveta.indice));
    }
    setGaveta(null);
  }

  // ---------- prévia ----------
  if (previa) {
    return (
      <Previa
        modo={previa}
        paginas={book.layout.map((_, i) => dados(i))}
        aoTrocarModo={setPrevia}
        aoFechar={() => setPrevia(null)}
        titulo={carga.book.titulo ?? "Book"}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-200 bg-white px-4 py-2.5">
        <Link href="/books" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-marca-indigo">
          <Icone nome="cima" className="h-4 w-4 -rotate-90" />
          Books
        </Link>
        <span className="min-w-0 truncate text-sm font-semibold">{carga.book.titulo ?? "Book"}</span>
        <span className="hidden text-xs text-neutral-400 lg:inline">{carga.book.rotuloTipo} · {book.documento.paginas.length} páginas</span>
        <span className={"text-xs " + (book.estado === "falhou" || book.estado === "conflito" ? "font-medium text-amber-600" : "text-neutral-400")}>
          · {RECADO[book.estado]}
          {book.estado === "falhou" && <button onClick={book.salvarAgora} className="ml-1 underline">tentar agora</button>}
          {book.estado === "conflito" && <button onClick={() => window.location.reload()} className="ml-1 underline">recarregar</button>}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={book.desfazer}
            disabled={!book.podeDesfazer}
            title="Desfazer (Ctrl+Z)"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
          >
            <Icone nome="cima" className="h-4 w-4 -rotate-90" />
          </button>
          <button
            onClick={book.refazer}
            disabled={!book.podeRefazer}
            title="Refazer (Ctrl+Shift+Z)"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
          >
            <Icone nome="cima" className="h-4 w-4 rotate-90" />
          </button>

          {/* Zoom só no computador: no celular a página já vem na largura da tela. */}
          <span className="mx-1 hidden items-center gap-1 rounded-lg border border-neutral-200 px-1 lg:flex">
            <button
              onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)] ?? 0.6)}
              disabled={zoom === ZOOMS[0]}
              title="Diminuir"
              className="px-1.5 py-1 text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-9 text-center text-[11px] tabular-nums text-neutral-500">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)] ?? 1.6)}
              disabled={zoom === ZOOMS[ZOOMS.length - 1]}
              title="Aumentar"
              className="px-1.5 py-1 text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-30"
            >
              +
            </button>
          </span>

          <Botao variante="secundaria" onClick={() => setPrevia("celular")} className="px-2.5 py-1.5 text-xs lg:px-3" title="Pré-visualizar">
            <Icone nome="olho" className="h-4 w-4" />
            <span className="hidden lg:inline">Pré-visualizar</span>
          </Botao>

          {/* Baixar / link / apagar: no computador ficam à mostra; no celular vão pro "⋯",
              senão a barra passa da largura da tela e o editor nasce torto. */}
          <span className="relative hidden items-center gap-1.5 lg:flex">
            <span className="relative">
              <Botao variante="secundaria" onClick={() => setMenuBaixar((v) => !v)} disabled={!!exportando} className="px-3 py-1.5 text-xs">
                <Icone nome="download" className="h-4 w-4" />
                {exportando === "alta" ? "Gerando…" : "Baixar"}
              </Botao>
              {menuBaixar && (
                <span className="absolute top-full right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                  <button onClick={() => baixar("leve")} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-50">
                    <strong className="block text-sm font-medium">Para WhatsApp</strong>
                    <span className="text-neutral-500">Leve, abre rápido no celular</span>
                  </button>
                  <button onClick={() => baixar("alta")} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-50">
                    <strong className="block text-sm font-medium">Para imprimir</strong>
                    <span className="text-neutral-500">300 dpi · arquivo maior e mais lento</span>
                  </button>
                </span>
              )}
            </span>

            <Botao variante="secundaria" onClick={() => alternarLink(true)} disabled={ligandoLink} className="px-3 py-1.5 text-xs" title={link ? "Link ativo — clique para copiar de novo" : "Publicar como página e copiar o link"}>
              <Icone nome="link" className="h-4 w-4" />
              {ligandoLink ? "…" : link ? "Link" : "Criar link"}
            </Botao>
          </span>

          <Botao onClick={() => baixar("leve", true)} disabled={!!exportando} className="px-2.5 py-1.5 text-xs lg:px-3">
            <Icone nome="whatsapp" className="h-4 w-4" />
            {exportando === "leve" ? "Gerando…" : "Mandar"}
          </Botao>

          <span className="hidden lg:block">
            <Botao variante="perigo" onClick={apagar} disabled={apagando} className="px-2 py-1 text-xs">
              <Icone nome="lixeira" className="h-4 w-4" />
              Apagar
            </Botao>
          </span>

          {/* ⋯ do celular */}
          <span className="relative lg:hidden">
            <button
              onClick={() => setMenuMais((v) => !v)}
              className="rounded-lg px-2 py-1.5 text-lg leading-none text-neutral-500 hover:bg-neutral-100"
              aria-label="Mais opções"
            >
              ⋯
            </button>
            {menuMais && (
              <>
                <span className="fixed inset-0 z-30" onClick={() => setMenuMais(false)} />
                <span className="absolute top-full right-0 z-40 mt-1 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                  <button onClick={() => { setMenuMais(false); baixar("leve"); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-50">
                    <strong className="block text-sm font-medium">Baixar para WhatsApp</strong>
                    <span className="text-neutral-500">Leve, abre rápido no celular</span>
                  </button>
                  <button onClick={() => { setMenuMais(false); baixar("alta"); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-50">
                    <strong className="block text-sm font-medium">Baixar para imprimir</strong>
                    <span className="text-neutral-500">300 dpi · arquivo maior e mais lento</span>
                  </button>
                  <button onClick={() => { setMenuMais(false); alternarLink(true); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-50">
                    <strong className="block text-sm font-medium">{link ? "Copiar o link de novo" : "Criar link da página"}</strong>
                    <span className="text-neutral-500">Abre no celular, sem baixar nada</span>
                  </button>
                  <button onClick={() => { setMenuMais(false); apagar(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                    Apagar book
                  </button>
                </span>
              </>
            )}
          </span>
        </div>
      </header>

      {(erro || book.erro) && (
        <div className="px-4 pt-3">
          <Aviso tipo="erro">{erro ?? book.erro}</Aviso>
        </div>
      )}

      {/* Montado sozinho: diz o que foi feito -- e, principalmente, o que foi BARRADO.
          Mostrar a frase que a IA tentou e não passou é o que torna a regra verificável
          por quem assina o material, em vez de uma promessa na tela de criação. */}
      {relatorio && (
        <div className="px-4 pt-3">
          <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <Icone nome="magica" className="mt-0.5 h-4 w-4 shrink-0 text-marca-indigo" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                Book montado sozinho · {relatorio.fotosNoBook} {relatorio.fotosNoBook === 1 ? "foto" : "fotos"} na ordem da visita
                {relatorio.textosPorIA ? ", textos escritos pela IA" : ""}
              </p>
              {relatorio.reprovados.length > 0 ? (
                <p className="mt-1 text-xs text-neutral-600">
                  Descartei {relatorio.reprovados.length} {relatorio.reprovados.length === 1 ? "frase" : "frases"} que afirmavam coisa fora do cadastro:{" "}
                  <span className="text-neutral-500">{relatorio.reprovados.join(" · ")}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">Números e endereço saíram do cadastro do imóvel. Confira e ajuste o que quiser.</p>
              )}
            </div>
            <button onClick={() => setRelatorio(null)} className="shrink-0 rounded p-1 text-neutral-400 hover:text-neutral-700" aria-label="Fechar">
              <Icone nome="fechar" className="h-4 w-4" />
            </button>
          </div>
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
        {/* ---- faixa de páginas, com arrastar ---- */}
        {/* No celular a faixa de páginas some: o corretor rola as páginas na coluna do
            meio e mexe na selecionada pela gaveta de baixo. Arrastar miniatura de 96px num
            dedo não funciona, e fingir que funciona é pior do que assumir a divisão. */}
        <nav className="hidden w-[116px] shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-2 lg:block">
          <ul className="flex flex-col gap-1">
            {book.documento.paginas.map((p, i) => (
              <li
                key={p.id}
                draggable
                onDragStart={(e) => {
                  setArrastando(p.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/encena-pagina", p.id);
                }}
                onDragEnd={() => {
                  setArrastando(null);
                  setAlvo(null);
                }}
                onDragOver={(e) => {
                  if (!arrastando || arrastando === p.id) return;
                  e.preventDefault();
                  setAlvo(p.id);
                }}
                onDragLeave={() => setAlvo((a) => (a === p.id ? null : a))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!arrastando || arrastando === p.id) return;
                  const destino = book.documento.paginas.findIndex((x) => x.id === p.id);
                  const movida = arrastando;
                  book.aplicar((d) => mover(d, movida, destino));
                  setArrastando(null);
                  setAlvo(null);
                  setAtual(destino);
                }}
                className={
                  "group relative rounded transition " +
                  (alvo === p.id ? "ring-2 ring-marca-coral ring-offset-1 " : "") +
                  (arrastando === p.id ? "opacity-40 " : "")
                }
              >
                <button
                  onClick={() => irPara(i)}
                  className={
                    "block w-full cursor-grab overflow-hidden rounded border-2 bg-white transition active:cursor-grabbing " +
                    (i === indice ? "border-marca-coral" : "border-neutral-200 hover:border-neutral-400")
                  }
                  title={`Página ${i + 1} — arraste para reordenar`}
                >
                  {book.layout[i] && <Pagina dados={dados(i)} largura={96} />}
                </button>
                <span className="block text-center text-[10px] text-neutral-400">{i === 0 ? "capa" : i + 1}</span>
              </li>
            ))}
            <li>
              <button
                onClick={() => setGaveta({ modo: "adicionar" })}
                className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-neutral-300 py-3 text-[11px] text-neutral-500 hover:border-marca-coral hover:text-marca-indigo"
              >
                <Icone nome="mais" className="h-3.5 w-3.5" />
                página
              </button>
            </li>
          </ul>
        </nav>

        {/* ---- as páginas ---- */}
        <div ref={centro} className="flex-1 overflow-auto p-4 pb-24 sm:p-6 lg:pb-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {book.documento.paginas.map((p, i) =>
              book.layout[i] ? (
                <div
                  key={p.id}
                  data-pagina={i}
                  onClick={() => setAtual(i)}
                  className={"shadow-lg ring-1 transition " + (i === indice ? "ring-2 ring-marca-coral" : "cursor-pointer ring-black/5")}
                >
                  <Pagina
                    dados={dados(i)}
                    largura={larguraPagina}
                    interacao={
                      i === indice
                        ? {
                            aoSoltar: (jobId, idx) => book.aplicar((d) => porImagem(d, p.id, jobId, idx)),
                            aoMoverFoco: (jobId, dx, dy) =>
                              book.aplicar((d) => {
                                const f = d.paginas.find((x) => x.id === p.id)?.foco?.[jobId] ?? { x: 0, y: 0 };
                                return definirFoco(d, p.id, jobId, f.x - dx, f.y - dy);
                              }),
                            aoClicarImagem: (_jobId, idx) => setGaveta({ modo: "trocar", indice: idx }),
                          }
                        : undefined
                    }
                  />
                </div>
              ) : null
            )}
            <p className="w-full max-w-[520px] pb-10 text-center text-xs text-neutral-500">
              Arraste as páginas pra reordenar, clique numa foto pra trocar, arraste a foto dentro do quadro pra enquadrar. Tudo salva sozinho.
            </p>
          </div>
        </div>

        {/* ---- painel da página ---- */}
        <aside className="hidden w-[236px] shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-3 lg:block">
          {paginaAtual && (
            <PainelPagina
              pagina={paginaAtual}
              numero={indice + 1}
              documento={book.documento}
              aoMudar={book.aplicar}
              aoAbrirGaveta={() => setGaveta({ modo: "trocar" })}
              aoIrPara={irPara}
              aoEscreverIA={escreverComIA}
            />
          )}
        </aside>

        {/* ---- gaveta da Biblioteca ---- */}
        <GavetaMidia
          aberta={!!gaveta}
          aoFechar={() => setGaveta(null)}
          token={token}
          imovelId={carga.book.imovel?.id ?? null}
          jaNoBook={usadas}
          aoEscolher={escolherDaGaveta}
          titulo={gaveta?.modo === "adicionar" ? "Adicionar página" : "Trocar a foto"}
        />
      </div>

      {/* ---- no celular: gaveta de baixo com o painel da página selecionada ---- */}
      {paginaAtual && (
        <div className="lg:hidden">
          {painelCelular ? (
            <div className="fixed inset-x-0 bottom-0 z-30 max-h-[62vh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white p-4 shadow-2xl">
              <button onClick={() => setPainelCelular(false)} className="mb-2 ml-auto block rounded p-1 text-neutral-400" aria-label="Fechar">
                <Icone nome="fechar" className="h-4 w-4" />
              </button>
              <PainelPagina
                pagina={paginaAtual}
                numero={indice + 1}
                documento={book.documento}
                aoMudar={book.aplicar}
                aoAbrirGaveta={() => {
                  setPainelCelular(false);
                  setGaveta({ modo: "trocar" });
                }}
                aoIrPara={irPara}
                aoEscreverIA={escreverComIA}
              />
            </div>
          ) : (
            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-neutral-200 bg-white px-3 py-2">
              <button onClick={() => irPara(indice - 1)} disabled={indice === 0} className="rounded-lg p-2 text-neutral-500 disabled:opacity-30" aria-label="Anterior">
                <Icone nome="cima" className="h-5 w-5 -rotate-90" />
              </button>
              <span className="text-xs text-neutral-500">
                {indice === 0 ? "capa" : `${indice + 1} de ${book.documento.paginas.length}`}
              </span>
              <button
                onClick={() => irPara(indice + 1)}
                disabled={indice === book.documento.paginas.length - 1}
                className="rounded-lg p-2 text-neutral-500 disabled:opacity-30"
                aria-label="Próxima"
              >
                <Icone nome="baixo" className="h-5 w-5 -rotate-90" />
              </button>
              <Botao onClick={() => setPainelCelular(true)} className="ml-auto px-3 py-1.5 text-xs">
                Editar esta página
              </Botao>
            </div>
          )}
        </div>
      )}

      {/* aviso curto no lugar de modal: some sozinho e tem desfazer */}
      {recado && (
        <div className="pointer-events-auto fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
          {recado.texto}
          {recado.comDesfazer && (
            <button onClick={() => { book.desfazer(); setRecado(null); }} className="font-semibold underline">
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
