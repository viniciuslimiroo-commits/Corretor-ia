"use client";

import { useState } from "react";
import type { DefAcao, Parametro } from "@/lib/acoes";
import { Chip, Rotulo } from "./ui";

/** Quantos chips aparecem antes do "mais N". Seis cabe em duas linhas no celular. */
const VISIVEIS = 6;

// Desenha os controles de uma ação a partir do catálogo. Chips pra opções, um campo
// "Outro" quando a ação permite, e área de texto pra parâmetro livre. Nada aqui sabe o
// que é "estilo" ou "piso": é tudo dado, então ação nova não exige tela nova.

function ControleOpcoes({
  def,
  valor,
  onChange,
}: {
  def: Parametro;
  valor: string;
  onChange: (v: string) => void;
}) {
  const ehOpcao = def.opcoes?.some((o) => o.valor === valor) ?? false;
  const [modoOutro, setModoOutro] = useState(!ehOpcao && !!valor);
  const mostrandoOutro = modoOutro || (!ehOpcao && !!valor);

  /**
   * Listas longas (12 tipos de espaço, 10 pisos, 10 paredes) viram um paredão de chips.
   *
   * A saída NÃO é cortar opção: cada uma muda o prompt de verdade, e quem tem área gourmet
   * ou ladrilho hidráulico recebe resultado pior sem ela. É dobrar as menos comuns atrás de
   * "mais" -- e já começar aberto se a escolhida estiver lá dentro, senão a pessoa não vê
   * o que selecionou.
   */
  const todas = def.opcoes ?? [];
  const escondeAlgumas = todas.length > VISIVEIS + 2;
  const iEscolhida = todas.findIndex((o) => o.valor === valor);
  const [verTodas, setVerTodas] = useState(false);
  const mostradas = !escondeAlgumas || verTodas || iEscolhida >= VISIVEIS ? todas : todas.slice(0, VISIVEIS);

  return (
    <div>
      <Rotulo>{def.rotulo}</Rotulo>
      <div className="flex flex-wrap gap-2">
        {mostradas.map((o) => (
          <Chip
            key={o.valor}
            ativo={!mostrandoOutro && valor === o.valor}
            onClick={() => {
              setModoOutro(false);
              onChange(o.valor);
            }}
          >
            {o.rotulo}
          </Chip>
        ))}
        {escondeAlgumas && mostradas.length < todas.length && (
          <button
            type="button"
            onClick={() => setVerTodas(true)}
            className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
          >
            mais {todas.length - mostradas.length}
          </button>
        )}
        {def.permiteOutro && (
          <Chip
            ativo={mostrandoOutro}
            onClick={() => {
              setModoOutro(true);
              if (ehOpcao) onChange("");
            }}
          >
            Outro…
          </Chip>
        )}
      </div>
      {mostrandoOutro && (
        <input
          autoFocus
          type="text"
          maxLength={40}
          value={ehOpcao ? "" : valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Descreva o ${def.rotulo.toLowerCase()}`}
          className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none"
        />
      )}
      {/* Duas ajudas, e são coisas diferentes: `def.ajuda` explica o CAMPO ("Alta
          transforma mais"), e a da opção explica a ESCOLHA ("Alto padrão é laca, pedra e
          luz de projeto"). Sem a segunda, o chip mostra um nome e o prompt manda uma
          descrição de material em inglês que ninguém vê -- e entre os dois não dá pra
          saber o que vai sair antes de gastar o crédito. */}
      {!mostrandoOutro && todas.find((o) => o.valor === valor)?.ajuda && (
        <p className="mt-1.5 text-xs leading-snug text-neutral-500">{todas.find((o) => o.valor === valor)!.ajuda}</p>
      )}
      {def.ajuda && <p className="mt-1.5 text-xs text-neutral-500">{def.ajuda}</p>}
    </div>
  );
}

function ControleTexto({ def, valor, onChange }: { def: Parametro; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Rotulo>{def.rotulo}</Rotulo>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        maxLength={def.max ?? 300}
        rows={3}
        placeholder={def.placeholder}
        className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none"
      />
      <div className="mt-1 flex justify-between text-xs text-neutral-500">
        <span>{def.ajuda}</span>
        <span>
          {valor.length}/{def.max ?? 300}
        </span>
      </div>
    </div>
  );
}

export default function PainelParametros({
  acao,
  valores,
  onChange,
}: {
  acao: DefAcao;
  valores: Record<string, string>;
  onChange: (chave: string, valor: string) => void;
}) {
  if (acao.parametros.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {acao.parametros.map((def) =>
        def.tipo === "opcoes" ? (
          <ControleOpcoes key={def.chave} def={def} valor={valores[def.chave] ?? def.padrao ?? ""} onChange={(v) => onChange(def.chave, v)} />
        ) : (
          <ControleTexto key={def.chave} def={def} valor={valores[def.chave] ?? ""} onChange={(v) => onChange(def.chave, v)} />
        )
      )}
    </div>
  );
}
