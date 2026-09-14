"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { montarLayout, type ContextoLayout, type PaginaLayout } from "./book-layout";
import { medirTexto } from "./book-metricas";
import type { DocumentoBook } from "./book-documento";

// O estado do editor de book: documento, desfazer e salvamento automático.
//
// Duas decisões que fazem o editor parecer instantâneo:
//
// 1. O LAYOUT É RECALCULADO NO NAVEGADOR a cada mudança, com a mesma tabela de métricas
//    que o servidor usa (book-metricas, extraída do pdf-lib com kerning e conferida em
//    igualdade exata). Sem isso cada letra digitada pediria uma ida ao servidor pra saber
//    onde a linha quebra, e a prévia andaria atrás do texto.
//
// 2. O salvamento é automático e atrasado: a pessoa não procura botão, e o servidor não
//    leva uma requisição por tecla. Uma requisição em voo por vez, e a última alteração
//    sempre reenviada quando a anterior volta.

export type EstadoSalvamento = "salvo" | "salvando" | "pendente" | "falhou" | "conflito";

const ATRASO_MS = 800;

export function useBook(o: {
  id: string;
  inicial: DocumentoBook;
  ctx: ContextoLayout;
  qrs: Record<string, string>;
  versaoInicial: number;
  token: () => Promise<string>;
}) {
  const [documento, setDocumento] = useState<DocumentoBook>(o.inicial);
  const [estado, setEstado] = useState<EstadoSalvamento>("salvo");
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef(o.versaoInicial);
  const pendente = useRef<DocumentoBook | null>(null);
  const enviando = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historico = useRef<DocumentoBook[]>([]);
  const refeitos = useRef<DocumentoBook[]>([]);
  // Indireção por ref pra função não se referenciar: o React Compiler desiste de otimizar
  // um useCallback que se chama por dentro, e desistir aqui custaria render a cada tecla.
  const enviarRef = useRef<() => void>(() => {});
  // Contador em estado, não só o ref: o botão de desfazer precisa reagir, e ref não
  // dispara render.
  const [passos, setPassos] = useState(0);
  const [passosRefazer, setPassosRefazer] = useState(0);
  const { id, token } = o;

  /** Recalcula o layout com as métricas do PDF e devolve os QR que já vieram prontos. */
  const layout: PaginaLayout[] = useMemo(() => {
    const bruto = montarLayout(documento, o.ctx, medirTexto);
    return bruto.map((p) => ({
      ...p,
      caixas: p.caixas.map((c) => (c.tipo === "qr" ? { ...c, png: o.qrs[c.conteudo] } : c)),
    }));
  }, [documento, o.ctx, o.qrs]);

  const agendar = useCallback(() => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => enviarRef.current(), ATRASO_MS);
  }, []);

  const enviar = useCallback(async () => {
    if (enviando.current) return;
    const doc = pendente.current;
    if (!doc) return;
    pendente.current = null;
    enviando.current = true;
    setEstado("salvando");
    try {
      const r = await fetch(`/api/books/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ documento: doc, versao: versao.current }),
      });
      // Ler como texto antes de virar JSON: 405, 502 e página de erro de proxy vêm sem
      // corpo JSON, e `r.json()` estoura com "Unexpected end of JSON input" -- que aparece
      // pro corretor no lugar do erro de verdade. Achado testando o editor.
      const bruto = await r.text();
      let d: { error?: string; versao?: number } = {};
      try {
        if (bruto) d = JSON.parse(bruto);
      } catch {
        d = { error: `O servidor respondeu ${r.status} sem explicação.` };
      }
      if (r.status === 409) {
        setEstado("conflito");
        setErro(d.error ?? "Este book foi alterado em outro lugar.");
        return;
      }
      if (!r.ok) throw new Error(d.error ?? "Não consegui salvar.");
      if (typeof d.versao === "number") versao.current = d.versao;
      setErro(null);
      setEstado(pendente.current ? "pendente" : "salvo");
    } catch (e) {
      // Guarda de volta pra tentar de novo: falha de rede não pode comer a edição.
      pendente.current = doc;
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
      setEstado("falhou");
    } finally {
      enviando.current = false;
      if (pendente.current) agendar();
    }
  }, [id, token, agendar]);

  const aplicar = useCallback(
    (fn: (d: DocumentoBook) => DocumentoBook) => {
      setDocumento((atual) => {
        const novo = fn(atual);
        if (novo === atual) return atual;
        historico.current = [...historico.current.slice(-29), atual];
        setPassos((n) => n + 1);
        // Editar depois de desfazer mata o ramo desfeito -- é o que todo editor faz.
        refeitos.current = [];
        setPassosRefazer(0);
        pendente.current = novo;
        setEstado("pendente");
        agendar();
        return novo;
      });
    },
    [agendar]
  );

  const desfazer = useCallback(() => {
    const anterior = historico.current.pop();
    if (!anterior) return;
    setPassos((n) => Math.max(0, n - 1));
    setDocumento((atual) => {
      refeitos.current = [...refeitos.current.slice(-29), atual];
      setPassosRefazer((n) => n + 1);
      return anterior;
    });
    pendente.current = anterior;
    setEstado("pendente");
    agendar();
  }, [agendar]);

  const refazer = useCallback(() => {
    const proximo = refeitos.current.pop();
    if (!proximo) return;
    setPassosRefazer((n) => Math.max(0, n - 1));
    setDocumento((atual) => {
      historico.current = [...historico.current.slice(-29), atual];
      setPassos((n) => n + 1);
      return proximo;
    });
    pendente.current = proximo;
    setEstado("pendente");
    agendar();
  }, [agendar]);

  const salvarAgora = useCallback(() => {
    if (relogio.current) clearTimeout(relogio.current);
    void enviar();
  }, [enviar]);

  useEffect(() => {
    enviarRef.current = () => void enviar();
  }, [enviar]);

  // Fechar a aba com edição pendente avisa. Não substitui o salvamento -- só cobre o
  // intervalo de 800ms entre a última tecla e a gravação.
  useEffect(() => {
    function aoSair(e: BeforeUnloadEvent) {
      if (pendente.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, []);

  useEffect(() => {
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, []);

  return { documento, layout, estado, erro, aplicar, desfazer, refazer, salvarAgora, podeDesfazer: passos > 0, podeRefazer: passosRefazer > 0 };
}
