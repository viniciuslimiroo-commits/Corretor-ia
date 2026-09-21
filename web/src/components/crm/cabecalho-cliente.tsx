"use client";

import { Icone } from "@/components/ui";
import { ETAPA_POR_ID, ORIGEM_POR_ID, telefoneLegivel, LIMITES_CRM } from "@/lib/crm";
import { COR_ETAPA, diaCurto, haQuanto, hojeEmBrasilia, iniciais, type LeadPainel } from "./comum";

// O TOPO do painel: quem é a pessoa, em que pé está e os números que o corretor olha
// primeiro. Fundo azul da marca com um brilho coral que respira -- é o que tira a tela
// da cara de "formulário de cadastro" sem pesar (é CSS, não imagem).

export default function CabecalhoCliente({ lead, imovel, corretor, agora, aoEditar }: { lead: LeadPainel; imovel: string | null; corretor: string | null; agora: number; aoEditar?: () => void }) {
  const etapa = ETAPA_POR_ID[lead.etapa];
  const cor = COR_ETAPA[lead.etapa];
  const hoje = hojeEmBrasilia(agora);
  const retornoVencido = !!lead.proximo_contato_em && lead.proximo_contato_em <= hoje;
  const numeros = [
    { rotulo: "Cliente desde", valor: new Date(lead.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) },
    { rotulo: "Última mensagem", valor: lead.ultimo_envio_em ? haQuanto(lead.ultimo_envio_em, agora) : "ainda não" },
    { rotulo: "Próximo retorno", valor: lead.proximo_contato_em ? (lead.proximo_contato_em === hoje ? "hoje" : diaCurto(lead.proximo_contato_em)) : "—", destaque: retornoVencido },
    { rotulo: "Sem resposta", valor: `${lead.tentativas_sem_resposta} de ${LIMITES_CRM.tentativasSemResposta}`, destaque: lead.tentativas_sem_resposta >= LIMITES_CRM.tentativasSemResposta },
  ];

  return (
    <section className="surgir relative overflow-hidden rounded-3xl bg-marca-indigo px-5 pt-6 pb-5 text-white shadow-lg sm:px-8 sm:pt-8">
      {/* O brilho: dois círculos borrados, um coral e um pêssego, atrás de tudo. */}
      <span aria-hidden className="respirar pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-marca-coral blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-marca-pessego/30 blur-3xl" />

      <div className="relative flex items-start gap-4 sm:gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-marca-coral to-marca-pessego text-2xl font-semibold text-marca-indigo shadow-md ring-4 ring-white/15 sm:h-20 sm:w-20 sm:text-3xl">
          {iniciais(lead.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor.fundo} ${cor.texto}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cor.ponto}`} />
              {etapa?.rotulo}
            </span>
            {lead.frio && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80">contato frio</span>}
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl">{lead.nome}</h1>
            {/* Editar MORA AQUI, junto do nome e do número. O botão existia, mas num cartão
                lá embaixo, depois do histórico: ele cadastrou um cliente e não achou onde
                trocar o telefone. Perto do dado é onde se procura. */}
            {aoEditar && (
              <button
                type="button"
                onClick={aoEditar}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25"
              >
                <Icone nome="editar_prompt" className="h-4 w-4" />
                Editar
              </button>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/75">
            <span className="tabular-nums">{telefoneLegivel(lead.telefone)}</span>
            <span aria-hidden>·</span>
            <span>{ORIGEM_POR_ID[lead.origem]?.rotulo.split(" (")[0]}</span>
            {corretor && (
              <>
                <span aria-hidden>·</span>
                <span>Corretor: {corretor}</span>
              </>
            )}
          </p>
          {imovel && (
            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-sm">
              <Icone nome="imoveis" className="h-4 w-4 shrink-0 text-marca-pessego" />
              <span className="truncate">{imovel}</span>
            </p>
          )}
        </div>
      </div>

      {lead.bloqueio && (
        <p className="relative mt-4 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-50 ring-1 ring-red-300/30">
          {lead.bloqueio === "pediu_parar" ? "Esta pessoa pediu para parar: nenhuma mensagem sai mais pra este número." : "Número marcado como errado: corrija nos dados pra voltar a enviar."}
        </p>
      )}

      <dl className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numeros.map((n, i) => (
          <div key={n.rotulo} className="surgir rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10" style={{ animationDelay: `${80 + i * 50}ms` }}>
            <dt className="text-[11px] tracking-wide text-white/60 uppercase">{n.rotulo}</dt>
            <dd className={`mt-0.5 text-base font-semibold tabular-nums ${n.destaque ? "text-marca-pessego" : "text-white"}`}>{n.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
