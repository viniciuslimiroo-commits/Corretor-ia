import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer, BUCKET_RESULTADOS } from "@/lib/supabase-server";

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
//
// MUDANÇA (migration 03): esta rota recebia `url` do navegador e dava fetch nela. Dois
// problemas de uma vez: (1) o cliente escolhia qual endereço o SERVIDOR ia buscar, o que
// é SSRF de manual -- dava pra apontar pra endereço interno da infra e usar a resposta
// como sonda; (2) dependia da URL pública do fal.media, que é justamente o que a
// migration 03 tirou de circulação. Agora ela recebe `jobId`, confirma que o job é de
// quem está pedindo, e lê do bucket privado. O navegador não escolhe mais endereço
// nenhum.

const PRESETS: Record<string, { largura: number; altura: number; rotulo: string }> = {
  zap_vivareal_olx: { largura: 3840, altura: 2160, rotulo: "ZAP · VivaReal · OLX" },
  generico: { largura: 1920, altura: 1440, rotulo: "Outros portais (padrão Full HD)" },
};

export async function POST(req: NextRequest) {
  const db = supabaseServer();
  if (!db) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY não configurada. Veja web/.env.local.example." },
      { status: 500 }
    );
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { jobId, portal } = await req.json();
  const preset = PRESETS[portal];
  if (!jobId || !preset) {
    return NextResponse.json({ error: "jobId ou portal inválido." }, { status: 400 });
  }

  // O `eq("user_id")` é o que impede um usuário de exportar o job de outro trocando o
  // id no devtools -- o service role ignora RLS, então o filtro tem que ser explícito
  // aqui. Mesmo motivo pelo qual a migration 02 tirou o INSERT de jobs do cliente.
  const { data: job, error: erroJob } = await db
    .from("jobs")
    .select("output_path")
    .eq("id", jobId)
    .eq("user_id", userData.user.id)
    .single();
  if (erroJob || !job?.output_path) {
    return NextResponse.json({ error: "Resultado não encontrado." }, { status: 404 });
  }

  const { data: arquivo, error: erroDownload } = await db.storage
    .from(BUCKET_RESULTADOS)
    .download(job.output_path);
  if (erroDownload || !arquivo) {
    return NextResponse.json({ error: "Não consegui ler o resultado guardado." }, { status: 502 });
  }
  const bytesOriginais = Buffer.from(await arquivo.arrayBuffer());

  // fit:'inside' preserva o enquadramento inteiro (nunca corta o cômodo) e nunca
  // amplia além do original -- só respeita o teto de pixels do portal. O selo de imagem
  // ilustrativa já veio queimado do /api/gerar, então ele encolhe junto e sai no
  // arquivo que vai pro anúncio.
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
