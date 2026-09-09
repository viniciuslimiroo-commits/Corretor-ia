import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Sprint 2: mais ações + fallback automático entre provedores + upscale + débito de
// crédito SEGURO no servidor (bug crítico achado no QA de 09/09/2026 -- ver
// docs/pipeline-teste ou o histórico de commits: o débito era feito do navegador e
// falhava silenciosamente, e além disso um cliente malicioso poderia se dar créditos
// de graça se a policy de INSERT existisse. Agora é tudo verificado aqui.)

const PROMPTS: Record<string, string> = {
  mobiliar:
    "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result.",
  esvaziar:
    "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  melhorar:
    "Dramatically brighten this underexposed real estate photo as if professionally lit for daylight photography -- increase exposure significantly (as if adding 2-3 stops), correct white balance to neutral daylight, recover shadow detail, remove noise and haze. The room should look bright, airy and inviting like a professional real estate listing photo. Keep the composition, furniture, walls, and all objects exactly the same -- only correct lighting, brightness and color.",
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

  // Identifica o usuário pelo token que o navegador manda -- sem token válido, não
  // gera nada. É isso que impede alguém de chamar a rota direto e gerar de graça.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const userId = userData.user.id;

  // Saldo de créditos REAL, lido no servidor (o que a UI mostra é só um espelho disso).
  const { data: ledger, error: ledgerError } = await db
    .from("credit_ledger")
    .select("delta")
    .eq("user_id", userId);
  if (ledgerError) {
    return NextResponse.json({ error: `Erro lendo créditos: ${ledgerError.message}` }, { status: 500 });
  }
  const saldo = (ledger ?? []).reduce((soma, l) => soma + l.delta, 0);
  if (saldo <= 0) {
    return NextResponse.json({ error: "Sem créditos." }, { status: 402 });
  }

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

  const bytes = Buffer.from(await foto.arrayBuffer());
  const mime = foto.type || "image/jpeg";
  const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

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
      return NextResponse.json(
        {
          error: `Os dois provedores falharam. Primário: ${
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

  // Só chega aqui se a geração deu certo -- agora sim registra o job e debita 1
  // crédito, com a service role key (ignora RLS, mas só o servidor tem essa chave).
  const { data: job, error: jobError } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      tipo: acao,
      status: "concluido",
      output_url: final.url,
      creditos_cobrados: 1,
      custo_real: null,
    })
    .select()
    .single();
  if (jobError) {
    return NextResponse.json({ error: `Erro salvando job: ${jobError.message}` }, { status: 500 });
  }

  const { error: debitoError } = await db.from("credit_ledger").insert({
    user_id: userId,
    delta: -1,
    motivo: "consumo",
    job_id: job.id,
  });
  if (debitoError) {
    return NextResponse.json(
      { error: `Imagem gerada mas falhou ao debitar crédito: ${debitoError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: final.url,
    width: final.width,
    height: final.height,
    modelo: modeloUsado,
    upscaled,
    aviso: avisoFallback,
    creditosRestantes: saldo - 1,
  });
}
