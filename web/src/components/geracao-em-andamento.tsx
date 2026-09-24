"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { restanteDaGeracao, falta } from "@/lib/espera-da-geracao";

// O VÍDEO CONTINUA ANDANDO ENQUANTO A PESSOA USA O RESTO DO ENCENA.
//
// Nada no servidor empurra o vídeo sozinho: cada consulta da tela avança no máximo uma etapa.
// Enquanto esse laço morava DENTRO da página de vídeos, sair dela matava a geração -- clicar
// em Clientes, Imóveis ou Editar foto destruía a página e, com ela, quem estava perguntando.
//
// Ele bateu nisso em 24/09/2026 e ficou sem entender: recarregou a página no meio, o vídeo
// congelou em "gerando" e os 8 créditos ficaram presos. E ele CONSTRUIU o software -- um
// corretor testando não pergunta, conclui que não funciona e para.
//
// A espera não some: são cinco minutos e meio num vídeo de dez fotos, e a maior parte é fila
// da IA. Então a escolha nunca foi "esperar cinco minutos ou nenhum", foi "esperar cinco
// minutos olhando a tela ou fazendo outra coisa".
//
// Por que aqui e não no AppShell: o AppShell é renderizado DENTRO de cada página, então ele
// também é recriado a cada navegação. Quem sobrevive é o layout raiz, e é lá que este
// provedor é montado.
//
// O QUE ISTO NÃO RESOLVE, e a tela diz: fechar a aba ou o navegador ainda pausa. Ninguém fica
// perguntando. Pra sobreviver a isso o servidor teria que tocar o vídeo sozinho -- uma fila de
// verdade, que é outra obra. O vídeo pausado não se perde: volta de onde parou com um toque.

export type VideoPronto = {
  videoId: string;
  url: string;
  miniatura: string | null;
  duracao: number | null;
  avisos: string[];
  formato: string;
};

type Andamento = {
  videoId: string;
  feitas: number;
  total: number;
  mensagem: string;
  /** Segundos que faltam pelo ritmo medido, ou null enquanto nenhuma etapa fechou. */
  restante: number | null;
  /**
   * Quando começou, em milissegundos.
   *
   * Guarda o INSTANTE e não os segundos corridos de propósito: com os segundos, o relógio
   * precisaria reescrever o `andamento` a cada tique, e aí o efeito que conta dependeria do
   * próprio objeto que ele muda -- um laço que o React acusa e que teria mesmo.
   */
  inicio: number;
};

type Contexto = {
  andamento: Andamento | null;
  pronto: VideoPronto | null;
  erro: string | null;
  /** Começa (ou retoma) a acompanhar um vídeo. `pegarToken` é chamado a cada consulta. */
  acompanhar: (videoId: string, pegarToken: () => Promise<string>) => void;
  /** A página já consumiu o resultado (ou o erro): pode limpar. */
  limpar: () => void;
  /** Segundos desde que a geração começou. Vem daqui pronto, e não de `Date.now()` na tela. */
  decorrido: number;
};

const Ctx = createContext<Contexto | null>(null);

/** O que a tela de vídeos usa. Fora do provedor devolve um objeto morto, pra nada quebrar. */
export function useGeracao(): Contexto {
  return (
    useContext(Ctx) ?? {
      andamento: null,
      pronto: null,
      erro: null,
      acompanhar: () => {},
      limpar: () => {},
      decorrido: 0,
    }
  );
}

export function GeracaoProvider({ children }: { children: ReactNode }) {
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [pronto, setPronto] = useState<VideoPronto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** O vídeo que está sendo acompanhado agora. Serve pra não acompanhar o mesmo duas vezes. */
  const seguindo = useRef<string | null>(null);

  const limpar = useCallback(() => {
    setPronto(null);
    setErro(null);
  }, []);

  const acompanhar = useCallback((videoId: string, pegarToken: () => Promise<string>) => {
    if (seguindo.current === videoId) return;
    seguindo.current = videoId;
    setPronto(null);
    setErro(null);
    setAndamento({ videoId, feitas: 0, total: 1, mensagem: "Enviando o pedido…", restante: null, inicio: Date.now() });

    void (async () => {
      const inicio = Date.now();
      let tropecos = 0;
      let menorRestante = Infinity;
      try {
        while (Date.now() - inicio < 30 * 60 * 1000) {
          if (seguindo.current !== videoId) return; // outro vídeo assumiu
          let r: Response;
          let d: { status?: string; error?: string; url?: string; miniatura?: string | null; duracao?: number | null; avisos?: string[]; formato?: string; feitas?: number; total?: number; mensagem?: string };
          try {
            r = await fetch(`/api/video/${videoId}`, { headers: { Authorization: `Bearer ${await pegarToken()}` } });
            d = await r.json();
          } catch {
            // Rede piscando não é o vídeo falhando: insiste antes de desistir.
            if (++tropecos > 6) throw new Error("Perdi a conexão com o servidor. Recarregue a página e veja em Seus vídeos.");
            await new Promise((s) => setTimeout(s, 4000));
            continue;
          }
          if (!r.ok) {
            if (r.status >= 500 && ++tropecos <= 6) {
              await new Promise((s) => setTimeout(s, 4000));
              continue;
            }
            throw new Error(d.error || "O vídeo falhou.");
          }
          tropecos = 0;
          if (d.status === "concluido" && d.url) {
            setPronto({ videoId, url: d.url, miniatura: d.miniatura ?? null, duracao: d.duracao ?? null, avisos: d.avisos ?? [], formato: d.formato ?? "9:16" });
            setAndamento(null);
            seguindo.current = null;
            return;
          }
          const feitas = d.feitas ?? 0;
          const total = Math.max(1, d.total ?? 1);
          const decorrido = (Date.now() - inicio) / 1000;
          const restante = restanteDaGeracao(feitas, total, decorrido, menorRestante);
          if (restante !== null) menorRestante = restante;
          setAndamento({ videoId, feitas, total, mensagem: d.mensagem ?? "Gerando…", restante, inicio });
          await new Promise((s) => setTimeout(s, 2500));
        }
        throw new Error("Passou de 30 minutos. Recarregue a página e veja em Seus vídeos.");
      } catch (e) {
        if (seguindo.current !== videoId) return;
        setErro(e instanceof Error ? e.message : "Erro desconhecido.");
        setAndamento(null);
        seguindo.current = null;
      }
    })();
  }, []);

  // O RELÓGIO É UM ESTADO QUE ANDA, e não um `Date.now()` no meio do desenho.
  //
  // Ler a hora durante o render deixa o componente impuro -- o mesmo estado desenharia telas
  // diferentes --, e o compilador do React recusa, com razão. Aqui o tique guarda a hora, o
  // desenho só subtrai, e a conta vira dado como qualquer outro.
  //
  // O intervalo depende de `gerando` (um booleano) e não de `andamento` (um objeto que muda a
  // cada consulta): assim ele é criado uma vez por geração, não de 2,5 em 2,5 segundos.
  const [agora, setAgora] = useState(() => Date.now());
  const gerando = !!andamento;
  useEffect(() => {
    if (!gerando) return;
    // Sem acertar o relógio aqui: escrever estado no corpo do efeito é um render a mais, e o
    // compilador do React recusa. O primeiro tique chega em um segundo e o `Math.max(0, ...)`
    // segura esse instante mostrando zero -- que é a verdade, porque acabou de começar.
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gerando]);
  const decorrido = andamento ? Math.max(0, (agora - andamento.inicio) / 1000) : 0;

  const valor = useMemo(() => ({ andamento, pronto, erro, acompanhar, limpar, decorrido }), [andamento, pronto, erro, acompanhar, limpar, decorrido]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <BarraDaGeracao andamento={andamento} pronto={pronto} decorrido={decorrido} />
    </Ctx.Provider>
  );
}

/**
 * A barrinha que aparece em QUALQUER tela enquanto o vídeo anda.
 *
 * É ela que transforma "o vídeo parou quando saí da tela" em "o vídeo continua e eu vejo
 * onde está". Some na própria tela de vídeos, que já mostra o progresso inteiro -- duas
 * barras dizendo a mesma coisa confundem mais que uma.
 */
function BarraDaGeracao({ andamento, pronto, decorrido }: { andamento: Andamento | null; pronto: VideoPronto | null; decorrido: number }) {
  const [naTelaDeVideos, setNaTelaDeVideos] = useState(false);
  useEffect(() => {
    const ver = () => setNaTelaDeVideos(window.location.pathname.startsWith("/videos"));
    ver();
    const t = setInterval(ver, 800);
    return () => clearInterval(t);
  }, []);

  if (naTelaDeVideos) return null;
  if (!andamento && !pronto) return null;

  const pct = andamento ? Math.max(6, Math.round((andamento.feitas / Math.max(1, andamento.total)) * 100)) : 100;
  const minutos = Math.floor(decorrido / 60);
  const segundos = Math.round(decorrido % 60);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3">
      <Link
        href="/videos"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition hover:border-marca-coral"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${pronto ? "bg-marca-teal" : "animate-pulse bg-marca-coral"}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-800">{pronto ? "Vídeo pronto" : andamento?.mensagem}</span>
          {andamento && (
            <>
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-neutral-200">
                <span className="block h-full rounded-full bg-marca-coral transition-all" style={{ width: `${pct}%` }} />
              </span>
              <span className="mt-1 block text-[11px] text-neutral-500">
                {minutos > 0 ? `${minutos}min ${String(segundos).padStart(2, "0")}s` : `${segundos}s`} rodando
                {andamento.restante !== null && ` · faltam ${falta(andamento.restante)}`}
              </span>
            </>
          )}
        </span>
        <span className="shrink-0 text-xs font-medium text-marca-indigo">{pronto ? "ver" : "abrir"}</span>
      </Link>
    </div>
  );
}
