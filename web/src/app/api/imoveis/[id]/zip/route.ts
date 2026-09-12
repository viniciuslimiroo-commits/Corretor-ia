import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import JSZip from "jszip";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { marcaEfetiva } from "@/lib/cobranca";
import { ACOES_POR_ID, resumirParametros } from "@/lib/acoes";

// Baixar o imóvel inteiro num arquivo só, já no tamanho do portal. Depois de editar 20
// fotos, clicar em baixar 20 vezes é o mesmo castigo que editar uma a uma.
//
// O ZIP é montado na memória e devolvido de uma vez: 20 fotos em 3840px dão ~40 MB, que
// cabe na função com folga. Acima de LIMITE_FOTOS a resposta recusa e explica, em vez de
// estourar a memória no meio.
//
// Reaproveita as regras do /api/exportar: mesmo preset por portal, mesmo logo (da pessoa
// ou da imobiliária), mesmo selo já queimado no resultado.

export const maxDuration = 120;

const PRESETS: Record<string, { largura: number; altura: number }> = {
  zap_vivareal_olx: { largura: 3840, altura: 2160 },
  generico: { largura: 1920, altura: 1440 },
};

const LIMITE_FOTOS = 40;

/** Nome de arquivo seguro em qualquer sistema: sem acento, sem espaço, sem símbolo. */
function semAcento(t: string) {
  return (
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "imovel"
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const portal = req.nextUrl.searchParams.get("portal") ?? "zap_vivareal_olx";
  const preset = PRESETS[portal];
  if (!preset) return NextResponse.json({ error: "Portal inválido." }, { status: 400 });
  const comLogo = req.nextUrl.searchParams.get("logo") === "1";

  const { data: imovel } = await db.from("properties").select("id, titulo").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const { data: jobs } = await db
    .from("jobs")
    .select("id, tipo, parametros, output_path, criado_em")
    .eq("property_id", id)
    .eq("user_id", userId)
    .eq("status", "concluido")
    .not("output_path", "is", null)
    .order("criado_em", { ascending: true })
    .limit(LIMITE_FOTOS + 1);

  const lista = jobs ?? [];
  if (lista.length === 0) return NextResponse.json({ error: "Este imóvel ainda não tem fotos prontas." }, { status: 404 });
  if (lista.length > LIMITE_FOTOS) {
    return NextResponse.json({ error: `Este imóvel tem mais de ${LIMITE_FOTOS} fotos. Baixe uma a uma na galeria por enquanto.` }, { status: 413 });
  }

  // Logo uma vez só, não uma por foto.
  let logo: Buffer | null = null;
  if (comLogo) {
    const marca = await marcaEfetiva(db, userId);
    if (marca.logo_path) {
      const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(marca.logo_path);
      if (arq) logo = Buffer.from(await arq.arrayBuffer());
    }
  }

  const zip = new JSZip();
  let n = 0;
  for (const j of lista) {
    const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(j.output_path!);
    if (!arq) continue;
    n++;
    const def = ACOES_POR_ID[j.tipo];
    const detalhe = def ? resumirParametros(def, (j.parametros ?? {}) as Record<string, string>) : "";
    const nome = `${String(n).padStart(2, "0")}-${semAcento([def?.rotulo ?? j.tipo, detalhe].filter(Boolean).join(" "))}.jpg`;

    let imagem = sharp(Buffer.from(await arq.arrayBuffer())).resize(preset.largura, preset.altura, { fit: "inside", withoutEnlargement: true });
    const { data: base, info } = await imagem.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });

    let final = base;
    if (logo) {
      const maxL = Math.round(info.width * 0.18);
      const maxA = Math.round(info.height * 0.12);
      const marcaPng = await sharp(logo).resize(maxL, maxA, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const dim = await sharp(marcaPng).metadata();
      const margem = Math.max(10, Math.round(info.width * 0.015));
      imagem = sharp(base).composite([{ input: marcaPng, left: margem, top: info.height - (dim.height ?? 0) - margem }]);
      final = await imagem.jpeg({ quality: 92 }).toBuffer();
    }
    zip.file(nome, final);
  }

  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const arquivo = `encena-${semAcento(imovel.titulo ?? "imovel")}.zip`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
