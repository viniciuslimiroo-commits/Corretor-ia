"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreviaDeAudio, type MotivoSemSom } from "@/components/editor/usar-previa-de-audio";
import { agendaDaPrevia, janelasDeVoz, type ItemPrevia, type MarcaPrevia } from "@/lib/previa-audio";

// A bancada em si. Roda só em desenvolvimento (a página que a importa devolve 404 em
// produção) e existe pra ser dirigida por um navegador sem teclado: tudo que o teste
// precisa ler sai em `window.__encenaPrevia`.
//
// Nada aqui toca banco, storage nem API: os sons são os arquivos de `public/`.

const TOTAL = 12;

/** `base` do motor é `ctx.currentTime + 0.05`; guardar isto na hora do Play deixa o teste
 *  conferir a subtração da latência sem o motor precisar expor o relógio interno. */
type Marcador = { t0: number; base: number; latencia: number };

type Cenario = "musica" | "url-ruim" | "elemento";

const MUSICA: ItemPrevia = {
  id: "mus001",
  fonte: { chave: "musica/calma", url: "/musica/previa/calma.m4a" },
  barramento: "musica",
  noVideo: 2,
  corte: 10,
  dur: 7,
  volume: 1,
  fadeEntrada: 1,
  fadeSaida: 2,
  laco: false,
};

const QUEBRADA: ItemPrevia = {
  ...MUSICA,
  id: "mus002",
  fonte: { chave: "musica/nao-existe", url: "/musica/previa/nao-existe-mesmo.m4a" },
};

/**
 * Arquivo normal com o TAMANHO mentido (26 MB) pra forçar o modo elemento.
 *
 * O caminho de verdade é um Você de celular, que aqui não existe -- e guardar um vídeo de
 * 30 MB no repositório pra testar um `if` seria pagar caro por pouco. O que o teste precisa
 * provar é a DECISÃO (acima de 25 MB não decodifica) e o caminho do
 * MediaElementAudioSourceNode, e os dois acontecem igual com o arquivo pequeno.
 */
const POR_ELEMENTO: ItemPrevia = {
  ...MUSICA,
  id: "voz003",
  barramento: "voz",
  fonte: { chave: "voce/grande", url: "/musica/previa/calma.m4a", bytes: 26 * 1024 * 1024 },
};

const MARCAS: MarcaPrevia[] = [{ id: "marca1", tempo: 4, fonte: { chave: "efeitos/clique", url: "/efeitos/previa/clique.m4a" } }];

declare global {
  interface Window {
    __encenaPrevia?: Record<string, unknown>;
  }
}

export default function PreviaAudioDev() {
  const [cenario, setCenario] = useState<Cenario>("musica");
  const [avisos, setAvisos] = useState<{ motivo: MotivoSemSom; chave?: string }[]>([]);
  const [marcador, setMarcador] = useState<Marcador | null>(null);
  const [tempo, setTempo] = useState(0);
  const [fim, setFim] = useState(0);

  const itens = useMemo(() => (cenario === "musica" ? [MUSICA] : cenario === "url-ruim" ? [QUEBRADA] : [POR_ELEMENTO]), [cenario]);
  const marcas = useMemo(() => MARCAS, []);

  const aoTerminar = useCallback(() => setFim((n) => n + 1), []);
  const aoSemSom = useCallback((motivo: MotivoSemSom, chave?: string) => setAvisos((l) => [...l, { motivo, chave }]), []);

  const previa = usePreviaDeAudio({ itens, marcas, total: TOTAL, aoTerminar, aoSemSom, medirSaida: true });
  const { relogio, preparar, tocar, pausar, buscar, duracaoDe, estadoDaFonte, medidorDaSaida, tocando, semSom } = previa;

  useEffect(() => {
    preparar([...itens.map((i) => i.fonte), ...marcas.map((m) => m.fonte)]);
  }, [preparar, itens, marcas]);

  useEffect(() => relogio.assinar(setTempo), [relogio]);

  const rms = useCallback(() => {
    if (!medidorDaSaida) return 0;
    const dados = new Float32Array(medidorDaSaida.fftSize);
    medidorDaSaida.getFloatTimeDomainData(dados);
    let soma = 0;
    for (let i = 0; i < dados.length; i++) soma += dados[i] * dados[i];
    return Math.sqrt(soma / dados.length);
  }, [medidorDaSaida]);

  const tocarMarcado = useCallback(
    (t: number) => {
      const ctx = medidorDaSaida?.context as AudioContext | undefined;
      const latencia = ctx ? Math.min(0.5, Math.max(0, ctx.outputLatency || ctx.baseLatency || 0)) : 0;
      const t0 = t >= TOTAL - 1e-3 ? 0 : Math.max(0, t);
      if (ctx) setMarcador({ t0, base: ctx.currentTime + 0.05, latencia });
      tocar(t);
    },
    [medidorDaSaida, tocar],
  );

  // Tudo que o teste de navegador lê. Escrito num efeito (nunca no render) e refeito quando
  // alguma das funções muda: função velha aqui mede o motor de antes da troca de cenário.
  useEffect(() => {
    window.__encenaPrevia = {
      agora: () => relogio.agora(),
      tocando: () => tocando,
      estadoDoContexto: () => (medidorDaSaida?.context as AudioContext | undefined)?.state ?? null,
      tempoDoContexto: () => (medidorDaSaida?.context as AudioContext | undefined)?.currentTime ?? null,
      marcador: () => marcador,
      rms: () => rms(),
      semSom: () => [...semSom],
      avisos: () => avisos,
      fim: () => fim,
      duracaoDe: (chave: string) => duracaoDe(chave),
      estadoDaFonte: (chave: string) => estadoDaFonte(chave),
      agenda: (t: number) => agendaDaPrevia(itens, t, duracaoDe),
      janelas: () => janelasDeVoz(itens),
      tocar: (t: number) => tocarMarcado(t),
      pausar: () => pausar(),
      buscar: (t: number) => buscar(t),
      cenario: (c: Cenario) => setCenario(c),
      itens: () => itens,
      total: TOTAL,
    };
    return () => {
      delete window.__encenaPrevia;
    };
  }, [relogio, tocando, medidorDaSaida, marcador, rms, semSom, avisos, fim, duracaoDe, estadoDaFonte, itens, tocarMarcado, pausar, buscar]);

  const botao = "min-h-11 min-w-14 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100";

  return (
    <main className="mx-auto flex max-w-[375px] flex-col gap-3 bg-neutral-950 p-4 text-neutral-100" data-area="bancada">
      <h1 className="text-base font-medium">Prévia de áudio · bancada</h1>
      <p className="text-xs text-neutral-400">
        Vídeo de {TOTAL}s. Música em [{MUSICA.noVideo}, {MUSICA.noVideo + MUSICA.dur}) a partir do segundo {MUSICA.corte} do arquivo, fade {MUSICA.fadeEntrada}/{MUSICA.fadeSaida}. Marca de virada em 4s.
      </p>

      <div className="flex gap-2">
        {(["musica", "url-ruim", "elemento"] as const).map((c) => (
          <button key={c} type="button" className={botao + (cenario === c ? " border-marca-coral" : "")} onClick={() => setCenario(c)} data-cenario={c}>
            {c === "musica" ? "Música" : c === "url-ruim" ? "URL ruim" : "Elemento"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" className={botao} onClick={() => tocarMarcado(relogio.agora())} data-acao="tocar">
          Tocar
        </button>
        <button type="button" className={botao} onClick={pausar} data-acao="pausar">
          Pausar
        </button>
        <button type="button" className={botao} onClick={() => buscar(6)} data-acao="buscar-6">
          Ir a 6s
        </button>
        <button type="button" className={botao} onClick={() => buscar(0)} data-acao="buscar-0">
          Início
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-neutral-300">
        <dt>tempo</dt>
        <dd data-campo="tempo">{tempo.toFixed(2)}</dd>
        <dt>tocando</dt>
        <dd data-campo="tocando">{String(tocando)}</dd>
        <dt>contexto</dt>
        <dd data-campo="contexto">{(medidorDaSaida?.context as AudioContext | undefined)?.state ?? "—"}</dd>
        <dt>fonte</dt>
        <dd data-campo="fonte">{estadoDaFonte(itens[0].fonte.chave)}</dd>
        <dt>duração</dt>
        <dd data-campo="duracao">{duracaoDe(itens[0].fonte.chave)?.toFixed(3) ?? "—"}</dd>
        <dt>sem som</dt>
        <dd data-campo="sem-som">{[...semSom].join(", ") || "—"}</dd>
        <dt>avisos</dt>
        <dd data-campo="avisos">{avisos.map((a) => a.motivo).join(", ") || "—"}</dd>
        <dt>terminou</dt>
        <dd data-campo="fim">{fim}</dd>
      </dl>
    </main>
  );
}
