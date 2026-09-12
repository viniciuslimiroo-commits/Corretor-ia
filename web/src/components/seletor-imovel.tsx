"use client";

import { useEffect, useState } from "react";
import { Botao } from "./ui";

// Escolha do imóvel no editor: uma lista com "Sem imóvel", os imóveis da pessoa e
// "Novo imóvel…", que abre um campo na hora. Ninguém precisa sair do editor pra
// organizar; e quem não quer organizar deixa em "Sem imóvel" e nada muda.

export type ImovelResumo = { id: string; titulo: string };

export default function SeletorImovel({
  token,
  valor,
  onChange,
  disabled = false,
}: {
  token: () => Promise<string>;
  valor: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [imoveis, setImoveis] = useState<ImovelResumo[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    token()
      .then((t) => fetch("/api/imoveis", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setImoveis((d.imoveis ?? []).map((i: ImovelResumo) => ({ id: i.id, titulo: i.titulo })));
      })
      .catch(() => {
        if (vivo) setImoveis([]);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  async function criar() {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/imoveis", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ titulo }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setImoveis((lista) => [{ id: d.imovel.id, titulo: d.imovel.titulo }, ...(lista ?? [])]);
      onChange(d.imovel.id);
      setCriando(false);
      setNovoTitulo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui criar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={valor ?? ""}
        disabled={disabled || imoveis === null}
        onChange={(e) => {
          if (e.target.value === "__novo") {
            setCriando(true);
            return;
          }
          onChange(e.target.value || null);
        }}
        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm focus:border-marca-indigo focus:outline-none disabled:opacity-50"
        aria-label="Imóvel"
      >
        <option value="">Sem imóvel</option>
        {(imoveis ?? []).map((i) => (
          <option key={i.id} value={i.id}>
            {i.titulo}
          </option>
        ))}
        <option value="__novo">＋ Novo imóvel…</option>
      </select>

      {criando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            criar();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            type="text"
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            maxLength={80}
            placeholder="Ex.: Apto 302 · Setor Bueno"
            className="w-56 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-marca-indigo focus:outline-none"
          />
          <Botao type="submit" variante="secundaria" disabled={ocupado || !novoTitulo.trim()} className="px-3 py-1.5">
            {ocupado ? "Criando…" : "Criar"}
          </Botao>
          <button type="button" onClick={() => setCriando(false)} className="text-xs text-neutral-500 underline">
            cancelar
          </button>
        </form>
      )}
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </div>
  );
}
