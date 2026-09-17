"use client";

import { useState } from "react";
import { ANIMACOES_TEXTO, MODELOS_TEXTO, type TextoCena } from "@/lib/video";
import { IDS_EFEITOS_TEXTO, LISTA_EFEITOS_TEXTO, urlDoCartaoDeEfeito } from "@/lib/efeitos-texto/lista";
import TextoComEfeito from "@/components/editor/texto-com-efeito";
import type { CategoriaEfeito } from "@/lib/efeitos-texto/nucleo";
import { MOVIMENTOS, type MovimentoId } from "@/lib/movimentos";

// A GALERIA DE TEXTO, na lógica do CapCut: "Básico" em cima, prateleiras de efeito embaixo.
//
// Foi reprovada duas vezes. A primeira: "não são modelos, é só trocar a cor e a fonte". A
// segunda, depois dos modelos em SVG: "qualidade ruim". A causa das duas era a mesma --
// uma fonte comum pra tudo, desenhada à mão aqui no código.
//
// Agora cada cartão é um PNG desenhado no servidor com FONTE DE VERDADE (Google Fonts,
// licença OFL) transformada em contorno, e com camadas de efeito (contorno duplo, volume,
// neon, ouro, carimbo). O mesmo desenho vai pro palco e pro vídeo -- o cartão não é uma
// imitação do resultado. As receitas foram desenhadas olhando cada uma em foto real de
// imóvel e reprovadas por um crítico independente antes de entrar.

const CATEGORIAS: { id: CategoriaEfeito; rotulo: string }[] = [
  { id: "populares", rotulo: "Populares" },
  { id: "imovel", rotulo: "Imóvel" },
  { id: "classico", rotulo: "Clássico" },
  { id: "brilho", rotulo: "Brilho e neon" },
  { id: "luxo", rotulo: "Luxo" },
  { id: "divertido", rotulo: "Divertido" },
];

/** Quantos cartões uma prateleira mostra antes do "Ver todos". Duas linhas de três. */
const NA_PRATELEIRA = 6;

/**
 * TEXTO ANIMADO pronto: efeito + movimento em laço, o equivalente dos textos-GIF do CapCut
 * ("hi", "I LOVE YOU"). Fica AQUI, com os textos -- na primeira versão estava na aba de
 * GIFs dos Elementos, e ele corrigiu: "isso deveria estar junto com textos". Entra como
 * texto normal da cena, então dá pra reescrever no palco.
 */
const TEXTOS_ANIMADOS = (
  [
    { efeito: "gibi_pop", texto: "UAU!", movimento: "tremer" },
    { efeito: "pop_vermelho", texto: "VENDIDO!", movimento: "pulsar" },
    { efeito: "faixa_oferta", texto: "BAIXOU!", movimento: "balancar" },
    { efeito: "adesivo_recortado", texto: "Oi!", movimento: "quicar" },
    { efeito: "neon_rosa", texto: "Amei", movimento: "pulsar" },
    { efeito: "extrudado_3d", texto: "TOP!", movimento: "quicar" },
    { efeito: "tinta_escorrendo", texto: "Corre!", movimento: "tremer" },
    { efeito: "estrelinhas", texto: "É hoje", movimento: "flutuar" },
    { efeito: "carimbo_vendido", texto: "Vendido", movimento: "tremer" },
    { efeito: "doce_bolinhas", texto: "Kkkkk", movimento: "quicar" },
    { efeito: "placa_imovel", texto: "Link na bio", movimento: "balancar" },
    { efeito: "etiqueta_preco", texto: "Oferta", movimento: "balancar" },
  ] as { efeito: string; texto: string; movimento: MovimentoId }[]
).filter((t) => IDS_EFEITOS_TEXTO.has(t.efeito));

export default function GaleriaTexto({
  pecas,
  aoAdicionar,
  aoTrocarAnimacao,
  animacaoAtual,
  aoTrocarMovimento,
  movimentoAtual,
  ultimoTemEfeito,
  temTextoSelecionado,
  cheio,
  desabilitado,
}: {
  /** Os dados do imóvel já preenchidos: preço, quartos, área. */
  pecas: { id: string; rotulo: string; texto: string }[];
  aoAdicionar: (t: TextoCena) => void;
  /** Aplica uma entrada ao último texto da cena. */
  aoTrocarAnimacao: (id: string) => void;
  animacaoAtual: string | null;
  /** Aplica um movimento em laço ao último texto da cena. */
  aoTrocarMovimento: (id: MovimentoId) => void;
  movimentoAtual: MovimentoId;
  /** O último texto tem efeito (é imagem): só assim ele pode girar e crescer. */
  ultimoTemEfeito: boolean;
  temTextoSelecionado: boolean;
  /** A cena já tem o número máximo de textos. */
  cheio: boolean;
  desabilitado?: boolean;
}) {
  const [aba, setAba] = useState<"efeitos" | "animacao">("efeitos");
  const [categoria, setCategoria] = useState<CategoriaEfeito | "todos">("todos");
  const [abertas, setAbertas] = useState<Set<CategoriaEfeito>>(new Set());

  const bloqueado = cheio || !!desabilitado;
  const presentes = CATEGORIAS.filter((c) => LISTA_EFEITOS_TEXTO.some((e) => e.categoria === c.id));
  const visiveis = categoria === "todos" ? presentes : presentes.filter((c) => c.id === categoria);

  // Nasce no meio e ENTRA: título parado desde o primeiro quadro parece carimbado na foto.
  const porEfeito = (id: string, amostra: string) => aoAdicionar({ texto: amostra, arte: id, posicao: "centro", animacao: "surgir" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 border-b border-neutral-200">
        {(["efeitos", "animacao"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={
              "-mb-px border-b-2 px-3 py-1.5 text-sm transition " +
              (aba === a ? "border-marca-coral font-medium text-marca-indigo" : "border-transparent text-neutral-500 hover:text-neutral-700")
            }
          >
            {a === "efeitos" ? "Efeitos de texto" : "Animação"}
          </button>
        ))}
      </div>

      {aba === "efeitos" ? (
        <>
          {cheio && <p className="rounded-lg bg-neutral-100 px-2.5 py-2 text-[11px] text-neutral-500">Três textos já é o limite desta cena. Tire um pra pôr outro.</p>}

          {/* ---------- básico ---------- */}
          <div className="grid gap-1.5">
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => aoAdicionar({ texto: "Seu título", estilo: "gigante", posicao: "centro", animacao: "surgir" })}
              className="rounded-lg bg-neutral-100 px-3 py-2.5 text-base font-bold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40"
            >
              Adicionar título
            </button>
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => aoAdicionar({ texto: "Seu texto", estilo: "faixa", posicao: "base", animacao: "nenhuma" })}
              className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40"
            >
              Adicionar texto
            </button>
            <p className="text-[11px] text-neutral-500">Depois de pôr, toque no texto no palco pra escrever.</p>
          </div>

          {/* ---------- do imóvel ----------
               Primeiro das prateleiras, porque é o que nenhum editor genérico tem: já vem
               preenchido do cadastro, e ninguém digita o preço duas vezes. */}
          {pecas.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-700">Do imóvel · já preenchido</p>
              <div className="flex flex-wrap gap-1.5">
                {pecas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={bloqueado}
                    onClick={() => aoAdicionar({ texto: p.texto, estilo: p.id === "preco" ? "gigante" : "faixa", posicao: "base", animacao: p.id === "preco" ? "no_fim" : "subir" })}
                    title={p.rotulo}
                    className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 transition hover:border-marca-coral disabled:opacity-40"
                  >
                    {p.texto}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---------- texto animado ----------
               Antes das prateleiras de efeito parado: é o que mais se parece com os
               textos-GIF que ele mostrou do CapCut. */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-neutral-700">Texto animado</p>
              <span className="text-[10px] text-neutral-500">se mexe sem parar, como GIF</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXTOS_ANIMADOS.map((t) => (
                <button
                  key={`${t.efeito}-${t.texto}`}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => aoAdicionar({ texto: t.texto, arte: t.efeito, posicao: "centro", animacao: "surgir", movimento: t.movimento })}
                  aria-label={`Pôr texto animado ${t.texto}`}
                  className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900 p-2 transition hover:border-marca-coral disabled:opacity-40"
                >
                  <TextoComEfeito efeito={t.efeito} texto={t.texto} formato="9:16" n={0} movimento={t.movimento} caber />
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {([{ id: "todos", rotulo: "Todos" }, ...presentes] as { id: CategoriaEfeito | "todos"; rotulo: string }[]).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoria(c.id)}
                className={
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs transition " +
                  (categoria === c.id ? "border-marca-indigo bg-marca-indigo/10 text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                }
              >
                {c.rotulo}
              </button>
            ))}
          </div>

          {/* ---------- prateleiras ---------- */}
          {visiveis.map((c) => {
            const todos = LISTA_EFEITOS_TEXTO.filter((e) => e.categoria === c.id);
            const aberta = categoria !== "todos" || abertas.has(c.id);
            const mostrados = aberta ? todos : todos.slice(0, NA_PRATELEIRA);
            return (
              <div key={c.id}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-xs font-semibold text-neutral-700">{c.rotulo}</p>
                  {categoria === "todos" && todos.length > NA_PRATELEIRA && (
                    <button
                      type="button"
                      onClick={() =>
                        setAbertas((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      className="text-[11px] text-neutral-500 hover:text-neutral-700"
                    >
                      {aberta ? "Ver menos" : `Ver todos (${todos.length})`}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {mostrados.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => porEfeito(e.id, e.amostra)}
                      title={e.rotulo}
                      aria-label={`Pôr texto ${e.rotulo}`}
                      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900 transition hover:border-marca-coral disabled:opacity-40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlDoCartaoDeEfeito(e.id)} alt="" loading="lazy" className="aspect-square w-full object-contain p-1" draggable={false} />
                      <span className="truncate px-1 pb-1 text-[10px] text-neutral-400 group-hover:text-neutral-200">{e.rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* ---------- frases prontas ----------
               Fechado: é atalho de TEXTO (o que escrever), não de efeito. Aberto, empurraria
               as prateleiras pra baixo da dobra no celular. */}
          <details className="rounded-lg border border-neutral-200 px-2.5 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Frases prontas de anúncio</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODELOS_TEXTO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => aoAdicionar({ texto: m.texto, estilo: m.estilo, posicao: m.posicao, animacao: m.animacao, visual: m.visual })}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 transition hover:border-marca-coral disabled:opacity-40"
                >
                  {m.texto}
                </button>
              ))}
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="text-[11px] text-neutral-500">
            {temTextoSelecionado ? "Vale pro último texto posto nesta cena." : "Ponha um texto na cena primeiro."}
          </p>
          <p className="text-xs font-semibold text-neutral-700">Entrada</p>
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

          {/* ---------- em laço ----------
               Depois de entrar, fica se mexendo: é o que faz o texto parecer GIF. Só pra
               texto com efeito, que entra no vídeo como imagem -- o texto simples é
               desenhado letra por letra pelo ffmpeg, que não gira nem cresce. */}
          <p className="mt-1 text-xs font-semibold text-neutral-700">Em laço, como GIF</p>
          {temTextoSelecionado && !ultimoTemEfeito && (
            <p className="-mt-1 text-[11px] text-neutral-500">Escolha um efeito de texto pra ele poder se mexer.</p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {MOVIMENTOS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!temTextoSelecionado || !ultimoTemEfeito || desabilitado}
                onClick={() => aoTrocarMovimento(m.id)}
                title={m.dica}
                className={
                  "rounded-lg border px-2 py-2 text-center text-xs transition disabled:opacity-40 " +
                  (movimentoAtual === m.id ? "border-marca-indigo bg-marca-indigo/10 font-medium text-marca-indigo" : "border-neutral-200 hover:border-neutral-400")
                }
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
