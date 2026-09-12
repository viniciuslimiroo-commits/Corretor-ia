import { area, centro, distancia, limites, metros, metrosQuadrados, type Planta } from "./planta";

// Desenho da planta em SVG. Uma função só, usada nos dois lados: a tela mostra o SVG
// direto e o servidor converte o MESMO SVG em PNG com o sharp. O que a pessoa vê é
// exatamente o que sai no arquivo -- sem duas implementações pra divergirem.

export type OpcoesSvg = {
  /** Pixels por metro no arquivo final. 60 dá uma planta legível em papel A4. */
  escala?: number;
  /** Desenha a grade de fundo (útil na tela, ruim no arquivo final). */
  grade?: boolean;
  /** Marca d'água do rodapé. */
  rodape?: string;
  /** Nome e CRECI do corretor, se quiser carimbar. */
  autor?: string;
};

function escapar(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Desenha a planta e devolve o SVG e o tamanho em pixels. */
export function plantaParaSvg(planta: Planta, o: OpcoesSvg = {}): { svg: string; largura: number; altura: number } {
  const escala = o.escala ?? 60;
  const lim = limites(planta, 1.2);
  const L = Math.max(200, Math.round((lim.x1 - lim.x0) * escala));
  const A = Math.max(200, Math.round((lim.y1 - lim.y0) * escala) + (o.rodape ? 44 : 0) + (planta.nome ? 46 : 0));
  const topo = planta.nome ? 46 : 0;
  const px = (x: number) => ((x - lim.x0) * escala).toFixed(1);
  const py = (y: number) => ((y - lim.y0) * escala + topo).toFixed(1);
  const parede = Math.max(3, Math.round(escala * 0.09));
  const fonte = Math.max(11, Math.round(escala * 0.2));
  const fonteCota = Math.max(9, Math.round(escala * 0.145));

  const partes: string[] = [];
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">`);
  partes.push(`<rect width="${L}" height="${A}" fill="#ffffff"/>`);

  if (o.grade) {
    const passo = planta.passo * escala;
    partes.push(`<defs><pattern id="g" width="${passo}" height="${passo}" patternUnits="userSpaceOnUse"><path d="M ${passo} 0 L 0 0 0 ${passo}" fill="none" stroke="#e8edf3" stroke-width="1"/></pattern></defs>`);
    partes.push(`<rect y="${topo}" width="${L}" height="${A - topo}" fill="url(#g)"/>`);
  }

  if (planta.nome) {
    partes.push(
      `<text x="16" y="30" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${Math.round(fonte * 1.25)}" font-weight="700" fill="#0f2d5b">${escapar(planta.nome)}</text>`
    );
  }

  // ---- cômodos ----
  for (const c of planta.comodos) {
    const d = c.pontos.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x)},${py(p.y)}`).join(" ") + " Z";
    partes.push(`<path d="${d}" fill="${c.cor ?? "#dbeafe"}" fill-opacity="0.85" stroke="#0f2d5b" stroke-width="${parede}" stroke-linejoin="miter"/>`);
  }

  // ---- aberturas: apagam o trecho da parede e desenham o símbolo ----
  for (const a of planta.aberturas) {
    const meia = (a.largura / 2) * escala;
    const x = Number(px(a.p.x));
    const y = Number(py(a.p.y));
    const g = `transform="translate(${x} ${y}) rotate(${a.angulo})"`;
    partes.push(`<g ${g}><rect x="${-meia}" y="${-parede}" width="${meia * 2}" height="${parede * 2}" fill="#ffffff"/></g>`);
    if (a.tipo === "porta") {
      // batente + arco de abertura, como em planta de arquiteto
      partes.push(
        `<g ${g}>` +
          `<line x1="${-meia}" y1="0" x2="${meia}" y2="0" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 3)}"/>` +
          `<path d="M ${-meia} 0 A ${meia * 2} ${meia * 2} 0 0 1 ${-meia} ${-meia * 2}" fill="none" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 3)}" stroke-dasharray="4 3"/>` +
          `<line x1="${-meia}" y1="0" x2="${-meia}" y2="${-meia * 2}" stroke="#0f2d5b" stroke-width="${Math.max(1.5, parede / 2)}"/>` +
          `</g>`
      );
    } else {
      partes.push(
        `<g ${g}>` +
          `<rect x="${-meia}" y="${-parede / 2}" width="${meia * 2}" height="${parede}" fill="#ffffff" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 3)}"/>` +
          `<line x1="${-meia}" y1="0" x2="${meia}" y2="0" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 4)}"/>` +
          `</g>`
      );
    }
  }

  // ---- cotas de cada parede ----
  if (planta.cotas) {
    for (const c of planta.comodos) {
      for (let i = 0; i < c.pontos.length; i++) {
        const a = c.pontos[i];
        const b = c.pontos[(i + 1) % c.pontos.length];
        const d = distancia(a, b);
        if (d < 0.6) continue;
        const mx = (Number(px(a.x)) + Number(px(b.x))) / 2;
        const my = (Number(py(a.y)) + Number(py(b.y))) / 2;
        const texto = metros(d);
        const larg = texto.length * fonteCota * 0.56 + 8;
        partes.push(
          `<g transform="translate(${mx} ${my})">` +
            `<rect x="${-larg / 2}" y="${-fonteCota * 0.8}" width="${larg}" height="${fonteCota * 1.6}" rx="${fonteCota * 0.8}" fill="#ffffff" fill-opacity="0.92"/>` +
            `<text y="${fonteCota * 0.42}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${fonteCota}" fill="#334155" text-anchor="middle">${texto}</text>` +
            `</g>`
        );
      }
    }
  }

  // ---- nome e área de cada cômodo ----
  for (const c of planta.comodos) {
    const m = centro(c.pontos);
    const a = area(c.pontos);
    if (a < 0.6) continue;
    const cx = px(m.x);
    const cy = py(m.y);
    if (c.nome) {
      partes.push(
        `<text x="${cx}" y="${Number(cy) - fonte * 0.15}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${fonte}" font-weight="600" fill="#0f2d5b" text-anchor="middle">${escapar(c.nome)}</text>`
      );
    }
    partes.push(
      `<text x="${cx}" y="${Number(cy) + fonte * (c.nome ? 1.05 : 0.35)}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${Math.round(fonte * 0.85)}" fill="#475569" text-anchor="middle">${metrosQuadrados(a)}</text>`
    );
  }

  // ---- rodapé: área total, autor e aviso ----
  const total = planta.comodos.reduce((s, c) => s + area(c.pontos), 0);
  const yRod = A - 16;
  partes.push(
    `<text x="16" y="${yRod}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${Math.round(fonte * 0.95)}" font-weight="700" fill="#0f2d5b">Área total ${metrosQuadrados(total)}</text>`
  );
  if (o.autor) {
    partes.push(
      `<text x="${L / 2}" y="${yRod}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${Math.round(fonte * 0.8)}" fill="#475569" text-anchor="middle">${escapar(o.autor)}</text>`
    );
  }
  if (o.rodape) {
    partes.push(
      `<text x="${L - 16}" y="${yRod}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${Math.round(fonte * 0.7)}" fill="#94a3b8" text-anchor="end">${escapar(o.rodape)}</text>`
    );
  }

  partes.push("</svg>");
  return { svg: partes.join(""), largura: L, altura: A };
}
