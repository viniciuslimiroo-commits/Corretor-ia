"use client";

import { useState } from "react";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Landing from "@/components/landing";
import Inicio from "@/components/inicio";
import OnboardingMarca from "@/components/onboarding-marca";

// A raiz decide quem está entrando: quem não tem conta vê a página de venda; quem tem, vê
// a casa dele. O editor de fotos, que morava aqui, foi pra /editar -- era ele ocupando a
// raiz que fazia o produto não ter página inicial.
//
// Entre os dois entrou a tela de marca, uma vez só na vida da conta: enquanto
// `marca.onboarding` for null, a pessoa nunca a viu. Ela mora AQUI, e não numa rota
// própria com redirecionamento, porque redirecionar faria o painel montar e piscar antes
// de sumir -- e porque quem pula precisa cair no painel no mesmo quadro, sem navegar.

export default function Raiz() {
  const c = useConta();
  // Fecha a tela na hora do clique, sem esperar o /api/conta responder de novo: a
  // releitura vem atrás e confirma. Sem isso, "Pular" deixa a tela parada por um segundo,
  // que é exatamente o tempo de a pessoa clicar de novo.
  const [dispensado, setDispensado] = useState(false);

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) return <Landing />;

  if (!dispensado && c.conta.marca && c.conta.marca.onboarding === null) {
    return (
      <OnboardingMarca
        conta={c.conta}
        token={c.token}
        aoSair={() => {
          setDispensado(true);
          c.recarregar();
        }}
      />
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <Inicio conta={c.conta} token={c.token} />
    </AppShell>
  );
}
