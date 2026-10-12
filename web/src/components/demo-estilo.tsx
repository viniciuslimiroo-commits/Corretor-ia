"use client";

import { useEffect, useRef } from "react";
import { quadrosChaveDaFoto } from "@/lib/movimento-da-foto";
import type { EfeitoId } from "@/lib/video";

// A JANELINHA QUE MOSTRA COMO O ESTILO FICA, ao passar o mouse.
//
// Ele em 10/10/2026: "ao passar o mouse em cima de 'Movimento na foto' e 'Tour pela casa',
// assim que o cursor ficar em cima dar uma breve demonstração, abrir janelinha ao lado
// mostrando um exemplo de como ficaria".
//
// Duas decisões que valem explicar:
//
// 1. O MOVIMENTO NÃO É INVENTADO AQUI. Os quadros-chave saem de `movimento-da-foto.ts`,
//    a mesma conta que o `zoompan` do ffmpeg usa pra desenhar o vídeo. Demonstração com
//    movimento próprio ensina a coisa errada: a pessoa escolhe pelo que viu e recebe outra
//    coisa. `testar-movimento-da-foto.ts` prova que as duas põem a janela no mesmo lugar.
//
// 2. O TOUR É UM VÍDEO DE VERDADE, FILMADO ANDANDO. Levou três tentativas até ele dizer o
//    que queria, e cada "não" apontava mais longe:
//      - foto com zoom: "os exemplos estão quase iguais, do tour e o padrão grátis";
//      - clipe de IA sem o movimento do ffmpeg: "tour pela casa está parado";
//      - clipe de IA completo: "tour não é assim não... não é pra criar coisa que não
//        exista, então pegue uma forma que faça o vídeo tour real".
//    Aí ele mandou um vídeo dele e disse "seria esse": uma filmagem andando pelo imóvel,
//    montada no próprio Encena. É o que está em `/exemplos/tour-caminhando.mp4` (a tela
//    final de contato dele foi cortada; corte medido em 3,70s, onde a dissolvência começa).
//
//    MEDIDO, porque "parece que anda" não é argumento: a foto com zoom muda 9,9 do começo
//    ao fim; o clipe de IA com o ffmpeg por cima, 31,2; o 360 girando, 31,3; esta filmagem,
//    68,2. É o dobro de tudo que tentei antes -- porque quem anda é a câmera inteira.
//
//    E NÃO INVENTA NADA, que era a exigência dele: é o imóvel filmado. A janelinha não diz
//    que a IA fez isto; diz que a pessoa filma e o Encena monta, que é o caminho de verdade
//    (o editor aceita clipe, `ehClipe`).
//
// Só aparece onde há mouse: `@media (hover: hover)`. No celular não existe "passar por
// cima", e uma janela que abre no toque atrapalharia o toque que escolhe o estilo.

export type EstiloDemo = "tour" | "recomendado" | "meu";

/** Quanto cada foto fica na janelinha. Curto: é uma amostra, não uma prévia do vídeo. */
const SEGUNDOS_POR_FOTO = 2.6;

/** Fotos de exemplo, pra quando ainda não há nenhuma escolhida. São do nosso acervo. */
const EXEMPLOS = ["/exemplos/sala-depois.jpg", "/exemplos/cozinha-depois.jpg"];

/**
 * O que cada estilo faz com a 1ª e a 2ª foto.
 *
 * `camera` marca a cena que, no tour, vira clipe de IA -- é o que a janelinha sinaliza com
 * a etiqueta, e o que a linha de baixo explica.
 */
function roteiroDoEstilo(estilo: EstiloDemo): { efeito: EfeitoId; camera: boolean }[] {
  if (estilo === "meu") return [{ efeito: "parado", camera: false }, { efeito: "parado", camera: false }];
  // "Movimento na foto": passeio pro lado, alternando o sentido a cada cena -- a mesma
  // regra de `efeitoDe` em video-automatico.ts.
  if (estilo === "recomendado") return [{ efeito: "direita", camera: false }, { efeito: "esquerda", camera: false }];
  // "Tour pela casa": a foto que vende ganha câmera; o resto segue com movimento na foto.
  return [{ efeito: "aproximar", camera: true }, { efeito: "esquerda", camera: false }];
}

function FotoAnimada({ src, efeito, atrasoMs }: { src: string; efeito: EfeitoId; atrasoMs: number }) {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const total = SEGUNDOS_POR_FOTO * 2;
    // Cada foto ocupa a sua metade do ciclo e some na outra: duas animações em laço, uma
    // defasada da outra, sem relógio em JavaScript pra sair de sincronia.
    const mover = el.animate(quadrosChaveDaFoto(efeito, SEGUNDOS_POR_FOTO), {
      duration: SEGUNDOS_POR_FOTO * 1000,
      delay: atrasoMs,
      iterations: Infinity,
      iterationStart: 0,
      easing: "linear",
    });
    const aparecer = el.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.06 },
        { opacity: 1, offset: 0.44 },
        { opacity: 0, offset: 0.5 },
        { opacity: 0, offset: 1 },
      ],
      { duration: total * 1000, delay: atrasoMs, iterations: Infinity, easing: "linear" }
    );
    return () => {
      mover.cancel();
      aparecer.cancel();
    };
  }, [src, efeito, atrasoMs]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 will-change-transform" draggable={false} />
  );
}

/** O tour de verdade: filmagem andando pelo imóvel. Ver o cabeçalho deste arquivo. */
const CLIPE_DO_TOUR = "/exemplos/tour-caminhando.mp4";

export default function DemoEstilo({ estilo, fotos }: { estilo: EstiloDemo; fotos: string[] }) {
  const usadas = (fotos.length ? fotos : EXEMPLOS).slice(0, 2);
  // Uma foto só: ela entra duas vezes, e o segundo passe mostra o outro sentido.
  const lista = usadas.length === 1 ? [usadas[0], usadas[0]] : usadas;
  const roteiro = roteiroDoEstilo(estilo);
  const temCamera = roteiro.some((r) => r.camera);
  return (
    <div
      role="tooltip"
      data-demo-estilo={estilo}
      // Quem a esconde sem mouse é a regra `@media (hover: none)` em globals.css, ancorada
      // neste `data-demo-estilo`: a variante equivalente do Tailwind não saiu no CSS.
      className="pointer-events-none absolute top-0 right-full z-30 mr-3 w-[152px]"
    >
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="relative aspect-[9/16] overflow-hidden bg-neutral-900">
          {estilo === "tour" ? (
            // Vídeo DE VERDADE, não foto animada: é a única coisa que mostra a câmera
            // andando pelo cômodo. `muted` é o que deixa o navegador tocar sozinho.
            <video src={CLIPE_DO_TOUR} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            lista.map((src, i) => <FotoAnimada key={`${src}-${i}`} src={src} efeito={roteiro[i].efeito} atrasoMs={i * SEGUNDOS_POR_FOTO * 1000} />)
          )}
          {/* A etiqueta diz a VERDADE sobre a origem. Dizia "câmera por IA" quando aqui
              rodava um clipe de modelo; agora é filmagem, e chamar de IA seria a mesma
              mentira com o sinal trocado. */}
          {temCamera && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              filmado no celular
            </span>
          )}
        </div>
        <p className="px-2 py-1.5 text-[10px] leading-tight text-neutral-500">
          {estilo === "tour"
            ? "Você filma andando pelo imóvel e manda o clipe; o Encena monta com título, legendas e música. As fotos soltas entram com movimento."
            : estilo === "recomendado"
              ? "É exatamente este movimento que sai no vídeo."
              : "As fotos ficam paradas: a ordem e os ajustes são seus."}
        </p>
      </div>
    </div>
  );
}
