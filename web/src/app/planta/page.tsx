"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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
import {
  GRUPOS_MOVEL,
  MOVEIS,
  MOVEL_POR_TIPO,
  alinharComOutros,
  dentroDoMovel,
  encostarNaParede,
  paredesDe,
  type DefMovel,
  type Movel,
  type TipoMovel,
} from "@/lib/moveis";
import { plantaParaSvg } from "@/lib/planta-svg";
import { useNavegacao } from "@/lib/use-navegacao";
import { ESTILOS, FAIXAS } from "@/lib/acoes";
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

type Ferramenta = "comodo" | "retangulo" | "porta" | "janela" | "movel" | "mover" | "apagar";

/** O que o ponteiro está fazendo com um móvel. */
type Manuseio =
  | { modo: "arrastar"; id: string; dx: number; dy: number }
  | { modo: "girar"; id: string }
  | { modo: "redimensionar"; id: string; larg0: number; alt0: number; d0: number };

/** A caixa de desenho tem proporção fixa: assim o zoom não muda o formato dela. */
const PROPORCAO = 4 / 3;
const LARGURA_MIN = 3; // metros visíveis no zoom máximo
const LARGURA_MAX = 80;

let seq = 0;
const novoId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

const PLANTA_VAZIA: Planta = { nome: "", passo: PASSO_PADRAO, comodos: [], aberturas: [], moveis: [], cotas: true };

/** O que dá pra voltar e seguir: a planta e o cômodo que está sendo desenhado. */
type Estado = { planta: Planta; rascunho: Ponto[] };
const ESTADO_INICIAL: Estado = { planta: PLANTA_VAZIA, rascunho: [] };
const LIMITE_HISTORICO = 80;

// A vista afastando sozinha enquanto se desenha. Faixa da borda em FRAÇÃO da caixa, passo de
// afastamento por vez e o intervalo mínimo entre dois passos -- `pointermove` dispara dezenas
// de vezes por segundo, e sem o intervalo um segundo na borda jogaria a planta pra longe.
// 1,05 a cada 90ms dá ~1,7x por segundo de dedo encostado: dá pra ver acontecendo e dá pra
// parar no lugar certo.
const FAIXA_DA_BORDA = 0.12;
const PASSO_AFASTAR = 1.05;
const INTERVALO_AFASTAR = 90;

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
  const [pan, setPan] = useState<{ telaX: number; telaY: number; x0: number; y0: number } | null>(null);
  const [cantoRetangulo, setCantoRetangulo] = useState<Ponto | null>(null);
  /** Quando foi o último passo de afastamento automático (veja `afastarNaBorda`). */
  const ultimoAfastar = useRef(0);
  const [estiloIa, setEstiloIa] = useState(ESTILOS[0].valor);
  // A faixa de mercado: a mesma planta mobiliada como compacto e como alto padrão são
  // dois imóveis diferentes, e quem vende sabe qual dos dois é.
  const [faixaIa, setFaixaIa] = useState("medio");
  const [tipoMovel, setTipoMovel] = useState<TipoMovel>("cama_casal");
  const [grupoMovel, setGrupoMovel] = useState<DefMovel["grupo"]>("sala");
  const [selMovel, setSelMovel] = useState<string | null>(null);
  const [manuseio, setManuseio] = useState<Manuseio | null>(null);
  const [guias, setGuias] = useState<{ eixo: "x" | "y"; valor: number }[]>([]);
  const [decorando, setDecorando] = useState<"humanizada" | "maquete" | null>(null);
  const [decorado, setDecorado] = useState<{ jobId: string; url: string } | null>(null);
  /** O botão que leva a metragem pra ficha do imóvel: parado, indo, foi, ou deu erro. */
  const [areaNaFicha, setAreaNaFicha] = useState<"parado" | "indo" | "erro">("parado");
  /** A metragem que JÁ está na ficha. Mexeu na planta depois de gravar? O "✓" some --
   *  senão ele diria que a ficha tem um número que ela não tem mais. */
  const [areaGravada, setAreaGravada] = useState<number | null>(null);

  /**
   * Janela visível, em metros. Vem da camada compartilhada de navegação (use-navegacao),
   * a mesma que o terreno e os tours vão usar -- é o que faz mover e ampliar responderem
   * igual no produto inteiro.
   *
   * Ela NÃO se reenquadra sozinha, de propósito: quando fazia isso, cada cômodo terminado
   * mudava escala e centro e o desenho fugia debaixo do dedo (o arrasto seguinte caía
   * noutro ponto do mundo). Só muda quando a pessoa manda, ou cresce quando o desenho
   * passaria da borda.
   */
  const nav = useNavegacao({ proporcao: PROPORCAO, inicial: { x0: -1, y0: -1, largura: 12 }, min: LARGURA_MIN, max: LARGURA_MAX });
  const vista = nav.vista;

  /** Enquadramento que faz a planta inteira caber, na proporção da caixa. */
  function enquadramentoDe(pl: Planta) {
    const l = limites(pl, 1.2);
    let largura = Math.max(10, l.x1 - l.x0);
    let altura = Math.max(10 / PROPORCAO, l.y1 - l.y0);
    if (largura / altura > PROPORCAO) altura = largura / PROPORCAO;
    else largura = altura * PROPORCAO;
    return { x0: (l.x0 + l.x1) / 2 - largura / 2, y0: (l.y0 + l.y1) / 2 - altura / 2, largura };
  }

  const abrirEspacoPara = nav.abrirEspacoPara;

  const escalaTela = 46;
  const svgLargura = Math.round(vista.largura * escalaTela);
  const svgAltura = Math.round(vista.altura * escalaTela);

  /**
   * O cômodo fecha tocando de novo no primeiro canto -- e isso era invisível.
   *
   * Ele desenhou um retângulo, achou que estava pronto e só depois viu que os cantos não
   * tinham se ligado. O gesto existia e funcionava; o que faltava era a tela DIZER que
   * estava na hora de fechar. Daqui saem os três avisos: o primeiro canto vira alvo grande
   * a partir do terceiro ponto, a linha que segue o dedo pula pra ele quando chega perto,
   * e o cômodo aparece preenchido antes de existir.
   */
  /** Está desenhando agora? É o que liga o afastamento automático na borda. */
  const desenhando = (ferramenta === "comodo" && rascunho.length > 0) || cantoRetangulo !== null;
  const alcanceDeFechar = planta.passo * 1.2;
  const podeFechar = ferramenta === "comodo" && rascunho.length >= 3;
  const fechando = podeFechar && !!cursor && distancia(cursor, rascunho[0]) < alcanceDeFechar;

  function posicao(e: ReactPointerEvent): Ponto | null {
    const r = nav.caixa.current?.getBoundingClientRect();
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
    // A borracha vem ANTES do ponto de trabalho: ela não desenha, ela escolhe o que já
    // está na tela, e por isso usa o ponto cru (veja `apagarNoPonto`).
    if (ferramenta === "apagar") return apagarNoPonto(e);
    const p = pontoDeTrabalho(e);
    if (!p) return;
    if (ferramenta === "comodo") {
      // tocar de novo no primeiro canto fecha o cômodo
      if (rascunho.length >= 3 && distancia(p, rascunho[0]) < planta.passo * 1.2) return fecharComodo();
      setRascunho((l) => [...l, p]);
      // o desenho cresce junto: antes só o cômodo FECHADO abria espaço, e quem desenhava
      // um cômodo grande esbarrava na borda e tinha que parar pra afastar a vista
      abrirEspacoPara([p]);
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
  }

  /**
   * A borracha: apaga o que está DEBAIXO do dedo.
   *
   * Ela usava `pontoDeTrabalho`, que é o ponto de DESENHO -- e esse ponto gruda no canto ou
   * na parede mais próxima (até 0,85 do passo). Tocando perto de uma parede pra apagar o
   * cômodo, o ponto era puxado pra cima da parede e `dentroDoPoligono` respondia "fora":
   * a borracha não apagava nada e parecia quebrada. Escolher o que apagar não é desenhar,
   * então aqui o ponto é o cru.
   *
   * E apaga móvel também. Antes só porta, janela e cômodo: tocar num móvel com a borracha
   * na mão não fazia nada, e a única forma de tirá-lo era pela ferramenta Móveis.
   *
   * Ordem: o que está por cima primeiro (móvel), depois abertura, depois cômodo -- e o
   * cômodo também pela parede, pra quem mira na linha em vez de mirar no meio.
   */
  function apagarNoPonto(e: ReactPointerEvent) {
    const p = posicao(e);
    if (!p) return;
    const movel = movelEm(p);
    if (movel) return apagarMovel(movel.id);
    const abertura = planta.aberturas.find((a) => distancia(a.p, p) < 0.6);
    if (abertura) {
      setPlanta((pl) => ({ ...pl, aberturas: pl.aberturas.filter((a) => a.id !== abertura.id) }));
      setResultado(null);
      return;
    }
    const naParede = (cm: Comodo) =>
      cm.pontos.some((a, i) => {
        const q = projetarNaParede(p, a, cm.pontos[(i + 1) % cm.pontos.length]);
        return !!q && distancia(p, q) < 0.35;
      });
    const alvo = [...planta.comodos].reverse().find((cm) => dentroDoPoligono(p, cm.pontos) || naParede(cm));
    if (alvo) {
      setPlanta((pl) => ({ ...pl, comodos: pl.comodos.filter((cm) => cm.id !== alvo.id) }));
      if (selecionado === alvo.id) setSelecionado(null);
      setResultado(null);
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

  const movelSelecionado = planta.moveis.find((m) => m.id === selMovel) ?? null;

  function porMovel(id: string, muda: (m: Movel) => Movel) {
    setPlanta((pl) => ({ ...pl, moveis: pl.moveis.map((m) => (m.id === id ? muda(m) : m)) }), `movel:${id}`);
    setResultado(null);
  }

  function colocarMovel(p: Ponto) {
    const def = MOVEL_POR_TIPO[tipoMovel];
    const novo: Movel = { id: novoId("mv"), tipo: def.tipo, p, largura: def.largura, altura: def.altura, angulo: 0 };
    const encostado = encostarNaParede(novo, paredesDe(planta.comodos));
    setPlanta((pl) => ({ ...pl, moveis: [...pl.moveis, encostado] }));
    setSelMovel(encostado.id);
    setResultado(null);
  }

  /** Só pega móvel destravado, do mais recente pro mais antigo (o de cima ganha). */
  function movelEm(p: Ponto): Movel | null {
    return [...planta.moveis].reverse().find((m) => !m.travado && dentroDoMovel(p, m)) ?? null;
  }

  function duplicarMovel() {
    if (!movelSelecionado) return;
    const copia: Movel = { ...movelSelecionado, id: novoId("mv"), p: { x: movelSelecionado.p.x + 0.4, y: movelSelecionado.p.y + 0.4 } };
    setPlanta((pl) => ({ ...pl, moveis: [...pl.moveis, copia] }));
    setSelMovel(copia.id);
  }

  function apagarMovel(id: string) {
    setPlanta((pl) => ({ ...pl, moveis: pl.moveis.filter((m) => m.id !== id) }));
    setSelMovel(null);
    setResultado(null);
  }

  function aoApertar(e: ReactPointerEvent) {
    if (ferramenta === "movel") {
      const cru = posicao(e);
      if (!cru) return;
      const alvo = movelEm(cru);
      if (alvo) {
        // pegou um que já existe: arrasta. Guarda a diferença pro móvel não pular pro cursor.
        e.currentTarget.setPointerCapture(e.pointerId);
        setSelMovel(alvo.id);
        setManuseio({ modo: "arrastar", id: alvo.id, dx: alvo.p.x - cru.x, dy: alvo.p.y - cru.y });
        return;
      }
      colocarMovel(encaixar(cru, planta.passo / 2));
      return;
    }
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
    if (manuseio) {
      const cru = posicao(e);
      if (!cru) return;
      const alvo = planta.moveis.find((m) => m.id === manuseio.id);
      if (!alvo) return;
      if (manuseio.modo === "arrastar") {
        const solto: Movel = { ...alvo, p: { x: cru.x + manuseio.dx, y: cru.y + manuseio.dy } };
        const encostado = encostarNaParede(solto, paredesDe(planta.comodos));
        const { movel, guias: g } = alinharComOutros(encostado, planta.moveis);
        setGuias(g);
        porMovel(alvo.id, () => movel);
      } else if (manuseio.modo === "girar") {
        const bruto = (Math.atan2(cru.y - alvo.p.y, cru.x - alvo.p.x) * 180) / Math.PI + 90;
        // Shift solta o passo de 15°, pra dar ajuste fino
        const ang = e.shiftKey ? bruto : Math.round(bruto / 15) * 15;
        porMovel(alvo.id, (m) => ({ ...m, angulo: ((ang % 360) + 360) % 360 }));
      } else {
        const d = Math.hypot(cru.x - alvo.p.x, cru.y - alvo.p.y);
        const f = Math.max(0.25, Math.min(4, d / Math.max(0.05, manuseio.d0)));
        porMovel(alvo.id, (m) => ({
          ...m,
          largura: Math.round(manuseio.larg0 * f * 20) / 20,
          altura: Math.round(manuseio.alt0 * f * 20) / 20,
        }));
      }
      return;
    }
    if (pan) {
      const r = nav.caixa.current?.getBoundingClientRect();
      if (!r) return;
      // a ferramenta "Mover" existe pra quem não tem botão do meio; passa pela MESMA
      // janela da camada de navegação, senão haveria dois donos do enquadramento
      const porPixel = vista.largura / r.width;
      nav.enquadrar({
        x0: pan.x0 - (e.clientX - pan.telaX) * porPixel,
        y0: pan.y0 - (e.clientY - pan.telaY) * porPixel,
        largura: vista.largura,
      });
      return;
    }
    const p = pontoDeTrabalho(e);
    setCursor(p);
    // Desenhando e chegando na borda: a vista afasta sozinha (veja `afastarNaBorda`).
    if (desenhando) afastarNaBorda(e);
    if (p && cantoRetangulo) abrirEspacoPara([p]);
  }

  /**
   * DESENHOU ATÉ A BORDA? A VISTA AFASTA SOZINHA.
   *
   * Pedido dele: "quando estou desenhando a linha, o lugar acaba, e tenho que ir lá em cima
   * enquadrar". Tinha razão, e a primeira tentativa (crescer a janela a cada canto, via
   * `abrirEspacoPara`) não resolveu -- ela cresce 0,8 m de folga em volta do PONTO, e o
   * ponto vem do dedo, que nunca sai da caixa. Ou seja: nunca aparecia espaço À FRENTE do
   * desenho, que é o que estava faltando.
   *
   * Aqui é o contrário: enquanto se desenha, se o dedo entra na faixa da borda, a janela
   * cresce ANCORADA no dedo -- o que está sob ele continua sob ele, o desenho não foge, e
   * surge espaço nos quatro lados. Para quando o dedo sai da faixa, e o `zoomEm` respeita o
   * limite de afastamento.
   *
   * O relógio existe porque `pointermove` dispara dezenas de vezes por segundo: sem ele, um
   * segundo encostado na borda afastaria a planta pra longe.
   */
  function afastarNaBorda(e: ReactPointerEvent) {
    const r = nav.caixa.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const naBorda = fx < FAIXA_DA_BORDA || fx > 1 - FAIXA_DA_BORDA || fy < FAIXA_DA_BORDA || fy > 1 - FAIXA_DA_BORDA;
    if (!naBorda) return;
    const agora = performance.now();
    if (agora - ultimoAfastar.current < INTERVALO_AFASTAR) return;
    ultimoAfastar.current = agora;
    nav.zoomEm(PASSO_AFASTAR, Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)));
  }

  /**
   * Botão direito no desenho = desfazer, sem tirar a mão de cima da planta.
   *
   * Pedido dele: "quando estou desenhando a linha e erro tenho que subir clicar em
   * desfazer". Menu de contexto do navegador não serve pra nada aqui, então o lugar estava
   * livre. Desfaz o mais perto primeiro: o retângulo que está sendo arrastado, depois o
   * último canto do cômodo em andamento, e só então o passo anterior do histórico.
   */
  function aoBotaoDireito(e: ReactMouseEvent) {
    e.preventDefault();
    if (cantoRetangulo) return setCantoRetangulo(null);
    if (rascunho.length > 0) return setRascunho((l) => l.slice(0, -1));
    voltar();
  }

  function aoSoltar(e: ReactPointerEvent) {
    if (manuseio) {
      setManuseio(null);
      setGuias([]);
      return;
    }
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
        body: JSON.stringify({ planta, vista, estilo: estiloIa, faixa: faixaIa, imovelId }),
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
        if (j.status === "falhou" || j.error) throw new Error(j.error ?? "A IA não conseguiu decorar essa planta. O crédito volta sozinho.");
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
      // Atalhos do móvel selecionado: setas movem, R gira, Delete apaga, Ctrl+D duplica.
      if (selMovel && ferramenta === "movel") {
        const passoSeta = e.shiftKey ? 0.05 : planta.passo / 2;
        const setas: Record<string, [number, number]> = {
          ArrowLeft: [-passoSeta, 0], ArrowRight: [passoSeta, 0], ArrowUp: [0, -passoSeta], ArrowDown: [0, passoSeta],
        };
        if (setas[e.key]) {
          e.preventDefault();
          const [ax, ay] = setas[e.key];
          return porMovel(selMovel, (m) => ({ ...m, p: { x: m.p.x + ax, y: m.p.y + ay } }));
        }
        if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          return porMovel(selMovel, (m) => ({ ...m, angulo: (m.angulo + (e.shiftKey ? -15 : 15) + 360) % 360 }));
        }
        if (e.key === "Delete") {
          e.preventDefault();
          return apagarMovel(selMovel);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          return duplicarMovel();
        }
      }
      if (e.key === "Escape") {
        setSelMovel(null);
        setRascunho([]);
        return;
      }
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
        <Link href="/editar" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Fotos</Link>
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
            {/* Voltar e seguir vêm ANTES das ferramentas e com peso de botão: são as duas
                ações que a pessoa mais usa desenhando, e como texto miúdo no rodapé
                ninguém achava. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="mr-1 flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  onClick={voltar}
                  disabled={!podeVoltar}
                  title="Voltar (Ctrl+Z)"
                  aria-label="Voltar"
                  className={
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition " +
                    (podeVoltar ? "bg-white text-marca-indigo shadow-sm hover:bg-marca-indigo hover:text-white" : "text-neutral-300")
                  }
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
                  </svg>
                  Voltar
                </button>
                <button
                  onClick={seguir}
                  disabled={!podeSeguir}
                  title="Seguir (Ctrl+Shift+Z)"
                  aria-label="Seguir"
                  className={
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition " +
                    (podeSeguir ? "bg-white text-marca-indigo shadow-sm hover:bg-marca-indigo hover:text-white" : "text-neutral-300")
                  }
                >
                  Seguir
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 14l5-5-5-5" />
                    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
                  </svg>
                </button>
              </span>
              <Chip ativo={ferramenta === "retangulo"} onClick={() => setFerramenta("retangulo")}>Retângulo</Chip>
              <Chip ativo={ferramenta === "comodo"} onClick={() => setFerramenta("comodo")}>Cômodo livre</Chip>
              <Chip ativo={ferramenta === "movel"} onClick={() => setFerramenta("movel")}>Móveis</Chip>
              <Chip ativo={ferramenta === "porta"} onClick={() => setFerramenta("porta")}>Porta</Chip>
              <Chip ativo={ferramenta === "janela"} onClick={() => setFerramenta("janela")}>Janela</Chip>
              <Chip ativo={ferramenta === "mover"} onClick={() => setFerramenta("mover")}>Mover</Chip>
              <Chip ativo={ferramenta === "apagar"} onClick={() => setFerramenta("apagar")}>Apagar</Chip>
              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => nav.zoomEm(1 / 0.75)} title="Afastar" aria-label="Afastar" className="h-7 w-7 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">−</button>
                <button onClick={() => nav.zoomEm(0.75)} title="Aproximar" aria-label="Aproximar" className="h-7 w-7 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100">+</button>
                <button onClick={() => nav.enquadrar(enquadramentoDe(planta))} title="Enquadrar tudo" className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">enquadrar</button>
              </span>
            </div>

            <div
              ref={nav.montarCaixa}
              data-caixa=""
              className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-white"
              style={{
                aspectRatio: `${svgLargura} / ${svgAltura}`,
                touchAction: "none",
                cursor: ferramenta === "mover" ? (pan ? "grabbing" : "grab") : "crosshair",
              }}
              onPointerDown={aoApertar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onContextMenu={aoBotaoDireito}
              onPointerLeave={() => {
                setCursor(null);
                setPan(null);
              }}
            >
              <div className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: previa.svg.replace("<svg ", '<svg style="width:100%;height:100%" ').replace(/width="\d+" height="\d+"/, "") }} />

              {/* rascunho do cômodo em andamento */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* o cômodo que vai nascer, já preenchido: dá pra ver a forma antes de fechar */}
                {fechando && (
                  <polygon points={rascunho.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} fill="#f06b4f" fillOpacity={0.18} stroke="none" />
                )}
                {rascunho.length >= 2 && (
                  <polyline points={rascunho.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} fill="none" stroke="#f06b4f" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
                {rascunho.length >= 1 && cursor && ferramenta === "comodo" && (
                  // perto do primeiro canto a linha PULA pra ele e vira cheia: é o aviso de
                  // que o próximo toque fecha, em vez de marcar mais um canto
                  <line
                    x1={px(rascunho[rascunho.length - 1].x)}
                    y1={py(rascunho[rascunho.length - 1].y)}
                    x2={px(fechando ? rascunho[0].x : cursor.x)}
                    y2={py(fechando ? rascunho[0].y : cursor.y)}
                    stroke="#f06b4f"
                    strokeWidth={fechando ? 3 : 2}
                    strokeDasharray={fechando ? undefined : "6 4"}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {guias.map((g, i) =>
                  g.eixo === "x" ? (
                    <line key={"gx" + i} x1={px(g.valor)} y1={0} x2={px(g.valor)} y2={100} stroke="#f06b4f" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                  ) : (
                    <line key={"gy" + i} x1={0} y1={py(g.valor)} x2={100} y2={py(g.valor)} stroke="#f06b4f" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                  )
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
              {/* O PRIMEIRO canto vira alvo: é nele que se toca pra fechar o cômodo. Fica
                  grande e com anel a partir do terceiro ponto, e acende quando o dedo chega. */}
              {podeFechar && (
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    fecharComodo();
                  }}
                  title="Fechar o cômodo aqui"
                  className={
                    "absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white/80 transition " +
                    (fechando ? "scale-125 border-marca-coral ring-4 ring-marca-coral/30" : "border-marca-coral/60")
                  }
                  style={{ left: `${px(rascunho[0].x)}%`, top: `${py(rascunho[0].y)}%`, touchAction: "none" }}
                />
              )}
              {fechando && (
                <span
                  className="pointer-events-none absolute -translate-x-1/2 translate-y-3 whitespace-nowrap rounded bg-marca-coral px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ left: `${px(rascunho[0].x)}%`, top: `${py(rascunho[0].y)}%` }}
                >
                  fechar aqui
                </span>
              )}
              {rascunho.length >= 1 && cursor && ferramenta === "comodo" && (
                <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-marca-indigo px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ left: `${(px(rascunho[rascunho.length - 1].x) + px(cursor.x)) / 2}%`, top: `${(py(rascunho[rascunho.length - 1].y) + py(cursor.y)) / 2}%` }}>
                  {metros(distancia(rascunho[rascunho.length - 1], cursor))}
                </span>
              )}
              {/* Alças do móvel selecionado. Em HTML e não no SVG: o alvo de toque fica do
                  tamanho certo pro dedo sem depender da escala do desenho. */}
              {ferramenta === "movel" && movelSelecionado && (() => {
                const m = movelSelecionado;
                const rad = (m.angulo * Math.PI) / 180;
                // ponta de cima (girar) e canto inferior direito (redimensionar), já girados
                const giroP = { x: m.p.x + Math.sin(rad) * (m.altura / 2 + 0.45), y: m.p.y - Math.cos(rad) * (m.altura / 2 + 0.45) };
                const cantoP = {
                  x: m.p.x + (m.largura / 2) * Math.cos(rad) - (m.altura / 2) * Math.sin(rad),
                  y: m.p.y + (m.largura / 2) * Math.sin(rad) + (m.altura / 2) * Math.cos(rad),
                };
                // A caixa vem do próprio evento (data-caixa), não do ref: ler ref aqui é
                // durante a renderização, que o lint proíbe -- e com razão, porque esta
                // função é criada a cada render.
                const pegar = (modo: "girar" | "redimensionar") => (e: ReactPointerEvent) => {
                  e.stopPropagation();
                  const el = e.currentTarget as HTMLElement;
                  el.setPointerCapture(e.pointerId);
                  const cx = el.closest<HTMLElement>("[data-caixa]");
                  let d0 = 1;
                  if (cx) {
                    const r = cx.getBoundingClientRect();
                    const mx = ((e.clientX - r.left) / r.width) * vista.largura + vista.x0;
                    const my = ((e.clientY - r.top) / r.height) * vista.altura + vista.y0;
                    d0 = Math.max(0.05, Math.hypot(mx - m.p.x, my - m.p.y));
                  }
                  setManuseio(
                    modo === "girar" ? { modo, id: m.id } : { modo, id: m.id, larg0: m.largura, alt0: m.altura, d0 }
                  );
                };
                return (
                  <>
                    <button
                      onPointerDown={pegar("girar")}
                      title="Girar (segure Shift pra ajuste fino)"
                      className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-marca-coral bg-white text-marca-coral shadow"
                      style={{ left: `${px(giroP.x)}%`, top: `${py(giroP.y)}%`, touchAction: "none" }}
                    >
                      <Icone nome="tour360" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onPointerDown={pegar("redimensionar")}
                      title="Redimensionar"
                      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border-2 border-marca-coral bg-white shadow"
                      style={{ left: `${px(cantoP.x)}%`, top: `${py(cantoP.y)}%`, touchAction: "none" }}
                    />
                    <span
                      className="pointer-events-none absolute -translate-x-1/2 translate-y-2 whitespace-nowrap rounded bg-marca-indigo px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ left: `${px(m.p.x)}%`, top: `${py(m.p.y + m.altura / 2)}%` }}
                    >
                      {metros(m.largura)} × {metros(m.altura)}
                    </span>
                  </>
                );
              })()}

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
                      ? "Toque em cada canto. O ponto gruda primeiro num canto ou parede que já existe, depois na grade. Botão direito desfaz."
                      : rascunho.length < 3
                        ? `${rascunho.length} ${rascunho.length === 1 ? "canto" : "cantos"}. Botão direito tira o último.`
                        : `${rascunho.length} cantos. Toque no círculo do primeiro canto pra FECHAR. Botão direito tira o último.`
                    : ferramenta === "movel"
                    ? movelSelecionado
                      ? "Arraste pra mover. A alça de cima gira (Shift solta o passo de 15°), a do canto redimensiona. Delete apaga."
                      : "Escolha o móvel ao lado e toque na planta. Ele encosta na parede sozinho."
                  : ferramenta === "mover"
                      ? "Arraste pra andar pela planta. Use − e + pra afastar e aproximar."
                      : ferramenta === "apagar"
                        ? "Toque no que quer tirar: móvel, porta, janela, ou o cômodo (por dentro ou na parede)."
                        : ferramenta === "porta"
                          ? "Toque perto da parede pra colocar. Toque de novo numa porta pra virar o lado que ela abre."
                          : "Toque perto da parede: a janela gruda nela sozinha."}
              </p>
              <span className="flex shrink-0 items-center gap-3">
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
            {/* A ÁREA ATRAVESSANDO AS TELAS. A planta já sabe a metragem exata -- e o corretor
                digitava o mesmo número de novo na ficha, de cabeça. Daqui ela vai direto, e
                sai igual no book, no post e na mensagem do cliente. Sem IA, sem crédito. */}
            {imovelId && total > 0 && (
              <button
                type="button"
                onClick={async () => {
                  setAreaNaFicha("indo");
                  try {
                    const r = await fetch(`/api/imoveis/${imovelId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await c.token()}` },
                      body: JSON.stringify({ area_util: Number(total.toFixed(2)) }),
                    });
                    if (!r.ok) throw new Error((await r.json()).error);
                    setAreaNaFicha("parado");
                    setAreaGravada(Number(total.toFixed(2)));
                  } catch {
                    setAreaNaFicha("erro");
                  }
                }}
                disabled={areaNaFicha === "indo"}
                className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 hover:border-marca-indigo hover:text-marca-indigo disabled:opacity-60"
              >
                {areaGravada !== null && areaGravada === Number(total.toFixed(2))
                  ? `✓ ${metrosQuadrados(total)} na ficha, como área útil`
                  : areaNaFicha === "erro"
                    ? "Não consegui gravar. Tente de novo."
                    : `Pôr ${metrosQuadrados(total)} na ficha do imóvel`}
              </button>
            )}
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
              {/* A PONTE PRO TERRENO. "Construir a casa" sempre aceitou uma planta como
                  referência -- só que o caminho era baixar o PNG e subir de novo lá. Aqui a
                  planta vai pelo id: a tela do terreno já abre com ela escolhida. */}
              <Link
                href={`/terreno?planta=${resultado.jobId}${imovelId ? `&imovel=${imovelId}` : ""}`}
                className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:border-marca-indigo hover:text-marca-indigo"
              >
                <Icone nome="lote" className="h-4 w-4" />
                Construir esta casa num terreno
              </Link>
              <p className="mt-1.5 text-xs text-neutral-500">
                Leva a planta pro Terreno como referência. A casa sai <strong className="font-semibold">inspirada</strong> nela — mesma implantação e mesmos cômodos, mas é ilustração, não projeto.
              </p>
              <div className="mt-3">
                <Compartilhar token={c.token} jobId={resultado.jobId} texto="Planta do imóvel:" />
              </div>
            </Cartao>
          )}

          {/* ---- decorar a planta com IA ---- */}
          {ferramenta === "movel" && (
            <Cartao>
              <Rotulo>Móveis · sem crédito</Rotulo>
              <div className="flex flex-wrap gap-1.5">
                {GRUPOS_MOVEL.map((g) => (
                  <Chip key={g.id} ativo={grupoMovel === g.id} onClick={() => setGrupoMovel(g.id)}>{g.rotulo}</Chip>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {MOVEIS.filter((d) => d.grupo === grupoMovel).map((d) => (
                  <button
                    key={d.tipo}
                    type="button"
                    onClick={() => {
                      setTipoMovel(d.tipo);
                      setFerramenta("movel");
                    }}
                    title={`${d.rotulo} · ${d.largura} × ${d.altura} m`}
                    className={
                      "flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition " +
                      (tipoMovel === d.tipo ? "border-marca-indigo bg-marca-indigo/5" : "border-neutral-200 hover:border-neutral-400")
                    }
                  >
                    <svg viewBox="-0.6 -0.6 1.2 1.2" className="h-9 w-9" fill="none" stroke="#42566f" strokeWidth={0.05} strokeLinejoin="round">
                      <g
                        transform={`scale(${Math.min(1, d.largura / Math.max(d.largura, d.altura))} ${Math.min(1, d.altura / Math.max(d.largura, d.altura))})`}
                        dangerouslySetInnerHTML={{ __html: d.desenho }}
                      />
                    </svg>
                    <span className="text-[10px] leading-tight text-neutral-600">{d.rotulo}</span>
                  </button>
                ))}
              </div>

              {movelSelecionado && (
                <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-xs font-semibold text-neutral-700">
                    {MOVEL_POR_TIPO[movelSelecionado.tipo]?.rotulo} · {metros(movelSelecionado.largura)} × {metros(movelSelecionado.altura)} · {Math.round(movelSelecionado.angulo)}°
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip ativo={false} onClick={() => porMovel(movelSelecionado.id, (m) => ({ ...m, angulo: (m.angulo + 90) % 360 }))}>girar 90°</Chip>
                    <Chip ativo={false} onClick={duplicarMovel}>duplicar</Chip>
                    <Chip
                      ativo={!!movelSelecionado.travado}
                      onClick={() => porMovel(movelSelecionado.id, (m) => ({ ...m, travado: !m.travado }))}
                    >
                      {movelSelecionado.travado ? "travado" : "travar"}
                    </Chip>
                    <Chip ativo={false} onClick={() => apagarMovel(movelSelecionado.id)}>apagar</Chip>
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    Atalhos: setas movem, R gira, Delete apaga, Ctrl+D duplica.
                  </p>
                </div>
              )}
            </Cartao>
          )}

          <Cartao>
            <Rotulo>Decorar com IA · 1 crédito</Rotulo>
            <p className="text-sm text-neutral-500">
              A mesma planta, com móveis, piso e sombra. A técnica com as medidas continua salva do lado.
            </p>
            {/* Sete estilos e não seis: "Brasileiro contemporâneo" entrou na lista e
                cortar justo ele seria esconder o que o corretor daqui mais pede. */}
            <span className="mt-3 mb-1 block text-xs text-neutral-500">Estilo</span>
            <div className="flex flex-wrap gap-1.5">
              {ESTILOS.slice(0, 7).map((e) => (
                <Chip key={e.valor} ativo={estiloIa === e.valor} onClick={() => setEstiloIa(e.valor)}>
                  {e.rotulo}
                </Chip>
              ))}
            </div>
            <span className="mt-3 mb-1 block text-xs text-neutral-500">Padrão do imóvel</span>
            <div className="flex flex-wrap gap-1.5">
              {FAIXAS.map((f) => (
                <Chip key={f.valor} ativo={faixaIa === f.valor} onClick={() => setFaixaIa(f.valor)}>
                  {f.rotulo}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-snug text-neutral-500">{FAIXAS.find((f) => f.valor === faixaIa)?.ajuda}</p>
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
