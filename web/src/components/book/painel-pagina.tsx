"use client";

import { useState } from "react";
import { definirLayout, definirTexto, duplicar, limiteDeImagens, podeRemover, remover, type DocumentoBook, type Pagina } from "@/lib/book-documento";
import type { LayoutFoto } from "@/lib/book-tipos";
import { Icone, Rotulo } from "@/components/ui";

// O painel da direita: a lista COMPLETA do que dá pra editar naquela página.
//
// A régua: se algo não está aqui, não é editável -- e isso é dito, não escondido. A
// unidade de edição é a página, nunca o elemento. Não existe fonte, cor de texto,
// alinhamento, camada nem caixa flutuante, e isso é decisão de produto: é o TEMPLATE que
// segura a estrutura, pra que alguém sem prática não consiga fazer material feio.

type Campo = { chave: string; rotulo: string; max: number; linhas?: number; dica?: string };

const CAMPOS: Record<string, Campo[]> = {
  capa: [
    { chave: "titulo", rotulo: "Título", max: 90 },
    { chave: "subtitulo", rotulo: "Subtítulo", max: 120, dica: "Endereço ou bairro" },
    { chave: "preco", rotulo: "Preço", max: 40, dica: "Escreva como quiser: “R$ 690.000”, “sob consulta”" },
    { chave: "descricao", rotulo: "Descrição", max: 400, linhas: 3 },
  ],
  foto: [
    { chave: "legenda", rotulo: "Legenda", max: 90, dica: "O ambiente. Em branco, a página sai sem legenda." },
    { chave: "legenda2", rotulo: "Legenda da segunda foto", max: 90 },
    { chave: "corpo", rotulo: "Texto ao lado", max: 600, linhas: 5 },
  ],
  planta: [{ chave: "legenda", rotulo: "Legenda", max: 90 }],
  texto: [
    { chave: "titulo", rotulo: "Título", max: 90 },
    { chave: "corpo", rotulo: "Texto", max: 1200, linhas: 8 },
  ],
  destaques: [
    { chave: "titulo", rotulo: "Título da 1ª lista", max: 40 },
    { chave: "corpo", rotulo: "O que o imóvel é", max: 400, linhas: 6, dica: "Uma por linha. Sai da ficha do imóvel." },
    { chave: "titulo2", rotulo: "Título da 2ª lista", max: 40 },
    { chave: "corpo2", rotulo: "O que ele tem a mais", max: 400, linhas: 5, dica: "Uma por linha. Sai dos ambientes que aparecem nas fotos. Vazio, a lista some." },
  ],
  localizacao: [
    { chave: "titulo", rotulo: "Título da página", max: 40 },
    { chave: "endereco", rotulo: "Endereço", max: 120, dica: "Vem do imóvel. Editar aqui vale só neste book." },
    { chave: "corpo", rotulo: "Observação", max: 220, linhas: 3, dica: "Opcional. Escreva só o que você sabe que é verdade." },
  ],
  imovel: [
    { chave: "titulo", rotulo: "Nome do imóvel", max: 90 },
    { chave: "endereco", rotulo: "Endereço", max: 120 },
    { chave: "preco", rotulo: "Preço", max: 40 },
    { chave: "ficha", rotulo: "Ficha curta", max: 90, dica: "Ex.: 96,5 m² · 3 dorms · 2 vagas" },
  ],
  grade: [
    { chave: "titulo", rotulo: "Título da página", max: 40 },
    { chave: "legenda1", rotulo: "Nome da 1ª foto", max: 60 },
    { chave: "legenda2", rotulo: "Nome da 2ª foto", max: 60 },
    { chave: "legenda3", rotulo: "Nome da 3ª foto", max: 60 },
    { chave: "legenda4", rotulo: "Nome da 4ª foto", max: 60 },
    { chave: "legenda5", rotulo: "Nome da 5ª foto", max: 60 },
    { chave: "legenda6", rotulo: "Nome da 6ª foto", max: 60 },
  ],
  numeros: [
    { chave: "titulo", rotulo: "Título da página", max: 40 },
    { chave: "corpo", rotulo: "Números", max: 400, linhas: 7, dica: "Um por linha, no formato “Rótulo: valor”. Sai da ficha do imóvel." },
    { chave: "nota", rotulo: "Observação", max: 400, linhas: 4, dica: "Opcional, abaixo dos números." },
  ],
  ficha: [{ chave: "titulo", rotulo: "Título da página", max: 60 }],
  contato: [{ chave: "chamada", rotulo: "Chamada", max: 60, dica: "“Vamos visitar?”, “Quer conhecer?”" }],
};

const NOME: Record<string, string> = { capa: "Capa", foto: "Foto", planta: "Planta", destaques: "Destaques", localizacao: "Localização", ficha: "Ficha técnica", texto: "Texto", contato: "Contato", imovel: "Imóvel", grade: "Grade de fotos", numeros: "Números" };

/**
 * Onde a IA pode escrever. Deliberadamente curto: subtítulo da capa é o endereço e preço é
 * preço -- campo que a IA não encosta é campo que ela não tem como inventar. O título da
 * capa entra porque ali ela só reescreve o nome que já está cadastrado, mais apresentável.
 */
const ESCREVE_IA: Record<string, string[]> = {
  capa: ["titulo", "descricao"],
  foto: ["legenda", "legenda2", "corpo"],
  planta: ["legenda"],
  texto: ["titulo", "corpo"],
  contato: ["chamada"],
  // Destaques e endereço NÃO entram: destaque é fato da ficha e endereço é endereço.
  // A IA escreve a lista na criação automática, onde o guarda de fatos confere cada item;
  // um botão solto aqui reabriria a porta sem a porteira.
  destaques: [],
  localizacao: [],
  // Página de imóvel do catálogo: tudo ali é dado do cadastro. Nenhum campo pra IA.
  imovel: [],
  // Grade é nome de imóvel; números é ficha. Nada aqui é língua, é dado.
  grade: [],
  numeros: [],
};

/** Os três templates de página de foto. Três, e só: mais que isso vira editor gráfico. */
const LAYOUTS: { id: LayoutFoto; rotulo: string; desenho: React.ReactNode }[] = [
  {
    id: "cheia",
    rotulo: "Uma foto",
    desenho: <span className="block h-full w-full rounded-[2px] bg-neutral-300" />,
  },
  {
    id: "duas",
    rotulo: "Duas fotos",
    desenho: (
      <span className="flex h-full w-full flex-col gap-[2px]">
        <span className="flex-1 rounded-[2px] bg-neutral-300" />
        <span className="flex-1 rounded-[2px] bg-neutral-300" />
      </span>
    ),
  },
  {
    id: "foto_texto",
    rotulo: "Foto e texto",
    desenho: (
      <span className="flex h-full w-full gap-[2px]">
        <span className="flex-[3] rounded-[2px] bg-neutral-300" />
        <span className="flex flex-[2] flex-col gap-[2px] pt-[1px]">
          <span className="h-[2px] rounded bg-neutral-300" />
          <span className="h-[2px] rounded bg-neutral-300" />
          <span className="h-[2px] w-2/3 rounded bg-neutral-300" />
        </span>
      </span>
    ),
  },
];

export default function PainelPagina({
  pagina,
  numero,
  documento,
  aoMudar,
  aoAbrirGaveta,
  aoIrPara,
  aoEscreverIA,
  aoBuscarMapa,
}: {
  pagina: Pagina;
  numero: number;
  documento: DocumentoBook;
  aoMudar: (fn: (d: DocumentoBook) => DocumentoBook) => void;
  aoAbrirGaveta: () => void;
  aoIrPara: (indice: number) => void;
  /** Devolve o texto escrito, ou lança com a mensagem que vai aparecer embaixo do campo. */
  aoEscreverIA?: (paginaId: string, campo: string) => Promise<string>;
  /** Busca o mapa do endereço cadastrado e devolve o jobId da imagem. */
  aoBuscarMapa?: (paginaId: string) => Promise<void>;
}) {
  const [escrevendo, setEscrevendo] = useState<string | null>(null);
  const [erroIA, setErroIA] = useState<{ campo: string; texto: string } | null>(null);
  const [buscandoMapa, setBuscandoMapa] = useState(false);
  const [erroMapa, setErroMapa] = useState<string | null>(null);

  async function buscarMapa() {
    if (!aoBuscarMapa || buscandoMapa) return;
    setBuscandoMapa(true);
    setErroMapa(null);
    try {
      await aoBuscarMapa(pagina.id);
    } catch (e) {
      setErroMapa(e instanceof Error ? e.message : "Não consegui buscar o mapa.");
    } finally {
      setBuscandoMapa(false);
    }
  }

  async function escrever(campo: string, max: number) {
    if (!aoEscreverIA || escrevendo) return;
    setEscrevendo(campo);
    setErroIA(null);
    try {
      const texto = await aoEscreverIA(pagina.id, campo);
      aoMudar((d) => definirTexto(d, pagina.id, campo, texto.slice(0, max)));
    } catch (e) {
      setErroIA({ campo, texto: e instanceof Error ? e.message : "Não consegui escrever agora." });
    } finally {
      setEscrevendo(null);
    }
  }

  const campos = (CAMPOS[pagina.tipo] ?? []).filter((c) => {
    if (c.chave === "legenda2") return pagina.layout === "duas";
    if (c.chave === "corpo" && pagina.tipo === "foto") return pagina.layout === "foto_texto";
    return true;
  });

  const faltamImagens = limiteDeImagens(pagina, documento.tipo) - pagina.imagens.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Rotulo>{pagina.tipo === "capa" ? "Capa" : `Página ${numero} · ${NOME[pagina.tipo] ?? pagina.tipo}`}</Rotulo>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => {
              aoMudar((d) => duplicar(d, pagina.id));
              aoIrPara(numero); // a cópia entra logo depois
            }}
            title="Duplicar página"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <Icone nome="lote" className="h-4 w-4" />
          </button>
          {podeRemover(pagina) && (
            <button
              onClick={() => aoMudar((d) => remover(d, pagina.id))}
              title="Tirar do book — a foto continua em Materiais"
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
            >
              <Icone nome="lixeira" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {pagina.tipo === "contato" && (
        <p className="-mt-2 text-xs text-neutral-500">
          Nome, CRECI, WhatsApp, logo e QR vêm de{" "}
          <a href="/marca" className="text-marca-indigo underline">Minha marca</a>. Esta página não sai do book.
        </p>
      )}
      {pagina.tipo === "ficha" && <p className="-mt-2 text-xs text-neutral-500">Os dados vêm do imóvel. Editar lá vale para todos os materiais dele.</p>}
      {pagina.tipo === "destaques" && (
        <p className="-mt-2 text-xs text-neutral-500">
          A 1ª lista sai da ficha do imóvel, a 2ª dos ambientes que aparecem nas fotos. A IA arruma a frase, não inventa fato.
        </p>
      )}
      {pagina.tipo === "numeros" && (
        <p className="-mt-2 text-xs text-neutral-500">Um por linha, “Rótulo: valor”. Saem da ficha do imóvel — editar aqui vale só neste material.</p>
      )}
      {pagina.tipo === "grade" && (
        <p className="-mt-2 text-xs text-neutral-500">Seis fotos por página. O nome embaixo de cada uma é o do imóvel de onde ela veio.</p>
      )}
      {pagina.tipo === "imovel" && (
        <p className="-mt-2 text-xs text-neutral-500">Tudo aqui vem do cadastro do imóvel. Editar nesta página vale só neste catálogo.</p>
      )}
      {pagina.tipo === "localizacao" && (
        <div className="-mt-2">
          <p className="text-xs text-neutral-500">Sem mapa, sai o QR do imóvel. Você também pode arrastar um print de Materiais pra cá.</p>
          {aoBuscarMapa && pagina.imagens.length === 0 && (
            <button
              onClick={buscarMapa}
              disabled={buscandoMapa}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-xs text-neutral-700 transition hover:border-marca-coral disabled:opacity-50"
            >
              <Icone nome="imoveis" className="h-3.5 w-3.5" />
              {buscandoMapa ? "Buscando…" : "Buscar o mapa do endereço"}
            </button>
          )}
          {erroMapa && <p className="mt-1 text-[11px] text-amber-600">{erroMapa}</p>}
        </div>
      )}

      {/* ---- template da página ---- */}
      {pagina.tipo === "foto" && (
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Formato da página</span>
          <div className="grid grid-cols-3 gap-1.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => aoMudar((d) => definirLayout(d, pagina.id, l.id))}
                title={l.rotulo}
                className={
                  "rounded-md border p-1 transition " +
                  ((pagina.layout ?? "cheia") === l.id ? "border-marca-coral bg-marca-pessego/40" : "border-neutral-200 hover:border-neutral-400")
                }
              >
                <span className="block h-9 w-full p-[3px]">{l.desenho}</span>
                <span className="mt-0.5 block text-[9px] leading-tight text-neutral-500">{l.rotulo}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- imagens da página ---- */}
      {limiteDeImagens(pagina, documento.tipo) > 0 && (
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {limiteDeImagens(pagina, documento.tipo) === 1 ? "Imagem" : "Imagens"}
          </span>
          <button
            onClick={aoAbrirGaveta}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-xs text-neutral-700 hover:border-marca-coral"
          >
            <Icone nome="foto" className="h-3.5 w-3.5" />
            {faltamImagens > 0 ? `Adicionar ${faltamImagens === 1 ? "imagem" : `${faltamImagens} imagens`}` : "Trocar imagem"}
          </button>
          <span className="mt-1 block text-[11px] text-neutral-400">
            Na página, arraste a foto dentro do quadro pra escolher o que aparece.
          </span>
        </div>
      )}

      {/* ---- textos ---- */}
      {campos.map((campo) => (
        <label key={campo.chave} className="block text-sm">
          <span className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{campo.rotulo}</span>
            {aoEscreverIA && (ESCREVE_IA[pagina.tipo] ?? []).includes(campo.chave) && (
              <button
                type="button"
                onClick={() => escrever(campo.chave, campo.max)}
                disabled={!!escrevendo}
                title={pagina.textos[campo.chave]?.trim() ? "Reescrever com IA — dá pra desfazer" : "Escrever com IA — dá pra desfazer"}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-marca-indigo transition hover:bg-marca-pessego/50 disabled:opacity-40"
              >
                {escrevendo === campo.chave ? "escrevendo…" : pagina.textos[campo.chave]?.trim() ? "Reescrever" : "Escrever com IA"}
              </button>
            )}
          </span>
          {campo.linhas ? (
            <textarea
              value={pagina.textos[campo.chave] ?? ""}
              onChange={(e) => aoMudar((d) => definirTexto(d, pagina.id, campo.chave, e.target.value.slice(0, campo.max)))}
              rows={campo.linhas}
              maxLength={campo.max}
              className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
            />
          ) : (
            <input
              value={pagina.textos[campo.chave] ?? ""}
              onChange={(e) => aoMudar((d) => definirTexto(d, pagina.id, campo.chave, e.target.value.slice(0, campo.max)))}
              maxLength={campo.max}
              className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
            />
          )}
          {erroIA?.campo === campo.chave && <span className="mt-0.5 block text-[11px] text-amber-600">{erroIA.texto}</span>}
          {campo.dica && <span className="mt-0.5 block text-[11px] text-neutral-400">{campo.dica}</span>}
          {/* O contador só aparece perto do limite: antes disso é ruído. */}
          {(pagina.textos[campo.chave]?.length ?? 0) > campo.max * 0.8 && (
            <span className="mt-0.5 block text-[11px] text-amber-600">
              {pagina.textos[campo.chave]?.length ?? 0} de {campo.max}
            </span>
          )}
        </label>
      ))}

      <p className="mt-1 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
        A tipografia, as margens e as cores são do modelo, iguais em todos os books. É o que faz o material parecer feito por agência.
      </p>
      <span className="sr-only">{documento.paginas.length} páginas</span>
    </div>
  );
}
