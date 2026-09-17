// OS ELEMENTOS no arquivo final, medidos em pixel.
//
// A peça atravessa quatro lugares onde ela pode sumir sem dar erro: o catálogo desenha
// um SVG vazio, o sharp escreve um PNG transparente, o saneador da API joga o campo
// fora, ou a entrada entra no comando sem o filtro que a usa. Os quatro dão um vídeo
// bonito, sem a peça.
//
// Então mede-se o que cada uma promete, no quadro que saiu:
//
//   peça ancorada     -> o quadro muda DENTRO da caixa dela e não muda fora
//   moldura / cantos  -> a BORDA muda e o miolo não (senão é um véu por cima do imóvel)
//   duas na mesma âncora -> saem em alturas diferentes, e não uma em cima da outra
//   saneamento        -> o que a barra escolheu sobrevive; o que veio torto some
//
// Foto REAL de imóvel (docs/testes-reais).
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-elementos.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { argsCenaFoto } from "../src/lib/video-ffmpeg.ts";
import { rasterizarElementos } from "../src/lib/elementos-servidor.ts";
import { MODELOS_ELEMENTO, FICHA_EXEMPLO, ELEMENTO_POR_ID } from "../src/lib/elementos.ts";
import { limparEspec, type ElementoCena } from "../src/lib/video.ts";
import { ADESIVOS, arquivoDeAdesivo, buscarAdesivos } from "../src/lib/adesivos.ts";

const ffmpeg = ffmpegStatic as unknown as string;
const RAIZ = path.resolve(import.meta.dirname, "..");
const FOTOS = path.join(RAIZ, "..", "docs", "testes-reais");
const SAIDA = path.join(FOTOS, "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-elem-"));

const W = 540;
const H = 960;
const DUR = 3;
const COR = "#f06b4f";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

function rodar(args: string[]) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr ?? "").trim().slice(0, 500) || "ffmpeg falhou");
}

type Quadro = { data: Buffer; largura: number; altura: number };

async function quadro(video: string, nome: string, em = "1.50"): Promise<Quadro> {
  const png = path.join(tmp, `${nome}.png`);
  rodar(["-ss", em, "-i", video, "-frames:v", "1", png]);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, largura: info.width, altura: info.height };
}

type Caixa = { x: number; y: number; largura: number; altura: number };

/** Uma mudança FORTE: acima disso o pixel foi pintado, não é ruído de recompressão. */
const PINTADO = 40;

/**
 * Quanto mudou dentro e fora de um retângulo, de dois jeitos.
 *
 * `media` é a diferença média; `parte` é a FRAÇÃO de pixels que mudaram de verdade.
 *
 * A média sozinha não serve pra peça de traço. Uma seta desenhada com 17px de traço
 * numa caixa de 154x154 pinta um oitavo da caixa: o traço é berrante, a média fica em 9,
 * e um limiar de média reprova a peça que está visivelmente lá. A fração mede a
 * propriedade certa -- "tem tinta nova aqui?" -- e vale igual pra um selo cheio e pra
 * uma linha fina.
 */
function diferenca(a: Quadro, b: Quadro, caixa: Caixa) {
  let somaDentro = 0;
  let pintadosDentro = 0;
  let nDentro = 0;
  let somaFora = 0;
  let pintadosFora = 0;
  let nFora = 0;
  for (let y = 0; y < a.altura; y++) {
    for (let x = 0; x < a.largura; x++) {
      const i = (y * a.largura + x) * 3;
      const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
      if (x >= caixa.x && x < caixa.x + caixa.largura && y >= caixa.y && y < caixa.y + caixa.altura) {
        somaDentro += d;
        if (d > PINTADO) pintadosDentro++;
        nDentro++;
      } else {
        somaFora += d;
        if (d > PINTADO) pintadosFora++;
        nFora++;
      }
    }
  }
  return {
    dentro: somaDentro / Math.max(1, nDentro),
    fora: somaFora / Math.max(1, nFora),
    parteDentro: pintadosDentro / Math.max(1, nDentro),
    parteFora: pintadosFora / Math.max(1, nFora),
  };
}

const foto = path.join(FOTOS, "01-mobiliar-depois.jpg");
if (!fs.existsSync(foto)) {
  console.error(`foto real faltando: ${foto}`);
  process.exit(1);
}

console.log(`elementos medidos no arquivo final · ${W}x${H} · ${DUR}s\n`);

const semNada = path.join(tmp, "controle.mp4");
rodar(argsCenaFoto({ foto, saida: semNada, W, H, duracao: DUR, efeito: "parado", textos: [] }));
const controle = await quadro(semNada, "controle");

// ---------- 1. cada modelo aparece, no lugar dele ----------
for (const modelo of MODELOS_ELEMENTO) {
  const e: ElementoCena = {
    id: modelo.id,
    ...(modelo.usa === "texto" ? { texto: modelo.exemplo ?? "" } : {}),
    ...(modelo.usa === "ficha" ? { itens: FICHA_EXEMPLO } : {}),
    cor: COR,
  };
  const pecas = await rasterizarElementos([e], W, H, tmp, `m-${modelo.id}`, {});
  if (pecas.length !== 1) {
    conferir(false, `${modelo.id}: rasterizou`, `${pecas.length} peças`);
    continue;
  }
  const peca = pecas[0];
  const saida = path.join(tmp, `el-${modelo.id}.mp4`);
  rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas }));
  const q = await quadro(saida, `el-${modelo.id}`);

  if (modelo.quadroInteiro) {
    // Moldura pinta a BORDA. O miolo tem que continuar sendo o imóvel -- uma peça de
    // quadro inteiro que escurece o centro é um véu, não uma moldura.
    const miolo = { x: Math.round(W * 0.2), y: Math.round(H * 0.2), largura: Math.round(W * 0.6), altura: Math.round(H * 0.6) };
    const d = diferenca(controle, q, miolo);
    conferir(
      d.parteFora > 0.002 && d.parteDentro < 0.0005,
      `${modelo.id}: pinta a borda e não o miolo`,
      `borda ${(d.parteFora * 100).toFixed(2)}% · miolo ${(d.parteDentro * 100).toFixed(3)}%`
    );
    continue;
  }

  const d = diferenca(controle, q, peca);
  conferir(
    d.parteDentro > 0.03 && d.parteFora < 0.001,
    `${modelo.id} aparece no vídeo`,
    `pintado ${(d.parteDentro * 100).toFixed(1)}% da caixa · fora ${(d.parteFora * 100).toFixed(3)}% · ${peca.largura}x${peca.altura} em (${peca.x},${peca.y})`
  );
}

// ---------- 1b. o selo redondo não escapa do círculo ----------
//
// Texto que passa da borda não levanta erro: sai cortado pelo quadro do SVG e vira um
// selo feio. A prova é geométrica -- nenhum pixel pintado pode cair FORA do círculo
// inscrito na caixa da peça.
{
  const pecas = await rasterizarElementos([{ id: "selo_redondo", texto: "À VENDA", cor: COR }], W, H, tmp, "selo", {});
  const peca = pecas[0];
  const q = await quadro(path.join(tmp, "el-selo_redondo.mp4"), "selo-q");
  const cx = peca.x + peca.largura / 2;
  const cy = peca.y + peca.altura / 2;
  const r = Math.min(peca.largura, peca.altura) / 2;
  let foraDoCirculo = 0;
  for (let y = peca.y; y < peca.y + peca.altura; y++) {
    for (let x = peca.x; x < peca.x + peca.largura; x++) {
      const i = (y * W + x) * 3;
      const d = (Math.abs(controle.data[i] - q.data[i]) + Math.abs(controle.data[i + 1] - q.data[i + 1]) + Math.abs(controle.data[i + 2] - q.data[i + 2])) / 3;
      if (d > PINTADO && Math.hypot(x - cx, y - cy) > r) foraDoCirculo++;
    }
  }
  conferir(foraDoCirculo < 40, "o selo redondo não pinta fora do próprio círculo", `${foraDoCirculo} pixels fora`);
}

// ---------- 1c. nenhuma peça fechada corta a própria letra ----------
//
// Texto que não cabe não dá erro: o quadro do SVG simplesmente não desenha o pedaço de
// fora. Olhar a borda por tinta é frágil -- um "1" cortado deixa uma lasca de 2 pixels.
//
// A medida robusta é a TINTA QUE SUMIU. Rasteriza a peça duas vezes: como ela é, e com a
// janela do SVG alargada pros dois lados (mesma escala, nada cortado). Se a versão larga
// tem mais tinta da cor da letra, essa diferença é exatamente a letra que estava sendo
// jogada fora. Anel e fundo não mudam entre as duas, então não entram na conta.
async function tintaDaLetra(svg: string, ehLetra: (r: number, g: number, b: number) => boolean) {
  const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i + 3] > 160 && ehLetra(data[i], data[i + 1], data[i + 2])) n++;
  return n;
}

function alargar(svg: string, margem: number): string {
  return svg.replace(/<svg ([^>]*?)width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)">/, (_t, pre, w, h, vw, vh) => {
    const L = Number(w) + margem * 2;
    return `<svg ${pre}width="${L}" height="${h}" viewBox="${-margem} 0 ${Number(vw) + margem * 2} ${vh}">`;
  });
}

{
  const casos: { id: string; ehLetra: (r: number, g: number, b: number) => boolean }[] = [
    // metragem: letra índigo sobre branco
    { id: "metragem", ehLetra: (r, g, b) => r < 60 && g < 90 && b < 130 && b > r },
    // selo: letra branca sobre coral (o anel branco fica inteiro dentro e se cancela)
    { id: "selo_redondo", ehLetra: (r, g, b) => r > 235 && g > 235 && b > 235 },
  ];
  for (const { id, ehLetra } of casos) {
    const modelo = ELEMENTO_POR_ID[id];
    for (const texto of [modelo.exemplo ?? "", "1.250 m²", "EXCLUSIVO"]) {
      const d = modelo.desenhar({ texto, itens: [], cor: COR }, { alt: Math.round(H * modelo.corpo), W, H });
      const normal = await tintaDaLetra(d.svg, ehLetra);
      const largo = await tintaDaLetra(alargar(d.svg, d.largura), ehLetra);
      const perdida = largo - normal;
      conferir(perdida < 6, `${id} "${texto}" não corta a própria letra`, `${perdida} pixels de letra fora da peça`);
    }
  }
}

// ---------- 2. duas peças na mesma âncora não se cobrem ----------
const mesmaAncora: ElementoCena[] = [
  { id: "selo_redondo", texto: "À VENDA", ancora: "topo_dir", cor: COR },
  { id: "metragem", texto: "120 m²", ancora: "topo_dir", cor: COR },
];
const empilhadas = await rasterizarElementos(mesmaAncora, W, H, tmp, "pilha", {});
const seSobrepoem =
  empilhadas.length === 2 &&
  empilhadas[0].y < empilhadas[1].y + empilhadas[1].altura &&
  empilhadas[1].y < empilhadas[0].y + empilhadas[0].altura;
conferir(
  empilhadas.length === 2 && !seSobrepoem,
  "duas peças no mesmo canto empilham em vez de se cobrir",
  empilhadas.map((p) => `y=${p.y} h=${p.altura}`).join(" · ")
);

// ---------- 3. o topo ocupado empurra a peça pra baixo do título ----------
const semTitulo = await rasterizarElementos([{ id: "local", texto: "Jardins", ancora: "topo_esq", cor: COR }], W, H, tmp, "t0", {});
const comTitulo = await rasterizarElementos([{ id: "local", texto: "Jardins", ancora: "topo_esq", cor: COR }], W, H, tmp, "t1", { topoOcupado: true });
conferir(
  comTitulo[0].y > semTitulo[0].y + 20,
  "com título no vídeo, a peça de cima desce pra não ficar por baixo dele",
  `${semTitulo[0].y} -> ${comTitulo[0].y}`
);

// ---------- 4. o saneamento ----------
const { espec, erro } = limparEspec({
  formato: "9:16",
  cenas: [
    {
      tipo: "foto",
      jobId: "00000000-0000-0000-0000-000000000000",
      duracao: 4,
      elementos: [
        { id: "ficha_barra", itens: [{ icone: "quarto", texto: "3" }, { icone: "chapeu", texto: "9" }], ancora: "base", cor: "#123456" },
        { id: "selo_redondo", texto: "À VENDA", ancora: "topo_dir" },
        { id: "modelo_que_nao_existe", texto: "x" },
        { id: "balao" },
      ],
    },
  ],
});
if (!espec) {
  conferir(false, "o saneamento aceita o espec com elementos", erro ?? "");
} else {
  const els = espec.cenas[0].elementos ?? [];
  conferir(els.length === 2, "modelo inexistente e peça de texto sem texto são recusados", `sobraram ${els.length}`);
  conferir(els[0]?.id === "ficha_barra" && els[0].itens?.length === 1, "ícone desconhecido sai da ficha", `itens=${els[0]?.itens?.length ?? 0}`);
  conferir(els[0]?.cor === "#123456", "a cor da marca sobrevive", `cor=${els[0]?.cor ?? "sumiu"}`);
  conferir(els[1]?.id === "selo_redondo" && els[1].ancora === "topo_dir", "âncora sobrevive");
  conferir(els[1]?.cor === undefined, "cor inválida não é inventada");
}

// Limite por cena: mandar cinco não faz cinco entrarem.
const demais = limparEspec({
  formato: "9:16",
  cenas: [
    {
      tipo: "foto",
      jobId: "00000000-0000-0000-0000-000000000000",
      duracao: 4,
      elementos: Array.from({ length: 5 }, () => ({ id: "cantos" })),
    },
  ],
});
conferir((demais.espec?.cenas[0].elementos?.length ?? 9) === 3, "o limite de peças por cena é respeitado", `${demais.espec?.cenas[0].elementos?.length ?? "?"} peças`);

// ---------- 5. adesivos 3D: catálogo, saneador e vídeo ----------
//
// O adesivo é a peça que mais facilmente some calada: o id passa no saneador, o arquivo não
// está no disco (ou não foi pro pacote da função), e `rasterizarElementos` pula a peça sem
// erro. Então: todo id listado tem arquivo e todo arquivo está listado; e um adesivo passa
// pelo CAMINHO inteiro -- saneador, rasterização, ffmpeg -- e aparece no quadro.
{
  const pasta = path.join(RAIZ, "public", "adesivos");
  // O nome do arquivo com extensão: GIF animado é .gif, o resto .png. Um GIF salvo como
  // .png (ou o contrário) passaria num teste só de id e sumiria no vídeo.
  const noDisco = new Set(fs.readdirSync(pasta).filter((f) => /\.(png|gif)$/.test(f)));
  const esperados = new Set(ADESIVOS.map((a) => arquivoDeAdesivo(a.id)));
  const semArquivo = [...esperados].filter((f) => !noDisco.has(f));
  const sobrando = [...noDisco].filter((f) => !esperados.has(f));
  conferir(semArquivo.length === 0, "todo adesivo e GIF do catálogo tem arquivo, com a extensão certa", semArquivo.join(", "));
  conferir(sobrando.length === 0, "nenhum arquivo de adesivo fora do catálogo", sobrando.join(", "));
  conferir(fs.existsSync(path.join(pasta, "LICENSE-fluent-emoji.txt")), "a licença MIT da biblioteca está junto dos arquivos");
  const animados = ADESIVOS.filter((a) => a.animado);
  const semMini = animados.filter((a) => !fs.existsSync(path.join(pasta, "mini", `${a.id}.webp`))).map((a) => a.id);
  conferir(animados.length >= 40, "a aba de GIFs tem GIFs de verdade", `${animados.length}`);
  conferir(semMini.length === 0, "todo GIF tem miniatura leve pra galeria", semMini.join(", "));
  conferir(fs.existsSync(path.join(pasta, "LICENSE-noto-emoji-animation.txt")), "o crédito CC BY dos GIFs está junto dos arquivos");
  const pesados = animados.filter((a) => fs.statSync(path.join(pasta, `${a.id}.gif`)).size > 900 * 1024).map((a) => a.id);
  conferir(pesados.length === 0, "nenhum GIF passa de 900 KB", pesados.join(", "));
  conferir(buscarAdesivos("rir", true).length >= 3 && buscarAdesivos("rir", true).every((a) => a.animado), "busca na aba de GIFs só acha GIF", `${buscarAdesivos("rir", true).length}`);
  conferir(buscarAdesivos("rindo", false).every((a) => !a.animado), "busca na aba de adesivos não mistura GIF");

  // A busca é o jeito de achar no celular: sem acento, e cada palavra tem que aparecer.
  conferir(buscarAdesivos("camera").some((a) => a.id === "camera"), "busca sem acento acha \"Câmera\"");
  conferir(buscarAdesivos("pet").length >= 2, "busca por \"pet\" acha os adesivos de animal", `${buscarAdesivos("pet").length}`);
  conferir(buscarAdesivos("xyzqw").length === 0, "busca sem resultado devolve vazio");

  const { espec } = limparEspec({
    formato: "9:16",
    cenas: [
      {
        tipo: "foto",
        jobId: "00000000-0000-0000-0000-000000000000",
        duracao: 4,
        elementos: [
          { id: "adesivo:chave", ancora: "topo_dir", tamanho: 0.14, animacao: "nenhuma", texto: "ignorado", cor: "#ff0000" },
          { id: "adesivo:nao_existe" },
          { id: "adesivo:../../etc/passwd" },
        ],
      },
    ],
  });
  const els = espec?.cenas[0].elementos ?? [];
  conferir(els.length === 1 && els[0].id === "adesivo:chave", "saneador: adesivo que existe passa, inventado e caminho torto não", els.map((e) => e.id).join(", "));
  conferir(els[0] && els[0].texto === undefined && els[0].cor === undefined, "saneador: adesivo não carrega texto nem cor");

  const pecas = await rasterizarElementos(els, W, H, tmp, "adesivo", {});
  conferir(pecas.length === 1, "o adesivo vira peça na rasterização", `${pecas.length} peça(s)`);
  if (pecas.length === 1) {
    const peca = pecas[0];
    const lado = Math.round(H * 0.14);
    conferir(peca.largura === lado && peca.altura === lado, "tamanho é fração da altura do vídeo", `${peca.largura}x${peca.altura}, esperado ${lado}`);
    const saida = path.join(tmp, "adesivo.mp4");
    rodar(argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas }));
    const q = await quadro(saida, "adesivo");
    const d = diferenca(controle, q, peca);
    conferir(
      d.parteDentro > 0.1 && d.parteFora < 0.001,
      "a chave 3D aparece no vídeo, no canto de cima à direita",
      `pintado ${(d.parteDentro * 100).toFixed(1)}% · fora ${(d.parteFora * 100).toFixed(3)}% · (${peca.x},${peca.y})`
    );
    conferir(peca.x + peca.largura > W * 0.9 && peca.y < H * 0.1, "e está mesmo no canto de cima à direita", `x ${peca.x} y ${peca.y}`);
  }

  // GIF: três jeitos de sumir calado. (1) O sharp guarda só o 1º quadro e o GIF sai parado.
  // (2) Sem `-ignore_loop 0` ele toca uma vez e congela. (3) Entrada em laço nunca acaba:
  // sem `shortest`, o ffmpeg não termina a cena. Então: termina no tempo, aparece desde o
  // começo, e MEXE (o miolo da peça muda entre dois instantes).
  const gifEls = limparEspec({
    formato: "9:16",
    cenas: [{ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4, elementos: [{ id: "adesivo:gif_chorando_de_rir", ancora: "topo_esq", tamanho: 0.2, animacao: "nenhuma" }] }],
  }).espec?.cenas[0].elementos ?? [];
  conferir(gifEls.length === 1, "saneador: GIF que existe passa", gifEls.map((e) => e.id).join(", "));
  const pecasGif = await rasterizarElementos(gifEls, W, H, tmp, "gif", {});
  conferir(pecasGif.length === 1 && !!pecasGif[0].animado && pecasGif[0].arquivo.endsWith(".gif"), "o GIF entra inteiro na montagem (não vira PNG parado)", pecasGif[0]?.arquivo.slice(-30) ?? "sem peça");
  if (pecasGif.length === 1) {
    const peca = pecasGif[0];
    const saida = path.join(tmp, "gif.mp4");
    const t0 = Date.now();
    const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...argsCenaFoto({ foto, saida, W, H, duracao: DUR, efeito: "parado", textos: [], pecas: pecasGif })], { encoding: "utf8", timeout: 90_000 });
    const segundos = (Date.now() - t0) / 1000;
    conferir(r.status === 0, "a cena com GIF termina (o laço não prende o ffmpeg)", r.status === 0 ? `${segundos.toFixed(1)}s` : `status ${r.status} ${r.error ?? ""} ${(r.stderr ?? "").slice(0, 160)}`);
    if (r.status === 0) {
      const info = spawnSync(ffmpeg, ["-hide_banner", "-i", saida], { encoding: "utf8" }).stderr ?? "";
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
      const dur = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : -1;
      conferir(Math.abs(dur - DUR) < 0.2, "e dura o que a cena dura", `${dur.toFixed(2)}s de ${DUR}s`);
      const cedo = await quadro(saida, "gif-cedo", "0.20");
      const a = await quadro(saida, "gif-a", "1.00");
      const b = await quadro(saida, "gif-b", "1.50");
      const dCedo = diferenca(controle, cedo, peca);
      const dA = diferenca(controle, a, peca);
      conferir(dCedo.parteDentro > 0.1 && dA.parteFora < 0.001, "o GIF aparece desde o começo, no canto dele", `0,2s: ${(dCedo.parteDentro * 100).toFixed(1)}% · fora ${(dA.parteFora * 100).toFixed(3)}% · (${peca.x},${peca.y})`);
      const mexe = diferenca(a, b, peca);
      conferir(mexe.parteDentro > 0.02 && mexe.parteFora < 0.001, "e MEXE: o miolo muda entre 1,0s e 1,5s", `mudou ${(mexe.parteDentro * 100).toFixed(1)}% da peça`);
    }
  }
}

// ---------- folha de contato ----------
const mostrar = ["ficha_barra", "ficha_cartao", "selo_redondo", "etiqueta_preco", "whatsapp", "cantos"].filter((id) => ELEMENTO_POR_ID[id]);
const tira = path.join(SAIDA, "elementos-no-video.jpg");
rodar([
  ...mostrar.flatMap((id) => ["-ss", "1.5", "-i", path.join(tmp, `el-${id}.mp4`)]),
  "-filter_complex",
  `${mostrar.map((_, i) => `[${i}:v]scale=300:-2,setpts=PTS-STARTPTS[v${i}]`).join(";")};${mostrar.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${mostrar.length}[out]`,
  "-map", "[out]", "-frames:v", "1", "-q:v", "3", tira,
]);
console.log(`\nfolha de contato: ${path.relative(path.join(RAIZ, ".."), tira)}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
