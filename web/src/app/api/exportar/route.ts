import { NextRequest, NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { supabaseServer, BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { marcaEfetiva } from "@/lib/cobranca";
import { textoSvg } from "@/lib/texto-svg";
import { ehPosicaoLogo, ondePorOLogo, POSICAO_LOGO_PADRAO } from "@/lib/marca-na-foto";


// Export por portal (Sprint 4, adiantado). Specs reais pesquisadas antes de
// implementar -- não inventadas:
//
// ZAP Imóveis / VivaReal / OLX (mesma integração "ZAP+"): largura 260-3840px,
// altura 350-2160px, orientação horizontal preferida.
// Fonte: ajuda.zapmais.com "Como criar um anúncio?"
//
// QuintoAndar: NÃO achei spec pública de pixels/proporção -- a central de ajuda deles
// não publica isso. O preset "outros portais" usa um padrão conservador (Full HD
// horizontal) que atende qualquer portal comum.
//
// MUDANÇA (migration 03): esta rota recebia `url` do navegador e dava fetch nela. Dois
// problemas de uma vez: (1) o cliente escolhia qual endereço o SERVIDOR ia buscar, o que
// é SSRF de manual; (2) dependia da URL pública do fal.media. Agora ela recebe `jobId`,
// confirma que o job é de quem está pedindo, e lê do bucket privado.
//
// FASE A (12/09/2026): opcionais `comLogo` (carimba o logo do corretor, guardado em
// users.logo_path, no canto inferior ESQUERDO -- o selo de imagem ilustrativa já ocupa o
// direito) e `legenda` (texto curto no topo, ex.: "Sala de estar · 32 m²").

const PRESETS: Record<string, { largura: number; altura: number; rotulo: string }> = {
  zap_vivareal_olx: { largura: 3840, altura: 2160, rotulo: "ZAP · VivaReal · OLX" },
  generico: { largura: 1920, altura: 1440, rotulo: "Outros portais (padrão Full HD)" },
};

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const corpo = await req.json();
  const { jobId, portal } = corpo;
  const comLogo = corpo.comLogo === true;
  // Posição inválida ou ausente cai no padrão, nunca recusa a exportação: a foto é o
  // que a pessoa veio buscar, e um canto errado não vale um erro na cara dela.
  const posicaoLogo = ehPosicaoLogo(corpo.posicaoLogo) ? corpo.posicaoLogo : POSICAO_LOGO_PADRAO;
  const legenda = typeof corpo.legenda === "string" ? corpo.legenda.replace(/[\r\n]+/g, " ").trim().slice(0, 80) : "";
  const preset = PRESETS[portal];
  if (!jobId || !preset) return NextResponse.json({ error: "jobId ou portal inválido." }, { status: 400 });

  // O `eq("user_id")` é o que impede um usuário de exportar o job de outro trocando o
  // id no devtools -- o service role ignora RLS, então o filtro tem que ser explícito.
  const { data: job, error: erroJob } = await db
    .from("jobs")
    .select("output_path")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();
  if (erroJob || !job?.output_path) return NextResponse.json({ error: "Resultado não encontrado." }, { status: 404 });

  const { data: arquivo, error: erroDownload } = await db.storage.from(BUCKET_RESULTADOS).download(job.output_path);
  if (erroDownload || !arquivo) return NextResponse.json({ error: "Não consegui ler o resultado guardado." }, { status: 502 });
  const bytesOriginais = Buffer.from(await arquivo.arrayBuffer());

  // fit:'inside' preserva o enquadramento inteiro (nunca corta o cômodo) e nunca
  // amplia além do original. O selo de imagem ilustrativa já veio queimado do
  // resultado, então ele encolhe junto e sai no arquivo que vai pro anúncio.
  let imagem = sharp(bytesOriginais).resize(preset.largura, preset.altura, { fit: "inside", withoutEnlargement: true });
  const { data: redimensionada, info } = await imagem.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  const L = info.width;
  const A = info.height;

  const camadas: OverlayOptions[] = [];

  if (comLogo) {
    // Logo da pessoa; sem ele, o da imobiliária (marcaEfetiva decide).
    const perfil = await marcaEfetiva(db, userId);
    if (perfil.logo_path) {
      const { data: logoArq } = await db.storage.from(BUCKET_RESULTADOS).download(perfil.logo_path);
      if (logoArq) {
        // Logo com no máximo 18% da largura e 12% da altura, canto inferior esquerdo,
        // com uma leve sombra pra não sumir em foto clara.
        const maxL = Math.round(L * 0.18);
        const maxA = Math.round(A * 0.12);
        const logo = await sharp(Buffer.from(await logoArq.arrayBuffer()))
          .resize(maxL, maxA, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        const dimLogo = await sharp(logo).metadata();
        // A conta de onde o logo cai mora em lib/marca-na-foto.ts, compartilhada com o ZIP
        // do imóvel: duas cópias da mesma conta passam a discordar sem ninguém notar, e aí
        // a foto avulsa sai com o logo num canto e o lote no outro.
        const onde = ondePorOLogo(posicaoLogo, { largura: L, altura: A }, { largura: dimLogo.width ?? 0, altura: dimLogo.height ?? 0 });
        camadas.push({ input: logo, ...onde });
      }
    }
  }

  if (legenda) {
    const fonte = Math.max(14, Math.round(L * 0.022));
    const padX = Math.round(fonte * 0.8);
    const padY = Math.round(fonte * 0.45);
    const larguraCaixa = Math.min(L - 2 * padX, Math.round(legenda.length * fonte * 0.58 + 2 * padX));
    const alturaCaixa = fonte + 2 * padY;
    const margem = Math.max(10, Math.round(L * 0.015));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraCaixa}" height="${alturaCaixa}">
      <rect width="${larguraCaixa}" height="${alturaCaixa}" rx="${Math.round(alturaCaixa / 2)}" fill="rgba(15,45,91,0.82)"/>
      ${textoSvg(legenda, { x: padX, y: padY + fonte * 0.78, corpo: fonte, cor: "#FFFFFF" })}
    </svg>`;
    camadas.push({ input: Buffer.from(svg), left: margem, top: margem });
  }

  imagem = sharp(redimensionada);
  if (camadas.length) imagem = imagem.composite(camadas);
  const exportada = await imagem.jpeg({ quality: 92 }).toBuffer();

  return new NextResponse(exportada, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="foto-${portal}.jpg"`,
    },
  });
}
