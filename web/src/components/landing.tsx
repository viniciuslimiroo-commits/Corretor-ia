"use client";

import Link from "next/link";
import { ACOES } from "@/lib/acoes";
import { OFERTAS, formatarReais } from "@/lib/planos";
import Comparador from "./comparador";
import { Icone } from "./ui";
import { SeletorIdioma, useIdioma } from "@/i18n/cliente";

// Página inicial de quem ainda não entrou. É a peça de venda: antes e depois reais
// (resultados dos testes, com o selo de imagem ilustrativa que o produto sempre coloca),
// como funciona, o que faz, planos e perguntas. Sem depoimento inventado, sem número
// que não medimos.
//
// Todo texto passa por `t()`. É a primeira tela em três idiomas porque é a que alguém do
// México ou dos EUA vê antes de decidir se entra. As AÇÕES (mobiliar, renovar…) têm chave
// própria no dicionário -- o catálogo em `acoes.ts` continua em português, que é o que o
// editor mostra por enquanto.

const EXEMPLOS = [
  { id: "sala", chave: "landing.ex.sala", antes: "/exemplos/sala-antes.jpg", depois: "/exemplos/sala-depois.jpg" },
  { id: "quarto", chave: "landing.ex.quarto", antes: "/exemplos/quarto-antes.jpg", depois: "/exemplos/quarto-depois.jpg" },
  { id: "cozinha", chave: "landing.ex.cozinha", antes: "/exemplos/cozinha-antes.jpg", depois: "/exemplos/cozinha-depois.jpg" },
  { id: "parede", chave: "landing.ex.parede", antes: "/exemplos/parede-antes.jpg", depois: "/exemplos/parede-depois.jpg" },
];

const PERGUNTAS = [1, 2, 3, 4, 5, 6, 7] as const;

const CHECK = (cor: string) => <Icone nome="check" className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />;

export default function Landing() {
  const { t } = useIdioma();
  const pro = OFERTAS.find((o) => o.id === "pro_mensal")!;
  const equipe = OFERTAS.find((o) => o.id === "equipe_mensal")!;
  const imobiliaria = OFERTAS.find((o) => o.id === "imobiliaria_mensal")!;
  const acoes = ACOES.filter((a) => a.id !== "editar_prompt" && !a.oculta);
  const mes = t("comum.mes");

  return (
    <main className="min-h-screen bg-white font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="whitespace-nowrap text-xl font-bold tracking-tight text-marca-indigo">Encena</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-neutral-600 sm:flex">
            <a href="#como" className="hover:text-marca-indigo">{t("landing.nav.como")}</a>
            <a href="#recursos" className="hover:text-marca-indigo">{t("landing.nav.recursos")}</a>
            <a href="#imobiliarias" className="hover:text-marca-indigo">{t("landing.nav.praquem")}</a>
            <Link href="/planos" className="hover:text-marca-indigo">{t("landing.nav.planos")}</Link>
          </nav>
          <SeletorIdioma className="ml-auto sm:ml-0" />
          <Link href="/login" className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">{t("comum.entrar")}</Link>
          <Link href="/login" className="hidden rounded-lg bg-marca-coral px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro sm:inline-flex">{t("landing.testar")}</Link>
        </div>
      </header>

      {/* ---------- herói ---------- */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-10 lg:grid-cols-12 lg:items-center lg:pt-20">
        <div className="lg:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-coral">{t("marca.linha")}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] text-neutral-900 sm:text-5xl">{t("marca.h1")}</h1>
          <p className="mt-5 max-w-lg text-lg text-neutral-600">{t("landing.hero.p")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-lg bg-marca-coral px-5 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
              {t("landing.comecar")}
            </Link>
            <span className="text-sm text-neutral-500">{t("landing.sem.cartao")}</span>
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
            {(["landing.b1", "landing.b2", "landing.b3", "landing.b4"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> {t(k)}</li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-7">
          <Comparador antes={EXEMPLOS[0].antes} depois={EXEMPLOS[0].depois} />
          <p className="mt-2 text-center text-xs text-neutral-500">{t(EXEMPLOS[0].chave)}. {t("landing.arraste")}</p>
        </div>
      </section>

      {/* ---------- exemplos ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {EXEMPLOS.slice(1).map((e) => (
            <figure key={e.id}>
              <Comparador antes={e.antes} depois={e.depois} />
              <figcaption className="mt-2 text-sm text-neutral-600">{t(e.chave)}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- como funciona ---------- */}
      <section id="como" className="scroll-mt-20 bg-neutral-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.como.h2")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {(["1", "2", "3"] as const).map((n) => (
              <li key={n} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-pessego font-bold text-marca-indigo">{n}</span>
                <p className="mt-3 font-semibold">{t(`landing.como.${n}t`)}</p>
                <p className="mt-1 text-sm text-neutral-600">{t(`landing.como.${n}d`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- recursos ---------- */}
      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.rec.h2")}</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.rec.p")}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {acoes.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
                <Icone nome={a.id} />
              </span>
              <div>
                <p className="font-semibold">{t(`acao.${a.id}.rotulo`)}</p>
                <p className="text-sm text-neutral-500">{t(`acao.${a.id}.descricao`)}</p>
              </div>
            </li>
          ))}
          {(
            [
              ["video", "landing.rec.video", true],
              ["tour360", "landing.rec.tour", true],
              ["planta", "landing.rec.planta", true],
              ["terreno", "landing.rec.terreno", true],
              ["lote", "landing.rec.lote", false],
              ["compartilhar", "landing.rec.links", false],
              ["download", "landing.rec.export", false],
            ] as const
          ).map(([icone, chave, semCredito]) => (
            <li
              key={chave}
              className={
                "flex items-start gap-3 rounded-2xl p-4 " +
                (semCredito ? "border border-marca-coral/40 bg-marca-pessego/30" : "border border-neutral-200")
              }
            >
              <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-marca-indigo " + (semCredito ? "bg-white" : "bg-marca-pessego")}>
                <Icone nome={icone} />
              </span>
              <div>
                <p className="font-semibold">
                  {t(chave)} {semCredito && <span className="text-xs font-normal text-marca-coral">{t("landing.sem.credito")}</span>}
                </p>
                <p className={"text-sm " + (semCredito ? "text-neutral-600" : "text-neutral-500")}>{t(`${chave}.d`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- pra quem é ---------- */}
      <section id="imobiliarias" className="scroll-mt-20 bg-marca-indigo py-14 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-pessego">{t("landing.quem.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t("landing.quem.h2")}</h2>
          <p className="mt-3 max-w-2xl text-white/80">{t("landing.quem.p")}</p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">{t("landing.plano.corretor")}</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(pro.preco)}<span className="text-base font-normal text-white/70">{mes}</span>
              </p>
              <p className="text-sm text-white/80">{t("landing.plano.fotos.mes", { n: pro.creditos })}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/90">
                {(["landing.c1", "landing.c2", "landing.c3"] as const).map((k) => (
                  <li key={k} className="flex gap-2">{CHECK("text-marca-pessego")} {t(k)}</li>
                ))}
              </ul>
              <Link href="/login" className="mt-5 inline-flex items-center justify-center rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/25">{t("landing.testar")}</Link>
            </div>

            <div className="flex flex-col rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">{t("landing.plano.equipe")}</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(equipe.preco)}<span className="text-base font-normal text-white/70">{mes}</span>
              </p>
              <p className="text-sm text-white/80">{t("landing.plano.creditos.mes", { n: equipe.creditos ?? 0, p: equipe.pessoas ?? 0 })}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/90">
                {(["landing.e1", "landing.e2", "landing.e3"] as const).map((k) => (
                  <li key={k} className="flex gap-2">{CHECK("text-marca-pessego")} {t(k)}</li>
                ))}
              </ul>
              <Link href="/planos#imobiliaria" className="mt-5 inline-flex items-center justify-center rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/25">{t("landing.ver.equipe")}</Link>
            </div>

            <div className="flex flex-col rounded-2xl bg-white p-5 text-neutral-900 shadow-lg">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-coral">{t("landing.plano.imobiliaria")}</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(imobiliaria.preco)}<span className="text-base font-normal text-neutral-500">{mes}</span>
              </p>
              <p className="text-sm text-neutral-600">{t("landing.plano.creditos.mes", { n: imobiliaria.creditos ?? 0, p: imobiliaria.pessoas ?? 0 })}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-700">
                {(["landing.i1", "landing.i2", "landing.i3", "landing.i4"] as const).map((k) => (
                  <li key={k} className="flex gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
                ))}
              </ul>
              <Link href="/planos#imobiliaria" className="mt-5 inline-flex items-center justify-center rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">{t("landing.ver.imobiliaria")}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- preço ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.preco.h2")}</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t("comum.gratis")}</p>
            <p className="mt-1 text-3xl font-semibold">R$ 0</p>
            <p className="text-sm text-neutral-600">{t("landing.preco.gratis.d")}</p>
          </div>
          <div className="rounded-2xl border-2 border-marca-coral p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{pro.rotulo.replace(" mensal", "")}</p>
            <p className="mt-1 text-3xl font-semibold">{formatarReais(pro.preco)}<span className="text-base font-normal text-neutral-500">{mes}</span></p>
            <p className="text-sm text-neutral-600">{t("landing.preco.pro.d", { n: pro.creditos })}</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t("landing.preco.pacotes")}</p>
            <p className="mt-1 text-3xl font-semibold">{t("landing.preco.apartir")}</p>
            <p className="text-sm text-neutral-600">{t("landing.preco.pacotes.d")}</p>
          </div>
        </div>
        <Link href="/planos" className="mt-5 inline-block text-marca-indigo underline">{t("landing.preco.todos")}</Link>
      </section>

      {/* ---------- perguntas ---------- */}
      <section className="bg-neutral-50 py-14">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.faq.h2")}</h2>
          <dl className="mt-6 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
            {PERGUNTAS.map((n) => (
              <div key={n} className="px-5 py-4">
                <dt className="font-medium">{t(`landing.faq.${n}p`)}</dt>
                <dd className="mt-1 text-sm text-neutral-600">{t(`landing.faq.${n}r`)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 text-center">
            <Link href="/login" className="inline-flex rounded-lg bg-marca-coral px-6 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">{t("landing.cta.final")}</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5 font-semibold text-marca-indigo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={16} height={16} className="h-4 w-4" /> Encena
          </span>
          <span className="text-neutral-400">encena.app.br</span>
          <Link href="/termos" className="hover:text-marca-indigo">{t("landing.rodape.termos")}</Link>
          <Link href="/privacidade" className="hover:text-marca-indigo">{t("landing.rodape.privacidade")}</Link>
          <Link href="/planos" className="hover:text-marca-indigo">{t("landing.rodape.planos")}</Link>
          <SeletorIdioma />
          <span className="ml-auto">{t("landing.rodape.aviso")}</span>
        </div>
      </footer>
    </main>
  );
}
