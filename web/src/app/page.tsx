"use client";

import { useState } from "react";

type Acao = "mobiliar" | "esvaziar" | "melhorar";

const ACOES: { valor: Acao; rotulo: string }[] = [
  { valor: "mobiliar", rotulo: "Mobiliar (estilo Moderno)" },
  { valor: "esvaziar", rotulo: "Esvaziar cômodo" },
  { valor: "melhorar", rotulo: "Melhorar foto escura" },
];

export default function Home() {
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao>("mobiliar");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    setFoto(arquivo);
    setResultado(null);
    setErro(null);
    setPreview(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  async function gerar() {
    if (!foto) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const form = new FormData();
      form.append("foto", foto);
      form.append("acao", acao);
      const resp = await fetch("/api/gerar", { method: "POST", body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Falha ao gerar.");
      setResultado(data.url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <h1 className="text-2xl font-semibold">Walking skeleton — Sprint 1</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Sobe uma foto, escolhe a ação, chama a IA de verdade (fal.ai). Sem login, sem
        crédito, sem banco — só o fio ponta a ponta funcionando.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <input type="file" accept="image/*" onChange={aoEscolherFoto} />

        <select
          className="w-fit rounded border px-3 py-2"
          value={acao}
          onChange={(e) => setAcao(e.target.value as Acao)}
        >
          {ACOES.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </select>

        <button
          onClick={gerar}
          disabled={!foto || carregando}
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {carregando ? "Gerando..." : "Gerar"}
        </button>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {preview && (
            <div>
              <p className="mb-1 text-xs uppercase text-neutral-500">Original</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Foto original" className="w-full rounded border" />
            </div>
          )}
          {resultado && (
            <div>
              <p className="mb-1 text-xs uppercase text-neutral-500">Resultado</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Resultado gerado" className="w-full rounded border" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
