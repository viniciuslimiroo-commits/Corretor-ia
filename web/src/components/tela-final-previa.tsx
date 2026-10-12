"use client";

import { useEffect, useState } from "react";
import { contrasteComBranco } from "@/lib/video";

// A TELA FINAL, VISTA ANTES DE GERAR.
//
// Ele em 12/10/2026: "ali no 'Com meu contato' e 'Sem tela final' poderia ter uma opção de
// personalizar esta tela? cores, logo, texto e etc".
//
// A frase já dava pra trocar -- só que dentro dos Ajustes, o painel que ele mesmo não sabia
// que abria. A COR não dava de jeito nenhum: saía sempre a da marca. E, acima das duas
// coisas, não havia como VER o resultado sem gastar uma geração inteira.
//
// AS PROPORÇÕES AQUI SÃO AS DO RENDERIZADOR, não um layout parecido. Em `argsTelaFinal`
// (video-ffmpeg.ts) o bloco é medido e centrado: o logo ocupa 16% da altura, a chamada sai
// em 4,2%, o nome em 2,8% e as duas linhas de baixo em 2,4%, com o conjunto centrado e
// subido 4%. Prévia com números próprios é pior que prévia nenhuma: ensina um layout que o
// vídeo não vai ter -- foi assim que a sobreposição do logo com as letras passou batida até
// ele ver no vídeo pronto.

const FRACAO = { logo: 0.16, chamada: 0.042, nome: 0.028, miudo: 0.024, respiro: 0.018 };

/** O quadro em si, do tamanho que pedirem. Serve o selo pequeno e a versão grande. */
function Quadro({
  cor,
  logoUrl,
  chamada,
  nome,
  creci,
  whatsapp,
  altura,
}: {
  cor: string;
  logoUrl: string | null;
  chamada: string;
  nome: string;
  creci: string;
  whatsapp: string;
  altura: number;
}) {
  const px = (f: number) => Math.round(altura * f);
  return (
    <div
      data-previa-tela-final="1"
      className="relative overflow-hidden rounded-xl ring-1 ring-black/10"
      style={{ background: cor, width: Math.round((altura * 9) / 16), height: altura }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[8%] text-center" style={{ transform: `translateY(-${px(0.04)}px)` }}>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="object-contain" style={{ height: px(FRACAO.logo), maxWidth: "62%" }} />
        )}
        {chamada && (
          <span className="font-semibold text-white" style={{ fontSize: px(FRACAO.chamada), marginTop: px(FRACAO.respiro), lineHeight: 1.15 }}>
            {chamada}
          </span>
        )}
        {nome && (
          <span className="font-medium text-white" style={{ fontSize: px(FRACAO.nome), marginTop: px(FRACAO.respiro), lineHeight: 1.2 }}>
            {nome}
          </span>
        )}
        {creci && (
          <span className="text-white/85" style={{ fontSize: px(FRACAO.miudo), marginTop: px(FRACAO.respiro * 0.5) }}>
            CRECI {creci}
          </span>
        )}
        {whatsapp && (
          <span className="font-medium text-white" style={{ fontSize: px(FRACAO.miudo), marginTop: px(FRACAO.respiro * 0.5) }}>
            WhatsApp {whatsapp}
          </span>
        )}
      </div>
      <span className="absolute inset-x-0 bottom-[3%] text-center text-white/55" style={{ fontSize: px(0.016) }}>
        Imagens ilustrativas · feito com Encena
      </span>
    </div>
  );
}

export default function TelaFinalPrevia({
  cor,
  logoUrl,
  chamada,
  nome,
  creci,
  whatsapp,
  altura = 300,
}: {
  cor: string;
  logoUrl: string | null;
  chamada: string;
  nome: string;
  creci: string;
  whatsapp: string;
  altura?: number;
}) {
  const legivel = contrasteComBranco(cor) >= 4.5;
  const [grande, setGrande] = useState(false);
  const peca = { cor, logoUrl, chamada, nome, creci, whatsapp };

  // Esc fecha. Quem abre uma coisa em cima da tela espera sair por aí, e sem isto o único
  // jeito seria achar o X -- no meio de um painel que já é pequeno.
  useEffect(() => {
    if (!grande) return;
    const sair = (e: KeyboardEvent) => e.key === "Escape" && setGrande(false);
    window.addEventListener("keydown", sair);
    return () => window.removeEventListener("keydown", sair);
  }, [grande]);

  return (
    <div className="shrink-0">
      {/* CLICAR AMPLIA. Ele: "quando eu clicar na tela final quero ter opção de ver bem
          grande". Num selo de 130px o CRECI tem 5px de altura -- dá pra ver a cor e o
          equilíbrio, não pra conferir se o telefone está certo, que é justamente o que mais
          importa conferir antes de mandar o vídeo pro cliente. */}
      <button
        type="button"
        onClick={() => setGrande(true)}
        title="Clique pra ver grande"
        className="block rounded-xl transition hover:ring-2 hover:ring-marca-indigo/40"
      >
        <Quadro {...peca} altura={altura} />
        <span className="mt-1 block text-center text-[10px] text-neutral-400">clique pra ver grande</span>
      </button>

      {/* A TELA FINAL ESCREVE EM BRANCO. Com fundo claro o telefone some, e quem escolheu a
          cor não tem como saber disso antes de gerar. O aviso é medido (WCAG), não achado. */}
      {!legivel && (
        <p data-aviso-contraste="1" className="mt-1.5 max-w-[170px] text-[11px] leading-tight text-amber-700">
          Nessa cor a letra branca fica difícil de ler. Uma cor mais escura destaca o contato.
        </p>
      )}

      {grande && (
        <div
          data-previa-grande="1"
          role="dialog"
          aria-modal="true"
          aria-label="Tela final em tamanho grande"
          onClick={() => setGrande(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-neutral-950/80 p-6 backdrop-blur-sm"
        >
          {/* O quadro grande para o clique: clicar NELE não fecha, porque a pessoa vai
              querer chegar perto pra ler o telefone. Fechar é fora, no X ou no Esc. */}
          <div onClick={(e) => e.stopPropagation()}>
            {/* `min(70vh, 640px)` em vez de uma altura fixa: em tela baixa um valor fixo
                estouraria pra fora e cortaria justamente o rodapé com o contato. */}
            <Quadro {...peca} altura={Math.min(640, Math.round(typeof window === "undefined" ? 560 : window.innerHeight * 0.7))} />
          </div>
          <button type="button" onClick={() => setGrande(false)} className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25">
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
