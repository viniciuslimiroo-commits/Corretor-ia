"use client";

import { useState } from "react";
import { Cartao, Icone } from "@/components/ui";
import { ETAPA_POR_ID, type EtapaId } from "@/lib/crm";
import { haQuanto, type Registro } from "./comum";

// O histórico como LINHA DO TEMPO: um ícone por tipo de coisa, o tempo relativo e o detalhe
// que importa (por onde a mensagem saiu, pra qual etapa foi). Nada de dado pessoal: o
// histórico guarda o que aconteceu, não o conteúdo.

const COMO: Record<string, { rotulo: string; icone: string; cor: string }> = {
  cadastrou: { rotulo: "Cadastrado", icone: "mais", cor: "bg-slate-100 text-slate-600" },
  declarou: { rotulo: "Contato confirmado (declaração)", icone: "check", cor: "bg-teal-100 text-teal-700" },
  preparou_mensagem: { rotulo: "Mensagem preparada", icone: "magica", cor: "bg-marca-pessego/60 text-marca-coral-escuro" },
  abriu_mensagem: { rotulo: "Mensagem enviada", icone: "compartilhar", cor: "bg-sky-100 text-sky-700" },
  respondeu: { rotulo: "Respondeu", icone: "check", cor: "bg-emerald-100 text-emerald-700" },
  mudou_etapa: { rotulo: "Mudou de etapa", icone: "seta_dir", cor: "bg-indigo-100 text-indigo-700" },
  editou: { rotulo: "Dados editados", icone: "editar_prompt", cor: "bg-neutral-100 text-neutral-600" },
  pediu_parar: { rotulo: "Pediu para parar", icone: "fechar", cor: "bg-red-100 text-red-700" },
  numero_errado: { rotulo: "Número errado", icone: "fechar", cor: "bg-orange-100 text-orange-700" },
  exportou: { rotulo: "Dados exportados", icone: "download", cor: "bg-neutral-100 text-neutral-600" },
};

function detalheDe(r: Registro): string {
  const d = r.detalhe ?? {};
  if (r.acao === "mudou_etapa" && typeof d.para === "string") return `para ${ETAPA_POR_ID[d.para as EtapaId]?.rotulo ?? d.para}`;
  if (r.acao === "abriu_mensagem") {
    const canal = d.canal === "copiar" ? "copiada" : d.canal === "compartilhar" ? "compartilhada" : "pela conversa";
    const links = typeof d.links === "number" && d.links > 0 ? ` · ${d.links} link${d.links > 1 ? "s" : ""}` : "";
    return `${d.primeiro ? "1ª mensagem · " : ""}${canal}${links}${d.reaberta ? " · de novo" : ""}`;
  }
  if (r.acao === "preparou_mensagem") return `${d.ia ? "com IA" : "sem IA"}${typeof d.materiais === "number" && d.materiais > 0 ? ` · ${d.materiais} ${d.materiais === 1 ? "material" : "materiais"}` : ""}`;
  return "";
}

export default function LinhaHistorico({ historico, agora }: { historico: Registro[]; agora: number }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? historico : historico.slice(0, 6);
  return (
    <Cartao className="surgir" style={{ animationDelay: "240ms" }}>
      <p className="font-semibold">Histórico</p>
      {historico.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nada ainda.</p>
      ) : (
        <ol className="relative mt-3">
          <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-neutral-200" />
          {lista.map((r, i) => {
            const c = COMO[r.acao] ?? { rotulo: r.acao, icone: "historico", cor: "bg-neutral-100 text-neutral-600" };
            const det = detalheDe(r);
            return (
              <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${c.cor}`}>
                  <Icone nome={c.icone} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 pt-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.rotulo}</span>
                    <span className="shrink-0 text-xs text-neutral-400" title={new Date(r.criado_em).toLocaleString("pt-BR")}>
                      {haQuanto(r.criado_em, agora)}
                    </span>
                  </span>
                  {det && <span className="block truncate text-xs text-neutral-500">{det}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {historico.length > 6 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-2 min-h-10 text-sm font-medium text-marca-indigo">
          {todos ? "Mostrar menos" : `Ver tudo (${historico.length})`}
        </button>
      )}
    </Cartao>
  );
}
