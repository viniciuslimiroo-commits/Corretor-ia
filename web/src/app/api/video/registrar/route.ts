import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { guardarEAssinar, assinar } from "@/lib/armazenamento";
import { rotuloDoTipo } from "@/lib/acoes";

// A FOTO ENVIADA NA TELA DE VÍDEO PASSA A EXISTIR.
//
// Pedido dele em 22/09/2026, olhando a tela: escolheu "Parque dos Buritis" e leu "este imóvel
// ainda não tem fotos prontas" -- num imóvel do qual ele já tinha feito TRÊS vídeos. A
// mensagem estava certa: o imóvel tinha 3 vídeos e ZERO fotos.
//
// O que acontecia: a foto subia pro bucket em uploads/{userId}/{uuid}.jpg, servia pra
// renderizar aquele vídeo e não era registrada em lugar nenhum. Não virava foto do imóvel,
// não entrava na galeria, não tinha linha no banco. Pior que esquecer: o arquivo FICAVA no
// armazenamento (não há rotina de limpeza), pago e invisível.
//
// O conserto não inventa nada: é o mesmo que /api/materiais/enviar já faz há tempos --
// vira um JOB de tipo "original". O comentário de lá vale inteiro aqui: "a galeria, o book,
// o catálogo, o PDF e a página pública já falam a língua de job, e inventar um segundo jeito
// de guardar imagem duplicaria tudo isso por nada".
//
// Duas diferenças em relação àquela rota, e as duas importam:
//
//   1. O ARQUIVO NÃO É MOVIDO NEM REESCRITO. A cena do vídeo já aponta pro caminho do
//      upload; trocar o arquivo por uma versão reencodada quebraria o vídeo que está sendo
//      montado. Aqui só se cria a miniatura e a linha.
//   2. ZERO CRÉDITO e SEM SELO. Guardar foto não é gerar imagem, e carimbar "imagem
//      ilustrativa" numa foto real seria mentir ao contrário -- dizer que é ilustração o
//      que é registro.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = (await req.json().catch(() => ({}))) as { caminho?: unknown; imovelId?: unknown; nome?: unknown };
  const caminho = typeof corpo.caminho === "string" ? corpo.caminho : "";
  const nome = typeof corpo.nome === "string" ? corpo.nome.slice(0, 120) : "foto";
  const imovelId = typeof corpo.imovelId === "string" && /^[0-9a-f-]{36}$/.test(corpo.imovelId) ? corpo.imovelId : null;

  // O caminho tem que começar com uploads/{userId}/ -- é o que impede alguém de registrar
  // como seu um arquivo de outra pessoa mandando o caminho dela.
  if (!caminho.startsWith(`uploads/${userId}/`) || caminho.includes("..")) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }
  if (!/\.(jpg|jpeg|png|webp)$/i.test(caminho)) {
    return NextResponse.json({ error: "Só foto vira imagem do imóvel." }, { status: 400 });
  }

  if (imovelId) {
    const { data } = await db.from("properties").select("id").eq("id", imovelId).eq("user_id", userId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });
  }

  // Já registrada? Acontece quando a pessoa recarrega ou o envio é repetido. Devolve a que
  // existe em vez de criar uma segunda linha pro mesmo arquivo.
  const { data: jaTem } = await db.from("jobs").select("id").eq("user_id", userId).eq("output_path", caminho).maybeSingle();
  if (jaTem) {
    // Escolheu o imóvel depois de enviar a foto: a linha já existe e só falta o vínculo.
    if (imovelId) await db.from("jobs").update({ property_id: imovelId }).eq("id", (jaTem as { id: string }).id).eq("user_id", userId);
    return NextResponse.json({ jobId: (jaTem as { id: string }).id, jaExistia: true });
  }

  const { data: arquivo, error: erroBaixar } = await db.storage.from(BUCKET_RESULTADOS).download(caminho);
  if (erroBaixar || !arquivo) return NextResponse.json({ error: "Não achei o arquivo enviado." }, { status: 404 });

  let mini: Buffer;
  try {
    // `.rotate()` queima a orientação do EXIF no pixel: sem isso a foto do celular aparece
    // deitada na galeria, que não lê EXIF.
    mini = await sharp(Buffer.from(await arquivo.arrayBuffer())).rotate().resize({ width: 640, height: 640, fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "Não consegui abrir esta imagem." }, { status: 400 });
  }

  const jobId = randomUUID();
  const caminhoMini = caminho.replace(/\.[a-z]+$/i, "-thumb.jpg");
  try {
    await guardarEAssinar(db, caminhoMini, mini, "image/jpeg");
  } catch (e) {
    return NextResponse.json({ error: `Não consegui guardar a miniatura: ${e instanceof Error ? e.message.slice(0, 80) : ""}` }, { status: 500 });
  }

  const { error } = await db.from("jobs").insert({
    id: jobId,
    user_id: userId,
    property_id: imovelId,
    tipo: "original",
    status: "concluido",
    creditos_cobrados: 0,
    output_path: caminho,
    thumb_path: caminhoMini,
    parametros: { origem: "video", nome },
  });
  if (error) return NextResponse.json({ error: error.message.slice(0, 120) }, { status: 500 });

  return NextResponse.json({
    jobId,
    jaExistia: false,
    rotulo: rotuloDoTipo("original"),
    miniatura: await assinar(db, caminhoMini).catch(() => null),
  });
}
