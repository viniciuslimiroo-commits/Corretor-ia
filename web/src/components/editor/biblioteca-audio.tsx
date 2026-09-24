"use client";

import { useEffect, useRef, useState } from "react";
import { Icone } from "@/components/ui";
import { Pilula, Segmentado } from "./ui-editor";
import { CATEGORIAS_MUSICA, musicasOferecidas, type CategoriaMusica, type MusicaId } from "@/lib/video";

// A BIBLIOTECA DE ÁUDIO: ouvir antes de escolher.
//
// Escolher trilha por uma lista de nomes é escolher no escuro. Ninguém sabe o que é
// "Elegante" até ouvir, e o corretor não vai gerar o vídeo inteiro pra descobrir que a
// música não combinou -- ele vai desistir e montar no aplicativo do celular.
//
// Um TOCADOR só, num ref, e não um <audio> por linha. Com um por linha, duas faixas tocam
// juntas no segundo clique, e a memória guarda quinze arquivos de 700 KB à toa.
//
// O mesmo problema existe ENTRE telas: a prévia da linha do tempo é outro tocador, noutro
// componente, e ninguém dos dois conhece o outro. A vez é pedida por evento no `window`
// (docs/planos/linha-do-tempo-spec.md, D8): ouvir uma faixa aqui manda
// `encena:parar-previa`, e a prévia tocando manda `encena:parar-audio`, que para esta.
// Evento e não prop porque quem toca não é filho de quem para -- e uma prop obrigaria todo
// tocador futuro a passar pelo editor.
//
// As faixas são nossas, geradas uma vez (scripts/gerar-musicas.mjs). Isso não é detalhe
// técnico: música protegida num anúncio é o corretor levando strike, e o problema vira
// dele. Aqui não existe essa conta pra pagar.

type Item = { id: string; rotulo: string; descricao: string; arquivo: string | null };

/**
 * A CAPA da faixa, desenhada e não baixada.
 *
 * Toda biblioteca de áudio mostra uma arte por faixa, e sem ela a lista é uma planilha.
 * Mas baixar arte de banco é licença pra administrar, e gerar 15 imagens com IA é gastar
 * dinheiro numa miniatura de 28px. Desenhada em SVG: sai da cor da CATEGORIA, o desenho
 * é determinístico pelo id da faixa (a mesma faixa tem sempre a mesma capa) e o peso é
 * zero.
 *
 * As barras não são a forma de onda de verdade -- seria mentira desenhar uma sem ler o
 * arquivo. São um motivo gráfico, e o que identifica a faixa é a COR e o desenho, não a
 * promessa de mostrar o áudio.
 */
const TINTAS: Record<string, [string, string]> = {
  calma: ["#2cb1a3", "#0f2d5b"],
  elegante: ["#0f2d5b", "#6b4a8f"],
  moderna: ["#2a6df4", "#12224a"],
  alegre: ["#f0a24f", "#f06b4f"],
  cinematografica: ["#f06b4f", "#5b1436"],
  efeito: ["#475569", "#0f172a"],
};

function CapaFaixa({ id, categoria, tamanho = 28 }: { id: string; categoria: string; tamanho?: number }) {
  const [a, b] = TINTAS[categoria] ?? TINTAS.efeito;
  // Semente estável: mesma faixa, mesmo desenho, entre sessões e entre máquinas. O
  // acumulador fica no LAÇO e não numa closure de map -- o compilador do React recusa
  // variável reatribuída dentro de callback, e é a forma de um valor vazar entre renders.
  const barras: number[] = [];
  for (let i = 0, semente = 0; i < 7; i++) {
    if (i === 0) for (let k = 0; k < id.length; k++) semente = (semente * 31 + id.charCodeAt(k)) % 9973;
    semente = (semente * 1103515245 + 12345) % 2147483648;
    barras.push(0.3 + ((semente >> 8) % 70) / 100);
  }
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 28 28" className="shrink-0 rounded-md" aria-hidden>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="6" fill={`url(#g-${id})`} />
      {barras.map((h, i) => (
        <rect key={i} x={3 + i * 3.4} y={14 - (h * 18) / 2} width="2" height={h * 18} rx="1" fill="#fff" opacity="0.75" />
      ))}
    </svg>
  );
}

export default function BibliotecaAudio({
  escolhida,
  aoEscolher,
  efeito,
  aoEscolherEfeito,
  efeitos,
  desabilitado,
}: {
  escolhida: MusicaId;
  aoEscolher: (id: MusicaId) => void;
  /** Efeito sonoro nas viradas de cena. "nenhum" = sem efeito. */
  efeito: string;
  aoEscolherEfeito: (id: string) => void;
  efeitos: { id: string; rotulo: string; descricao: string; arquivo: string | null }[];
  desabilitado?: boolean;
}) {
  const [aba, setAba] = useState<"musicas" | "efeitos">("musicas");
  const [categoria, setCategoria] = useState<CategoriaMusica | "todas">("todas");
  const [tocando, setTocando] = useState<string | null>(null);
  const tocador = useRef<HTMLAudioElement | null>(null);

  // Sair da tela não pode deixar música tocando por baixo.
  useEffect(() => {
    return () => {
      tocador.current?.pause();
      tocador.current = null;
    };
  }, []);

  // A prévia da linha do tempo começou: esta para, e o botão volta a mostrar "ouvir".
  useEffect(() => {
    const parar = () => {
      tocador.current?.pause();
      setTocando(null);
    };
    window.addEventListener("encena:parar-audio", parar);
    return () => window.removeEventListener("encena:parar-audio", parar);
  }, []);

  function ouvir(item: Item, pasta: string) {
    if (!item.arquivo) return;
    if (tocando === item.id) {
      tocador.current?.pause();
      setTocando(null);
      return;
    }
    // A vez é desta: a prévia da linha do tempo para antes de a faixa começar.
    window.dispatchEvent(new Event("encena:parar-previa"));
    tocador.current?.pause();
    const a = new Audio(`/${pasta}/${item.arquivo}`);
    a.volume = 0.7;
    a.onended = () => setTocando(null);
    a.play().catch(() => setTocando(null));
    tocador.current = a;
    setTocando(item.id);
  }

  const musicas = musicasOferecidas().filter((m) => m.id !== "nenhuma" && (categoria === "todas" || m.categoria === categoria));
  const lista: Item[] = aba === "musicas" ? musicas : efeitos;
  const pasta = aba === "musicas" ? "musica" : "efeitos";
  const marcado = aba === "musicas" ? escolhida : efeito;

  return (
    <div className="flex flex-col gap-4">
      <Segmentado
        rotulo="Músicas ou efeitos"
        opcoes={[
          { id: "musicas", rotulo: "Músicas" },
          { id: "efeitos", rotulo: "Efeitos sonoros" },
        ]}
        valor={aba}
        aoMudar={(v) => setAba(v as typeof aba)}
      />

      {aba === "musicas" && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["todas", ...CATEGORIAS_MUSICA.map((c) => c.id)] as const).map((id) => {
            const def = CATEGORIAS_MUSICA.find((c) => c.id === id);
            return (
              <Pilula key={id} ativo={categoria === id} onClick={() => setCategoria(id as CategoriaMusica | "todas")} title={def?.para}>
                {id === "todas" ? "Todas" : def?.rotulo}
              </Pilula>
            );
          })}
        </div>
      )}

      {/* "sem" é a primeira linha das duas listas: tirar a música é uma escolha, não a
          ausência de uma -- e vídeo narrado muitas vezes fica melhor sem trilha. */}
      <ul className="-mx-2 flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            disabled={desabilitado}
            onClick={() => (aba === "musicas" ? aoEscolher("nenhuma") : aoEscolherEfeito("nenhum"))}
            className={
              "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition disabled:opacity-40 " +
              (marcado === (aba === "musicas" ? "nenhuma" : "nenhum") ? "bg-[var(--ed-acento-suave)] ring-1 ring-inset ring-[rgb(240_107_79/0.45)]" : "hover:bg-[var(--ed-elevado)]")
            }
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--ed-elevado-2)] text-[var(--ed-texto-2)]">
              <Icone nome="fechar" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-[var(--ed-texto)]">{aba === "musicas" ? "Sem música" : "Sem efeito"}</span>
              <span className="block truncate text-[12px] text-[var(--ed-texto-2)]">{aba === "musicas" ? "Só a sua voz, ou silêncio" : "Nenhum som nas viradas"}</span>
            </span>
          </button>
        </li>

        {lista.map((m) => {
          const ativo = marcado === m.id;
          const nesta = tocando === m.id;
          return (
            <li key={m.id}>
              <div className={"flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 transition " + (ativo ? "bg-[var(--ed-acento-suave)] ring-1 ring-inset ring-[rgb(240_107_79/0.45)]" : "hover:bg-[var(--ed-elevado)]")}>
                {/* Ouvir é um botão SEPARADO de escolher: a pessoa passa a lista inteira
                    ouvindo antes de se decidir, e cada prévia não pode mexer no vídeo. */}
                <button
                  type="button"
                  onClick={() => ouvir(m, pasta)}
                  title={nesta ? "Parar" : "Ouvir"}
                  aria-label={nesta ? `Parar ${m.rotulo}` : `Ouvir ${m.rotulo}`}
                  className="group relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg transition"
                >
                  <CapaFaixa id={m.id} categoria={(m as { categoria?: string }).categoria ?? "efeito"} />
                  {/* O play cobre a capa: a arte diz QUAL faixa é, o botão diz o que ele faz. No
                      toque (sem "passar o mouse") o selo de play fica sempre à vista. */}
                  <span className={"absolute inset-0 grid place-items-center bg-black/45 text-white transition " + (nesta ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                    <Icone nome={nesta ? "pausa" : "play"} className="h-4 w-4" />
                  </span>
                  {!nesta && (
                    <span className="absolute right-0.5 bottom-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white group-hover:opacity-0" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="ml-px h-2.5 w-2.5" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  )}
                </button>
                <button type="button" disabled={desabilitado} onClick={() => (aba === "musicas" ? aoEscolher(m.id as MusicaId) : aoEscolherEfeito(m.id))} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left disabled:opacity-40">
                  <span className={"block truncate text-[14px] font-medium " + (ativo ? "text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto)]")}>{m.rotulo}</span>
                  <span className="block truncate text-[12px] text-[var(--ed-texto-2)]">{m.descricao}</span>
                </button>
                {nesta ? (
                  <span className="flex h-4 shrink-0 items-end gap-0.5 pr-1" aria-label="Tocando">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1 animate-pulse rounded-full bg-[var(--ed-acento)]" style={{ height: `${[60, 100, 40][i]}%`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                ) : (
                  ativo && <Icone nome="check" className="mr-1 h-5 w-5 shrink-0 text-[var(--ed-acento)]" />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] leading-relaxed text-[var(--ed-texto-3)]">
        Todas as faixas são da Encena, feitas pra isto. Nenhuma tem dono de fora, então o seu anúncio não corre risco de derrubada por direito autoral.
      </p>
    </div>
  );
}
