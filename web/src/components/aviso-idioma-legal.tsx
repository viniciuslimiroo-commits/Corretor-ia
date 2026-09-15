"use client";

import { SeletorIdioma, useIdioma } from "@/i18n/cliente";

// Termos e Privacidade só existem em português, e vão continuar assim até um advogado
// escrever a versão de cada país -- texto jurídico não se traduz por máquina. Quem lê em
// espanhol ou inglês precisa saber disso ANTES de ler, no idioma dele: é a diferença entre
// "a página não carregou direito" e "é assim mesmo, e vale esta versão".
export default function AvisoIdiomaLegal() {
  const { idioma, t } = useIdioma();
  if (idioma === "pt") return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>{t("legal.aviso")}</span>
      <SeletorIdioma />
    </div>
  );
}
