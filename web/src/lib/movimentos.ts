// MOVIMENTO EM LAÇO: o que faz um texto ou um adesivo parecer um GIF.
//
// Ele pediu GIF "igual ao CapCut". Os GIFs de lá (Giphy) são trecho de filme e rosto de
// famoso, e os termos da própria Giphy só liberam uso pessoal e não comercial -- anúncio
// de imóvel é o caso proibido. O que dá pra entregar de verdade é o outro lado do pedido,
// "algum criador queira CRIAR gif": qualquer texto com efeito, ou qualquer adesivo,
// pulsando, balançando, tremendo, quicando ou flutuando sem parar.
//
// A POSE de cada instante sai daqui, e só daqui. O servidor desenha os quadros com ela
// (movimento-servidor.ts) e o palco anima com os mesmos números (Web Animations API) --
// não existe uma versão CSS "parecida" pra divergir do vídeo.
//
// Sem dependência de Node: o navegador importa este arquivo.

export type MovimentoId = "nenhum" | "pulsar" | "balancar" | "tremer" | "quicar" | "flutuar";

/** Quadros por segundo da sequência desenhada. O vídeo roda a 30; 25 basta pra laço curto. */
export const FPS_MOVIMENTO = 25;

export const MOVIMENTOS: { id: MovimentoId; rotulo: string; dica: string; /** segundos, múltiplo de 1/25 */ periodo: number }[] = [
  { id: "nenhum", rotulo: "Parado", dica: "Sem movimento depois que entra.", periodo: 1 },
  { id: "pulsar", rotulo: "Pulsar", dica: "Cresce e volta, como coração batendo.", periodo: 0.8 },
  { id: "balancar", rotulo: "Balançar", dica: "Inclina pra um lado e pro outro.", periodo: 1.2 },
  { id: "tremer", rotulo: "Tremer", dica: "Treme sem parar. Pra “UAU!” e “Corre!”.", periodo: 0.32 },
  { id: "quicar", rotulo: "Quicar", dica: "Pula e volta pro lugar.", periodo: 0.72 },
  { id: "flutuar", rotulo: "Flutuar", dica: "Sobe e desce devagar.", periodo: 2 },
];

const POR_ID: Record<string, (typeof MOVIMENTOS)[number]> = Object.fromEntries(MOVIMENTOS.map((m) => [m.id, m]));

export function ehMovimento(v: unknown): v is MovimentoId {
  return typeof v === "string" && v in POR_ID;
}

/** Tem movimento de verdade (não é ausente nem "nenhum"). */
export function temMovimento(v: unknown): v is Exclude<MovimentoId, "nenhum"> {
  return ehMovimento(v) && v !== "nenhum";
}

export function periodoDoMovimento(id: MovimentoId): number {
  return POR_ID[id].periodo;
}

export function quadrosDoMovimento(id: MovimentoId): number {
  return Math.max(1, Math.round(POR_ID[id].periodo * FPS_MOVIMENTO));
}

/**
 * A pose num instante. `escala` multiplica o tamanho; `angulo` em graus (horário);
 * `dx` e `dy` em fração da ALTURA da peça -- a altura, e não a largura, porque um texto
 * largo tremendo 3% da largura sairia do lugar, e um adesivo quadrado não.
 *
 * Toda função aqui tem período exato (harmônicos inteiros), senão o laço dá um tranco
 * na emenda.
 */
export type Pose = { escala: number; angulo: number; dx: number; dy: number };

export function poseDoMovimento(id: MovimentoId, t: number): Pose {
  const pose: Pose = { escala: 1, angulo: 0, dx: 0, dy: 0 };
  if (id === "nenhum") return pose;
  const p = POR_ID[id].periodo;
  const u = (((t % p) + p) % p) / p;
  const volta = 2 * Math.PI * u;
  if (id === "pulsar") {
    pose.escala = 1 + 0.09 * (0.5 - 0.5 * Math.cos(volta));
  } else if (id === "balancar") {
    pose.angulo = 7 * Math.sin(volta);
  } else if (id === "tremer") {
    pose.dx = 0.03 * Math.sin(volta) + 0.015 * Math.sin(3 * volta);
    pose.dy = 0.02 * Math.sin(2 * volta + 1);
    pose.angulo = 2 * Math.sin(volta + 0.5);
  } else if (id === "quicar") {
    pose.dy = -0.22 * Math.abs(Math.sin(Math.PI * u));
  } else if (id === "flutuar") {
    pose.dy = -0.08 * Math.sin(volta);
  }
  return pose;
}

/**
 * Quanto a peça precisa de folga em volta pra nenhuma pose sair do quadro desenhado.
 * Simétrica nos dois eixos: arte de texto é centrada pela largura, e folga torta a
 * tiraria do centro.
 */
export function folgaDoMovimento(id: MovimentoId, largura: number, altura: number): { horizontal: number; vertical: number } {
  if (id === "nenhum") return { horizontal: 0, vertical: 0 };
  let mh = 0;
  let mv = 0;
  const n = quadrosDoMovimento(id);
  for (let f = 0; f < n; f++) {
    const { escala, angulo, dx, dy } = poseDoMovimento(id, f / FPS_MOVIMENTO);
    const a = (angulo * Math.PI) / 180;
    const w = (largura * escala) / 2;
    const h = (altura * escala) / 2;
    // Meia caixa girada: a projeção dos cantos nos dois eixos.
    const meiaX = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
    const meiaY = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    mh = Math.max(mh, meiaX + Math.abs(dx * altura) - largura / 2);
    mv = Math.max(mv, meiaY + Math.abs(dy * altura) - altura / 2);
  }
  // +2px: o redimensionamento arredonda, e um pixel cortado na borda vira um risco reto.
  return { horizontal: Math.ceil(Math.max(0, mh)) + 2, vertical: Math.ceil(Math.max(0, mv)) + 2 };
}

/**
 * Os quadros-chave pro palco (Web Animations API), amostrados da mesma pose.
 *
 * `aspecto` é largura ÷ altura da peça na tela: `translate` em % do CSS é relativo à
 * largura no eixo X, e o `dx` daqui é em altura.
 */
export function quadrosChaveDoMovimento(id: MovimentoId, aspecto: number): Keyframe[] {
  const n = quadrosDoMovimento(id);
  const lista: Keyframe[] = [];
  for (let f = 0; f <= n; f++) {
    const { escala, angulo, dx, dy } = poseDoMovimento(id, (f / n) * POR_ID[id].periodo);
    lista.push({
      offset: f / n,
      transform: `translate(${((dx / Math.max(aspecto, 0.01)) * 100).toFixed(3)}%, ${(dy * 100).toFixed(3)}%) rotate(${angulo.toFixed(3)}deg) scale(${escala.toFixed(4)})`,
    });
  }
  return lista;
}
