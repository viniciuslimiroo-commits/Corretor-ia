"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { rotuloDoPlano } from "@/lib/planos";
import { Botao, Icone } from "./ui";

// Moldura comum das telas logadas: marca, navegação, créditos e conta. O conteúdo da
// página entra no meio. Manter isto num lugar só é o que faz Editor, Vídeo, Imóveis,
// Equipe, Histórico e Minha marca parecerem o mesmo produto.

export type Conta = {
  email: string;
  creditos: number | null;
  plano: string | null;
  status: string | null;
  renovaEm: string | null;
  /** "org" quando a pessoa é membro de uma imobiliária: saldo e plano são os dela. */
  tipo: "user" | "org";
  org: { id: string; nome: string; papel: "dono" | "gestor" | "corretor"; pessoas: number; limite: number } | null;
};

export default function AppShell({
  conta,
  aoAssinar,
  aoSair,
  ocupado = false,
  children,
}: {
  conta: Conta;
  /** Abre o portal da Stripe (só faz sentido pra quem já assina). */
  aoAssinar: () => void;
  aoSair: () => void;
  ocupado?: boolean;
  children: ReactNode;
}) {
  const rota = usePathname();
  const assinante = conta.status === "active" || conta.status === "past_due";
  const gerencia = !conta.org || conta.org.papel !== "corretor";

  // `soIcone` = no menu de cima entra só o ícone (com o nome no title). A barra tem
  // 1152px e o nome inteiro não cabe junto do resto; embaixo, no celular, vai completo.
  const links = [
    { href: "/", rotulo: "Início", icone: "casa", soIcone: false },
    { href: "/editar", rotulo: "Editar", icone: "foto", soIcone: false },
    { href: "/video", rotulo: "Vídeo", icone: "video", soIcone: false },
    { href: "/imoveis", rotulo: "Imóveis", icone: "imoveis", soIcone: false },
    { href: "/equipe", rotulo: conta.org ? "Equipe" : "Imobiliária", icone: "equipe", soIcone: false },
    { href: "/historico", rotulo: "Histórico", icone: "historico", soIcone: true },
    { href: "/configuracoes", rotulo: "Minha marca", icone: "configuracoes", soIcone: true },
  ];
  const ativo = (href: string) => (href === "/" ? rota === "/" : rota.startsWith(href));

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* shrink-0: sem isso o flex espreme a marca e o texto (nowrap) vaza por cima do menu */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
            <span className="whitespace-nowrap text-lg font-bold tracking-tight text-marca-indigo">Encena <span className="text-marca-teal">IA</span></span>
          </Link>

          {/* Menu completo só a partir de xl. A barra tem no máximo 1152px (max-w-6xl) e a
              marca + 6 itens + créditos + botões passam disso -- abaixo daqui vale a barra
              de baixo. Mexeu em item do menu? Confira a colisão em 1280 e 1024. */}
          <nav className="ml-1 hidden min-w-0 items-center gap-0.5 xl:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                title={l.rotulo}
                aria-label={l.rotulo}
                className={
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg py-1.5 text-sm transition " +
                  (l.soIcone ? "px-2 " : "px-2.5 ") +
                  (ativo(l.href) ? "bg-marca-indigo/10 font-medium text-marca-indigo" : "text-neutral-600 hover:bg-neutral-100")
                }
              >
                <Icone nome={l.icone} className="h-4 w-4 shrink-0" />
                {!l.soIcone && l.rotulo}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* o nome da imobiliária saiu daqui: empurrava o menu e já aparece em /equipe.
                Fica no title, pra quem passa o mouse. */}
            <Link
              href="/planos"
              className="hidden items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400 md:flex"
              title={conta.org ? `${conta.org.nome} · ver planos e pacotes` : "Ver planos e pacotes"}
            >
              <span className="font-semibold text-marca-indigo">{conta.creditos ?? "…"}</span>
              <span className="text-neutral-500">{conta.creditos === 1 ? "crédito" : "créditos"}</span>
              <span className="text-neutral-300">·</span>
              <span className="text-neutral-600">{assinante ? rotuloDoPlano(conta.plano) : "Grátis"}</span>
              {conta.status === "past_due" && <span className="text-amber-600">· pendente</span>}
            </Link>
            {gerencia &&
              (assinante ? (
                <Botao variante="discreta" onClick={aoAssinar} disabled={ocupado} className="hidden md:inline-flex">
                  Gerenciar assinatura
                </Botao>
              ) : (
                <Link href="/planos" className="hidden items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro md:inline-flex">
                  {conta.org ? "Assinar" : "Assinar Pro"}
                </Link>
              ))}
            {/* "Comprar créditos" saiu do cabeçalho: não cabia junto do menu, e o próprio
                seletor de créditos ao lado já leva pra /planos. Continua em /planos#pacotes. */}
            <Botao variante="discreta" onClick={aoSair} title={conta.email}>
              Sair
            </Botao>
          </div>
        </div>

        {/* navegação no celular */}
        <nav className="flex items-center justify-around border-t border-neutral-100 xl:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={"flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] " + (ativo(l.href) ? "text-marca-indigo" : "text-neutral-500")}
            >
              <Icone nome={l.icone} className="h-5 w-5" />
              {l.rotulo}
            </Link>
          ))}
          <Link href="/planos" className={"flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] " + (ativo("/planos") ? "text-marca-indigo" : "text-neutral-500")}>
            <Icone nome="planos" className="h-5 w-5" />
            {conta.creditos ?? "…"} cr.
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-400 sm:px-6">
        Toda imagem alterada sai com o aviso &quot;imagem ilustrativa&quot;. É o que protege o seu anúncio.
      </footer>
    </div>
  );
}
