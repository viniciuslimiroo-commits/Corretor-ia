"use client";

import { useEffect, useRef, useState } from "react";
import type { Conta } from "./app-shell";
import { coresDaLogo } from "@/lib/cores-da-logo";
import { LOGO_MAX_BYTES } from "@/lib/logo-upload-limites";

// A primeira tela depois do primeiro login. Não é cadastro: é a pessoa ver a própria logo
// dentro da Encena em poucos segundos e entender, sem ler nada, que os materiais vão sair
// com a cara dela.
//
// Duas regras que mandam no resto do arquivo:
//
// 1. "Pular por enquanto" tem o mesmo tamanho e o mesmo contraste de um botão de verdade.
//    Esconder saída é o truque que faz a pessoa preencher hoje e desconfiar do produto
//    amanhã. Quem pula segue pro painel igual.
//
// 2. Nada é salvo até "Continuar". A prévia e as cores saem do arquivo local, no canvas,
//    com a MESMA função que o servidor usa (lib/cores-da-logo). Duas implementações da
//    mesma paleta dariam duas paletas diferentes pro mesmo logo.

type Props = {
  conta: Conta;
  token: () => Promise<string>;
  /** Chamado depois de salvar ou pular: a raiz troca esta tela pelo painel. */
  aoSair: () => void;
};

const ACEITOS = "image/png,image/jpeg,image/webp";

export default function OnboardingMarca({ conta, token, aoSair }: Props) {
  // Dono ou gestor de imobiliária edita a marca DA CASA; corretor edita a dele. O papel
  // vem do servidor (org_members.papel) -- a rota confere de novo, isto aqui é só pra
  // tela não prometer o que a API vai recusar com 403.
  const papel = conta.org?.papel;
  const daCasa = !!conta.org && (papel === "dono" || papel === "gestor");
  const soPessoal = !!conta.org && !daCasa;

  const [nome, setNome] = useState(conta.marca?.nome?.split(" · ")[0] ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [cores, setCores] = useState<string[]>([]);
  const [usarCores, setUsarCores] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement | null>(null);

  // A URL do objeto é recurso do navegador, não estado derivado: nasce no clique que
  // escolheu o arquivo e morre quando outra a substitui. Criar dentro de um efeito
  // obrigaria a chamar setState lá dentro, que é justamente o que o compilador do React
  // recusa -- e o efeito rodaria de novo a cada render, vazando um blob por vez.
  // O ref guarda a URL viva; o state só existe pra redesenhar. Os dois mudam juntos, e
  // sempre dentro de um clique -- ref escrito durante render é outra coisa que o
  // compilador recusa, e com razão: o render pode rodar duas vezes.
  const ultimaPrevia = useRef<string | null>(null);
  const trocarPrevia = (url: string | null) => {
    if (ultimaPrevia.current) URL.revokeObjectURL(ultimaPrevia.current);
    ultimaPrevia.current = url;
    setPrevia(url);
  };

  // Solta o último blob quando a tela sai do ar (salvou, pulou, trocou de rota).
  useEffect(() => {
    return () => {
      if (ultimaPrevia.current) URL.revokeObjectURL(ultimaPrevia.current);
    };
  }, []);

  async function escolher(f: File | null) {
    setErro(null);
    setCores([]);
    if (!f) return;
    if (f.size > LOGO_MAX_BYTES) {
      setErro(`Essa logo tem ${(f.size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB.`);
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      setErro("Use PNG, JPG ou WebP.");
      return;
    }
    setArquivo(f);
    trocarPrevia(URL.createObjectURL(f));

    // Paleta na hora, sem subir nada: 96px bastam e o cálculo é o mesmo do servidor.
    try {
      const bitmap = await createImageBitmap(f);
      const lado = 96;
      const escala = Math.min(lado / bitmap.width, lado / bitmap.height, 1);
      const l = Math.max(1, Math.round(bitmap.width * escala));
      const a = Math.max(1, Math.round(bitmap.height * escala));
      const tela = document.createElement("canvas");
      tela.width = l;
      tela.height = a;
      const ctx = tela.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0, l, a);
      bitmap.close?.();
      setCores(coresDaLogo(ctx.getImageData(0, 0, l, a).data));
    } catch {
      setCores([]); // sem paleta é um mimo a menos, não um erro pra mostrar
    }
  }

  async function salvar(pular: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.set("onboarding", pular ? "pulado" : "feito");
      if (!pular) {
        if (nome.trim()) corpo.set("nome", nome.trim());
        if (arquivo) corpo.set("logo", arquivo);
        if (usarCores && cores[0]) corpo.set("cor", cores[0]);
      }
      const r = await fetch(daCasa ? "/api/equipe/marca" : "/api/marca", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
        body: corpo,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Não consegui salvar agora.");
      }
      aoSair();
    } catch (e) {
      setSalvando(false);
      setErro(e instanceof Error ? e.message : "Não consegui salvar agora.");
    }
  }

  const nomeMostrado = nome.trim() || (soPessoal ? conta.org!.nome : "Sua marca");
  const corPrincipal = (usarCores && cores[0]) || "#0F2D5B";
  const temAlgo = !!nome.trim() || !!arquivo;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
        <span className="text-xl font-bold tracking-tight text-marca-indigo">Encena</span>
      </div>

      <h1 className="mt-7 text-[28px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-4xl">
        Faça a Encena ter a cara da sua marca
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-600">
        Adicione seu nome e sua logo para personalizar automaticamente vídeos, PDFs, apresentações e outros materiais.
      </p>

      {soPessoal && (
        <p className="mt-4 rounded-xl border border-marca-teal/40 bg-marca-teal/10 px-3.5 py-2.5 text-sm text-marca-indigo">
          A marca de <strong>{conta.org!.nome}</strong> já vale nos seus materiais. O que você puser aqui é o seu nome, que entra junto.
        </p>
      )}

      {/* ---------------------------------------------------------- formulário */}
      <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid gap-5">
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">
              {daCasa ? "Nome da imobiliária" : "Nome profissional ou imobiliária"}
            </span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              autoComplete="organization"
              placeholder="Ex.: Imobiliária Horizonte ou João Silva"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-[15px] outline-none transition focus:border-marca-indigo"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-neutral-700">Logo</span>
            <input
              ref={entrada}
              type="file"
              accept={ACEITOS}
              className="sr-only"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:border-marca-indigo hover:text-marca-indigo"
              >
                {arquivo ? "Trocar logo" : "Enviar logo"}
              </button>
              {arquivo && (
                <button
                  type="button"
                  onClick={() => {
                    setArquivo(null);
                    trocarPrevia(null);
                    setCores([]);
                  }}
                  className="text-sm text-neutral-500 underline"
                >
                  remover
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">PNG, JPG ou WebP, até 5 MB.</p>
          </div>
        </div>

        {/* ------------------------------------------------------------ prévia */}
        <div className="sm:w-[230px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Como vai aparecer</p>
          <div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {previa ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob local, não passa por loader
                <img src={previa} alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
              ) : (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white transition-colors"
                  style={{ background: corPrincipal }}
                >
                  {nomeMostrado.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 text-sm font-semibold break-words">{nomeMostrado}</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full transition-colors" style={{ background: corPrincipal }} />
            <p className="mt-3 text-xs leading-snug text-neutral-500">
              {temAlgo ? "Sua marca já pode aparecer nos materiais criados pela Encena." : "Preencha ao lado pra ver aqui."}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- cores */}
      {cores.length > 0 && (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-700">Encontramos estas cores na sua marca:</p>
          <div className="mt-2.5 flex items-center gap-2">
            {cores.map((c) => (
              <span key={c} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 py-1 pr-2.5 pl-1">
                <span className="h-6 w-6 rounded-md" style={{ background: c }} />
                <span className="font-mono text-[11px] text-neutral-500">{c}</span>
              </span>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={usarCores} onChange={(e) => setUsarCores(e.target.checked)} className="h-4 w-4 accent-marca-coral" />
            Usar estas cores nos meus materiais
          </label>
        </div>
      )}

      {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

      {/* ------------------------------------------------------------ botões */}
      <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => salvar(true)}
          disabled={salvando}
          className="rounded-xl border border-neutral-300 px-5 py-3 text-[15px] font-medium text-neutral-700 transition hover:border-neutral-500 disabled:opacity-40 sm:px-6"
        >
          Pular por enquanto
        </button>
        <button
          type="button"
          onClick={() => salvar(false)}
          disabled={salvando || !temAlgo}
          className="rounded-xl bg-marca-coral px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-marca-coral-escuro disabled:opacity-40 sm:px-7"
        >
          {salvando ? "Salvando…" : "Continuar"}
        </button>
      </div>

      <p className="mt-4 text-xs text-neutral-400">Dá pra mudar tudo isso depois, em Minha marca.</p>
    </main>
  );
}
