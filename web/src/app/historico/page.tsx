"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Cartao, Rotulo } from "@/components/ui";

// Histórico: o que foi gerado e para onde foi cada crédito. Transparência é parte do
// produto -- foi assim que o próprio teste na Pedra confirmou os custos dela.

type Geracao = { id: string; acao: string; detalhe: string; status: string; criadoEm: string; reportado: boolean; miniatura: string | null };
type Movimento = { delta: number; motivo: string; em: string };

function humanizarMotivo(m: string): string {
  const base = m.split(":")[0];
  if (base.startsWith("trial") || base.includes("boas")) return "Créditos de boas-vindas";
  if (base.startsWith("geracao") || base.startsWith("debito")) return "Geração";
  if (base.startsWith("estorno_reporte")) return "Devolvido: você reportou um problema";
  if (base.startsWith("estorno")) return "Devolvido: a geração falhou";
  if (base.startsWith("assinatura")) return "Assinatura Pro";
  if (base.startsWith("pacote")) return "Pacote de créditos";
  if (base.startsWith("ajuste")) return "Ajuste";
  return m;
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Historico() {
  const c = useConta();
  const [geracoes, setGeracoes] = useState<Geracao[] | null>(null);
  const [creditos, setCreditos] = useState<Movimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { user, token } = c;

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/historico", { headers: { Authorization: `Bearer ${t}` } }))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setGeracoes(d.geracoes);
        setCreditos(d.creditos);
      })
      .catch((e) => setErro(e.message));
  }, [user, token]);

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seu histórico.</Link>
      </main>
    );
  }

  const statusRotulo: Record<string, string> = { concluido: "Pronta", falhou: "Falhou", gerando: "Gerando", upscaling: "Gerando", sem_credito: "Sem crédito" };

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoComprar={c.comprar} aoSair={c.sair} ocupado={c.ocupado}>
      <h1 className="text-2xl font-semibold">Histórico</h1>
      <p className="mt-1 text-sm text-neutral-500">Suas gerações e a movimentação de créditos.</p>
      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <Rotulo>Gerações</Rotulo>
          {geracoes === null ? (
            <p className="text-sm text-neutral-500">Carregando…</p>
          ) : geracoes.length === 0 ? (
            <Cartao>
              <p className="text-sm text-neutral-600">Nada ainda. <Link href="/" className="text-marca-indigo underline">Gere sua primeira foto</Link>.</p>
            </Cartao>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {geracoes.map((g) => (
                <li key={g.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  <div className="aspect-[4/3] bg-neutral-100">
                    {g.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-neutral-400">{statusRotulo[g.status] ?? g.status}</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{g.acao}</p>
                    {g.detalhe && <p className="text-xs text-neutral-500">{g.detalhe}</p>}
                    <p className="mt-1 text-xs text-neutral-400">
                      {dataCurta(g.criadoEm)} · {statusRotulo[g.status] ?? g.status}
                      {g.reportado && " · reportada"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="lg:col-span-4">
          <Rotulo>Créditos</Rotulo>
          <Cartao className="p-0">
            {creditos === null ? (
              <p className="p-4 text-sm text-neutral-500">Carregando…</p>
            ) : creditos.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Sem movimentação.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {creditos.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{humanizarMotivo(m.motivo)}</p>
                      <p className="text-xs text-neutral-400">{dataCurta(m.em)}</p>
                    </div>
                    <span className={"shrink-0 font-semibold " + (m.delta > 0 ? "text-marca-teal" : "text-neutral-700")}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
