"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, BotaoConfirma, Cartao, Icone } from "@/components/ui";
import { AVISO_OBSERVACOES, LIMITES_CRM, telefoneLegivel, type EtapaId } from "@/lib/crm";
import CabecalhoCliente from "@/components/crm/cabecalho-cliente";
import CaminhoEtapas from "@/components/crm/caminho-etapas";
import PrepararEnvio from "@/components/crm/preparar-envio";
import LinhaHistorico from "@/components/crm/linha-historico";
import { diaCurto, haQuanto, hojeEmBrasilia, type EnvioPainel, type LeadPainel, type Registro } from "@/components/crm/comum";

// O PAINEL DE UM CLIENTE: não uma ficha de cadastro, mas o lugar de atender a pessoa.
//
//   cabeçalho      quem é, em que pé está, os números do relacionamento
//   próximo passo  a coisa certa a fazer agora, numa frase
//   etapas         o caminho da negociação
//   preparar envio imóvel -> materiais -> mensagem (IA) -> abrir/copiar/compartilhar
//   conversa       "ela respondeu", "pediu para parar", "número errado"
//   histórico      a linha do tempo
//   dados          recolhidos atrás de "Editar": consultar é o comum, editar é o raro
//
// Nada é enviado pelo Encena: quem aperta enviar é o corretor, no aparelho dele
// (docs/planos/crm-whatsapp-regras.md, trava 1).

type Imovel = { id: string; titulo: string };

/** A coisa certa a fazer agora, numa frase. `null` quando o cabeçalho já diz tudo (bloqueio). */
function proximoPasso(lead: LeadPainel, envio: EnvioPainel, agora: number): string | null {
  if (lead.bloqueio) return null;
  if (!envio.pode.ok) {
    if (envio.pode.motivo === "declaracao") return "Confirme que a pessoa te passou o contato: é o que libera a primeira mensagem.";
    if (envio.pode.motivo === "sem_creci") return "Cadastre o seu CRECI em Minha marca pra poder mandar mensagens.";
    if (envio.pode.motivo === "sem_resposta") return `${LIMITES_CRM.tentativasSemResposta} mensagens sem resposta. Espere a pessoa responder e marque “Ela respondeu”.`;
    return envio.pode.texto;
  }
  const hoje = hojeEmBrasilia(agora);
  if (lead.proximo_contato_em && lead.proximo_contato_em <= hoje) return lead.proximo_contato_em === hoje ? "Retorno marcado pra hoje." : `Retorno atrasado: era ${diaCurto(lead.proximo_contato_em)}.`;
  if (!lead.ultimo_envio_em) return "Mande a primeira mensagem. Ela te apresenta com o CRECI e dá à pessoa a opção de sair.";
  const dias = Math.floor((agora - Date.parse(lead.ultimo_envio_em)) / 86400000);
  if (lead.tentativas_sem_resposta > 0 && dias >= 2) return `Sem resposta ${haQuanto(lead.ultimo_envio_em, agora)}. Vale uma segunda mensagem, curta.`;
  if (lead.etapa === "visita") return "Confirme a visita e mande o material do imóvel.";
  if (lead.etapa === "proposta") return "Acompanhe a proposta: um retorno marcado ajuda a não esfriar.";
  if (lead.etapa === "fechado") return "Negócio fechado. Parabéns!";
  return "Mande o material do imóvel pra manter a conversa andando.";
}

export default function Cliente() {
  const c = useConta();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, token } = c;
  const [lead, setLead] = useState<LeadPainel | null>(null);
  const [envio, setEnvio] = useState<EnvioPainel | null>(null);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [corretor, setCorretor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [dados, setDados] = useState({ nome: "", telefone: "", email: "", proximo_contato_em: "", observacoes: "", property_id: "" });
  const [salvo, setSalvo] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [versao, setVersao] = useState(0);
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    if (!user || !id) return;
    token()
      .then((t) => Promise.all([fetch(`/api/crm/leads/${id}`, { headers: { Authorization: `Bearer ${t}` } }), fetch("/api/imoveis", { headers: { Authorization: `Bearer ${t}` } })]))
      .then(async ([r, ri]) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const di = await ri.json().catch(() => ({}));
        if (ri.ok) setImoveis((di.imoveis ?? []).map((i: Imovel) => ({ id: i.id, titulo: i.titulo })));
        setAgora(Date.now());
        setLead(d.lead);
        setEnvio(d.envio);
        setHistorico(d.historico);
        setCorretor(d.corretor ?? null);
        setDados({ nome: d.lead.nome, telefone: telefoneLegivel(d.lead.telefone), email: d.lead.email ?? "", proximo_contato_em: d.lead.proximo_contato_em ?? "", observacoes: d.lead.observacoes ?? "", property_id: d.lead.property_id ?? "" });
      })
      .catch((e) => setErro(e.message));
  }, [user, token, id, versao]);

  async function chamar(metodo: "POST" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(caminho, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }
  const acao = (a: string) => chamar("POST", `/api/crm/leads/${id}/acao`, { acao: a });
  const recarregar = () => setVersao((v) => v + 1);
  // Mexeu num campo: o "Salvo." de antes já não vale.
  const mudar = (m: Partial<typeof dados>) => {
    setDados({ ...dados, ...m });
    setSalvo(null);
  };

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">
          Entre para ver seus clientes.
        </Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base focus:border-marca-indigo focus:outline-none sm:text-sm";
  const rotulo = "mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500";
  const passo = lead && envio ? proximoPasso(lead, envio, agora) : null;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <Link href="/crm" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <Icone nome="seta_esq" className="h-4 w-4" />
        Meus clientes
      </Link>

      {erro && (
        <div className="mt-2">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {!lead || !envio ? (
        !erro && (
          <div className="mt-2 grid gap-4">
            <div className="carregando-ia h-56 rounded-3xl" />
            <div className="carregando-ia h-28 rounded-2xl" />
          </div>
        )
      ) : (
        <div className="mt-2 grid gap-5">
          <CabecalhoCliente lead={lead} imovel={envio.imovel} corretor={corretor} agora={agora} />

          {passo && (
            <div className="surgir flex items-start gap-3 rounded-2xl border-l-4 border-marca-coral bg-white px-4 py-3 shadow-sm" style={{ animationDelay: "90ms" }}>
              <Icone nome="estrela" className="mt-0.5 h-5 w-5 shrink-0 text-marca-coral" />
              <p className="text-sm">
                <span className="font-semibold">Próximo passo: </span>
                {passo}
              </p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
            <div className="grid content-start gap-5">
              <CaminhoEtapas
                etapa={lead.etapa}
                ocupado={ocupado}
                aoMudar={async (e: EtapaId) => {
                  if (e !== lead.etapa && (await chamar("PATCH", `/api/crm/leads/${id}`, { etapa: e }))) recarregar();
                }}
              />

              <PrepararEnvio lead={lead} envio={envio} imoveis={imoveis} token={token} aoMudar={recarregar} />

              {!lead.bloqueio && (
                <Cartao className="surgir" style={{ animationDelay: "220ms" }}>
                  <p className="font-semibold">Como está a conversa?</p>
                  <p className="mt-0.5 text-sm text-neutral-500">O Encena não vê a conversa: é você que conta o que aconteceu.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lead.ultimo_envio_em && (
                      <Botao variante="secundaria" disabled={ocupado} onClick={async () => (await acao("respondeu")) && recarregar()} className="min-h-11">
                        <Icone nome="check" className="h-4 w-4" />
                        Ela respondeu
                      </Botao>
                    )}
                    <BotaoConfirma
                      pergunta="Esta pessoa pediu para parar?"
                      detalhe="Nenhuma mensagem sai mais pra este número, nem se o cliente for excluído e cadastrado de novo. Não dá pra desfazer."
                      confirmar="Pediu para parar"
                      aoConfirmar={async () => {
                        if (await acao("pediu_parar")) recarregar();
                      }}
                      className="min-h-11"
                    >
                      Pediu para parar
                    </BotaoConfirma>
                    <BotaoConfirma
                      pergunta="O número está errado?"
                      detalhe="O envio fica travado até você corrigir o número nos dados."
                      confirmar="Número errado"
                      variante="discreta"
                      aoConfirmar={async () => {
                        if (await acao("numero_errado")) recarregar();
                      }}
                      className="min-h-11"
                    >
                      Número errado
                    </BotaoConfirma>
                  </div>
                </Cartao>
              )}
            </div>

            <div className="grid content-start gap-5">
              <LinhaHistorico historico={historico} agora={agora} />

              <Cartao className="surgir" style={{ animationDelay: "280ms" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Dados do cliente</p>
                  {!editando && (
                    <Botao variante="discreta" onClick={() => setEditando(true)} className="min-h-10">
                      <Icone nome="editar_prompt" className="h-4 w-4" />
                      Editar
                    </Botao>
                  )}
                </div>
                {!editando ? (
                  <dl className="mt-2 grid gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-neutral-500">E-mail</dt>
                      <dd className="truncate">{lead.email ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Próximo retorno</dt>
                      <dd>{lead.proximo_contato_em ? diaCurto(lead.proximo_contato_em) : "sem data"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Observações</dt>
                      <dd className="line-clamp-3 whitespace-pre-line text-neutral-700">{lead.observacoes ?? "—"}</dd>
                    </div>
                  </dl>
                ) : (
                  <form
                    className="mt-2 grid gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const d = await chamar("PATCH", `/api/crm/leads/${id}`, {
                        nome: dados.nome,
                        email: dados.email || null,
                        proximo_contato_em: dados.proximo_contato_em || null,
                        observacoes: dados.observacoes || null,
                        property_id: dados.property_id || null,
                        ...(lead.bloqueio !== "pediu_parar" ? { telefone: dados.telefone } : {}),
                      });
                      if (d) {
                        setSalvo(d.semMudanca ? "Nada mudou." : "Salvo.");
                        if (!d.semMudanca) recarregar();
                      }
                    }}
                  >
                    <label className="text-sm">
                      <span className={rotulo}>Nome</span>
                      <input value={dados.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} className={campo} />
                    </label>
                    <label className="text-sm">
                      <span className={rotulo}>Celular</span>
                      <input value={dados.telefone} inputMode="tel" disabled={lead.bloqueio === "pediu_parar"} onChange={(e) => mudar({ telefone: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm">
                      <span className={rotulo}>E-mail</span>
                      <input type="email" value={dados.email} onChange={(e) => mudar({ email: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm">
                      <span className={rotulo}>Próximo retorno</span>
                      <input type="date" value={dados.proximo_contato_em} onChange={(e) => mudar({ proximo_contato_em: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm">
                      <span className={rotulo}>Imóvel de interesse</span>
                      <select value={dados.property_id} onChange={(e) => mudar({ property_id: e.target.value })} className={campo}>
                        <option value="">Nenhum</option>
                        {imoveis.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.titulo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className={rotulo}>Observações</span>
                      <textarea value={dados.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={3} maxLength={1000} className={campo} />
                      <span className="mt-1 block text-xs text-neutral-500">{AVISO_OBSERVACOES}</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Botao type="submit" variante="secundaria" disabled={ocupado} className="min-h-11">
                        Salvar dados
                      </Botao>
                      <Botao type="button" variante="discreta" onClick={() => setEditando(false)} className="min-h-11">
                        Fechar
                      </Botao>
                      {salvo && (
                        <span role="status" className="text-sm text-neutral-600">
                          {salvo}
                        </span>
                      )}
                    </div>
                  </form>
                )}
              </Cartao>

              <Cartao className="surgir" style={{ animationDelay: "320ms" }}>
                <p className="font-semibold">Dados da pessoa (LGPD)</p>
                <p className="mt-1 text-xs text-neutral-500">Se ela pedir, você entrega ou apaga tudo que está guardado.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Botao
                    variante="secundaria"
                    disabled={ocupado}
                    className="min-h-11"
                    onClick={async () => {
                      const r = await fetch(`/api/crm/leads/${id}?exportar=1`, { headers: { Authorization: `Bearer ${await token()}` } });
                      if (!r.ok) return setErro("Não consegui exportar agora.");
                      const url = URL.createObjectURL(await r.blob());
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `cliente-${id}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Exportar
                  </Botao>
                  <BotaoConfirma
                    pergunta={`Excluir ${lead.nome}?`}
                    detalhe="Apaga os dados desta pessoa de verdade. Se ela pediu para parar, o número continua bloqueado."
                    confirmar="Excluir"
                    aoConfirmar={async () => {
                      if (await chamar("DELETE", `/api/crm/leads/${id}`)) router.push("/crm");
                    }}
                    className="min-h-11"
                  >
                    Excluir
                  </BotaoConfirma>
                </div>
              </Cartao>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
