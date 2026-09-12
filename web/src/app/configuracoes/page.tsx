"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import { Aviso, Botao, Cartao, Rotulo } from "@/components/ui";

// Minha marca: o logo do corretor que pode ir carimbado nas fotos exportadas, no canto
// oposto ao aviso de imagem ilustrativa. A Pedra chama de Branding.

export default function Configuracoes() {
  const c = useConta();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [cor, setCor] = useState<string>("#0F2D5B");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { user, token } = c;

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/marca", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logoUrl ?? null);
        if (d.cor) setCor(d.cor);
      })
      .catch(() => {});
  }, [user, token]);

  async function enviar(logo?: File) {
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const form = new FormData();
      if (logo) form.append("logo", logo);
      form.append("cor", cor);
      const resp = await fetch("/api/marca", { method: "POST", headers: { Authorization: `Bearer ${await c.token()}` }, body: form });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setLogoUrl(d.logoUrl ?? null);
      setMensagem(logo ? "Logo salvo. Ele aparece como opção na hora de baixar." : "Salvo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerLogo() {
    setSalvando(true);
    try {
      await fetch("/api/marca", { method: "DELETE", headers: { Authorization: `Bearer ${await c.token()}` } });
      setLogoUrl(null);
      setMensagem("Logo removido.");
    } finally {
      setSalvando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para configurar sua marca.</Link>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoComprar={c.comprar} aoSair={c.sair} ocupado={c.ocupado}>
      <h1 className="text-2xl font-semibold">Minha marca</h1>
      <p className="mt-1 text-sm text-neutral-500">Seu logo pode sair carimbado nas fotos que você baixa, no canto inferior esquerdo.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Cartao>
            <Rotulo>Logo</Rotulo>
            {logoUrl ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-xl border border-neutral-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Seu logo" className="max-h-24 max-w-[220px]" />
                </div>
                <div className="flex gap-2">
                  <Dropzone compacto rotulo="Trocar logo" onArquivo={(f) => enviar(f)} />
                  <Botao variante="perigo" onClick={removerLogo} disabled={salvando}>Remover</Botao>
                </div>
              </div>
            ) : (
              <Dropzone rotulo="Enviar meu logo" onArquivo={(f) => enviar(f)} />
            )}
            <p className="mt-3 text-xs text-neutral-500">PNG com fundo transparente fica melhor. Ele é redimensionado para no máximo 18% da largura da foto.</p>
          </Cartao>

          <Cartao className="mt-4">
            <Rotulo>Cor da marca</Rotulo>
            <div className="flex items-center gap-3">
              <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-neutral-200 bg-white p-1" />
              <code className="text-sm text-neutral-600">{cor.toUpperCase()}</code>
              <Botao variante="secundaria" onClick={() => enviar()} disabled={salvando}>Salvar</Botao>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Vai ser usada nas legendas e nos vídeos.</p>
          </Cartao>

          {mensagem && <div className="mt-4"><Aviso tipo="ok">{mensagem}</Aviso></div>}
          {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
        </section>

        <aside className="lg:col-span-5">
          <Cartao>
            <Rotulo>Como aparece</Rotulo>
            <div className="relative overflow-hidden rounded-xl bg-neutral-200" style={{ aspectRatio: "4/3" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-marca-pessego to-neutral-300" />
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="absolute bottom-3 left-3 max-h-[12%] max-w-[18%]" />
              )}
              <span className="absolute right-3 bottom-3 rounded bg-black/55 px-2 py-1 text-[10px] text-white">Imagem ilustrativa · mobília virtual</span>
            </div>
            <p className="mt-3 text-xs text-neutral-500">Seu logo à esquerda, o aviso obrigatório à direita. Os dois saem gravados na foto.</p>
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
