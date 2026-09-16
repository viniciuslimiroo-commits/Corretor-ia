import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

// NÚCLEO DOS EFEITOS DE TEXTO: fonte de verdade transformada em CONTORNO vetorial.
//
// Os modelos anteriores escreviam `<text font-family="Geist, Segoe UI...">` dentro do SVG.
// Duas coisas matavam a qualidade: a fonte era a mesma pra tudo (então todo "modelo" era
// a mesma letra com outra cor), e a fonte real dependia do que estivesse instalado onde o
// SVG fosse desenhado -- no servidor da Vercel, praticamente nada.
//
// Aqui a letra vira PATH, lida do arquivo .ttf com opentype.js. O desenho não depende de
// fonte instalada em lugar nenhum: o servidor rasteriza os caminhos, e a mesma string de
// SVG pode ir pra tela. As fontes são do Google Fonts, com licença de uso comercial (OFL
// ou Apache), cópia em assets/fontes/ junto do arquivo de licença de cada uma.
//
// Só servidor (lê arquivo). A tela recebe o SVG pronto de uma rota de API.

export const FONTES = {
  anton: "Anton-Regular.ttf",
  bebas: "BebasNeue-Regular.ttf",
  lilita: "LilitaOne-Regular.ttf",
  luckiest: "LuckiestGuy-Regular.ttf",
  bungee: "Bungee-Regular.ttf",
  bungee_shade: "BungeeShade-Regular.ttf",
  monoton: "Monoton-Regular.ttf",
  pacifico: "Pacifico-Regular.ttf",
  righteous: "Righteous-Regular.ttf",
  abril: "AbrilFatface-Regular.ttf",
  great_vibes: "GreatVibes-Regular.ttf",
  archivo: "ArchivoBlack-Regular.ttf",
  rubik_mono: "RubikMonoOne-Regular.ttf",
  cinzel: "Cinzel.ttf",
  poppins: "Poppins-ExtraBold.ttf",
} as const;

export type FonteId = keyof typeof FONTES;

const carregadas = new Map<FonteId, opentype.Font>();

/** A pasta das fontes. Na Vercel o cwd é a raiz da função; `assets/` entra no pacote. */
export function pastaDasFontes(): string {
  return path.join(process.cwd(), "assets", "fontes");
}

export function fonte(id: FonteId): opentype.Font {
  let f = carregadas.get(id);
  if (!f) {
    const b = fs.readFileSync(path.join(pastaDasFontes(), FONTES[id]));
    f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    carregadas.set(id, f);
  }
  return f;
}

/** O texto já desenhado como caminho, encostado na origem. */
export type Contorno = {
  /** `d` de um `<path>`, com a caixa do texto começando em (0,0). */
  d: string;
  largura: number;
  altura: number;
  /** O corpo pedido, em px. Efeitos medem borda e brilho em fração dele. */
  corpo: number;
  /** Onde fica a linha de base, medida do topo da caixa. Serve pra sublinhado e fita. */
  linhaDeBase: number;
};

export type OpcoesContorno = {
  /** Espaço extra entre letras, em fração do corpo (0,1 = 10% do corpo). */
  espacamento?: number;
  maiusculas?: boolean;
};

const num = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Transforma um texto em contorno numa fonte e num corpo.
 *
 * O espaçamento é aplicado glifo a glifo, e o kerning da fonte continua valendo -- sem
 * ele "AV" e "To" saem com buraco no meio, que é o primeiro sinal de texto amador.
 */
export function contorno(texto: string, id: FonteId, corpo: number, op: OpcoesContorno = {}): Contorno {
  const f = fonte(id);
  const t = op.maiusculas ? texto.toLocaleUpperCase("pt-BR") : texto;
  const escala = corpo / f.unitsPerEm;
  const baseline = f.ascender * escala;
  const glifos = f.stringToGlyphs(t);
  const extra = (op.espacamento ?? 0) * corpo;

  const caminho = new opentype.Path();
  let x = 0;
  for (let i = 0; i < glifos.length; i++) {
    const g = glifos[i];
    const p = g.getPath(x, baseline, corpo);
    caminho.extend(p);
    x += (g.advanceWidth ?? 0) * escala + extra;
    if (i < glifos.length - 1) x += f.getKerningValue(g, glifos[i + 1]) * escala;
  }

  const caixa = caminho.getBoundingBox();
  const dx = -caixa.x1;
  const dy = -caixa.y1;
  const partes: string[] = [];
  for (const c of caminho.commands) {
    if (c.type === "M" || c.type === "L") partes.push(`${c.type}${num(c.x + dx)} ${num(c.y + dy)}`);
    else if (c.type === "Q") partes.push(`Q${num(c.x1 + dx)} ${num(c.y1 + dy)} ${num(c.x + dx)} ${num(c.y + dy)}`);
    else if (c.type === "C") partes.push(`C${num(c.x1 + dx)} ${num(c.y1 + dy)} ${num(c.x2 + dx)} ${num(c.y2 + dy)} ${num(c.x + dx)} ${num(c.y + dy)}`);
    else if (c.type === "Z") partes.push("Z");
  }
  return {
    d: partes.join(""),
    largura: Math.max(1, caixa.x2 - caixa.x1),
    altura: Math.max(1, caixa.y2 - caixa.y1),
    corpo,
    linhaDeBase: baseline + dy,
  };
}

export type CategoriaEfeito = "populares" | "classico" | "divertido" | "brilho" | "luxo" | "imovel";

export type EfeitoTexto = {
  id: string;
  rotulo: string;
  categoria: CategoriaEfeito;
  fonte: FonteId;
  maiusculas?: boolean;
  espacamento?: number;
  /** A palavra do cartão da galeria. */
  amostra: string;
  /**
   * Desenha o efeito em volta do contorno. Devolve o SVG INTEIRO, com a margem que borda,
   * sombra e brilho precisam -- quem sobrepõe usa `largura`/`altura` pra posicionar.
   *
   * `prefixo` vai na frente de todo `id` de gradiente, filtro e máscara: duas peças no
   * mesmo HTML com `id="brilho"` fariam uma usar o filtro da outra.
   */
  desenhar: (c: Contorno, prefixo: string) => { svg: string; largura: number; altura: number };
};

/** Cabeçalho do SVG no tamanho certo. */
export function abrirSvg(largura: number, altura: number): string {
  const l = Math.ceil(largura);
  const a = Math.ceil(altura);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}" viewBox="0 0 ${l} ${a}">`;
}

/** Desenha um efeito com um texto, do começo ao fim. É o que a rota, o vídeo e a folha chamam. */
export function desenharEfeito(e: EfeitoTexto, texto: string, corpo: number, prefixo = "e"): { svg: string; largura: number; altura: number } {
  const c = contorno(texto, e.fonte, corpo, { maiusculas: e.maiusculas, espacamento: e.espacamento });
  return e.desenhar(c, `${prefixo}-${e.id}`);
}
