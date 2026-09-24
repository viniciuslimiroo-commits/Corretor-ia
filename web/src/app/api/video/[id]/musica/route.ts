import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { BUCKET_RESULTADOS } from "@/lib/supabase-server";
import { rodarFfmpeg, sondarMidia } from "@/lib/ffmpeg";
import { argsTrocarMusica } from "@/lib/video-ffmpeg";
import { MUSICAS, type EspecVideo } from "@/lib/video";

// TROCAR A MÚSICA DE UM VÍDEO QUE JÁ ESTÁ PRONTO.
//
// Pedido dele em 24/09/2026: "quero ter opção de trocar música ou áudio do vídeo mesmo depois
// que o vídeo for feito, até porque é algo simples".
//
// É simples mesmo, e não é simples por acaso: num mp4 a imagem e o som são faixas separadas,
// então dá pra copiar a faixa de vídeo byte a byte e reescrever só a de áudio. Isso muda o
// custo da operação de categoria:
//
//   refazer o vídeo       minutos, e a fila da IA de novo em cada cena animada
//   trocar só a faixa     segundos, sem IA, sem crédito, sem perder qualidade
//
// Por isso é uma rota própria e não "gerar de novo com outra música". O corretor que quer
// testar três músicas no mesmo imóvel faz isso em meio minuto.
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = (await req.json().catch(() => ({}))) as { musica?: string | null; volume?: number };

  const { data: video, error: erroLeitura } = await db
    .from("videos")
    .select("id, user_id, status, espec, output_path, duracao_segundos")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: `Instabilidade ao ler o vídeo: ${erroLeitura.message}` }, { status: 503 });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (video.status !== "concluido" || !video.output_path) {
    return NextResponse.json({ error: "Este vídeo ainda não terminou. Espere ele ficar pronto pra trocar a música." }, { status: 409 });
  }

  const espec = (video.espec ?? {}) as EspecVideo;

  // A RECUSA HONESTA. Narração e blocos de áudio são MIXADOS na mesma faixa que a música --
  // não dá pra tirar um sem tirar o outro. Trocar a faixa aqui levaria a voz embora sem
  // avisar, que é pior do que não ter o botão. Esse caso pede a geração inteira, e no editor
  // ela não cobra crédito de novo: os clipes animados ficam guardados.
  if (espec.narracao || (Array.isArray(espec.audios) && espec.audios.length > 0)) {
    return NextResponse.json(
      { error: "Este vídeo tem voz na trilha, e a voz está misturada com a música na mesma faixa. Pra trocar a música sem perder a narração, abra no editor e gere de novo — as cenas animadas já estão guardadas e não cobram crédito outra vez." },
      { status: 409 }
    );
  }

  // `null` é uma escolha de verdade: deixar o vídeo mudo. O corretor que vai postar num lugar
  // onde a trilha atrapalha (ou que põe a música do próprio Instagram por cima) quer isso.
  const pedida = corpo.musica ?? null;
  const escolhida = pedida ? MUSICAS.find((m) => m.id === pedida) : null;
  if (pedida && !escolhida) return NextResponse.json({ error: "Essa música não existe." }, { status: 400 });

  // "Sem música" existe na lista com `arquivo: null`, e é a mesma coisa que não escolher:
  // o vídeo sai mudo. Tratar os dois no mesmo caminho evita um botão que promete silêncio e
  // entrega um erro de arquivo não encontrado.
  const arquivoMusica = escolhida?.arquivo ? path.join(process.cwd(), "public", "musica", escolhida.arquivo) : null;
  if (arquivoMusica && !fs.existsSync(arquivoMusica)) {
    return NextResponse.json({ error: "A música escolhida não está no servidor." }, { status: 500 });
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "encena-musica-"));
  const entrada = path.join(dir, "video.mp4");
  const saida = path.join(dir, "novo.mp4");
  try {
    const { data, error } = await db.storage.from(BUCKET_RESULTADOS).download(video.output_path);
    if (error || !data) throw new Error(`Não consegui baixar o vídeo: ${error?.message ?? "vazio"}`);
    fs.writeFileSync(entrada, Buffer.from(await data.arrayBuffer()));

    // A duração vem do ARQUIVO e não do banco: é ela que corta a música e posiciona o fade de
    // saída, e um número errado aqui deixaria a música terminando antes ou depois da imagem.
    const sonda = await sondarMidia(entrada);
    const duracao = sonda.duracao ?? video.duracao_segundos ?? 30;

    await rodarFfmpeg(
      argsTrocarMusica({ video: entrada, musica: arquivoMusica ?? undefined, saida, duracao, volume: corpo.volume }),
      90_000
    );

    // Guarda POR CIMA do mesmo caminho, de propósito: o link que ele já mandou pro cliente
    // continua valendo e passa a tocar a música nova. Gravar num caminho novo deixaria o
    // link antigo com a música velha, que é o contrário do que "trocar a música" quer dizer.
    const { error: erroSubida } = await db.storage
      .from(BUCKET_RESULTADOS)
      .upload(video.output_path, fs.readFileSync(saida), { contentType: "video/mp4", upsert: true });
    if (erroSubida) throw new Error(`Não consegui guardar o vídeo: ${erroSubida.message}`);

    // O espec guardado tem que contar a mesma história do arquivo: quem abrir no editor
    // depois precisa ver a música que está tocando, não a que tocava antes.
    const novoEspec = { ...espec, musica: escolhida?.id, musicaVolume: corpo.volume ?? espec.musicaVolume };
    await db.from("videos").update({ espec: novoEspec }).eq("id", id).eq("user_id", userId);

    return NextResponse.json({ ok: true, url: await assinar(db, video.output_path), musica: escolhida?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui trocar a música." }, { status: 500 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
