import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { apagarEntradas, caminhoEntrada, guardarEAssinar } from "@/lib/armazenamento";
import { UPSCALER, corpoRequisicao, despachar } from "@/lib/fal";
import { ACOES_POR_ID, limparParametros } from "@/lib/acoes";
import { saldoFal } from "@/lib/custo";

// DESPACHANTE. Esta rota não espera a IA: ela valida, cobra o crédito, coloca o pedido
// na fila do fal e responde na hora com o id do job. Quem acompanha é /api/job/[id].
//
// Por que mudou (11/09/2026): medido em teste real, "remover objeto" levava 99,9s e
// "mobiliar" 38,2s segurando a requisição. Função serverless na Vercel corta em 10s por
// padrão (60s no teto do plano Hobby), então o app funcionava local e morreria no
// deploy. A correção não é pedir mais tempo, é parar de precisar dele.
//
// Fase A (12/09/2026): a ação vem com PARÂMETROS (tipo de espaço, estilo, material...),
// validados contra o catálogo em acoes.ts, que também monta o prompt. A rota não sabe
// nada de prompt: recebe id + parâmetros, devolve job.
//
// O que NÃO mudou, e continua valendo:
//
// BUG-1 (crédito): o débito é ATÔMICO no banco (`debitar_credito`, migration 02) e
// acontece ANTES de gastar com a IA. Se o despacho falhar, estorna na hora.
//
// BUG-2 ("Melhorar" não clareava de verdade, medido pelo QA): a correção de exposição é
// DETERMINÍSTICA (sharp: gray-world + curva de potência por LUT), rodada ANTES do modelo.

export const maxDuration = 60;

// Largura-alvo do "Converter em HD": acima do padrão (2048) pra ser um upgrade de
// verdade, abaixo de 4096 pra não voltar ao custo que quase inviabilizou o plano
// (ver custo.ts). 2560x1707 ≈ 4,4 MP.
const ALVO_HD = 2560;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

// Correção determinística de exposição/balanço de branco (gray-world), medida em
// luminância -- é o que o QA pediu depois de provar (com números) que o prompt sozinho
// não resolvia, e depois que um ganho LINEAR piorou a dominante de cor e estourou mais
// a janela (rodada 2 -> rodada 3 do QA, ver docs/relatorio-qa-mvp-v2.md).
// Testado localmente com web/scripts/testar-exposicao.mjs antes de subir.
async function corrigirExposicao(bytesOriginais: Buffer): Promise<Buffer> {
  const denoised = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).median(3).toBuffer();

  const stats1 = await sharp(denoised).stats();
  const [r1, g1, b1] = stats1.channels;
  const grayMedio1 = (r1.mean + g1.mean + b1.mean) / 3;
  const ganhoWb: [number, number, number] = [
    clamp(grayMedio1 / (r1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (g1.mean || 1), 0.6, 1.8),
    clamp(grayMedio1 / (b1.mean || 1), 0.6, 1.8),
  ];
  const balanceado = await sharp(denoised).linear(ganhoWb, [0, 0, 0]).jpeg({ quality: 95 }).toBuffer();

  const { data: amostra } = await sharp(balanceado)
    .resize(200, 200, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const valoresOrdenados = Array.from(amostra).sort((a, b2) => a - b2);
  const medianaAtual = Math.max(valoresOrdenados[Math.floor(valoresOrdenados.length / 2)], 3);

  const alvoLuminancia = 115;
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
  if (!falKey) return NextResponse.json({ error: "FAL_KEY não configurada." }, { status: 500 });
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const form = await req.formData();
  const foto = form.get("foto") as File | null;
  const mascara = form.get("mascara") as File | null;
  const referencia = form.get("referencia") as File | null;
  const acaoId = (form.get("acao") as string) || "mobiliar";
  const semUpscale = form.get("semUpscale") === "1";

  if (!foto) return NextResponse.json({ error: "Nenhuma foto enviada." }, { status: 400 });

  const acao = ACOES_POR_ID[acaoId];
  if (!acao) return NextResponse.json({ error: `Ação desconhecida: ${acaoId}` }, { status: 400 });

  let brutos: unknown = {};
  try {
    brutos = JSON.parse((form.get("parametros") as string) || "{}");
  } catch {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const parametros = limparParametros(acao, brutos);
  if (referencia && acao.referencia) parametros.referencia = "1";

  // Tudo que dá pra recusar ANTES de criar job e debitar, recusa aqui: ninguém paga um
  // crédito por uma requisição que nunca teve como funcionar.
  if (acao.mascara === "obrigatoria" && !mascara) {
    return NextResponse.json({ error: "Pinte na foto o que você quer mudar antes de gerar." }, { status: 400 });
  }
  if (acao.id === "editar_prompt" && !parametros.instrucao) {
    return NextResponse.json({ error: "Escreva o que você quer mudar na foto." }, { status: 400 });
  }
  const usaMascara = !!mascara && acao.mascara !== "nao";

  const bytesOriginais = Buffer.from(await foto.arrayBuffer());
  if (acao.id === "converter_hd") {
    const dim = await sharp(bytesOriginais).rotate().metadata();
    if ((dim.width ?? 0) >= ALVO_HD) {
      return NextResponse.json(
        { error: `Essa foto já tem ${dim.width}px de largura, não precisa de HD. O crédito não foi cobrado.` },
        { status: 400 }
      );
    }
  }

  const { data: job, error: jobCriarError } = await db
    .from("jobs")
    .insert({ user_id: userId, tipo: acao.id, status: "gerando", parametros })
    .select()
    .single();
  if (jobCriarError) return NextResponse.json({ error: `Erro criando job: ${jobCriarError.message}` }, { status: 500 });

  // Débito ATÔMICO, antes de gastar um centavo com a IA.
  const { data: saldoAposDebito, error: debitoError } = await db.rpc("debitar_credito", {
    p_user_id: userId,
    p_job_id: job.id,
  });
  if (debitoError) return NextResponse.json({ error: `Erro debitando crédito: ${debitoError.message}` }, { status: 500 });
  if (saldoAposDebito === null) {
    await db.from("jobs").update({ status: "sem_credito" }).eq("id", job.id);
    return NextResponse.json({ error: "Sem créditos." }, { status: 402 });
  }

  const caminhosEntrada: string[] = [];
  try {
    let bytesParaIA: Buffer;
    if (acao.id === "melhorar") {
      bytesParaIA = await corrigirExposicao(bytesOriginais);
    } else {
      // `.rotate()` queima a orientação do EXIF no pixel. Obrigatório nas ações com
      // máscara: o navegador JÁ mostra a foto girada (é ele que lê o EXIF), então a
      // máscara chega no espaço girado; mandando os bytes crus, ela ficaria 90° fora.
      bytesParaIA = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).toBuffer();
    }

    const caminhoFoto = caminhoEntrada(userId, job.id, "foto");
    caminhosEntrada.push(caminhoFoto);
    const urlFoto = await guardarEAssinar(db, caminhoFoto, bytesParaIA, "image/jpeg");

    let urlMascara: string | undefined;
    if (usaMascara && mascara) {
      const bytesMascara = Buffer.from(await mascara.arrayBuffer());
      const dimFoto = await sharp(bytesParaIA).metadata();
      const dimMascara = await sharp(bytesMascara).metadata();
      const mascaraFinal =
        dimMascara.width === dimFoto.width && dimMascara.height === dimFoto.height
          ? bytesMascara
          : await sharp(bytesMascara).resize(dimFoto.width, dimFoto.height, { fit: "fill" }).png().toBuffer();
      const caminhoMascara = caminhoEntrada(userId, job.id, "mascara");
      caminhosEntrada.push(caminhoMascara);
      urlMascara = await guardarEAssinar(db, caminhoMascara, mascaraFinal, "image/png");
    }

    let urlReferencia: string | undefined;
    if (referencia && acao.referencia) {
      const bytesRef = await sharp(Buffer.from(await referencia.arrayBuffer()))
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      const caminhoRef = `entradas/${userId}/${job.id}-referencia.jpg`;
      caminhosEntrada.push(caminhoRef);
      urlReferencia = await guardarEAssinar(db, caminhoRef, bytesRef, "image/jpeg");
    }

    // Saldo ANTES de qualquer chamada paga: a diferença até o fim do job é o custo real.
    const saldoAntes = await saldoFal(falKey);

    // ---- Converter em HD: sem modelo de IA, só o upscaler ----
    if (!acao.provedores) {
      const dim = await sharp(bytesParaIA).metadata();
      const fator = Math.min(Math.max(ALVO_HD / (dim.width ?? 1024), 1), 4);
      const up = await despachar(UPSCALER, { image_url: urlFoto, upscale_factor: fator }, falKey);
      await db
        .from("jobs")
        .update({
          status: "upscaling",
          pipeline: {
            etapa: "upscale",
            modelo: UPSCALER,
            provedores: [UPSCALER, UPSCALER],
            tentouFallback: true, // não há fallback pra upscale
            semUpscale: false,
            statusUrl: up.status_url,
            responseUrl: up.response_url,
            entradas: caminhosEntrada,
            urlFoto,
            urlMascara: null,
            urlGerada: urlFoto,
            prompt: "",
            saldoAntes,
          },
        })
        .eq("id", job.id);
      return NextResponse.json({ jobId: job.id, status: "upscaling", creditosRestantes: saldoAposDebito });
    }

    const provedores = usaMascara && acao.provedoresComMascara ? acao.provedoresComMascara : acao.provedores;
    const [primario] = provedores;
    const prompt = acao.prompt(parametros);

    const despacho = await despachar(
      primario,
      corpoRequisicao(primario, { prompt, imagemUrl: urlFoto, mascaraUrl: urlMascara, referenciaUrl: urlReferencia }),
      falKey
    );

    await db
      .from("jobs")
      .update({
        pipeline: {
          etapa: "geracao",
          modelo: primario,
          provedores,
          tentouFallback: false,
          semUpscale,
          statusUrl: despacho.status_url,
          responseUrl: despacho.response_url,
          entradas: caminhosEntrada,
          urlFoto,
          urlMascara: urlMascara ?? null,
          urlReferencia: urlReferencia ?? null,
          prompt,
          saldoAntes,
        },
      })
      .eq("id", job.id);

    return NextResponse.json({ jobId: job.id, status: "gerando", creditosRestantes: saldoAposDebito });
  } catch (erro) {
    await db.rpc("estornar_credito", { p_user_id: userId, p_job_id: job.id, p_motivo: "estorno_erro" });
    await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
    await apagarEntradas(db, caminhosEntrada);
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado." }, { status: 500 });
  }
}
