"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import { Marca } from "@/components/marca";

// Definir senha.
//
// Existia um buraco: "Esqueci a senha" mandava o e-mail e o link caía em /marca, que é a
// tela do logo -- nenhum campo de senha em lugar nenhum do app. A pessoa clicava, entrava,
// e nunca chegava a trocar nada.
//
// Serve pros dois casos, e são o mesmo formulário: quem chegou pelo link de recuperação
// (a sessão já veio no endereço) e quem está logado e quer parar de depender de e-mail
// pra entrar -- que é o caso do celular, onde esperar e-mail é o pior jeito de entrar.

export default function Senha() {
  const router = useRouter();
  const { user, checando } = useConta();
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (senha !== repetir) return setErro("As duas senhas estão diferentes.");
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("should be at least")) return setErro("A senha precisa ter pelo menos 6 caracteres.");
      if (m.includes("different from the old")) return setErro("Essa já é a sua senha atual. Escolha outra.");
      if (m.includes("session") || m.includes("expired")) return setErro("O link venceu. Peça outro na tela de entrada.");
      return setErro(error.message);
    }
    setPronto(true);
  }

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-marca-indigo focus:outline-none";

  return (
    <main className="mx-auto max-w-sm px-6 py-14 font-sans">
      <Link href="/" className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img src="/marca-encena.svg" alt="" width={44} height={44} className="h-11 w-11" />
        <Marca className="text-3xl" />
      </Link>

      {checando ? (
        <p className="mt-8 text-sm text-neutral-500">Um instante…</p>
      ) : !user ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold">Link vencido</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Este link já foi usado ou passou de uma hora. Peça outro na tela de entrada — leva um minuto.
          </p>
          <Link href="/login" className="mt-5 inline-block rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">
            Voltar pra entrada
          </Link>
        </>
      ) : pronto ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold">Senha definida.</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Agora você entra em <span className="font-medium">{user.email}</span> com e-mail e senha, de qualquer aparelho, sem esperar e-mail
            nenhum.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-5 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro"
          >
            Ir pra Encena
          </button>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold">Escolha sua senha</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Pra conta <span className="font-medium">{user.email}</span>. Com senha você entra no celular na hora, sem depender do e-mail chegar.
          </p>
          <form onSubmit={salvar} className="mt-5 flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Nova senha (6+ caracteres)"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={campo}
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repita a senha"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              className={campo}
            />
            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-marca-coral px-4 py-2.5 font-medium text-white hover:bg-marca-coral-escuro disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Salvar senha"}
            </button>
          </form>
          {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
          <Link href="/" className="mt-6 inline-block text-xs text-neutral-500 underline">
            deixar pra depois
          </Link>
        </>
      )}
    </main>
  );
}
