"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useConta } from "@/lib/use-conta";
import { ACOES, ACOES_POR_ID, GRUPOS, type DefAcao } from "@/lib/acoes";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
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
  if (typeof window === "undefined") return { imovel: null, compra: null, retorno: null };
  const p = new URLSearchParams(window.location.search);
  const compra = p.get("compra");
  return { imovel: p.get("imovel"), compra, retorno: p.get("assinatura") ?? compra };
}

export default function Editor() {
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

  async function gerar() {
    if (!foto || !podeGerar) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setInfo(null);
    setJobId(null);
    setReportado(null);
    try {
      const token = await c.token();
      const form = new FormData();
      form.append("foto", foto);
      form.append("acao", acao.id);
      form.append("parametros", JSON.stringify(parametros));
      if (imovelId) form.append("imovelId", imovelId);
      if (usaMascara) {
        const mascara = await editorRef.current?.obterMascara();
        if (!mascara) throw new Error("Pinte na foto a área antes de gerar.");
        form.append("mascara", mascara, "mascara.png");
      }
      if (acao.referencia && referencia) form.append("referencia", referencia);

      const resp = await fetch("/api/gerar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Falha ao gerar.");
      setJobId(data.jobId);
      setEtapa("Na fila…");
      const final = await acompanhar(data.jobId, token);
      setResultado(final.url);
      setInfo({ largura: final.width, altura: final.height, modelo: final.modelo, upscaled: final.upscaled, aviso: final.aviso, selo: final.selo ?? null });
      c.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      c.recarregar();
    } finally {
      setCarregando(false);
      setEtapa(null);
    }
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

  const acoesPorGrupo = useMemo(() => GRUPOS.map((g) => ({ ...g, acoes: ACOES.filter((a) => a.grupo === g.id) })), []);

  // ---------- estados sem sessão ----------
  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;

  if (!supabase) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Aviso tipo="atencao">Supabase não configurado. Preencha web/.env.local e reinicie o servidor.</Aviso>
      </main>
    );
  }

  if (!c.user || !c.conta) {
    return (
      <main className="min-h-screen bg-white font-sans">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={44} height={44} className="h-11 w-11" />
            <span className="text-3xl font-bold tracking-tight text-marca-indigo">Encena</span>
          </div>
          <h1 className="mt-8 text-4xl font-semibold leading-tight text-neutral-900 sm:text-5xl">Fotos que vendem melhor.</h1>
          <p className="mt-4 max-w-xl text-lg text-neutral-600">
            Inteligência artificial para imóveis. Mobília ambientes vazios, remova o que atrapalha, corrija a luz, troque o
            céu e exporte no formato dos portais. Em segundos, com o aviso de imagem ilustrativa já no lugar.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/login" className="rounded-lg bg-marca-coral px-5 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
              Entrar e testar grátis
            </a>
            <span className="text-sm text-neutral-500">5 gerações grátis, sem cartão.</span>
            <Link href="/planos" className="text-sm text-marca-indigo underline">Ver planos</Link>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-3">
            {ACOES.filter((a) => ["mobiliar", "remover_objeto", "trocar_ceu"].includes(a.id)).map((a) => (
              <li key={a.id} className="rounded-2xl border border-neutral-200 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
                  <Icone nome={a.id} />
                </span>
                <p className="mt-3 font-semibold">{a.rotulo}</p>
                <p className="text-sm text-neutral-500">{a.descricao}</p>
              </li>
            ))}
          </ul>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---------- coluna da foto ---------- */}
        <section className="lg:col-span-7">
          {!foto ? (
            <Cartao>
              <Dropzone onArquivo={receberFoto} />
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
            <Botao onClick={gerar} disabled={!podeGerar} className="w-full py-3 text-base">
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
