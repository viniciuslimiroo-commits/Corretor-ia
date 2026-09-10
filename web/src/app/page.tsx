"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Acao = "mobiliar" | "esvaziar" | "melhorar" | "trocar_ceu";

const ACOES: { valor: Acao; rotulo: string }[] = [
  { valor: "mobiliar", rotulo: "Mobiliar (estilo Moderno)" },
  { valor: "esvaziar", rotulo: "Esvaziar cômodo" },
  { valor: "melhorar", rotulo: "Melhorar foto escura" },
  { valor: "trocar_ceu", rotulo: "Trocar céu (pôr do sol)" },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checandoAuth, setCheckandoAuth] = useState(true);
  const [creditos, setCreditos] = useState<number | null>(null);

  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao>("mobiliar");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [infoResultado, setInfoResultado] = useState<{
    largura: number;
    altura: number;
    modelo: string;
    upscaled: boolean;
    aviso: string | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // Auth: pega o usuário logado (e reage a login/logout).
  useEffect(() => {
    if (!supabase) {
      setCheckandoAuth(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setCheckandoAuth(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Saldo de créditos: lê direto de users.creditos_saldo (a fonte da verdade desde a
  // migration-02) -- é o servidor, em /api/gerar, que atualiza esse número de forma
  // atômica. Aqui é só leitura/espelho pra UI.
  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("users")
      .select("creditos_saldo")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) return;
        setCreditos(data.creditos_saldo);
      });
  }, [user, resultado]); // recalcula depois de cada geração

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    setFoto(arquivo);
    setResultado(null);
    setErro(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  function removerFoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(null);
    setPreview(null);
    setResultado(null);
    setErro(null);
    // Sem isto, escolher a MESMA foto de novo não dispara onChange (bug achado no QA).
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  async function sair() {
    await supabase?.auth.signOut();
  }

  async function gerar() {
    if (!foto || !user || !supabase) return;
    if (creditos !== null && creditos <= 0) {
      setErro("Você não tem créditos. (No MVP ainda não tem tela de compra -- fase 3 do plano.)");
      return;
    }
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setInfoResultado(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirou -- faça login de novo.");

      const form = new FormData();
      form.append("foto", foto);
      form.append("acao", acao);
      const resp = await fetch("/api/gerar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Falha ao gerar.");
      setResultado(data.url);
      setInfoResultado({
        largura: data.width,
        altura: data.height,
        modelo: data.modelo,
        upscaled: data.upscaled,
        aviso: data.aviso,
      });
      // O job e o débito de crédito já aconteceram no servidor -- aqui só re-lemos o
      // saldo (o useEffect acima dispara de novo porque `resultado` mudou).
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }

  if (checandoAuth) {
    return <main className="p-12 font-sans text-sm text-neutral-500">Carregando...</main>;
  }

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
        <p className="rounded border bg-yellow-50 p-4 text-sm text-yellow-900">
          Supabase ainda não configurado. Preencha{" "}
          <code className="font-mono">web/.env.local</code> com
          <code className="font-mono"> NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> e reinicie o
          servidor (<code className="font-mono">npm run dev</code>).
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
        <h1 className="text-2xl font-semibold">Bem-vindo</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Faça login pra testar a geração de imagem com IA.
        </p>
        <a href="/login" className="mt-6 inline-block rounded bg-black px-4 py-2 text-white">
          Entrar
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">Olá, {user.email}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Créditos: <strong>{creditos ?? "..."}</strong>
          </p>
        </div>
        <button onClick={sair} className="shrink-0 text-sm text-neutral-500 underline">
          Sair
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <label className="w-fit cursor-pointer rounded border px-4 py-2 hover:bg-neutral-100">
            {foto ? `📷 ${foto.name}` : "📷 Escolher foto"}
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              onChange={aoEscolherFoto}
              className="hidden"
            />
          </label>
          {foto && (
            <button
              onClick={removerFoto}
              className="rounded border px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              title="Remover foto"
            >
              ✕ Remover
            </button>
          )}
        </div>

        <select
          className="w-fit rounded border px-3 py-2"
          value={acao}
          onChange={(e) => setAcao(e.target.value as Acao)}
        >
          {ACOES.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </select>

        <button
          onClick={gerar}
          disabled={!foto || carregando || creditos === 0}
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {carregando ? "Gerando..." : "Gerar"}
        </button>

        {creditos === 0 && (
          <p className="text-sm text-amber-600">
            Você não tem créditos. (No MVP ainda não tem tela de compra -- fase 3 do plano.)
          </p>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {preview && (
            <div className="min-w-0">
              <p className="mb-1 text-xs uppercase text-neutral-500">Original</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Foto original" className="w-full max-w-full rounded border" />
            </div>
          )}
          {resultado && (
            <div className="min-w-0">
              <p className="mb-1 text-xs uppercase text-neutral-500">Resultado</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Resultado gerado" className="w-full max-w-full rounded border" />
              {infoResultado && (
                <p className="mt-1 text-xs text-neutral-500">
                  {infoResultado.largura}×{infoResultado.altura}px
                  {infoResultado.upscaled ? " · upscaled" : ""} · {infoResultado.modelo}
                  {infoResultado.aviso && (
                    <span className="block text-amber-600">⚠ {infoResultado.aviso}</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
