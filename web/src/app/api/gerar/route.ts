import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";

// Sprint 2 + correções do QA v2 (10/09/2026):
//
// BUG-1 (débito de crédito com brecha de arquitetura): agora o crédito é debitado
// ATOMICAMENTE no banco (função `debitar_credito`, ver
// web/supabase/migration-02-creditos-atomicos.sql) ANTES de chamar o fal.ai -- não
// depois. Se a geração falhar nos dois provedores, o crédito é devolvido
// (`estornar_credito`). Isso fecha: (a) gerar de graça se a chamada de débito for
// bloqueada/falhar depois da geração, (b) debitar 2 num duplo-clique (a função faz
// UPDATE...WHERE saldo>0 num único statement, que o Postgres serializa sozinho).
//
// BUG-2 ("Melhorar" não clareava de verdade, medido objetivamente pelo QA): a correção
// de exposição agora é DETERMINÍSTICA (sharp: gray-world white balance + esticar a
// luminância média pra perto de 130), rodada ANTES do modelo de IA -- que só entra
// depois pra refinar ruído/detalhe, não pra fazer o trabalho pesado de exposição.

const PROMPTS: Record<string, string> = {
  mobiliar:
    "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result.",
  esvaziar:
    "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  melhorar:
    "This real estate photo has already been color- and exposure-corrected. Refine it further: remove noise and grain, recover fine detail, make the lighting look natural and professional like a real estate listing photo, gently balance any remaining color cast. Keep the composition, furniture, walls, and all objects exactly the same -- do not change anything structural, only refine lighting quality and clarity.",
  trocar_ceu:
    "Replace the sky in this photo with a dramatic warm sunset sky (orange and pink gradient). Keep the building, landscaping, and foreground exactly the same. Adjust lighting and reflections on the facade to match the new sky naturally.",
};

type Provedor = "fal-ai/nano-banana/edit" | "fal-ai/flux-pro/kontext";

const PROVIDERES_POR_ACAO: Record<string, [Provedor, Provedor]> = {
  mobiliar: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  esvaziar: ["fal-ai/flux-pro/kontext", "fal-ai/nano-banana/edit"],
  melhorar: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  trocar_ceu: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
};

function corpoRequisicao(modelo: Provedor, prompt: string, dataUri: string) {
  return modelo === "fal-ai/flux-pro/kontext"
    ? { prompt, image_url: dataUri, output_format: "jpeg" as const }
    : { prompt, image_urls: [dataUri], output_format: "jpeg" as const };
}

async function chamarModelo(modelo: Provedor, prompt: string, dataUri: string, falKey: string) {
  const resp = await fetch(`https://fal.run/${modelo}`, {
    method: "POST",
    headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpoRequisicao(modelo, prompt, dataUri)),
  });
  if (!resp.ok) {
    throw new Error(`${modelo} respondeu ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const data = await resp.json();
  const imagem = data.images?.[0];
  if (!imagem) throw new Error(`${modelo} não devolveu imagem.`);
  return imagem as { url: string; width: number; height: number };
}

async function upscale(url: string, falKey: string, fatorAlvo: number) {
  const fator = Math.min(Math.max(fatorAlvo, 1), 4);
  const resp = await fetch("https://fal.run/fal-ai/clarity-upscaler", {
    method: "POST",
    headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: url, upscale_factor: fator }),
  });
  if (!resp.ok) throw new Error(`upscale respondeu ${resp.status}`);
  const data = await resp.json();
  if (!data.image) throw new Error("upscale não devolveu imagem.");
  return data.image as { url: string; width: number; height: number };
}

// Correção determinística de exposição/balanço de branco (gray-world), medida em
// luminância -- é o que o QA pediu depois de provar que o prompt sozinho não resolvia.
async function corrigirExposicao(bytesOriginais: Buffer): Promise<Buffer> {
  const jpegBase = await sharp(bytesOriginais).rotate().jpeg({ quality: 95 }).toBuffer();
  const stats = await sharp(jpegBase).stats();
  const [r, g, b] = stats.channels;
  const grayMedio = (r.mean + g.mean + b.mean) / 3;

  // Gray-world: cada canal escalado pra bater na média cinza -- corrige dominante de cor
  // (ex. luz amarela de lâmpada incandescente, que foi exatamente o caso que o QA testou).
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const ganhoWb: [number, number, number] = [
    clamp(grayMedio / (r.mean || 1), 0.5, 2),
    clamp(grayMedio / (g.mean || 1), 0.5, 2),
    clamp(grayMedio / (b.mean || 1), 0.5, 2),
  ];

  // Depois do balanço de branco, empurra a luminância média pra perto de 130 (meta que
  // o próprio QA definiu como "publicável": 110-140, hoje a foto ruim está em ~38).
  const alvoLuminancia = 130;
  const ganhoExposicao = clamp(alvoLuminancia / (grayMedio || 1), 0.5, 3.5);
  const ganhoFinal: [number, number, number] = [
    ganhoWb[0] * ganhoExposicao,
    ganhoWb[1] * ganhoExposicao,
    ganhoWb[2] * ganhoExposicao,
  ];

  return sharp(jpegBase)
    .linear(ganhoFinal, [0, 0, 0])
    .gamma(1.15) // recupera um pouco de detalhe na sombra sem achatar a imagem
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
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const userId = userData.user.id;

  const form = await req.formData();
  const foto = form.get("foto") as File | null;
  const acao = (form.get("acao") as string) || "mobiliar";
  const semUpscale = form.get("semUpscale") === "1";

  if (!foto) {
    return NextResponse.json({ error: "Nenhuma foto enviada." }, { status: 400 });
  }
  const prompt = PROMPTS[acao];
  const provedores = PROVIDERES_POR_ACAO[acao];
  if (!prompt || !provedores) {
    return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
  }

  // Cria o job ANTES de debitar -- precisamos do id pra registrar o débito atrelado a
  // ele. Fica como "processando" até a geração terminar.
  const { data: job, error: jobCriarError } = await db
    .from("jobs")
    .insert({ user_id: userId, tipo: acao, status: "processando" })
    .select()
    .single();
  if (jobCriarError) {
    return NextResponse.json({ error: `Erro criando job: ${jobCriarError.message}` }, { status: 500 });
  }

  // Débito ATÔMICO, antes de gastar um centavo com a IA. Se não tiver crédito, para
  // aqui -- nunca chama o fal.ai sem crédito reservado.
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

  try {
    const bytesOriginais = Buffer.from(await foto.arrayBuffer());
    const mimeOriginal = foto.type || "image/jpeg";

    let bytesParaIA: Buffer = bytesOriginais;
    let mimeParaIA = mimeOriginal;
    if (acao === "melhorar") {
      bytesParaIA = await corrigirExposicao(bytesOriginais);
      mimeParaIA = "image/jpeg";
    }
    const dataUri = `data:${mimeParaIA};base64,${bytesParaIA.toString("base64")}`;

    const [primario, secundario] = provedores;
    let imagem: { url: string; width: number; height: number };
    let modeloUsado: Provedor = primario;
    let avisoFallback: string | null = null;

    try {
      imagem = await chamarModelo(primario, prompt, dataUri, falKey);
    } catch (erroPrimario) {
      try {
        imagem = await chamarModelo(secundario, prompt, dataUri, falKey);
        modeloUsado = secundario;
        avisoFallback = `${primario} falhou, usamos ${secundario} no lugar.`;
      } catch (erroSecundario) {
        // Os dois provedores falharam -- devolve o crédito antes de responder o erro.
        await db.rpc("estornar_credito", { p_user_id: userId, p_job_id: job.id, p_motivo: "estorno_falha" });
        await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
        return NextResponse.json(
          {
            error: `Os dois provedores falharam (crédito devolvido). Primário: ${
              erroPrimario instanceof Error ? erroPrimario.message : erroPrimario
            } | Secundário: ${erroSecundario instanceof Error ? erroSecundario.message : erroSecundario}`,
          },
          { status: 502 }
        );
      }
    }

    let final = imagem;
    let upscaled = false;
    if (!semUpscale) {
      try {
        const fatorAlvo = 4096 / imagem.width;
        final = await upscale(imagem.url, falKey, fatorAlvo);
        upscaled = true;
      } catch {
        // Upscale é um bônus -- se falhar, entrega o resultado original em vez de dar erro.
      }
    }

    await db
      .from("jobs")
      .update({ status: "concluido", output_url: final.url, creditos_cobrados: 1 })
      .eq("id", job.id);

    return NextResponse.json({
      url: final.url,
      width: final.width,
      height: final.height,
      modelo: modeloUsado,
      upscaled,
      aviso: avisoFallback,
      creditosRestantes: saldoAposDebito,
    });
  } catch (erroInesperado) {
    // Qualquer outra falha (ex. erro processando a foto) também devolve o crédito.
    await db.rpc("estornar_credito", { p_user_id: userId, p_job_id: job.id, p_motivo: "estorno_erro" });
    await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
    return NextResponse.json(
      { error: erroInesperado instanceof Error ? erroInesperado.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
