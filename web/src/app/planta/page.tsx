"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import {
  CORES_COMODO,
  LARGURA_JANELA,
  LARGURA_PORTA,
  NOMES_SUGERIDOS,
  PASSO_PADRAO,
  alinhar,
  area,
  areaTotal,
  distancia,
  encaixar,
  limites,
  metros,
  metrosQuadrados,
  type Abertura,
  type Comodo,
  type Planta,
  type Ponto,
} from "@/lib/planta";
import { plantaParaSvg } from "@/lib/planta-svg";
import AppShell from "@/components/app-shell";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, Cartao, Chip, Icone, Rotulo } from "@/components/ui";

// Planta baixa: desenhar do zero, com as medidas saindo sozinhas. Tudo em metros; a
// tela só converte pra pixel. O mesmo SVG que aparece aqui é o que o servidor exporta,
// então não existe "na tela ficou diferente do arquivo".
//
// Desenho por TOQUE: cada toque marca um canto; o ponto gruda na grade de meio metro e
// se alinha com o canto anterior quando está quase reto. É o que faz alguém desenhar
// uma planta decente com o dedo.

type Ferramenta = "comodo" | "porta" | "janela" | "apagar";

let seq = 0;
const novoId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

const PLANTA_VAZIA: Planta = { nome: "", passo: PASSO_PADRAO, comodos: [], aberturas: [], cotas: true };

export default function PaginaPlanta() {
  const c = useConta();
  const [planta, setPlanta] = useState<Planta>(PLANTA_VAZIA);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("comodo");
  const [rascunho, setRascunho] = useState<Ponto[]>([]);
  const [cursor, setCursor] = useState<Ponto | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [imovelId, setImovelId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("imovel")));
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ jobId: string; url: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Área visível em metros: cresce com o desenho, com um mínimo pra não ficar apertado.
  const vista = useMemo(() => {
    const l = limites(planta, 1.5);
    const largura = Math.max(12, l.x1 - l.x0, ...rascunho.map((p) => p.x + 2));
    const altura = Math.max(9, l.y1 - l.y0, ...rascunho.map((p) => p.y + 2));
    return { x0: Math.min(l.x0, 0), y0: Math.min(l.y0, 0), largura, altura };
  }, [planta, rascunho]);

  const escalaTela = 46;
  const svgLargura = Math.round(vista.largura * escalaTela);
  const svgAltura = Math.round(vista.altura * escalaTela);

  function posicao(e: ReactPointerEvent): Ponto | null {
    const r = caixa.current?.getBoundingClientRect();
    if (!r) return null;
    const x = ((e.clientX - r.left) / r.width) * vista.largura + vista.x0;
    const y = ((e.clientY - r.top) / r.height) * vista.altura + vista.y0;
    return { x, y };
  }

  function pontoDeTrabalho(e: ReactPointerEvent): Ponto | null {
    const cru = posicao(e);
    if (!cru) return null;
    const grudado = encaixar(cru, planta.passo);
    return alinhar(rascunho[rascunho.length - 1], grudado, planta.passo * 1.4);
  }

  function tocar(e: ReactPointerEvent) {
    const p = pontoDeTrabalho(e);
    if (!p) return;
    if (ferramenta === "comodo") {
      // tocar de novo no primeiro canto fecha o cômodo
      if (rascunho.length >= 3 && distancia(p, rascunho[0]) < planta.passo * 1.2) return fecharComodo();
      setRascunho((l) => [...l, p]);
      return;
    }
    if (ferramenta === "porta" || ferramenta === "janela") {
      const encaixe = encaixarNaParede(p);
      const nova: Abertura = {
        id: novoId("a"),
        tipo: ferramenta,
        p: encaixe?.p ?? p,
        angulo: encaixe?.angulo ?? 0,
        largura: ferramenta === "porta" ? LARGURA_PORTA : LARGURA_JANELA,
      };
      setPlanta((pl) => ({ ...pl, aberturas: [...pl.aberturas, nova] }));
      setResultado(null);
      return;
    }
    if (ferramenta === "apagar") {
      const perto = planta.aberturas.find((a) => distancia(a.p, p) < 0.6);
      if (perto) {
        setPlanta((pl) => ({ ...pl, aberturas: pl.aberturas.filter((a) => a.id !== perto.id) }));
        setResultado(null);
        return;
      }
      const dentro = [...planta.comodos].reverse().find((cm) => dentroDoPoligono(p, cm.pontos));
      if (dentro) {
        setPlanta((pl) => ({ ...pl, comodos: pl.comodos.filter((cm) => cm.id !== dentro.id) }));
        setResultado(null);
      }
    }
  }

  /** Gruda a abertura na parede mais próxima e copia o ângulo dela. */
  function encaixarNaParede(p: Ponto): { p: Ponto; angulo: number } | null {
    let melhor: { p: Ponto; angulo: number; d: number } | null = null;
    for (const cm of planta.comodos) {
      for (let i = 0; i < cm.pontos.length; i++) {
        const a = cm.pontos[i];
        const b = cm.pontos[(i + 1) % cm.pontos.length];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const comp2 = vx * vx + vy * vy;
        if (comp2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / comp2));
        const q = { x: a.x + vx * t, y: a.y + vy * t };
        const d = distancia(p, q);
        if (!melhor || d < melhor.d) melhor = { p: q, angulo: (Math.atan2(vy, vx) * 180) / Math.PI, d };
      }
    }
    return melhor && melhor.d < 1.2 ? { p: melhor.p, angulo: melhor.angulo } : null;
  }

  function dentroDoPoligono(p: Ponto, poli: Ponto[]) {
    let dentro = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      const a = poli[i];
      const b = poli[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
    }
    return dentro;
  }

  function fecharComodo() {
    if (rascunho.length < 3) return;
    const novo: Comodo = {
      id: novoId("c"),
      nome: NOMES_SUGERIDOS[planta.comodos.length] ?? "",
      pontos: rascunho,
      cor: CORES_COMODO[planta.comodos.length % CORES_COMODO.length],
    };
    setPlanta((pl) => ({ ...pl, comodos: [...pl.comodos, novo] }));
    setRascunho([]);
    setSelecionado(novo.id);
    setResultado(null);
  }

  function desfazerPonto() {
    if (rascunho.length) return setRascunho((l) => l.slice(0, -1));
    if (planta.aberturas.length) return setPlanta((pl) => ({ ...pl, aberturas: pl.aberturas.slice(0, -1) }));
    setPlanta((pl) => ({ ...pl, comodos: pl.comodos.slice(0, -1) }));
    setResultado(null);
  }

  async function salvar() {
    if (planta.comodos.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/planta", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await c.token()}` },
        body: JSON.stringify({ planta, imovelId, jobId: resultado?.jobId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResultado({ jobId: d.jobId, url: d.url });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setRascunho([]);
      if (e.key === "Enter" && rascunho.length >= 3) fecharComodo();
      if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") desfazerPonto();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para desenhar plantas.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  const previa = plantaParaSvg({ ...planta, nome: "" }, { escala: escalaTela, grade: true });
  const total = areaTotal(planta);
  const comodoSelecionado = planta.comodos.find((x) => x.id === selecionado) ?? null;
  const px = (x: number) => ((x - vista.x0) / vista.largura) * 100;
  const py = (y: number) => ((y - vista.y0) / vista.altura) * 100;

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-neutral-200 bg-white p-1 text-sm">
        <Link href="/" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Uma foto</Link>
        <Link href="/lote" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Em lote</Link>
        <Link href="/terreno" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Terreno</Link>
        <span className="flex items-center gap-1.5 rounded-lg bg-marca-indigo/10 px-3 py-1.5 font-medium text-marca-indigo">
          <Icone nome="planta" className="h-4 w-4" />
          Planta
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planta baixa</h1>
          <p className="mt-1 text-sm text-neutral-500">Toque nos cantos de cada cômodo. As medidas e a área saem sozinhas. Não gasta crédito.</p>
        </div>
        <p className="text-sm text-neutral-600">
          {planta.comodos.length} {planta.comodos.length === 1 ? "cômodo" : "cômodos"} · <strong>{metrosQuadrados(total)}</strong>
        </p>
      </div>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-5 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <Cartao className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Chip ativo={ferramenta === "comodo"} onClick={() => setFerramenta("comodo")}>Cômodo</Chip>
              <Chip ativo={ferramenta === "porta"} onClick={() => setFerramenta("porta")}>Porta</Chip>
              <Chip ativo={ferramenta === "janela"} onClick={() => setFerramenta("janela")}>Janela</Chip>
              <Chip ativo={ferramenta === "apagar"} onClick={() => setFerramenta("apagar")}>Apagar</Chip>
              <span className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
                <button onClick={desfazerPonto} className="underline">desfazer</button>
                {rascunho.length >= 3 && (
                  <button onClick={fecharComodo} className="rounded bg-marca-coral px-2 py-1 font-medium text-white">fechar cômodo</button>
                )}
              </span>
            </div>

            <div
              ref={caixa}
              className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-white"
              style={{ aspectRatio: `${svgLargura} / ${svgAltura}`, touchAction: "none", cursor: "crosshair" }}
              onPointerDown={tocar}
              onPointerMove={(e) => setCursor(pontoDeTrabalho(e))}
              onPointerLeave={() => setCursor(null)}
            >
              <div className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: previa.svg.replace("<svg ", '<svg style="width:100%;height:100%" ').replace(/width="\d+" height="\d+"/, "") }} />

              {/* rascunho do cômodo em andamento */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {rascunho.length >= 2 && (
                  <polyline points={rascunho.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} fill="none" stroke="#f06b4f" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
                {rascunho.length >= 1 && cursor && ferramenta === "comodo" && (
                  <line x1={px(rascunho[rascunho.length - 1].x)} y1={py(rascunho[rascunho.length - 1].y)} x2={px(cursor.x)} y2={py(cursor.y)} stroke="#f06b4f" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
              </svg>
              {rascunho.map((p, i) => (
                <span key={i} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-marca-coral" style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%` }} />
              ))}
              {rascunho.length >= 1 && cursor && ferramenta === "comodo" && (
                <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-marca-indigo px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ left: `${(px(rascunho[rascunho.length - 1].x) + px(cursor.x)) / 2}%`, top: `${(py(rascunho[rascunho.length - 1].y) + py(cursor.y)) / 2}%` }}>
                  {metros(distancia(rascunho[rascunho.length - 1], cursor))}
                </span>
              )}
              {planta.comodos.map((cm) => {
                const m = cm.pontos.reduce((s, p) => ({ x: s.x + p.x / cm.pontos.length, y: s.y + p.y / cm.pontos.length }), { x: 0, y: 0 });
                return (
                  <button
                    key={cm.id}
                    onPointerDown={(e) => {
                      if (ferramenta !== "comodo") return;
                      e.stopPropagation();
                      setSelecionado(cm.id);
                    }}
                    className={"absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white/70 " + (selecionado === cm.id ? "border-marca-coral" : "border-transparent")}
                    style={{ left: `${px(m.x)}%`, top: `${py(m.y)}%` }}
                    title={cm.nome || "cômodo"}
                  />
                );
              })}
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              {ferramenta === "comodo"
                ? rascunho.length === 0
                  ? "Toque no primeiro canto do cômodo. Os pontos grudam na grade de meio metro e as paredes saem retas sozinhas."
                  : `${rascunho.length} ${rascunho.length === 1 ? "canto" : "cantos"}. Toque no primeiro canto de novo, ou em "fechar cômodo".`
                : ferramenta === "apagar"
                  ? "Toque numa porta, janela ou dentro de um cômodo pra apagar."
                  : "Toque perto da parede: a abertura gruda nela sozinha."}
            </p>
          </Cartao>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-4">
          <Cartao>
            <Rotulo>Cômodos</Rotulo>
            {planta.comodos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum ainda. Desenhe o primeiro ao lado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {planta.comodos.map((cm) => (
                  <li key={cm.id} className="flex items-center gap-2">
                    <span className="h-4 w-4 shrink-0 rounded border border-neutral-300" style={{ background: cm.cor }} />
                    <input
                      value={cm.nome}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPlanta((pl) => ({ ...pl, comodos: pl.comodos.map((x) => (x.id === cm.id ? { ...x, nome: v } : x)) }));
                        setResultado(null);
                      }}
                      placeholder="Nome do cômodo"
                      maxLength={28}
                      list="nomes-comodo"
                      className={campo + " py-1.5"}
                      onFocus={() => setSelecionado(cm.id)}
                    />
                    <span className="w-20 shrink-0 text-right text-xs text-neutral-500">{metrosQuadrados(area(cm.pontos))}</span>
                    <button onClick={() => { setPlanta((pl) => ({ ...pl, comodos: pl.comodos.filter((x) => x.id !== cm.id) })); setResultado(null); }} className="shrink-0 text-neutral-400 hover:text-red-600" title="Apagar">
                      <Icone nome="fechar" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <datalist id="nomes-comodo">
              {NOMES_SUGERIDOS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {comodoSelecionado && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-neutral-500">Cor:</span>
                {CORES_COMODO.map((k) => (
                  <button
                    key={k}
                    onClick={() => setPlanta((pl) => ({ ...pl, comodos: pl.comodos.map((x) => (x.id === comodoSelecionado.id ? { ...x, cor: k } : x)) }))}
                    className={"h-5 w-5 rounded border-2 " + (comodoSelecionado.cor === k ? "border-neutral-800" : "border-neutral-200")}
                    style={{ background: k }}
                  />
                ))}
              </div>
            )}
          </Cartao>

          <Cartao>
            <Rotulo>Planta</Rotulo>
            <input value={planta.nome} onChange={(e) => setPlanta((pl) => ({ ...pl, nome: e.target.value }))} placeholder="Nome (ex.: Apto 302 · Térreo)" maxLength={60} className={campo} />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 text-neutral-700">
                <input type="checkbox" checked={planta.cotas} onChange={(e) => { setPlanta((pl) => ({ ...pl, cotas: e.target.checked })); setResultado(null); }} className="accent-marca-coral" />
                Mostrar medidas
              </label>
              <span className="text-xs text-neutral-500">Grade:</span>
              {[0.25, 0.5, 1].map((v) => (
                <button key={v} onClick={() => setPlanta((pl) => ({ ...pl, passo: v }))} className={"rounded px-2 py-0.5 text-xs " + (planta.passo === v ? "bg-marca-indigo text-white" : "bg-neutral-100 text-neutral-600")}>
                  {v === 1 ? "1 m" : `${v * 100} cm`}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Rotulo>Guardar em</Rotulo>
              <SeletorImovel token={c.token} valor={imovelId} onChange={setImovelId} disabled={salvando} />
            </div>
            <Botao onClick={salvar} disabled={salvando || planta.comodos.length === 0} className="mt-3 w-full py-3 text-base">
              {salvando ? "Gerando…" : resultado ? "Atualizar planta · grátis" : "Gerar planta · grátis"}
            </Botao>
          </Cartao>

          {resultado && (
            <Cartao>
              <Rotulo>Pronta</Rotulo>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado.url} alt="Planta baixa" className="w-full rounded-lg border border-neutral-200" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={resultado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                  <Icone nome="download" className="h-4 w-4" />
                  Baixar PNG
                </a>
              </div>
              <div className="mt-3">
                <Compartilhar token={c.token} jobId={resultado.jobId} texto="Planta do imóvel:" />
              </div>
            </Cartao>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
