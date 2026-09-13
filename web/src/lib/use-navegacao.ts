"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Navegação de tela: mover, aproximar e afastar. UMA implementação, usada pela planta
// agora e pelo terreno e pelos tours depois -- é isso que faz o produto inteiro responder
// do mesmo jeito em vez de cada tela ter o seu jeito.
//
// O modelo é uma JANELA em unidades do mundo (metros na planta, fração na foto). Quem usa
// só converte janela -> pixel na hora de desenhar; nada aqui sabe o que está sendo visto.

export type Vista = { x0: number; y0: number; largura: number; altura: number };
export type Janela = { x0: number; y0: number; largura: number };

type Opcoes = {
  /** largura/altura da caixa. A altura da janela sai daqui. */
  proporcao: number;
  inicial: Janela;
  /** Limites de zoom, na unidade do mundo. */
  min: number;
  max: number;
};

export function useNavegacao(o: Opcoes) {
  const [base, setBase] = useState<Janela>(o.inicial);
  /** O hook é dono do ref: escrever num ref recebido por argumento é mexer em prop. */
  const caixa = useRef<HTMLElement | null>(null);
  /**
   * O elemento como ESTADO, além do ref.
   *
   * Com ref só, o efeito rodava uma vez com `current` ainda nulo -- a página tem retornos
   * antecipados ("Carregando…"), então a caixa não existe na primeira renderização -- via
   * null, saía, e como as dependências não mudam nunca mais tentava: os ouvintes nunca
   * eram ligados e a rodinha não fazia nada. Como estado, montar o elemento redispara.
   */
  const [no, setNo] = useState<HTMLElement | null>(null);
  const vista: Vista = { ...base, altura: base.largura / o.proporcao };

  // A janela também num ref: os ouvintes nativos são registrados uma vez e não podem
  // depender do valor capturado no render, senão zoom e arrasto usam um estado velho.
  const atual = useRef(vista);
  useEffect(() => {
    atual.current = vista;
  });

  /**
   * Aproxima/afasta ANCORADO num ponto: o que está sob o cursor continua sob o cursor.
   *
   * Sem a âncora o desenho foge da mão -- a pessoa aponta pra cozinha, gira a rodinha e a
   * cozinha sai da tela. É a diferença entre zoom que ajuda e zoom que atrapalha.
   */
  function zoomEm(fator: number, fx = 0.5, fy = 0.5) {
    const v = atual.current;
    const largura = Math.min(o.max, Math.max(o.min, v.largura * fator));
    const altura = largura / o.proporcao;
    setBase({ x0: v.x0 + fx * (v.largura - largura), y0: v.y0 + fy * (v.altura - altura), largura });
  }

  const enquadrar = useCallback((j: Janela) => setBase(j), []);

  /** Vai no `ref` da caixa, no lugar do ref cru. Preenche o ref e avisa que montou. */
  const montarCaixa = useCallback((n: HTMLElement | null) => {
    caixa.current = n;
    setNo(n);
  }, []);

  /** Cresce a janela só o necessário pra caber os pontos. Nunca encolhe, nunca recentra. */
  const abrirEspacoPara = useCallback(
    (pontos: { x: number; y: number }[], folga = 0.8) => {
      if (pontos.length === 0) return;
      setBase((v) => {
        const altura = v.largura / o.proporcao;
        let x0 = v.x0;
        let y0 = v.y0;
        let x1 = v.x0 + v.largura;
        let y1 = v.y0 + altura;
        for (const p of pontos) {
          x0 = Math.min(x0, p.x - folga);
          y0 = Math.min(y0, p.y - folga);
          x1 = Math.max(x1, p.x + folga);
          y1 = Math.max(y1, p.y + folga);
        }
        let largura = x1 - x0;
        if (largura / (y1 - y0) < o.proporcao) largura = (y1 - y0) * o.proporcao;
        if (largura <= v.largura + 1e-6 && x0 >= v.x0 - 1e-6 && y0 >= v.y0 - 1e-6) return v;
        return { x0, y0, largura: Math.min(o.max, largura) };
      });
    },
    [o.max, o.proporcao]
  );

  // ---- rodinha, arrasto do meio e pinça ----
  //
  // Ouvintes NATIVOS, não os do React: `wheel` chega passivo por padrão e sem
  // { passive: false } o navegador ignora o preventDefault e a página inteira rola junto.
  const arrasto = useRef<{ id: number; fx: number; fy: number; j: Janela } | null>(null);
  const pinca = useRef<Map<number, { x: number; y: number }>>(new Map());
  const distPinca = useRef(0);

  const { min, max, proporcao } = o;
  useEffect(() => {
    const el = no;
    if (!el) return;

    // cópias locais: assim o efeito depende só de números estáveis e os ouvintes são
    // registrados uma vez, lendo a janela atual pelo ref em vez de um valor capturado
    const fracao = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
    };
    const zoom = (fator: number, fx: number, fy: number) => {
      const v = atual.current;
      const largura = Math.min(max, Math.max(min, v.largura * fator));
      const altura = largura / proporcao;
      setBase({ x0: v.x0 + fx * (v.largura - largura), y0: v.y0 + fy * (v.altura - altura), largura });
    };

    const aoRolar = (e: WheelEvent) => {
      const f = fracao(e);
      if (!f) return;
      e.preventDefault();
      // ctrl+rodinha é o gesto de pinça do trackpad; chega bem mais forte
      const intensidade = e.ctrlKey ? 0.012 : 0.0022;
      zoom(Math.exp(e.deltaY * intensidade), f.fx, f.fy);
    };

    const aoApertar = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        pinca.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinca.current.size === 2) {
          const [a, b] = [...pinca.current.values()];
          distPinca.current = Math.hypot(a.x - b.x, a.y - b.y);
        }
        return;
      }
      // botão do meio: arrasta a tela sem trocar de ferramenta
      if (e.button !== 1) return;
      const f = fracao(e);
      if (!f) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      arrasto.current = { id: e.pointerId, fx: f.fx, fy: f.fy, j: { ...atual.current } };
    };

    const aoMover = (e: PointerEvent) => {
      if (e.pointerType === "touch" && pinca.current.has(e.pointerId)) {
        pinca.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinca.current.size === 2) {
          const [a, b] = [...pinca.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (distPinca.current > 8 && d > 8) {
            const meio = fracao({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
            if (meio) zoom(distPinca.current / d, meio.fx, meio.fy);
          }
          distPinca.current = d;
        }
        return;
      }
      const a = arrasto.current;
      if (!a || a.id !== e.pointerId) return;
      const f = fracao(e);
      if (!f) return;
      const alt = a.j.largura / proporcao;
      setBase({ x0: a.j.x0 - (f.fx - a.fx) * a.j.largura, y0: a.j.y0 - (f.fy - a.fy) * alt, largura: a.j.largura });
    };

    const aoSoltar = (e: PointerEvent) => {
      pinca.current.delete(e.pointerId);
      if (pinca.current.size < 2) distPinca.current = 0;
      if (arrasto.current?.id === e.pointerId) arrasto.current = null;
    };

    el.addEventListener("wheel", aoRolar, { passive: false });
    el.addEventListener("pointerdown", aoApertar);
    el.addEventListener("pointermove", aoMover);
    el.addEventListener("pointerup", aoSoltar);
    el.addEventListener("pointercancel", aoSoltar);
    // o navegador abre o menu de rolagem no clique do meio; atrapalha o arrasto
    const semAuxiliar = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    el.addEventListener("auxclick", semAuxiliar);
    return () => {
      el.removeEventListener("wheel", aoRolar);
      el.removeEventListener("pointerdown", aoApertar);
      el.removeEventListener("pointermove", aoMover);
      el.removeEventListener("pointerup", aoSoltar);
      el.removeEventListener("pointercancel", aoSoltar);
      el.removeEventListener("auxclick", semAuxiliar);
    };
  }, [no, min, max, proporcao]);

  return { vista, zoomEm, enquadrar, abrirEspacoPara, montarCaixa, caixa, arrastando: () => arrasto.current !== null };
}
