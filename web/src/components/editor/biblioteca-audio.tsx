"use client";

import { useEffect, useRef, useState } from "react";
import { Icone } from "@/components/ui";
import { CATEGORIAS_MUSICA, MUSICAS, type CategoriaMusica, type MusicaId } from "@/lib/video";

// A BIBLIOTECA DE ÁUDIO: ouvir antes de escolher.
//
// Escolher trilha por uma lista de nomes é escolher no escuro. Ninguém sabe o que é
// "Elegante" até ouvir, e o corretor não vai gerar o vídeo inteiro pra descobrir que a
// música não combinou -- ele vai desistir e montar no aplicativo do celular.
//
// Um TOCADOR só, num ref, e não um <audio> por linha. Com um por linha, duas faixas tocam
// juntas no segundo clique, e a memória guarda quinze arquivos de 700 KB à toa.
//
// As faixas são nossas, geradas uma vez (scripts/gerar-musicas.mjs). Isso não é detalhe
// técnico: música protegida num anúncio é o corretor levando strike, e o problema vira
// dele. Aqui não existe essa conta pra pagar.

type Item = { id: string; rotulo: string; descricao: string; arquivo: string | null };

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

  function ouvir(item: Item, pasta: string) {
    if (!item.arquivo) return;
    if (tocando === item.id) {
      tocador.current?.pause();
      setTocando(null);
      return;
    }
    tocador.current?.pause();
    const a = new Audio(`/${pasta}/${item.arquivo}`);
    a.volume = 0.7;
    a.onended = () => setTocando(null);
    a.play().catch(() => setTocando(null));
    tocador.current = a;
    setTocando(item.id);
  }

  const musicas = MUSICAS.filter((m) => m.id !== "nenhuma" && (categoria === "todas" || m.categoria === categoria));
  const lista: Item[] = aba === "musicas" ? musicas : efeitos;
  const pasta = aba === "musicas" ? "musica" : "efeitos";
  const marcado = aba === "musicas" ? escolhida : efeito;

  return (
    <div className="flex flex-col gap-3">
      {/* abas */}
      <div className="flex gap-1 border-b border-neutral-200">
        {(["musicas", "efeitos"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={
              "-mb-px border-b-2 px-3 py-1.5 text-sm transition " +
              (aba === a ? "border-marca-coral font-medium text-marca-indigo" : "border-transparent text-neutral-500 hover:text-neutral-700")
            }
          >
            {a === "musicas" ? "Músicas" : "Efeitos sonoros"}
          </button>
        ))}
      </div>

      {aba === "musicas" && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {(["todas", ...CATEGORIAS_MUSICA.map((c) => c.id)] as const).map((id) => {
            const def = CATEGORIAS_MUSICA.find((c) => c.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategoria(id as CategoriaMusica | "todas")}
                title={def?.para}
                className={
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs transition " +
                  (categoria === id ? "border-marca-indigo bg-marca-indigo/10 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                }
              >
                {id === "todas" ? "Todas" : def?.rotulo}
              </button>
            );
          })}
        </div>
      )}

      {/* "sem" é a primeira linha das duas listas: tirar a música é uma escolha, não a
          ausência de uma -- e vídeo narrado muitas vezes fica melhor sem trilha. */}
      <ul className="flex flex-col gap-1">
        <li>
          <button
            type="button"
            disabled={desabilitado}
            onClick={() => (aba === "musicas" ? aoEscolher("nenhuma") : aoEscolherEfeito("nenhum"))}
            className={
              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition disabled:opacity-40 " +
              (marcado === (aba === "musicas" ? "nenhuma" : "nenhum")
                ? "border-marca-indigo bg-marca-indigo/10 text-marca-indigo"
                : "border-neutral-200 hover:border-neutral-400")
            }
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-400">
              <Icone nome="fechar" className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{aba === "musicas" ? "Sem música" : "Sem efeito"}</span>
              <span className="block truncate text-[11px] text-neutral-500">
                {aba === "musicas" ? "Só a sua voz, ou silêncio" : "Nenhum som nas viradas"}
              </span>
            </span>
          </button>
        </li>

        {lista.map((m) => {
          const ativo = marcado === m.id;
          const nesta = tocando === m.id;
          return (
            <li key={m.id}>
              <div
                className={
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition " +
                  (ativo ? "border-marca-indigo bg-marca-indigo/10" : "border-neutral-200 hover:border-neutral-400")
                }
              >
                {/* Ouvir é um botão SEPARADO de escolher: a pessoa passa a lista inteira
                    ouvindo antes de se decidir, e cada prévia não pode mexer no vídeo. */}
                <button
                  type="button"
                  onClick={() => ouvir(m, pasta)}
                  title={nesta ? "Parar" : "Ouvir"}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
                >
                  <Icone nome={nesta ? "fechar" : "play"} className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={desabilitado}
                  onClick={() => (aba === "musicas" ? aoEscolher(m.id as MusicaId) : aoEscolherEfeito(m.id))}
                  className="min-w-0 flex-1 text-left disabled:opacity-40"
                >
                  <span className={"block truncate text-sm " + (ativo ? "text-marca-indigo" : "")}>{m.rotulo}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{m.descricao}</span>
                </button>
                {ativo && <Icone nome="check" className="h-4 w-4 shrink-0 text-marca-coral" />}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-neutral-400">
        Todas as faixas são da Encena, feitas pra isto. Nenhuma tem dono de fora, então o seu anúncio não corre risco de derrubada por direito autoral.
      </p>
    </div>
  );
}
