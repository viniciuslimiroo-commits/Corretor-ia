"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, BotaoConfirma, Cartao, Icone } from "@/components/ui";
import { guardarSelecao } from "@/lib/selecao-material";
import FichaTecnica, { type Ficha } from "@/components/ficha-tecnica";

// Um imóvel: a galeria. Cada geração mostra o "depois" e vira "antes" com um toque;
// dá pra escolher a capa, compartilhar uma foto só, baixar pro anúncio e tirar do
// imóvel. "Editar nova foto" manda pro editor já com este imóvel selecionado.

type Imovel = { id: string; titulo: string; endereco: string | null; compartilhado: boolean; ficha: Ficha };
type Geracao = {
  id: string;
  acao: string;
  detalhe: string;
  status: string;
  criadoEm: string;
  reportado: boolean;
  compartilhado: boolean;
  antes: string | null;
  depois: string | null;
  capa: boolean;
};

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CartaoFoto({
  g,
  token,
  tituloImovel,
  aoCapa,
  aoTirar,
}: {
  g: Geracao;
  token: () => Promise<string>;
  tituloImovel: string;
  aoCapa: () => Promise<void>;
  aoTirar: () => Promise<void>;
}) {
  const [mostrandoAntes, setMostrandoAntes] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pronta = g.status === "concluido" && !!g.depois;

  async function rodar(nome: string, fn: () => Promise<void>) {
    setOcupado(nome);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
  }

  async function baixar() {
    const resp = await fetch("/api/exportar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ jobId: g.id, portal: "zap_vivareal_olx" }),
    });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `encena-${g.acao.toLowerCase().replace(/\s+/g, "-")}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-neutral-100">
        {pronta ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mostrandoAntes && g.antes ? g.antes : g.depois!} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">{g.status === "concluido" ? "Sem imagem" : "Gerando…"}</div>
        )}
        {pronta && g.antes && (
          <button
            onClick={() => setMostrandoAntes((v) => !v)}
            className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white"
          >
            {mostrandoAntes ? "Ver depois" : "Ver antes"}
          </button>
        )}
        {g.capa && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-marca-coral px-2 py-1 text-xs font-medium text-white">
            <Icone nome="estrela" className="h-3 w-3" /> Capa
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-sm font-medium">{g.acao}</p>
        {g.detalhe && <p className="text-xs text-neutral-500">{g.detalhe}</p>}
        <p className="mt-1 text-xs text-neutral-400">
          {dataCurta(g.criadoEm)}
          {g.reportado && " · reportada"}
        </p>
        {pronta && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Botao variante="discreta" onClick={() => rodar("baixar", baixar)} disabled={ocupado !== null} className="px-2 py-1 text-xs">
                <Icone nome="download" className="h-3.5 w-3.5" />
                {ocupado === "baixar" ? "Baixando…" : "Baixar"}
              </Botao>
              <Compartilhar token={token} jobId={g.id} compartilhadoInicial={g.compartilhado} texto={`Olha como ficou: ${tituloImovel}`} compacto />
            </div>
            <div className="mt-auto flex justify-end gap-3 pt-2 text-xs text-neutral-500">
              {!g.capa && (
                <button onClick={() => rodar("capa", aoCapa)} disabled={ocupado !== null} className="underline disabled:opacity-40">
                  Usar como capa
                </button>
              )}
              <button onClick={() => rodar("tirar", aoTirar)} disabled={ocupado !== null} className="underline disabled:opacity-40">
                Tirar do imóvel
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export default function PaginaImovel() {
  const c = useConta();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [geracoes, setGeracoes] = useState<Geracao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const { user, token } = c;

  // Baixar o imóvel inteiro: o servidor monta o ZIP já no tamanho do portal, com logo.
  async function baixarTudo() {
    setBaixando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/imoveis/${id}/zip?portal=zap_vivareal_olx&logo=1`, { headers: { Authorization: `Bearer ${await token()}` } });
      if (!r.ok) throw new Error((await r.json()).error ?? "Não consegui montar o arquivo.");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]) ?? "encena.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao baixar.");
    } finally {
      setBaixando(false);
    }
  }

  /**
   * Book, PDF de WhatsApp, apresentação: tudo isso mora em Materiais agora. Daqui a gente
   * só leva as fotos deste imóvel já marcadas, com a capa na frente -- o montador é um só,
   * pra não existirem dois caminhos que geram o mesmo PDF com telas diferentes.
   */
  function montarMaterial() {
    const prontas = (geracoes ?? []).filter((g) => g.status === "concluido" && g.depois);
    const comCapaNaFrente = [...prontas].sort((a, b) => (a.capa ? -1 : b.capa ? 1 : 0));
    guardarSelecao(comCapaNaFrente.map((g) => g.id));
    router.push("/materiais/montar");
  }

  // Busca sem tocar em estado: quem escreve na tela é sempre um callback de promessa.
  // (A regra react-hooks/set-state-in-effect rejeita `await` seguido de setState dentro
  // de algo chamado direto do efeito.)
  const buscar = useCallback(async (): Promise<{ imovel: Imovel; geracoes: Geracao[] }> => {
    const t = await token();
    const r = await fetch(`/api/imoveis/${id}`, { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }, [id, token]);

  const aplicar = useCallback((d: { imovel: Imovel; geracoes: Geracao[] }) => {
    setImovel(d.imovel);
    setGeracoes(d.geracoes);
    setTitulo(d.imovel.titulo);
    setEndereco(d.imovel.endereco ?? "");
  }, []);

  const carregar = useCallback(() => buscar().then(aplicar), [buscar, aplicar]);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then(aplicar)
      .catch((e: Error) => setErro(e.message));
  }, [user, buscar, aplicar]);

  async function patchImovel(corpo: Record<string, unknown>) {
    const resp = await fetch(`/api/imoveis/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(corpo),
    });
    const d = await resp.json();
    if (!resp.ok) throw new Error(d.error);
  }

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      await patchImovel({ titulo, endereco });
      setEditando(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setOcupado(false);
    }
  }

  async function definirCapa(jobId: string) {
    try {
      await patchImovel({ capaJobId: jobId });
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao definir a capa.");
    }
  }

  async function tirarDoImovel(jobId: string) {
    await fetch(`/api/job/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ imovelId: null }),
    });
    await carregar();
  }

  async function excluir() {
    setOcupado(true);
    try {
      const resp = await fetch(`/api/imoveis/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } });
      if (!resp.ok) throw new Error((await resp.json()).error);
      router.push("/imoveis");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
      setOcupado(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver este imóvel.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <p className="text-sm">
        <Link href="/imoveis" className="text-neutral-500 hover:text-marca-indigo">← Imóveis</Link>
      </p>

      {erro && (
        <div className="mt-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {imovel && (
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          {editando ? (
            <form onSubmit={salvarDados} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} className="rounded-lg border border-neutral-200 px-3 py-2 text-lg font-semibold focus:border-marca-indigo focus:outline-none" />
              <input value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={160} placeholder="Endereço" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none" />
              <div className="flex gap-2">
                <Botao type="submit" variante="secundaria" disabled={ocupado || !titulo.trim()}>Salvar</Botao>
                <Botao type="button" variante="discreta" onClick={() => setEditando(false)}>Cancelar</Botao>
              </div>
            </form>
          ) : (
            <div>
              <h1 className="text-2xl font-semibold">
                {imovel.titulo}{" "}
                <button onClick={() => setEditando(true)} className="ml-1 align-middle text-xs font-normal text-neutral-500 underline">editar</button>
              </h1>
              <p className="mt-1 text-sm text-neutral-500">{imovel.endereco || "Sem endereço"}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/lote?imovel=${imovel.id}`} className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
              <Icone nome="lote" className="h-4 w-4" />
              Editar fotos em lote
            </Link>
            <Link href={`/editar?imovel=${imovel.id}`} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
              <Icone nome="mais" className="h-4 w-4" />
              Uma foto
            </Link>
            {(geracoes ?? []).some((g) => g.status === "concluido") && (
              <>
                <Botao variante="secundaria" onClick={baixarTudo} disabled={baixando} title="Todas as fotos prontas, no tamanho dos portais">
                  <Icone nome="download" className="h-4 w-4" />
                  {baixando ? "Preparando…" : "Baixar tudo"}
                </Botao>
                <Botao onClick={montarMaterial} title="Book, PDF de WhatsApp, catálogo ou apresentação, com as fotos deste imóvel">
                  <Icone nome="materiais" className="h-4 w-4" />
                  Criar material
                </Botao>
              </>
            )}
            <Compartilhar token={token} imovelId={imovel.id} compartilhadoInicial={imovel.compartilhado} texto={`Olha as fotos de ${imovel.titulo}:`} compacto />
            <BotaoConfirma
              pergunta="Excluir este imóvel?"
              detalhe="As fotos continuam no seu histórico e em Materiais; some só o agrupamento."
              confirmar="Excluir"
              aoConfirmar={excluir}
              disabled={ocupado}
              className="px-2 py-1 text-xs"
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              Excluir
            </BotaoConfirma>
          </div>

        </div>
      )}

      {imovel && (
        <div className="mt-5">
          <FichaTecnica
            ficha={imovel.ficha ?? {}}
            aoSalvar={async (mudancas) => {
              await patchImovel(mudancas);
              await carregar();
            }}
          />
        </div>
      )}

      <div className="mt-6">
        {geracoes === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : geracoes.length === 0 ? (
          <Cartao>
            <p className="font-medium">Ainda sem fotos.</p>
            <p className="mt-1 text-sm text-neutral-600">
              <Link href={`/?imovel=${id}`} className="text-marca-indigo underline">Edite a primeira foto</Link> com este imóvel selecionado e ela aparece aqui.
            </p>
          </Cartao>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {geracoes.map((g) => (
              <CartaoFoto key={g.id} g={g} token={token} tituloImovel={imovel?.titulo ?? "Imóvel"} aoCapa={() => definirCapa(g.id)} aoTirar={() => tirarDoImovel(g.id)} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
