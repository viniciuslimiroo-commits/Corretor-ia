"use client";

import { Botao, Icone } from "@/components/ui";
import Pagina, { type DadosPagina } from "./pagina";

// A pré-visualização. Responde à única pergunta que o corretor tem antes de mandar:
// "vai ficar bom no celular do cliente?".
//
// É um MODO, não uma tela nova: o mesmo componente de página, sem as bordas de edição.
// Dois jeitos de olhar -- dentro de um telefone desenhado, e como folha impressa. Sai com
// Esc ou clicando em Voltar a editar; não há "salvar e sair" porque não há o que salvar.

export default function Previa({
  modo,
  paginas,
  titulo,
  aoTrocarModo,
  aoFechar,
}: {
  modo: "celular" | "impresso";
  paginas: DadosPagina[];
  titulo: string;
  aoTrocarModo: (m: "celular" | "impresso") => void;
  aoFechar: () => void;
}) {
  const celular = modo === "celular";
  // A folha dentro do telefone respeita a proporção real da página, seja A4, quadrada ou
  // deitada -- é o que a pessoa vai ver no WhatsApp.
  const larguraCelular = 300;
  const larguraImpresso = 380;

  return (
    <div className="flex h-screen flex-col bg-neutral-900">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-700 px-4 py-2.5 text-neutral-200">
        <span className="truncate text-sm font-semibold">{titulo}</span>
        <div className="ml-2 flex items-center gap-1 rounded-lg bg-neutral-800 p-0.5 text-xs">
          <button
            onClick={() => aoTrocarModo("celular")}
            className={"rounded px-2.5 py-1 " + (celular ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-300")}
          >
            No celular
          </button>
          <button
            onClick={() => aoTrocarModo("impresso")}
            className={"rounded px-2.5 py-1 " + (!celular ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-300")}
          >
            Impresso
          </button>
        </div>
        <span className="hidden text-xs text-neutral-400 sm:inline">{paginas.length} páginas</span>
        <div className="ml-auto">
          <Botao variante="secundaria" onClick={aoFechar} className="px-3 py-1.5 text-xs">
            <Icone nome="fechar" className="h-4 w-4" />
            Voltar a editar
          </Botao>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {celular ? (
          <div className="mx-auto w-fit rounded-[30px] border-[10px] border-neutral-700 bg-neutral-950 p-1 shadow-2xl">
            <div className="max-h-[calc(100vh-160px)] w-[300px] overflow-y-auto overflow-x-hidden rounded-[22px] bg-neutral-800">
              <div className="flex flex-col gap-2 p-2">
                {paginas.map((p, i) => (
                  <Pagina key={p.layout.id ?? i} dados={p} largura={larguraCelular - 16} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-fit flex-wrap justify-center gap-5">
            {paginas.map((p, i) => (
              <div key={p.layout.id ?? i} className="shadow-2xl">
                <Pagina dados={p} largura={larguraImpresso} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
