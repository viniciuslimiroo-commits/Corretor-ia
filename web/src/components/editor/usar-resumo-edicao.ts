"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { criarContagemDaEdicao, type EventoResumo, type ResumoEdicao, type TrilhaResumo, type ViaEdicao } from "@/lib/resumo-edicao";

// O RESUMO DA EDIÇÃO do lado do editor: conta o que a pessoa faz e entrega o resumo na hora
// de gerar (o que ele é e por que existe: lib/resumo-edicao.ts).
//
// A conta mora num objeto criado UMA vez (`useState` com inicializador) e só é tocada em
// efeito e em evento. Nada aqui é lido durante o render, e nenhum contador vira estado:
// contar um desfazer não pode redesenhar o editor inteiro.
//
//   const resumoEdicao = useResumoEdicao(celular);
//   fetch("/api/video", { body: JSON.stringify({ imovelId, espec, resumo: resumoEdicao.resumo() }) });
//   // pedido aceito:
//   resumoEdicao.aposGerar();

export function useResumoEdicao(celular: boolean): {
  registrar: (evento: EventoResumo) => void;
  registrarEdicao: (trilha: TrilhaResumo, via: ViaEdicao) => void;
  resumo: () => ResumoEdicao;
  aposGerar: () => void;
} {
  const [contagem] = useState(criarContagemDaEdicao);

  // A hora de abertura é da montagem, e não do render: `new Date()` no render muda a cada
  // desenho, e é o que a métrica "tempo do editor aberto até gerar" precisa fixo.
  useEffect(() => {
    contagem.abrir(new Date());
  }, [contagem]);

  const registrar = useCallback((evento: EventoResumo) => contagem.registrar(evento), [contagem]);
  const registrarEdicao = useCallback((trilha: TrilhaResumo, via: ViaEdicao) => contagem.registrarEdicao(trilha, via), [contagem]);
  const resumo = useCallback(() => contagem.resumo(celular ? "celular" : "desktop", new Date()), [contagem, celular]);
  const aposGerar = useCallback(() => contagem.aposGerar(), [contagem]);

  return useMemo(() => ({ registrar, registrarEdicao, resumo, aposGerar }), [registrar, registrarEdicao, resumo, aposGerar]);
}
