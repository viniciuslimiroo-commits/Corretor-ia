"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Cartao, Icone } from "@/components/ui";

// Imóveis: a lista de projetos. Cada cartão é um anúncio com suas fotos; clicar abre a
// galeria. "Novo imóvel" cria na hora, sem formulário grande: nome e, se quiser,
// endereço -- o resto é a foto.

type Imovel = { id: string; titulo: string; endereco: string | null; fotos: number; compartilhado: boolean; atualizadoEm: string; capa: string | null };

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function Imoveis() {
  const c = useConta();
  const router = useRouter();
  const [imoveis, setImoveis] = useState<Imovel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { user, token } = c;

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/imoveis", { headers: { Authorization: `Bearer ${t}` } }))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setImoveis(d.imoveis);
      })
      .catch((e) => setErro(e.message));
  }, [user, token]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/imoveis", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ titulo, endereco }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      router.push(`/imoveis/${d.imovel.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui criar.");
      setOcupado(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver seus imóveis.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Imóveis</h1>
          <p className="mt-1 text-sm text-neutral-500">Cada anúncio com suas fotos, antes e depois, e um link pra mandar ao cliente.</p>
        </div>
        {!criando && (
          <Botao onClick={() => setCriando(true)}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo imóvel
          </Botao>
        )}
      </div>

      {criando && (
        <Cartao className="mt-5">
          <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome</span>
              <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Ex.: Apto 302 · Setor Bueno" className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none" />
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Endereço (opcional)</span>
              <input value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={160} placeholder="Rua, número, bairro" className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none" />
            </label>
            <div className="flex gap-2">
              <Botao type="submit" disabled={ocupado || !titulo.trim()}>{ocupado ? "Criando…" : "Criar"}</Botao>
              <Botao type="button" variante="discreta" onClick={() => setCriando(false)}>Cancelar</Botao>
            </div>
          </form>
        </Cartao>
      )}

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-6">
        {imoveis === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : imoveis.length === 0 ? (
          <Cartao>
            <p className="font-medium">Nenhum imóvel ainda.</p>
            <p className="mt-1 text-sm text-neutral-600">Crie um e escolha ele no editor na hora de gerar. Ou vá direto <Link href="/editar" className="text-marca-indigo underline">editar uma foto</Link>: dá pra guardar no imóvel depois.</p>
          </Cartao>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((i) => (
              <li key={i.id}>
                <Link href={`/imoveis/${i.id}`} className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-400">
                  <div className="aspect-[4/3] bg-neutral-100">
                    {i.capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.capa} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <Icone nome="imoveis" className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="truncate font-semibold">{i.titulo}</p>
                    {i.endereco && <p className="truncate text-sm text-neutral-500">{i.endereco}</p>}
                    <p className="mt-2 text-xs text-neutral-400">
                      {i.fotos} {i.fotos === 1 ? "foto" : "fotos"} · {dataCurta(i.atualizadoEm)}
                      {i.compartilhado && " · link ativo"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
