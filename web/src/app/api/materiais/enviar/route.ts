import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { guardarEAssinar, caminhoResultado, assinar } from "@/lib/armazenamento";
import { rotuloDoTipo } from "@/lib/acoes";

// Enviar foto que JÁ ESTÁ PRONTA, sem passar por IA e sem gastar crédito.
//
// Faltava, e o buraco era grande: o único jeito de uma imagem entrar no acervo era por
// /editar, que sempre roda uma ação e sempre debita. Quem já tem a foto boa da fachada, a
// planta que a incorporadora mandou ou o print do mapa pagava crédito pra editar uma foto
// que não precisava de edição -- só pra ela existir.
//
// Vira um JOB de tipo 'original', igual ao que o mapa faz. Não é rodeio: o acervo, o book,
// o catálogo, o PDF e a página pública já falam a língua de "job", e inventar um segundo
// jeito de guardar imagem duplicaria tudo isso por nada.
//
// NÃO leva selo. O selo queimado no canto e o aviso "editadas digitalmente" existem porque
// a imagem passou por IA; carimbar isso numa foto real seria mentir ao contrário -- dizer
// que é ilustração o que é registro. Quem decide o aviso do rodapé é o conteúdo do
// material (ver book-layout), não uma constante.

export const maxDuration = 120;

/** 12 MB por arquivo. Foto de celular moderna dá 3-6 MB; 12 cobre DSLR sem virar depósito. */
const LIMITE_BYTES = 12 * 1024 * 1024;
const POR_VEZ = 10;

/**
 * Lado maior em 2560px. Mesma régua do /editar: acima disso o arquivo cresce, o PDF
 * engorda e ninguém enxerga diferença numa página A4 nem num celular.
 */
const LADO_MAIOR = 2560;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const arquivos = form.getAll("fotos").filter((f): f is File => f instanceof File).slice(0, POR_VEZ);
  if (arquivos.length === 0) return NextResponse.json({ error: "Nenhuma foto no envio." }, { status: 400 });

  const imovelId = typeof form.get("imovelId") === "string" ? String(form.get("imovelId")) : null;
  if (imovelId) {
    // Confere o dono ANTES de gravar: property_id de outra pessoa colocaria a foto na
    // galeria dela.
    const { data } = await db.from("properties").select("id").eq("id", imovelId).eq("user_id", userId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  }

  const entraram: { id: string; rotulo: string; miniatura: string | null }[] = [];
  const recusadas: string[] = [];

  for (const arquivo of arquivos) {
    const nome = arquivo.name || "foto";
    if (!arquivo.type.startsWith("image/")) {
      recusadas.push(`${nome}: não é imagem`);
      continue;
    }
    if (arquivo.size > LIMITE_BYTES) {
      recusadas.push(`${nome}: passa de ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB`);
      continue;
    }

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    let pronta: Buffer;
    let mini: Buffer;
    try {
      // `.rotate()` queima a orientação do EXIF no pixel. Sem isso a foto do celular entra
      // deitada no PDF, que não lê EXIF.
      const base = sharp(bytes).rotate();
      const dim = await base.metadata();
      if (!dim.width || !dim.height) throw new Error("sem dimensão");
      const precisaEncolher = Math.max(dim.width, dim.height) > LADO_MAIOR;
      pronta = await (precisaEncolher ? base.resize({ width: LADO_MAIOR, height: LADO_MAIOR, fit: "inside" }) : base)
        .jpeg({ quality: 88 })
        .toBuffer();
      mini = await sharp(bytes).rotate().resize({ width: 640, height: 640, fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
    } catch {
      recusadas.push(`${nome}: não consegui abrir esta imagem`);
      continue;
    }

    const jobId = randomUUID();
    const caminho = caminhoResultado(userId, jobId);
    const caminhoMini = caminho.replace(/\.jpg$/, "-thumb.jpg");
    try {
      await guardarEAssinar(db, caminho, pronta, "image/jpeg");
      await guardarEAssinar(db, caminhoMini, mini, "image/jpeg");
    } catch (e) {
      recusadas.push(`${nome}: ${e instanceof Error ? e.message.slice(0, 60) : "falhou ao guardar"}`);
      continue;
    }

    const { error } = await db.from("jobs").insert({
      id: jobId,
      user_id: userId,
      property_id: imovelId,
      tipo: "original",
      status: "concluido",
      // Zero, e é o ponto da funcionalidade: guardar foto não é gerar imagem.
      creditos_cobrados: 0,
      output_path: caminho,
      thumb_path: caminhoMini,
      parametros: { origem: "envio", nome: nome.slice(0, 120) },
    });
    if (error) {
      recusadas.push(`${nome}: ${error.message.slice(0, 60)}`);
      continue;
    }

    entraram.push({
      id: jobId,
      rotulo: rotuloDoTipo("original"),
      miniatura: await assinar(db, caminhoMini).catch(() => null),
    });
  }

  if (entraram.length === 0) {
    return NextResponse.json({ error: `Nenhuma foto entrou. ${recusadas.join(" · ")}` }, { status: 400 });
  }
  return NextResponse.json({ entraram, recusadas });
}
