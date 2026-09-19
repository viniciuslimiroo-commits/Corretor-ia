"use client";

import { useState } from "react";
import { ANIMACOES_TEXTO, MODELOS_TEXTO, type TextoCena } from "@/lib/video";
import { IDS_EFEITOS_TEXTO, LISTA_EFEITOS_TEXTO, urlDoCartaoDeEfeito } from "@/lib/efeitos-texto/lista";
import TextoComEfeito from "@/components/editor/texto-com-efeito";
import { BotaoEd, CartaoOpcao, Nota, Pilula, Segmentado } from "@/components/editor/ui-editor";
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
  aba: abaDeFora,
  aoMudarAba,
  indiceAlvo,
}: {
  /** Os dados do imóvel já preenchidos: preço, quartos, área. */
  pecas: { id: string; rotulo: string; texto: string }[];
  aoAdicionar: (t: TextoCena) => void;
  /** Aplica uma entrada ao último texto da cena (ou ao `indiceAlvo`, quando vem). */
  aoTrocarAnimacao: (id: string, indice?: number) => void;
  animacaoAtual: string | null;
  /** Aplica um movimento em laço ao último texto da cena (ou ao `indiceAlvo`). */
  aoTrocarMovimento: (id: MovimentoId, indice?: number) => void;
  movimentoAtual: MovimentoId;
  /** O último texto tem efeito (é imagem): só assim ele pode girar e crescer. */
  ultimoTemEfeito: boolean;
  temTextoSelecionado: boolean;
  /** A cena já tem o número máximo de textos. */
  cheio: boolean;
  desabilitado?: boolean;
  /**
   * Linha do tempo (P6), tudo opcional. `aba` controlada de fora: o botão "Animação" da
   * barra da seleção abre direto nela. `indiceAlvo`: o texto que a animação muda -- o
   * SELECIONADO, e não o último da cena. Sem ele, continua valendo o último.
   */
  aba?: "efeitos" | "animacao";
  aoMudarAba?: (aba: "efeitos" | "animacao") => void;
  indiceAlvo?: number;
}) {
  const [abaAqui, setAbaAqui] = useState<"efeitos" | "animacao">("efeitos");
  const aba = abaDeFora ?? abaAqui;
  const setAba = (a: "efeitos" | "animacao") => {
    setAbaAqui(a);
    aoMudarAba?.(a);
  };
  const [categoria, setCategoria] = useState<CategoriaEfeito | "todos">("todos");
  const [abertas, setAbertas] = useState<Set<CategoriaEfeito>>(new Set());

  const bloqueado = cheio || !!desabilitado;
  const presentes = CATEGORIAS.filter((c) => LISTA_EFEITOS_TEXTO.some((e) => e.categoria === c.id));
  const visiveis = categoria === "todos" ? presentes : presentes.filter((c) => c.id === categoria);

  // Nasce no meio e ENTRA: título parado desde o primeiro quadro parece carimbado na foto.
  const porEfeito = (id: string, amostra: string) => aoAdicionar({ texto: amostra, arte: id, posicao: "centro", animacao: "surgir" });

  const tituloDaPrateleira = "text-[13px] font-semibold text-[var(--ed-texto)]";
  const cartaoDeEfeito = "group flex flex-col overflow-hidden rounded-xl bg-[#0b1426] ring-1 ring-inset ring-white/[0.06] transition hover:ring-2 hover:ring-[var(--ed-acento)] active:scale-[0.98] disabled:opacity-40";

  return (
    <div className="flex flex-col gap-5">
      <Segmentado
        rotulo="Efeitos ou animação"
        opcoes={[
          { id: "efeitos", rotulo: "Efeitos de texto" },
          { id: "animacao", rotulo: "Animação" },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      {aba === "efeitos" ? (
        <>
          {cheio && <Nota tipo="atencao">Três textos já é o limite desta cena. Tire um pra pôr outro.</Nota>}

          {/* ---------- básico ---------- */}
          <div className="flex flex-col gap-2">
            <BotaoEd tamanho="g" disabled={bloqueado} onClick={() => aoAdicionar({ texto: "Seu título", estilo: "gigante", posicao: "centro", animacao: "surgir" })} className="w-full text-[17px] font-bold">
              Adicionar título
            </BotaoEd>
            <BotaoEd disabled={bloqueado} onClick={() => aoAdicionar({ texto: "Seu texto", estilo: "faixa", posicao: "base", animacao: "nenhuma" })} className="w-full">
              Adicionar texto
            </BotaoEd>
            <p className="text-[12px] text-[var(--ed-texto-3)]">Depois de pôr, toque no texto em cima do vídeo pra escrever.</p>
          </div>

          {/* ---------- do imóvel ----------
               Primeiro das prateleiras, porque é o que nenhum editor genérico tem: já vem
               preenchido do cadastro, e ninguém digita o preço duas vezes. */}
          {pecas.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className={tituloDaPrateleira}>Do imóvel · já preenchido</p>
              <div className="flex flex-wrap gap-2">
                {pecas.map((p) => (
                  <Pilula key={p.id} icone="mais" disabled={bloqueado} onClick={() => aoAdicionar({ texto: p.texto, estilo: p.id === "preco" ? "gigante" : "faixa", posicao: "base", animacao: p.id === "preco" ? "no_fim" : "subir" })} title={p.rotulo}>
                    {p.texto}
                  </Pilula>
                ))}
              </div>
            </div>
          )}

          {/* ---------- texto animado ----------
               Antes das prateleiras de efeito parado: é o que mais se parece com os
               textos-GIF que ele mostrou do CapCut. */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className={tituloDaPrateleira}>Texto animado</p>
              <span className="text-[11.5px] text-[var(--ed-texto-3)]">se mexe sem parar, como GIF</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TEXTOS_ANIMADOS.map((t) => (
                <button
                  key={`${t.efeito}-${t.texto}`}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => aoAdicionar({ texto: t.texto, arte: t.efeito, posicao: "centro", animacao: "surgir", movimento: t.movimento })}
                  aria-label={`Pôr texto animado ${t.texto}`}
                  className={cartaoDeEfeito + " aspect-square items-center justify-center p-2"}
                >
                  <TextoComEfeito efeito={t.efeito} texto={t.texto} formato="9:16" n={0} movimento={t.movimento} caber />
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([{ id: "todos", rotulo: "Todos" }, ...presentes] as { id: CategoriaEfeito | "todos"; rotulo: string }[]).map((c) => (
              <Pilula key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.rotulo}
              </Pilula>
            ))}
          </div>

          {/* ---------- prateleiras ---------- */}
          {visiveis.map((c) => {
            const todos = LISTA_EFEITOS_TEXTO.filter((e) => e.categoria === c.id);
            const aberta = categoria !== "todos" || abertas.has(c.id);
            const mostrados = aberta ? todos : todos.slice(0, NA_PRATELEIRA);
            return (
              <div key={c.id} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={tituloDaPrateleira}>{c.rotulo}</p>
                  {categoria === "todos" && todos.length > NA_PRATELEIRA && (
                    <BotaoEd
                      variante="fantasma"
                      tamanho="p"
                      onClick={() =>
                        setAbertas((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    >
                      {aberta ? "Ver menos" : `Ver todos (${todos.length})`}
                    </BotaoEd>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {mostrados.map((e) => (
                    <button key={e.id} type="button" disabled={bloqueado} onClick={() => porEfeito(e.id, e.amostra)} title={e.rotulo} aria-label={`Pôr texto ${e.rotulo}`} className={cartaoDeEfeito}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlDoCartaoDeEfeito(e.id)} alt="" loading="lazy" className="aspect-square w-full object-contain p-1.5" draggable={false} />
                      <span className="truncate px-1.5 pb-1.5 text-[11px] text-[var(--ed-texto-3)] group-hover:text-[var(--ed-texto)]">{e.rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* ---------- frases prontas ----------
               Fechado: é atalho de TEXTO (o que escrever), não de efeito. Aberto, empurraria
               as prateleiras pra baixo da dobra no celular. */}
          <details className="group rounded-2xl bg-[var(--ed-elevado)] px-3.5 py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-[var(--ed-texto)]">
              Frases prontas de anúncio
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--ed-texto-3)] transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="flex flex-wrap gap-2 pb-3">
              {MODELOS_TEXTO.map((m) => (
                <Pilula key={m.id} disabled={bloqueado} onClick={() => aoAdicionar({ texto: m.texto, estilo: m.estilo, posicao: m.posicao, animacao: m.animacao, visual: m.visual })}>
                  {m.texto}
                </Pilula>
              ))}
            </div>
          </details>
        </>
      ) : (
        <>
          <Nota>{temTextoSelecionado ? (indiceAlvo !== undefined ? "Vale pro texto escolhido." : "Vale pro último texto posto nesta cena.") : "Ponha um texto na cena primeiro."}</Nota>
          <div className="flex flex-col gap-2.5">
            <p className={tituloDaPrateleira}>Entrada</p>
            <div className="grid grid-cols-2 gap-2">
              {ANIMACOES_TEXTO.map((a) => (
                <CartaoOpcao key={a.id} ativo={animacaoAtual === a.id} disabled={!temTextoSelecionado || desabilitado} onClick={() => (indiceAlvo !== undefined ? aoTrocarAnimacao(a.id, indiceAlvo) : aoTrocarAnimacao(a.id))} title={a.dica} titulo={a.rotulo} descricao={a.dica} />
              ))}
            </div>
          </div>

          {/* ---------- em laço ----------
               Depois de entrar, fica se mexendo: é o que faz o texto parecer GIF. Só pra
               texto com efeito, que entra no vídeo como imagem -- o texto simples é
               desenhado letra por letra pelo ffmpeg, que não gira nem cresce. */}
          <div className="flex flex-col gap-2.5">
            <p className={tituloDaPrateleira}>Em laço, como GIF</p>
            {temTextoSelecionado && !ultimoTemEfeito && <p className="-mt-1 text-[12px] text-[var(--ed-texto-3)]">Escolha um efeito de texto pra ele poder se mexer.</p>}
            <div className="flex flex-wrap gap-2">
              {MOVIMENTOS.map((m) => (
                <Pilula key={m.id} ativo={movimentoAtual === m.id} disabled={!temTextoSelecionado || !ultimoTemEfeito || desabilitado} onClick={() => (indiceAlvo !== undefined ? aoTrocarMovimento(m.id, indiceAlvo) : aoTrocarMovimento(m.id))} title={m.dica}>
                  {m.rotulo}
                </Pilula>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
