"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import EditorMascara, { type EditorMascaraRef } from "@/components/editor-mascara";

type Acao = "mobiliar" | "esvaziar" | "melhorar" | "trocar_ceu" | "remover_objeto";

const ACOES: { valor: Acao; rotulo: string }[] = [
  { valor: "mobiliar", rotulo: "Mobiliar (estilo Moderno)" },
  { valor: "esvaziar", rotulo: "Esvaziar cômodo" },
  { valor: "melhorar", rotulo: "Melhorar foto escura" },
  { valor: "trocar_ceu", rotulo: "Trocar céu (pôr do sol)" },
  { valor: "remover_objeto", rotulo: "Remover objeto (pintar na foto)" },
];

// Precisa o usuário pintar a área antes de gerar. Tem que bater com o
// ACOES_COM_MASCARA do servidor -- o servidor é quem recusa de verdade, isto aqui é só
// pra não deixar a pessoa clicar em Gerar e levar um erro que dava pra evitar.
const ACOES_COM_MASCARA = new Set<Acao>(["remover_objeto"]);

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  // Começa como "checando" só se há Supabase pra checar. Sem ele, já nasce resolvido --
  // e o effect abaixo não precisa chamar setState de forma síncrona (regra
  // react-hooks/set-state-in-effect, o único erro de lint que restava).
  const [checandoAuth, setCheckandoAuth] = useState(() => !!supabase);
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
    selo: string | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // O resultado agora é identificado pelo id do job, não pela URL. A URL que o
  // navegador recebe é assinada e expira, então ela não serve de identificador -- quem
  // exporta é o servidor, lendo do storage a partir deste id.
  const [jobId, setJobId] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [reportando, setReportando] = useState(false);
  const [reportado, setReportado] = useState<string | null>(null);
  const [temMascara, setTemMascara] = useState(false);
  const editorRef = useRef<EditorMascaraRef>(null);
  const precisaMascara = ACOES_COM_MASCARA.has(acao);

  // Auth: pega o usuário logado (e reage a login/logout).
  useEffect(() => {
    if (!supabase) return;
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
  const [conta, setConta] = useState<{
    plano: string;
    status: string | null;
    renovaEm: string | null;
  } | null>(null);
  const [assinando, setAssinando] = useState(false);
  const [avisoAssinatura, setAvisoAssinatura] = useState<string | null>(null);
  // Muda pra forçar releitura do saldo (usado quando a pessoa volta da Stripe).
  const [releitura, setReleitura] = useState(0);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("users")
      .select("creditos_saldo, plano, assinatura_status, assinatura_renova_em")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) return;
        setCreditos(data.creditos_saldo);
        setConta({
          plano: data.plano,
          status: data.assinatura_status,
          renovaEm: data.assinatura_renova_em,
        });
      });
  }, [user, resultado, releitura]); // recalcula depois de cada geração

  // Voltou da Stripe? O crédito entra pelo webhook, que pode levar alguns segundos pra
  // chegar. Em vez de mostrar "0 créditos" pra quem acabou de pagar, avisa e relê o
  // saldo algumas vezes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const compra = params.get("compra");
    const retorno = params.get("assinatura") ?? compra;
    if (!retorno) return;
    window.history.replaceState({}, "", window.location.pathname);
    // setState fora do corpo síncrono do effect (regra react-hooks/set-state-in-effect),
    // e também fora da hidratação: o servidor renderizou sem aviso, então o aviso só
    // pode entrar depois que o cliente assumiu.
    const mostrar = setTimeout(() => {
      setAvisoAssinatura(
        retorno !== "ok"
          ? "Pagamento não concluído. Nada foi cobrado."
          : compra
            ? "Pedido recebido. No cartão os créditos entram em instantes; no Pix, assim que o banco confirmar."
            : "Pagamento recebido. Seus créditos entram em instantes."
      );
    }, 0);
    if (retorno !== "ok") return () => clearTimeout(mostrar);

    let vezes = 0;
    const timer = setInterval(() => {
      setReleitura((n) => n + 1);
      if (++vezes >= 10) clearInterval(timer);
    }, 3000);
    return () => {
      clearTimeout(mostrar);
      clearInterval(timer);
    };
  }, []);

  // "assinatura" = R$ 69/mês renovando; "pacote" = R$ 69 uma vez, 80 créditos, e é
  // onde o Pix aparece quando estiver ativo na conta da Stripe.
  async function assinar(modo: "assinatura" | "pacote" = "assinatura") {
    if (!supabase) return;
    setAssinando(true);
    setErro(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirou -- faça login de novo.");
      const resp = await fetch("/api/assinar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Não consegui abrir o pagamento.");
      window.location.href = data.url; // página da Stripe: o cartão é digitado lá, nunca aqui
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao assinar.");
      setAssinando(false);
    }
  }

  const assinaturaAtiva = conta?.status === "active" || conta?.status === "past_due";

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    setFoto(arquivo);
    setResultado(null);
    setJobId(null);
    setErro(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  function removerFoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(null);
    setPreview(null);
    setResultado(null);
    setJobId(null);
    setTemMascara(false);
    setErro(null);
    // Sem isto, escolher a MESMA foto de novo não dispara onChange (bug achado no QA).
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  async function sair() {
    await supabase?.auth.signOut();
  }

  async function exportarPara(portal: string) {
    if (!jobId || !supabase) return;
    setExportando(portal);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirou -- faça login de novo.");
      const resp = await fetch("/api/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, portal }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Falha ao exportar.");
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `foto-${portal}.jpg`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao exportar.");
    } finally {
      setExportando(null);
    }
  }

  // Pergunta ao servidor se o job já andou. Cada chamada é curta; quem espera é o
  // navegador, que pode esperar o quanto for -- não o servidor, que não pode.
  async function acompanhar(id: string, token: string) {
    const INTERVALO = 2500;
    const TENTATIVAS = 144; // ~6 minutos, bem acima do pior caso medido (100s)
    for (let i = 0; i < TENTATIVAS; i++) {
      await new Promise((r) => setTimeout(r, INTERVALO));
      const resp = await fetch(`/api/job/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "A geração falhou.");
      if (data.status === "concluido") return data;
      if (data.status === "upscaling") setEtapa("Aumentando a resolução...");
      else if (data.posicaoNaFila) setEtapa(`Na fila, posição ${data.posicaoNaFila}...`);
      else setEtapa("Gerando...");
    }
    throw new Error(
      "A geração passou de 6 minutos e parei de esperar. O pedido pode ainda terminar -- recarregue a página daqui a pouco antes de gerar de novo, pra não gastar outro crédito."
    );
  }

  // "Geração ruim = crédito de volta", versão manual do plano: um clique devolve o
  // crédito. O servidor limita a um estorno por geração e a três por dia.
  async function reportarProblema() {
    if (!jobId || !supabase) return;
    setReportando(true);
    setErro(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirou -- faça login de novo.");
      const resp = await fetch(`/api/job/${jobId}/reportar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Não consegui registrar o problema.");
      setReportado(data.mensagem);
      setReleitura((n) => n + 1); // relê o saldo, que acabou de mudar
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao reportar.");
    } finally {
      setReportando(false);
    }
  }

  async function gerar() {
    if (!foto || !user || !supabase) return;
    if (creditos !== null && creditos <= 0) {
      setErro("Seus créditos acabaram. Assine o Pro pra continuar gerando.");
      return;
    }
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setInfoResultado(null);
    setJobId(null);
    setReportado(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirou -- faça login de novo.");

      const form = new FormData();
      form.append("foto", foto);
      form.append("acao", acao);

      if (precisaMascara) {
        const mascara = await editorRef.current?.obterMascara();
        if (!mascara) throw new Error("Pinte na foto o que você quer remover antes de gerar.");
        form.append("mascara", mascara, "mascara.png");
      }
      const resp = await fetch("/api/gerar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Falha ao gerar.");

      // O servidor só DESPACHOU o pedido. Ele responde em segundos com um id, e a
      // imagem fica pronta depois -- é o que permite uma geração de 100s viver num
      // servidor que corta requisição em 10s.
      setJobId(data.jobId);
      setEtapa("Na fila...");
      const final = await acompanhar(data.jobId, token);

      setResultado(final.url);
      setInfoResultado({
        largura: final.width,
        altura: final.height,
        modelo: final.modelo,
        upscaled: final.upscaled,
        aviso: final.aviso,
        selo: final.selo ?? null,
      });
      // O job e o débito de crédito já aconteceram no servidor -- aqui só re-lemos o
      // saldo (o useEffect acima dispara de novo porque `resultado` mudou).
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
      setEtapa(null);
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
            {conta && (
              <span className="ml-2">
                · {assinaturaAtiva ? "Plano Pro" : "Plano grátis"}
                {assinaturaAtiva && conta.renovaEm && (
                  <> · renova em {new Date(conta.renovaEm).toLocaleDateString("pt-BR")}</>
                )}
                {conta.status === "past_due" && (
                  <span className="text-amber-600"> · pagamento pendente</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => assinar("assinatura")}
            disabled={assinando}
            className={
              assinaturaAtiva
                ? "text-sm text-neutral-500 underline disabled:opacity-40"
                : "rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"
            }
          >
            {assinando ? "Abrindo..." : assinaturaAtiva ? "Gerenciar assinatura" : "Assinar Pro · R$ 69/mês"}
          </button>
          <button
            onClick={() => assinar("pacote")}
            disabled={assinando}
            title="80 créditos, pagamento único, sem renovação. Aceita Pix quando ativo."
            className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40"
          >
            Comprar 80 créditos
          </button>
          <button onClick={sair} className="text-sm text-neutral-500 underline">
            Sair
          </button>
        </div>
      </div>

      {avisoAssinatura && (
        <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {avisoAssinatura}
        </p>
      )}

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
          disabled={!foto || carregando || creditos === 0 || (precisaMascara && !temMascara)}
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {carregando ? (etapa ?? "Gerando...") : "Gerar"}
        </button>

        {precisaMascara && foto && !temMascara && (
          <p className="text-sm text-neutral-500">
            Marque na foto o que deve sair antes de gerar.
          </p>
        )}

        {creditos === 0 && (
          <p className="text-sm text-amber-600">
            Seus créditos acabaram.{" "}
            {assinaturaAtiva
              ? "Eles renovam no próximo ciclo da assinatura."
              : "Assine o Pro pra ganhar 80 gerações por mês."}
          </p>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {preview && (
            <div className="min-w-0">
              <p className="mb-1 text-xs uppercase text-neutral-500">
                {precisaMascara ? "Marque o que remover" : "Original"}
              </p>
              {precisaMascara ? (
                <EditorMascara ref={editorRef} src={preview} aoMudar={setTemMascara} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Foto original" className="w-full max-w-full rounded border" />
              )}
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
                  {infoResultado.selo && (
                    <span className="block">
                      Carimbada com o aviso &quot;{infoResultado.selo}&quot;, que vai junto no
                      download.
                    </span>
                  )}
                  {infoResultado.aviso && (
                    <span className="block text-amber-600">⚠ {infoResultado.aviso}</span>
                  )}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => exportarPara("zap_vivareal_olx")}
                  disabled={exportando !== null}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-40"
                >
                  {exportando === "zap_vivareal_olx" ? "Exportando..." : "⬇ ZAP · VivaReal · OLX"}
                </button>
                <button
                  onClick={() => exportarPara("generico")}
                  disabled={exportando !== null}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-40"
                >
                  {exportando === "generico" ? "Exportando..." : "⬇ Outros portais"}
                </button>
              </div>
              <div className="mt-2">
                {reportado ? (
                  <p className="text-xs text-emerald-700">{reportado}</p>
                ) : (
                  <button
                    onClick={reportarProblema}
                    disabled={reportando}
                    className="text-xs text-neutral-500 underline disabled:opacity-40"
                  >
                    {reportando ? "Registrando..." : "Ficou ruim? Reportar e recuperar o crédito"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
