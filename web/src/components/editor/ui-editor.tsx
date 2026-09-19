"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icone } from "@/components/ui";

// AS PEÇAS DE INTERFACE DO EDITOR (revisão de 2026-09).
//
// O editor usava os componentes do resto do site (Cartao, Chip, Botao) repintados de
// escuro por CSS: cartão com borda e sombra dentro de painel com borda, chips de 26px,
// rótulos em caixa alta de 11px. Parecia um sistema administrativo antigo -- e em parte
// era, porque as peças tinham sido feitas pra formulário claro.
//
// Aqui as peças são do editor: sem moldura em volta de tudo (a separação é o espaço e a
// camada de profundidade -- tokens `--ed-*` em globals.css), cantos arredondados de verdade,
// 36px de alvo no computador e 44 no celular (`max-md:`), e estados claros de repouso,
// passar o mouse, ativo e desligado.

type Filhos = { children?: ReactNode };

/** Um assunto do painel: título curto, uma linha de explicação e o conteúdo. Sem caixa. */
export function Secao({ titulo, descricao, acao, children, className = "" }: Filhos & { titulo?: ReactNode; descricao?: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {(titulo || acao) && (
        <header className="flex min-h-7 items-center justify-between gap-2">
          {titulo && <h3 className="text-[13px] font-semibold tracking-[0.01em] text-[var(--ed-texto)]">{titulo}</h3>}
          {acao}
        </header>
      )}
      {descricao && <p className="-mt-1.5 text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">{descricao}</p>}
      {children}
    </section>
  );
}

/** Linha fina entre assuntos, quando o espaço sozinho não basta. */
export function Divisor({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-[var(--ed-linha)] ${className}`} />;
}

/** Opção redonda (chip): escolher uma entre várias, ou ligar um detalhe. */
export function Pilula({ ativo, onClick, children, title, disabled, icone, className = "" }: Filhos & { ativo?: boolean; onClick?: () => void; title?: string; disabled?: boolean; icone?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={ativo}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition max-md:h-10 disabled:cursor-not-allowed disabled:opacity-40 ${
        ativo
          ? "bg-[var(--ed-acento-suave)] text-[var(--ed-acento-forte)] ring-1 ring-inset ring-[rgb(240_107_79/0.55)]"
          : "bg-[var(--ed-elevado)] text-[var(--ed-texto-2)] hover:bg-[var(--ed-elevado-2)] hover:text-[var(--ed-texto)]"
      } ${className}`}
    >
      {icone && <Icone nome={icone} className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

/** Escolha entre 2 a 4 modos, lado a lado (ex.: Fotos | Vídeos). */
export function Segmentado<T extends string>({ opcoes, valor, aoMudar, className = "", rotulo }: { opcoes: { id: T; rotulo: ReactNode; icone?: string; dica?: string }[]; valor: T; aoMudar(v: T): void; className?: string; rotulo?: string }) {
  return (
    <div role="tablist" aria-label={rotulo} className={`flex gap-1 rounded-xl bg-[var(--ed-elevado)] p-1 ${className}`}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            title={o.dica}
            onClick={() => aoMudar(o.id)}
            className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition max-md:h-10 ${
              ativo ? "bg-[var(--ed-elevado-2)] text-[var(--ed-texto)] shadow-[var(--ed-sombra-1)]" : "text-[var(--ed-texto-2)] hover:text-[var(--ed-texto)]"
            }`}
          >
            {o.icone && <Icone nome={o.icone} className="h-4 w-4 shrink-0" />}
            <span className="truncate">{o.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}

type VarianteEd = "primaria" | "secundaria" | "fantasma" | "perigo";
const VARIANTES: Record<VarianteEd, string> = {
  primaria: "bg-[var(--ed-acento)] text-white hover:bg-[var(--ed-acento-forte)] shadow-[0_8px_20px_-8px_rgb(240_107_79/0.7)]",
  secundaria: "bg-[var(--ed-elevado)] text-[var(--ed-texto)] ring-1 ring-inset ring-[var(--ed-linha)] hover:bg-[var(--ed-elevado-2)]",
  fantasma: "text-[var(--ed-texto-2)] hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]",
  perigo: "text-[#ff9480] hover:bg-[rgb(255_110_90/0.12)]",
};
const TAMANHOS = { p: "h-9 px-3 text-[13px] max-md:h-10", m: "h-10 px-4 text-[13.5px] max-md:h-11", g: "h-12 px-5 text-[15px]" };

/** Botão com texto. `icone` vem antes do texto. */
export function BotaoEd({ variante = "secundaria", tamanho = "m", icone, children, className = "", ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteEd; tamanho?: keyof typeof TAMANHOS; icone?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      {...resto}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${TAMANHOS[tamanho]} ${VARIANTES[variante]} ${className}`}
    >
      {icone && <Icone nome={icone} className="h-[18px] w-[18px] shrink-0" />}
      {children}
    </button>
  );
}

/** Botão só de ícone, 40px (44 no celular), com nome pra leitor de tela e dica. */
export function BotaoIcone({ rotulo, icone, onClick, ativo, perigo, disabled, className = "", tamanho = "m", children }: Filhos & { rotulo: string; icone?: string; onClick?: () => void; ativo?: boolean; perigo?: boolean; disabled?: boolean; className?: string; tamanho?: "p" | "m" }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-35 ${tamanho === "p" ? "h-9 w-9 max-md:h-11 max-md:w-11" : "h-10 w-10 max-md:h-11 max-md:w-11"} ${
        ativo
          ? "bg-[var(--ed-acento-suave)] text-[var(--ed-acento-forte)]"
          : perigo
            ? "text-[var(--ed-texto-2)] hover:bg-[rgb(255_110_90/0.12)] hover:text-[#ff9480]"
            : "text-[var(--ed-texto-2)] hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]"
      } ${className}`}
    >
      {icone ? <Icone nome={icone} className="h-5 w-5" /> : children}
    </button>
  );
}

/** Classe dos campos de texto do editor: 44px, cantos de 12px, foco coral (globals.css). */
export const campoEd = "h-11 w-full rounded-xl border px-3.5 text-[14px] transition placeholder:text-[var(--ed-texto-3)]";
export const areaEd = "w-full resize-none rounded-xl border px-3.5 py-3 text-[14px] leading-relaxed transition";
export const seletorEd = "h-11 w-full rounded-xl border px-3 text-[14px] transition";

/** Interruptor numa linha inteira clicável: título, explicação e a chave à direita. */
export function Alternar({ ligado, aoMudar, titulo, descricao, disabled }: { ligado: boolean; aoMudar(v: boolean): void; titulo: ReactNode; descricao?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => aoMudar(!ligado)}
      className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-[var(--ed-elevado)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-[var(--ed-texto)]">{titulo}</span>
        {descricao && <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--ed-texto-2)]">{descricao}</span>}
      </span>
      <span aria-hidden="true" className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${ligado ? "bg-[var(--ed-acento)]" : "bg-[var(--ed-elevado-2)] ring-1 ring-inset ring-[var(--ed-linha-forte)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${ligado ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

/** Controle deslizante com o nome à esquerda e o valor à direita, preenchido até o ponto. */
export function Deslizante({ rotulo, valor, min, max, passo, formatar, aoMudar, disabled, className = "" }: { rotulo: ReactNode; valor: number; min: number; max: number; passo: number; formatar(v: number): string; aoMudar(v: number): void; disabled?: boolean; className?: string }) {
  const pct = max > min ? ((Math.min(max, Math.max(min, valor)) - min) / (max - min)) * 100 : 0;
  return (
    <label className={`block ${disabled ? "opacity-40" : ""} ${className}`}>
      <span className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-[var(--ed-texto-2)]">{rotulo}</span>
        <span className="tabular-nums font-medium text-[var(--ed-texto)]">{formatar(valor)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        disabled={disabled}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="mt-1 w-full"
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </label>
  );
}

/** Cartão de escolha (modelo, formato, transição): o visual em cima, o nome embaixo. */
export function CartaoOpcao({ ativo, onClick, titulo, descricao, children, disabled, title, className = "" }: Filhos & { ativo?: boolean; onClick?: () => void; titulo: ReactNode; descricao?: ReactNode; disabled?: boolean; title?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ativo}
      className={`flex flex-col gap-2 rounded-2xl p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        ativo ? "bg-[var(--ed-acento-suave)] ring-2 ring-inset ring-[var(--ed-acento)]" : "bg-[var(--ed-elevado)] ring-1 ring-inset ring-transparent hover:bg-[var(--ed-elevado-2)] hover:ring-[var(--ed-linha-forte)]"
      } ${className}`}
    >
      {children}
      <span className="min-w-0">
        <span className={`block truncate text-[13.5px] font-semibold ${ativo ? "text-[var(--ed-acento-forte)]" : "text-[var(--ed-texto)]"}`}>{titulo}</span>
        {descricao && <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ed-texto-2)]">{descricao}</span>}
      </span>
    </button>
  );
}

/** Quando não tem nada ainda: ícone grande, frase curta e o próximo passo. */
export function Vazio({ icone, titulo, texto, children }: Filhos & { icone: string; titulo: ReactNode; texto?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--ed-linha-forte)] px-5 py-7 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ed-elevado)] text-[var(--ed-texto-2)]">
        <Icone nome={icone} className="h-6 w-6" />
      </span>
      <p className="text-[14px] font-semibold text-[var(--ed-texto)]">{titulo}</p>
      {texto && <p className="max-w-[260px] text-[12.5px] leading-relaxed text-[var(--ed-texto-2)]">{texto}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Nota curta dentro do painel: informação (teal), atenção (âmbar) ou erro (coral). */
export function Nota({ tipo = "info", children, className = "" }: Filhos & { tipo?: "info" | "atencao" | "erro"; className?: string }) {
  const cor = tipo === "atencao" ? "bg-[rgb(233_185_73/0.1)] text-[#f1c86a]" : tipo === "erro" ? "bg-[rgb(255_110_90/0.1)] text-[#ff9f8c]" : "bg-[rgb(44_177_163/0.1)] text-[#7fd6cb]";
  return <p className={`rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed ${cor} ${className}`}>{children}</p>;
}
