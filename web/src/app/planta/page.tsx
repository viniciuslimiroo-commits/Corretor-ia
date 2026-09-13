"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  grudarNoDesenho,
  limites,
  metros,
  metrosQuadrados,
  projetarNaParede,
  proximoGiro,
  retangulo,
  type Abertura,
  type Comodo,
  type Planta,
  type Ponto,
} from "@/lib/planta";
import { plantaParaSvg } from "@/lib/planta-svg";
import { ESTILOS } from "@/lib/acoes";
import AppShell from "@/components/app-shell";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, Cartao, Chip, Icone, Rotulo } from "@/components/ui";

// Planta baixa: desenhar do zero, com as medidas saindo sozinhas. Tudo em metros; a
// tela só converte pra pixel. O mesmo SVG que aparece aqui é o que o servidor exporta,
// então não existe "na tela ficou diferente do arquivo".
//
// Desenho por TOQUE: cada toque marca um canto. O ponto gruda, nesta ordem, num canto que
// já existe, numa parede que já existe, e só então na grade -- é o que faz o cômodo novo
// COLAR no anterior, porque num imóvel de verdade eles dividem parede. Depois disso o
// ponto ainda se alinha com o canto anterior quando está quase reto.
//
// A prévia e a camada de toque usam a MESMA janela (`vista`), passada pro plantaParaSvg.
// Sem isso o SVG se centraliza sozinho dentro da caixa e o ponto não cai onde se tocou.

type Ferramenta = "comodo" | "retangulo" | "porta" | "janela" | "mover" | "apagar";

/** A caixa de desenho tem proporção fixa: assim o zoom não muda o formato dela. */
const PROPORCAO = 4 / 3;
const LARGURA_MIN = 3; // metros visíveis no zoom máximo
const LARGURA_MAX = 80;

let seq = 0;
const novoId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

const PLANTA_VAZIA: Planta = { nome: "", passo: PASSO_PADRAO, comodos: [], aberturas: [], cotas: true };

/** O que dá pra voltar e seguir: a planta e o cômodo que está sendo desenhado. */
type Estado = { planta: Planta; rascunho: Ponto[] };
const ESTADO_INICIAL: Estado = { planta: PLANTA_VAZIA, rascunho: [] };
const LIMITE_HISTORICO = 80;

export default function PaginaPlanta() {
  const c = useConta();
  const [ferramenta, setFerramenta] = useState<Ferramenta>("comodo");
  const [cursor, setCursor] = useState<Ponto | null>(null);

  /**
   * Histórico de voltar/seguir. Pilha de fotografias do estado -- a planta é JSON pequeno,
   * então guardar cópia inteira sai mais barato (e muito mais confiável) que guardar a
   * operação inversa de cada ação.
   *
   * Pilha e posição vivem no MESMO estado de propósito: em dois `useState` separados eles
   * saem de sincronia numa atualização em lote e o histórico aponta pro lugar errado.
   *
   * `chave` funde alterações seguidas da mesma origem: digitar o nome de um cômodo é uma
   * entrada só, não uma por letra.
   */
  const [hist, setHist] = useState<{ pilha: Estado[]; i: number; chave: string | null }>({
    pilha: [ESTADO_INICIAL],
    i: 0,
    chave: null,
  });
  const { planta, rascunho } = hist.pilha[hist.i];
  const podeVoltar = hist.i > 0;
  const podeSeguir = hist.i < hist.pilha.length - 1;

  function registrar(muda: (e: Estado) => Estado, chave: string | null = null) {
    setHist((h) => {
      const base = h.pilha.slice(0, h.i + 1);
      const atual = base[base.length - 1];
      const proximo = muda(atual);
      if (proximo.planta === atual.planta && proximo.rascunho === atual.rascunho) return h;
      // mesma origem em sequência (digitação): troca o topo em vez de empilhar
      if (chave && chave === h.chave && base.length > 1) {
        const nova = [...base.slice(0, -1), proximo];
        return { pilha: nova, i: nova.length - 1, chave };
      }
      const nova = [...base, proximo];
      const cortada = nova.length > LIMITE_HISTORICO ? nova.slice(nova.length - LIMITE_HISTORICO) : nova;
      return { pilha: cortada, i: cortada.length - 1, chave };
    });
  }

  // Mesma assinatura dos setState que substituíram, pra todo o resto da tela continuar igual.
  const setPlanta = (v: Planta | ((p: Planta) => Planta), chave?: string) =>
    registrar((e) => ({ ...e, planta: typeof v === "function" ? v(e.planta) : v }), chave ?? null);
  const setRascunho = (v: Ponto[] | ((r: Ponto[]) => Ponto[])) =>
    registrar((e) => ({ ...e, rascunho: typeof v === "function" ? v(e.rascunho) : v }));

  const voltar = () => setHist((h) => (h.i > 0 ? { ...h, i: h.i - 1, chave: null } : h));
  const seguir = () => setHist((h) => (h.i < h.pilha.length - 1 ? { ...h, i: h.i + 1, chave: null } : h));
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [imovelId, setImovelId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("imovel")));
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ jobId: string; url: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState<{ telaX: number; telaY: number; x0: number; y0: number } | null>(null);
  const [cantoRetangulo, setCantoRetangulo] = useState<Ponto | null>(null);
  const [estiloIa, setEstiloIa] = useState(ESTILOS[0].valor);
  const [decorando, setDecorando] = useState<"humanizada" | "maquete" | null>(null);
  const [decorado, setDecorado] = useState<{ jobId: string; url: string } | null>(null);

  /**
   * Janela visível, em metros. É ESTADO, não coisa calculada a cada desenho -- de
   * propósito.
   *
   * Quando ela se reenquadrava sozinha, cada cômodo terminado mudava a escala e o centro,
   * e o desenho fugia debaixo do dedo: o arrasto seguinte caía num ponto diferente do que
   * a pessoa mirou. Agora a janela só muda quando a pessoa manda (zoom, arrastar,
   * enquadrar) ou quando o desenho passaria da borda -- e aí ela cresce, nunca recentra.
   */
  const [vistaBase, setVistaBase] = useState({ x0: -1, y0: -1, largura: 12 });
  const vista = { ...vistaBase, altura: vistaBase.largura / PROPORCAO };

  /** Enquadramento que faz a planta inteira caber, na proporção da caixa. */
  function enquadramentoDe(pl: Planta) {
    const l = limites(pl, 1.2);
    let largura = Math.max(10, l.x1 - l.x0);
    let altura = Math.max(10 / PROPORCAO, l.y1 - l.y0);
    if (largura / altura > PROPORCAO) altura = largura / PROPORCAO;
    else largura = altura * PROPORCAO;
    return { x0: (l.x0 + l.x1) / 2 - largura / 2, y0: (l.y0 + l.y1) / 2 - altura / 2, largura };
  }

  /** Cresce a janela só o suficiente pra caber os pontos novos. Nunca encolhe, nunca recentra. */
  function abrirEspacoPara(pontos: Ponto[]) {
    if (pontos.length === 0) return;
    setVistaBase((v) => {
      const altura = v.largura / PROPORCAO;
      let x0 = v.x0;
      let y0 = v.y0;
      let x1 = v.x0 + v.largura;
      let y1 = v.y0 + altura;
      for (const p of pontos) {
        x0 = Math.min(x0, p.x - 0.8);
        y0 = Math.min(y0, p.y - 0.8);
        x1 = Math.max(x1, p.x + 0.8);
        y1 = Math.max(y1, p.y + 0.8);
      }
      let largura = x1 - x0;
      if (largura / (y1 - y0) < PROPORCAO) largura = (y1 - y0) * PROPORCAO;
      if (largura <= v.largura + 1e-6 && x0 >= v.x0 - 1e-6 && y0 >= v.y0 - 1e-6) return v;
      return { x0, y0, largura: Math.min(LARGURA_MAX, largura) };
    });
  }

  const escalaTela = 46;
  const svgLargura = Math.round(vista.largura * escalaTela);
  const svgAltura = Math.round(vista.altura * escalaTela);

  /** Zoom mantendo o centro. fator < 1 aproxima. */
  function aplicarZoom(fator: number) {
    const cx = vista.x0 + vista.largura / 2;
    const cy = vista.y0 + vista.altura / 2;
    const largura = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, vista.largura * fator));
    setVistaBase({ x0: cx - largura / 2, y0: cy - largura / PROPORCAO / 2, largura });
  }

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
    // gruda primeiro no que já foi desenhado (canto > parede > grade), depois alinha
    const { p: grudado } = grudarNoDesenho(cru, planta, planta.passo, rascunho);
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
      // tocar de novo numa porta que já existe gira ela em vez de criar outra:
      // são as quatro formas de abrir (dois lados da parede × duas mãos)
      const jaTem = planta.aberturas.find((a) => distancia(a.p, p) < 0.6);
      if (jaTem) {
        if (jaTem.tipo === "porta") {
          const g = proximoGiro(jaTem);
          setPlanta((pl) => ({ ...pl, aberturas: pl.aberturas.map((a) => (a.id === jaTem.id ? { ...a, ...g } : a)) }));
          setResultado(null);
        }
        return;
      }
      const encaixe = encaixarNaParede(p);
      const nova: Abertura = {
        id: novoId("a"),
        tipo: ferramenta,
        p: encaixe?.p ?? p,
        angulo: encaixe?.angulo ?? 0,
        largura: ferramenta === "porta" ? LARGURA_PORTA : LARGURA_JANELA,
        lado: 1,
        giro: 1,
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
        const q = projetarNaParede(p, a, b);
        if (!q) continue;
        const d = distancia(p, q);
        if (!melhor || d < melhor.d) melhor = { p: q, angulo: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, d };
      }
    }
    return melhor && melhor.d < 1.2 ? { p: melhor.p, angulo: melhor.angulo } : null;
  }

  /** Fecha o retângulo arrastado. Quase todo cômodo é retângulo: um gesto em vez de 5 toques. */
  function fecharRetangulo(fim: Ponto) {
    const ini = cantoRetangulo;
    setCantoRetangulo(null);
    if (!ini || Math.abs(fim.x - ini.x) < planta.passo || Math.abs(fim.y - ini.y) < planta.passo) return;
    const novo: Comodo = {
      id: novoId("c"),
      nome: NOMES_SUGERIDOS[planta.comodos.length] ?? "",
      pontos: retangulo(ini, fim),
      cor: CORES_COMODO[planta.comodos.length % CORES_COMODO.length],
    };
    setPlanta((pl) => ({ ...pl, comodos: [...pl.comodos, novo] }));
    abrirEspacoPara(novo.pontos);
    setSelecionado(novo.id);
    setResultado(null);
  }

  function aoApertar(e: ReactPointerEvent) {
    if (ferramenta === "mover") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setPan({ telaX: e.clientX, telaY: e.clientY, x0: vista.x0, y0: vista.y0 });
      return;
    }
    if (ferramenta === "retangulo") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setCantoRetangulo(pontoDeTrabalho(e));
      return;
    }
    tocar(e);
  }

  function aoMover(e: ReactPointerEvent) {
    if (pan) {
      const r = caixa.current?.getBoundingClientRect();
      if (!r) return;
      const porPixel = vista.largura / r.width;
      setVistaBase({
        x0: pan.x0 - (e.clientX - pan.telaX) * porPixel,
        y0: pan.y0 - (e.clientY - pan.telaY) * porPixel,
        largura: vista.largura,
      });
      return;
    }
    setCursor(pontoDeTrabalho(e));
  }

  function aoSoltar(e: ReactPointerEvent) {
    if (pan) return setPan(null);
    if (ferramenta === "retangulo" && cantoRetangulo) {
      const fim = pontoDeTrabalho(e);
      if (fim) fecharRetangulo(fim);
      else setCantoRetangulo(null);
    }
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
    // comodos e rascunho numa REGISTRADA so: senao voltar precisaria de dois toques
    registrar((e) => ({ planta: { ...e.planta, comodos: [...e.planta.comodos, novo] }, rascunho: [] }));
    abrirEspacoPara(novo.pontos);
    setSelecionado(novo.id);
    setResultado(null);
  }

  /**
   * Manda a planta pra IA decorar. Vira um job normal, então quem acompanha é o
   * /api/job/[id] de sempre -- mesma fila, mesmo estorno automático se falhar.
   */
  async function decorar(vista: "humanizada" | "maquete") {
    if (planta.comodos.length === 0 || decorando) return;
    setDecorando(vista);
    setErro(null);
    setDecorado(null);
    try {
      const token = await c.token();
      const r = await fetch("/api/planta/humanizar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planta, vista, estilo: estiloIa, imovelId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      for (let i = 0; i < 60; i++) {
        await new Promise((z) => setTimeout(z, 3000));
        const j = await (await fetch(`/api/job/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (j.status === "concluido" && j.url) {
          setDecorado({ jobId: d.jobId, url: j.url });
          c.recarregar?.();
          return;
        }
        if (j.status === "falhou" || j.erro) throw new Error(j.erro ?? "A IA não conseguiu decorar essa planta. O crédito volta sozinho.");
      }
      throw new Error("Demorou demais. Se o crédito foi cobrado, ele volta sozinho.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao decorar.");
    } finally {
      setDecorando(null);
    }
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
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA)$/.test(alvo.tagName)) return; // não sequestrar a digitação
      if (e.key === "Escape") setRascunho([]);
      if (e.key === "Enter" && rascunho.length >= 3) fecharComodo();
      const cmd = e.ctrlKey || e.metaKey;
      if ((cmd && e.key.toLowerCase() === "z" && e.shiftKey) || (cmd && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        return seguir();
      }
      if ((cmd && e.key.toLowerCase() === "z") || e.key === "Backspace") {
        e.preventDefault();
        voltar();
      }
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
  // MESMA janela da camada de toque: é o que garante que o ponto cai onde se tocou
  const previa = plantaParaSvg({ ...planta, nome: "" }, { escala: escalaTela, grade: true, vista });
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
          <p className="mt-1 text-sm text-neutral-500">Arraste um retângulo por cômodo, ou marque canto a canto. Cômodo novo cola no anterior; medidas e área saem sozinhas. Não gasta crédito.</p>
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
              <Chip ativo={ferramenta === "retangulo"} onClick={() => setFerramenta("retangulo")}>Retângulo</Chip>
              <Chip ativo={ferramenta === "comodo"} onClick={() => setFerramenta("comodo")}>Cômodo livre</Chip>
              <Chip ativo={ferramenta === "porta"} onClick={() => setFerramenta("porta")}>Porta</Chip>
              <Chip ativo={ferramenta === "janela"} onClick={() => setFerramenta("janela")}>Janela</Chip>
              <Chip ativo={ferramenta === "mover"} onClick={() => setFerramenta("mover")}>Mover</Chip>
              <Chip ativo={ferramenta === "apagar"} onClick={() => setFerramenta("apagar")}>Apagar</Chip>
              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => aplicarZoom(1 / 0.75)} title="Afastar" aria-label="Afastar" className="h-7 w-7 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">−</button>
                <button onClick={() => aplicarZoom(0.75)} title="Aproximar" aria-label="Aproximar" className="h-7 w-7 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">+</button>
                <button onClick={() => setVistaBase(enquadramentoDe(planta))} title="Enquadrar tudo" className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">enquadrar</button>
              </span>
            </div>

            <div
              ref={caixa}
              className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-white"
              style={{
                aspectRatio: `${svgLargura} / ${svgAltura}`,
                touchAction: "none",
                cursor: ferramenta === "mover" ? (pan ? "grabbing" : "grab") : "crosshair",
              }}
              onPointerDown={aoApertar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerLeave={() => {
                setCursor(null);
                setPan(null);
              }}
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
                {cantoRetangulo && cursor && (
                  <rect
                    x={Math.min(px(cantoRetangulo.x), px(cursor.x))}
                    y={Math.min(py(cantoRetangulo.y), py(cursor.y))}
                    width={Math.abs(px(cursor.x) - px(cantoRetangulo.x))}
                    height={Math.abs(py(cursor.y) - py(cantoRetangulo.y))}
                    fill="#f06b4f"
                    fillOpacity={0.15}
                    stroke="#f06b4f"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {cantoRetangulo && cursor && (
                <span
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-marca-indigo px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ left: `${(px(cantoRetangulo.x) + px(cursor.x)) / 2}%`, top: `${(py(cantoRetangulo.y) + py(cursor.y)) / 2}%` }}
                >
                  {metros(Math.abs(cursor.x - cantoRetangulo.x))} × {metros(Math.abs(cursor.y - cantoRetangulo.y))}
                </span>
              )}
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
                      if (ferramenta !== "comodo" && ferramenta !== "retangulo") return;
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <p>
                {ferramenta === "retangulo"
                  ? "Arraste de um canto ao outro. O cômodo novo cola sozinho na parede do que já está desenhado."
                  : ferramenta === "comodo"
                    ? rascunho.length === 0
                      ? "Toque em cada canto. O ponto gruda primeiro num canto ou parede que já existe, depois na grade."
                      : `${rascunho.length} ${rascunho.length === 1 ? "canto" : "cantos"}. Toque no primeiro canto de novo, ou em "fechar cômodo".`
                    : ferramenta === "mover"
                      ? "Arraste pra andar pela planta. Use − e + pra afastar e aproximar."
                      : ferramenta === "apagar"
                        ? "Toque numa porta, janela ou dentro de um cômodo pra apagar."
                        : ferramenta === "porta"
                          ? "Toque perto da parede pra colocar. Toque de novo numa porta pra virar o lado que ela abre."
                          : "Toque perto da parede: a janela gruda nela sozinha."}
              </p>
              <span className="flex shrink-0 items-center gap-3">
                <button onClick={voltar} disabled={!podeVoltar} title="Voltar (Ctrl+Z)" className={podeVoltar ? "underline hover:text-neutral-800" : "text-neutral-300"}>← voltar</button>
                <button onClick={seguir} disabled={!podeSeguir} title="Seguir (Ctrl+Shift+Z)" className={podeSeguir ? "underline hover:text-neutral-800" : "text-neutral-300"}>seguir →</button>
                {rascunho.length >= 3 && (
                  <button onClick={fecharComodo} className="rounded bg-marca-coral px-2 py-1 font-medium text-white">fechar cômodo</button>
                )}
              </span>
            </div>
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
                        setPlanta((pl) => ({ ...pl, comodos: pl.comodos.map((x) => (x.id === cm.id ? { ...x, nome: v } : x)) }), `nome:${cm.id}`);
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
            <input value={planta.nome} onChange={(e) => setPlanta((pl) => ({ ...pl, nome: e.target.value }), "nome-da-planta")} placeholder="Nome (ex.: Apto 302 · Térreo)" maxLength={60} className={campo} />
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

          {/* ---- decorar a planta com IA ---- */}
          <Cartao>
            <Rotulo>Decorar com IA · 1 crédito</Rotulo>
            <p className="text-sm text-neutral-500">
              A mesma planta, com móveis, piso e sombra. A técnica com as medidas continua salva do lado.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ESTILOS.slice(0, 6).map((e) => (
                <Chip key={e.valor} ativo={estiloIa === e.valor} onClick={() => setEstiloIa(e.valor)}>
                  {e.rotulo}
                </Chip>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Botao onClick={() => decorar("humanizada")} disabled={!!decorando || planta.comodos.length === 0} className="py-2.5">
                {decorando === "humanizada" ? "Decorando…" : "Vista de cima"}
              </Botao>
              <Botao variante="secundaria" onClick={() => decorar("maquete")} disabled={!!decorando || planta.comodos.length === 0} className="py-2.5">
                {decorando === "maquete" ? "Montando…" : "Maquete 3D"}
              </Botao>
            </div>
            {decorando && <p className="mt-2 text-xs text-neutral-500">Leva cerca de meio minuto.</p>}
            {decorado && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={decorado.url} alt="Planta decorada" className="w-full rounded-lg border border-neutral-200" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={decorado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                    <Icone nome="download" className="h-4 w-4" />
                    Baixar
                  </a>
                </div>
                <div className="mt-2">
                  <Compartilhar token={c.token} jobId={decorado.jobId} texto="Planta do imóvel:" />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Sai como imagem ilustrativa. Os móveis são sugestão da IA; quem vale como medida é a planta técnica.
                </p>
              </div>
            )}
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
