// Os casos da LINHA DO TEMPO (Entrega 1 e Release 2) cujos comandos de ffmpeg são
// congelados ANTES de mexer no áudio da montagem e nas janelas de texto e peça
// (docs/planos/linha-do-tempo-spec.md, pacote P0).
//
// São os caminhos que casos-de-args.ts não cobre: a voz da narração junto com a fala do
// Você (início 0 e 2,5 -- o 2,5 é o que o conserto do áudio do apresentador vai mudar), o
// efeito das viradas com música e com voz, cada animação de peça sobreposta (PNG, GIF,
// sequência de quadros, clipe do Pexels, antes/depois com a peça na entrada 2), cada
// animação de texto desenhado, e as cenas de clipe com texto.
//
//   node --import ./scripts/ts-direto.mjs scripts/gravar-args-fixtures.ts --casos scripts/fixtures/casos-de-args-fase3.ts --saida scripts/fixtures/args-fase3-antes.json
//
// Rodar de web/: o caminho da fonte dentro do drawtext é relativo à pasta de onde roda.
// Caminhos de arquivo são falsos e fixos; o que depende da máquina é trocado por <RAIZ>,
// com a mesma normalização de casos-de-args.ts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { argsCena360, argsCenaAntesDepois, argsCenaClipe, argsCenaFoto, argsMontagem, filtrosDeTexto, type ArteNaCena, type PecaNaCena } from "../../src/lib/video-ffmpeg.ts";
import type { AnimacaoTexto, Legendas, TextoCena } from "../../src/lib/video.ts";

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
/** As oito, na ordem do tipo (video.ts). Uma lista escrita aqui, e não lida do catálogo: o
 *  conjunto de casos não pode mudar sozinho quando alguém acrescentar uma animação. */
const ANIMACOES: AnimacaoTexto[] = ["nenhuma", "surgir", "subir", "descer", "entrar_esquerda", "entrar_direita", "piscar", "no_fim"];
const clipes3 = ["/t/c0.mp4", "/t/c1.mp4", "/t/c2.mp4"];
const emendas3 = [{ xfade: "fade", segundos: 0.6 }, { xfade: "fade", segundos: 0.6 }];

// As peças como o pipeline as entrega (rasterizadas, já no tamanho).
const png = (animacao: AnimacaoTexto): PecaNaCena => ({ arquivo: "/t/selo.png", x: 612, y: 140, largura: 424, altura: 176, animacao });
const gif = (animacao: AnimacaoTexto): PecaNaCena => ({ arquivo: "/t/rindo.gif", x: 43, y: 1310, largura: 360, altura: 360, animacao, animado: true });
const sequencia = (animacao: AnimacaoTexto): PecaNaCena => ({ arquivo: "/t/mov/quadro-%03d.png", x: 540, y: 860, largura: 380, altura: 220, animacao, movimento: "pulsar", sequencia: { quadros: 25, fps: 25 } });
const pexels = (animacao: AnimacaoTexto): PecaNaCena => ({ arquivo: "/t/pexels-3196344.mp4", x: 620, y: 1290, largura: 416, altura: 416, animacao, video: true });
const arteTexto = (animacao: AnimacaoTexto): ArteNaCena => ({ arquivo: "/t/arte-preco.png", y: 1480, largura: 860, altura: 210, animacao });

const legendas: Legendas = {
  trechos: [
    { inicio: 0.7, fim: 3.1, texto: "Apartamento de três quartos no Setor Bueno" },
    { inicio: 3.1, fim: 6.4, texto: "Varanda gourmet com vista pro parque" },
    { inicio: 6.4, fim: 9.8, texto: "Agende sua visita pelo WhatsApp" },
  ],
  estilo: "contorno",
  posicao: "base",
};

const textosDaCenaClipe: TextoCena[] = [
  { texto: "Sala integrada", posicao: "base", estilo: "faixa", animacao: "subir" },
  { texto: "R$ 690.000", posicao: "topo", estilo: "destaque", animacao: "no_fim" },
];

export function casosDeArgs(): Record<string, string[]> {
  // O 360 escreve o roteiro da câmera num arquivo de nome aleatório: vai numa pasta
  // temporária e o nome é normalizado.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-args-"));
  const casos: Record<string, string[]> = {};

  // ---------- áudio da montagem ----------
  // Narração + fala do Você. Com início 0 a entrada aparada dele serve pro áudio; com 2,5 é
  // o caso em que o som sai adiantado (medido: B3 da spec) e o conserto vai mexer.
  for (const inicio of [0, 2.5]) {
    casos[`montagem_narracao_voce_com_audio_inicio_${String(inicio).replace(".", "_")}`] = normalizar(
      argsMontagem({
        clipes: clipes3,
        duracoes: [4, 5, 4],
        saida: "/t/final.mp4",
        W,
        H,
        emendas: emendas3,
        narracao: "/t/voz.mp3",
        vozVolume: 1,
        vozInicio: 0.7,
        apresentador: { arquivo: "x", formato: "circulo", canto: "inferior_direito", tamanho: "medio", entra: 2, inicio, duracao: 5, volume: 1.2, arquivoLocal: "/t/apre.mp4", temAudio: true, duracaoClipe: 9 },
      })
    );
  }
  casos.montagem_efeito_musica = normalizar(
    argsMontagem({ clipes: [...clipes3, "/t/c3.mp4"], duracoes: [4, 6, 3, 4], saida: "/t/final.mp4", W, H, emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "slideleft", segundos: 0.5 }, { xfade: "fade", segundos: 0.08 }], musica: "/t/m.m4a", musicaVolume: 0.6, efeitoSonoro: "/t/clique.m4a" })
  );
  casos.montagem_efeito_narracao = normalizar(
    argsMontagem({ clipes: clipes3, duracoes: [4, 4, 4], saida: "/t/final.mp4", W, H, emendas: emendas3, narracao: "/t/voz.webm", vozVolume: 1.4, vozInicio: 2, efeitoSonoro: "/t/passagem.m4a" })
  );
  casos.montagem_so_narracao = normalizar(
    argsMontagem({ clipes: clipes3, duracoes: [5, 5, 5], saida: "/t/final.mp4", W, H, emendas: emendas3, narracao: "/t/voz.mp3", vozVolume: 0.2, vozInicio: 3.3 })
  );
  casos.montagem_tudo = normalizar(
    argsMontagem({
      clipes: [...clipes3, "/t/c3.mp4", "/t/final-tela.mp4"],
      duracoes: [4, 5, 4, 6, 4],
      saida: "/t/final.mp4",
      W,
      H,
      emendas: [{ xfade: "fade", segundos: 0.6 }, { xfade: "slideleft", segundos: 0.5 }, { xfade: "fade", segundos: 0.08 }, { xfade: "fade", segundos: 0.6 }],
      musica: "/t/m.m4a",
      musicaVolume: 0.35,
      narracao: "/t/voz.mp3",
      vozVolume: 1.6,
      vozInicio: 1,
      efeitoSonoro: "/t/sino.m4a",
      titulo: "Apto 302",
      subtitulo: "R$ 690.000 · Setor Bueno",
      fimDoCarimbo: 17.22,
      legendas,
      apresentador: { arquivo: "x", formato: "rodape", entra: 3, inicio: 2.5, duracao: 4, volume: 1, arquivoLocal: "/t/apre.mp4", temAudio: true, duracaoClipe: 12 },
    })
  );

  // ---------- peças sobrepostas (sobreporPecas), 16 casos ----------
  // Pelo construtor da cena, que é por onde o pipeline chega nelas (pecasDaCena põe a
  // duração da cena em cada peça).
  for (const a of ANIMACOES) {
    casos[`pecas_png_${a}`] = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 6, efeito: "aproximar", pecas: [png(a)] }));
  }
  casos.pecas_gif_nenhuma = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 5, efeito: "parado", pecas: [gif("nenhuma")] }));
  casos.pecas_gif_surgir = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 8, efeito: "direita", pecas: [gif("surgir")] }));
  casos.pecas_sequencia_nenhuma = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 5, efeito: "afastar", pecas: [sequencia("nenhuma")] }));
  // Texto com efeito e movimento: vira sequência de quadros e entra como ARTE (centrada).
  casos.pecas_sequencia_piscar = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 6, efeito: "aproximar", artes: [{ arquivo: "/t/arte-mov/quadro-%03d.png", y: 700, largura: 760, altura: 240, animacao: "piscar", movimento: "balancar", sequencia: { quadros: 25, fps: 25 } }] }));
  casos.pecas_pexels_nenhuma = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 4, efeito: "cima", pecas: [pexels("nenhuma")] }));
  casos.pecas_pexels_entrar_direita = normalizar(argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 7, efeito: "baixo", pecas: [pexels("entrar_direita")] }));
  // Antes e depois: as duas fotos ocupam as entradas 0 e 1, a primeira peça é a 2.
  casos.pecas_antes_depois_indice_2 = normalizar(
    argsCenaAntesDepois({ antes: "/t/a.jpg", depois: "/t/d.jpg", saida: "/t/c.mp4", W, H, duracao: 6, artes: [arteTexto("subir")], pecas: [png("no_fim"), gif("piscar")] })
  );
  // Tudo numa cena só, na ordem do desenho: arte primeiro, depois as peças.
  casos.pecas_mistura_na_ordem = normalizar(
    argsCenaFoto({ foto: "/t/f.jpg", saida: "/t/c.mp4", W, H, duracao: 8, efeito: "aproximar", textos: [{ texto: "Vista mar", posicao: "topo", estilo: "faixa", animacao: "surgir" }], topoOcupado: true, artes: [arteTexto("no_fim")], pecas: [png("descer"), gif("nenhuma"), sequencia("entrar_esquerda"), pexels("surgir")] })
  );

  // ---------- textos desenhados (filtrosDeTexto), uma por animação ----------
  // Três textos, dois na mesma posição (empilham) e um com visual próprio, com o topo
  // ocupado pelo carimbo e cena de 6s (o "só no fim" cai em 3,72).
  for (const a of ANIMACOES) {
    casos[`texto_${a}`] = filtrosDeTexto(
      [
        { texto: "R$ 690.000", posicao: "base", estilo: "destaque", animacao: a },
        { texto: "Vista mar", posicao: "base", estilo: "faixa", animacao: a, visual: { cor: "ffffff", caixa: null, contorno: "000000" } },
        { texto: "Lançamento", posicao: "topo", estilo: "etiqueta", animacao: a },
      ],
      W,
      H,
      true,
      6
    ).map((f) => normalizar([f])[0]);
  }

  // ---------- cenas de clipe com texto ----------
  // As que ganham `setpts=PTS-STARTPTS` quando um item tiver janela (Release 2); sem
  // janela, o comando tem que sair igual a este.
  casos.cena_clipe_inicio_velocidade_textos = normalizar(
    argsCenaClipe({ clipe: "/t/v.mp4", saida: "/t/c.mp4", W, H, duracao: 6, inicio: 1, velocidade: 1.5, textos: textosDaCenaClipe, pecas: [png("surgir")] })
  );
  casos.cena_clipe_melhorar_giro_textos = normalizar(
    argsCenaClipe({ clipe: "/t/v.mp4", saida: "/t/c.mp4", W, H, duracao: 8, melhorar: true, giro: 90, espelho: true, velocidade: 0.5, topoOcupado: true, textos: [{ texto: "Suíte master", posicao: "centro", estilo: "sombra", animacao: "piscar", visual: { cor: "f06b4f", sombra: true } }], artes: [arteTexto("entrar_esquerda")] })
  );
  casos.cena_360_video_textos = normalizar(
    argsCena360({ entrada: "/t/p360.mp4", ehVideo: true, saida: "/t/c.mp4", dirTrabalho: tmp, W, H, duracao: 8, movimento: "giro_completo", textos: textosDaCenaClipe, pecas: [sequencia("nenhuma")] })
  );
  casos.cena_antes_depois_textos_pecas = normalizar(
    argsCenaAntesDepois({ antes: "/t/a.jpg", depois: "/t/d.jpg", saida: "/t/c.mp4", W, H, duracao: 8, topoOcupado: true, textos: [{ texto: "Reforma completa", posicao: "topo", estilo: "selo", animacao: "descer" }, { texto: "Antes de 2025", posicao: "base", estilo: "fino", animacao: "no_fim" }], pecas: [pexels("piscar")] })
  );

  fs.rmSync(tmp, { recursive: true, force: true });
  return casos;
}
