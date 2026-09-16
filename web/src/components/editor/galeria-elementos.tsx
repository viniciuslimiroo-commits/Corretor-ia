"use client";

import { useMemo, useState } from "react";
import {
  ANCORAS,
  CATEGORIAS_ELEMENTO,
  ELEMENTO_POR_ID,
  FICHA_EXEMPLO,
  MODELOS_ELEMENTO,
  type AncoraElemento,
  type CategoriaElemento,
  type IconeFicha,
} from "@/lib/elementos";
import { LIMITES, type ElementoCena } from "@/lib/video";
import { Chip, Icone } from "@/components/ui";

// A GALERIA DE ELEMENTOS: o cartão é a peça, não um desenho parecido com ela.
//
// Cada cartão põe na tela o MESMO SVG que o servidor vai rasterizar e sobrepor no vídeo.
// Não há uma segunda versão "de prévia" pra divergir da de verdade -- e divergir é o que
// toda prévia desenhada à parte acaba fazendo, calada, três meses depois.
//
// A categoria "Ficha do imóvel" vem primeiro de propósito. É a razão de a aba existir:
// adesivo bonito qualquer editor tem; "3 quartos · 2 vagas · 120 m²" desenhado, certo e
// preenchido do cadastro é o que um corretor não monta sozinho no celular.

/** Desenha um modelo num quadro de prévia e devolve o SVG pronto pra injetar. */
function previa(id: string, texto: string, itens: { icone: IconeFicha; texto: string }[], cor: string, larguraMax: number) {
  const modelo = ELEMENTO_POR_ID[id];
  if (!modelo) return null;
  // O quadro de prévia é um 9:16 pequeno: as peças de quadro inteiro (moldura, cantos)
  // precisam de um W e um H pra existir, e as outras se dimensionam pela altura como no
  // vídeo. Assim o cartão mostra a proporção real da peça dentro do quadro.
  const H = 220;
  const W = Math.round((H * 9) / 16);
  const alt = Math.max(12, Math.round(H * modelo.corpo));
  const d = modelo.desenhar({ texto: texto || modelo.exemplo || "", itens: itens.length ? itens : FICHA_EXEMPLO, cor }, { alt, W, H });
  const escala = Math.min(1, larguraMax / d.largura);
  return { svg: d.svg, largura: Math.round(d.largura * escala), altura: Math.round(d.altura * escala) };
}

function Cartao({
  id,
  rotulo,
  texto,
  itens,
  cor,
  escolhido,
  aoEscolher,
}: {
  id: string;
  rotulo: string;
  texto: string;
  itens: { icone: IconeFicha; texto: string }[];
  cor: string;
  escolhido: boolean;
  aoEscolher: () => void;
}) {
  const p = useMemo(() => previa(id, texto, itens, cor, 168), [id, texto, itens, cor]);
  return (
    <button
      type="button"
      onClick={aoEscolher}
      title={rotulo}
      className={
        "flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 transition " +
        (escolhido ? "border-marca-indigo bg-marca-indigo/5" : "border-neutral-200 hover:border-neutral-400")
      }
    >
      {/* O fundo escuro é o do vídeo: peça branca sobre cartão branco some, e a pessoa
          escolheria no escuro -- literalmente. */}
      <span className="flex h-[74px] w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-800">
        {p ? (
          <span
            className="flex items-center justify-center"
            style={{ width: p.largura, height: p.altura }}
            // O SVG vem do catálogo do próprio produto e o texto passa por `escaparSvg`
            // antes de entrar nele; não há conteúdo de terceiro nesta string.
            dangerouslySetInnerHTML={{ __html: p.svg.replace("<svg ", `<svg style="width:100%;height:100%" `) }}
          />
        ) : null}
      </span>
      <span className="text-[11px] leading-tight text-neutral-600">{rotulo}</span>
    </button>
  );
}

export default function GaleriaElementos({
  elementos,
  itensDaFicha,
  cor,
  podeMais,
  aoAdicionar,
  aoMudar,
  aoTirar,
}: {
  elementos: ElementoCena[];
  /** Os dados do imóvel, já em palavra. Vazio quando não há imóvel escolhido. */
  itensDaFicha: { icone: IconeFicha; texto: string }[];
  cor: string;
  podeMais: boolean;
  aoAdicionar: (e: ElementoCena) => void;
  aoMudar: (i: number, mudanca: Partial<ElementoCena>) => void;
  aoTirar: (i: number) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaElemento>("ficha");

  const daCategoria = MODELOS_ELEMENTO.filter((m) => m.categoria === categoria);
  const semFicha = itensDaFicha.length === 0;

  return (
    <div>
      {/* ---------- o que já está na cena ---------- */}
      {elementos.length > 0 && (
        <div className="mb-3 rounded-lg bg-neutral-50 p-2.5">
          <p className="text-xs font-medium text-neutral-600">Nesta cena</p>
          {elementos.map((e, i) => {
            const modelo = ELEMENTO_POR_ID[e.id];
            if (!modelo) return null;
            return (
              <div key={i} className="mt-2 rounded-lg border border-neutral-200 bg-white p-2">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">{modelo.rotulo}</span>
                  <button onClick={() => aoTirar(i)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Tirar esta peça">
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                </div>

                {modelo.usa === "texto" && (
                  <input
                    type="text"
                    value={e.texto ?? ""}
                    onChange={(ev) => aoMudar(i, { texto: ev.target.value })}
                    maxLength={LIMITES.elementoTextoMax}
                    placeholder={modelo.exemplo}
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm focus:border-marca-indigo focus:outline-none"
                  />
                )}

                {/* Moldura vale o quadro inteiro: escolher canto pra ela não quer dizer
                    nada, então o seletor nem aparece. */}
                {!modelo.quadroInteiro && (
                  <select
                    value={e.ancora ?? modelo.ancora}
                    onChange={(ev) => aoMudar(i, { ancora: ev.target.value as AncoraElemento })}
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs focus:border-marca-indigo focus:outline-none"
                  >
                    {ANCORAS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.rotulo}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- categorias ---------- */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIAS_ELEMENTO.map((c) => (
          <Chip key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)} title={c.para}>
            {c.rotulo}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">{CATEGORIAS_ELEMENTO.find((c) => c.id === categoria)?.para}</p>

      {categoria === "ficha" && semFicha && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          Este imóvel ainda não tem quartos, vagas nem metragem no cadastro. As peças abaixo entram com números de exemplo — preencha a ficha
          do imóvel pra elas saírem certas.
        </p>
      )}

      {/* ---------- a prateleira ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {daCategoria.map((m) => (
          <Cartao
            key={m.id}
            id={m.id}
            rotulo={m.rotulo}
            texto={m.exemplo ?? ""}
            itens={itensDaFicha}
            cor={cor}
            escolhido={elementos.some((e) => e.id === m.id)}
            aoEscolher={() => {
              if (!podeMais) return;
              aoAdicionar({
                id: m.id,
                ...(m.usa === "texto" ? { texto: m.exemplo ?? "" } : {}),
                ...(m.usa === "ficha" ? { itens: itensDaFicha.length ? itensDaFicha : FICHA_EXEMPLO } : {}),
                ancora: m.ancora,
                cor,
                animacao: "nenhuma",
              });
            }}
          />
        ))}
      </div>

      {!podeMais && elementos.length >= LIMITES.elementosPorCena && (
        <p className="mt-2 text-[11px] text-neutral-500">{LIMITES.elementosPorCena} peças já é o limite desta cena.</p>
      )}
    </div>
  );
}
