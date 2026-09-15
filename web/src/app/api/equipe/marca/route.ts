import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { membroDe } from "@/lib/cobranca";
import { prepararLogo } from "@/lib/logo-upload";

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
  let cores: string[] | undefined;
  if (logo && typeof logo === "object") {
    const pronta = await prepararLogo(logo);
    if ("erro" in pronta) return NextResponse.json({ error: pronta.erro }, { status: 400 });
    const png = pronta.png;
    cores = pronta.cores;
    // orgId vem de membroDe(), que já conferiu que esta pessoa é dono ou gestor DESTA
    // imobiliária. Nada no formulário escolhe em qual pasta escrever.
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

  // A marca salva é da imobiliária, mas quem viu a tela de boas-vindas foi esta pessoa --
  // por isso a marcação fica no usuário, e o próximo corretor da casa vê a dele.
  const onboarding = form.get("onboarding");
  if (onboarding === "feito" || onboarding === "pulado") {
    await db.from("users").update({ onboarding_marca: onboarding, onboarding_marca_em: new Date().toISOString() }).eq("id", userId);
  }

  const { data: org } = await db.from("organizations").select("nome, logo_path, cor_marca, whatsapp, creci").eq("id", membro.orgId).single();
  return NextResponse.json({
    nome: org?.nome ?? "",
    logoUrl: org?.logo_path ? await assinar(db, org.logo_path).catch(() => null) : null,
    cor: org?.cor_marca ?? null,
    whatsapp: org?.whatsapp ?? "",
    creci: org?.creci ?? "",
    ...(cores ? { cores } : {}),
  });
}
