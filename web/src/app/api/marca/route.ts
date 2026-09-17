import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { prepararLogo } from "@/lib/logo-upload";
import { marcaEfetiva } from "@/lib/cobranca";

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

const CAMPOS = "logo_path, cor_marca, nome, creci, whatsapp";

type Perfil = { logo_path: string | null; cor_marca: string | null; nome: string | null; creci: string | null; whatsapp: string | null };

async function resposta(db: NonNullable<ReturnType<typeof supabaseServer>>, data: Perfil | null, cores?: string[]) {
  return NextResponse.json({
    logoUrl: data?.logo_path ? await assinar(db, data.logo_path).catch(() => null) : null,
    cor: data?.cor_marca ?? null,
    nome: data?.nome ?? "",
    creci: data?.creci ?? "",
    whatsapp: data?.whatsapp ?? "",
    // Só sai quando uma logo acabou de subir: é sugestão daquele upload, não estado salvo.
    ...(cores ? { cores } : {}),
  });
}

export async function GET(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;
  const { data } = await db.from("users").select(CAMPOS).eq("id", userId).single();
  const r = await resposta(db, data as Perfil | null);
  // Se o vídeo vai ter tela final: a montagem só a faz com nome, WhatsApp ou logo -- da
  // pessoa OU da imobiliária. O editor usa isto pra linha do tempo durar o que o vídeo dura.
  const efetiva = await marcaEfetiva(db, userId).catch(() => null);
  const corpo = await r.json();
  return NextResponse.json({ ...corpo, telaFinalPossivel: efetiva ? !!(efetiva.nome || efetiva.whatsapp || efetiva.logo_path) : true });
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
  // Dados que aparecem na página compartilhada. O WhatsApp fica só com dígitos (DDI
  // opcional) pra montar o link wa.me sem surpresa.
  const nome = form.get("nome");
  if (typeof nome === "string") atualizacao.nome = nome.trim().slice(0, 80) || null;
  const creci = form.get("creci");
  if (typeof creci === "string") atualizacao.creci = creci.trim().slice(0, 30) || null;
  const whatsapp = form.get("whatsapp");
  if (typeof whatsapp === "string") {
    const digitos = whatsapp.replace(/\D/g, "").slice(0, 15);
    atualizacao.whatsapp = digitos.length >= 10 ? digitos : null;
  }

  let cores: string[] | undefined;
  if (logo && typeof logo === "object") {
    const pronta = await prepararLogo(logo);
    if ("erro" in pronta) return NextResponse.json({ error: pronta.erro }, { status: 400 });
    cores = pronta.cores;
    // O caminho leva o id de quem está autenticado, nunca um id vindo do formulário: é o
    // que impede uma pessoa de escrever por cima do logo da outra.
    const caminho = `marca/${userId}/logo.png`;
    const { error: erroUpload } = await db.storage.from(BUCKET_RESULTADOS).upload(caminho, pronta.png, { contentType: "image/png", upsert: true });
    if (erroUpload) return NextResponse.json({ error: `Erro guardando o logo: ${erroUpload.message}` }, { status: 500 });
    atualizacao.logo_path = caminho;
  }

  // A tela de boas-vindas avisa por aqui que já foi vista: 'feito' quando salvou alguma
  // coisa, 'pulado' quando dispensou. Só controla exibição -- ver migração 13.
  const onboarding = form.get("onboarding");
  if (onboarding === "feito" || onboarding === "pulado") {
    atualizacao.onboarding_marca = onboarding;
    atualizacao.onboarding_marca_em = new Date().toISOString();
  }

  if (Object.keys(atualizacao).length) {
    const { error: erroUpdate } = await db.from("users").update(atualizacao).eq("id", userId);
    if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 500 });
  }

  const { data } = await db.from("users").select(CAMPOS).eq("id", userId).single();
  return resposta(db, data as Perfil | null, cores);
}

export async function DELETE(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;
  await db.storage.from(BUCKET_RESULTADOS).remove([`marca/${userId}/logo.png`]);
  await db.from("users").update({ logo_path: null }).eq("id", userId);
  return NextResponse.json({ logoUrl: null });
}
