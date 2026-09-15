import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";

// Upload de foto ou clipe pro vídeo, DIRETO do navegador pro bucket. A função só emite
// a URL assinada de upload: um clipe de celular tem 20-60 MB e a Vercel corta o corpo
// da requisição em 4,5 MB -- passar por aqui nem seria possível. O navegador faz
// `uploadToSignedUrl(path, token, file)` com o cliente anon; o caminho já vem com o id
// da pessoa, então /api/video só aceita arquivos que começam com uploads/{userId}/.

const AUDIO = 25 * 1024 * 1024;

const TIPOS: Record<string, { ext: string; max: number }> = {
  "image/jpeg": { ext: "jpg", max: 25 * 1024 * 1024 },
  "image/png": { ext: "png", max: 25 * 1024 * 1024 },
  "image/webp": { ext: "webp", max: 25 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", max: 120 * 1024 * 1024 },
  "video/quicktime": { ext: "mov", max: 120 * 1024 * 1024 },
  // O que a câmera do navegador grava: Chrome e Edge entregam webm, Safari entrega mp4.
  "video/webm": { ext: "webm", max: 120 * 1024 * 1024 },
  // Voz: enviada pela pessoa (mp3/m4a/wav) ou gravada aqui no navegador. O
  // MediaRecorder do Chrome e do Edge entrega webm/opus; o do Safari, mp4 -- e os dois
  // chegam com `;codecs=...` no tipo, que é cortado antes de procurar nesta tabela.
  "audio/mpeg": { ext: "mp3", max: AUDIO },
  "audio/mp3": { ext: "mp3", max: AUDIO },
  "audio/mp4": { ext: "m4a", max: AUDIO },
  "audio/x-m4a": { ext: "m4a", max: AUDIO },
  "audio/aac": { ext: "m4a", max: AUDIO },
  "audio/wav": { ext: "wav", max: AUDIO },
  "audio/x-wav": { ext: "wav", max: AUDIO },
  "audio/webm": { ext: "webm", max: AUDIO },
  "audio/ogg": { ext: "ogg", max: AUDIO },
};

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  // "audio/webm;codecs=opus" é o que o MediaRecorder manda: o que importa é o container.
  const tipo = (typeof corpo?.tipo === "string" ? corpo.tipo : "").split(";")[0].trim().toLowerCase();
  const tamanho = Number(corpo?.tamanho ?? 0);
  const regra = TIPOS[tipo];
  if (!regra) return NextResponse.json({ error: "Envie JPG, PNG, WEBP, MP4, MOV ou um áudio (MP3, M4A, WAV)." }, { status: 400 });
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > regra.max) {
    return NextResponse.json({ error: `Arquivo grande demais (limite ${Math.round(regra.max / 1024 / 1024)} MB).` }, { status: 400 });
  }

  const caminho = `uploads/${userId}/${randomUUID()}.${regra.ext}`;
  const { data, error } = await db.storage.from(BUCKET_RESULTADOS).createSignedUploadUrl(caminho);
  if (error || !data) return NextResponse.json({ error: `Não consegui preparar o upload: ${error?.message}` }, { status: 500 });

  return NextResponse.json({ caminho, token: data.token, ehVideo: tipo.startsWith("video/"), ehAudio: tipo.startsWith("audio/") });
}
