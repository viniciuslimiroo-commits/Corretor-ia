import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";

// Upload de foto ou clipe pro vídeo, DIRETO do navegador pro bucket. A função só emite
// a URL assinada de upload: um clipe de celular tem 20-60 MB e a Vercel corta o corpo
// da requisição em 4,5 MB -- passar por aqui nem seria possível. O navegador faz
// `uploadToSignedUrl(path, token, file)` com o cliente anon; o caminho já vem com o id
// da pessoa, então /api/video só aceita arquivos que começam com uploads/{userId}/.

const TIPOS: Record<string, { ext: string; max: number }> = {
  "image/jpeg": { ext: "jpg", max: 25 * 1024 * 1024 },
  "image/png": { ext: "png", max: 25 * 1024 * 1024 },
  "image/webp": { ext: "webp", max: 25 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", max: 120 * 1024 * 1024 },
  "video/quicktime": { ext: "mov", max: 120 * 1024 * 1024 },
};

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const tipo = typeof corpo?.tipo === "string" ? corpo.tipo : "";
  const tamanho = Number(corpo?.tamanho ?? 0);
  const regra = TIPOS[tipo];
  if (!regra) return NextResponse.json({ error: "Envie JPG, PNG, WEBP, MP4 ou MOV." }, { status: 400 });
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > regra.max) {
    return NextResponse.json({ error: `Arquivo grande demais (limite ${Math.round(regra.max / 1024 / 1024)} MB).` }, { status: 400 });
  }

  const caminho = `uploads/${userId}/${randomUUID()}.${regra.ext}`;
  const { data, error } = await db.storage.from(BUCKET_RESULTADOS).createSignedUploadUrl(caminho);
  if (error || !data) return NextResponse.json({ error: `Não consegui preparar o upload: ${error?.message}` }, { status: 500 });

  return NextResponse.json({ caminho, token: data.token, ehVideo: tipo.startsWith("video/") });
}
