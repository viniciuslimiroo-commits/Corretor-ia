"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Botao, Icone } from "./ui";

// Moldura comum das telas logadas: marca, navegação, créditos e conta. O conteúdo da
// página entra no meio. Manter isto num lugar só é o que faz Editor, Histórico e
// Configurações parecerem o mesmo produto.

export type Conta = {
  email: string;
  creditos: number | null;
  plano: string | null;
  status: string | null;
  renovaEm: string | null;
};

export default function AppShell({
  conta,
  aoAssinar,
  aoComprar,
  aoSair,
  ocupado = false,
  children,
}: {
  conta: Conta;
  aoAssinar: () => void;
  aoComprar: () => void;
  aoSair: () => void;
  ocupado?: boolean;
  children: ReactNode;
}) {
  const rota = usePathname();
  const assinante = conta.status === "active" || conta.status === "past_due";

  const links = [
    { href: "/", rotulo: "Editar", icone: "foto" },
    { href: "/historico", rotulo: "Histórico", icone: "historico" },
    { href: "/configuracoes", rotulo: "Minha marca", icone: "configuracoes" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
            <span className="text-lg font-bold tracking-tight text-marca-indigo">Encena</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {links.map((l) => {
              const ativo = rota === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition " +
                    (ativo ? "bg-marca-indigo/10 font-medium text-marca-indigo" : "text-neutral-600 hover:bg-neutral-100")
                  }
                >
                  <Icone nome={l.icone} className="h-4 w-4" />
                  {l.rotulo}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm sm:flex">
              <span className="font-semibold text-marca-indigo">{conta.creditos ?? "…"}</span>
              <span className="text-neutral-500">{conta.creditos === 1 ? "crédito" : "créditos"}</span>
              <span className="text-neutral-300">·</span>
              <span className="text-neutral-600">{assinante ? "Pro" : "Grátis"}</span>
              {conta.status === "past_due" && <span className="text-amber-600">· pendente</span>}
            </div>
            {assinante ? (
              <Botao variante="discreta" onClick={aoAssinar} disabled={ocupado} className="hidden sm:inline-flex">
                Gerenciar assinatura
              </Botao>
            ) : (
              <Botao variante="primaria" onClick={aoAssinar} disabled={ocupado} className="hidden sm:inline-flex">
                Assinar Pro
              </Botao>
            )}
            <Botao variante="secundaria" onClick={aoComprar} disabled={ocupado} className="hidden sm:inline-flex" title="80 créditos, pagamento único">
              +80 créditos
            </Botao>
            <Botao variante="discreta" onClick={aoSair} title={conta.email}>
              Sair
            </Botao>
          </div>
        </div>

        {/* navegação no celular */}
        <nav className="flex items-center justify-around border-t border-neutral-100 sm:hidden">
          {links.map((l) => {
            const ativo = rota === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={"flex flex-1 flex-col items-center gap-0.5 py-2 text-xs " + (ativo ? "text-marca-indigo" : "text-neutral-500")}
              >
                <Icone nome={l.icone} className="h-5 w-5" />
                {l.rotulo}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-400 sm:px-6">
        Toda imagem alterada sai com o aviso &quot;imagem ilustrativa&quot;. É o que protege o seu anúncio.
      </footer>
    </div>
  );
}
