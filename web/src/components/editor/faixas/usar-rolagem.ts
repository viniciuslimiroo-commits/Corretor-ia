"use client";

import { useEffect, useState } from "react";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";

// ROLAGEM E PINÇA da linha do tempo (docs/planos/linha-do-tempo-spec.md, D4).
//
// No celular o cabeçote fica PARADO no centro e a linha corre por baixo: o tempo é
// `scrollLeft / zoom` (há meia tela de folga de cada lado). Duas regras que parecem
// detalhe e são o comportamento inteiro:
//
//   1. Rolagem da PESSOA se reconhece pela intenção, não por uma bandeira: dedo ou mouse
//      encostou, ou roda girou, dentro da linha -> `usuarioRolando`. A bandeira cai 150ms
//      depois do último evento de rolagem que veio após soltar (o embalo do dedo continua
//      rolando e continua sendo da pessoa). Só essa rolagem busca o tempo e pausa a prévia.
//   2. Toda outra rolagem é programada (seguir o relógio tocando, ir pro ponto da régua,
//      a pinça mantendo o tempo no centro) e é ignorada. Sem isso, seguir o Play pausava o
//      Play.
//
// A pinça muda `--pxs` direto no DOM a cada quadro (o React não redesenha nada) e só
// avisa o zoom final ao soltar.
//
// Motor num objeto criado uma vez (useState com inicializador): nada de ref lido no render.

export type OpcoesDaRolagem = {
  zoom: number;
  total: number;
  tempo: number;
  tocando: boolean;
  celular: boolean;
  /** Largura da coluna de nomes (computador); 0 no celular. */
  origemX: number;
  relogio: RelogioDaPrevia;
  aoBuscar(t: number, origem: "regua" | "rolagem" | "arraste"): void;
  aoTocar(tocar: boolean): void;
  aoZoom(px: number): void;
};

export type MotorDeRolagem = {
  ligar(rolagem: HTMLElement, raiz: HTMLElement, cabecote: HTMLElement | null): void;
  desligar(): void;
  atualizar(o: OpcoesDaRolagem): void;
  /** Zoom em vigor agora (durante a pinça, antes de avisar o React). */
  zoomAtual(): number;
  /** Tempo no ponto de x da tela. */
  tempoNoX(clientX: number, conteudo: HTMLElement): number;
  irPara(t: number): void;
  rolarPor(dx: number): void;
  arrastando(b: boolean): void;
  estaRolando(): boolean;
};

const ZOOM_MIN = 4;
const ZOOM_MAX = 120;

export function criarMotorDeRolagem(): MotorDeRolagem {
  let el: HTMLElement | null = null;
  let raiz: HTMLElement | null = null;
  let cabecote: HTMLElement | null = null;
  let o: OpcoesDaRolagem | null = null;
  let zoom = 20;
  let usuario = false;
  let soltou = false;
  let fim: ReturnType<typeof setTimeout> | null = null;
  let ultimaBusca = 0;
  let arrasto = false;
  let desassinar: (() => void) | null = null;
  let quadro = 0;
  let pinca: { z0: number; d0: number; t0: number; ancora: number; z: number } | null = null;
  let quadroPinca = 0;
  const limpezas: (() => void)[] = [];

  const escuta = <K extends keyof HTMLElementEventMap>(alvo: HTMLElement, tipo: K, fn: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions) => {
    alvo.addEventListener(tipo, fn as EventListener, opt);
    limpezas.push(() => alvo.removeEventListener(tipo, fn as EventListener, opt));
  };

  const tempoNoCentro = () => (el ? el.scrollLeft / zoom : 0);

  function comecar() {
    usuario = true;
    soltou = false;
    if (fim) clearTimeout(fim);
    fim = null;
  }
  function agendarFim() {
    soltou = true;
    if (fim) clearTimeout(fim);
    fim = setTimeout(() => {
      usuario = false;
      soltou = false;
      fim = null;
    }, 150);
  }

  function aoRolar() {
    if (!el || !o) return;
    if (soltou) agendarFim();
    if (!usuario || arrasto || pinca || !o.celular) return;
    const agora = performance.now();
    if (agora - ultimaBusca < 50) return;
    ultimaBusca = agora;
    if (o.tocando) o.aoTocar(false);
    o.aoBuscar(Math.max(0, Math.min(o.total, tempoNoCentro())), "rolagem");
  }

  function posicionar(t: number) {
    if (!el || !o) return;
    if (o.celular) {
      const x = t * zoom;
      if (Math.abs(el.scrollLeft - x) > 0.5) el.scrollLeft = x;
    } else if (cabecote) {
      const x = o.origemX + t * zoom;
      cabecote.style.transform = `translateX(${x}px)`;
      // Computador: o cabeçote anda, e a trilha rola atrás quando ele sai da vista.
      if (o.tocando && (x < el.scrollLeft + o.origemX + 20 || x > el.scrollLeft + el.clientWidth - 60)) el.scrollLeft = Math.max(0, x - o.origemX - 40);
    }
  }

  function seguir(t: number) {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      if (!usuario && !arrasto && !pinca) posicionar(t);
    });
  }

  function distancia(a: Touch, b: Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function aplicarZoom(z: number) {
    if (!raiz || !el || !o || !pinca) return;
    pinca.z = z;
    zoom = z;
    raiz.style.setProperty("--pxs", `${z}px`);
    // Mantém o mesmo segundo embaixo do cabeçote (celular) ou dos dedos (computador).
    if (o.celular) el.scrollLeft = pinca.t0 * z;
    else el.scrollLeft = Math.max(0, o.origemX + pinca.t0 * z - pinca.ancora);
    if (!o.celular && cabecote) cabecote.style.transform = `translateX(${o.origemX + o.tempo * z}px)`;
  }

  return {
    ligar(rolagem, r, cab) {
      el = rolagem;
      raiz = r;
      cabecote = cab;
      escuta(rolagem, "pointerdown", () => comecar());
      escuta(rolagem, "pointerup", () => agendarFim());
      escuta(rolagem, "pointercancel", () => agendarFim());
      escuta(rolagem, "wheel", () => {
        comecar();
        agendarFim();
      }, { passive: true });
      escuta(rolagem, "scroll", () => aoRolar(), { passive: true });
      escuta(rolagem, "touchstart", (e) => {
        comecar();
        if (e.touches.length === 2 && el && o) {
          e.preventDefault();
          const [a, b] = [e.touches[0], e.touches[1]];
          const caixa = el.getBoundingClientRect();
          const ancora = (a.clientX + b.clientX) / 2 - caixa.left;
          const t0 = o.celular ? tempoNoCentro() : (el.scrollLeft + ancora - o.origemX) / zoom;
          pinca = { z0: zoom, d0: Math.max(10, distancia(a, b)), t0, ancora, z: zoom };
        }
      }, { passive: false });
      escuta(rolagem, "touchmove", (e) => {
        if (!pinca || e.touches.length < 2) return;
        e.preventDefault();
        const d = distancia(e.touches[0], e.touches[1]);
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (pinca.z0 * d) / pinca.d0));
        cancelAnimationFrame(quadroPinca);
        quadroPinca = requestAnimationFrame(() => aplicarZoom(z));
      }, { passive: false });
      const soltar = (e: TouchEvent) => {
        if (pinca && e.touches.length < 2) {
          const z = pinca.z;
          pinca = null;
          o?.aoZoom(Math.round(z * 100) / 100);
        }
        if (e.touches.length === 0) agendarFim();
      };
      escuta(rolagem, "touchend", soltar);
      escuta(rolagem, "touchcancel", soltar);
      // Safari: a pinça nativa da página não pode roubar a da linha do tempo.
      const semGesto = (e: Event) => e.preventDefault();
      rolagem.addEventListener("gesturestart", semGesto);
      rolagem.addEventListener("gesturechange", semGesto);
      limpezas.push(() => {
        rolagem.removeEventListener("gesturestart", semGesto);
        rolagem.removeEventListener("gesturechange", semGesto);
      });
    },
    desligar() {
      limpezas.splice(0).forEach((f) => f());
      desassinar?.();
      desassinar = null;
      cancelAnimationFrame(quadro);
      cancelAnimationFrame(quadroPinca);
      if (fim) clearTimeout(fim);
      el = raiz = cabecote = null;
    },
    atualizar(novo) {
      const antes = o;
      o = novo;
      if (!pinca) zoom = novo.zoom;
      if (novo.tocando && !desassinar) desassinar = novo.relogio.assinar((t) => seguir(t));
      if ((!novo.tocando || (antes && antes.relogio !== novo.relogio)) && desassinar) {
        desassinar();
        desassinar = novo.tocando ? novo.relogio.assinar((t) => seguir(t)) : null;
      }
      // Parado, o tempo que vem de fora manda na posição -- menos quando é a própria
      // pessoa rolando (o tempo veio dela) ou arrastando um bloco.
      if (!novo.tocando && !usuario && !arrasto && !pinca) posicionar(novo.tempo);
    },
    zoomAtual: () => zoom,
    tempoNoX(clientX, conteudo) {
      const caixa = conteudo.getBoundingClientRect();
      return Math.max(0, Math.min(o?.total ?? 0, (clientX - caixa.left - (o?.origemX ?? 0)) / zoom));
    },
    irPara(t) {
      if (!el || !o) return;
      usuario = false;
      soltou = false;
      if (o.celular) el.scrollTo({ left: t * zoom, behavior: "smooth" });
      else posicionar(t);
      o.aoBuscar(t, "regua");
    },
    rolarPor(dx) {
      if (!el || !o) return;
      el.scrollLeft += dx;
      if (o.celular) o.aoBuscar(Math.max(0, Math.min(o.total, tempoNoCentro())), "arraste");
    },
    arrastando(b) {
      arrasto = b;
    },
    estaRolando: () => usuario,
  };
}

/** O motor da rolagem, ligado ao contêiner e à raiz (onde mora `--pxs`). */
export function useRolagemCentrada(rolagem: HTMLElement | null, raiz: HTMLElement | null, cabecote: HTMLElement | null, o: OpcoesDaRolagem): MotorDeRolagem {
  const [motor] = useState<MotorDeRolagem>(criarMotorDeRolagem);
  useEffect(() => {
    if (!rolagem || !raiz) return;
    motor.ligar(rolagem, raiz, cabecote);
    return () => motor.desligar();
  }, [motor, rolagem, raiz, cabecote]);
  useEffect(() => {
    motor.atualizar(o);
  });
  return motor;
}
