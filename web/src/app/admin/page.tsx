"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Cartao, Icone, Rotulo } from "@/components/ui";

// Painel do fundador. Não aparece no menu: quem sabe o endereço e está em ADMIN_EMAILS
// entra. Mostra o que dói primeiro se ninguém olhar: saldo do fal acabando, custo real
// por geração, quantas falhas e estornos, quantas contas e quanto entrou no mês.

type Dados = {
  fal: { saldo: number | null; fotosRestantes: number | null; custoMedio: number | null; custoSemana: number; alerta: boolean };
  uso: { geracoes7d: number; videos7d: number; falhas7d: number; reportes7d: number; creditosGastosMes: number; estornosMes: number; porDia: { dia: string; n: number }[] };
  contas: { pessoas: number; imobiliarias: number; assinantes: number; lista: { tipo: string; nome: string; plano: string }[]; creditosEmCirculacao: number; creditosAgendados: number };
  receita: { mes: number };
  ultimos: { email: string; nome: string | null; creditos: number; plano: string; criadoEm: string }[];
};

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={"rounded-2xl border p-4 " + (alerta ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white")}>
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{rotulo}</p>
      <p className={"mt-1 text-2xl font-semibold " + (alerta ? "text-amber-800" : "text-neutral-900")}>{valor}</p>
      {detalhe && <p className="text-xs text-neutral-500">{detalhe}</p>}
    </div>
  );
}

export default function Admin() {
  const c = useConta();
  const { user, token } = c;
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/admin", { headers: { Authorization: `Bearer ${t}` } }))
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setD(j);
      })
      .catch((e: Error) => setErro(e.message));
  }, [user, token]);

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre.</Link>
      </main>
    );
  }

  const real = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const maxDia = Math.max(1, ...(d?.uso.porDia ?? []).map((x) => x.n));

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <h1 className="text-2xl font-semibold">Painel do fundador</h1>
      <p className="mt-1 text-sm text-neutral-500">Saldo de IA, uso, contas e receita. Só você vê isto.</p>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      {!d && !erro && <p className="mt-6 text-sm text-neutral-500">Carregando…</p>}

      {d && (
        <>
          {d.fal.alerta && (
            <div className="mt-4">
              <Aviso tipo="atencao">
                Saldo do fal baixo (US$ {d.fal.saldo?.toFixed(2)}). Recarregue em <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener noreferrer" className="underline">fal.ai/dashboard/billing</a> antes que um cliente veja erro.
              </Aviso>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Saldo de IA" valor={d.fal.saldo != null ? `US$ ${d.fal.saldo.toFixed(2)}` : "—"} detalhe={d.fal.fotosRestantes != null ? `dá pra ~${d.fal.fotosRestantes} fotos` : undefined} alerta={d.fal.alerta} />
            <Numero rotulo="Custo por geração" valor={d.fal.custoMedio != null ? `US$ ${d.fal.custoMedio.toFixed(3)}` : "—"} detalhe={`US$ ${d.fal.custoSemana.toFixed(2)} nos últimos 7 dias`} />
            <Numero rotulo="Receita do mês" valor={real(d.receita.mes)} detalhe={`${d.contas.assinantes} ${d.contas.assinantes === 1 ? "assinante" : "assinantes"}`} />
            <Numero rotulo="Contas" valor={`${d.contas.pessoas}`} detalhe={`${d.contas.imobiliarias} ${d.contas.imobiliarias === 1 ? "imobiliária" : "imobiliárias"}`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <Cartao>
                <Rotulo>Gerações por dia (7 dias)</Rotulo>
                {d.uso.porDia.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhuma geração nos últimos 7 dias.</p>
                ) : (
                  <ul className="flex h-32 items-end gap-2">
                    {d.uso.porDia.map((x) => (
                      <li key={x.dia} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-xs text-neutral-500">{x.n}</span>
                        <div className="w-full rounded-t bg-marca-coral" style={{ height: `${Math.max(4, (x.n / maxDia) * 100)}%` }} title={`${x.dia}: ${x.n}`} />
                        <span className="text-[10px] text-neutral-400">{x.dia.slice(8)}/{x.dia.slice(5, 7)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    ["Fotos (7d)", d.uso.geracoes7d],
                    ["Vídeos (7d)", d.uso.videos7d],
                    ["Falhas (7d)", d.uso.falhas7d],
                    ["Reportes (7d)", d.uso.reportes7d],
                  ].map(([r, v]) => (
                    <div key={r as string}>
                      <dt className="text-xs text-neutral-500">{r as string}</dt>
                      <dd className="text-lg font-semibold">{v as number}</dd>
                    </div>
                  ))}
                </dl>
              </Cartao>

              <Cartao className="mt-4">
                <Rotulo>Contas recentes</Rotulo>
                <ul className="divide-y divide-neutral-100 text-sm">
                  {d.ultimos.map((u) => (
                    <li key={u.email} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{u.nome ? `${u.nome} · ` : ""}{u.email}</span>
                      <span className="text-xs text-neutral-500">{u.creditos} cr · {u.plano}</span>
                      <span className="text-xs text-neutral-400">{new Date(u.criadoEm).toLocaleDateString("pt-BR")}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </section>

            <aside className="flex flex-col gap-4 lg:col-span-5">
              <Cartao>
                <Rotulo>Créditos no mundo</Rotulo>
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><dt className="text-neutral-600">Em circulação</dt><dd className="font-semibold">{d.contas.creditosEmCirculacao}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-600">Agendados (anual)</dt><dd className="font-semibold">{d.contas.creditosAgendados}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-600">Gastos no mês</dt><dd className="font-semibold">{d.uso.creditosGastosMes}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-600">Estornos no mês</dt><dd className="font-semibold">{d.uso.estornosMes}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-neutral-500">
                  Créditos em circulação × custo médio = quanto de IA você já deve entregar. Hoje:{" "}
                  {d.fal.custoMedio != null ? `US$ ${(d.contas.creditosEmCirculacao * d.fal.custoMedio).toFixed(2)}` : "—"}.
                </p>
              </Cartao>

              <Cartao>
                <Rotulo>Assinantes</Rotulo>
                {d.contas.lista.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhum ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {d.contas.lista.map((a) => (
                      <li key={a.nome} className="flex items-center gap-2">
                        <Icone nome={a.tipo === "imobiliaria" ? "imoveis" : "equipe"} className="h-4 w-4 text-neutral-400" />
                        <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                        <span className="text-xs text-neutral-500">{a.plano}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>

              <Cartao>
                <Rotulo>Atalhos</Rotulo>
                <ul className="flex flex-col gap-1.5 text-sm">
                  <li><a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener noreferrer" className="text-marca-indigo underline">Saldo e recarga do fal</a></li>
                  <li><a href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener noreferrer" className="text-marca-indigo underline">Pagamentos na Stripe</a></li>
                  <li><a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-marca-indigo underline">Banco no Supabase</a></li>
                  <li><a href="https://vercel.com/limiro-brasil/corretor-ia" target="_blank" rel="noopener noreferrer" className="text-marca-indigo underline">Deploys na Vercel</a></li>
                </ul>
              </Cartao>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
