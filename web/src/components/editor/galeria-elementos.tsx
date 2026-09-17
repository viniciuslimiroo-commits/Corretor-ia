"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ANCORAS,
  ELEMENTO_POR_ID,
  FICHA_EXEMPLO,
  MODELOS_ELEMENTO,
  type AncoraElemento,
  type IconeFicha,
} from "@/lib/elementos";
import {
  ADESIVO_POR_ID,
  CATEGORIAS_ADESIVO,
  CATEGORIAS_GIF,
  CREDITO_GIFS,
  buscarAdesivos,
  idDoAdesivo,
  urlDaMiniatura,
  urlDoAdesivo,
  type CategoriaAdesivo,
  type CategoriaGif,
} from "@/lib/adesivos";
import { ANIMACOES_TEXTO, LIMITES, type AnimacaoTexto, type ElementoCena } from "@/lib/video";
import { MOVIMENTOS, type MovimentoId } from "@/lib/movimentos";
import { AVISO_PEXELS, CATEGORIAS_REACAO, CREDITO_PEXELS, LOOP_CLIPE_S, TAMANHO_CLIPE, TAMANHO_CLIPE_MAX, TAMANHO_CLIPE_MIN, idDoPexels, type ClipePexels } from "@/lib/pexels";

/** O que a busca de clipes devolve pra galeria. `erro: "sem_chave"` = Pexels não configurado. */
export type RespostaClipes = { clipes: ClipePexels[]; temMais: boolean; erro?: string };

/** Cartão de um clipe: capa parada, e a prévia só toca quando o dedo/mouse está em cima. */
function CartaoClipe({ clipe, desligado, aoEscolher }: { clipe: ClipePexels; desligado: boolean; aoEscolher: () => void }) {
  const [tocando, setTocando] = useState(false);
  return (
    <button
      type="button"
      onClick={aoEscolher}
      onMouseEnter={() => setTocando(true)}
      onMouseLeave={() => setTocando(false)}
      onTouchStart={() => setTocando(true)}
      disabled={desligado}
      title={clipe.autor ? `por ${clipe.autor} no Pexels` : "Pexels"}
      aria-label={`Pôr clipe ${clipe.autor ? "de " + clipe.autor : ""}`}
      className="relative aspect-square overflow-hidden rounded-lg bg-neutral-800 transition hover:ring-2 hover:ring-marca-coral disabled:opacity-40"
    >
      {tocando ? (
        <video
          src={clipe.previa}
          muted
          autoPlay
          playsInline
          loop
          onTimeUpdate={(ev) => {
            if (ev.currentTarget.currentTime >= LOOP_CLIPE_S) ev.currentTarget.currentTime = 0;
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={clipe.capa} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
      )}
      {clipe.autor && <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-left text-[9px] text-white/90">{clipe.autor}</span>}
    </button>
  );
}
import { Chip, Icone } from "@/components/ui";

// A GALERIA DE ELEMENTOS, na lógica do CapCut: busca em cima, prateleiras embaixo.
//
// A primeira versão tinha selos, setas e balões DESENHADOS À MÃO em SVG, e foi reprovada
// ("olhe a diferença", com print do CapCut ao lado). Agora a prateleira principal são os
// ADESIVOS 3D da biblioteca Fluent Emoji (Microsoft, licença MIT) -- arte de ilustrador,
// escolhida pra anúncio de imóvel e com busca em português.
//
// Os modelos desenhados que ficaram são os que carregam DADO, e que nenhuma biblioteca de
// adesivo tem: a ficha do imóvel (quartos, vagas, metragem, preenchidos do cadastro), o
// WhatsApp com o número, e as molduras. Selos e setas desenhados saíram da prateleira --
// continuam no catálogo só pra vídeo antigo que os usa reabrir igual.
//
// GIFs: aba própria, como no CapCut ("pode ser que algum criador queira usar gif"). São
// emojis animados de biblioteca livre, não memes da Giphy -- ver src/lib/adesivos.ts.

/** Tamanho máximo de um GIF: o arquivo tem 224px, e 20% de 1920 (384px) já amplia 1,7x. */
const TAMANHO_MAX_GIF = 0.2;


const CATEGORIAS_DESENHADAS = ["ficha", "contato", "moldura"] as const;
const ROTULO_DESENHADA: Record<(typeof CATEGORIAS_DESENHADAS)[number], string> = {
  ficha: "Ficha do imóvel",
  contato: "Contato",
  moldura: "Molduras",
};

/** Um modelo desenhado num quadro 9:16 pequeno, pro cartão. */
function previa(id: string, texto: string, itens: { icone: IconeFicha; texto: string }[], cor: string, larguraMax: number) {
  const modelo = ELEMENTO_POR_ID[id];
  if (!modelo) return null;
  const H = 220;
  const W = Math.round((H * 9) / 16);
  const alt = Math.max(12, Math.round(H * modelo.corpo));
  const d = modelo.desenhar({ texto: texto || modelo.exemplo || "", itens: itens.length ? itens : FICHA_EXEMPLO, cor }, { alt, W, H });
  const escala = Math.min(1, larguraMax / d.largura);
  return { svg: d.svg, largura: Math.round(d.largura * escala), altura: Math.round(d.altura * escala) };
}

function CartaoDesenhado({ id, cor, itens, escolhido, desligado, aoEscolher }: { id: string; cor: string; itens: { icone: IconeFicha; texto: string }[]; escolhido: boolean; desligado: boolean; aoEscolher: () => void }) {
  const modelo = ELEMENTO_POR_ID[id];
  const p = useMemo(() => previa(id, modelo?.exemplo ?? "", itens, cor, 150), [id, modelo, itens, cor]);
  return (
    <button
      type="button"
      onClick={aoEscolher}
      disabled={desligado}
      title={modelo?.rotulo}
      className={
        "flex w-full flex-col items-center gap-1 rounded-xl border p-1.5 transition disabled:opacity-40 " +
        (escolhido ? "border-marca-coral bg-marca-indigo/5" : "border-neutral-200 hover:border-neutral-400")
      }
    >
      <span className="flex h-[64px] w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-800">
        {p ? (
          <span
            className="flex items-center justify-center"
            style={{ width: p.largura, height: p.altura }}
            // SVG do catálogo do próprio produto; o texto passa por `escaparSvg` antes.
            dangerouslySetInnerHTML={{ __html: p.svg.replace("<svg ", `<svg style="width:100%;height:100%" `) }}
          />
        ) : null}
      </span>
      <span className="text-[10px] leading-tight text-neutral-600">{modelo?.rotulo}</span>
    </button>
  );
}

export default function GaleriaElementos({
  elementos,
  itensDaFicha,
  cor,
  podeMais,
  aoAdicionar,
  buscarClipes,
  aoMudar,
  aoTirar,
}: {
  elementos: ElementoCena[];
  /** Os dados do imóvel, já em palavra. Vazio quando não há imóvel escolhido. */
  itensDaFicha: { icone: IconeFicha; texto: string }[];
  cor: string;
  podeMais: boolean;
  aoAdicionar: (e: ElementoCena) => void;
  /** Busca clipes de reação no Pexels (pelo servidor, com a sessão). */
  buscarClipes: (termo: string, pagina: number, livre: boolean) => Promise<RespostaClipes>;
  aoMudar: (i: number, mudanca: Partial<ElementoCena>) => void;
  aoTirar: (i: number) => void;
}) {
  const [aba, setAba] = useState<"adesivos" | "gifs">("adesivos");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaAdesivo | CategoriaGif | "todos">("todos");

  const gifs = aba === "gifs";
  const buscando = busca.trim().length > 0;
  const adesivos = useMemo(() => {
    const achados = buscarAdesivos(busca, gifs);
    return buscando || categoria === "todos" ? achados : achados.filter((a) => a.categoria === categoria);
  }, [busca, buscando, categoria, gifs]);
  const categorias = gifs ? CATEGORIAS_GIF : CATEGORIAS_ADESIVO;

  // ---------- clipes de reação (Pexels) ----------
  // A busca da caixa de pesquisa vale pros emojis E pros clipes; sem texto, vale a
  // prateleira escolhida. Espera a pessoa parar de digitar (600ms) pra não gastar cota.
  const [reacao, setReacao] = useState(CATEGORIAS_REACAO[0].id);
  const [clipes, setClipes] = useState<{ chave: string; r: RespostaClipes } | null>(null);
  const [pagina, setPagina] = useState(1);
  const termoClipes = busca.trim() || CATEGORIAS_REACAO.find((c) => c.id === reacao)!.busca;
  const chaveClipes = `${termoClipes}|${pagina}`;
  useEffect(() => {
    if (!gifs) return;
    let vivo = true;
    const t = setTimeout(
      () => {
        buscarClipes(termoClipes, pagina, !!busca.trim())
          .then((r) => {
            if (!vivo) return;
            setClipes((antes) => (pagina > 1 && antes && antes.chave.startsWith(`${termoClipes}|`) ? { chave: chaveClipes, r: { ...r, clipes: [...antes.r.clipes, ...r.clipes] } } : { chave: chaveClipes, r }));
          })
          .catch(() => vivo && setClipes({ chave: chaveClipes, r: { clipes: [], temMais: false, erro: "falhou" } }));
      },
      busca.trim() ? 600 : 0
    );
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [gifs, termoClipes, pagina, chaveClipes, busca, buscarClipes]);
  const carregandoClipes = gifs && (!clipes || clipes.chave !== chaveClipes);

  function porClipe(c: ClipePexels) {
    if (!podeMais) return;
    aoAdicionar({
      id: `pexels:${c.id}`,
      ancora: "base_dir",
      tamanho: TAMANHO_CLIPE,
      animacao: "surgir",
      clipe: { previa: c.previa, largura: c.largura, altura: c.altura, autor: c.autor, autorUrl: c.autorUrl },
    });
  }

  function porAdesivo(id: string) {
    if (!podeMais) return;
    // Nasce no canto de cima e ENTRA (surgir): adesivo parado desde o primeiro quadro
    // parece carimbado na foto; entrando, parece posto ali.
    aoAdicionar({ id: `adesivo:${id}`, ancora: "topo_dir", tamanho: 0.12, animacao: "surgir" });
  }

  return (
    <div>
      {/* ---------- abas ---------- */}
      <div className="mb-3 flex gap-1 border-b border-neutral-200">
        {(["adesivos", "gifs"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAba(a);
              setCategoria("todos");
            }}
            className={
              "-mb-px border-b-2 px-3 py-1.5 text-sm transition " +
              (aba === a ? "border-marca-coral font-medium text-marca-indigo" : "border-transparent text-neutral-500 hover:text-neutral-700")
            }
          >
            {a === "adesivos" ? "Adesivos" : "GIFs"}
          </button>
        ))}
      </div>

      {/* ---------- busca ---------- */}
      <label className="mb-3 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={gifs ? "Pesquisar GIFs: rindo, palmas, surpresa…" : "Pesquisar elementos: chave, piscina, rindo…"}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>

      {!podeMais && elementos.length >= LIMITES.elementosPorCena && (
        <p className="mb-2 text-[11px] text-neutral-500">{LIMITES.elementosPorCena} peças já é o limite desta cena. Tire uma pra pôr outra.</p>
      )}

      {/* ---------- o que já está na cena ---------- */}
      {elementos.length > 0 && (
        <div className="mb-3 rounded-lg bg-neutral-50 p-2.5">
          <p className="text-xs font-medium text-neutral-600">Nesta cena</p>
          {elementos.map((e, i) => {
            const adesivo = idDoAdesivo(e.id);
            const clipe = idDoPexels(e.id) ? e.clipe : undefined;
            const modelo = adesivo || clipe ? null : ELEMENTO_POR_ID[e.id];
            if (!adesivo && !modelo && !clipe) return null;
            const rotulo = clipe ? `Clipe${clipe.autor ? " de " + clipe.autor : ""} (Pexels)` : adesivo ? ADESIVO_POR_ID[adesivo].rotulo : modelo!.rotulo;
            return (
              <div key={i} className="mt-2 rounded-lg border border-neutral-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  {adesivo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlDoAdesivo(adesivo)} alt="" className="h-7 w-7 shrink-0" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">{rotulo}</span>
                  <button onClick={() => aoTirar(i)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Tirar esta peça">
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                </div>

                {modelo?.usa === "texto" && (
                  <input
                    type="text"
                    value={e.texto ?? ""}
                    onChange={(ev) => aoMudar(i, { texto: ev.target.value })}
                    maxLength={LIMITES.elementoTextoMax}
                    placeholder={modelo.exemplo}
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm focus:border-marca-indigo focus:outline-none"
                  />
                )}

                {!modelo?.quadroInteiro && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <select
                      value={e.ancora ?? modelo?.ancora ?? "topo_dir"}
                      onChange={(ev) => aoMudar(i, { ancora: ev.target.value as AncoraElemento })}
                      className="rounded-lg border border-neutral-200 px-1.5 py-1 text-[11px] focus:border-marca-indigo focus:outline-none"
                      aria-label="Onde fica"
                    >
                      {ANCORAS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.rotulo}
                        </option>
                      ))}
                    </select>
                    <select
                      value={e.animacao ?? "nenhuma"}
                      onChange={(ev) => aoMudar(i, { animacao: ev.target.value as AnimacaoTexto })}
                      className="rounded-lg border border-neutral-200 px-1.5 py-1 text-[11px] focus:border-marca-indigo focus:outline-none"
                      aria-label="Como entra"
                    >
                      {ANIMACOES_TEXTO.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {clipe && (
                  <label className="mt-1.5 block text-[11px] text-neutral-500">
                    Tamanho
                    <input
                      type="range"
                      min={TAMANHO_CLIPE_MIN}
                      max={TAMANHO_CLIPE_MAX}
                      step={0.01}
                      value={e.tamanho ?? TAMANHO_CLIPE}
                      onChange={(ev) => aoMudar(i, { tamanho: Number(ev.target.value) })}
                      className="mt-0.5 w-full accent-marca-coral"
                    />
                  </label>
                )}

                {/* GIF e clipe já se mexem; moldura é o quadro inteiro. O resto pode balançar. */}
                {!modelo?.quadroInteiro && !clipe && !(adesivo && ADESIVO_POR_ID[adesivo].animado) && (
                  <select
                    value={e.movimento ?? "nenhum"}
                    onChange={(ev) => aoMudar(i, { movimento: ev.target.value as MovimentoId })}
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 px-1.5 py-1 text-[11px] focus:border-marca-indigo focus:outline-none"
                    aria-label="Movimento em laço"
                  >
                    {MOVIMENTOS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id === "nenhum" ? "Sem movimento" : `Em laço: ${m.rotulo}`}
                      </option>
                    ))}
                  </select>
                )}

                {adesivo && (
                  <label className="mt-1.5 block text-[11px] text-neutral-500">
                    Tamanho
                    <input
                      type="range"
                      min={0.06}
                      max={ADESIVO_POR_ID[adesivo].animado ? TAMANHO_MAX_GIF : 0.3}
                      step={0.01}
                      value={e.tamanho ?? 0.12}
                      onChange={(ev) => aoMudar(i, { tamanho: Number(ev.target.value) })}
                      className="mt-0.5 w-full accent-marca-coral"
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- gente reagindo (Pexels) ---------- */}
      {gifs && (
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-semibold text-neutral-700">Gente reagindo</p>
            <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="text-[10px] text-neutral-500 underline">
              {CREDITO_PEXELS}
            </a>
          </div>
          {/* Quebrando linha, e não rolando pro lado: numa fileira que rola, o celular só
               mostrava a primeira categoria e ele achou que só havia "palmas". */}
          {!buscando && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {CATEGORIAS_REACAO.map((c) => (
                <Chip
                  key={c.id}
                  ativo={reacao === c.id}
                  onClick={() => {
                    setReacao(c.id);
                    setPagina(1);
                  }}
                >
                  {c.rotulo}
                </Chip>
              ))}
            </div>
          )}
          {clipes?.r.erro === "sem_chave" ? (
            <p className="text-[11px] text-neutral-500">Os clipes do Pexels ainda não foram ligados neste servidor.</p>
          ) : clipes?.r.erro ? (
            <p className="text-[11px] text-neutral-500">{clipes.r.erro === "limite" ? "Muitas buscas nesta hora. Tente de novo daqui a pouco." : "Não consegui buscar os clipes agora."}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {(clipes?.r.clipes ?? []).map((c) => (
                  <CartaoClipe key={c.id} clipe={c} desligado={!podeMais} aoEscolher={() => porClipe(c)} />
                ))}
                {carregandoClipes && Array.from({ length: 6 }, (_, k) => <span key={`c${k}`} className="aspect-square animate-pulse rounded-lg bg-neutral-800/60" />)}
              </div>
              {!carregandoClipes && clipes?.r.clipes.length === 0 && <p className="text-[11px] text-neutral-500">Nenhum clipe com “{termoClipes}”. Tente outra palavra: rindo, aplaudindo, cachorro.</p>}
              {!carregandoClipes && clipes?.r.temMais && (
                <button type="button" onClick={() => setPagina((n) => n + 1)} className="mt-2 w-full rounded-lg border border-neutral-200 py-1.5 text-xs text-neutral-600 hover:border-neutral-400">
                  Mais clipes
                </button>
              )}
              <p className="mt-1.5 text-[10px] leading-snug text-neutral-400">{AVISO_PEXELS} Toque pra pôr; no computador, passe o mouse pra ver.</p>
            </>
          )}
        </div>
      )}

      {/* ---------- adesivos 3D / GIFs ---------- */}
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs font-semibold text-neutral-700">{(gifs ? "Emojis animados" : "Adesivos") + (buscando ? ` · ${adesivos.length}` : "")}</p>
      </div>
      {!buscando && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <Chip ativo={categoria === "todos"} onClick={() => setCategoria("todos")}>
            Todos
          </Chip>
          {categorias.map((c) => (
            <Chip key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
              {c.rotulo}
            </Chip>
          ))}
        </div>
      )}
      {adesivos.length === 0 ? (
        <p className="mb-3 text-xs text-neutral-500">
          {gifs ? `Nenhum GIF com “${busca}”. Tente rir, uau, palmas, amor, festa.` : `Nenhum adesivo com “${busca}”. Tente casa, chave, dinheiro, praia, rindo.`}
        </p>
      ) : (
        <div className="mb-4 grid max-h-[300px] grid-cols-5 gap-1 overflow-y-auto pr-1">
          {adesivos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => porAdesivo(a.id)}
              disabled={!podeMais}
              title={a.rotulo}
              aria-label={`Pôr ${a.rotulo}`}
              className="rounded-lg p-1 transition hover:bg-neutral-100 disabled:opacity-40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlDaMiniatura(a.id)} alt="" loading="lazy" className="aspect-square w-full" draggable={false} />
            </button>
          ))}
        </div>
      )}
      {gifs && <p className="-mt-2 mb-3 text-[10px] text-neutral-400">{CREDITO_GIFS}</p>}

      {/* ---------- peças que carregam dado ---------- */}
      {!buscando &&
        !gifs &&
        CATEGORIAS_DESENHADAS.map((cat) => (
          <div key={cat} className="mb-3">
            <p className="mb-1 text-xs font-semibold text-neutral-700">{ROTULO_DESENHADA[cat]}</p>
            {cat === "ficha" && itensDaFicha.length === 0 && (
              <p className="mb-1.5 text-[11px] text-neutral-500">Sem quartos, vagas nem metragem no cadastro deste imóvel: sai com números de exemplo.</p>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {MODELOS_ELEMENTO.filter((m) => m.categoria === cat).map((m) => (
                <CartaoDesenhado
                  key={m.id}
                  id={m.id}
                  cor={cor}
                  itens={itensDaFicha}
                  escolhido={elementos.some((e) => e.id === m.id)}
                  desligado={!podeMais}
                  aoEscolher={() =>
                    podeMais &&
                    aoAdicionar({
                      id: m.id,
                      ...(m.usa === "texto" ? { texto: m.exemplo ?? "" } : {}),
                      ...(m.usa === "ficha" ? { itens: itensDaFicha.length ? itensDaFicha : FICHA_EXEMPLO } : {}),
                      ancora: m.ancora,
                      cor,
                      animacao: "nenhuma",
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
