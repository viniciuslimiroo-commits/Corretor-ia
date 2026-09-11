import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { caminhoEntrada, guardarEAssinar } from "@/lib/armazenamento";
import {
  ACOES_COM_MASCARA,
  PROMPTS,
  PROVEDORES_POR_ACAO,
  corpoRequisicao,
  despachar,
} from "@/lib/fal";
import { saldoFal } from "@/lib/custo";

// DESPACHANTE. Esta rota não espera a IA: ela valida, cobra o crédito, coloca o pedido
// na fila do fal e responde na hora com o id do job. Quem acompanha é /api/job/[id].
//
// Por que mudou (11/09/2026): medido em teste real, "remover objeto" levava 99,9s e
// "mobiliar" 38,2s segurando a requisição. Função serverless na Vercel corta em 10s por
// padrão (60s no teto do plano Hobby), então o app funcionava local e morreria no
// deploy. A correção não é pedir mais tempo, é parar de precisar dele.
//
// O que NÃO mudou, e continua valendo:
//
// BUG-1 (crédito): o débito é ATÔMICO no banco (`debitar_credito`, migration 02) e
// acontece ANTES de gastar com a IA. Se o despacho falhar, estorna na hora.
//
// BUG-2 ("Melhorar" não clareava de verdade, medido pelo QA): a correção de exposição é
// DETERMINÍSTICA (sharp: gray-world + curva de potência por LUT), rodada ANTES do modelo
// -- que só entra depois pra refinar ruído e detalhe, não pra fazer o trabalho pesado.

// A correção de exposição é trabalho de CPU em imagem grande; 60s é folga de sobra e
// cabe até no plano Hobby.
export const maxDuration = 60;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

// Correção determinística de exposição/balanço de branco (gray-world), medida em
// luminância -- é o que o QA pediu depois de provar (com números) que o prompt sozinho
// não resolvia, e depois que um ganho LINEAR piorou a dominante de cor e estourou mais
// a janela (rodada 2 -> rodada 3 do QA, ver docs/relatorio-qa-mvp-v2.md: ganho linear
// grande clipa canais de forma desigual, ampliando a diferença R-B em vez de reduzir).
// Testado localmente com web/scripts/testar-exposicao.mjs antes de subir.
async function corrigirExposicao(bytesOriginais: Buffer): Promise<Buffer> {
  // 1. Denoise leve ANTES de amplificar (sem isso, ruído de sombra vira mancha).
  const denoised = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).median(3).toBuffer();

  // 2. Balanço de branco gray-world -- corrige dominante de cor (luz amarela de
  //    lâmpada incandescente, o caso exato que o QA testou).
  const stats1 = await sharp(denoised).stats();
  const [r1, g1, b1] = stats1.channels;
  const grayMedio1 = (r1.mean + g1.mean + b1.mean) / 3;
  const ganhoWb: [number, number, number] = [
    clamp(grayMedio1 / (r1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (g1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (b1.mean || 1), 0.6, 1.8),
  ];
  const balanceado = await sharp(denoised).linear(ganhoWb, [0, 0, 0]).jpeg({ quality: 95 }).toBuffer();

  // 3. Exposição via curva de POTÊNCIA aplicada por LUT -- côncava, então clareia
  //    sombra/meio-tom SEM nunca estourar o branco (255 sempre mapeia pra 255; um
  //    ganho linear multiplica reto e clipa o topo, que foi o defeito medido pelo QA).
  const { data: amostra } = await sharp(balanceado)
    .resize(200, 200, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const valoresOrdenados = Array.from(amostra).sort((a, b2) => a - b2);
  const medianaAtual = Math.max(valoresOrdenados[Math.floor(valoresOrdenados.length / 2)], 3);

  const alvoLuminancia = 115; // meio da faixa "publicável" que o QA definiu (110-140)
  const g = clamp(Math.log(medianaAtual / 255) / Math.log(alvoLuminancia / 255), 1, 4.5);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, 1 / g));

  const { data, info } = await sharp(balanceado).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY;
  const db = supabaseServer();
  if (!falKey) {
    return NextResponse.json(
      { error: "FAL_KEY não configurada. Veja web/.env.local.example." },
      { status: 500 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY não configurada. Veja web/.env.local.example." },
      { status: 500 }
    );
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const userId = userData.user.id;

  const form = await req.formData();
  const foto = form.get("foto") as File | null;
  const mascara = form.get("mascara") as File | null;
  const acao = (form.get("acao") as string) || "mobiliar";
  const semUpscale = form.get("semUpscale") === "1";

  if (!foto) return NextResponse.json({ error: "Nenhuma foto enviada." }, { status: 400 });

  const prompt = PROMPTS[acao] ?? "";
  const provedores = PROVEDORES_POR_ACAO[acao];
  if (!provedores) {
    return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
  }
  // Verificado ANTES de criar o job e debitar: ninguém paga um crédito por uma
  // requisição que nunca teve como funcionar.
  if (ACOES_COM_MASCARA.has(acao) && !mascara) {
    return NextResponse.json(
      { error: "Pinte na foto o que você quer remover antes de gerar." },
      { status: 400 }
    );
  }

  const { data: job, error: jobCriarError } = await db
    .from("jobs")
    .insert({ user_id: userId, tipo: acao, status: "gerando" })
    .select()
    .single();
  if (jobCriarError) {
    return NextResponse.json({ error: `Erro criando job: ${jobCriarError.message}` }, { status: 500 });
  }

  // Débito ATÔMICO, antes de gastar um centavo com a IA.
  const { data: saldoAposDebito, error: debitoError } = await db.rpc("debitar_credito", {
    p_user_id: userId,
    p_job_id: job.id,
  });
  if (debitoError) {
    return NextResponse.json({ error: `Erro debitando crédito: ${debitoError.message}` }, { status: 500 });
  }
  if (saldoAposDebito === null) {
    await db.from("jobs").update({ status: "sem_credito" }).eq("id", job.id);
    return NextResponse.json({ error: "Sem créditos." }, { status: 402 });
  }

  const caminhosEntrada: string[] = [];
  try {
    const bytesOriginais = Buffer.from(await foto.arrayBuffer());

    let bytesParaIA: Buffer;
    if (acao === "melhorar") {
      bytesParaIA = await corrigirExposicao(bytesOriginais);
    } else {
      // `.rotate()` queima a orientação do EXIF no pixel. Obrigatório nas ações com
      // máscara: o navegador JÁ mostra a foto girada (é ele que lê o EXIF), então a
      // máscara chega no espaço girado; mandando os bytes crus, ela ficaria 90° fora e
      // o modelo apagaria o lugar errado. Foto de celular em pé é o caso comum.
      bytesParaIA = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).toBuffer();
    }

    const caminhoFoto = caminhoEntrada(userId, job.id, "foto");
    caminhosEntrada.push(caminhoFoto);
    const urlFoto = await guardarEAssinar(db, caminhoFoto, bytesParaIA, "image/jpeg");

    let urlMascara: string | undefined;
    if (mascara) {
      const bytesMascara = Buffer.from(await mascara.arrayBuffer());
      const dimFoto = await sharp(bytesParaIA).metadata();
      const dimMascara = await sharp(bytesMascara).metadata();
      // Se as dimensões não baterem, o modelo apaga a região errada e o usuário só
      // descobre olhando o resultado -- por isso confiro em vez de confiar.
      const mascaraFinal =
        dimMascara.width === dimFoto.width && dimMascara.height === dimFoto.height
          ? bytesMascara
          : await sharp(bytesMascara)
              .resize(dimFoto.width, dimFoto.height, { fit: "fill" })
              .png()
              .toBuffer();
      const caminhoMascara = caminhoEntrada(userId, job.id, "mascara");
      caminhosEntrada.push(caminhoMascara);
      urlMascara = await guardarEAssinar(db, caminhoMascara, mascaraFinal, "image/png");
    }

    // Saldo ANTES de qualquer chamada paga. A diferença até o fim do job é o custo real
    // daquela geração -- é assim que `jobs.custo_real` deixa de ser uma coluna vazia.
    const saldoAntes = await saldoFal(falKey);

    const [primario] = provedores;
    const despacho = await despachar(
      primario,
      corpoRequisicao(primario, prompt, urlFoto, urlMascara),
      falKey
    );

    await db
      .from("jobs")
      .update({
        pipeline: {
          etapa: "geracao",
          modelo: primario,
          tentouFallback: false,
          semUpscale,
          statusUrl: despacho.status_url,
          responseUrl: despacho.response_url,
          entradas: caminhosEntrada,
          urlFoto,
          urlMascara: urlMascara ?? null,
          saldoAntes,
        },
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      status: "gerando",
      creditosRestantes: saldoAposDebito,
    });
  } catch (erro) {
    // Falhou antes de a IA começar: devolve o crédito e limpa o que subiu.
    await db.rpc("estornar_credito", { p_user_id: userId, p_job_id: job.id, p_motivo: "estorno_erro" });
    await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
    if (caminhosEntrada.length) {
      const { apagarEntradas } = await import("@/lib/armazenamento");
      await apagarEntradas(db, caminhosEntrada);
    }
    return NextResponse.json(
      { error: erro instanceof Error ? erro.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
