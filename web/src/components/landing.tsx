"use client";

import { useState } from "react";
import Link from "next/link";
import { OFERTAS, formatarReais } from "@/lib/planos";
import Comparador from "./comparador";
import { Icone } from "./ui";
import { SeletorIdioma, useIdioma } from "@/i18n/cliente";
import { Marca } from "./marca";
import { linkDeSuporte } from "@/lib/contato";

// Página inicial de quem ainda não entrou. É a peça de venda: antes e depois reais
// (resultados dos testes, com o selo de imagem ilustrativa que o produto sempre coloca),
// o que sai de uma foto, como funciona, por que num lugar só, e preço. Sem depoimento
// inventado, sem número que não medimos.
//
// REVISÃO DE 20/09/2026. O que a página era: quatro comparações de foto seguidas e um muro
// de vinte cartões iguais -- quem chegava entendia "editor de foto com IA" e ia embora sem
// saber que existe vídeo, planta, terreno, book e link. E o preço aparecia duas vezes.
// Regra desta versão: UMA seção, UMA promessa, UMA imagem grande; o catálogo completo de
// ações fica pra dentro do app. A ordem responde, nesta sequência, às três perguntas de
// quem nunca viu: o que é isso, o que eu consigo fazer aqui, por que não cinco ferramentas.
//
// Toda imagem é fotografia de verdade: os antes e depois saíram do próprio Encena
// (scripts/gerar-exemplos-landing.mjs), as telas são capturas do produto e as fotos de
// ambiente vêm do Pexels com licença de uso comercial -- ver docs/fotos-da-landing.md.
//
// Todo texto passa por `t()`. É a primeira tela em três idiomas porque é a que alguém do
// México ou dos EUA vê antes de decidir se entra.

const EXEMPLOS = [
  { id: "casa", chave: "landing.ex.casa", antes: "/exemplos/casa-antes.jpg", depois: "/exemplos/casa-depois.jpg" },
  { id: "jantar", chave: "landing.ex.jantar", antes: "/exemplos/jantar-antes.jpg", depois: "/exemplos/jantar-depois.jpg" },
  { id: "cozinha", chave: "landing.ex.cozinha", antes: "/exemplos/cozinha-antes.jpg", depois: "/exemplos/cozinha-depois.jpg" },
];

/** O que sai de uma foto. Cada aba mostra UMA prova grande, não uma lista. */
const SAIDAS = [
  { id: "foto", imagem: "/exemplos/sala-depois.jpg", credito: true },
  { id: "video", imagem: "/fotos/tela-editor-video.webp", credito: false },
  { id: "planta", imagem: "/fotos/tela-planta.webp", credito: false },
  { id: "material", imagem: "/fotos/post-instagram.jpg", credito: false },
] as const;

const PERGUNTAS = [1, 3, 4, 5, 7] as const;

const CHECK = (cor: string) => <Icone nome="check" className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />;

export default function Landing() {
  const { t } = useIdioma();
  const [saida, setSaida] = useState<(typeof SAIDAS)[number]["id"]>("foto");
  const pro = OFERTAS.find((o) => o.id === "pro_mensal")!;
  const pacotes = OFERTAS.filter((o) => o.tipo === "pacote");
  const mes = t("comum.mes");
  const aberta = SAIDAS.find((s) => s.id === saida)!;

  return (
    <main className="min-h-screen bg-white font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <Marca className="text-xl" />
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-neutral-600 sm:flex">
            <a href="#sai" className="hover:text-marca-indigo">{t("landing.nav.recursos")}</a>
            <a href="#como" className="hover:text-marca-indigo">{t("landing.nav.como")}</a>
            <a href="#imobiliarias" className="hover:text-marca-indigo">{t("landing.nav.praquem")}</a>
            <Link href="/planos" className="hover:text-marca-indigo">{t("landing.nav.planos")}</Link>
          </nav>
          <SeletorIdioma className="ml-auto sm:ml-0" />
          <Link href="/login" className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">{t("comum.entrar")}</Link>
          <Link href="/login" className="hidden rounded-lg bg-marca-coral px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro sm:inline-flex">{t("landing.testar")}</Link>
        </div>
      </header>

      {/* ---------- herói: a promessa e a prova juntas ---------- */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-10 lg:grid-cols-12 lg:items-center lg:pt-20">
        <div className="lg:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-coral">{t("marca.linha")}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] text-neutral-900 sm:text-5xl">{t("landing.hero.h1")}</h1>
          <p className="mt-5 max-w-lg text-lg text-neutral-600">{t("landing.hero.p")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-lg bg-marca-coral px-5 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
              {t("landing.comecar")}
            </Link>
            <span className="text-sm text-neutral-500">{t("landing.sem.cartao")}</span>
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-neutral-600">
            {(["landing.b1", "landing.b2", "landing.b3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-7">
          <Comparador antes="/exemplos/sala-antes.jpg" depois="/exemplos/sala-depois.jpg" />
          <p className="mt-2 text-center text-xs text-neutral-500">{t("landing.hero.legenda")}. {t("landing.arraste")}</p>
        </div>
      </section>

      {/* ---------- o que sai de uma foto ---------- */}
      <section id="sai" className="scroll-mt-20 bg-neutral-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.saidas.h2")}</h2>
          <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.saidas.p")}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {SAIDAS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSaida(s.id)}
                aria-pressed={saida === s.id}
                className={
                  "rounded-full border px-4 py-2 text-sm font-medium transition " +
                  (saida === s.id ? "border-marca-coral bg-marca-coral text-white shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300")
                }
              >
                {t(`landing.saida.${s.id}`)}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white md:grid-cols-5">
            <div className="flex flex-col justify-center gap-3 p-6 md:col-span-2">
              <p className="text-lg font-semibold">{t(`landing.saida.${aberta.id}`)}</p>
              <p className="text-neutral-600">{t(`landing.saida.${aberta.id}.d`)}</p>
              <p className="text-sm">
                {aberta.credito ? (
                  <span className="text-neutral-500">{t("landing.custa.credito")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-marca-pessego/60 px-3 py-1 font-medium text-marca-indigo">{t("landing.sem.credito")}</span>
                )}
              </p>
            </div>
            <div className="bg-neutral-100 md:col-span-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aberta.imagem} alt={t(`landing.saida.${aberta.id}`)} className="h-full w-full object-cover" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- prova: antes e depois ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.prova.h2")}</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.prova.p")}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {EXEMPLOS.map((e) => (
            <figure key={e.id}>
              <Comparador antes={e.antes} depois={e.depois} />
              <figcaption className="mt-2 text-sm text-neutral-600">{t(e.chave)}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- como funciona ---------- */}
      <section id="como" className="scroll-mt-20 bg-neutral-50 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.como.h2")}</h2>
            <ol className="mt-6 grid gap-4">
              {(["1", "2", "3"] as const).map((n) => (
                <li key={n} className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-pessego font-bold text-marca-indigo">{n}</span>
                  <div>
                    <p className="font-semibold">{t(`landing.como.${n}t`)}</p>
                    <p className="mt-1 text-sm text-neutral-600">{t(`landing.como.${n}d`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="lg:col-span-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fotos/corretor-apartamento.jpg" alt={t("landing.como.foto")} className="w-full rounded-2xl object-cover shadow-sm" loading="lazy" />
            <p className="mt-2 text-xs text-neutral-500">{t("landing.como.foto")}</p>
          </div>
        </div>
      </section>

      {/* ---------- por que num lugar só ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.junto.h2")}</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.junto.p")}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t("landing.junto.antes.t")}</p>
            <ul className="mt-4 grid gap-2 text-sm text-neutral-600">
              {(["landing.junto.a1", "landing.junto.a2", "landing.junto.a3"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <Icone nome="fechar" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" /> {t(k)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-marca-coral bg-marca-pessego/20 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-marca-coral">{t("landing.junto.depois.t")}</p>
            <ul className="mt-4 grid gap-2 text-sm text-neutral-700">
              {(["landing.junto.d1", "landing.junto.d2", "landing.junto.d3"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- terreno e lançamento ----------
          As quatro etapas da obra ainda não estão aqui: as imagens que existiam no projeto
          trazem a marca d'água da empresa que fotografou o lote, e o produto não mexe em
          marca de terceiro. Refazer a série pede uma foto de lote licenciada e 4 créditos. */}
      <section className="bg-neutral-50 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.terreno.h2")}</h2>
            <p className="mt-3 text-neutral-600">{t("landing.terreno.p")}</p>
            <ul className="mt-5 grid gap-2 text-sm text-neutral-700">
              {(["landing.terreno.e1", "landing.terreno.e2", "landing.terreno.e3"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-neutral-500">{t("landing.terreno.aviso")}</p>
          </div>
          <div className="lg:col-span-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fotos/bairro-de-cima.jpg" alt={t("landing.terreno.foto")} className="w-full rounded-2xl object-cover shadow-sm" loading="lazy" />
            <p className="mt-2 text-xs text-neutral-500">{t("landing.terreno.foto")}</p>
          </div>
        </div>
      </section>

      {/* ---------- materiais e link ---------- */}
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.material.h2")}</h2>
          <p className="mt-3 text-neutral-600">{t("landing.material.p")}</p>
          <ul className="mt-5 grid gap-2 text-sm text-neutral-700">
            {(["landing.material.s1", "landing.material.s2", "landing.material.s3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fotos/post-instagram.jpg" alt={t("landing.material.s2")} className="w-full rounded-2xl border border-neutral-200 object-cover shadow-sm" loading="lazy" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fotos/story-instagram.jpg" alt={t("landing.material.s2")} className="w-full rounded-2xl border border-neutral-200 object-cover shadow-sm" loading="lazy" />
        </div>
      </section>

      {/* ---------- pra quem é ---------- */}
      <section id="imobiliarias" className="relative scroll-mt-20 overflow-hidden bg-marca-indigo py-14 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fotos/predio-sao-paulo.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" loading="lazy" />
        <div className="relative mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-pessego">{t("landing.quem.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t("landing.quem.h2")}</h2>
          <p className="mt-3 max-w-2xl text-white/80">{t("landing.quem.p")}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white/10 p-6 ring-1 ring-white/20">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">{t("landing.plano.corretor")}</p>
              <ul className="mt-4 grid gap-2 text-sm text-white/90">
                {(["landing.c1", "landing.c2", "landing.c3"] as const).map((k) => (
                  <li key={k} className="flex gap-2">{CHECK("text-marca-pessego")} {t(k)}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-6 text-neutral-900 shadow-lg">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-coral">{t("landing.plano.imobiliaria")}</p>
              <ul className="mt-4 grid gap-2 text-sm text-neutral-700">
                {(["landing.i1", "landing.i2", "landing.i3"] as const).map((k) => (
                  <li key={k} className="flex gap-2">{CHECK("text-marca-teal")} {t(k)}</li>
                ))}
              </ul>
              <Link href="/planos#imobiliaria" className="mt-5 inline-flex items-center justify-center rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">{t("landing.ver.imobiliaria")}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- isso é permitido? ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.seguro.h2")}</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.seguro.p")}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["landing.seguro.1", "landing.seguro.5", "landing.seguro.2", "landing.seguro.3", "landing.seguro.4"] as const).map((k) => (
            <li key={k} className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-700">{CHECK("text-marca-teal")} {t(k)}</li>
          ))}
        </ul>
      </section>

      {/* ---------- preço ---------- */}
      <section className="bg-neutral-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.preco.h2")}</h2>
          <p className="mt-2 max-w-2xl text-neutral-600">{t("landing.preco.p")}</p>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t("comum.gratis")}</p>
              <p className="mt-1 text-3xl font-semibold">R$ 0</p>
              <p className="text-sm text-neutral-600">{t("landing.preco.gratis.d")}</p>
            </div>
            <div className="rounded-2xl border-2 border-marca-coral bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{pro.rotulo.replace(" mensal", "")}</p>
                {pro.lancamento && <span className="rounded-full bg-marca-teal/10 px-2.5 py-0.5 text-xs font-medium text-marca-teal">{t("landing.preco.lancamento")}</span>}
              </div>
              <p className="mt-1 text-3xl font-semibold">{formatarReais(pro.preco)}<span className="text-base font-normal text-neutral-500">{mes}</span></p>
              <p className="text-sm text-neutral-600">{t("landing.preco.pro.d", { n: pro.creditos })}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t("landing.preco.pacotes")}</p>
              <p className="mt-1 text-3xl font-semibold">{t("landing.preco.apartir", { v: formatarReais(Math.min(...pacotes.map((o) => o.preco))) })}</p>
              <p className="text-sm text-neutral-600">{t("landing.preco.pacotes.d", { lista: pacotes.map((o) => o.creditos).join(" · ") })}</p>
            </div>
          </div>
          <Link href="/planos" className="mt-5 inline-block text-marca-indigo underline">{t("landing.preco.todos")}</Link>
        </div>
      </section>

      {/* ---------- perguntas ---------- */}
      <section className="py-14">
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
            <p className="mt-2 text-sm text-neutral-500">{t("landing.cta.sub")}</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5 font-semibold text-marca-indigo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={16} height={16} className="h-4 w-4" /> <Marca className="text-sm" />
          </span>
          <span className="text-neutral-400">encena.app.br</span>
          <Link href="/termos" className="hover:text-marca-indigo">{t("landing.rodape.termos")}</Link>
          <Link href="/privacidade" className="hover:text-marca-indigo">{t("landing.rodape.privacidade")}</Link>
          <Link href="/planos" className="hover:text-marca-indigo">{t("landing.rodape.planos")}</Link>
          <a href={linkDeSuporte("Dúvida sobre o Encena.ai")} className="hover:text-marca-indigo">{t("comum.suporte")}</a>
          <SeletorIdioma paraCima />
          <span className="ml-auto">{t("landing.rodape.aviso")}</span>
        </div>
      </footer>
    </main>
  );
}
