"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import { ACOES, ACOES_POR_ID, GRUPOS, SUGESTOES_REFINO, type DefAcao } from "@/lib/acoes";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import { guardarArquivos } from "@/lib/entrega-arquivos";
import Comparador from "@/components/comparador";
import PainelParametros from "@/components/painel-parametros";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import EditorMascara, { type EditorMascaraRef } from "@/components/editor-mascara";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";

// Editor: a tela principal. Três passos que o corretor lê de cima pra baixo no celular
// e lado a lado no computador: foto, o que fazer, ajustes e gerar. O resultado entra no
// lugar da foto como comparador antes/depois, com export e compartilhar logo abaixo.

type Info = { largura: number; altura: number; modelo: string; upscaled: boolean; aviso: string | null; selo: string | null };

function padroesDe(acao: DefAcao): Record<string, string> {
  const p: Record<string, string> = {};
  for (const def of acao.parametros) if (def.padrao) p[def.chave] = def.padrao;
  return p;
}

// O que veio na URL: `?imovel=` (da página do imóvel) e o retorno da Stripe. Lido no
// estado inicial, NÃO num efeito: o efeito que limpava a URL e agendava o setState
// rodava duas vezes no modo estrito do React, e a segunda rodada já não achava o
// parâmetro -- o imóvel pré-selecionado se perdia em desenvolvimento.
function lerQuery() {
  if (typeof window === "undefined") return { imovel: null, compra: null, retorno: null, job: null };
  const p = new URLSearchParams(window.location.search);
  const compra = p.get("compra");
  // `?job=`: uma imagem pronta (da Galeria) abrindo aqui pra ser refinada.
  return { imovel: p.get("imovel"), compra, retorno: p.get("assinatura") ?? compra, job: p.get("job") };
}

export default function Editor() {
  const router = useRouter();
  const c = useConta();

  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [acaoId, setAcaoId] = useState<string>("mobiliar");
  const acao = ACOES_POR_ID[acaoId];
  const [parametros, setParametros] = useState<Record<string, string>>(() => padroesDe(ACOES_POR_ID["mobiliar"]));
  const [pintarArea, setPintarArea] = useState(false);
  const [referencia, setReferencia] = useState<File | null>(null);
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const [temMascara, setTemMascara] = useState(false);
  const [query] = useState(lerQuery);
  const [imovelId, setImovelId] = useState<string | null>(query.imovel);
  const editorRef = useRef<EditorMascaraRef>(null);

  const [carregando, setCarregando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // ---- refinar e versões ----
  // O que foi usado na geração que está na tela, pra "ver as configurações" ser verdade
  // e não uma reconstrução. Capturado no clique, não lido do estado atual, porque a
  // pessoa pode mexer nos chips depois de gerar.
  const [usado, setUsado] = useState<{ acaoId: string; parametros: Record<string, string> } | null>(null);
  const [refino, setRefino] = useState("");
  const [versoes, setVersoes] = useState<{ jobId: string | null; rotulo: string; url: string | null; instrucao: string | null; atual: boolean }[] | null>(null);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);

  const [exportando, setExportando] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [comLogo, setComLogo] = useState(false);
  const [temLogo, setTemLogo] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [reportado, setReportado] = useState<string | null>(null);
  const [motivoReporte, setMotivoReporte] = useState("");
  const [formReporte, setFormReporte] = useState(false);
  const [avisoPagamento] = useState<string | null>(() =>
    !query.retorno
      ? null
      : query.retorno !== "ok"
        ? "Pagamento não concluído. Nada foi cobrado."
        : query.compra
          ? "Pedido recebido. Seus créditos entram assim que o pagamento for confirmado."
          : "Pagamento recebido. Seus créditos entram em instantes."
  );

  const usaMascara = acao.mascara === "obrigatoria" || (acao.mascara === "opcional" && pintarArea);
  const rotulosMascara = acao.rotulosMascara ?? { opcao: "Aplicar só onde eu pintar", ajuda: "Sem marcar, a IA decide sozinha.", titulo: "Pinte onde aplicar" };
  const podeGerar = !!foto && !carregando && (c.conta?.creditos ?? 0) > 0 && (!usaMascara || temMascara) && (acao.id !== "editar_prompt" || !!parametros.instrucao?.trim());

  // Chegou com `?job=`: o resultado daquele job vira o resultado na tela, pronto pra
  // refinar e ver versões -- é o caminho da Galeria. Não gasta crédito: é só ler.
  const usuarioLogado = c.user;
  const pegarToken = c.token;
  useEffect(() => {
    if (!usuarioLogado || !query.job) return;
    let vivo = true;
    const id = query.job;
    pegarToken()
      .then(async (t) => {
        const cab = { headers: { Authorization: `Bearer ${t}` } };
        const [job, versoes] = await Promise.all([
          fetch(`/api/job/${id}`, cab).then((r) => r.json()),
          fetch(`/api/job/${id}/versoes`, cab)
            .then((r) => r.json())
            .catch(() => ({})),
        ]);
        return { job, original: (versoes?.versoes?.[0]?.url as string | undefined) ?? null };
      })
      .then(({ job: d, original }) => {
        if (!vivo || d.status !== "concluido" || !d.url) return;
        setJobId(id);
        setResultado(d.url);
        // O "antes" do comparador é a foto original da cadeia (a primeira versão). Sem
        // ela, o comparador mostra a mesma imagem dos dois lados -- inofensivo.
        setPreview(original ?? d.url);
        setInfo(null);
        if (d.imovelId) setImovelId((atual) => atual ?? d.imovelId);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [usuarioLogado, pegarToken, query.job]);

  // Limpa a URL e, se voltou da Stripe com pagamento ok, relê o saldo algumas vezes:
  // o crédito entra pelo webhook em segundos.
  useEffect(() => {
    if (!query.imovel && !query.retorno) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (query.retorno !== "ok") return;
    let vezes = 0;
    const timer = setInterval(() => {
      c.recarregar();
      if (++vezes >= 10) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tem logo salvo? Decide se mostra o "com meu logo" no export.
  const { user: usuarioAtual, token: obterToken } = c;
  useEffect(() => {
    if (!usuarioAtual) return;
    obterToken()
      .then((t) => fetch("/api/marca", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => setTemLogo(!!d.logoUrl))
      .catch(() => {});
  }, [usuarioAtual, obterToken]);

  function escolherAcao(id: string) {
    setAcaoId(id);
    setParametros(padroesDe(ACOES_POR_ID[id]));
    setPintarArea(false);
    setTemMascara(false);
    setErro(null);
  }

  function receberFoto(f: File) {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(f);
    setPreview(URL.createObjectURL(f));
    limparResultado();
  }

  function receberReferencia(f: File) {
    if (previewRef) URL.revokeObjectURL(previewRef);
    setReferencia(f);
    setPreviewRef(URL.createObjectURL(f));
  }

  function limparResultado() {
    setResultado(null);
    setInfo(null);
    setJobId(null);
    setReportado(null);
    setFormReporte(false);
    setMotivoReporte("");
    setErro(null);
    setTemMascara(false);
  }

  function novaFoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(null);
    setPreview(null);
    limparResultado();
  }

  async function acompanhar(id: string, token: string) {
    for (let i = 0; i < 144; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const resp = await fetch(`/api/job/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "A geração falhou.");
      if (data.status === "concluido") return data;
      if (data.status === "upscaling") setEtapa("Aumentando a resolução…");
      else if (data.posicaoNaFila) setEtapa(`Na fila, posição ${data.posicaoNaFila}…`);
      else setEtapa("Gerando…");
    }
    throw new Error("Passou de 6 minutos. Recarregue a página daqui a pouco antes de tentar de novo, pra não gastar outro crédito.");
  }

  /**
   * Gera a partir da foto (o caminho de sempre) ou a partir de um RESULTADO (refinar).
   *
   * No refino a entrada é `baseJobId`, não `foto`: o servidor pega a imagem gerada do
   * storage. Nada é baixado nem subido de novo, e o que a pessoa gostou fica. O resultado
   * novo vira a base do próximo refino, então "mais uma coisa" encadeia sem começar do zero.
   *
   * `chaveIdempotencia` é uma por clique: dedo duplo ou retry do navegador não viram
   * segundo débito (o servidor devolve o job que já existe).
   */
  async function gerar(base?: { jobId: string; acaoId: string; parametros: Record<string, string> }) {
    if (base ? carregando || (c.conta?.creditos ?? 0) <= 0 : !foto || !podeGerar) return;
    const acaoUsada = base ? ACOES_POR_ID[base.acaoId] : acao;
    const parametrosUsados = base ? base.parametros : parametros;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setInfo(null);
    setJobId(null);
    setReportado(null);
    setVersoes(null);
    try {
      const token = await c.token();
      const form = new FormData();
      if (base) form.append("baseJobId", base.jobId);
      else form.append("foto", foto!);
      form.append("acao", acaoUsada.id);
      form.append("parametros", JSON.stringify(parametrosUsados));
      form.append("chaveIdempotencia", typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      if (imovelId) form.append("imovelId", imovelId);
      if (!base && usaMascara) {
        const mascara = await editorRef.current?.obterMascara();
        if (!mascara) throw new Error("Pinte na foto a área antes de gerar.");
        form.append("mascara", mascara, "mascara.png");
      }
      if (!base && acao.referencia && referencia) form.append("referencia", referencia);

      const resp = await fetch("/api/gerar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Falha ao gerar.");
      setJobId(data.jobId);
      setUsado({ acaoId: acaoUsada.id, parametros: parametrosUsados });
      setEtapa("Na fila…");
      const final = await acompanhar(data.jobId, token);
      setResultado(final.url);
      setInfo({ largura: final.width, altura: final.height, modelo: final.modelo, upscaled: final.upscaled, aviso: final.aviso, selo: final.selo ?? null });
      if (base) setRefino("");
      c.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      c.recarregar();
    } finally {
      setCarregando(false);
      setEtapa(null);
    }
  }

  /** Refinar o resultado que está na tela: "editar com texto", mas sobre a imagem gerada. */
  function refinar() {
    if (!jobId || refino.trim().length < 3) return;
    gerar({ jobId, acaoId: "refinar", parametros: { instrucao: refino.trim() } });
  }

  /** Original → v1 → v2… do job na tela. Não gasta crédito: é só ler o que já existe. */
  async function verVersoes() {
    if (!jobId) return;
    if (mostrarVersoes) {
      setMostrarVersoes(false);
      return;
    }
    setMostrarVersoes(true);
    try {
      const r = await fetch(`/api/job/${jobId}/versoes`, { headers: { Authorization: `Bearer ${await c.token()}` } });
      const d = await r.json();
      setVersoes(d.versoes ?? []);
    } catch {
      setVersoes([]);
    }
  }

  /** Voltar pra uma versão: ela vira o resultado na tela e a base do próximo refino. */
  function irParaVersao(v: { jobId: string | null; url: string | null }) {
    if (!v.jobId || !v.url) return;
    setJobId(v.jobId);
    setResultado(v.url);
    setVersoes((lista) => (lista ?? []).map((x) => ({ ...x, atual: x.jobId === v.jobId })));
  }

  /** O que foi usado, em português, pra pessoa saber de onde saiu o resultado. */
  function descreverUsado(): string | null {
    if (!usado) return null;
    const def = ACOES_POR_ID[usado.acaoId];
    if (!def) return null;
    const partes: string[] = [];
    for (const p of def.parametros) {
      const v = usado.parametros[p.chave];
      if (!v) continue;
      const opcao = p.opcoes?.find((o) => o.valor === v);
      if (p.tipo === "texto") partes.push(`“${v}”`);
      else if (opcao && opcao.valor !== "auto") partes.push(opcao.rotulo);
    }
    return [def.rotulo, ...partes].join(" · ");
  }

  async function exportarPara(portal: string) {
    if (!jobId) return;
    setExportando(portal);
    try {
      const resp = await fetch("/api/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await c.token()}` },
        body: JSON.stringify({ jobId, portal, legenda, comLogo }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Falha ao exportar.");
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `encena-${portal}.jpg`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao exportar.");
    } finally {
      setExportando(null);
    }
  }

  async function reportarProblema() {
    if (!jobId) return;
    setReportando(true);
    try {
      const resp = await fetch(`/api/job/${jobId}/reportar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await c.token()}` },
        body: JSON.stringify({ motivo: motivoReporte }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Não consegui registrar.");
      setReportado(data.mensagem);
      setFormReporte(false);
      c.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao reportar.");
    } finally {
      setReportando(false);
    }
  }

  // `oculta` fica fora da fileira: "refinar" só existe em cima de um resultado.
  const acoesPorGrupo = useMemo(() => GRUPOS.map((g) => ({ ...g, acoes: ACOES.filter((a) => a.grupo === g.id && !a.oculta) })), []);

  // ---------- estados sem sessão ----------
  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;

  if (!supabase) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Aviso tipo="atencao">Supabase não configurado. Preencha web/.env.local e reinicie o servidor.</Aviso>
      </main>
    );
  }

  // Sem sessão, quem manda é a página de venda (components/landing.tsx).
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para editar fotos.</Link>
      </main>
    );
  }

  // ---------- editor ----------
  const semCreditos = (c.conta.creditos ?? 0) <= 0;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      {avisoPagamento && (
        <div className="mb-4">
          <Aviso tipo="ok">{avisoPagamento}</Aviso>
        </div>
      )}
      {c.aviso && (
        <div className="mb-4">
          <Aviso tipo="ok">{c.aviso}</Aviso>
        </div>
      )}
      {c.erro && (
        <div className="mb-4">
          <Aviso tipo="erro">{c.erro}</Aviso>
        </div>
      )}

      {/* Três FERRAMENTAS, não quatro. "Uma foto" e "Em lote" eram a mesma coisa com
          contagem diferente, e ocupavam metade da barra decidindo algo que o app sabe
          sozinho: jogou várias fotos, vai pro lote. Com isso Terreno e Planta deixam de
          ficar espremidos no canto. */}
      <div className="mb-4 inline-flex rounded-xl border border-neutral-200 bg-white p-1 text-sm">
        <span className="flex items-center gap-1.5 rounded-lg bg-marca-indigo/10 px-3 py-1.5 font-medium text-marca-indigo">
          <Icone nome="foto" className="h-4 w-4" />
          Fotos
        </span>
        <Link href="/terreno" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          <Icone nome="terreno" className="h-4 w-4" />
          Terreno
        </Link>
        <Link href="/planta" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          <Icone nome="planta" className="h-4 w-4" />
          Planta
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---------- coluna da foto ---------- */}
        <section className="lg:col-span-7">
          {/* Sem foto E sem resultado: a caixa de envio. Resultado sem foto existe -- é a
              imagem da Galeria reaberta aqui pra refinar (?job=), que não passou pelo envio. */}
          {!foto && !resultado ? (
            <Cartao>
              <Dropzone
                onArquivo={receberFoto}
                onArquivos={(fs) => {
                  guardarArquivos(fs);
                  router.push("/lote");
                }}
                dica="Arraste aqui ou clique. Uma foto ou várias — se vierem várias, elas entram em fila sozinhas."
              />
              <ol className="mt-5 grid gap-3 text-sm text-neutral-600 sm:grid-cols-3">
                <li className="flex gap-2"><span className="font-bold text-marca-coral">1</span> Envie a foto do ambiente.</li>
                <li className="flex gap-2"><span className="font-bold text-marca-coral">2</span> Escolha o que fazer e o estilo.</li>
                <li className="flex gap-2"><span className="font-bold text-marca-coral">3</span> Compare, compartilhe e baixe.</li>
              </ol>
            </Cartao>
          ) : (
            <Cartao className="p-3 sm:p-4">
              {resultado && preview ? (
                <>
                  <Comparador antes={preview} depois={resultado} />
                  {info && (
                    <p className="mt-2 text-xs text-neutral-500">
                      {info.largura}×{info.altura}px{info.upscaled ? " · alta resolução" : ""}
                      {info.selo && <> · sai com o aviso &quot;{info.selo}&quot;</>}
                      {info.aviso && <span className="block text-amber-600">⚠ {info.aviso}</span>}
                    </p>
                  )}

                  {/* ---- o que fazer com esta imagem ----
                      Uma imagem pronta não é fim de linha: refina, vira cena de vídeo,
                      entra no vídeo que a pessoa já está montando. Tudo sem baixar e subir
                      de novo -- a entrada é o próprio job. Nada aqui gasta crédito até a
                      pessoa clicar em gerar. */}
                  {jobId && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={verVersoes}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-marca-indigo"
                      >
                        {mostrarVersoes ? "Fechar versões" : "Ver versões"}
                      </button>
                      <Link
                        href={`/videos?job=${jobId}`}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-marca-indigo"
                        title="Vira uma cena com movimento de câmera. Só a câmera se move: nada de gente, bicho ou móvel novo."
                      >
                        ▶ Animar esta imagem
                      </Link>
                      {imovelId && (
                        <Link href={`/materiais?imovel=${imovelId}`} className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-marca-indigo">
                          Usar em material
                        </Link>
                      )}
                    </div>
                  )}

                  {mostrarVersoes && (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
                      <Rotulo>Versões</Rotulo>
                      {versoes === null ? (
                        <p className="text-xs text-neutral-500">Carregando…</p>
                      ) : versoes.length === 0 ? (
                        <p className="text-xs text-neutral-500">Só esta por enquanto. Cada refino vira uma versão nova; nenhuma apaga a anterior.</p>
                      ) : (
                        <ul className="flex gap-2 overflow-x-auto pb-1">
                          {versoes.map((v, i) => (
                            <li key={v.jobId ?? `orig-${i}`} className="shrink-0">
                              <button
                                type="button"
                                onClick={() => irParaVersao(v)}
                                disabled={!v.jobId}
                                title={v.instrucao ?? undefined}
                                className={
                                  "block w-24 overflow-hidden rounded-lg border-2 text-left transition " +
                                  (v.atual ? "border-marca-coral" : "border-neutral-200 hover:border-marca-indigo") +
                                  (!v.jobId ? " cursor-default opacity-90" : "")
                                }
                              >
                                {v.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={v.url} alt={v.rotulo} className="aspect-[4/3] w-full object-cover" />
                                ) : (
                                  <span className="block aspect-[4/3] w-full bg-neutral-100" />
                                )}
                                <span className="block truncate px-1.5 py-1 text-[11px] text-neutral-600">{v.rotulo}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {jobId && (
                    <div className="mt-3 rounded-xl border border-marca-coral/40 bg-marca-pessego/20 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Rotulo>Refinar este resultado</Rotulo>
                        {descreverUsado() && <span className="text-[11px] text-neutral-500">Usado: {descreverUsado()}</span>}
                      </div>
                      <p className="mb-2 text-xs text-neutral-600">Mude uma coisa e o resto fica como está. Um pedido por vez sai mais certo.</p>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {SUGESTOES_REFINO.map((s) => (
                          <button
                            key={s.rotulo}
                            type="button"
                            onClick={() => setRefino(s.texto)}
                            className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:border-marca-indigo hover:text-marca-indigo"
                          >
                            {s.rotulo}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={refino}
                        onChange={(e) => setRefino(e.target.value)}
                        rows={2}
                        maxLength={300}
                        placeholder="Ex.: troque o sofá por um bege mais moderno e mantenha todo o resto"
                        className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Botao onClick={refinar} disabled={carregando || refino.trim().length < 3 || (c.conta?.creditos ?? 0) <= 0}>
                          {carregando ? "Refinando…" : "Aplicar · 1 crédito"}
                        </Botao>
                        <span className="text-xs text-neutral-500">Escrever não custa nada. Cobra só quando gera.</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                    <Rotulo>Baixar para o anúncio</Rotulo>
                    <div className="flex flex-wrap items-center gap-2">
                      <Botao variante="secundaria" onClick={() => exportarPara("zap_vivareal_olx")} disabled={exportando !== null}>
                        <Icone nome="download" className="h-4 w-4" />
                        {exportando === "zap_vivareal_olx" ? "Exportando…" : "ZAP · VivaReal · OLX"}
                      </Botao>
                      <Botao variante="secundaria" onClick={() => exportarPara("generico")} disabled={exportando !== null}>
                        <Icone nome="download" className="h-4 w-4" />
                        {exportando === "generico" ? "Exportando…" : "Outros portais"}
                      </Botao>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={legenda}
                        onChange={(e) => setLegenda(e.target.value)}
                        maxLength={80}
                        placeholder="Legenda opcional, ex.: Sala de estar · 32 m²"
                        className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none"
                      />
                      {temLogo && (
                        <label className="flex items-center gap-2 text-sm text-neutral-700">
                          <input type="checkbox" checked={comLogo} onChange={(e) => setComLogo(e.target.checked)} className="accent-marca-coral" />
                          Com meu logo
                        </label>
                      )}
                    </div>
                  </div>

                  {jobId && (
                    <div className="mt-3">
                      <Compartilhar token={c.token} jobId={jobId} texto="Olha como ficou:" />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {reportado ? (
                        <p className="text-xs font-medium text-marca-teal">{reportado}</p>
                      ) : formReporte ? (
                        <div className="max-w-sm">
                          <textarea
                            autoFocus
                            value={motivoReporte}
                            onChange={(e) => setMotivoReporte(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="O que deu errado? Ex.: os móveis ficaram flutuando; o piso não mudou."
                            className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none"
                          />
                          <div className="mt-1.5 flex items-center gap-2">
                            <Botao variante="secundaria" onClick={reportarProblema} disabled={reportando} className="px-3 py-1.5 text-xs">
                              {reportando ? "Avaliando…" : "Enviar e recuperar crédito"}
                            </Botao>
                            <button onClick={() => setFormReporte(false)} className="text-xs text-neutral-500 underline">cancelar</button>
                          </div>
                          <p className="mt-1 text-xs text-neutral-400">Uma IA compara a foto original com o resultado antes de devolver o crédito.</p>
                        </div>
                      ) : (
                        <button onClick={() => setFormReporte(true)} className="text-xs text-neutral-500 underline">
                          Ficou ruim? Reportar e recuperar o crédito
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Botao variante="discreta" onClick={limparResultado}>Editar de novo</Botao>
                      <Botao variante="secundaria" onClick={novaFoto}>Nova foto</Botao>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <Rotulo>{usaMascara ? rotulosMascara.titulo : "Sua foto"}</Rotulo>
                    <button onClick={novaFoto} className="text-xs text-neutral-500 underline">Trocar foto</button>
                  </div>
                  {usaMascara && preview ? (
                    <EditorMascara ref={editorRef} src={preview} aoMudar={setTemMascara} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview ?? ""} alt="Foto original" className="w-full rounded-xl" />
                  )}
                  {carregando && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div className="h-full w-1/3 animate-[deslizar_1.4s_ease-in-out_infinite] rounded-full bg-marca-coral" />
                      </div>
                      <p className="mt-2 text-sm text-neutral-600">{etapa ?? "Gerando…"} Costuma levar de 30 segundos a 2 minutos.</p>
                    </div>
                  )}
                </>
              )}
            </Cartao>
          )}
          {erro && (
            <div className="mt-3">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}
        </section>

        {/* ---------- coluna das ações ---------- */}
        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <Rotulo>O que fazer</Rotulo>
            <div className="flex flex-col gap-3">
              {acoesPorGrupo.map((g) => (
                <div key={g.id}>
                  <p className="mb-1.5 text-xs text-neutral-400">{g.rotulo}</p>
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                    {g.acoes.map((a) => {
                      const ativo = a.id === acao.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => escolherAcao(a.id)}
                          disabled={carregando}
                          title={a.descricao}
                          className={
                            "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm leading-tight transition disabled:opacity-50 " +
                            (ativo ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 text-neutral-700 hover:border-neutral-400")
                          }
                        >
                          <Icone nome={a.id} className="h-4 w-4 shrink-0" />
                          <span>{a.rotulo}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-neutral-600">{acao.descricao}</p>
          </Cartao>

          {(acao.parametros.length > 0 || acao.mascara === "opcional" || acao.referencia) && (
            <Cartao>
              <PainelParametros acao={acao} valores={parametros} onChange={(k, v) => setParametros((p) => ({ ...p, [k]: v }))} />

              {acao.mascara === "opcional" && (
                <label className="mt-5 flex items-start gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={pintarArea} onChange={(e) => { setPintarArea(e.target.checked); setTemMascara(false); }} className="mt-0.5 accent-marca-coral" />
                  <span>
                    {rotulosMascara.opcao}
                    <span className="block text-xs text-neutral-500">{rotulosMascara.ajuda}</span>
                  </span>
                </label>
              )}

              {acao.referencia && (
                <div className="mt-5">
                  <Rotulo>Móveis de outra foto (opcional)</Rotulo>
                  {previewRef ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewRef} alt="Referência" className="h-14 w-20 rounded-lg object-cover" />
                      <button onClick={() => { setReferencia(null); setPreviewRef(null); }} className="text-xs text-neutral-500 underline">Remover</button>
                    </div>
                  ) : (
                    <Dropzone compacto rotulo="Usar os móveis de uma foto" onArquivo={receberReferencia} />
                  )}
                  <p className="mt-1.5 text-xs text-neutral-500">Bom pra manter o mesmo estilo em todas as fotos do imóvel.</p>
                </div>
              )}
            </Cartao>
          )}

          <Cartao>
            <div className="mb-3">
              <Rotulo>Guardar em</Rotulo>
              <SeletorImovel token={c.token} valor={imovelId} onChange={setImovelId} disabled={carregando} />
              <p className="mt-1.5 text-xs text-neutral-500">Fotos do mesmo anúncio ficam juntas e viram um link só pro cliente.</p>
            </div>
            <Botao onClick={() => gerar()} disabled={!podeGerar} className="w-full py-3 text-base">
              {carregando ? (etapa ?? "Gerando…") : `Gerar · 1 crédito`}
            </Botao>
            {!foto && <p className="mt-2 text-center text-xs text-neutral-500">Envie uma foto para começar.</p>}
            {foto && usaMascara && !temMascara && !carregando && (
              <p className="mt-2 text-center text-xs text-neutral-500">Pinte na foto a área antes de gerar.</p>
            )}
            {semCreditos && (
              <div className="mt-3">
                <Aviso tipo="atencao">
                  Seus créditos acabaram.{" "}
                  {c.conta.status === "active" ? "Eles renovam no próximo ciclo." : <Link href="/planos" className="underline">Veja os planos e pacotes.</Link>}
                </Aviso>
              </div>
            )}
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
