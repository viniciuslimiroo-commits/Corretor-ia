"use client";

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
  const px = (f: number) => Math.round(altura * f);
  const legivel = contrasteComBranco(cor) >= 4.5;
  return (
    <div className="shrink-0">
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
      {/* A TELA FINAL ESCREVE EM BRANCO. Com fundo claro o telefone some, e quem escolheu a
          cor não tem como saber disso antes de gerar. O aviso é medido (WCAG), não achado. */}
      {!legivel && (
        <p data-aviso-contraste="1" className="mt-1.5 max-w-[170px] text-[11px] leading-tight text-amber-700">
          Nessa cor a letra branca fica difícil de ler. Uma cor mais escura destaca o contato.
        </p>
      )}
    </div>
  );
}
