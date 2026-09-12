"use client";

import { useState } from "react";
import { Botao, Icone } from "./ui";

// Botão "Compartilhar" de uma foto ou de um imóvel. Cria o link público na primeira
// vez, mostra o link com copiar / WhatsApp / abrir, e deixa desativar. O link é o que
// o corretor manda pro cliente no WhatsApp -- então WhatsApp é o botão grande.

export default function Compartilhar({
  token,
  jobId,
  imovelId,
  videoId,
  compartilhadoInicial = false,
  texto = "",
  compacto = false,
}: {
  token: () => Promise<string>;
  jobId?: string;
  imovelId?: string;
  videoId?: string;
  compartilhadoInicial?: boolean;
  /** Texto que vai junto no WhatsApp, antes do link. */
  texto?: string;
  compacto?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [ativo, setAtivo] = useState(compartilhadoInicial);
  const [erro, setErro] = useState<string | null>(null);

  const alvo = jobId ? { jobId } : imovelId ? { imovelId } : { videoId };

  async function abrir() {
    setAberto(true);
    if (url) return;
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/compartilhar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(alvo),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setUrl(d.url);
      setAtivo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui criar o link.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      await fetch("/api/compartilhar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(alvo),
      });
      setUrl(null);
      setAtivo(false);
      setAberto(false);
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegador sem clipboard: o campo abaixo está selecionável
    }
  }

  const mensagem = `${texto ? texto + " " : ""}${url ?? ""}`.trim();

  return (
    <div className={compacto ? "" : "w-full"}>
      <Botao variante={compacto ? "discreta" : "secundaria"} onClick={abrir} disabled={ocupado} className={compacto ? "px-2 py-1 text-xs" : ""}>
        <Icone nome="compartilhar" className="h-4 w-4" />
        {ativo ? "Link ativo" : "Compartilhar"}
      </Botao>

      {aberto && (
        <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm">
          {erro && <p className="text-red-600">{erro}</p>}
          {!url && !erro && <p className="text-neutral-500">Criando o link…</p>}
          {url && (
            <>
              <p className="text-xs text-neutral-500">Quem tiver o link vê antes e depois, sem precisar de conta. Você pode desativar quando quiser.</p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700" />
                <Botao variante="secundaria" onClick={copiar} className="px-3 py-1.5" title="Copiar link">
                  <Icone nome={copiado ? "check" : "copiar"} className="h-4 w-4" />
                  {copiado ? "Copiado" : "Copiar"}
                </Botao>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:brightness-95"
                >
                  <Icone nome="whatsapp" className="h-4 w-4" />
                  Enviar no WhatsApp
                </a>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
                  <Icone nome="link" className="h-4 w-4" />
                  Abrir
                </a>
                <button onClick={desativar} disabled={ocupado} className="ml-auto text-xs text-neutral-500 underline disabled:opacity-40">
                  Desativar link
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
