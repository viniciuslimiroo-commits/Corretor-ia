"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import { OFERTAS, formatarReais, type Oferta, type OfertaId } from "@/lib/planos";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Icone } from "@/components/ui";

// Planos: duas assinaturas (mensal e anual) e três pacotes avulsos. Preço em real,
// crédito explicado em foto ("1 crédito = 1 foto"), e o que cada um inclui. Quem já
// assina vê o plano atual e vai pro portal da Stripe pra trocar ou cancelar.

function CartaoOferta({ o, atual, aoEscolher, ocupado, logado }: { o: Oferta; atual: boolean; aoEscolher: (id: OfertaId) => void; ocupado: boolean; logado: boolean }) {
  return (
    <div className={"relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm " + (o.destaque ? "border-marca-coral ring-2 ring-marca-coral/30" : "border-neutral-200")}>
      {o.destaque && <span className="absolute -top-3 left-5 rounded-full bg-marca-coral px-3 py-0.5 text-xs font-semibold text-white">Mais vantajoso</span>}
      <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{o.rotulo}</p>
      <p className="mt-2 text-3xl font-semibold text-neutral-900">
        {formatarReais(o.preco)}
        {o.periodo && <span className="text-base font-normal text-neutral-500">/{o.periodo}</span>}
      </p>
      <p className="mt-1 text-sm text-neutral-600">{o.descricao}</p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm text-neutral-700">
        {o.detalhes.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" />
            {d}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {atual ? (
          <Botao variante="secundaria" onClick={() => aoEscolher(o.id)} disabled={ocupado} className="w-full">Seu plano · gerenciar</Botao>
        ) : logado ? (
          <Botao variante={o.destaque || o.tipo === "assinatura" ? "primaria" : "secundaria"} onClick={() => aoEscolher(o.id)} disabled={ocupado} className="w-full">
            {o.tipo === "assinatura" ? "Assinar" : "Comprar"}
          </Botao>
        ) : (
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">
            Entrar para {o.tipo === "assinatura" ? "assinar" : "comprar"}
          </Link>
        )}
      </div>
    </div>
  );
}

const PERGUNTAS = [
  { p: "O que é um crédito?", r: "Uma geração: uma foto editada com uma ação (mobiliar, trocar piso, remover objeto…). Se o resultado ficar ruim, você pede o crédito de volta e ele volta." },
  { p: "Os créditos expiram?", r: "Os da assinatura valem enquanto ela estiver ativa; os do pacote não expiram. Ao cancelar, o que você já tem continua valendo até acabar." },
  { p: "Posso cancelar quando quiser?", r: "Sim, com um clique em \"Gerenciar assinatura\". Sem multa e sem ligar pra ninguém." },
  { p: "Recebo nota fiscal?", r: "A cobrança é feita pela Stripe, com recibo por e-mail em toda transação. A nota fiscal de serviço é emitida mensalmente." },
];

export default function Planos() {
  const c = useConta();
  const [aviso, setAviso] = useState<string | null>(null);
  const assinante = c.conta?.status === "active" || c.conta?.status === "past_due";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("compra") === "cancelada" || params.get("assinatura") === "cancelada") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setAviso("Pagamento não concluído. Nada foi cobrado."), 0);
    }
  }, []);

  const assinaturas = OFERTAS.filter((o) => o.tipo === "assinatura");
  const pacotes = OFERTAS.filter((o) => o.tipo === "pacote");

  const conteudo = (
    <>
      {aviso && (
        <div className="mb-4">
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}
      {c.erro && (
        <div className="mb-4">
          <Aviso tipo="erro">{c.erro}</Aviso>
        </div>
      )}

      <h1 className="text-2xl font-semibold">Planos e créditos</h1>
      <p className="mt-1 text-sm text-neutral-500">1 crédito = 1 foto editada. Toda conta começa com 5 grátis, sem cartão.</p>
      {c.conta && (
        <p className="mt-2 text-sm text-neutral-700">
          Você tem <strong>{c.conta.creditos ?? 0}</strong> {c.conta.creditos === 1 ? "crédito" : "créditos"}
          {assinante && c.conta.renovaEm && <> · Pro renova em {new Date(c.conta.renovaEm).toLocaleDateString("pt-BR")}</>}
          {c.conta.status === "past_due" && <span className="text-amber-700"> · pagamento pendente, atualize o cartão em &quot;Gerenciar assinatura&quot;</span>}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Assinatura Pro</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {assinaturas.map((o) => (
            <CartaoOferta key={o.id} o={o} atual={assinante && o.tipo === "assinatura"} aoEscolher={(id) => c.assinar(id)} ocupado={c.ocupado} logado={!!c.user} />
          ))}
        </div>
      </section>

      <section id="pacotes" className="mt-10">
        <h2 className="text-lg font-semibold">Pacotes avulsos</h2>
        <p className="mt-1 text-sm text-neutral-500">Sem assinatura, pagamento único. Somam com o que você já tem.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {pacotes.map((o) => (
            <CartaoOferta key={o.id} o={o} atual={false} aoEscolher={(id) => c.assinar(id)} ocupado={c.ocupado} logado={!!c.user} />
          ))}
        </div>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold">Perguntas comuns</h2>
        <dl className="mt-3 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {PERGUNTAS.map((q) => (
            <div key={q.p} className="px-5 py-4">
              <dt className="font-medium">{q.p}</dt>
              <dd className="mt-1 text-sm text-neutral-600">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;

  if (!c.user || !c.conta) {
    return (
      <main className="min-h-screen bg-neutral-50 font-sans">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              <span className="text-lg font-bold tracking-tight text-marca-indigo">Encena</span>
            </Link>
            <Link href="/login" className="ml-auto text-sm text-marca-indigo underline">Entrar</Link>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{conteudo}</div>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      {conteudo}
    </AppShell>
  );
}
