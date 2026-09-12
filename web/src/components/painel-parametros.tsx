"use client";

import { useState } from "react";
import type { DefAcao, Parametro } from "@/lib/acoes";
import { Chip, Rotulo } from "./ui";

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

  return (
    <div>
      <Rotulo>{def.rotulo}</Rotulo>
      <div className="flex flex-wrap gap-2">
        {def.opcoes?.map((o) => (
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
