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
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Sem senha -- a gente manda um link mágico pro seu e-mail.
      </p>

      {enviado ? (
        <p className="mt-6 rounded border bg-green-50 p-3 text-sm text-green-800">
          Link enviado! Confere sua caixa de entrada (e o spam) e clica nele.
        </p>
      ) : (
        <form onSubmit={enviarLink} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
          <button
            type="submit"
            disabled={carregando}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
          >
            {carregando ? "Enviando..." : "Enviar link de acesso"}
          </button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>
      )}
    </main>
  );
}
