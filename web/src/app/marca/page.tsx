"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import { Aviso, Botao, Cartao, Rotulo } from "@/components/ui";

// Minha marca: o logo do corretor que pode ir carimbado nas fotos exportadas, a cor, e
// os dados que aparecem na página compartilhada (nome, CRECI, WhatsApp). A Pedra chama
// de Branding.

export default function Configuracoes() {
  const c = useConta();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  /**
   * Da' pra tirar o fundo deste logo? Vem do upload. `null` = ainda nao se sabe (o logo
   * foi carregado numa visita anterior, e a resposta so' chega quando um upload acontece).
   */
  const [fundo, setFundo] = useState<{ vale: boolean; motivo?: string } | null>(null);
  const [limpando, setLimpando] = useState(false);
  const [cor, setCor] = useState<string>("#0F2D5B");
  const [nome, setNome] = useState("");
  const [creci, setCreci] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * O que JÁ vem da imobiliária, quando a pessoa é de uma equipe.
   *
   * Sem isto a tela pedia logo pra todo mundo como se cada um estivesse sozinho -- e quem
   * entrou numa equipe que já tem logo concluía que precisava enviar um. Não precisava: os
   * materiais dele já saíam com o da imobiliária. A regra sempre esteve certa (a pessoa
   * vence, a imobiliária preenche o que falta); quem não contava era a tela.
   */
  const [daEquipe, setDaEquipe] = useState<{
    imobiliaria: { nome: string; creci: string | null; whatsapp: string | null; temLogo: boolean; cor: string | null } | null;
    nomeNosMateriais: string | null;
    creciNosMateriais: string | null;
    logoDaImobiliaria: boolean;
  } | null>(null);
  const { user, token } = c;

  useEffect(() => {
    if (!user) return;
    token()
      .then((t) => fetch("/api/marca", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logoUrl ?? null);
        setFundo(d.fundo ?? null);
        if (d.cor) setCor(d.cor);
        setNome(d.nome ?? "");
        setCreci(d.creci ?? "");
        setWhatsapp(d.whatsapp ?? "");
        setDaEquipe({
          imobiliaria: d.imobiliaria ?? null,
          nomeNosMateriais: d.nomeNosMateriais ?? null,
          creciNosMateriais: d.creciNosMateriais ?? null,
          logoDaImobiliaria: !!d.logoDaImobiliaria,
        });
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
      form.append("nome", nome);
      form.append("creci", creci);
      form.append("whatsapp", whatsapp);
      const resp = await fetch("/api/marca", { method: "POST", headers: { Authorization: `Bearer ${await c.token()}` }, body: form });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setLogoUrl(d.logoUrl ?? null);
      setWhatsapp(d.whatsapp ?? "");
      if (logo) setFundo(d.fundo ?? null);
      setMensagem(logo ? "Logo salvo. Ele aparece como opção na hora de baixar." : "Salvo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /**
   * TIRAR O FUNDO. Pedido dele em 10/10/2026, depois de ver a marca d'agua sair como um selo
   * retangular: "nao pode ter opcao de voce transformar no SaaS a logo em marca d'agua?".
   *
   * Nao acontece sozinho no upload: o logo dele e' dourado sobre fundo escuro, e ha' quem
   * queira exatamente esse selo. Limpar sem perguntar destruiria o desenho de quem quis.
   */
  async function tirarFundoDoLogo() {
    setLimpando(true);
    setErro(null);
    setMensagem(null);
    try {
      const form = new FormData();
      form.append("tirarFundo", "1");
      const resp = await fetch("/api/marca", { method: "POST", headers: { Authorization: `Bearer ${await c.token()}` }, body: form });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      // O caminho do arquivo nao muda, entao a URL de antes serviria a versao velha do
      // cache. `?v=` força o navegador a buscar a nova.
      setLogoUrl(d.logoUrl ? `${d.logoUrl}${d.logoUrl.includes("?") ? "&" : "?"}v=${Date.now()}` : null);
      setFundo({ vale: false, motivo: "Fundo tirado." });
      setMensagem("Fundo tirado. O logo agora entra recortado na marca d'água e nas fotos.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui tirar o fundo.");
    } finally {
      setLimpando(false);
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

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <h1 className="text-2xl font-semibold">Minha marca</h1>
      <p className="mt-1 text-sm text-neutral-500">Seu logo nas fotos que você baixa e seus dados na página que o cliente abre pelo link.</p>

      {/* O QUE JA SAI, ANTES DE PEDIR QUALQUER COISA.

          Ele criou uma equipe, entrou com um segundo e-mail como corretor e a tela pediu
          logo -- sendo que a imobiliaria ja tinha um. A regra nunca esteve errada (a pessoa
          vence, a imobiliaria preenche o que falta); errada estava a tela, que pedia como se
          cada um estivesse sozinho e nao dizia o que ja estava valendo.

          Mostrar o resultado ANTES dos campos muda a pergunta que a pessoa se faz: de "o que
          eu preciso configurar?" para "quero trocar alguma coisa disso?". */}
      {daEquipe?.imobiliaria && (
        <div className="mt-4 rounded-xl border border-marca-teal/40 bg-marca-teal/5 p-4">
          <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Você é da equipe {daEquipe.imobiliaria.nome}</p>
          <p className="mt-2 text-sm text-neutral-700">
            Teus materiais já saem com <strong className="font-semibold">{daEquipe.nomeNosMateriais ?? daEquipe.imobiliaria.nome}</strong>
            {daEquipe.creciNosMateriais ? <> — CRECI {daEquipe.creciNosMateriais}</> : null}.
          </p>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-neutral-600">
            {daEquipe.logoDaImobiliaria && <li>· O logo é o da imobiliária. Envie o seu abaixo só se quiser o seu no lugar.</li>}
            {!creci && daEquipe.imobiliaria.creci && (
              <li>
                · O CRECI que está saindo é o <strong className="font-medium text-neutral-700">da imobiliária</strong>, porque o seu está em branco.{" "}
                <strong className="font-medium text-neutral-700">Se você anuncia em nome próprio, preencha o seu abaixo</strong> — ele passa a valer no lugar.
              </li>
            )}
            {!whatsapp && daEquipe.imobiliaria.whatsapp && <li>· O WhatsApp é o da imobiliária. Preencha o seu abaixo pra receber direto.</li>}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">Tudo o que você preencher aqui vale mais que o da imobiliária. O que deixar em branco, ela completa.</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-7">
          <Cartao>
            <Rotulo>Logo</Rotulo>
            {logoUrl ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-xl border border-neutral-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Seu logo" className="max-h-24 max-w-[220px]" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Dropzone compacto rotulo="Trocar logo" onArquivo={(f) => enviar(f)} />
                  {/* TIRAR O FUNDO. Só aparece quando a análise do upload disse que dá --
                      oferecer e entregar um buraco no meio da letra seria pior que não
                      oferecer. E nunca acontece sozinho: há quem queira o selo escuro. */}
                  {fundo?.vale && (
                    <Botao onClick={tirarFundoDoLogo} disabled={limpando || salvando}>
                      {limpando ? "Tirando…" : "Tirar o fundo"}
                    </Botao>
                  )}
                  <Botao variante="perigo" onClick={removerLogo} disabled={salvando}>Remover</Botao>
                </div>
              </div>
            ) : (
              <Dropzone rotulo="Enviar meu logo" onArquivo={(f) => enviar(f)} />
            )}
            {/* O MOTIVO quando não dá. Botão que some sem explicação faz a pessoa procurar
                um recurso que ela viu existir noutro logo. */}
            {fundo && !fundo.vale && fundo.motivo && <p className="mt-3 text-xs text-neutral-500">{fundo.motivo}</p>}
            <p className="mt-3 text-xs text-neutral-500">
              Logo com fundo transparente fica melhor na foto e na marca d&apos;água do vídeo. Se o seu veio com fundo, o botão <strong>Tirar o fundo</strong> aparece aqui depois de enviar. Ele é redimensionado para no máximo 18% da largura da foto.
            </p>
          </Cartao>

          <Cartao>
            <Rotulo>Seus dados na página compartilhada</Rotulo>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-xs text-neutral-500">Nome ou imobiliária</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Ana Lima · Lima Imóveis" className={campo} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">CRECI</span>
                <input value={creci} onChange={(e) => setCreci(e.target.value)} maxLength={30} placeholder="Ex.: 12345-F GO" className={campo} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">WhatsApp (com DDD)</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" maxLength={20} placeholder="62 99999-9999" className={campo} />
              </label>
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-neutral-200 bg-white p-1" title="Cor da marca" />
                  <span className="text-xs text-neutral-500">Cor da marca</span>
                </div>
                <Botao type="submit" disabled={salvando} className="ml-auto">
                  {salvando ? "Salvando…" : "Salvar"}
                </Botao>
              </div>
            </form>
            <p className="mt-2 text-xs text-neutral-500">O cliente vê seu nome, CRECI e um botão &quot;Falar no WhatsApp&quot; no topo da página com as fotos.</p>
          </Cartao>

          {mensagem && <Aviso tipo="ok">{mensagem}</Aviso>}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <Rotulo>Na foto baixada</Rotulo>
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

          <Cartao>
            <Rotulo>Na página compartilhada</Rotulo>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-8 max-w-[100px] object-contain" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: cor }}>
                    {(nome || "E").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">{nome || "Seu nome"}</p>
                  {creci && <p className="text-xs text-neutral-500">CRECI {creci}</p>}
                </div>
                <span className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ background: cor }}>
                  Falar no WhatsApp
                </span>
              </div>
            </div>
          </Cartao>

          {/* Não é marca, é acesso -- mas é aqui que a pessoa procura quando quer mexer na
              própria conta, e sem este link a única porta pra senha é um e-mail. */}
          <Cartao>
            <Rotulo>Entrar sem esperar e-mail</Rotulo>
            <p className="mt-2 text-xs text-neutral-500">
              Defina uma senha e entre direto no celular, sem depender do link chegar na caixa.
            </p>
            <Link href="/senha" className="mt-3 inline-block text-sm font-medium text-marca-indigo underline">
              Definir senha
            </Link>
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
