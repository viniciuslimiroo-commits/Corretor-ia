// Os casos fixos cujos comandos de ffmpeg são congelados (ver gravar-args-fixtures.ts).
//
// Caminhos de arquivo são falsos e fixos; o que depende da máquina (a pasta do projeto,
// na fonte do drawtext) é trocado por <RAIZ>, pra comparação não depender de onde roda.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { argsCena360, argsCenaAntesDepois, argsCenaClipe, argsCenaFoto, argsMontagem } from "../../src/lib/video-ffmpeg.ts";
import type { TextoCena } from "../../src/lib/video.ts";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

function normalizar(args: string[]): string[] {
  const raizBarra = RAIZ.replace(/\\/g, "/");
  return args.map((a) =>
    a
      .split(RAIZ)
      .join("<RAIZ>")
      .split(raizBarra)
      .join("<RAIZ>")
      // O 360 grava o roteiro da câmera num arquivo de nome aleatório, numa pasta temporária.
      .replace(/[^'=]*encena-args-[A-Za-z0-9]+[\\/]cmd360-[a-z0-9]+\.txt/g, "<TMP>/cmd360.txt")
  );
}

const W = 1080;
const H = 1920;
const textoNoFim: TextoCena[] = [
  { texto: "R$ 690.000", posicao: "base", estilo: "gigante", animacao: "no_fim" },
  { texto: "Vista mar", posicao: "topo", estilo: "faixa", animacao: "surgir" },
];

export function casosDeArgs(): Record<string, string[]> {
  const clipes3 = ["/t/c0.mp4", "/t/c1.mp4", "/t/c2.mp4"];
  // O 360 escreve o roteiro da câmera num arquivo de nome aleatório: vai numa pasta
  // temporária e o nome é normalizado.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-args-"));
  return {
    montagem_dissolver_musica: normalizar(
      argsMontagem({ clipes: clipes3, duracoes: [4, 5, 4], saida: "/t/final.mp4", W, H, emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }], musica: "/t/m.m4a", titulo: "Apto 302", subtitulo: "Setor Bueno", fimDoCarimbo: 11.8, musicaVolume: 0.8 })
    ),
    montagem_misto_tela_final: normalizar(
      argsMontagem({ clipes: [...clipes3, "/t/final-tela.mp4"], duracoes: [3, 6, 4, 4], saida: "/t/final.mp4", W, H, emendas: [{ xfade: "fade", segundos: 0.08 }, { xfade: "slideleft", segundos: 0.5 }, { xfade: "fade", segundos: 0.6 }], musica: "/t/m.m4a" })
    ),
    montagem_narracao_musica: normalizar(
      argsMontagem({ clipes: clipes3, duracoes: [4, 4, 4], saida: "/t/final.mp4", W, H, emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }], musica: "/t/m.m4a", narracao: "/t/voz.mp3", vozVolume: 1.2, vozInicio: 1.5 })
    ),
    // CONSERTO esperado: sem música e sem voz, o som das viradas sumia depois da primeira.
    montagem_efeito_sem_musica: normalizar(
      argsMontagem({ clipes: clipes3, duracoes: [4, 4, 4], saida: "/t/final.mp4", W, H, emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }], efeitoSonoro: "/t/clique.mp3" })
    ),
    // CONSERTO esperado: o Você que entra depois do começo saía adiantado e congelava.
    montagem_voce_circulo_entra_tarde: normalizar(
      argsMontagem({
        clipes: clipes3,
        duracoes: [4, 4, 4],
        saida: "/t/final.mp4",
        W,
        H,
        emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }],
        musica: "/t/m.m4a",
        apresentador: { arquivo: "x", formato: "circulo", canto: "inferior_direito", tamanho: "medio", entra: 6.8, inicio: 1, volume: 1, arquivoLocal: "/t/apre.mp4", temAudio: true, duracaoClipe: 5 },
      })
    ),
    montagem_voce_rodape_do_inicio: normalizar(
      argsMontagem({
        clipes: clipes3,
        duracoes: [4, 4, 4],
        saida: "/t/final.mp4",
        W,
        H,
        emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }],
        apresentador: { arquivo: "x", formato: "rodape", entra: 0, inicio: 0, volume: 1, arquivoLocal: "/t/apre.mp4", temAudio: false, duracaoClipe: 8 },
      })
    ),
    cena_foto_textos: normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 6, efeito: "parado", textos: textoNoFim })),
    // CONSERTO esperado: clipe, antes/depois e 360 calculavam o "só no fim" com 4s fixos.
    cena_clipe_textos: normalizar(argsCenaClipe({ clipe: "/t/v.mp4", saida: "/t/c.mp4", W, H, duracao: 8, textos: textoNoFim })),
    cena_antes_depois_textos: normalizar(argsCenaAntesDepois({ antes: "/t/a.jpg", depois: "/t/d.jpg", saida: "/t/c.mp4", W, H, duracao: 6, textos: textoNoFim })),
    cena_360_textos: normalizar(argsCena360({ entrada: "/t/p.jpg", ehVideo: false, saida: "/t/c.mp4", dirTrabalho: tmp, W, H, duracao: 8, movimento: "olhar_volta", textos: textoNoFim })),
  };
}
