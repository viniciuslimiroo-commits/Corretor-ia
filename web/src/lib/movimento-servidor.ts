import path from "node:path";
import sharp from "sharp";
import { FPS_MOVIMENTO, folgaDoMovimento, poseDoMovimento, quadrosDoMovimento, temMovimento } from "./movimentos";
import type { ArteNaCena } from "./video-ffmpeg";

// Transforma uma peça PARADA (PNG já rasterizado) numa SEQUÊNCIA de quadros em laço.
//
// O ffmpeg até sabe mover sobreposição por expressão, mas não sabe girar nem crescer uma
// imagem com alfa sem trocar o tamanho do quadro a cada instante -- e o overlay não aceita
// isso. Então os quadros de UM período são desenhados aqui, num quadro de tamanho fixo com
// folga, e o ffmpeg só repete a sequência (`-loop 1`). A pose de cada quadro sai de
// `poseDoMovimento`, a mesma que o palco usa.
//
// Se desenhar falhar, a peça volta PARADA: um texto sem balanço é melhor que texto sumido.

export async function animarPecas<T extends ArteNaCena & { x?: number }>(lista: T[], pasta: string, prefixo: string): Promise<T[]> {
  const saida: T[] = [];
  for (let k = 0; k < lista.length; k++) {
    const p = lista[k];
    if (!temMovimento(p.movimento) || p.animado) {
      saida.push(p);
      continue;
    }
    try {
      const id = p.movimento;
      const { horizontal: fh, vertical: fv } = folgaDoMovimento(id, p.largura, p.altura);
      const W = p.largura + 2 * fh;
      const H = p.altura + 2 * fv;
      const original = await sharp(p.arquivo).ensureAlpha().png().toBuffer();
      const n = quadrosDoMovimento(id);
      const base = `${prefixo}-mov-${k}`;
      for (let f = 0; f < n; f++) {
        const { escala, angulo, dx, dy } = poseDoMovimento(id, f / FPS_MOVIMENTO);
        let img = sharp(original);
        if (Math.abs(escala - 1) > 0.0005) img = img.resize(Math.max(1, Math.round(p.largura * escala)), Math.max(1, Math.round(p.altura * escala)));
        let peca = await img.png().toBuffer();
        if (Math.abs(angulo) > 0.01) peca = await sharp(peca).rotate(angulo, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const m = await sharp(peca).metadata();
        const iw = m.width ?? p.largura;
        const ih = m.height ?? p.altura;
        const left = Math.round(fh + p.largura / 2 + dx * p.altura - iw / 2);
        const top = Math.round(fv + p.altura / 2 + dy * p.altura - ih / 2);
        await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: peca, left: Math.max(0, left), top: Math.max(0, top) }])
          .png({ compressionLevel: 3 })
          .toFile(path.join(pasta, `${base}-${String(f).padStart(3, "0")}.png`));
      }
      saida.push({
        ...p,
        arquivo: path.join(pasta, `${base}-%03d.png`),
        sequencia: { quadros: n, fps: FPS_MOVIMENTO },
        largura: W,
        altura: H,
        y: p.y - fv,
        ...(typeof p.x === "number" ? { x: p.x - fh } : {}),
      });
    } catch {
      saida.push(p);
    }
  }
  return saida;
}
