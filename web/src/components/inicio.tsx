"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Conta } from "./app-shell";
import { Cartao, Icone, Rotulo } from "./ui";

// Página inicial de quem já entrou. Faltava desde sempre: o login caía direto no editor,
// então o produto não tinha porta de entrada -- quem voltava no dia seguinte não via o que
// já tinha feito nem lembrava do que existe além de editar foto.
//
// Três coisas, nesta ordem: continuar de onde parou, as ferramentas, e os imóveis. É
// também a semente da Biblioteca -- o lugar onde o material produzido volta a aparecer.

// Os nomes vêm das rotas /api/historico e /api/imoveis. Conferidos lá, não supostos:
// errei isso na primeira versão (chamei a miniatura de "depois") e a seção sumia calada.
type Geracao = { id: string; acao: string; status: string; miniatura: string | null; criadoEm: string; imovel: { id: string; titulo: string } | null };
type Imovel = { id: string; titulo: string; fotos: number; capa: string | null };

const FERRAMENTAS = [
  { href: "/editar", icone: "foto", titulo: "Editar fotos", texto: "Mobiliar, esvaziar, tirar objeto, trocar piso. Uma foto ou o imóvel inteiro." },
  { href: "/video", icone: "video", titulo: "Vídeo e tour 360°", texto: "As fotos viram vídeo com movimento, música e sua marca. Sem crédito." },
  { href: "/planta", icone: "planta", titulo: "Planta baixa", texto: "Desenhe os cômodos, mobílie e veja a área calculada. Sem crédito." },
  { href: "/terreno", icone: "terreno", titulo: "Terreno e lote", texto: "Marque as medidas na foto, limpe o mato ou mostre a casa construída." },
];

function quando(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function Inicio({ conta, token }: { conta: Conta; token: () => Promise<string> }) {
  const [geracoes, setGeracoes] = useState<Geracao[] | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[] | null>(null);

  useEffect(() => {
    let vivo = true;
    token()
      .then(async (t) => {
        const cab = { Authorization: `Bearer ${t}` };
        const [h, i] = await Promise.all([
          fetch("/api/historico?limite=12", { headers: cab }).then((r) => r.json()),
          fetch("/api/imoveis", { headers: cab }).then((r) => r.json()),
        ]);
        if (!vivo) return;
        setGeracoes((h.geracoes ?? []).filter((g: Geracao) => g.status === "concluido" && g.miniatura).slice(0, 6));
        setImoveis((i.imoveis ?? []).slice(0, 4));
      })
      .catch(() => {
        if (vivo) {
          setGeracoes([]);
          setImoveis([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const primeiroNome = (conta.org?.nome ?? conta.email).split(/[@ ]/)[0];
  const semNada = geracoes !== null && geracoes.length === 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {primeiroNome}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {semNada
              ? "Comece por uma foto de imóvel. Você tem crédito pra testar."
              : "Continue de onde parou, ou comece um material novo."}
          </p>
        </div>
        <Link href="/planos" className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:border-neutral-400">
          <strong className="text-marca-indigo">{conta.creditos ?? "…"}</strong>{" "}
          <span className="text-neutral-500">{conta.creditos === 1 ? "crédito" : "créditos"}</span>
        </Link>
      </div>

      {/* ---- continuar de onde parou ---- */}
      {geracoes === null ? (
        <div className="mt-6 h-24 animate-pulse rounded-2xl bg-neutral-100" />
      ) : geracoes.length > 0 ? (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <Rotulo>Seu material</Rotulo>
            <Link href="/historico" className="text-xs text-marca-indigo underline">ver tudo</Link>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {geracoes.map((g) => (
              <li key={g.id}>
                <Link href="/historico" className="block overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-marca-indigo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.miniatura!} alt="" className="aspect-square w-full object-cover" />
                  <span className="block truncate px-2 py-1.5 text-[11px] text-neutral-600">
                    {g.imovel?.titulo ?? g.acao}
                    <span className="block text-[10px] text-neutral-400">{quando(g.criadoEm)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- as ferramentas ---- */}
      <section className="mt-8">
        <Rotulo>{semNada ? "Por onde começar" : "Criar"}</Rotulo>
        <div className="grid gap-3 sm:grid-cols-2">
          {FERRAMENTAS.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-marca-indigo hover:shadow"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-pessego text-marca-indigo">
                <Icone nome={f.icone} />
              </span>
              <span>
                <span className="block font-semibold">{f.titulo}</span>
                <span className="block text-sm text-neutral-500">{f.texto}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- imóveis ---- */}
      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <Rotulo>Seus imóveis</Rotulo>
          <Link href="/imoveis" className="text-xs text-marca-indigo underline">ver todos</Link>
        </div>
        {imoveis === null ? (
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        ) : imoveis.length === 0 ? (
          <Cartao>
            <p className="text-sm text-neutral-600">
              Nenhum ainda. Um imóvel junta as fotos, o vídeo e a planta num lugar só, e vira um link pra mandar ao cliente.{" "}
              <Link href="/imoveis" className="text-marca-indigo underline">Criar o primeiro</Link>.
            </p>
          </Cartao>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {imoveis.map((i) => (
              <li key={i.id}>
                <Link href={`/imoveis/${i.id}`} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 transition hover:border-marca-indigo">
                  {i.capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.capa} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                      <Icone nome="imoveis" className="h-4 w-4 text-neutral-400" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.titulo}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{i.fotos} {i.fotos === 1 ? "foto" : "fotos"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
