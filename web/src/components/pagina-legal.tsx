import Link from "next/link";
import type { ReactNode } from "react";
import AvisoIdiomaLegal from "./aviso-idioma-legal";
import { Marca } from "./marca";
import { EMAIL_SUPORTE, linkDeSuporte } from "@/lib/contato";

// Moldura das páginas de texto legal (termos, privacidade). Fora do AppShell de
// propósito: quem lê isso pode não estar logado, e a página precisa abrir e imprimir
// limpa. Tipografia larga, linha curta, sem distração.

export function Secao({ n, titulo, children }: { n: string; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-neutral-900">
        <span className="text-marca-coral">{n}.</span> {titulo}
      </h2>
      <div className="prosa mt-2 flex flex-col gap-3 text-neutral-700">{children}</div>
    </section>
  );
}

export default function PaginaLegal({ titulo, atualizado, children }: { titulo: string; atualizado: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white font-sans text-neutral-900">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <Marca className="text-lg" />
          </Link>
          <Link href="/login" className="ml-auto text-sm text-marca-indigo underline">Entrar</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10">
        <AvisoIdiomaLegal />
        <h1 className="text-3xl font-semibold">{titulo}</h1>
        <p className="mt-1 text-sm text-neutral-500">Atualizado em {atualizado}.</p>
        <div className="[&_li]:ml-1 [&_p]:leading-relaxed [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">{children}</div>

        <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-6 text-sm text-neutral-500">
          <Link href="/termos" className="hover:text-marca-indigo">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-marca-indigo">Privacidade</Link>
          <Link href="/planos" className="hover:text-marca-indigo">Planos</Link>
          <a href={linkDeSuporte()} className="ml-auto hover:text-marca-indigo">{EMAIL_SUPORTE}</a>
        </footer>
      </article>
    </main>
  );
}
