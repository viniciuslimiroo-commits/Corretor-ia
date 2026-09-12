import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { membroDe } from "@/lib/cobranca";

// Marca da IMOBILIÁRIA: nome, logo, cor, WhatsApp e CRECI da casa. Vale como padrão pra
// todo membro que não preencher o próprio (ver marcaEfetiva em lib/cobranca.ts). Só
// dono ou gestor mexe. Logo vai pra marca/org/{orgId}/logo.png no bucket privado.

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;
  const membro = await membroDe(db, userId);
  if (!membro) return NextResponse.json({ error: "Você não está numa imobiliária." }, { status: 404 });
  if (membro.papel !== "dono" && membro.papel !== "gestor") return NextResponse.json({ error: "Só dono ou gestor edita a marca." }, { status: 403 });

  const form = await req.formData();
  const atualizacao: Record<string, string | null> = {};
  const nome = form.get("nome");
  if (typeof nome === "string" && nome.trim().length >= 2) atualizacao.nome = nome.replace(/\s+/g, " ").trim().slice(0, 80);
  const cor = form.get("cor");
  if (typeof cor === "string") atualizacao.cor_marca = /^#[0-9a-fA-F]{6}$/.test(cor.trim()) ? cor.trim() : null;
  const creci = form.get("creci");
  if (typeof creci === "string") atualizacao.creci = creci.trim().slice(0, 30) || null;
  const whatsapp = form.get("whatsapp");
  if (typeof whatsapp === "string") {
    const digitos = whatsapp.replace(/\D/g, "").slice(0, 15);
    atualizacao.whatsapp = digitos.length >= 10 ? digitos : null;
  }
  const logo = form.get("logo") as File | null;
  if (logo && typeof logo === "object") {
    let png: Buffer;
    try {
      png = await sharp(Buffer.from(await logo.arrayBuffer())).resize(800, 800, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    } catch {
      return NextResponse.json({ error: "Não consegui ler esse arquivo como imagem." }, { status: 400 });
    }
    const caminho = `marca/org/${membro.orgId}/logo.png`;
    const { error } = await db.storage.from(BUCKET_RESULTADOS).upload(caminho, png, { contentType: "image/png", upsert: true });
    if (error) return NextResponse.json({ error: `Erro guardando o logo: ${error.message}` }, { status: 500 });
    atualizacao.logo_path = caminho;
  }
  if (form.get("removerLogo") === "1") {
    await db.storage.from(BUCKET_RESULTADOS).remove([`marca/org/${membro.orgId}/logo.png`]);
    atualizacao.logo_path = null;
  }

  if (Object.keys(atualizacao).length) {
    const { error } = await db.from("organizations").update(atualizacao).eq("id", membro.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: org } = await db.from("organizations").select("nome, logo_path, cor_marca, whatsapp, creci").eq("id", membro.orgId).single();
  return NextResponse.json({
    nome: org?.nome ?? "",
    logoUrl: org?.logo_path ? await assinar(db, org.logo_path).catch(() => null) : null,
    cor: org?.cor_marca ?? null,
    whatsapp: org?.whatsapp ?? "",
    creci: org?.creci ?? "",
  });
}
