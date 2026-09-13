"use client";

import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Landing from "@/components/landing";
import Inicio from "@/components/inicio";

// A raiz decide quem está entrando: quem não tem conta vê a página de venda; quem tem, vê
// a casa dele. O editor de fotos, que morava aqui, foi pra /editar -- era ele ocupando a
// raiz que fazia o produto não ter página inicial.

export default function Raiz() {
  const c = useConta();

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) return <Landing />;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <Inicio conta={c.conta} token={c.token} />
    </AppShell>
  );
}
