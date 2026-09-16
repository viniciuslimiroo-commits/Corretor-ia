"use client";

import { useState } from "react";
import {
  ANIMACOES_TEXTO,
  CATEGORIAS_TEXTO,
  ESTILOS_TEXTO,
  ESTILO_TEXTO_POR_ID,
  MODELOS_TEXTO,
  type CategoriaTexto,
  type ModeloTexto,
  type TextoCena,
  type VisualTexto,
} from "@/lib/video";
import { MODELOS_ARTE } from "@/lib/texto-arte";

// A GALERIA DE TEXTO: escolher vendo, não lendo uma lista de nomes.
//
// Cada cartão mostra a frase COM o acabamento que ela vai ter no vídeo -- fundo na cor da
// marca, contorno preto, sombra, tamanho relativo. A régua é simples: se o cartão parece
// com o que sai, ninguém precisa gerar o vídeo pra descobrir que escolheu errado.
//
// As frases são de imóvel, não de rede social genérica. "Aceita FGTS", "Últimas unidades",
// "Pronto pra morar" são o que um corretor escreve todo dia; "Thug life" e "Vlog" não
// entram num anúncio de apartamento.
//
// O que NÃO está aqui de propósito: preço, quartos, área, vagas. Esses vêm das PEÇAS do
// imóvel, já preenchidos do cadastro. Modelo com preço fixo seria pedir pra digitar de
// novo o que já existe -- e pra alguém esquecer de trocar antes de publicar.

/**
 * O cartão desenha o texto com o MESMO acabamento que o servidor vai dar.
 *
 * Lê os mesmos campos de `visual` que o `filtrosDeTexto` lê. Enquanto o cartão mostrava
 * só o estilo base, metade da galeria ficava igual -- vinte caixas azuis com palavras
 * diferentes não é galeria, é lista com fundo.
 */
function amostra(estilo: string, visual: VisualTexto | undefined, pequeno = false): React.CSSProperties {
  const est = ESTILO_TEXTO_POR_ID[estilo as keyof typeof ESTILO_TEXTO_POR_ID] ?? ESTILO_TEXTO_POR_ID.faixa;
  const v = visual ?? {};
  const fracao = v.tamanho ?? est.tamanho;
  const corpo = Math.max(9, Math.min(pequeno ? 16 : 24, Math.round(fracao * (pequeno ? 400 : 600))));
  const cor = "#" + (v.cor ?? "ffffff");
  const temCaixa = v.caixa !== undefined ? v.caixa !== null : est.fundo === "caixa";
  const temContorno = v.contorno !== undefined ? v.contorno !== null : est.fundo === "contorno";
  const base: React.CSSProperties = { fontSize: corpo, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", color: cor };
  if (temCaixa) {
    return {
      ...base,
      background: "#" + (v.caixa ?? est.cor.replace("0x", "")),
      padding: `${Math.round(corpo * 0.26)}px ${Math.round(corpo * 0.5)}px`,
      borderRadius: 4,
      ...(temContorno ? { WebkitTextStroke: `1px #${v.contorno ?? "000000"}`, paintOrder: "stroke fill" as const } : {}),
    };
  }
  if (temContorno) {
    return { ...base, WebkitTextStroke: `${Math.max(1, Math.round(corpo * 0.09))}px #${v.contorno ?? "000000"}`, paintOrder: "stroke fill" as const };
  }
  const d = Math.max(1, Math.round(corpo * 0.07));
  return { ...base, textShadow: `${d}px ${d}px 0 rgba(0,0,0,.7)` };
}

export default function GaleriaTexto({
  pecas,
  aoAdicionar,
  aoTrocarAnimacao,
  animacaoAtual,
  temTextoSelecionado,
  cheio,
  desabilitado,
}: {
  /** Os dados do imóvel já preenchidos: preço, quartos, área. */
  pecas: { id: string; rotulo: string; texto: string }[];
  aoAdicionar: (t: TextoCena) => void;
  /** Aplica uma entrada ao texto que está aberto no painel da cena. */
  aoTrocarAnimacao: (id: string) => void;
  animacaoAtual: string | null;
  temTextoSelecionado: boolean;
  /** A cena já tem o número máximo de textos. */
  cheio: boolean;
  desabilitado?: boolean;
}) {
  const [aba, setAba] = useState<"modelos" | "efeitos">("modelos");
  const [categoria, setCategoria] = useState<CategoriaTexto | "todas">("todas");

  const modelos = MODELOS_TEXTO.filter((m) => categoria === "todas" || m.categoria === categoria);

  const por = (m: ModeloTexto) => aoAdicionar({ texto: m.texto, estilo: m.estilo, posicao: m.posicao, animacao: m.animacao, visual: m.visual });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 border-b border-neutral-200">
        {(["modelos", "efeitos"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={
              "-mb-px border-b-2 px-3 py-1.5 text-sm transition " +
              (aba === a ? "border-marca-coral font-medium text-marca-indigo" : "border-transparent text-neutral-500 hover:text-neutral-700")
            }
          >
            {a === "modelos" ? "Modelos de texto" : "Efeitos de texto"}
          </button>
        ))}
      </div>

      {aba === "modelos" ? (
        <>
          {cheio && <p className="rounded-lg bg-neutral-100 px-2.5 py-2 text-[11px] text-neutral-500">Três textos já é o limite desta cena. Tire um pra pôr outro.</p>}

          {/* ---------- do imóvel ----------
               Primeiro, porque é o que diferencia: já vem preenchido do cadastro, e
               ninguém digita preço duas vezes. */}
          {pecas.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Do imóvel · já preenchido</p>
              <div className="grid grid-cols-2 gap-1.5">
                {pecas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={cheio || desabilitado}
                    onClick={() => aoAdicionar({ texto: p.texto, estilo: p.id === "preco" ? "gigante" : "faixa", posicao: "base", animacao: p.id === "preco" ? "no_fim" : "subir" })}
                    title={`${p.rotulo}: ${p.texto}`}
                    className="grid h-14 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900/90 px-1 transition hover:border-marca-coral disabled:opacity-40"
                  >
                    <span style={amostra(p.id === "preco" ? "gigante" : "faixa", undefined, true)} className="max-w-full truncate">
                      {p.texto}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {(["todas", ...CATEGORIAS_TEXTO.map((c) => c.id)] as const).map((id) => {
              const def = CATEGORIAS_TEXTO.find((c) => c.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategoria(id as CategoriaTexto | "todas")}
                  title={def?.para}
                  className={
                    "shrink-0 rounded-full border px-2.5 py-1 text-xs transition " +
                    (categoria === id ? "border-marca-indigo bg-marca-indigo/10 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                  }
                >
                  {id === "todas" ? "Todos" : def?.rotulo}
                </button>
              );
            })}
          </div>

          {/* ---------- os modelos de ARTE ----------
               Cada cartão desenha o MESMO SVG que o servidor vai rasterizar e sobrepor no
               vídeo. Não é uma imitação do resultado; é o resultado, em tamanho de cartão.
               É isso que separa "modelo de texto" de "cor trocada". */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Modelos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODELOS_ARTE.filter((a) => categoria === "todas" || a.categoria === categoria).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={cheio || desabilitado}
                  onClick={() => aoAdicionar({ texto: a.exemplo, arte: a.id, posicao: "base", animacao: "surgir" })}
                  title={a.exemplo}
                  className="grid h-[74px] place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900/90 p-1 transition hover:border-marca-coral disabled:opacity-40"
                >
                  <span
                    className="block max-w-full [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: a.desenhar(a.exemplo, 34).svg }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Frases prontas</p>
            <div className="grid grid-cols-2 gap-1.5">
              {modelos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={cheio || desabilitado}
                  onClick={() => por(m)}
                  title={`${m.texto} · ${ESTILO_TEXTO_POR_ID[m.estilo].rotulo}`}
                  className="grid h-14 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900/90 px-1 transition hover:border-marca-coral disabled:opacity-40"
                >
                  <span style={amostra(m.estilo, m.visual, true)} className="max-w-full truncate">
                    {m.texto}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={cheio || desabilitado}
            onClick={() => aoAdicionar({ texto: "", estilo: "faixa", posicao: "centro", animacao: "nenhuma" })}
            className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition hover:border-marca-coral disabled:opacity-40"
          >
            + Escrever o meu
          </button>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Acabamentos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ESTILOS_TEXTO.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={cheio || desabilitado}
                  onClick={() => aoAdicionar({ texto: e.rotulo, estilo: e.id, posicao: "base", animacao: "surgir" })}
                  title={e.dica}
                  className="grid h-12 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900/90 px-1 transition hover:border-marca-coral disabled:opacity-40"
                >
                  <span style={amostra(e.id, undefined, true)} className="max-w-full truncate">
                    {e.rotulo}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-neutral-500">
            Como o texto ENTRA na cena. {temTextoSelecionado ? "Vale pro texto aberto no painel da cena." : "Escolha um texto na cena primeiro."}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {ANIMACOES_TEXTO.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={!temTextoSelecionado || desabilitado}
                onClick={() => aoTrocarAnimacao(a.id)}
                title={a.dica}
                className={
                  "rounded-lg border px-2 py-2.5 text-left text-xs transition disabled:opacity-40 " +
                  (animacaoAtual === a.id ? "border-marca-indigo bg-marca-indigo/10 text-marca-indigo" : "border-neutral-200 hover:border-neutral-400")
                }
              >
                <span className="block font-medium">{a.rotulo}</span>
                <span className="block text-[10px] leading-tight text-neutral-500">{a.dica}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
