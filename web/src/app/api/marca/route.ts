import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer, BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";

// Marca do corretor (a Pedra chama de Branding): o logo que ele pode carimbar nas fotos
// exportadas, no canto oposto ao selo de "imagem ilustrativa". O arquivo vai pro bucket
// privado, normalizado pra PNG com transparência e no máximo 800px, pra compor rápido.

async function usuarioDoToken(req: NextRequest) {
  const db = supabaseServer();
  if (!db) return { db: null, userId: null, erro: NextResponse.json({ error: "Servidor sem Supabase." }, { status: 500 }) };
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { db, userId: null, erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { db, userId: null, erro: NextResponse.json({ error: "Sessão inválida." }, { status: 401 }) };
  return { db, userId: data.user.id, erro: null };
}

export async function GET(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;
  const { data } = await db.from("users").select("logo_path, cor_marca").eq("id", userId).single();
  return NextResponse.json({
    logoUrl: data?.logo_path ? await assinar(db, data.logo_path).catch(() => null) : null,
    cor: data?.cor_marca ?? null,
  });
}

export async function POST(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;

  const form = await req.formData();
  const logo = form.get("logo") as File | null;
  const cor = (form.get("cor") as string | null)?.trim();

  const atualizacao: Record<string, string | null> = {};
  if (cor !== undefined && cor !== null) {
    atualizacao.cor_marca = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : null;
  }

  if (logo) {
    let png: Buffer;
    try {
      png = await sharp(Buffer.from(await logo.arrayBuffer()))
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "Não consegui ler esse arquivo como imagem." }, { status: 400 });
    }
    const caminho = `marca/${userId}/logo.png`;
    const { error: erroUpload } = await db.storage.from(BUCKET_RESULTADOS).upload(caminho, png, { contentType: "image/png", upsert: true });
    if (erroUpload) return NextResponse.json({ error: `Erro guardando o logo: ${erroUpload.message}` }, { status: 500 });
    atualizacao.logo_path = caminho;
  }

  if (Object.keys(atualizacao).length) {
    const { error: erroUpdate } = await db.from("users").update(atualizacao).eq("id", userId);
    if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 500 });
  }

  const { data } = await db.from("users").select("logo_path, cor_marca").eq("id", userId).single();
  return NextResponse.json({
    logoUrl: data?.logo_path ? await assinar(db, data.logo_path).catch(() => null) : null,
    cor: data?.cor_marca ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;
  await db.storage.from(BUCKET_RESULTADOS).remove([`marca/${userId}/logo.png`]);
  await db.from("users").update({ logo_path: null }).eq("id", userId);
  return NextResponse.json({ logoUrl: null });
}
