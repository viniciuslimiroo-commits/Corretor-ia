import { NextRequest, NextResponse } from "next/server";
import { EFEITO_TEXTO_POR_ID, desenharEfeitoNoVideo } from "@/lib/efeitos-texto/catalogo";

// O desenho de UM texto com um efeito, pro palco do editor mostrar do jeito que vai sair.
//
// A letra é contorno lido do arquivo da fonte, e as fontes só existem no servidor. Então
// a tela pede aqui o SVG já pronto, desenhado pela MESMA função que a montagem do vídeo
// usa (`desenharEfeitoNoVideo`, com a redução quando a frase não cabe na largura).
//
// Responde num quadro de referência de 1000 de altura: a tela converte largura e altura
// em porcentagem do palco. Sem login de propósito -- não lê nem grava dado de ninguém, e
// o texto não entra no SVG como texto (vira contorno), então não há o que injetar.

export const runtime = "nodejs";

const PROPORCOES: Record<string, number> = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5 };
const H_REF = 1000;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const efeito = EFEITO_TEXTO_POR_ID[p.get("id") ?? ""];
  if (!efeito) return NextResponse.json({ error: "Efeito desconhecido." }, { status: 404 });

  const texto = (p.get("texto") ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 44) || efeito.amostra;
  const proporcao = PROPORCOES[p.get("formato") ?? ""] ?? PROPORCOES["9:16"];
  const W = Math.round(H_REF * proporcao);

  try {
    const d = desenharEfeitoNoVideo(efeito, texto, W, H_REF, { prefixo: `palco${(p.get("n") ?? "0").replace(/\D/g, "").slice(0, 3)}` });
    return NextResponse.json(
      { svg: d.svg, largura: d.largura, altura: d.altura, W, H: H_REF },
      // O mesmo endereço sempre desenha a mesma coisa: pode ficar guardado no navegador.
      { headers: { "Cache-Control": "public, max-age=86400" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 120) : "Não consegui desenhar." }, { status: 500 });
  }
}
