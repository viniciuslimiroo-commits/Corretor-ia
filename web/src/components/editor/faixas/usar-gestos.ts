"use client";

import { useEffect, useState } from "react";
import type { BlocoLinha, FaixaId, FaixasDaLinha, Gesto, RefItem, ResultadoGesto, TrilhaId } from "@/lib/linha-do-tempo";
import type { MotorDeRolagem } from "./usar-rolagem";

// GESTOS da linha do tempo (docs/planos/linha-do-tempo-spec.md, D4). Um ouvinte só, no
// contêiner, lê o `data-alvo` do que foi tocado e decide:
//
//   toque (menos de 6px e de 450ms)  bloco -> seleciona (o cursor NÃO anda); grupo com
//                                    mais de um item -> lista; faixa fina -> abre a faixa;
//                                    fundo vazio -> tira a seleção; régua -> leva o cursor.
//   segurar 450ms parado             bloco -> menu (aoMenu).
//   arrastar                         SÓ o bloco selecionado (no dedo). Bloco não
//                                    selecionado tem `touch-action: pan-x`: o navegador
//                                    rola a linha e manda pointercancel pra cá. Mouse
//                                    seleciona ao apertar e já arrasta.
//   alça                             apara início/fim.
//   segundo dedo                     cancela arraste e segurar (vira pinça, no motor da
//                                    rolagem).
//   régua (mouse)                    apertar e arrastar passeia o cursor pelo vídeo.
//   fundo vazio (mouse)              além de tirar a seleção, leva o cursor pro ponto --
//                                    como clicar na linha de qualquer editor de vídeo.
//   botão dentro da linha (o +)      não é gesto: o clique vai pro botão.
//
// Durante o arraste, cada movimento pede `simularGesto` ao dono (a conta é da biblioteca
// pura, sobre o estado do COMEÇO do gesto) e desenha um fantasma e a guia de encaixe
// direto no DOM. Só no soltar o dono recebe `aoConfirmarGesto`. Perto da borda (32px) a
// linha rola sozinha 8px por quadro, e o que rolou entra no delta.

export type OpcoesDosGestos = {
  faixas: FaixasDaLinha;
  selecao: RefItem | null;
  celular: boolean;
  origemX: number;
  /** Arrastar a música desliza o trecho do arquivo em vez de mover o bloco. */
  modoTrecho?: boolean;
  simularGesto(ref: RefItem, g: Gesto): ResultadoGesto<never>;
  aoConfirmarGesto(ref: RefItem, g: Gesto): void;
  aoSelecionar(ref: RefItem | null): void;
  aoAbrirLista(grupo: BlocoLinha): void;
  aoMenu(ref: RefItem, x: number, y: number): void;
  aoAbrirFaixa(f: FaixaId): void;
};

type Alvo = "bloco" | "alca-inicio" | "alca-fim" | "faixa-fina" | "faixa-vazia" | "cenas-fundo" | "regua";

type Ativo = {
  id: number;
  tipoPonteiro: string;
  x0: number;
  y0: number;
  t0: number;
  alvo: Alvo;
  faixa: FaixaId | null;
  bloco: BlocoLinha | null;
  elBloco: HTMLElement | null;
  podeArrastar: boolean;
  moveu: boolean;
  arrastando: boolean;
  segurou: boolean;
  rolagem0: number;
  gesto: Gesto | null;
  segurar: ReturnType<typeof setTimeout> | null;
  borda: number;
};

export type MotorDeGestos = {
  ligar(rolagem: HTMLElement, conteudo: HTMLElement, fantasma: HTMLElement, guia: HTMLElement, motor: MotorDeRolagem): void;
  desligar(): void;
  atualizar(o: OpcoesDosGestos): void;
};

const LIMIAR = 6;
const SEGURAR_MS = 450;
const BORDA = 32;

export function criarMotorDeGestos(): MotorDeGestos {
  let rolagem: HTMLElement | null = null;
  let conteudo: HTMLElement | null = null;
  let fantasma: HTMLElement | null = null;
  let guia: HTMLElement | null = null;
  let mr: MotorDeRolagem | null = null;
  let o: OpcoesDosGestos | null = null;
  let ativo: Ativo | null = null;
  let quadroBorda = 0;
  const limpezas: (() => void)[] = [];

  const blocoDaChave = (chave: string | undefined): BlocoLinha | null => {
    if (!chave || !o) return null;
    const [trilha, i] = chave.split(":");
    return o.faixas.trilhas[trilha as TrilhaId]?.[Number(i)] ?? null;
  };

  function esconder() {
    if (fantasma) fantasma.style.display = "none";
    if (guia) guia.style.display = "none";
    if (ativo?.elBloco) ativo.elBloco.style.opacity = "";
  }

  function encerrar() {
    if (!ativo) return;
    if (ativo.segurar) clearTimeout(ativo.segurar);
    cancelAnimationFrame(quadroBorda);
    esconder();
    if (ativo.arrastando) mr?.arrastando(false);
    ativo = null;
  }

  function gestoAgora(a: Ativo, clientX: number): Gesto | null {
    if (!a.bloco || !mr || !rolagem || !conteudo) return null;
    const z = mr.zoomAtual();
    const ds = (clientX - a.x0 + (rolagem.scrollLeft - a.rolagem0)) / z;
    if (a.alvo === "alca-inicio") return { tipo: "aparaInicio", para: a.bloco.de + ds };
    if (a.alvo === "alca-fim") return { tipo: "aparaFim", para: a.bloco.ate + ds };
    if (a.bloco.trilha === "cenas") {
      const t = mr.tempoNoX(clientX, conteudo);
      const cenas = o?.faixas.trilhas.cenas.filter((b) => b.ref.faixa === "cenas") ?? [];
      let k = cenas.findIndex((b) => t >= b.de && t < b.ate);
      if (k < 0) k = t < (cenas[0]?.de ?? 0) ? 0 : cenas.length - 1;
      return { tipo: "reordenar", paraIndice: k };
    }
    if (o?.modoTrecho && a.bloco.trilha === "musica") return { tipo: "deslizarTrecho", delta: ds };
    return { tipo: "mover", delta: ds };
  }

  function desenhar(a: Ativo, clientX: number) {
    if (!o || !mr || !fantasma || !guia || !conteudo || !a.bloco) return;
    const g = gestoAgora(a, clientX);
    if (!g) return;
    a.gesto = g;
    const r = o.simularGesto(a.bloco.ref, g);
    const z = mr.zoomAtual();
    if (a.elBloco) {
      const cb = conteudo.getBoundingClientRect();
      const bb = a.elBloco.getBoundingClientRect();
      fantasma.style.top = `${bb.top - cb.top}px`;
      fantasma.style.height = `${bb.height}px`;
    }
    fantasma.style.left = `${o.origemX + r.de * z}px`;
    fantasma.style.width = `${Math.max(3, (r.ate - r.de) * z)}px`;
    fantasma.style.display = "block";
    fantasma.dataset.borda = r.parouNaBorda ? "1" : "";
    if (r.guia !== null && r.guia !== undefined) {
      guia.style.left = `${o.origemX + r.guia * z}px`;
      guia.style.display = "block";
    } else {
      guia.style.display = "none";
    }
  }

  function rolarNaBorda(a: Ativo, clientX: number) {
    if (!rolagem || !mr) return;
    const caixa = rolagem.getBoundingClientRect();
    const dir = clientX < caixa.left + BORDA ? -1 : clientX > caixa.right - BORDA ? 1 : 0;
    a.borda = dir;
    cancelAnimationFrame(quadroBorda);
    if (!dir) return;
    const passo = () => {
      if (!ativo || ativo !== a || !a.arrastando || !a.borda || !mr) return;
      mr.rolarPor(8 * a.borda);
      desenhar(a, clientX);
      quadroBorda = requestAnimationFrame(passo);
    };
    quadroBorda = requestAnimationFrame(passo);
  }

  function tocar(a: Ativo, clientX: number) {
    if (!o || !mr || !conteudo) return;
    switch (a.alvo) {
      case "bloco":
        if (!a.bloco) return;
        if ((a.bloco.contagem ?? 0) > 1) o.aoAbrirLista(a.bloco);
        else o.aoSelecionar(a.bloco.ref);
        return;
      case "faixa-fina":
        if (a.faixa) o.aoAbrirFaixa(a.faixa);
        return;
      case "faixa-vazia":
      case "cenas-fundo":
        o.aoSelecionar(null);
        if (a.tipoPonteiro === "mouse") mr.irPara(mr.tempoNoX(clientX, conteudo));
        return;
      case "regua":
        mr.irPara(mr.tempoNoX(clientX, conteudo));
        return;
      default:
        return;
    }
  }

  function aoApertar(e: PointerEvent) {
    if (!o || !conteudo) return;
    if (ativo && e.pointerId !== ativo.id) {
      // Segundo dedo: nada de arraste, menu ou toque pela metade. A pinça é do motor da
      // rolagem; o primeiro dedo, ao soltar, não vira toque.
      encerrar();
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement | null)?.closest("button")) return;
    const alvoEl = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-alvo]");
    if (!alvoEl || !conteudo.contains(alvoEl)) return;
    const alvo = alvoEl.dataset.alvo as Alvo;
    const bloco = blocoDaChave(alvoEl.dataset.chave);
    const faixa = (alvoEl.dataset.faixa ?? alvoEl.closest<HTMLElement>("[data-faixa]")?.dataset.faixa ?? null) as FaixaId | null;
    const elBloco = alvo === "alca-inicio" || alvo === "alca-fim" ? alvoEl.closest<HTMLElement>('[data-alvo="bloco"]') : alvo === "bloco" ? alvoEl : null;
    const selecionado = !!elBloco?.dataset.selecionado;
    const mouse = e.pointerType === "mouse";
    const largura = elBloco ? elBloco.getBoundingClientRect().width : 0;
    let podeArrastar = false;
    if (alvo === "alca-inicio" || alvo === "alca-fim") podeArrastar = true;
    else if (alvo === "bloco" && bloco?.movel) podeArrastar = mouse || (selecionado && largura >= 44);
    if (mouse && alvo === "bloco" && bloco && !selecionado) o.aoSelecionar(bloco.ref);
    const a: Ativo = {
      id: e.pointerId,
      tipoPonteiro: e.pointerType,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      alvo,
      faixa,
      bloco,
      elBloco,
      podeArrastar,
      moveu: false,
      arrastando: false,
      segurou: false,
      rolagem0: rolagem?.scrollLeft ?? 0,
      gesto: null,
      segurar: null,
      borda: 0,
    };
    if ((alvo === "bloco" || alvo === "alca-inicio" || alvo === "alca-fim") && bloco) {
      a.segurar = setTimeout(() => {
        if (ativo !== a || a.moveu || !o || !a.bloco) return;
        a.segurou = true;
        a.segurar = null;
        o.aoMenu(a.bloco.ref, a.x0, a.y0);
      }, SEGURAR_MS);
    }
    // Régua no mouse: apertou, o cursor já vai; arrastando, ele acompanha (aoMover).
    if (alvo === "regua" && mouse && mr) {
      mr.irPara(mr.tempoNoX(e.clientX, conteudo));
      podeArrastar = true;
      a.podeArrastar = true;
    }
    if (podeArrastar) {
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        // alvo sumiu do DOM
      }
    }
    ativo = a;
  }

  function aoMover(e: PointerEvent) {
    const a = ativo;
    if (!a || e.pointerId !== a.id) return;
    if (!a.moveu && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > LIMIAR) {
      a.moveu = true;
      if (a.segurar) clearTimeout(a.segurar);
      a.segurar = null;
      if (a.podeArrastar && !a.segurou) {
        a.arrastando = true;
        mr?.arrastando(true);
        if (a.elBloco) a.elBloco.style.opacity = "0.4";
      }
    }
    if (a.arrastando && a.alvo === "regua") {
      e.preventDefault();
      if (mr && conteudo) mr.irPara(mr.tempoNoX(e.clientX, conteudo));
      return;
    }
    if (a.arrastando) {
      e.preventDefault();
      desenhar(a, e.clientX);
      rolarNaBorda(a, e.clientX);
    }
  }

  function aoSoltar(e: PointerEvent) {
    const a = ativo;
    if (!a || e.pointerId !== a.id) return;
    if (a.arrastando && a.alvo === "regua") {
      encerrar();
      return;
    }
    if (a.arrastando) {
      const g = a.gesto;
      const ref = a.bloco?.ref;
      encerrar();
      if (g && ref && o) o.aoConfirmarGesto(ref, g);
      return;
    }
    const toque = !a.moveu && !a.segurou && performance.now() - a.t0 < SEGURAR_MS;
    encerrar();
    if (toque) tocar(a, e.clientX);
  }

  return {
    ligar(r, c, f, g, motor) {
      rolagem = r;
      conteudo = c;
      fantasma = f;
      guia = g;
      mr = motor;
      const ouvir = <K extends keyof HTMLElementEventMap>(tipo: K, fn: (e: HTMLElementEventMap[K]) => void) => {
        r.addEventListener(tipo, fn as EventListener);
        limpezas.push(() => r.removeEventListener(tipo, fn as EventListener));
      };
      ouvir("pointerdown", aoApertar);
      ouvir("pointermove", aoMover);
      ouvir("pointerup", aoSoltar);
      // O navegador tomou o dedo pra rolar (bloco não selecionado): larga tudo, sem confirmar.
      ouvir("pointercancel", (e) => {
        if (ativo && e.pointerId === ativo.id) encerrar();
      });
      ouvir("contextmenu", (e) => {
        if ((e as MouseEvent).button !== 2) e.preventDefault();
      });
    },
    desligar() {
      encerrar();
      limpezas.splice(0).forEach((fn) => fn());
      rolagem = conteudo = fantasma = guia = null;
      mr = null;
    },
    atualizar(novo) {
      o = novo;
    },
  };
}

export function useGestosDaLinha(
  els: { rolagem: HTMLElement | null; conteudo: HTMLElement | null; fantasma: HTMLElement | null; guia: HTMLElement | null },
  motorRolagem: MotorDeRolagem,
  o: OpcoesDosGestos
): void {
  const [motor] = useState<MotorDeGestos>(criarMotorDeGestos);
  const { rolagem, conteudo, fantasma, guia } = els;
  useEffect(() => {
    if (!rolagem || !conteudo || !fantasma || !guia) return;
    motor.ligar(rolagem, conteudo, fantasma, guia, motorRolagem);
    return () => motor.desligar();
  }, [motor, motorRolagem, rolagem, conteudo, fantasma, guia]);
  useEffect(() => {
    motor.atualizar(o);
  });
}
