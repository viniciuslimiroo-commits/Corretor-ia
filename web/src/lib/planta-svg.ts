import { area, centro, distancia, limites, metros, metrosQuadrados, type Planta } from "./planta";
import { MOVEL_POR_TIPO } from "./moveis";
import { FONTE_SVG_SERVIDOR } from "./fonte-svg";

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
  /**
   * Janela visível, em metros. Sem isto a função enquadra a planta sozinha.
   *
   * A tela PRECISA passar a mesma janela que usa na camada de toque: o SVG é centralizado
   * dentro da caixa, então dois enquadramentos diferentes desenham a mesma planta em
   * lugares diferentes e o ponto não cai onde a pessoa tocou.
   */
  vista?: { x0: number; y0: number; largura: number; altura: number };
  /**
   * Desenha só a geometria: paredes, portas, janelas e o preenchimento dos cômodos, sem
   * nome, área, cota nem rodapé.
   *
   * É o que vai pra IA na hora de humanizar. Modelo de imagem reescreve texto e erra
   * número -- mandar a planta com "12,50 m²" volta com "l2,SO n²". A planta técnica, com
   * os números certos, continua sendo a saída separada e é ela que vale como medida.
   */
  semTexto?: boolean;
  /**
   * Quem desenha o texto. É injetado porque esta função roda nos DOIS lados.
   *
   * Na tela, `<text font-family=...>` funciona: o navegador tem fontes. No servidor da
   * Vercel não existe fonte nenhuma, e todo `<text>` sai como glifo vazio -- foi assim que
   * as medidas do terreno sumiram (21/09/2026). Lá quem desenha é `lib/texto-svg.ts`, que
   * transforma a letra em contorno lendo o .ttf; mas esse módulo lê arquivo do disco e não
   * pode ser importado aqui, senão vai parar no pacote do navegador.
   *
   * Por isso a rota passa o desenhista de contorno e a tela fica com o padrão.
   */
  texto?: DesenharTexto;
};

/** `y` é a LINHA DE BASE, como no `<text>`. */
export type DesenharTexto = (
  texto: string,
  o: { x: number; y: number; corpo: number; cor?: string; ancora?: "start" | "middle" | "end"; peso?: number }
) => string;

function escapar(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** O padrão: `<text>` de verdade, pra tela. */
const TEXTO_NA_TELA: DesenharTexto = (t, o) =>
  !t
    ? ""
    : `<text x="${o.x}" y="${o.y}" font-family="${FONTE_SVG_SERVIDOR}" font-size="${o.corpo}"` +
      (o.peso ? ` font-weight="${o.peso}"` : "") +
      ` fill="${o.cor ?? "#000000"}"` +
      (o.ancora && o.ancora !== "start" ? ` text-anchor="${o.ancora}"` : "") +
      `>${escapar(t)}</text>`;

/** Desenha a planta e devolve o SVG e o tamanho em pixels. */
export function plantaParaSvg(planta: Planta, o: OpcoesSvg = {}): { svg: string; largura: number; altura: number } {
  const escala = o.escala ?? 60;
  const lim = o.vista
    ? { x0: o.vista.x0, y0: o.vista.y0, x1: o.vista.x0 + o.vista.largura, y1: o.vista.y0 + o.vista.altura }
    : limites(planta, 1.2);
  // com janela explícita o tamanho é exatamente o dela: qualquer mínimo aqui desalinharia
  // o desenho da camada de toque, que é justamente o que a janela existe pra evitar
  const L = o.vista
    ? Math.round(o.vista.largura * escala)
    : Math.max(200, Math.round((lim.x1 - lim.x0) * escala));
  const A = o.vista
    ? Math.round(o.vista.altura * escala) + (o.rodape ? 44 : 0) + (planta.nome ? 46 : 0)
    : Math.max(200, Math.round((lim.y1 - lim.y0) * escala) + (o.rodape ? 44 : 0) + (planta.nome ? 46 : 0));
  const topo = planta.nome ? 46 : 0;
  const px = (x: number) => ((x - lim.x0) * escala).toFixed(1);
  const py = (y: number) => ((y - lim.y0) * escala + topo).toFixed(1);
  const txt = o.texto ?? TEXTO_NA_TELA;
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

  if (planta.nome && !o.semTexto) {
    partes.push(
      txt(planta.nome, { x: 16, y: 30, corpo: Math.round(fonte * 1.25), cor: "#0f2d5b", peso: 700 })
    );
  }

  // ---- cômodos ----
  for (const c of planta.comodos) {
    const d = c.pontos.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x)},${py(p.y)}`).join(" ") + " Z";
    partes.push(`<path d="${d}" fill="${c.cor ?? "#dbeafe"}" fill-opacity="0.85" stroke="#0f2d5b" stroke-width="${parede}" stroke-linejoin="miter"/>`);
  }

  // ---- móveis ----
  // Entram depois dos cômodos (ficam sobre o piso) e antes das aberturas (porta e janela
  // continuam por cima, que é a leitura certa de uma planta). O símbolo é desenhado numa
  // caixa unitária e escalado aqui pela medida real -- por isso o `scale` não uniforme.
  for (const m of planta.moveis ?? []) {
    const def = MOVEL_POR_TIPO[m.tipo];
    if (!def) continue;
    const cx = Number(px(m.p.x));
    const cy = Number(py(m.p.y));
    const sx = m.largura * escala;
    const sy = m.altura * escala;
    // traço fino e constante: sem o inverso da escala, um móvel largo sai com traço grosso
    const traco = Math.max(0.9, escala * 0.022);
    partes.push(
      `<g transform="translate(${cx} ${cy}) rotate(${m.angulo}) scale(${sx} ${sy})" ` +
        `fill="${def.fundo ?? "none"}" stroke="#42566f" stroke-width="${traco / Math.min(sx, sy)}" ` +
        `stroke-linejoin="round" vector-effect="non-scaling-stroke">${def.desenho}</g>`
    );
  }

  // ---- aberturas: apagam o trecho da parede e desenham o símbolo ----
  for (const a of planta.aberturas) {
    const meia = (a.largura / 2) * escala;
    const x = Number(px(a.p.x));
    const y = Number(py(a.p.y));
    const g = `transform="translate(${x} ${y}) rotate(${a.angulo})"`;
    partes.push(`<g ${g}><rect x="${-meia}" y="${-parede}" width="${meia * 2}" height="${parede * 2}" fill="#ffffff"/></g>`);
    if (a.tipo === "porta") {
      // Batente, folha e arco de abertura, como em planta de arquiteto.
      //
      // A folha tem o comprimento do vão (2*meia) e gira em torno da dobradiça: fechada
      // encosta no outro batente, aberta fica perpendicular à parede. `giro` diz em qual
      // batente está a dobradiça e `lado` para que lado da parede ela abre -- é o que o
      // arquiteto marca na planta e o que decide se a porta bate no móvel ou não.
      //
      // O arco antigo saía da própria dobradiça, o que não é o caminho da folha.
      const lado = a.lado === -1 ? -1 : 1;
      const giro = a.giro === -1 ? -1 : 1;
      const dobradica = giro > 0 ? -meia : meia; // x da dobradiça
      const fechada = -dobradica; // ponta da folha com a porta fechada (o outro batente)
      const aberta = -lado * meia * 2; // y da ponta com a porta aberta (perpendicular)
      const sentido = giro * lado > 0 ? 0 : 1; // lado do arco, deduzido dos dois eixos
      partes.push(
        `<g ${g}>` +
          `<line x1="${-meia}" y1="0" x2="${meia}" y2="0" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 3)}"/>` +
          `<path d="M ${fechada} 0 A ${meia * 2} ${meia * 2} 0 0 ${sentido} ${dobradica} ${aberta}" fill="none" stroke="#0f2d5b" stroke-width="${Math.max(1, parede / 3)}" stroke-dasharray="4 3"/>` +
          `<line x1="${dobradica}" y1="0" x2="${dobradica}" y2="${aberta}" stroke="#0f2d5b" stroke-width="${Math.max(1.5, parede / 2)}"/>` +
          `</g>`
      );
    } else if (a.tipo === "vao") {
      // VÃO DE PASSAGEM: a parede acaba e recomeça, e no meio não há nada.
      //
      // O retângulo branco lá em cima já apagou o trecho; aqui só ficam os dois batentes,
      // os risquinhos que o arquiteto desenha pra dizer "a parede termina aqui". Sem eles o
      // vão parece erro de desenho em vez de passagem.
      const b = Math.max(1.5, parede / 2);
      partes.push(
        `<g ${g}>` +
          `<line x1="${-meia}" y1="${-parede / 2}" x2="${-meia}" y2="${parede / 2}" stroke="#0f2d5b" stroke-width="${b}"/>` +
          `<line x1="${meia}" y1="${-parede / 2}" x2="${meia}" y2="${parede / 2}" stroke="#0f2d5b" stroke-width="${b}"/>` +
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
  if (planta.cotas && !o.semTexto) {
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
            txt(texto, { x: 0, y: fonteCota * 0.42, corpo: fonteCota, cor: "#334155", ancora: "middle" }) +
            `</g>`
        );
      }
    }
  }

  // ---- nome e área de cada cômodo ----
  for (const c of planta.comodos) {
    if (o.semTexto) break;
    const m = centro(c.pontos);
    const a = area(c.pontos);
    if (a < 0.6) continue;
    const cx = px(m.x);
    const cy = py(m.y);
    if (c.nome) {
      partes.push(
        txt(c.nome, { x: Number(cx), y: Number(cy) - fonte * 0.15, corpo: fonte, cor: "#0f2d5b", ancora: "middle", peso: 600 })
      );
    }
    partes.push(
      txt(metrosQuadrados(a), { x: Number(cx), y: Number(cy) + fonte * (c.nome ? 1.05 : 0.35), corpo: Math.round(fonte * 0.85), cor: "#475569", ancora: "middle" })
    );
  }

  // ---- rodapé: área total, autor e aviso ----
  const total = planta.comodos.reduce((s, c) => s + area(c.pontos), 0);
  const yRod = A - 16;
  if (o.semTexto) {
    partes.push("</svg>");
    return { svg: partes.join(""), largura: L, altura: A };
  }
  partes.push(
    txt(`Área total ${metrosQuadrados(total)}`, { x: 16, y: yRod, corpo: Math.round(fonte * 0.95), cor: "#0f2d5b", peso: 700 })
  );
  if (o.autor) {
    partes.push(
      txt(o.autor, { x: L / 2, y: yRod, corpo: Math.round(fonte * 0.8), cor: "#475569", ancora: "middle" })
    );
  }
  if (o.rodape) {
    partes.push(
      txt(o.rodape, { x: L - 16, y: yRod, corpo: Math.round(fonte * 0.7), cor: "#94a3b8", ancora: "end" })
    );
  }

  partes.push("</svg>");
  return { svg: partes.join(""), largura: L, altura: A };
}
