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
} from "@/lib/video";

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

/** Como o cartão desenha a prévia de um estilo. Espelha `filtrosDeTexto` no servidor. */
function amostra(estilo: string, texto: string, pequeno = false) {
  const est = ESTILO_TEXTO_POR_ID[estilo as keyof typeof ESTILO_TEXTO_POR_ID] ?? ESTILO_TEXTO_POR_ID.faixa;
  // A altura de referência do vídeo é 1920; o cartão tem uns 60px de área útil. O fator
  // aproxima o tamanho relativo sem fingir precisão que a prévia não tem.
  const corpo = Math.max(9, Math.min(pequeno ? 15 : 22, Math.round(est.tamanho * (pequeno ? 420 : 620))));
  const cor = "#" + est.cor.replace("0x", "");
  const base: React.CSSProperties = { fontSize: corpo, fontWeight: 600, lineHeight: 1.15, whiteSpace: "nowrap" };
  if (est.fundo === "caixa") {
    return { ...base, color: "#fff", background: cor, padding: `${Math.round(corpo * 0.3)}px ${Math.round(corpo * 0.55)}px`, borderRadius: 4 };
  }
  if (est.fundo === "contorno") {
    return { ...base, color: "#fff", WebkitTextStroke: `${Math.max(1, Math.round(corpo * 0.08))}px #000`, paintOrder: "stroke fill" as const };
  }
  return { ...base, color: "#fff", textShadow: `${Math.max(1, Math.round(corpo * 0.07))}px ${Math.max(1, Math.round(corpo * 0.07))}px 0 rgba(0,0,0,.75)` };
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

  const por = (m: ModeloTexto) => aoAdicionar({ texto: m.texto, estilo: m.estilo, posicao: m.posicao, animacao: m.animacao });

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
                    <span style={amostra(p.id === "preco" ? "gigante" : "faixa", p.texto, true)} className="max-w-full truncate">
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
                <span style={amostra(m.estilo, m.texto, true)} className="max-w-full truncate">
                  {m.texto}
                </span>
              </button>
            ))}
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
                  <span style={amostra(e.id, e.rotulo, true)} className="max-w-full truncate">
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
