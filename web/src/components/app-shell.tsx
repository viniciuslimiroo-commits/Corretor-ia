"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { rotuloDoPlano } from "@/lib/planos";
import { Botao, Icone } from "./ui";
import { Bandeira, useIdioma } from "@/i18n/cliente";
import { IDIOMAS } from "@/i18n/idiomas";
import { Marca } from "./marca";
import { linkDeSuporte } from "@/lib/contato";

// Moldura comum das telas logadas: marca, navegação, créditos e conta. O conteúdo da
// página entra no meio. Manter isto num lugar só é o que faz Editor, Vídeo, Imóveis,
// Equipe, Histórico e Minha marca parecerem o mesmo produto.
//
// O CABEÇALHO FOI REFEITO em 17/09. Ele mandou print em 1280px: "está meio confusa essa
// parte, informações por cima". Medido: o menu ia até 815px e o "+ Criar" começava em 692
// -- 123px encavalados, com Materiais, Equipe, Histórico e Minha marca escondidos embaixo.
// Eram 14 alvos numa linha de 1152px, quatro deles só ícone, e coisa de CONTA (idioma,
// sair, equipe, histórico, marca, plano) misturada com o caminho de TRABALHO.
//
// Três propostas foram julgadas contra as medidas. Ficou:
//   - em cima, só trabalho, tudo ESCRITO: Editar foto · Vídeos · Editor │ Imóveis · Galeria · Materiais;
//   - à direita: "+ Criar", um selo só de créditos (com "Assinar" dentro) e a bolinha da conta;
//   - na bolinha: Minha marca, Equipe, Histórico, Planos, idioma e Sair.
//
// Orçamento de largura (pior caso: espanhol, saldo de 4 dígitos, item ativo em negrito):
// sobra de ~72px em 1280 e ~71px em 1024; barra do celular com no máximo 7 fatias.
// Item novo no menu = remedir nas duas larguras.

export type Conta = {
  email: string;
  creditos: number | null;
  plano: string | null;
  status: string | null;
  renovaEm: string | null;
  /** "org" quando a pessoa é membro de uma imobiliária: saldo e plano são os dela. */
  tipo: "user" | "org";
  org: {
    id: string;
    nome: string;
    papel: "dono" | "gestor" | "corretor";
    pessoas: number;
    limite: number;
  } | null;
  /** O estado da marca, pra decidir a tela de boas-vindas e o aviso de "complete". */
  marca: {
    onboarding: string | null;
    progresso: number;
    nome: string | null;
    temLogo: boolean;
    daImobiliaria: boolean;
  } | null;
};

/**
 * Tudo que o produto cria, num lugar só.
 *
 * O custo entra no menu de propósito: "quanto custa isso?" é a primeira pergunta de quem
 * tem 23 créditos, e responder depois do clique é responder tarde.
 */
const CRIAR = [
  // Os textos são CHAVES do dicionário (i18n/textos.ts); viram frase no render.
  {
    href: "/editar",
    rotulo: "menu.criar.foto",
    para: "menu.criar.foto.para",
    custo: "menu.criar.foto.custo",
    icone: "foto",
    gratis: false,
  },
  // Vai pra /videos, não pro Editor: quem aperta "+ Criar" quer o vídeo, não a bancada.
  {
    href: "/videos",
    rotulo: "menu.criar.video",
    para: "menu.criar.video.para",
    custo: "menu.criar.video.custo",
    icone: "video",
    gratis: false,
  },
  {
    href: "/materiais?novo=1",
    rotulo: "menu.criar.material",
    para: "menu.criar.material.para",
    custo: "menu.criar.material.custo",
    icone: "materiais",
    gratis: true,
  },
];

const PAPEL: Record<"dono" | "gestor" | "corretor", string> = {
  dono: "dono",
  gestor: "gestor",
  corretor: "corretor",
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
  const [menu, setMenu] = useState<"criar" | "conta" | null>(null);
  const assinante = conta.status === "active" || conta.status === "past_due";
  const pendente = conta.status === "past_due";
  const gerencia = !conta.org || conta.org.papel !== "corretor";
  const { t, idioma, definir } = useIdioma();

  // Esc fecha o menu aberto -- quem abre um menu por engano procura o Esc antes do clique fora.
  useEffect(() => {
    if (!menu) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [menu]);

  // Os caminhos de TRABALHO. Nenhum só-ícone: a varinha do Editor ninguém entendia.
  //
  // Editar foto e Vídeos ficam ESCRITOS no menu de cima (pedido dele: é mais rápido que
  // abrir o "+ Criar"). O "+ Criar" continua porque carrega o custo antes do clique.
  //
  // `grupo`: "fazer" (onde se cria) e "achar" (onde as coisas estão), separados por um
  // filete no computador. `soMobile`/`soDesktop`: Início só na barra do celular (no
  // computador a marca já leva pra lá); Editar foto só em cima (no celular, com ele a
  // barra passava de 7 fatias e o dedo errava -- lá quem edita usa o "+ Criar").
  type LinkMenu = {
    href: string;
    rotulo: string;
    icone: string;
    grupo: "fazer" | "achar";
    soMobile?: boolean;
    soDesktop?: boolean;
    dica?: string;
  };
  const links: LinkMenu[] = (
    [
      {
        href: "/",
        rotulo: "menu.inicio",
        icone: "casa",
        grupo: "achar",
        soMobile: true,
      },
      {
        href: "/editar",
        rotulo: "menu.editar",
        icone: "foto",
        grupo: "fazer",
        soDesktop: true,
      },
      // "Vídeos" é o caminho rápido de todo dia; o Editor é a bancada completa. Os dois
      // existem, lado a lado -- um não substitui o outro.
      {
        href: "/videos",
        rotulo: "menu.videos",
        icone: "video",
        grupo: "fazer",
      },
      {
        href: "/editor",
        rotulo: "menu.editor",
        icone: "magica",
        grupo: "fazer",
        dica: "menu.editor.dica",
      },
      {
        href: "/imoveis",
        rotulo: "menu.imoveis",
        icone: "imoveis",
        grupo: "achar",
      },
      // Galeria é o INSUMO (foto, planta, vídeo); Materiais é o ENTREGÁVEL (book, catálogo).
      {
        href: "/galeria",
        rotulo: "menu.galeria",
        icone: "materiais",
        grupo: "achar",
      },
      {
        href: "/materiais",
        rotulo: "menu.materiais",
        icone: "planta",
        grupo: "achar",
      },
    ] as LinkMenu[]
  ).map((l) => ({
    ...l,
    rotulo: t(l.rotulo),
    dica: l.dica ? t(l.dica) : undefined,
  }));

  // O que é da CONTA, não do trabalho do dia: vai pra bolinha.
  const daConta = [
    {
      href: "/marca",
      rotulo: t("menu.marca"),
      icone: "marca",
      extra: conta.marca && conta.marca.progresso < 100 ? `${conta.marca.progresso}%` : null,
    },
    { href: "/equipe", rotulo: t("menu.equipe"), icone: "equipe", extra: null },
    {
      href: "/historico",
      rotulo: t("menu.historico"),
      icone: "historico",
      extra: null,
    },
  ];

  const criar = CRIAR.map((c) => ({
    ...c,
    rotulo: t(c.rotulo),
    para: t(c.para),
    custo: t(c.custo),
  }));
  const ativo = (href: string) => (href === "/" ? rota === "/" : rota.startsWith(href));
  const inicial = (conta.email.trim()[0] ?? "?").toUpperCase();
  const saldo = conta.creditos ?? "…";
  const planoTexto = assinante ? rotuloDoPlano(conta.plano) : "Grátis";

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* shrink-0: sem isso o flex espreme a marca e o texto (nowrap) vaza por cima do menu.
              Entre 1024 e 1279 fica só o símbolo: com a palavra, o espanhol encostava. */}
          <Link href="/" aria-label="Encena" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
            <Marca className="text-lg lg:hidden xl:inline" />
          </Link>

          {/* Menu de trabalho, a partir de 1024. SEM `min-w-0`: com ele, faltar espaço virava
              sobreposição calada; sem ele, vira barra de rolagem, que um teste enxerga. */}
          <nav aria-label={t("menu.navegacao")} className="ml-2 hidden items-center gap-0.5 lg:flex xl:gap-1">
            {links
              .filter((l) => !l.soMobile)
              .map((l, i, lista) => (
                <Fragment key={l.href}>
                  {i > 0 && lista[i - 1].grupo !== l.grupo && <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-neutral-200" />}
                  <Link
                    href={l.href}
                    title={l.dica}
                    aria-current={ativo(l.href) ? "page" : undefined}
                    className={
                      "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition xl:px-3 " +
                      (ativo(l.href) ? "bg-marca-indigo/10 font-medium text-marca-indigo" : "text-neutral-600 hover:bg-neutral-100")
                    }
                  >
                    {l.rotulo}
                  </Link>
                </Fragment>
              ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* A ação principal do produto, no mesmo lugar em todas as telas.
                O custo aparece ANTES do clique: é a pergunta que o corretor faz primeiro. */}
            <span className="relative">
              <Botao onClick={() => setMenu((m) => (m === "criar" ? null : "criar"))} aria-expanded={menu === "criar"} className="px-3 py-2 text-sm">
                <span className="text-base leading-none">+</span>
                {t("comum.criar")}
              </Botao>
              {menu === "criar" && (
                <>
                  <span className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                  <span className="absolute top-full right-0 z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                    {criar.map((c) => (
                      <Link key={c.href} href={c.href} onClick={() => setMenu(null)} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-neutral-50">
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

            {/* UM selo de créditos. Antes eram dois elementos pro mesmo lugar (/planos): a
                pílula e o botão "Assinar". O "Assinar" agora mora dentro dele, em coral CLARO
                pra não brigar com o "+ Criar", que é coral cheio. */}
            <Link
              href="/planos"
              title={conta.org ? `${conta.org.nome} · ${t("menu.planos")}` : t("menu.planos")}
              className={
                "hidden items-center gap-2 whitespace-nowrap rounded-full border border-neutral-200 bg-white text-sm hover:border-neutral-400 md:inline-flex " +
                (!assinante && gerencia ? "py-1 pr-1 pl-3" : "px-3 py-1.5")
              }
            >
              <span className="font-semibold text-marca-indigo tabular-nums">{saldo}</span>
              <span className="text-neutral-500">
                <span className="xl:hidden">cr.</span>
                <span className="hidden xl:inline">{conta.creditos === 1 ? t("comum.credito") : t("comum.creditos")}</span>
              </span>
              {pendente && <span className="text-amber-600">· {t("menu.pendente")}</span>}
              {!assinante && gerencia && <span className="rounded-full bg-marca-coral/10 px-3 py-1 font-medium text-marca-coral">{t("comum.assinar")}</span>}
            </Link>

            {/* A CONTA: tudo que não é o trabalho do dia. */}
            <span className="relative">
              <button
                type="button"
                onClick={() => setMenu((m) => (m === "conta" ? null : "conta"))}
                aria-expanded={menu === "conta"}
                aria-label={`${t("menu.conta")}: ${conta.email}`}
                title={conta.email}
                className="relative flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition hover:bg-neutral-100"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-indigo text-sm font-semibold text-white">{inicial}</span>
                <Icone nome="baixo" className="h-3 w-3 text-neutral-500" />
                {/* No celular o selo fica escondido: o aviso de pagamento pendente vai aqui. */}
                {pendente && <span className="absolute top-0 left-7 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />}
              </button>
              {menu === "conta" && (
                <>
                  <span className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                  <div className="absolute top-full right-0 z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                    <div className="px-3 pt-2 pb-2.5">
                      <p className="truncate text-sm font-medium text-neutral-900">{conta.email}</p>
                      {conta.org && (
                        <p className="truncate text-xs text-neutral-500">
                          {conta.org.nome} · {PAPEL[conta.org.papel]}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-neutral-600">
                        <span className="font-semibold text-marca-indigo tabular-nums">{saldo}</span> {conta.creditos === 1 ? t("comum.credito") : t("comum.creditos")} ·{" "}
                        {planoTexto}
                        {pendente && <span className="text-amber-600"> · {t("menu.pendente")}</span>}
                      </p>
                    </div>
                    <div className="border-t border-neutral-100 py-1">
                      <a
                        href={linkDeSuporte(`Suporte Encena.ai · ${conta.email ?? ""}`.trim())}
                        onClick={() => setMenu(null)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        <Icone nome="email" className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{t("comum.suporte")}</span>
                      </a>
                      {daConta.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setMenu(null)}
                          className={
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm " +
                            (ativo(l.href) ? "bg-marca-indigo/10 text-marca-indigo" : "text-neutral-700 hover:bg-neutral-50")
                          }
                        >
                          <Icone nome={l.icone} className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{l.rotulo}</span>
                          {l.extra && <span className="text-xs text-marca-coral">{l.extra}</span>}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-neutral-100 py-1">
                      <Link href="/planos" onClick={() => setMenu(null)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                        <Icone nome="planos" className="h-4 w-4 shrink-0" />
                        {t("menu.planos")}
                      </Link>
                      {assinante && gerencia && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenu(null);
                            aoAssinar();
                          }}
                          disabled={ocupado}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                        >
                          <Icone nome="configuracoes" className="h-4 w-4 shrink-0" />
                          {t("menu.assinatura")}
                        </button>
                      )}
                    </div>
                    {/* Idioma em três botões, e não uma lista dentro de outro menu. De quebra,
                        passa a existir no celular, onde o seletor antigo ficava escondido. */}
                    <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2">
                      <span className="text-xs text-neutral-500">{t("menu.idioma")}</span>
                      <span className="flex gap-1">
                        {IDIOMAS.map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => definir(i.id)}
                            aria-pressed={idioma === i.id}
                            title={i.rotulo}
                            className={
                              "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition " +
                              (idioma === i.id
                                ? "border-marca-indigo bg-marca-indigo/10 font-medium text-marca-indigo"
                                : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                            }
                          >
                            <Bandeira id={i.id} className="h-3 w-4" />
                            {i.curto}
                          </button>
                        ))}
                      </span>
                    </div>
                    <div className="border-t border-neutral-100 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null);
                          aoSair();
                        }}
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        {t("comum.sair")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Navegação no celular e no tablet (abaixo de 1024): até 7 fatias. Sem "Mais": o
            que ia nele era Editor (agora na barra, escrito) e coisa de conta (agora na
            bolinha). Os créditos entram só abaixo de 768, onde o selo de cima some. */}
        <nav aria-label={t("menu.navegacao")} className="relative flex items-center justify-around border-t border-neutral-100 lg:hidden">
          {links
            .filter((l) => !l.soDesktop)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={ativo(l.href) ? "page" : undefined}
                className={"flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] tracking-tight " + (ativo(l.href) ? "text-marca-indigo" : "text-neutral-500")}
              >
                <Icone nome={l.icone} className="h-5 w-5" />
                <span className="max-w-full truncate">{l.rotulo}</span>
              </Link>
            ))}
          <Link
            href="/planos"
            className={
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] tracking-tight md:hidden " + (ativo("/planos") ? "text-marca-indigo" : "text-neutral-500")
            }
          >
            <Icone nome="planos" className="h-5 w-5" />
            <span className="max-w-full truncate">{saldo} cr.</span>
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
