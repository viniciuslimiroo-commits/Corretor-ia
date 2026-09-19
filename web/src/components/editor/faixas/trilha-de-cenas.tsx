"use client";

import { memo, useState } from "react";
import { mesmoRef, type BlocoLinha, type RefItem } from "@/lib/linha-do-tempo";
import { zonaDaAlca, type Medidas } from "./comum";
import { chaveDoBloco } from "./faixa";

// A TRILHA DAS CENAS (D3, revista em 2026-09), como a de um editor de vídeo de verdade:
//
//   - cada cena é uma TIRA DE FILME (a imagem repetida na largura do bloco), com o número,
//     ★ na capa, ✨ na animada e ▶ no vídeo, e a duração no pé quando cabe;
//   - selecionada, ganha moldura coral e ALÇAS nas duas bordas -- arrastar a borda corta a
//     cena (linha-do-tempo.ts, `aparaCena`); a zona de toque da alça tem sempre 44px;
//   - arrastando uma foto ou um vídeo do painel pra cá, uma linha coral mostra ONDE ele
//     vai entrar (antes era "solte em cima de um bloco e torça");
//   - depois da última cena, o botão + abre as fotos e vídeos.

type Props = {
  blocos: BlocoLinha[];
  marcas: number[];
  medidas: Medidas;
  pxs: number;
  total: number;
  selecao: RefItem | null;
  miniaturas: Record<string, string | null>;
  /** Chaves das cenas que são vídeo (▶). */
  clipes?: Set<string>;
  capa: string | null;
  animadas?: Set<string>;
  celular: boolean;
  aoSoltarFoto?(chaveAlvo: string | null, ev: React.DragEvent): void;
  aoAdicionarMidia?(): void;
};

const segundos = (s: number) => `${(Math.round(s * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s`;

function TrilhaDeCenas({ blocos, marcas, medidas, pxs, total, selecao, miniaturas, clipes, capa, animadas, celular, aoSoltarFoto, aoAdicionarMidia }: Props) {
  // Onde o arquivo arrastado vai entrar: x (em segundos) da linha coral e a cena que ele
  // empurra pra frente (null = no fim).
  const [soltura, setSoltura] = useState<{ t: number; chave: string | null } | null>(null);
  const cenas = blocos.filter((b) => b.ref.faixa === "cenas");

  function pontoDeSoltura(ev: React.DragEvent<HTMLDivElement>) {
    const caixa = ev.currentTarget.getBoundingClientRect();
    const t = (ev.clientX - caixa.left) / Math.max(1, pxs);
    const antes = cenas.find((b) => t < (b.de + b.ate) / 2);
    return antes && antes.ref.faixa === "cenas" ? { t: antes.de, chave: antes.ref.chave } : { t: cenas.length ? cenas[cenas.length - 1].ate : 0, chave: null };
  }

  return (
    <div className="relative flex" style={{ height: medidas.cenas }}>
      {!celular && (
        <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-[var(--ed-linha)] bg-[var(--ed-base)] px-3 text-[12px] font-medium text-[var(--ed-texto-2)]" style={{ width: medidas.rotulos }}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--ed-elevado-2)] text-[var(--ed-texto)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M7 5v14M17 5v14" />
            </svg>
          </span>
          Cenas
        </div>
      )}
      <div
        data-alvo="cenas-fundo"
        className="relative flex-1"
        style={{ touchAction: "pan-x" }}
        onDragOver={
          aoSoltarFoto
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                const p = pontoDeSoltura(e);
                setSoltura((s) => (s && s.t === p.t && s.chave === p.chave ? s : p));
              }
            : undefined
        }
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltura(null);
        }}
        onDrop={
          aoSoltarFoto
            ? (e) => {
                e.preventDefault();
                const p = pontoDeSoltura(e);
                setSoltura(null);
                aoSoltarFoto(p.chave, e);
              }
            : undefined
        }
      >
        {blocos.length === 0 && (
          <div className="pointer-events-none absolute inset-y-1 left-0 flex items-center gap-2 rounded-xl border border-dashed border-[var(--ed-linha-forte)] px-4 text-[12.5px] text-[var(--ed-texto-3)]" style={{ width: celular ? 260 : 340 }}>
            {celular ? "Toque em Mídia ou Vídeos pra começar" : "Arraste fotos e vídeos pra cá, ou use o +"}
          </div>
        )}
        {blocos.map((b, i) => {
          const chave = chaveDoBloco("cenas", i);
          const selecionado = mesmoRef(b.ref, selecao);
          const chaveCena = b.ref.faixa === "cenas" ? b.ref.chave : null;
          const mini = chaveCena ? miniaturas[chaveCena] : null;
          const final = b.ref.faixa === "telaFinal";
          const largura = Math.max(0, b.ate - b.de) * pxs;
          const video = !!chaveCena && !!clipes?.has(chaveCena);
          const zona = zonaDaAlca(largura);
          const alcas = selecionado ? b.alcas : { inicio: false, fim: false };
          return (
            <div
              key={chave}
              data-alvo="bloco"
              data-chave={chave}
              data-selecionado={selecionado ? "1" : undefined}
              data-largura={Math.round(largura)}
              data-video={video ? "1" : undefined}
              className="absolute top-1 bottom-1"
              style={{
                left: `calc(var(--pxs) * ${b.de})`,
                width: `calc(var(--pxs) * ${Math.max(0, b.ate - b.de)} - 2px)`,
                touchAction: selecionado ? "none" : "pan-x",
                zIndex: selecionado ? 3 : 1,
              }}
            >
              <div
                className={`absolute inset-0 overflow-hidden rounded-[10px] ${final ? "border border-dashed border-[var(--ed-linha-forte)] bg-gradient-to-br from-[#13264a] to-[#0c1a34]" : "bg-[#1a2b4d]"}`}
                style={
                  mini && !final
                    ? { backgroundImage: `url("${mini}")`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x", backgroundPosition: "left center" }
                    : undefined
                }
              >
                {!final && <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/45" />}
                <div className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/10" />
                {final ? (
                  <span className="absolute inset-0 flex items-center gap-1.5 px-2.5 text-[11.5px] font-medium text-[var(--ed-texto-2)]">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <path d="M4 5h16v11H4zM8 20h8M12 16v4" />
                    </svg>
                    <span className="truncate">Tela final</span>
                  </span>
                ) : (
                  <>
                    <span className="pointer-events-none absolute top-1 left-1 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-bold leading-none text-white backdrop-blur-sm">
                      {i + 1}
                      {chaveCena && chaveCena === capa && <span aria-label="Capa">★</span>}
                      {chaveCena && animadas?.has(chaveCena) && <span aria-label="Cena animada">✨</span>}
                    </span>
                    {video && largura >= 40 && (
                      <span className="pointer-events-none absolute top-1 right-1 grid h-4 w-4 place-items-center rounded bg-black/55 text-white" aria-label="Vídeo">
                        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    )}
                    {largura >= 56 && <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-white/90">{segundos(b.ate - b.de)}</span>}
                  </>
                )}
              </div>
              {selecionado && <div className="pointer-events-none absolute -inset-[3px] rounded-[13px] ring-2 ring-[var(--ed-acento)] shadow-[0_0_0_4px_rgb(240_107_79/0.18)]" />}
              {alcas.inicio && (
                <div data-alvo="alca-inicio" data-chave={chave} className="absolute top-[-3px] bottom-[-3px] z-10 cursor-ew-resize" style={{ left: -zona.fora, width: 44, touchAction: "none" }} title="Arraste pra cortar o começo">
                  <div className="absolute top-0 bottom-0 grid w-3 place-items-center rounded-l-[10px] bg-[var(--ed-acento)]" style={{ left: zona.fora - 3 }}>
                    <span className="h-4 w-0.5 rounded-full bg-white/90" />
                  </div>
                </div>
              )}
              {alcas.fim && (
                <div data-alvo="alca-fim" data-chave={chave} className="absolute top-[-3px] bottom-[-3px] z-10 cursor-ew-resize" style={{ right: -zona.fora, width: 44, touchAction: "none" }} title="Arraste pra mudar até onde vai">
                  <div className="absolute top-0 bottom-0 grid w-3 place-items-center rounded-r-[10px] bg-[var(--ed-acento)]" style={{ right: zona.fora - 3 }}>
                    <span className="h-4 w-0.5 rounded-full bg-white/90" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {marcas.map((t, i) => (
          <div key={i} className="pointer-events-none absolute top-1 bottom-1 z-[4]" style={{ left: `calc(var(--pxs) * ${t} - 1px)` }} aria-hidden="true">
            <div className="h-full w-[2px] rounded-full bg-white/60" />
            <svg viewBox="0 0 24 24" className="absolute -left-[5px] -top-[1px] h-3 w-3 text-white" fill="currentColor">
              <path d="M11 5 6 9H3v6h3l5 4z" />
            </svg>
          </div>
        ))}
        {soltura && (
          <div className="pointer-events-none absolute -top-0.5 -bottom-0.5 z-30 w-[3px] -translate-x-1/2 rounded-full bg-[var(--ed-acento)] shadow-[0_0_12px_rgb(240_107_79/0.9)]" style={{ left: `calc(var(--pxs) * ${soltura.t})` }} data-soltura="1">
            <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[var(--ed-acento)]" />
          </div>
        )}
        {aoAdicionarMidia && (
          <button
            type="button"
            onClick={aoAdicionarMidia}
            aria-label="Pôr fotos ou vídeos"
            title="Pôr fotos ou vídeos"
            data-adicionar-midia="1"
            className="absolute top-1/2 z-[5] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl bg-[var(--ed-elevado-2)] text-[var(--ed-texto)] ring-1 ring-inset ring-[var(--ed-linha-forte)] transition hover:bg-[var(--ed-acento)] hover:text-white"
            style={{ left: blocos.length ? `calc(var(--pxs) * ${total} + 10px)` : celular ? 272 : 352 }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(TrilhaDeCenas);
