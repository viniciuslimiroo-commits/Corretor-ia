"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setErro("Supabase ainda não configurado (falta preencher web/.env.local).");
      return;
    }
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16 font-sans">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização a fazer */}
        <img src="/marca-encena.svg" alt="" width={44} height={44} className="h-11 w-11" />
        <p className="text-3xl font-bold tracking-tight text-marca-indigo">Encena</p>
      </div>
      <h1 className="mt-4 text-2xl font-semibold">Fotos que vendem melhor.</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Inteligência artificial para imóveis
      </p>
      <p className="mt-6 text-sm text-neutral-600">
        Entre com seu e-mail. Sem senha: a gente manda um link de acesso.
      </p>

      {enviado ? (
        <p className="mt-6 rounded border border-marca-teal/40 bg-marca-teal/10 p-3 text-sm text-marca-indigo">
          Link enviado. Confira sua caixa de entrada, e o spam, e clique nele.
        </p>
      ) : (
        <form onSubmit={enviarLink} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2 focus:border-marca-indigo focus:outline-none"
          />
          <button
            type="submit"
            disabled={carregando}
            className="rounded bg-marca-coral px-4 py-2 font-medium text-white hover:bg-marca-coral-escuro disabled:opacity-40"
          >
            {carregando ? "Enviando..." : "Enviar link de acesso"}
          </button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>
      )}

      <p className="mt-10 text-xs text-neutral-400">
        Mobília ambientes vazios, remova objetos, corrija a luz, troque o céu e exporte no
        formato dos portais. Cinco gerações grátis pra testar.
      </p>
    </main>
  );
}
