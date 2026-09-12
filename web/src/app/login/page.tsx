"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Entrar. Três jeitos, porque público de imobiliária é misto: quem vive no WhatsApp
// prefere o link por e-mail (sem senha pra esquecer); quem tem conta Google entra com
// um toque; quem quer senha, tem senha. O Google só aparece quando estiver configurado
// no Supabase (NEXT_PUBLIC_LOGIN_GOOGLE=1): botão que dá erro é pior que botão que não
// existe.
//
// Cadastro é o mesmo formulário: com senha, "criar conta" registra e manda a confirmação;
// com link, a primeira entrada já cria a conta.

type Modo = "link" | "senha";

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("link");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const google = process.env.NEXT_PUBLIC_LOGIN_GOOGLE === "1";

  const origem = () => (typeof window !== "undefined" ? window.location.origin : undefined);

  function traduzir(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes("invalid login credentials")) return "E-mail ou senha errados.";
    if (m.includes("email not confirmed")) return "Confirme o e-mail que mandamos antes de entrar.";
    if (m.includes("user already registered")) return "Esse e-mail já tem conta. Entre com a senha ou peça o link.";
    if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Espere um minuto e tente de novo.";
    return msg;
  }

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return setErro("Supabase ainda não configurado (falta preencher web/.env.local).");
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origem() } });
    setCarregando(false);
    if (error) return setErro(traduzir(error.message));
    setEnviado("Link enviado. Confira sua caixa de entrada, e o spam, e clique nele.");
  }

  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return setErro("Supabase ainda não configurado.");
    setCarregando(true);
    setErro(null);
    if (criando) {
      const { error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: origem() } });
      setCarregando(false);
      if (error) return setErro(traduzir(error.message));
      setEnviado("Conta criada. Mandamos um e-mail de confirmação: clique no link e depois entre com a senha.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) return setErro(traduzir(error.message));
    router.push("/");
  }

  async function entrarComGoogle() {
    if (!supabase) return;
    setErro(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: origem() } });
    if (error) setErro(traduzir(error.message));
  }

  async function esqueci() {
    if (!supabase || !email) return setErro("Digite o e-mail primeiro.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origem()}/configuracoes` });
    if (error) return setErro(traduzir(error.message));
    setEnviado("Mandamos um link pra você definir uma senha nova.");
  }

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-marca-indigo focus:outline-none";

  return (
    <main className="mx-auto max-w-sm px-6 py-14 font-sans">
      <Link href="/" className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img src="/marca-encena.svg" alt="" width={44} height={44} className="h-11 w-11" />
        <span className="text-3xl font-bold tracking-tight text-marca-indigo">Encena</span>
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Fotos que vendem melhor.</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">Inteligência artificial para imóveis</p>

      {enviado ? (
        <div className="mt-6 rounded-lg border border-marca-teal/40 bg-marca-teal/10 p-3 text-sm text-marca-indigo">
          {enviado}
          <button onClick={() => setEnviado(null)} className="mt-2 block text-xs underline">voltar</button>
        </div>
      ) : (
        <>
          {google && (
            <button
              type="button"
              onClick={entrarComGoogle}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
                <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
              </svg>
              Entrar com Google
            </button>
          )}

          <div className={"flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 text-sm " + (google ? "mt-4" : "mt-6")}>
            <button type="button" onClick={() => setModo("link")} className={"flex-1 rounded-lg px-3 py-1.5 " + (modo === "link" ? "bg-white font-medium text-marca-indigo shadow-sm" : "text-neutral-600")}>
              Link por e-mail
            </button>
            <button type="button" onClick={() => setModo("senha")} className={"flex-1 rounded-lg px-3 py-1.5 " + (modo === "senha" ? "bg-white font-medium text-marca-indigo shadow-sm" : "text-neutral-600")}>
              Com senha
            </button>
          </div>

          {modo === "link" ? (
            <form onSubmit={enviarLink} className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-neutral-600">Sem senha: a gente manda um link de acesso. Primeira vez cria a conta.</p>
              <input type="email" required placeholder="seu@email.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
              <button type="submit" disabled={carregando} className="rounded-lg bg-marca-coral px-4 py-2.5 font-medium text-white hover:bg-marca-coral-escuro disabled:opacity-40">
                {carregando ? "Enviando…" : "Enviar link de acesso"}
              </button>
            </form>
          ) : (
            <form onSubmit={entrarComSenha} className="mt-4 flex flex-col gap-3">
              <input type="email" required placeholder="seu@email.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
              <input type="password" required minLength={6} placeholder={criando ? "Crie uma senha (6+ caracteres)" : "Sua senha"} autoComplete={criando ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
              <button type="submit" disabled={carregando} className="rounded-lg bg-marca-coral px-4 py-2.5 font-medium text-white hover:bg-marca-coral-escuro disabled:opacity-40">
                {carregando ? "Aguarde…" : criando ? "Criar conta" : "Entrar"}
              </button>
              <div className="flex justify-between text-xs text-neutral-500">
                <button type="button" onClick={() => setCriando((v) => !v)} className="underline">
                  {criando ? "Já tenho conta" : "Criar conta com senha"}
                </button>
                {!criando && (
                  <button type="button" onClick={esqueci} className="underline">Esqueci a senha</button>
                )}
              </div>
            </form>
          )}
          {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        </>
      )}

      <p className="mt-8 text-xs text-neutral-400">
        Ao entrar você concorda com os <Link href="/termos" className="underline">Termos de uso</Link> e a{" "}
        <Link href="/privacidade" className="underline">Política de Privacidade</Link>. Cinco gerações grátis pra testar.
      </p>
    </main>
  );
}
