"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, BotaoConfirma, Cartao, Chip, Icone } from "@/components/ui";
import { AVISO_OBSERVACOES, DECLARACAO, ETAPAS, ORIGEM_POR_ID, telefoneLegivel, type EtapaId, type OrigemId } from "@/lib/crm";

// UM CLIENTE: a mensagem (com as travas), a etapa, os dados e o histórico.
//
// A mensagem NÃO é enviada pelo Encena: o botão pede ao servidor pra conferir tudo de novo
// (bloqueio, CRECI, declaração, limite do dia, tentativas) e abre a conversa com o texto
// pronto no aparelho do corretor. Quem aperta enviar é ele. É o que mantém o produto longe
// de "disparo" (docs/planos/crm-whatsapp-regras.md, trava 1).

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: OrigemId;
  etapa: EtapaId;
  observacoes: string | null;
  frio: boolean;
  bloqueio: "pediu_parar" | "numero_errado" | null;
  declaracao_em: string | null;
  tentativas_sem_resposta: number;
  ultimo_envio_em: string | null;
  proximo_contato_em: string | null;
  property_id: string | null;
  criado_em: string;
};
type Imovel = { id: string; titulo: string };
type Envio = {
  pode: { ok: true; primeiroContato: boolean; reabertura: boolean; avisos: string[] } | { ok: false; motivo: string; texto: string };
  texto: string;
  primeirosHoje: number;
  limiteDia: number;
  imovel: string | null;
};
type Registro = { acao: string; detalhe: Record<string, unknown> | null; criado_em: string };

const ROTULO_DA_ACAO: Record<string, string> = {
  cadastrou: "Cadastrado",
  editou: "Dados editados",
  mudou_etapa: "Mudou de etapa",
  declarou: "Declaração confirmada",
  abriu_mensagem: "Mensagem aberta pra enviar",
  respondeu: "Marcou que respondeu",
  pediu_parar: "Pediu para parar",
  numero_errado: "Número errado",
  exportou: "Dados exportados",
};

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Cliente() {
  const c = useConta();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, token } = c;
  const [lead, setLead] = useState<Lead | null>(null);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [dados, setDados] = useState({ nome: "", telefone: "", email: "", proximo_contato_em: "", observacoes: "", property_id: "" });
  const [salvo, setSalvo] = useState<string | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!user || !id) return;
    token()
      .then((t) => Promise.all([fetch(`/api/crm/leads/${id}`, { headers: { Authorization: `Bearer ${t}` } }), fetch("/api/imoveis", { headers: { Authorization: `Bearer ${t}` } })]))
      .then(async ([r, ri]) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const di = await ri.json().catch(() => ({}));
        if (ri.ok) setImoveis((di.imoveis ?? []).map((i: Imovel) => ({ id: i.id, titulo: i.titulo })));
        setLead(d.lead);
        setEnvio(d.envio);
        setHistorico(d.historico);
        setTexto(d.envio.texto);
        setDados({ nome: d.lead.nome, telefone: telefoneLegivel(d.lead.telefone), email: d.lead.email ?? "", proximo_contato_em: d.lead.proximo_contato_em ?? "", observacoes: d.lead.observacoes ?? "", property_id: d.lead.property_id ?? "" });
      })
      .catch((e) => setErro(e.message));
  }, [user, token, id, versao]);

  async function chamar(metodo: "POST" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
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
  const acao = (a: string, extra?: Record<string, unknown>) => chamar("POST", `/api/crm/leads/${id}/acao`, { acao: a, ...extra });
  const recarregar = () => setVersao((v) => v + 1);
  // Mexeu num campo: o "Salvo." de antes já não vale.
  const mudar = (m: Partial<typeof dados>) => {
    setDados({ ...dados, ...m });
    setSalvo(null);
  };

  async function enviar() {
    // A janela abre JÁ, no toque: aberta depois do `await`, o navegador do celular bloqueia.
    const janela = window.open("", "_blank");
    const d = await acao("enviar", { texto });
    if (!d) {
      janela?.close();
      return;
    }
    if (janela) janela.location.href = d.link;
    else window.location.href = d.link;
    // Sem isso a caixa trocava de texto em silêncio e a pessoa não sabia o que tinha acontecido.
    setAviso(
      [
        d.reaberta ? "Mensagem aberta de novo (não conta como nova tentativa)." : "Conversa aberta no seu aparelho com o texto pronto.",
        "Quando a pessoa responder, volte aqui e toque em Respondeu.",
        ...(d.avisos ?? []),
      ].join(" ")
    );
    recarregar();
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seus clientes.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base focus:border-marca-indigo focus:outline-none sm:text-sm";
  const rotulo = "mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500";
  const bloqueado = !!lead?.bloqueio;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <Link href="/crm" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <Icone nome="seta_esq" className="h-4 w-4" />
        Clientes
      </Link>

      {erro && (
        <div className="mt-2">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {!lead || !envio ? (
        !erro && <p className="mt-4 text-sm text-neutral-500">Carregando…</p>
      ) : (
        <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="grid gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{lead.nome}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {telefoneLegivel(lead.telefone)} · {ORIGEM_POR_ID[lead.origem]?.rotulo}
                {lead.frio && " · contato frio"}
              </p>
              {envio.imovel && <p className="mt-0.5 text-sm text-neutral-700">Interesse: {envio.imovel}</p>}
            </div>

            {/* ---------- a mensagem ---------- */}
            <Cartao>
              <p className="font-semibold">Mensagem</p>
              {bloqueado ? (
                <div className="mt-2">
                  <Aviso tipo="erro">{envio.pode.ok ? "" : envio.pode.texto}</Aviso>
                </div>
              ) : !envio.pode.ok && envio.pode.motivo === "declaracao" ? (
                <div className="mt-2 grid gap-3">
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
                    <span>{DECLARACAO.texto}</span>
                  </label>
                  <p className="text-xs text-neutral-500">Fica registrado com a data e o seu nome. Sem isso, a primeira mensagem não sai.</p>
                  <Botao disabled={!aceito || ocupado} onClick={async () => (await acao("declarar", { aceito: true })) && recarregar()} className="min-h-11 w-full sm:w-auto">
                    Confirmar
                  </Botao>
                </div>
              ) : !envio.pode.ok ? (
                <div className="mt-2">
                  <Aviso tipo="atencao">{envio.pode.texto}</Aviso>
                  {envio.pode.motivo === "sem_creci" && (
                    <Link href="/marca" className="mt-2 inline-flex min-h-11 items-center text-sm text-marca-indigo underline">
                      Abrir Minha marca
                    </Link>
                  )}
                </div>
              ) : (
                <div className="mt-2 grid gap-3">
                  {envio.pode.avisos.map((a, i) => (
                    <Aviso key={i} tipo="atencao">{a}</Aviso>
                  ))}
                  {envio.pode.reabertura && <p className="text-xs text-neutral-500">Você já abriu esta mensagem hoje. Abrir de novo não conta como nova tentativa.</p>}
                  <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} maxLength={1000} className={campo} aria-label="Texto da mensagem" />
                  <p className="text-xs text-neutral-500">
                    {envio.pode.primeiroContato
                      ? `Primeiro contato: sem link, se identificando e com a opção de sair. Hoje: ${envio.primeirosHoje} de ${envio.limiteDia} primeiros contatos.`
                      : "Nunca peça documento, CPF ou dado de banco por mensagem."}
                  </p>
                  <Botao disabled={ocupado || !texto.trim()} onClick={enviar} className="min-h-11 w-full sm:w-auto">
                    Abrir a mensagem pra enviar
                  </Botao>
                  <p className="text-xs text-neutral-500">Abre a conversa com o texto pronto no seu aparelho. Quem envia é você.</p>
                </div>
              )}
              {aviso && (
                <div className="mt-3">
                  <Aviso tipo="atencao">{aviso}</Aviso>
                </div>
              )}

              {!bloqueado && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  {lead.ultimo_envio_em && (
                    <Botao variante="secundaria" disabled={ocupado} onClick={async () => (await acao("respondeu")) && recarregar()} className="min-h-11">
                      Respondeu
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
                    detalhe="O envio fica travado até você corrigir o número nos dados abaixo."
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
              )}
            </Cartao>

            {/* ---------- etapa ---------- */}
            <Cartao>
              <p className="font-semibold">Etapa</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ETAPAS.map((e) => (
                  <Chip
                    key={e.id}
                    ativo={lead.etapa === e.id}
                    disabled={ocupado}
                    onClick={async () => {
                      const d = await chamar("PATCH", `/api/crm/leads/${id}`, { etapa: e.id });
                      if (d) recarregar();
                    }}
                  >
                    {e.rotulo}
                  </Chip>
                ))}
              </div>
            </Cartao>

            {/* ---------- dados ---------- */}
            <Cartao>
              <p className="font-semibold">Dados</p>
              <form
                className="mt-2 grid gap-3 sm:grid-cols-2"
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
                  <span className={rotulo}>Próximo contato</span>
                  <input type="date" value={dados.proximo_contato_em} onChange={(e) => mudar({ proximo_contato_em: e.target.value })} className={campo} />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={rotulo}>Imóvel de interesse</span>
                  <select value={dados.property_id} onChange={(e) => mudar({ property_id: e.target.value })} className={campo}>
                    <option value="">Nenhum</option>
                    {imoveis.map((i) => (
                      <option key={i.id} value={i.id}>{i.titulo}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={rotulo}>Observações</span>
                  <textarea value={dados.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={3} maxLength={1000} className={campo} />
                  <span className="mt-1 block text-xs text-neutral-500">{AVISO_OBSERVACOES}</span>
                </label>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Botao type="submit" variante="secundaria" disabled={ocupado} className="min-h-11">
                    Salvar dados
                  </Botao>
                  {salvo && (
                    <span role="status" className="text-sm text-neutral-600">
                      {salvo}
                    </span>
                  )}
                </div>
              </form>
            </Cartao>
          </div>

          <div className="grid content-start gap-4">
            <Cartao>
              <p className="font-semibold">Histórico</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {historico.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0">
                    <span>
                      {ROTULO_DA_ACAO[h.acao] ?? h.acao}
                      {h.acao === "mudou_etapa" && h.detalhe?.para ? ` → ${ETAPAS.find((e) => e.id === h.detalhe?.para)?.rotulo ?? ""}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-400">{quando(h.criado_em)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>

            <Cartao>
              <p className="font-semibold">Dados da pessoa</p>
              <p className="mt-1 text-xs text-neutral-500">Se ela pedir, você entrega ou apaga tudo que está guardado (Lei Geral de Proteção de Dados).</p>
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
      )}
    </AppShell>
  );
}
