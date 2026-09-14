"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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

/**
 * Tudo que o produto cria, num lugar só.
 *
 * O custo entra no menu de propósito: "quanto custa isso?" é a primeira pergunta de quem
 * tem 23 créditos, e responder depois do clique é responder tarde.
 */
const CRIAR = [
  { href: "/editar", rotulo: "Editar uma foto", para: "Mobiliar, renovar, tirar objeto, trocar céu", custo: "1 crédito por foto", icone: "foto", gratis: false },
  { href: "/video", rotulo: "Fazer um vídeo", para: "Do imóvel, com música e narração", custo: "Créditos conforme o tamanho", icone: "video", gratis: false },
  { href: "/books?novo=1", rotulo: "Montar um material", para: "Book, PDF de WhatsApp, catálogo, portfólio", custo: "Não gasta crédito", icone: "materiais", gratis: true },
];

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
  const [maisAberto, setMaisAberto] = useState(false);
  const [criarAberto, setCriarAberto] = useState(false);
  const assinante = conta.status === "active" || conta.status === "past_due";
  const gerencia = !conta.org || conta.org.papel !== "corretor";

  // `soIcone` = no menu de cima entra só o ícone (com o nome no title). A barra tem
  // 1152px e o nome inteiro não cabe junto do resto; embaixo, no celular, vai completo.
  const links: { href: string; rotulo: string; icone: string; soIcone: boolean; secundario?: boolean; soMobile?: boolean }[] = [
    // No computador a marca no canto já leva pro início -- dois caminhos pro mesmo lugar
    // gastam a largura que Books precisava. No celular não há marca clicável, então fica.
    { href: "/", rotulo: "Início", icone: "casa", soIcone: false, soMobile: true },
    // Editar e Vídeo saíram daqui e foram pro botão "+ Criar".
    //
    // A barra misturava dois VERBOS (Editar, Vídeo) com três LUGARES (Imóveis, Acervo,
    // Materiais), e por isso "onde eu crio?" não tinha resposta óbvia: dependia do que ia
    // ser criado. Agora a navegação só diz ONDE as coisas estão, e a criação inteira --
    // foto, vídeo e material -- é um botão só, visível em toda tela.
    { href: "/editar", rotulo: "Editar", icone: "foto", soIcone: false, soMobile: true },
    { href: "/video", rotulo: "Vídeo", icone: "video", soIcone: false, soMobile: true },
    { href: "/imoveis", rotulo: "Imóveis", icone: "imoveis", soIcone: false },
    // "Materiais", não "Biblioteca": biblioteca é onde coisa fica guardada, e esta tela é
    // onde o material é FEITO. "Material" também é a palavra que o corretor já usa
    // ("me manda o material do imóvel"), e serve pros dois lados: o que ele tem e o que monta.
    // Acervo e o INSUMO (foto, planta, terreno, video); Materiais e o ENTREGAVEL (book,
    // catalogo, apresentacao). Chamar os dois de "Materiais" era a colisao que fazia a
    // pessoa procurar o book na tela das fotos.
    { href: "/materiais", rotulo: "Acervo", icone: "materiais", soIcone: false },
    { href: "/books", rotulo: "Materiais", icone: "planta", soIcone: false },
    // Equipe virou só ícone quando Materiais entrou: o nome inteiro dos dois não cabe
    // junto do resto na barra de 1152px.
    // `secundario` = no celular sai da barra de baixo e vai pro "Mais": nove ícones numa
    // tela de 375px viram 41px cada, onde ninguém acerta o dedo.
    { href: "/equipe", rotulo: "Equipe", icone: "equipe", soIcone: true, secundario: true },
    { href: "/historico", rotulo: "Histórico", icone: "historico", soIcone: true, secundario: true },
    { href: "/marca", rotulo: "Minha marca", icone: "marca", soIcone: true, secundario: true },
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
            <span className="whitespace-nowrap text-lg font-bold tracking-tight text-marca-indigo">Encena</span>
          </Link>

          {/* Menu completo só a partir de xl. A barra tem no máximo 1152px (max-w-6xl) e a
              marca + 6 itens + créditos + botões passam disso -- abaixo daqui vale a barra
              de baixo. Mexeu em item do menu? Confira a colisão em 1280 e 1024. */}
          <nav className="ml-1 hidden min-w-0 items-center gap-0.5 xl:flex">
            {links.filter((l) => !l.soMobile).map((l) => (
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
            {/* A ação principal do produto, no mesmo lugar em todas as telas.
                O custo aparece ANTES do clique: é a pergunta que o corretor faz primeiro. */}
            <span className="relative">
              <Botao onClick={() => setCriarAberto((v) => !v)} className="px-3 py-2 text-sm">
                <span className="text-base leading-none">+</span>
                Criar
              </Botao>
              {criarAberto && (
                <>
                  <span className="fixed inset-0 z-30" onClick={() => setCriarAberto(false)} />
                  <span className="absolute top-full right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                    {CRIAR.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={() => setCriarAberto(false)}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-neutral-50"
                      >
                        <Icone nome={c.icone} className="mt-0.5 h-4 w-4 shrink-0 text-marca-indigo" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-neutral-900">{c.rotulo}</span>
                          <span className="block text-xs text-neutral-500">{c.para}</span>
                          <span className={"mt-0.5 block text-[11px] " + (c.gratis ? "text-marca-teal" : "text-neutral-400")}>{c.custo}</span>
                        </span>
                      </Link>
                    ))}
                  </span>
                </>
              )}
            </span>

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

        {/* navegação no celular: cinco destinos, créditos e "Mais" */}
        <nav className="relative flex items-center justify-around border-t border-neutral-100 xl:hidden">
          {links
            .filter((l) => !l.secundario)
            .map((l) => (
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
          <button
            type="button"
            onClick={() => setMaisAberto((v) => !v)}
            aria-expanded={maisAberto}
            className={"flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] " + (maisAberto ? "text-marca-indigo" : "text-neutral-500")}
          >
            <Icone nome={maisAberto ? "fechar" : "mais"} className="h-5 w-5" />
            Mais
          </button>
          {maisAberto && (
            // top-full, não bottom-full: no celular esta barra fica no ALTO da tela (dentro
            // do cabeçalho fixo), então um painel que abre pra cima sai pela borda -- os
            // dois primeiros itens ficavam cortados.
            <div className="absolute top-full right-2 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
              {links
                .filter((l) => l.secundario)
                .map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMaisAberto(false)}
                    className={"flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm " + (ativo(l.href) ? "bg-marca-indigo/10 text-marca-indigo" : "text-neutral-700 hover:bg-neutral-50")}
                  >
                    <Icone nome={l.icone} className="h-4 w-4" />
                    {l.rotulo}
                  </Link>
                ))}
            </div>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-400 sm:px-6">
        Toda imagem alterada sai com o aviso &quot;imagem ilustrativa&quot;. É o que protege o seu anúncio.
      </footer>
    </div>
  );
}
