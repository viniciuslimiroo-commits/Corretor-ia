"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Icone } from "@/components/ui";
import { AVISO_OBSERVACOES, ETAPAS, ETAPA_POR_ID, ORIGENS, ORIGEM_POR_ID, telefoneLegivel, type EtapaId, type OrigemId } from "@/lib/crm";
import { COR_ETAPA, iniciais } from "@/components/crm/comum";

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
  /** Só pra dono/gestor, nos clientes de colegas. */
  corretor?: string;
};
type Imovel = { id: string; titulo: string };
type Filtro = "hoje" | "todos" | EtapaId;

const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataCurta = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

/**
 * O próximo passo em quatro palavras, pra caber na linha da lista.
 *
 * O subtítulo da página promete "em que pé está e o PRÓXIMO PASSO" -- e a lista só mostrava o
 * pé. Saber quem cobrar hoje exigia abrir um cliente de cada vez. É a frase curta do painel,
 * encurtada mais: no painel ela explica, aqui ela só aponta.
 *
 * `urgente` é o que pinta de coral: é o que tem hora marcada e passou, ou está prestes a
 * travar. O resto fica cinza, pra a cor continuar querendo dizer alguma coisa.
 */
function passoCurto(l: Lead, hoje: string): { texto: string; urgente: boolean } | null {
  if (l.bloqueio) return { texto: l.bloqueio === "pediu_parar" ? "Não mandar mais mensagem" : "Número errado: corrija pra destravar", urgente: false };
  if (l.etapa === "fechado") return { texto: "Negócio fechado 🎉", urgente: false };
  if (l.etapa === "perdido") return null;
  if (!l.ultimo_envio_em) return { texto: "Mande a primeira mensagem", urgente: true };
  if (l.proximo_contato_em && l.proximo_contato_em < hoje) return { texto: `Retorno atrasado: era ${dataCurta(l.proximo_contato_em)}`, urgente: true };
  if (l.proximo_contato_em === hoje) return { texto: "Retorno marcado pra hoje", urgente: true };
  if (l.etapa === "sem_resposta") return { texto: "Sem resposta: espere ela responder", urgente: false };
  const dias = Math.floor((Date.now() - Date.parse(l.ultimo_envio_em)) / 86400000);
  // SEM DATA DE RETORNO é o jeito silencioso de perder cliente: ele não entra em "Pra hoje",
  // não fica vermelho em lugar nenhum, e some. O cliente em Visita da foto de teste estava
  // exatamente assim -- e a linha dele saía em branco. Uma semana parado já fica coral.
  if (!l.proximo_contato_em) return { texto: dias >= 3 ? `Parado há ${dias} dias — marque o retorno` : "Marque o próximo retorno", urgente: dias >= 7 };
  return null;
}

export default function Clientes() {
  const c = useConta();
  const router = useRouter();
  const { user, token } = c;
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [porEtapa, setPorEtapa] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [fechado, setFechado] = useState(false);
  /** null = ainda não escolheu nada; o filtro de abertura sai de `filtro`, logo abaixo. */
  const [escolhido, setFiltro] = useState<Filtro | null>(null);
  const [criando, setCriando] = useState(false);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [form, setForm] = useState({ nome: "", telefone: "", origem: "", email: "", property_id: "", observacoes: "" });
  const [ocupado, setOcupado] = useState(false);
  const [existente, setExistente] = useState<string | null>(null);
  const [temCreci, setTemCreci] = useState(true);
  const [soAdmin, setSoAdmin] = useState(true);
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
        setSoAdmin(d.soAdmin !== false);
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
  const achados = termo ? lista.filter((l) => semAcento(l.nome).includes(termo) || semAcento(l.corretor ?? "").includes(termo) || (digitos.length >= 3 && l.telefone.includes(digitos))) : null;
  const nHoje = lista.filter(praHoje).length;
  /**
   * ABRIR EM "PRA HOJE" SÓ QUANDO HÁ ALGO PRA HOJE.
   *
   * Abria sempre em "Pra hoje" e, num dia sem nada marcado, a primeira coisa que aparecia em
   * "Meus clientes" era "Ninguém nesta etapa" -- a lista parecia vazia tendo gente dentro.
   * Derivado, não em efeito: enquanto ele não toca em nada, o filtro segue o dia.
   */
  const filtro: Filtro = escolhido ?? (nHoje > 0 ? "hoje" : "todos");
  const visiveis = achados ?? (filtro === "todos" ? lista : filtro === "hoje" ? lista.filter(praHoje) : lista.filter((l) => l.etapa === filtro));

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
          <h1 className="text-2xl font-semibold">Meus clientes</h1>
          <p className="mt-1 text-sm text-neutral-500">Quem pediu informação, em que pé está e o próximo passo.</p>
        </div>
        {!fechado && (
          <div className="flex flex-wrap items-center gap-2">
            {/* As mensagens da casa ficam aqui do lado, e não escondidas em ajustes: é da
                lista de clientes que a pessoa sai pra escrever o texto que vai mandar. */}
            <Link href="/crm/mensagens" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:border-marca-indigo hover:text-marca-indigo">
              <Icone nome="editar_prompt" className="h-4 w-4" />
              Minhas mensagens
            </Link>
            {!criando && (
              <Botao onClick={() => setCriando(true)} className="min-h-11">
                <Icone nome="mais" className="h-4 w-4" />
                Novo cliente
              </Botao>
            )}
          </div>
        )}
      </div>

      {fechado && (
        <div className="mt-5">
          <Aviso tipo="info">Esta área ainda não está aberta.</Aviso>
        </div>
      )}

      {!fechado && (
        <div className="mt-3 grid gap-2">
          {soAdmin && <Aviso tipo="atencao">Só você vê esta área por enquanto. Ela abre pra todos depois da conversa com o advogado e da empresa aberta.</Aviso>}
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
              {/* OS FILTROS COM A COR DA ETAPA. Eram oito pílulas cinzas idênticas, e a
                  contagem colada no rótulo -- o olho não separava "Visita · 1" de
                  "Proposta · 0". Agora cada etapa carrega a bolinha e a cor que ela tem no
                  painel do cliente e nas mensagens: o mesmo desenho no produto inteiro.
                  Etapa sem ninguém fica apagada, pra a vista cair em quem tem gente. */}
              {/* No celular rolam de lado; do tablet pra cima QUEBRAM a linha -- em 1280px a
                  última ficha ("Sem resposta") era cortada no meio da palavra, sem nada dizendo
                  que dava pra rolar. Espaço vertical sobra na tela grande; palavra cortada não. */}
              <div
                className={`-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap ${achados ? "opacity-40" : ""}`}
                aria-label="Etapas"
              >
                {[
                  { id: "hoje" as const, rotulo: "Pra hoje", n: nHoje, ponto: "bg-marca-coral", fundo: "bg-marca-pessego/60", texto: "text-marca-indigo" },
                  { id: "todos" as const, rotulo: "Todos", n: lista.length, ponto: "bg-neutral-400", fundo: "bg-neutral-100", texto: "text-neutral-700" },
                  ...ETAPAS.map((e) => ({ id: e.id, rotulo: e.rotulo, n: porEtapa[e.id] ?? 0, ...COR_ETAPA[e.id] })),
                ].map((f) => {
                  const ativo = filtro === f.id;
                  const vazio = f.n === 0;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltro(f.id)}
                      aria-pressed={ativo}
                      className={
                        "inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition " +
                        (ativo ? `${f.fundo} ${f.texto} ring-2 ring-marca-indigo ring-offset-1` : vazio ? "text-neutral-400 hover:bg-neutral-100" : `${f.fundo} ${f.texto} hover:brightness-95`)
                      }
                    >
                      <span className={`h-2 w-2 rounded-full ${vazio && !ativo ? "bg-neutral-300" : f.ponto}`} />
                      {f.rotulo}
                      <span className={"rounded-full px-1.5 text-xs font-semibold " + (ativo ? "bg-white/70" : vazio ? "text-neutral-400" : "bg-white/60")}>{f.n}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-4">
            {leads === null ? (
              <p className="text-sm text-neutral-500">Carregando…</p>
            ) : visiveis.length === 0 ? (
              <Cartao>
                {/* "Pra hoje" vazio é BOA notícia, não falta de cliente -- dizer "ninguém nesta
                    etapa" num dia em dia fazia a lista inteira parecer vazia. */}
                <p className="font-medium">
                  {leads.length === 0 ? "Nenhum cliente ainda." : achados ? "Ninguém com esse nome ou número." : filtro === "hoje" ? "Nada pra hoje — você está em dia. 🎉" : "Ninguém nesta etapa."}
                </p>
                {leads.length === 0 && <p className="mt-1 text-sm text-neutral-600">Cadastre quem te pediu informação: de um portal, do seu anúncio, da placa, por indicação.</p>}
                {leads.length > 0 && !achados && filtro === "hoje" && (
                  <button type="button" onClick={() => setFiltro("todos")} className="mt-1 text-sm text-neutral-600 underline underline-offset-2 hover:text-marca-indigo">
                    Ver os {leads.length} clientes
                  </button>
                )}
              </Cartao>
            ) : (
              /* grid-cols-1 (minmax(0,1fr)) e não só "grid": a coluna automática tem largura
                 mínima = conteúdo, e o telefone com a origem numa linha só empurrava a ficha
                 90px pra fora da tela em 390px -- a etapa saía do lado direito e a página
                 inteira ganhava rolagem lateral. Medido no navegador, não deduzido. */
              <ul className="grid grid-cols-1 gap-2">
                {visiveis.map((l, k) => (
                  <li key={l.id} className="surgir min-w-0" style={{ animationDelay: `${Math.min(k, 8) * 35}ms` }}>
                    <Link
                      href={`/crm/${l.id}`}
                      className="flex min-h-16 items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
                    >
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-marca-indigo to-[#1d4a8a] text-sm font-semibold text-white">
                        {iniciais(l.nome)}
                        <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-white ${l.bloqueio ? "bg-red-500" : COR_ETAPA[l.etapa]?.ponto}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{l.nome}</p>
                        <p className="truncate text-sm text-neutral-500">
                          {telefoneLegivel(l.telefone)} · {ORIGEM_POR_ID[l.origem]?.rotulo.split(" (")[0]}
                        </p>
                        {/* O PRÓXIMO PASSO, na linha. O subtítulo da página promete "em que pé
                            está e o próximo passo" e a lista só mostrava o pé. Sem isto, saber
                            quem cobrar hoje exigia abrir um cliente de cada vez. */}
                        {(() => {
                          const passo = passoCurto(l, hoje);
                          return passo ? <p className={`truncate text-xs font-medium ${passo.urgente ? "text-marca-coral-escuro" : "text-neutral-500"}`}>{passo.texto}</p> : null;
                        })()}
                        {l.corretor && <p className="truncate text-xs text-neutral-400">Corretor: {l.corretor}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                            (l.bloqueio ? "bg-red-50 text-red-700" : `${COR_ETAPA[l.etapa]?.fundo} ${COR_ETAPA[l.etapa]?.texto}`)
                          }
                        >
                          {!l.bloqueio && <span className={`h-1.5 w-1.5 rounded-full ${COR_ETAPA[l.etapa]?.ponto}`} />}
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
