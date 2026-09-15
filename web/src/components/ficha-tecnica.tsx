"use client";

import { useState } from "react";
import { Botao, Cartao, Icone, Rotulo } from "@/components/ui";
import { CAMPOS_FICHA, rotuloDoValor } from "@/lib/ficha-imovel";

// A ficha técnica do imóvel, editada na página dele.
//
// Fica no IMÓVEL e não no book de propósito: três books do mesmo apartamento com três
// preços diferentes é pior que o incômodo de a edição valer para todos. O painel do book
// diz isso quando a pessoa clica na página de ficha.
//
// Tudo é opcional. Campo vazio não vira linha em branco no book -- ele simplesmente não
// entra, e se nenhum estiver preenchido a página de ficha nem existe.

export type Ficha = Record<string, string | number | null>;

export default function FichaTecnica({
  ficha,
  aoSalvar,
}: {
  ficha: Ficha;
  aoSalvar: (mudancas: Ficha) => Promise<void>;
}) {
  const [aberta, setAberta] = useState(false);
  const [valores, setValores] = useState<Ficha>(ficha);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const preenchidos = CAMPOS_FICHA.filter((c) => {
    const v = valores[c.chave];
    return v !== null && v !== undefined && v !== "";
  }).length;

  async function salvar() {
    setSalvando(true);
    setSalvo(false);
    try {
      await aoSalvar(valores);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 4000);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberta) {
    return (
      <button
        onClick={() => setAberta(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-marca-indigo"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca-pessego text-marca-indigo">
          <Icone nome="planos" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Ficha técnica</span>
          <span className="block text-xs text-neutral-500">
            {preenchidos === 0
              ? "Preço, área, dormitórios, vagas. Entra na capa e numa página do book."
              : `${preenchidos} ${preenchidos === 1 ? "campo preenchido" : "campos preenchidos"} · aparecem no book`}
          </span>
        </span>
        <Icone nome="baixo" className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
    );
  }

  return (
    <Cartao>
      <div className="flex items-baseline justify-between gap-3">
        <Rotulo>Ficha técnica</Rotulo>
        <button onClick={() => setAberta(false)} className="pb-1 text-xs text-neutral-500 underline">fechar</button>
      </div>
      <p className="-mt-1 mb-3 text-xs text-neutral-500">
        Tudo opcional. O que estiver preenchido entra na capa e na página de ficha dos books deste imóvel; o que ficar vazio simplesmente não aparece.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CAMPOS_FICHA.map((campo) => (
          <label key={campo.chave} className={"block text-sm " + (campo.largo ? "sm:col-span-3 lg:col-span-5" : "")}>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {/* O rótulo do valor segue o negócio: na locação, "Preço" vira "Aluguel".
                  Trocar só no PDF e deixar o formulário dizendo outra coisa é como o
                  corretor descobre que o material não bate com o que ele preencheu. */}
              {campo.chave === "preco" ? rotuloDoValor(String(valores.negocio ?? "")) : campo.rotulo}
            </span>
            {campo.tipo === "escolha" ? (
              <div className="flex flex-wrap gap-1.5">
                {(campo.opcoes ?? []).map((o) => {
                  const ativo = String(valores[campo.chave] ?? "") === o.valor;
                  return (
                    <button
                      key={o.valor}
                      type="button"
                      // Clicar de novo desmarca: "não informado" é um estado legítimo, e
                      // sem isso quem escolheu por engano não tem como voltar atrás.
                      onClick={() => setValores((v) => ({ ...v, [campo.chave]: ativo ? "" : o.valor }))}
                      className={
                        "rounded-lg border px-3 py-1.5 text-sm transition " +
                        (ativo ? "border-marca-indigo bg-marca-indigo/5 font-medium text-marca-indigo" : "border-neutral-200 text-neutral-600 hover:border-neutral-400")
                      }
                    >
                      {o.rotulo}
                    </button>
                  );
                })}
              </div>
            ) : campo.tipo === "longo" ? (
              <textarea
                value={String(valores[campo.chave] ?? "")}
                onChange={(e) => setValores((v) => ({ ...v, [campo.chave]: e.target.value }))}
                rows={2}
                maxLength={campo.max}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
              />
            ) : (
              <input
                value={String(valores[campo.chave] ?? "")}
                onChange={(e) => setValores((v) => ({ ...v, [campo.chave]: e.target.value }))}
                inputMode={campo.tipo === "numero" || campo.tipo === "area" ? "decimal" : undefined}
                maxLength={campo.max}
                placeholder={campo.dica && !campo.largo ? campo.dica : undefined}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 focus:border-marca-indigo focus:outline-none"
              />
            )}
            {campo.largo && campo.dica && <span className="mt-0.5 block text-[11px] text-neutral-400">{campo.dica}</span>}
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Botao onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar ficha"}
        </Botao>
        {salvo && <span className="text-sm text-marca-teal">Salvo. Os books deste imóvel já usam esses dados.</span>}
      </div>
    </Cartao>
  );
}
