// As cores que existem DENTRO da logo, sem IA e sem rede.
//
// O trabalho todo é decidir o que NÃO é cor de marca. Numa logo, a maior parte dos pixels
// é fundo (branco ou transparente) e contorno (preto). Contar pixel puro devolve
// "#ffffff, #000000, #fefefe" -- tecnicamente certo, inútil pra qualquer material.
//
// Então: joga fora o transparente, o quase-branco, o quase-preto e o cinza sem cor;
// agrupa o resto em baldes grosseiros; e, entre os baldes mais cheios, só aceita um novo
// se ele estiver longe dos já escolhidos -- senão saem três tons do mesmo azul, que é o
// mesmo que uma cor só ocupando três lugares.
//
// Entrada é RGBA cru (o que `sharp(...).ensureAlpha().raw()` devolve), pra esta função
// não depender do sharp e poder ser testada com um array na mão.

/** Quantos bits de cada canal sobrevivem ao agrupamento. 4 = 16 níveis por canal. */
const BITS = 4;

/** Distância mínima entre duas cores escolhidas, em RGB (0-441). Abaixo disso, é a mesma cor. */
const LONGE = 90;

/** Abaixo disso o pixel é transparente demais pra contar. */
const ALFA_MIN = 128;

type Balde = { n: number; r: number; g: number; b: number };

/** Um pixel só conta se tiver cor de verdade: nem fundo, nem contorno, nem cinza. */
function contaComoCor(r: number, g: number, b: number, a: number): boolean {
  if (a < ALFA_MIN) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 242) return false; // quase branco: fundo
  if (max < 26) return false; // quase preto: contorno e texto
  // Saturação do HSV. Cinza de logo (sombra, régua, borda) fica embaixo de ~0.12.
  if (max === 0 || (max - min) / max < 0.12) return false;
  return true;
}

function distancia(a: Balde, b: Balde): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Devolve até `quantas` cores predominantes da imagem, em #rrggbb, da mais presente pra
 * menos. Devolve menos (ou nenhuma) quando a logo não tem cor -- uma logo preto-e-branco
 * honestamente não tem paleta, e inventar uma seria pior que não oferecer.
 *
 * `ArrayLike<number>` e não `Uint8Array` de propósito: o servidor manda um Buffer do sharp
 * e o navegador manda o Uint8ClampedArray do canvas. Os dois são a mesma coisa pra quem
 * só lê índices, e exigir um tipo só obrigaria a copiar 36 mil bytes por upload.
 *
 * @param rgba  pixels crus, 4 bytes por pixel
 * @param quantas  teto de cores devolvidas
 */
export function coresDaLogo(rgba: ArrayLike<number>, quantas = 3): string[] {
  const baldes = new Map<number, Balde>();

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (!contaComoCor(r, g, b, a)) continue;

    const chave = ((r >> (8 - BITS)) << (BITS * 2)) | ((g >> (8 - BITS)) << BITS) | (b >> (8 - BITS));
    const atual = baldes.get(chave);
    if (atual) {
      atual.n++;
      atual.r += r;
      atual.g += g;
      atual.b += b;
    } else {
      baldes.set(chave, { n: 1, r, g, b });
    }
  }

  if (baldes.size === 0) return [];

  // A média dentro do balde, não o centro dele: o centro de um balde de 16 níveis erra
  // até 8 por canal, o que é a diferença entre o azul da marca e um azul parecido.
  const medios = [...baldes.values()]
    .map((x) => ({ n: x.n, r: x.r / x.n, g: x.g / x.n, b: x.b / x.n }))
    .sort((a, b) => b.n - a.n);

  // Uma cor precisa aparecer o suficiente pra ser marca, e não respingo de anti-aliasing.
  const total = medios.reduce((s, x) => s + x.n, 0);
  const minimo = Math.max(1, total * 0.02);

  const escolhidas: Balde[] = [];
  for (const c of medios) {
    if (escolhidas.length >= quantas) break;
    if (c.n < minimo) break;
    if (escolhidas.some((e) => distancia(e, c) < LONGE)) continue;
    escolhidas.push(c);
  }

  return escolhidas.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
}

/** Quanto da marca já está preenchida, de 0 a 100. Usado no "sua marca está X% completa". */
export function progressoDaMarca(m: { nome?: string | null; logo?: unknown; cor?: string | null; whatsapp?: string | null; creci?: string | null }): number {
  const itens = [!!m.nome?.trim(), !!m.logo, !!m.cor, !!m.whatsapp?.trim(), !!m.creci?.trim()];
  return Math.round((itens.filter(Boolean).length / itens.length) * 100);
}
