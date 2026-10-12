import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { prepararLogo, logoSemFundo, vereditoDoLogo } from "@/lib/logo-upload";
import type { Veredito } from "@/lib/fundo-do-logo";
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
  // O VEREDITO DO LOGO JÁ GUARDADO. Sem isto, "Tirar o fundo" só aparecia logo depois de um
  // upload: quem já tinha logo abria a tela e não achava o botão -- teria que subir o mesmo
  // arquivo de novo pra destravar um recurso que existe. É o mesmo erro de esconder que a
  // marca d'água tinha. Custa uma varredura por abertura de uma tela de ajustes, que
  // ninguém abre em laço.
  // A MARCA DA IMOBILIÁRIA, pra tela poder OFERECER a escolha.
  //
  // Sem isto só dava pra mostrar a marca que está valendo, e a pergunta dele em 12/10/2026
  // ("e se o corretor tiver a logo dele e a imobiliária outra?") não tem resposta possível
  // numa tela que nem sabe que a outra existe.
  const daEquipe = await marcaEfetiva(db, userId, "imobiliaria").catch(() => null);
  const marcaDaImobiliaria =
    daEquipe?.org && daEquipe.logo_path !== (data as Perfil | null)?.logo_path
      ? {
          nome: daEquipe.org.nome,
          logoUrl: daEquipe.logo_path ? await assinar(db, daEquipe.logo_path).catch(() => null) : null,
          cor: daEquipe.cor_marca,
          creci: daEquipe.creci ?? "",
          whatsapp: daEquipe.whatsapp ?? "",
          nomeNaPeca: daEquipe.nome ?? "",
        }
      : null;

  const caminhoLogo = (data as Perfil | null)?.logo_path ?? null;
  let fundo: Veredito | null = null;
  if (caminhoLogo) {
    try {
      const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(caminhoLogo);
      if (arq) fundo = await vereditoDoLogo(Buffer.from(await arq.arrayBuffer()));
    } catch {
      fundo = null; // sem veredito a tela só não oferece; a página segue inteira
    }
  }
  // Se o vídeo vai ter tela final: a montagem só a faz com nome, WhatsApp ou logo -- da
  // pessoa OU da imobiliária. O editor usa isto pra linha do tempo durar o que o vídeo dura.
  const efetiva = await marcaEfetiva(db, userId).catch(() => null);
  const corpo = await r.json();
  return NextResponse.json({
    ...corpo,
    ...(fundo ? { fundo } : {}),
    // A outra marca, quando existe e é DIFERENTE da que está valendo. `null` quando a
    // pessoa não está em equipe, ou quando a equipe não tem logo próprio: aí não há
    // escolha a oferecer, e oferecer uma escolha falsa é pior que não oferecer.
    // Nome `marcaDaImobiliaria` porque `imobiliaria` já é usada logo abaixo, e são coisas
    // diferentes: aquela é a equipe (nome, CRECI); esta é a MARCA pronta pra desenhar.
    marcaDaImobiliaria,
    telaFinalPossivel: efetiva ? !!(efetiva.nome || efetiva.whatsapp || efetiva.logo_path) : true,
    // O QUE JÁ VEM DA IMOBILIÁRIA, pra tela poder dizer. Sem isto ela pedia logo pra todo
    // mundo como se cada um estivesse sozinho -- e quem entrou numa equipe que já tem logo
    // concluía que precisava de um.
    imobiliaria: efetiva?.org ?? null,
    // O nome como ele SAI nos materiais: "Pessoa · Imobiliária" quando os dois existem.
    nomeNosMateriais: efetiva?.nome ?? null,
    creciNosMateriais: efetiva?.creci ?? null,
    // De onde veio o logo que está valendo: dela ou da imobiliária.
    logoDaImobiliaria: !!efetiva?.deImobiliaria,
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
  let fundo: Veredito | undefined;
  if (logo && typeof logo === "object") {
    const pronta = await prepararLogo(logo);
    if ("erro" in pronta) return NextResponse.json({ error: pronta.erro }, { status: 400 });
    cores = pronta.cores;
    fundo = pronta.fundo;
    // O caminho leva o id de quem está autenticado, nunca um id vindo do formulário: é o
    // que impede uma pessoa de escrever por cima do logo da outra.
    const caminho = `marca/${userId}/logo.png`;
    const { error: erroUpload } = await db.storage.from(BUCKET_RESULTADOS).upload(caminho, pronta.png, { contentType: "image/png", upsert: true });
    if (erroUpload) return NextResponse.json({ error: `Erro guardando o logo: ${erroUpload.message}` }, { status: 500 });
    atualizacao.logo_path = caminho;
  }

  // TIRAR O FUNDO do logo JÁ guardado. É uma segunda chamada, e não um passo do upload,
  // porque é escolha da pessoa: o logo dela pode ser um selo escuro de propósito, e limpar
  // sozinho destruiria o desenho que ela mandou. A tela só oferece quando `fundo.vale`.
  if (form.get("tirarFundo") === "1") {
    const { data: atual } = await db.from("users").select("logo_path").eq("id", userId).single();
    const caminho = (atual?.logo_path as string | null) ?? null;
    if (!caminho) return NextResponse.json({ error: "Não há logo pra limpar." }, { status: 400 });
    const { data: arq } = await db.storage.from(BUCKET_RESULTADOS).download(caminho);
    if (!arq) return NextResponse.json({ error: "Não consegui ler o logo guardado." }, { status: 500 });
    const limpo = await logoSemFundo(Buffer.from(await arq.arrayBuffer()));
    if (!limpo) return NextResponse.json({ error: "O fundo deste logo não dá pra tirar sem comer parte do desenho." }, { status: 400 });
    const { error: erroSubida } = await db.storage.from(BUCKET_RESULTADOS).upload(caminho, limpo, { contentType: "image/png", upsert: true });
    if (erroSubida) return NextResponse.json({ error: `Erro guardando o logo: ${erroSubida.message}` }, { status: 500 });
    // O caminho é o mesmo, então a URL assinada antiga continuaria servindo o arquivo velho
    // do cache. Quem lê depois pede uma nova; a tela recebe a de agora.
    const { data: depois } = await db.from("users").select(CAMPOS).eq("id", userId).single();
    return resposta(db, depois as Perfil | null);
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
  const r = await resposta(db, data as Perfil | null, cores);
  if (!fundo) return r;
  // O veredito vai junto do upload: a tela decide na hora se oferece "tirar o fundo",
  // sem uma segunda ida ao servidor só pra perguntar.
  return NextResponse.json({ ...(await r.json()), fundo });
}

export async function DELETE(req: NextRequest) {
  const { db, userId, erro } = await usuarioDoToken(req);
  if (erro || !db || !userId) return erro!;
  await db.storage.from(BUCKET_RESULTADOS).remove([`marca/${userId}/logo.png`]);
  await db.from("users").update({ logo_path: null }).eq("id", userId);
  return NextResponse.json({ logoUrl: null });
}
