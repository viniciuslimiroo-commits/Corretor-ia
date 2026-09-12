"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";

// Terreno com medidas. A pessoa toca nos cantos do lote na foto, digita os metros de
// cada lado e a área, e o desenho sai por cima da foto -- na hora, na tela, e depois
// gravado pelo servidor no tamanho cheio. Sem IA: linha reta é linha reta.
//
// Os pontos ficam em fração (0..1) da imagem, então o que se vê no celular é o que sai
// em 2560px no arquivo.

type Ponto = { x: number; y: number };

const CORES = ["#f06b4f", "#2cb1a3", "#0f2d5b", "#e8b800", "#ffffff"];

export default function Terreno() {
  const c = useConta();
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [medidas, setMedidas] = useState<string[]>([]);
  const [area, setArea] = useState("");
  const [titulo, setTitulo] = useState("");
  const [frente, setFrente] = useState<number>(-1);
  const [cor, setCor] = useState(CORES[0]);
  const [imovelId, setImovelId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("imovel")));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ jobId: string; url: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function receber(f: File) {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(f);
    setPreview(URL.createObjectURL(f));
    setPontos([]);
    setMedidas([]);
    setResultado(null);
    setErro(null);
  }

  function posicao(e: ReactPointerEvent): Ponto | null {
    const r = caixa.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function clicar(e: ReactPointerEvent) {
    if (arrastando !== null || resultado) return;
    const p = posicao(e);
    if (!p || pontos.length >= 12) return;
    setPontos((lista) => [...lista, p]);
    setMedidas((lista) => [...lista, ""]);
  }

  function mover(e: ReactPointerEvent) {
    if (arrastando === null) return;
    const p = posicao(e);
    if (!p) return;
    setPontos((lista) => lista.map((q, i) => (i === arrastando ? p : q)));
  }

  function desfazer() {
    setPontos((lista) => lista.slice(0, -1));
    setMedidas((lista) => lista.slice(0, -1));
    setResultado(null);
  }

  async function gerar() {
    if (!foto || pontos.length < 3) return;
    setGerando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("foto", foto);
      form.append("pontos", JSON.stringify(pontos));
      form.append("medidas", JSON.stringify(medidas));
      form.append("area", area);
      form.append("titulo", titulo);
      form.append("frente", String(frente));
      form.append("cor", cor);
      if (imovelId) form.append("imovelId", imovelId);
      const r = await fetch("/api/terreno", { method: "POST", headers: { Authorization: `Bearer ${await c.token()}` }, body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResultado({ jobId: d.jobId, url: d.url });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para marcar terrenos.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  const fechado = pontos.length >= 3;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="mb-4 inline-flex rounded-xl border border-neutral-200 bg-white p-1 text-sm">
        <Link href="/" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Uma foto</Link>
        <Link href="/lote" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Em lote</Link>
        <span className="flex items-center gap-1.5 rounded-lg bg-marca-indigo/10 px-3 py-1.5 font-medium text-marca-indigo">
          <Icone nome="terreno" className="h-4 w-4" />
          Terreno
        </span>
      </div>

      <h1 className="text-2xl font-semibold">Terreno com medidas</h1>
      <p className="mt-1 text-sm text-neutral-500">Toque nos cantos do lote na foto, digite os metros de cada lado e a área. Não gasta crédito.</p>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Cartao className="p-3 sm:p-4">
            {!preview ? (
              <Dropzone rotulo="Foto do terreno ou lote" onArquivo={receber} />
            ) : resultado ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultado.url} alt="Terreno com medidas" className="w-full rounded-xl" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href={resultado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                    <Icone nome="download" className="h-4 w-4" />
                    Baixar
                  </a>
                  <Botao variante="discreta" onClick={() => setResultado(null)}>Ajustar</Botao>
                  <Botao variante="secundaria" onClick={() => { setFoto(null); setPreview(null); setPontos([]); setMedidas([]); setResultado(null); }}>Outra foto</Botao>
                </div>
                <div className="mt-3">
                  <Compartilhar token={c.token} jobId={resultado.jobId} texto="Olha o terreno:" />
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <Rotulo>{pontos.length < 3 ? `Toque nos cantos (${pontos.length}/3 no mínimo)` : `${pontos.length} cantos · arraste pra ajustar`}</Rotulo>
                  <div className="flex gap-3 text-xs">
                    {pontos.length > 0 && <button onClick={desfazer} className="text-neutral-500 underline">desfazer</button>}
                    <button onClick={() => { setFoto(null); setPreview(null); setPontos([]); setMedidas([]); }} className="text-neutral-500 underline">trocar foto</button>
                  </div>
                </div>
                <div
                  ref={caixa}
                  className="relative select-none overflow-hidden rounded-xl bg-neutral-100"
                  style={{ touchAction: "none", cursor: "crosshair" }}
                  onPointerDown={clicar}
                  onPointerMove={mover}
                  onPointerUp={() => setArrastando(null)}
                  onPointerLeave={() => setArrastando(null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Terreno" className="block w-full" draggable={false} />
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {fechado && (
                      <polygon points={pontos.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill={cor} fillOpacity={0.22} stroke={cor} strokeWidth={0.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    )}
                    {!fechado && pontos.length >= 2 && (
                      <polyline points={pontos.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="none" stroke={cor} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                    )}
                  </svg>
                  {pontos.map((p, i) => {
                    const prox = pontos[(i + 1) % pontos.length];
                    const mx = ((p.x + (fechado || i < pontos.length - 1 ? prox.x : p.x)) / 2) * 100;
                    const my = ((p.y + (fechado || i < pontos.length - 1 ? prox.y : p.y)) / 2) * 100;
                    return (
                      <div key={i}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setArrastando(i);
                          }}
                          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow"
                          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, borderColor: cor, cursor: "grab" }}
                          title={`Canto ${i + 1}`}
                        />
                        {(fechado || i < pontos.length - 1) && medidas[i] && (
                          <span className={"pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white " + (i === frente ? "" : "bg-marca-indigo")} style={{ left: `${mx}%`, top: `${my}%`, background: i === frente ? cor : undefined }}>
                            {/m/i.test(medidas[i]) ? medidas[i] : `${medidas[i]} m`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {fechado && area && (
                    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-marca-indigo shadow" style={{ left: `${(pontos.reduce((s, p) => s + p.x, 0) / pontos.length) * 100}%`, top: `${(pontos.reduce((s, p) => s + p.y, 0) / pontos.length) * 100}%` }}>
                      {/m/i.test(area) ? area : `${area} m²`}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-neutral-500">Marque na ordem, seguindo a borda do lote. No celular, use dois dedos pra dar zoom antes de tocar.</p>
              </>
            )}
          </Cartao>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <Rotulo>Medidas de cada lado</Rotulo>
            {pontos.length < 2 ? (
              <p className="text-sm text-neutral-500">Marque os cantos primeiro. Os lados aparecem aqui na ordem.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pontos.map((_, i) => {
                  if (!fechado && i === pontos.length - 1) return null;
                  return (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 text-neutral-500">Lado {i + 1}→{((i + 1) % pontos.length) + 1}</span>
                      <input value={medidas[i] ?? ""} onChange={(e) => setMedidas((lista) => lista.map((m, k) => (k === i ? e.target.value : m)))} inputMode="decimal" placeholder="metros" maxLength={16} className={campo} />
                      <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500" title="Marcar como frente do lote">
                        <input type="radio" name="frente" checked={frente === i} onChange={() => setFrente(i)} className="accent-marca-coral" /> frente
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Área total</span>
                <input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" placeholder="ex.: 360 m²" maxLength={24} className={campo} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Título (opcional)</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Lote 12 · Quadra B" maxLength={40} className={campo} />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Cor:</span>
              {CORES.map((k) => (
                <button key={k} type="button" onClick={() => setCor(k)} className={"h-6 w-6 rounded-full border-2 " + (cor === k ? "border-neutral-800" : "border-neutral-200")} style={{ background: k }} title={k} />
              ))}
            </div>
          </Cartao>

          <Cartao>
            <div className="mb-3">
              <Rotulo>Guardar em</Rotulo>
              <SeletorImovel token={c.token} valor={imovelId} onChange={setImovelId} disabled={gerando} />
            </div>
            <Botao onClick={gerar} disabled={gerando || !foto || pontos.length < 3 || !!resultado} className="w-full py-3 text-base">
              {gerando ? "Gerando…" : "Gerar imagem · grátis"}
            </Botao>
            <p className="mt-2 text-center text-xs text-neutral-500">Sai com o aviso &quot;medidas aproximadas, informadas pelo anunciante&quot;.</p>
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
