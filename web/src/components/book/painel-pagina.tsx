"use client";

import { definirTexto, imagensDoDocumento, type DocumentoBook, type Pagina } from "@/lib/book-documento";
import { Rotulo } from "@/components/ui";

// O painel da direita: a lista COMPLETA do que dá pra editar naquela página.
//
// A régua é essa: se algo não está aqui, não é editável -- e isso é dito, não escondido.
// Nunca mais de quatro controles. É o que separa este editor de um Canva menor: a unidade
// de edição é a página, nunca o elemento, e não existe fonte, cor de texto, alinhamento,
// camada nem caixa flutuante.

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
  ],
  planta: [{ chave: "legenda", rotulo: "Legenda", max: 90 }],
  texto: [
    { chave: "titulo", rotulo: "Título", max: 90 },
    { chave: "corpo", rotulo: "Texto", max: 1200, linhas: 8 },
  ],
  ficha: [{ chave: "titulo", rotulo: "Título da página", max: 60 }],
  contato: [{ chave: "chamada", rotulo: "Chamada", max: 60, dica: "“Vamos visitar?”, “Quer conhecer?”" }],
};

const NOME: Record<string, string> = {
  capa: "Capa",
  foto: "Foto",
  planta: "Planta",
  ficha: "Ficha técnica",
  texto: "Texto",
  contato: "Contato",
};

export default function PainelPagina({
  pagina,
  numero,
  documento,
  urls,
  aoMudar,
  aoEscolherCapa,
}: {
  pagina: Pagina;
  numero: number;
  documento: DocumentoBook;
  urls: Record<string, string>;
  aoMudar: (fn: (d: DocumentoBook) => DocumentoBook) => void;
  aoEscolherCapa: (jobId: string) => void;
}) {
  const campos = (CAMPOS[pagina.tipo] ?? []).filter((c) => {
    // A segunda legenda só aparece quando existe uma segunda foto.
    if (c.chave === "legenda2") return pagina.imagens.length > 1;
    return true;
  });

  const capaAtual = documento.paginas.find((p) => p.tipo === "capa")?.imagens[0];
  const outras = imagensDoDocumento(documento).filter((x) => x !== capaAtual);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Rotulo>{pagina.tipo === "capa" ? "Capa" : `Página ${numero} · ${NOME[pagina.tipo] ?? pagina.tipo}`}</Rotulo>
        {pagina.tipo === "contato" && (
          <p className="-mt-1 text-xs text-neutral-500">
            Nome, CRECI, WhatsApp, logo e QR vêm de{" "}
            <a href="/configuracoes" className="text-marca-indigo underline">Minha marca</a>. Esta página não pode ser removida.
          </p>
        )}
        {pagina.tipo === "ficha" && (
          <p className="-mt-1 text-xs text-neutral-500">Os dados vêm do imóvel. Editar lá vale para todos os materiais dele.</p>
        )}
      </div>

      {campos.map((campo) => (
        <label key={campo.chave} className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{campo.rotulo}</span>
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
          {campo.dica && <span className="mt-0.5 block text-[11px] text-neutral-400">{campo.dica}</span>}
          {/* O contador só aparece perto do limite: antes disso é ruído. */}
          {(pagina.textos[campo.chave]?.length ?? 0) > campo.max * 0.8 && (
            <span className="mt-0.5 block text-[11px] text-amber-600">
              {pagina.textos[campo.chave]?.length ?? 0} de {campo.max}
            </span>
          )}
        </label>
      ))}

      {pagina.tipo === "capa" && outras.length > 0 && (
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Trocar a capa</span>
          <ul className="grid grid-cols-3 gap-1.5">
            {outras.slice(0, 12).map((jobId) => (
              <li key={jobId}>
                <button
                  onClick={() => aoEscolherCapa(jobId)}
                  className="block w-full overflow-hidden rounded border border-neutral-200 transition hover:border-marca-coral"
                  title="Usar como capa"
                >
                  {urls[jobId] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[jobId]} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="block aspect-square w-full bg-neutral-100" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <span className="mt-1 block text-[11px] text-neutral-400">A foto que sair da capa volta pro lugar da que entrou.</span>
        </div>
      )}

      {pagina.tipo === "foto" && (
        <p className="text-[11px] text-neutral-400">Trocar a foto e ajustar o enquadramento chegam no próximo passo.</p>
      )}
    </div>
  );
}
