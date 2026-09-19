"use client";

import { useEffect, useState } from "react";
import { tempoNoArquivo } from "@/lib/clipes-do-editor";
import type { RelogioDaPrevia } from "@/components/editor/usar-previa-de-audio";

// O CLIPE NO PALCO: o vídeo de verdade no quadro, no segundo certo.
//
// Antes, uma cena de clipe mostrava um retângulo com "Clipe — aparece no vídeo montado": a
// pessoa punha um vídeo na linha do tempo e não via nada dele até gerar. Agora o palco
// mostra o arquivo (o que foi enviado, ou o vídeo pronto do Encena), mudo -- o som é o da
// prévia --, parado no quadro do cursor e andando junto com o Play.
//
// Sincronia: parado, o quadro segue o cursor (busca só quando muda mais de 1 quadro);
// tocando, o vídeo toca sozinho na velocidade da cena e só é corrigido quando se afasta
// mais de 0,3s do relógio da prévia -- corrigir a todo quadro deixava o vídeo aos trancos.

type Props = {
  url: string;
  cena: { inicio?: number; duracao: number; velocidade?: number; congelar?: boolean; giro?: number; espelho?: boolean; luz?: number };
  /** Segundo do vídeo final em que esta cena começa. */
  inicioDaCena: number;
  /** O tempo do cursor (parado). */
  tempo: number;
  tocando: boolean;
  relogio: RelogioDaPrevia;
  /** Tamanho do quadro, pra girar 90° e continuar cobrindo. */
  largura: number;
  altura: number;
  miniatura?: string | null;
};

// O <video> é mexido por fora do componente (a regra do React não deixa mudar um valor de
// estado ali dentro): quadro parado, tocar e corrigir a deriva.
function mostrarQuadro(v: HTMLVideoElement, alvo: number) {
  v.pause();
  if (Math.abs(v.currentTime - alvo) > 1 / 30) v.currentTime = alvo;
}
function comecarATocar(v: HTMLVideoElement, alvo: number, velocidade: number, parado: boolean) {
  v.playbackRate = Math.min(2, Math.max(0.5, velocidade));
  v.currentTime = alvo;
  if (!parado) v.play().catch(() => {});
}
function corrigirDeriva(v: HTMLVideoElement, alvo: number) {
  if (Math.abs(v.currentTime - alvo) > 0.3) v.currentTime = alvo;
}

export default function VideoNoPalco({ url, cena, inicioDaCena, tempo, tocando, relogio, largura, altura, miniatura }: Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [falhou, setFalhou] = useState(false);
  const { inicio, duracao, velocidade, congelar } = cena;

  // Parado: o quadro do cursor.
  useEffect(() => {
    if (!video || tocando) return;
    mostrarQuadro(video, tempoNoArquivo({ inicio, duracao, velocidade, congelar }, tempo - inicioDaCena));
  }, [video, tocando, tempo, inicioDaCena, inicio, duracao, velocidade, congelar]);

  // Tocando: toca sozinho e só corrige quando se afasta do relógio.
  useEffect(() => {
    if (!video || !tocando) return;
    comecarATocar(video, tempoNoArquivo({ inicio, duracao, velocidade, congelar }, relogio.agora() - inicioDaCena), velocidade ?? 1, !!congelar);
    let ultimo = 0;
    const desassinar = relogio.assinar((t) => {
      const agora = performance.now();
      if (agora - ultimo < 250) return;
      ultimo = agora;
      corrigirDeriva(video, tempoNoArquivo({ inicio, duracao, velocidade, congelar }, t - inicioDaCena));
    });
    return () => {
      desassinar();
      mostrarQuadro(video, video.currentTime);
    };
  }, [video, tocando, relogio, inicioDaCena, inicio, duracao, velocidade, congelar]);

  const giro = cena.giro ?? 0;
  const deitado = giro === 90 || giro === 270;
  const transformacao = [`rotate(${giro}deg)`, cena.espelho ? "scaleX(-1)" : ""].filter(Boolean).join(" ");

  if (falhou) {
    return miniatura ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={miniatura} alt="" className="absolute inset-0 h-full w-full object-cover" />
    ) : null;
  }

  return (
    <video
      ref={setVideo}
      src={url}
      poster={miniatura ?? undefined}
      muted
      playsInline
      preload="auto"
      data-video-palco="1"
      onError={() => setFalhou(true)}
      className="absolute left-1/2 top-1/2 max-w-none object-cover"
      style={{
        // Girado de lado, a caixa do vídeo troca largura e altura pra continuar cobrindo o quadro.
        width: deitado ? altura : largura,
        height: deitado ? largura : altura,
        transform: `translate(-50%, -50%) ${transformacao}`,
        filter: cena.luz ? `brightness(${1 + cena.luz})` : undefined,
      }}
    />
  );
}
