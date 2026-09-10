import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// Export por portal (Sprint 4, adiantado). Specs reais pesquisadas antes de
// implementar -- não inventadas:
//
// ZAP Imóveis / VivaReal / OLX (mesma integração "ZAP+"): largura 260-3840px,
// altura 350-2160px, orientação horizontal preferida.
// Fonte: ajuda.zapmais.com "Como criar um anúncio?"
//
// QuintoAndar: NÃO achei spec pública de pixels/proporção -- a central de ajuda deles
// não publica isso. O preset "outros portais" usa um padrão conservador (Full HD
// horizontal) que atende qualquer portal comum, mas não é uma exigência confirmada da
// QuintoAndar especificamente.

const PRESETS: Record<string, { largura: number; altura: number; rotulo: string }> = {
  zap_vivareal_olx: { largura: 3840, altura: 2160, rotulo: "ZAP · VivaReal · OLX" },
  generico: { largura: 1920, altura: 1440, rotulo: "Outros portais (padrão Full HD)" },
};

export async function POST(req: NextRequest) {
  const { url, portal } = await req.json();
  const preset = PRESETS[portal];
  if (!url || !preset) {
    return NextResponse.json({ error: "url ou portal inválido." }, { status: 400 });
  }

  const respImagem = await fetch(url);
  if (!respImagem.ok) {
    return NextResponse.json({ error: "Não consegui baixar a imagem de origem." }, { status: 502 });
  }
  const bytesOriginais = Buffer.from(await respImagem.arrayBuffer());

  // fit:'inside' preserva o enquadramento inteiro (nunca corta o cômodo) e nunca
  // amplia além do original -- só respeita o teto de pixels do portal.
  const exportada = await sharp(bytesOriginais)
    .resize(preset.largura, preset.altura, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  return new NextResponse(exportada, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="foto-${portal}.jpg"`,
    },
  });
}
