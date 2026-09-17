"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  BYTES_PARA_ELEMENTO,
  DUQUE,
  GANHO_DA_MARCA,
  agendaDaPrevia,
  automacaoDoDuque,
  janelasDeVoz,
  type EntradaDaAgenda,
  type FontePrevia,
  type ItemPrevia,
  type Janela,
  type MarcaPrevia,
  type PontoDeGanho,
} from "@/lib/previa-audio";

// A PRÉVIA DE ÁUDIO da linha do tempo (docs/planos/linha-do-tempo-spec.md, D8).
//
// Editar som sem ouvir é editar no escuro. Mas "ouvir" no navegador não é dar play num
// <audio>: são até 16 trechos que entram e saem em segundos diferentes, com fade, com a
// música abaixando enquanto a voz fala, e tudo isso tem que bater com o vídeo que o
// SERVIDOR vai montar depois. Um <audio> por trecho erra dezenas de milissegundos em cada
// entrada, e o corretor ajusta a linha do tempo pra compensar um erro que não existe no
// vídeo final.
//
// Então é Web Audio: no instante do Play, TUDO que vai soar dali pra frente é agendado de
// uma vez no relógio do AudioContext, que é o mesmo relógio que toca as amostras. A conta
// de o quê, quando e com que ganho é pura e mora em lib/previa-audio.ts; aqui fica só o que
// precisa do navegador.
//
// O que este arquivo resolve, e por que cada coisa é do jeito que é:
//
//   - O RELÓGIO é o do áudio, não o da tela. `performance.now()` e o áudio andam
//     separados; se o cabeçote seguir a tela, ele descola do som em poucos segundos.
//   - LATÊNCIA. O que o AudioContext agendou ainda não saiu do alto-falante: `outputLatency`
//     é o atraso da placa (e do Bluetooth, onde passa de 150 ms). O cabeçote desconta isso,
//     senão a legenda aparece antes da palavra.
//   - `resume()` NA PRIMEIRA LINHA de `tocar`. iOS só libera áudio dentro do gesto; uma
//     linha de `await` antes disso já sai do gesto e o contexto fica suspenso pra sempre --
//     e o sintoma é "o Play não faz nada", sem erro nenhum no console.
//   - DUCK POR JANELA, não sidechain. O servidor abaixa a música pela energia da voz; aqui
//     a música abaixa nas JANELAS em que existe voz. É uma aproximação declarada: o volume
//     dentro da fala pode diferir do vídeo final em fração de dB, o que ninguém ouve, e em
//     troca a prévia não precisa analisar o sinal em tempo real num celular.
//   - ARQUIVO GRANDE NÃO É DECODIFICADO. Um Você de 80 MB vira ~800 MB de PCM na memória e
//     derruba a aba no iPhone. Acima de 25 MB o som vem de um <video> escondido ligado ao
//     grafo (MediaElementAudioSourceNode) e é ressincronizado quando descola.
//   - GANHO SÓ POR GainNode. `element.volume` é ignorado no iOS; quem mexe em `volume` do
//     elemento acha que ajustou e não ajustou.
//   - QUANDO NÃO DÁ, A PESSOA PRECISA SABER. Contexto que não sai de "suspended", arquivo
//     que não decodifica, elemento que toca mudo: cada um vira um aviso e uma marca de
//     `semSom` no bloco, porque prévia silenciosa que parece funcionando é pior que prévia
//     que avisa.

export type { FontePrevia, ItemPrevia, MarcaPrevia } from "@/lib/previa-audio";

export type MotivoSemSom = "contexto" | "decodificar" | "elemento";

/** O que a linha do tempo lê pra desenhar o cabeçote sem redesenhar o editor inteiro. */
export type RelogioDaPrevia = { agora(): number; assinar(fn: (t: number) => void): () => void };

export type EstadoDaFonte = "ausente" | "carregando" | "pronta" | "elemento" | "falhou";

export type OpcoesDaPrevia = {
  itens: ItemPrevia[];
  marcas: MarcaPrevia[];
  total: number;
  /** Janelas que também abaixam a música (o Você, que não é um item de áudio). */
  janelasExtras?: Janela[];
  aoTerminar: () => void;
  aoSemSom: (motivo: MotivoSemSom, chave?: string) => void;
  /**
   * Liga um AnalyserNode na saída. FORA da assinatura de D1 e de propósito: é o único jeito
   * de um teste de navegador provar que saiu SOM, e não só que o código rodou. Fica
   * desligado no produto (um analisador a mais custa uma cópia do buffer por quadro).
   */
  medirSaida?: boolean;
};

export type PreviaDeAudio = {
  relogio: RelogioDaPrevia;
  tocando: boolean;
  tocar: (t: number) => void;
  pausar: () => void;
  buscar: (t: number) => void;
  duracaoDe: (chave: string) => number | undefined;
  estadoDaFonte: (chave: string) => EstadoDaFonte;
  preparar: (fontes: FontePrevia[]) => void;
  semSom: Set<string>;
  /** Só com `medirSaida`. Ver `OpcoesDaPrevia.medirSaida`. */
  medidorDaSaida: AnalyserNode | null;
};

/** Depois do Play, o contexto tem que estar tocando. Se não estiver, é relógio sem som. */
const ESPERA_DO_CONTEXTO = 300;
/** Quanto o elemento pode descolar do relógio antes de ser recolocado. */
const DERIVA_MAXIMA = 0.15;
/** Silêncio nesse tempo, com o elemento tocando dentro da janela, é elemento mudo. */
const MUDO_ATE_DESISTIR = 1000;
/** Folga entre agendar e soar: tempo de montar o grafo sem cortar o começo. */
const FOLGA = 0.05;

type Config = Required<Pick<OpcoesDaPrevia, "itens" | "marcas" | "total" | "janelasExtras" | "aoTerminar" | "aoSemSom" | "medirSaida">>;

type Elemento = { el: HTMLVideoElement; ganho: GainNode; analise: AnalyserNode; janela: { de: number; ate: number; offset: number } | null; mudoDesde: number | null };

type MotorDePrevia = ReturnType<typeof criarMotorDePrevia>;

/**
 * O motor: um objeto só, criado uma vez, com tudo que é mutável dentro dele.
 *
 * Nada aqui é estado de React. O contexto, os buffers e os nós não podem virar `useState`
 * (cada nó agendado redesenharia o editor) nem `useRef` lido no render (o compilador do
 * React recusa). O padrão é o mesmo do `criarContagemDaEdicao`: objeto no `useState` com
 * inicializador, lido pela tela só através de `useSyncExternalStore`.
 */
function criarMotorDePrevia() {
  let cfg: Config = { itens: [], marcas: [], total: 0, janelasExtras: [], aoTerminar: () => {}, aoSemSom: () => {}, medirSaida: false };

  let ctx: AudioContext | null = null;
  let tentouContexto = false;
  let mestre: GainNode | null = null;
  let barramentoMusica: GainNode | null = null;
  let barramentoVoz: GainNode | null = null;
  let medidor: AnalyserNode | null = null;

  const buffers = new Map<string, AudioBuffer>();
  const estados = new Map<string, EstadoDaFonte>();
  const pedidos = new Map<string, Promise<void>>();
  const elementos = new Map<string, Elemento>();

  let desligarNos: (() => void)[] = [];
  let temporizadores: ReturnType<typeof setTimeout>[] = [];

  let tocando = false;
  let tempo = 0;
  let t0 = 0;
  let base = 0;
  let latencia = 0;
  /** Quando o contexto não serve: relógio de parede, mesma interface, sem som. */
  let semContextoDesde: number | null = null;
  /** Entre um `buscar` e o reagendamento: o relógio congela em `tempo` em vez de correr. */
  let aguardandoAgenda = false;

  let quadro = 0;
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let reagendamento: ReturnType<typeof setTimeout> | null = null;

  const semSom = new Set<string>();
  /**
   * Muda a cada `desligar`. Carga que estava no ar quando o motor foi desligado não pode
   * voltar e escrever no motor novo -- e é o caso COMUM, não a exceção: no modo estrito o
   * React monta, desmonta e monta de novo, então a primeira decodificação sempre termina
   * depois do desligamento. Sem isto, ela cai no `catch` (contexto fechado) e marca a faixa
   * como "falhou" numa prévia que está perfeitamente viva.
   */
  let geracao = 0;
  const assinantesDoEstado = new Set<() => void>();
  const assinantesDoRelogio = new Set<(t: number) => void>();
  let cache: { tocando: boolean; semSom: Set<string>; medidor: AnalyserNode | null } = { tocando: false, semSom: new Set(), medidor: null };

  function mudou() {
    cache = { tocando, semSom: new Set(semSom), medidor };
    for (const fn of assinantesDoEstado) fn();
  }

  function notificar(t: number) {
    for (const fn of assinantesDoRelogio) fn(t);
  }

  // ---------- contexto e barramentos ----------

  function contexto(): AudioContext | null {
    if (ctx || tentouContexto) return ctx;
    tentouContexto = true;
    try {
      const Classe = typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Classe) return null;
      const c = new Classe();
      mestre = c.createGain();
      barramentoMusica = c.createGain();
      barramentoVoz = c.createGain();
      barramentoMusica.connect(mestre);
      barramentoVoz.connect(mestre);
      if (cfg.medirSaida) {
        medidor = c.createAnalyser();
        medidor.fftSize = 2048;
        mestre.connect(medidor);
        medidor.connect(c.destination);
      } else {
        mestre.connect(c.destination);
      }
      c.addEventListener("statechange", aoMudarEstadoDoContexto);
      ctx = c;
      mudou();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function aoMudarEstadoDoContexto() {
    // "interrupted" é do iOS (ligação, despertador). Pausa e guarda o tempo: retomar
    // sozinho depois de uma interrupção toca som que ninguém pediu.
    if (tocando && ctx && ctx.state !== "running" && semContextoDesde === null) pausar();
  }

  function barramento(qual: "musica" | "voz"): GainNode | null {
    return qual === "voz" ? barramentoVoz : barramentoMusica;
  }

  // ---------- agendamento ----------

  function aplicarRampas(param: AudioParam, rampas: PontoDeGanho[]) {
    if (rampas.length === 0) return;
    param.cancelScheduledValues(base);
    let anterior = -1;
    for (let i = 0; i < rampas.length; i++) {
      const em = Math.max(anterior + 1e-4, rampas[i].em);
      anterior = em;
      if (i === 0) param.setValueAtTime(rampas[i].ganho, base + em);
      else param.linearRampToValueAtTime(rampas[i].ganho, base + em);
    }
  }

  function agendarBuffer(e: EntradaDaAgenda, c: AudioContext) {
    const buf = buffers.get(e.fonte.chave);
    const destino = barramento(e.barramento);
    if (!buf || !destino) return;
    const fonte = c.createBufferSource();
    fonte.buffer = buf;
    fonte.loop = e.laco;
    if (e.laco) {
      fonte.loopStart = 0;
      fonte.loopEnd = buf.duration;
    }
    const ganho = c.createGain();
    aplicarRampas(ganho.gain, e.rampas);
    fonte.connect(ganho);
    ganho.connect(destino);
    fonte.start(base + e.atraso, e.offset);
    fonte.stop(base + e.atraso + e.duracao);
    desligarNos.push(() => {
      try {
        fonte.stop();
      } catch {
        // já parou sozinho: parar de novo não é erro que interesse
      }
      fonte.disconnect();
      ganho.disconnect();
    });
  }

  /**
   * O som da virada de cena: toca uma vez, no ganho fixo de FF:966.
   *
   * Vai direto pro mestre, FORA do barramento da música -- no servidor o efeito entra no
   * `amix` final, depois do `sidechaincompress` (FF:941-976), então ele não abaixa quando a
   * voz fala. Pendurar a marca no barramento da música faria a prévia abaixar um som que o
   * vídeo final não abaixa, bem no lugar onde o corretor está conferindo a virada.
   */
  function agendarMarca(m: MarcaPrevia, c: AudioContext) {
    const buf = buffers.get(m.fonte.chave);
    if (!buf || !mestre) return;
    const fonte = c.createBufferSource();
    fonte.buffer = buf;
    const ganho = c.createGain();
    ganho.gain.setValueAtTime(GANHO_DA_MARCA, base);
    fonte.connect(ganho);
    ganho.connect(mestre);
    fonte.start(base + (m.tempo - t0));
    desligarNos.push(() => {
      try {
        fonte.stop();
      } catch {
        // idem
      }
      fonte.disconnect();
      ganho.disconnect();
    });
  }

  function elementoDa(e: EntradaDaAgenda, c: AudioContext): Elemento | null {
    const existente = elementos.get(e.fonte.chave);
    if (existente) return existente;
    const destino = barramento(e.barramento);
    if (!destino) return null;
    try {
      const el = document.createElement("video");
      el.crossOrigin = "anonymous";
      el.playsInline = true;
      el.preload = "auto";
      el.src = e.fonte.url;
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      const no = c.createMediaElementSource(el);
      const ganho = c.createGain();
      const analise = c.createAnalyser();
      analise.fftSize = 2048;
      no.connect(ganho);
      ganho.connect(analise);
      analise.connect(destino);
      const reg: Elemento = { el, ganho, analise, janela: null, mudoDesde: null };
      elementos.set(e.fonte.chave, reg);
      estados.set(e.fonte.chave, "elemento");
      return reg;
    } catch {
      marcarSemSom(e.fonte.chave, "elemento");
      return null;
    }
  }

  function agendarElemento(e: EntradaDaAgenda, c: AudioContext) {
    const reg = elementoDa(e, c);
    if (!reg) return;
    aplicarRampas(reg.ganho.gain, e.rampas);
    reg.janela = { de: t0 + e.atraso, ate: t0 + e.atraso + e.duracao, offset: e.offset };
    reg.mudoDesde = null;
    const comecar = () => {
      try {
        reg.el.currentTime = e.offset;
      } catch {
        // metadados ainda não chegaram: o ressincronizador do relógio conserta
      }
      void reg.el.play().catch(() => marcarSemSom(e.fonte.chave, "elemento"));
    };
    const espera = base + e.atraso - c.currentTime;
    if (espera <= 0) comecar();
    else temporizadores.push(setTimeout(comecar, espera * 1000));
    temporizadores.push(setTimeout(() => reg.el.pause(), Math.max(0, (base + e.atraso + e.duracao - c.currentTime) * 1000)));
    desligarNos.push(() => {
      reg.el.pause();
      reg.janela = null;
    });
  }

  function agendar(c: AudioContext) {
    const agenda = agendaDaPrevia(cfg.itens, t0, duracaoDe);
    const faltando: FontePrevia[] = [];
    for (const e of agenda) {
      if (e.modo === "elemento" || estados.get(e.fonte.chave) === "elemento") agendarElemento(e, c);
      else if (buffers.has(e.fonte.chave)) agendarBuffer(e, c);
      else faltando.push(e.fonte);
    }
    for (const m of cfg.marcas) {
      if (m.tempo >= t0 && m.tempo <= cfg.total) agendarMarca(m, c);
      else if (m.tempo >= t0 && !buffers.has(m.fonte.chave)) faltando.push(m.fonte);
    }
    if (barramentoMusica) aplicarRampas(barramentoMusica.gain, automacaoDoDuque(janelasDeVoz(cfg.itens, cfg.janelasExtras), t0, cfg.total));
    // O que ainda não carregou não fica mudo pra sempre: carrega e reagenda.
    if (faltando.length) preparar(faltando);
  }

  function pararNos() {
    for (const t of temporizadores) clearTimeout(t);
    temporizadores = [];
    for (const parar of desligarNos) parar();
    desligarNos = [];
  }

  // ---------- relógio ----------

  const relogio: RelogioDaPrevia = {
    agora() {
      if (!tocando || aguardandoAgenda) return tempo;
      if (semContextoDesde !== null) return Math.min(cfg.total, t0 + (performance.now() - semContextoDesde) / 1000);
      if (!ctx) return tempo;
      // A latência sai daqui: o que já foi agendado ainda não saiu do alto-falante. O piso
      // é `t0` porque cabeçote que anda pra trás depois do Play é defeito visível.
      return Math.min(cfg.total, Math.max(t0, t0 + (ctx.currentTime - base) - latencia));
    },
    assinar(fn) {
      assinantesDoRelogio.add(fn);
      return () => assinantesDoRelogio.delete(fn);
    },
  };

  function passo() {
    const t = relogio.agora();
    tempo = t;
    ressincronizarElementos(t);
    notificar(t);
    if (t >= cfg.total) terminar();
    else quadro = requestAnimationFrame(passo);
  }

  function comecarRelogio() {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(passo);
    if (intervalo) clearInterval(intervalo);
    // Com a aba escondida o rAF para; sem isto o vídeo "nunca termina" em segundo plano.
    intervalo = setInterval(() => {
      if (!tocando) return;
      const t = relogio.agora();
      tempo = t;
      notificar(t);
      if (t >= cfg.total) terminar();
    }, 250);
  }

  function pararRelogio() {
    cancelAnimationFrame(quadro);
    quadro = 0;
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
    if (reagendamento) clearTimeout(reagendamento);
    reagendamento = null;
  }

  function terminar() {
    pararNos();
    pararRelogio();
    tocando = false;
    semContextoDesde = null;
    tempo = cfg.total;
    mudou();
    notificar(cfg.total);
    cfg.aoTerminar();
  }

  function ressincronizarElementos(t: number) {
    for (const reg of elementos.values()) {
      const j = reg.janela;
      if (!j || t < j.de || t >= j.ate) continue;
      const esperado = j.offset + (t - j.de);
      if (Number.isFinite(reg.el.currentTime) && Math.abs(reg.el.currentTime - esperado) > DERIVA_MAXIMA) reg.el.currentTime = esperado;
      // Elemento tocando dentro da janela e silêncio absoluto por 1 s: não é pausa, é um
      // arquivo que o navegador aceitou e não sonoriza (formato, CORS do áudio, iOS velho).
      if (rms(reg.analise) > 0.0005) reg.mudoDesde = null;
      else if (reg.mudoDesde === null) reg.mudoDesde = performance.now();
      else if (performance.now() - reg.mudoDesde > MUDO_ATE_DESISTIR) {
        reg.mudoDesde = null;
        for (const [chave, outro] of elementos) if (outro === reg) marcarSemSom(chave, "elemento");
      }
    }
  }

  function rms(analise: AnalyserNode): number {
    const dados = new Float32Array(analise.fftSize);
    analise.getFloatTimeDomainData(dados);
    let soma = 0;
    for (let i = 0; i < dados.length; i++) soma += dados[i] * dados[i];
    return Math.sqrt(soma / dados.length);
  }

  // ---------- carga das fontes ----------

  function marcarSemSom(chave: string, motivo: MotivoSemSom) {
    if (semSom.has(chave)) return;
    semSom.add(chave);
    estados.set(chave, "falhou");
    mudou();
    cfg.aoSemSom(motivo, chave);
  }

  /**
   * O tamanho do arquivo, por HEAD.
   *
   * Não dá pra usar Content-Range: o P0 mediu que a URL assinada do Supabase responde
   * `Access-Control-Allow-Origin: *` mas NÃO expõe `Content-Range`, então um Range de um
   * byte volta sem o número. Content-Length do HEAD, e se o HEAD não passar, o tamanho sai
   * do próprio corpo baixado.
   */
  async function tamanhoPorCabeca(url: string): Promise<number | undefined> {
    try {
      const r = await fetch(url, { method: "HEAD", mode: "cors", credentials: "omit" });
      const n = Number(r.headers.get("content-length"));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  }

  function carregar(f: FontePrevia): Promise<void> {
    const jaTem = estados.get(f.chave);
    if (jaTem === "pronta" || jaTem === "elemento") return Promise.resolve();
    const emCurso = pedidos.get(f.chave);
    if (emCurso) return emCurso;

    const minha = geracao;
    const p = (async () => {
      estados.set(f.chave, "carregando");
      mudou();
      try {
        const bytes = f.bytes ?? (await tamanhoPorCabeca(f.url));
        if (minha !== geracao) return;
        if (bytes !== undefined && bytes > BYTES_PARA_ELEMENTO) {
          estados.set(f.chave, "elemento");
          mudou();
          return;
        }
        const r = await fetch(f.url, { mode: "cors", credentials: "omit" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const dados = await r.arrayBuffer();
        if (minha !== geracao) return;
        // Sem HEAD, o tamanho só se sabe agora -- e continua valendo o limite.
        if (dados.byteLength > BYTES_PARA_ELEMENTO) {
          estados.set(f.chave, "elemento");
          mudou();
          return;
        }
        const c = contexto();
        if (!c) throw new Error("sem contexto");
        // Forma com callback de propósito: o Safari mais velho não devolve promessa aqui.
        const buf = await new Promise<AudioBuffer>((ok, falhou) => {
          const saida = c.decodeAudioData(dados, ok, falhou) as unknown;
          if (saida && typeof (saida as Promise<AudioBuffer>).then === "function") (saida as Promise<AudioBuffer>).then(ok, falhou);
        });
        if (minha !== geracao) return;
        buffers.set(f.chave, buf);
        estados.set(f.chave, "pronta");
        semSom.delete(f.chave);
        mudou();
        if (tocando) reagendar(100);
      } catch {
        if (minha === geracao) marcarSemSom(f.chave, "decodificar");
      } finally {
        if (minha === geracao) pedidos.delete(f.chave);
      }
    })();
    pedidos.set(f.chave, p);
    return p;
  }

  function preparar(fontes: FontePrevia[]) {
    // Decodificar com o contexto suspenso é permitido, e é o que deixa o Play soar na hora.
    contexto();
    for (const f of fontes) void carregar(f);
  }

  function duracaoDe(chave: string): number | undefined {
    const buf = buffers.get(chave);
    if (buf) return buf.duration;
    const el = elementos.get(chave)?.el;
    return el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
  }

  // ---------- comandos ----------

  function avisarOsOutros() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("encena:parar-audio"));
  }

  function ligarSessaoDeAudio() {
    try {
      const sessao = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (sessao) sessao.type = "playback";
    } catch {
      // navegador sem audioSession: nada a fazer
    }
  }

  function tocar(t: number) {
    const c = contexto();
    // PRIMEIRA coisa depois de ter o contexto, e sem nenhum await antes: o iOS só libera o
    // áudio dentro do gesto que chamou isto.
    if (c) void c.resume().catch(() => {});

    pararNos();
    pararRelogio();
    semContextoDesde = null;
    aguardandoAgenda = false;
    // Dar play parado no fim recomeça do zero, como o editor já fazia.
    t0 = t >= cfg.total - 1e-3 ? 0 : Math.max(0, t);
    tempo = t0;
    avisarOsOutros();
    ligarSessaoDeAudio();

    if (!c) {
      comecarSemSom();
      return;
    }
    latencia = Math.min(0.5, Math.max(0, c.outputLatency || c.baseLatency || 0));
    base = c.currentTime + FOLGA;
    agendar(c);
    tocando = true;
    mudou();
    comecarRelogio();
    notificar(t0);
    temporizadores.push(
      setTimeout(() => {
        if (tocando && ctx && ctx.state !== "running") comecarSemSom();
      }, ESPERA_DO_CONTEXTO),
    );
  }

  /** O relógio de parede: a linha do tempo anda, o som não sai, e a pessoa é avisada. */
  function comecarSemSom() {
    pararNos();
    semContextoDesde = performance.now();
    t0 = tempo;
    tocando = true;
    mudou();
    comecarRelogio();
    cfg.aoSemSom("contexto");
  }

  function pausar() {
    if (!tocando) return;
    tempo = relogio.agora();
    pararNos();
    pararRelogio();
    tocando = false;
    semContextoDesde = null;
    aguardandoAgenda = false;
    mudou();
    notificar(tempo);
  }

  /** Para o som na hora e remonta a agenda depois da pausa -- arrastar não pode picotar. */
  function reagendar(espera: number) {
    if (!tocando || semContextoDesde !== null) return;
    pararNos();
    aguardandoAgenda = true;
    if (reagendamento) clearTimeout(reagendamento);
    reagendamento = setTimeout(() => {
      reagendamento = null;
      if (!tocando) return;
      const c = contexto();
      if (!c) return;
      t0 = tempo;
      base = c.currentTime + FOLGA;
      aguardandoAgenda = false;
      agendar(c);
    }, espera);
  }

  function buscar(t: number) {
    tempo = Math.min(cfg.total, Math.max(0, t));
    notificar(tempo);
    if (!tocando) return;
    if (semContextoDesde !== null) {
      semContextoDesde = performance.now();
      t0 = tempo;
      return;
    }
    reagendar(60);
  }

  // ---------- ligação com o React ----------

  function configurar(nova: Config) {
    const mudouALista = cfg.itens !== nova.itens || cfg.marcas !== nova.marcas || cfg.janelasExtras !== nova.janelasExtras;
    cfg = nova;
    if (tocando && mudouALista) reagendar(100);
  }

  /**
   * Solta tudo e volta ao estado de recém-criado.
   *
   * Voltar ao INÍCIO, e não só fechar: o mesmo motor é usado de novo quando o React monta
   * outra vez (modo estrito, e qualquer remontagem da tela). Fechar o contexto sem
   * destravar `tentouContexto` deixaria a prévia muda para sempre, sem erro nenhum -- o
   * pior defeito possível numa prévia.
   */
  function desligar() {
    geracao++;
    pararNos();
    pararRelogio();
    tocando = false;
    semContextoDesde = null;
    aguardandoAgenda = false;
    for (const reg of elementos.values()) {
      reg.el.pause();
      reg.el.removeAttribute("src");
      reg.el.remove();
    }
    elementos.clear();
    if (ctx) {
      ctx.removeEventListener("statechange", aoMudarEstadoDoContexto);
      void ctx.close().catch(() => {});
    }
    ctx = null;
    tentouContexto = false;
    mestre = null;
    barramentoMusica = null;
    barramentoVoz = null;
    medidor = null;
    buffers.clear();
    estados.clear();
    pedidos.clear();
    semSom.clear();
    mudou();
  }

  return {
    relogio,
    tocar,
    pausar,
    buscar,
    preparar,
    duracaoDe,
    configurar,
    desligar,
    estadoDaFonte: (chave: string): EstadoDaFonte => estados.get(chave) ?? "ausente",
    assinarEstado: (fn: () => void) => {
      assinantesDoEstado.add(fn);
      return () => assinantesDoEstado.delete(fn);
    },
    instantaneo: () => cache,
  };
}

/**
 * A prévia de áudio da linha do tempo.
 *
 * `tocar` tem que ser chamada DIRETO do onClick do Play (ou do keydown do espaço), sem
 * `await` no caminho -- é o que libera o áudio no iOS.
 */
export function usePreviaDeAudio(o: OpcoesDaPrevia): PreviaDeAudio {
  const [motor] = useState<MotorDePrevia>(criarMotorDePrevia);
  const estado = useSyncExternalStore(motor.assinarEstado, motor.instantaneo, motor.instantaneo);

  const { itens, marcas, total, janelasExtras, aoTerminar, aoSemSom, medirSaida } = o;
  useEffect(() => {
    motor.configurar({ itens, marcas, total, janelasExtras: janelasExtras ?? [], aoTerminar, aoSemSom, medirSaida: medirSaida ?? false });
  }, [motor, itens, marcas, total, janelasExtras, aoTerminar, aoSemSom, medirSaida]);

  useEffect(() => {
    // A biblioteca de áudio (e qualquer outro tocador) pede a vez por evento: dois sons
    // tocando juntos é o defeito que o editor já teve com um <audio> por linha.
    const parar = () => motor.pausar();
    window.addEventListener("encena:parar-previa", parar);
    return () => window.removeEventListener("encena:parar-previa", parar);
  }, [motor]);

  useEffect(() => () => motor.desligar(), [motor]);

  const tocar = useCallback((t: number) => motor.tocar(t), [motor]);
  const pausar = useCallback(() => motor.pausar(), [motor]);
  const buscar = useCallback((t: number) => motor.buscar(t), [motor]);
  const preparar = useCallback((fontes: FontePrevia[]) => motor.preparar(fontes), [motor]);
  const duracaoDe = useCallback((chave: string) => motor.duracaoDe(chave), [motor]);
  const estadoDaFonte = useCallback((chave: string) => motor.estadoDaFonte(chave), [motor]);

  return useMemo(
    () => ({
      relogio: motor.relogio,
      tocando: estado.tocando,
      tocar,
      pausar,
      buscar,
      duracaoDe,
      estadoDaFonte,
      preparar,
      semSom: estado.semSom,
      medidorDaSaida: estado.medidor,
    }),
    [motor, estado, tocar, pausar, buscar, duracaoDe, estadoDaFonte, preparar],
  );
}

export { DUQUE, BYTES_PARA_ELEMENTO };
