import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

// TEXTO QUE O SERVIDOR DESENHA: CONTORNO, NÃO FONTE.
//
// 21/09/2026. Ele marcou um terreno, digitou os metros de cada lado, gerou a imagem e as
// medidas não estavam lá -- nem elas, nem a área, nem o título, nem o aviso legal "medidas
// aproximadas". Tudo virou glifo vazio (▯). Reproduzido em produção com foto real.
//
// A causa não é o sharp nem o SVG: é que `<text font-family="...">` só funciona se existir
// um ARQUIVO de fonte onde o desenho acontece, e no servidor da Vercel não existe nenhum --
// nem Arial, nem DejaVu, nem o genérico `sans-serif`, que precisa de arquivos de alias que
// também não estão lá. Na máquina de quem programa nunca aparece, porque o Windows tem
// fonte. Duas tentativas de conserto pela LISTA de fontes falharam pelo mesmo motivo: não
// adianta pedir um nome melhor quando não há arquivo nenhum do outro lado.
//
// O projeto já sabia disso e já tinha resolvido -- em outro lugar. `efeitos-texto/nucleo.ts`
// diz, desde que nasceu: "a fonte real dependia do que estivesse instalado onde o SVG fosse
// desenhado -- no servidor da Vercel, praticamente nada", e desenha os efeitos de texto como
// PATH, lendo o .ttf com opentype.js. Este módulo leva a mesma solução pro resto: medidas do
// terreno, cotas e nomes de cômodo da planta, selo de imagem ilustrativa, capa do book.
//
// Contorno não depende de fonte instalada em lugar nenhum, sai igual na máquina de quem
// programa e no servidor, e não tem como "sumir".
//
// Só servidor: lê arquivo. Quem monta SVG pra tela (planta-svg) recebe o desenhista de fora.

/** A fonte do Encena, a mesma que o ffmpeg usa na legenda do vídeo (OFL, cópia em assets). */
const ARQUIVO = "Geist-SemiBold.ttf";

let cache: opentype.Font | null = null;

function fonte(): opentype.Font {
  if (cache) return cache;
  const candidatos = [
    path.join(process.cwd(), "assets", "fontes", ARQUIVO),
    path.join(process.cwd(), "web", "assets", "fontes", ARQUIVO),
    path.resolve(import.meta.dirname ?? ".", "..", "..", "assets", "fontes", ARQUIVO),
  ];
  const achado = candidatos.find((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  });
  if (!achado) throw new Error(`Não achei a fonte ${ARQUIVO}. Ela precisa estar em assets/fontes e listada no outputFileTracingIncludes da rota.`);
  const b = fs.readFileSync(achado);
  cache = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return cache;
}

export type AncoraTexto = "start" | "middle" | "end";

export type OpcoesTexto = {
  /** Onde o texto começa (ou o meio/fim dele, conforme a âncora). */
  x: number;
  /** A LINHA DE BASE, igual ao `y` de um `<text>` -- as contas de quem chama não mudam. */
  y: number;
  corpo: number;
  cor?: string;
  ancora?: AncoraTexto;
  opacidade?: number;
};

/** Largura do texto em pixels, pra centralizar caixa, medir balão e quebrar linha. */
export function larguraDoTexto(texto: string, corpo: number): number {
  if (!texto) return 0;
  return fonte().getAdvanceWidth(texto, corpo);
}

/**
 * O texto como `<path>`, pronto pra entrar no SVG.
 *
 * Devolve "" pra texto vazio (e não um path vazio) pra quem concatena não ganhar lixo.
 */
export function textoSvg(texto: string, o: OpcoesTexto): string {
  const t = String(texto ?? "");
  if (!t.trim()) return "";
  const f = fonte();
  const ancora = o.ancora ?? "start";
  const largura = f.getAdvanceWidth(t, o.corpo);
  const x = ancora === "middle" ? o.x - largura / 2 : ancora === "end" ? o.x - largura : o.x;
  const d = f.getPath(t, x, o.y, o.corpo).toPathData(2);
  if (!d) return "";
  const opacidade = o.opacidade !== undefined && o.opacidade !== 1 ? ` fill-opacity="${o.opacidade}"` : "";
  return `<path d="${d}" fill="${o.cor ?? "#000000"}"${opacidade}/>`;
}
