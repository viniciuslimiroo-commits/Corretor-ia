"use client";

import { useRef, useState, type DragEvent } from "react";
import { Icone } from "./ui";

// Área de envio da foto: clique ou arraste. É o primeiro contato de quem chega, então
// ela explica o que fazer sem manual e aceita o gesto mais natural em desktop, que é
// arrastar do explorador de arquivos.

export default function Dropzone({
  onArquivo,
  onArquivos,
  compacto = false,
  rotulo = "Escolher foto do imóvel",
  dica = "Arraste aqui ou clique. JPG ou PNG, foto do celular serve.",
}: {
  onArquivo: (f: File) => void;
  /** Recebe TODAS as fotos quando vem mais de uma. Sem isto, só a primeira entra. */
  onArquivos?: (fs: File[]) => void;
  compacto?: boolean;
  rotulo?: string;
  dica?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function receber(lista: FileList | null | undefined) {
    const fotos = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
    if (fotos.length === 0) return;
    // Mais de uma só é tratada por quem sabe tratar; senão entra a primeira, como antes.
    if (fotos.length > 1 && onArquivos) onArquivos(fotos);
    else onArquivo(fotos[0]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function aoSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    receber(e.dataTransfer.files);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={aoSoltar}
      className={
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition " +
        (arrastando ? "border-marca-coral bg-marca-pessego/40" : "border-neutral-300 bg-neutral-50 hover:border-marca-indigo hover:bg-white") +
        (compacto ? " gap-1 px-4 py-4" : " gap-3 px-6 py-14")
      }
    >
      <span className={"flex items-center justify-center rounded-full bg-white text-marca-indigo shadow-sm " + (compacto ? "h-8 w-8" : "h-14 w-14")}>
        <Icone nome="foto" className={compacto ? "h-4 w-4" : "h-7 w-7"} />
      </span>
      <span className={compacto ? "text-sm font-medium text-neutral-800" : "text-base font-semibold text-neutral-900"}>{rotulo}</span>
      {!compacto && (
        <span className="text-sm text-neutral-500">{dica}</span>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple={!!onArquivos} className="hidden" onChange={(e) => receber(e.target.files)} />
    </label>
  );
}
