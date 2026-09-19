"use client";

import Link from "next/link";
import { Icone } from "@/components/ui";
import { BotaoEd } from "./ui-editor";

// O CABEÇALHO DO EDITOR: sair, o nome do vídeo, o que ele custa e Gerar.
//
// A linha de resumo antiga ("3 cenas · ≈ 14 s · Vertical · Calma · Dissolver · “Buriti” ·
// sem crédito", 11px) virou um nome grande e duas informações; o custo ganhou um lugar
// próprio ao lado do botão, que é onde a decisão de gastar acontece. Gerando, uma barra
// fina corre pelo pé do cabeçalho e o botão diz em que etapa está.

type Props = {
  titulo: string;
  meta: string;
  creditos: number | null;
  custo: number;
  semSaldo: boolean;
  gerando: boolean;
  progresso: { feitas: number; total: number; mensagem: string } | null;
  podeGerar: boolean;
  /** Por que Gerar está desligado (dica do botão). */
  motivo?: string;
  editandoDe: { titulo: string } | null;
  celular: boolean;
  aoGerar(): void;
  aoComecarDoZero(): void;
};

export default function CabecalhoEditor(p: Props) {
  const pct = p.progresso ? Math.max(4, Math.round((p.progresso.feitas / Math.max(1, p.progresso.total)) * 100)) : 0;
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ed-linha)] bg-[var(--ed-base)] px-2 md:gap-3 md:px-3 max-md:h-[52px]">
      <Link href="/editor" aria-label="Sair do editor" title="Sair do editor" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--ed-texto-2)] transition hover:bg-[var(--ed-elevado)] hover:text-[var(--ed-texto)]">
        <Icone nome="seta_esq" className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold text-[var(--ed-texto)]">{p.titulo}</h1>
          {p.editandoDe && !p.celular && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--ed-elevado)] py-1 pr-1 pl-2.5 text-[11.5px] text-[var(--ed-texto-2)]" title="Gerar cria um vídeo novo — o atual continua em Seus vídeos. Cena animada que não mudou não custa de novo.">
              Editando uma cópia
              <button type="button" onClick={p.aoComecarDoZero} className="rounded-full px-2 py-0.5 font-medium text-[var(--ed-texto)] hover:bg-[var(--ed-elevado-2)]">
                Começar do zero
              </button>
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-[var(--ed-texto-3)]">{p.gerando && p.progresso ? p.progresso.mensagem : p.meta}</p>
      </div>
      {!p.celular && (
        p.semSaldo ? (
          <Link href="/planos" className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[rgb(233_185_73/0.12)] px-3 py-1.5 text-[12.5px] font-medium text-[#f1c86a] sm:inline-flex" title="Faltam créditos pra este vídeo">
            Faltam créditos · ver planos
          </Link>
        ) : (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[var(--ed-elevado)] px-3 py-1.5 text-[12.5px] text-[var(--ed-texto-2)] sm:inline-flex" title="Vídeo com fotos e clipes não gasta crédito. Só cena animada por IA e voz de IA custam.">
            <span className={`h-2 w-2 rounded-full ${p.custo === 0 ? "bg-[var(--marca-teal)]" : "bg-[var(--ed-acento)]"}`} />
            {p.custo === 0 ? "Sem custo" : `${p.custo} ${p.custo === 1 ? "crédito" : "créditos"}`}
            {p.creditos !== null && <span className="text-[var(--ed-texto-3)]">· você tem {p.creditos}</span>}
          </span>
        )
      )}
      <BotaoEd variante="primaria" tamanho={p.celular ? "p" : "m"} icone={p.gerando ? undefined : "play"} onClick={p.aoGerar} disabled={!p.podeGerar} title={p.motivo} data-gerar="1" className={p.celular ? "px-3.5" : "px-5"}>
        {p.gerando ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            {pct}%
          </>
        ) : p.celular ? (
          "Gerar"
        ) : (
          "Gerar vídeo"
        )}
      </BotaoEd>
      {p.gerando && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--ed-linha)]" aria-hidden="true">
          <div className="h-full bg-[var(--ed-acento)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      )}
    </header>
  );
}
