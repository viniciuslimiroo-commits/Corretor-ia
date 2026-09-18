"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Chip, Icone } from "@/components/ui";
import { AVISO_OBSERVACOES, ETAPAS, ETAPA_POR_ID, ORIGENS, ORIGEM_POR_ID, telefoneLegivel, type EtapaId, type OrigemId } from "@/lib/crm";

// CLIENTES (o CRM do corretor): quem pediu informação, em que pé está, e o próximo passo.
//
// Celular primeiro: nada de quadro com sete colunas, que não cabe em 375px. As etapas são
// fichas que rolam de lado (com a contagem), e a lista embaixo mostra a etapa escolhida.
// "Pra hoje" junta quem tem retorno marcado até hoje e quem ainda não recebeu mensagem.
//
// Por enquanto só quem está em ADMIN_EMAILS entra (o estudo jurídico pede advogado e
// empresa aberta antes de lançar): a rota responde 403 pra todo o resto.

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  origem: OrigemId;
  etapa: EtapaId;
  bloqueio: string | null;
  ultimo_envio_em: string | null;
  proximo_contato_em: string | null;
  atualizado_em: string;
};
type Imovel = { id: string; titulo: string };
type Filtro = "hoje" | "todos" | EtapaId;

const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataCurta = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export default function Clientes() {
  const c = useConta();
  const router = useRouter();
  const { user, token } = c;
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [porEtapa, setPorEtapa] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [fechado, setFechado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("hoje");
  const [criando, setCriando] = useState(false);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [form, setForm] = useState({ nome: "", telefone: "", origem: "", email: "", property_id: "", observacoes: "" });
  const [ocupado, setOcupado] = useState(false);
  const [existente, setExistente] = useState<string | null>(null);
  const [temCreci, setTemCreci] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => Promise.all([fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${t}` } }), fetch("/api/imoveis", { headers: { Authorization: `Bearer ${t}` } })]))
      .then(async ([r, ri]) => {
        const d = await r.json();
        if (r.status === 403) {
          setFechado(true);
          return;
        }
        if (!r.ok) throw new Error(d.error);
        setLeads(d.leads);
        setPorEtapa(d.porEtapa);
        setTemCreci(d.temCreci !== false);
        const di = await ri.json().catch(() => ({}));
        if (ri.ok) setImoveis((di.imoveis ?? []).map((i: Imovel) => ({ id: i.id, titulo: i.titulo })));
      })
      .catch((e) => setErro(e.message));
  }, [user, token]);

  const hoje = hojeISO();
  const praHoje = (l: Lead) => !l.bloqueio && l.etapa !== "fechado" && l.etapa !== "perdido" && ((!!l.proximo_contato_em && l.proximo_contato_em <= hoje) || (!l.ultimo_envio_em && l.etapa === "novo"));
  const lista = leads ?? [];
  // Busca por nome (sem acento, sem maiúscula) ou por pedaço do número. Buscando, ignora a etapa.
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termo = semAcento(busca.trim());
  const digitos = busca.replace(/\D/g, "");
  const achados = termo ? lista.filter((l) => semAcento(l.nome).includes(termo) || (digitos.length >= 3 && l.telefone.includes(digitos))) : null;
  const visiveis = achados ?? (filtro === "todos" ? lista : filtro === "hoje" ? lista.filter(praHoje) : lista.filter((l) => l.etapa === filtro));
  const nHoje = lista.filter(praHoje).length;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    setExistente(null);
    try {
      const r = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ ...form, property_id: form.property_id || null }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.existente) setExistente(d.existente);
        throw new Error(d.error);
      }
      router.push(`/crm/${d.lead.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui cadastrar.");
      setOcupado(false);
    }
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

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-neutral-500">Quem pediu informação, em que pé está e o próximo passo.</p>
        </div>
        {!criando && !fechado && (
          <Botao onClick={() => setCriando(true)} className="min-h-11">
            <Icone nome="mais" className="h-4 w-4" />
            Novo cliente
          </Botao>
        )}
      </div>

      {fechado && (
        <div className="mt-5">
          <Aviso tipo="info">Esta área ainda não está aberta.</Aviso>
        </div>
      )}

      {!fechado && (
        <div className="mt-3 grid gap-2">
          <Aviso tipo="atencao">Só você vê esta área por enquanto. Ela abre pra todos depois da conversa com o advogado e da empresa aberta.</Aviso>
          {!temCreci && (
            <Aviso tipo="atencao">
              Sem o seu CRECI em Minha marca, nenhuma mensagem sai.
              <Link href="/marca" className="flex min-h-10 items-center font-medium underline">
                Cadastrar agora
              </Link>
            </Aviso>
          )}
        </div>
      )}

      {criando && (
        <Cartao className="mt-5">
          <form onSubmit={criar} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className={rotulo}>Nome</span>
              <input autoFocus required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} placeholder="Ex.: Maria da Silva" className={campo} />
            </label>
            <label className="text-sm">
              <span className={rotulo}>Celular com DDD</span>
              <input required inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(62) 99999-1234" className={campo} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className={rotulo}>De onde veio este contato?</span>
              <select required value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className={campo}>
                <option value="" disabled>Escolha a origem</option>
                {ORIGENS.map((o) => (
                  <option key={o.id} value={o.id}>{o.rotulo}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-500">Só entra quem te passou o contato. Lista comprada ou de terceiros não pode.</span>
            </label>
            <label className="text-sm">
              <span className={rotulo}>E-mail (opcional)</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={campo} />
            </label>
            <label className="text-sm">
              <span className={rotulo}>Imóvel de interesse (opcional)</span>
              <select value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })} className={campo}>
                <option value="">Nenhum</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.titulo}</option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className={rotulo}>Observações (opcional)</span>
              <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} maxLength={1000} className={campo} />
              <span className="mt-1 block text-xs text-neutral-500">{AVISO_OBSERVACOES}</span>
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Botao type="submit" disabled={ocupado || !form.nome.trim() || !form.telefone.trim() || !form.origem} className="min-h-11">
                {ocupado ? "Cadastrando…" : "Cadastrar"}
              </Botao>
              <Botao type="button" variante="discreta" onClick={() => setCriando(false)} className="min-h-11">
                Cancelar
              </Botao>
            </div>
          </form>
        </Cartao>
      )}

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">
            {erro}
            {existente && (
              <Link href={`/crm/${existente}`} className="flex min-h-10 items-center font-medium underline">
                Abrir o cliente
              </Link>
            )}
          </Aviso>
        </div>
      )}

      {!fechado && (
        <>
          {/* Sem cliente nenhum, busca e nove fichas zeradas só atrapalham. As fichas NÃO
              encolhem: rolam de lado numa linha só (encolhendo, o texto quebrava em três linhas). */}
          {lista.length > 0 && (
            <>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou número"
                aria-label="Buscar cliente"
                className="mt-5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base focus:border-marca-indigo focus:outline-none sm:text-sm"
              />
              <div className={`-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&>*]:shrink-0 [&>*]:whitespace-nowrap ${achados ? "opacity-40" : ""}`} aria-label="Etapas">
                <Chip ativo={filtro === "hoje"} onClick={() => setFiltro("hoje")}>Pra hoje · {nHoje}</Chip>
                <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos · {lista.length}</Chip>
                {ETAPAS.map((e) => (
                  <Chip key={e.id} ativo={filtro === e.id} onClick={() => setFiltro(e.id)}>
                    {e.rotulo} · {porEtapa[e.id] ?? 0}
                  </Chip>
                ))}
              </div>
            </>
          )}

          <div className="mt-4">
            {leads === null ? (
              <p className="text-sm text-neutral-500">Carregando…</p>
            ) : visiveis.length === 0 ? (
              <Cartao>
                <p className="font-medium">{leads.length === 0 ? "Nenhum cliente ainda." : achados ? "Ninguém com esse nome ou número." : "Ninguém nesta etapa."}</p>
                {leads.length === 0 && <p className="mt-1 text-sm text-neutral-600">Cadastre quem te pediu informação: de um portal, do seu anúncio, da placa, por indicação.</p>}
              </Cartao>
            ) : (
              <ul className="grid gap-2">
                {visiveis.map((l) => (
                  <li key={l.id}>
                    <Link href={`/crm/${l.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-neutral-400">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{l.nome}</p>
                        <p className="truncate text-sm text-neutral-500">
                          {telefoneLegivel(l.telefone)} · {ORIGEM_POR_ID[l.origem]?.rotulo.split(" (")[0]}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${l.bloqueio ? "bg-red-50 text-red-700" : "bg-marca-pessego/60 text-marca-indigo"}`}>
                          {l.bloqueio === "pediu_parar" ? "Pediu para parar" : l.bloqueio === "numero_errado" ? "Número errado" : ETAPA_POR_ID[l.etapa]?.rotulo}
                        </span>
                        {l.proximo_contato_em && !l.bloqueio && (
                          <p className={`mt-1 text-xs ${l.proximo_contato_em <= hoje ? "font-semibold text-marca-coral-escuro" : "text-neutral-400"}`}>retorno {dataCurta(l.proximo_contato_em)}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
