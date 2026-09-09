import { NextRequest, NextResponse } from "next/server";

// Sprint 2: mais ações + fallback automático entre provedores + upscale.
//
// Achado do teste de pipeline (docs/pipeline-teste/relatorio-pipeline.md): nenhum modelo
// sozinho ganha em tudo. Por ação, definimos um provedor PRIMÁRIO e um SECUNDÁRIO -- se o
// primário falhar (erro de rede, 4xx/5xx), tentamos o secundário antes de desistir.
//
// "Remover objeto" fica de fora por enquanto: precisa de seleção de área (pincel/máscara),
// que ainda não existe na UI. Ver docs/plano-mvp-tecnico.md.

const PROMPTS: Record<string, string> = {
  mobiliar:
    "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result.",
  esvaziar:
    "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  melhorar:
    "Fix the exposure and white balance of this underexposed, dark room photo. Brighten it naturally as if well-lit by daylight, correct the color balance, remove noise. Keep the composition, furniture, and all objects exactly the same -- only correct the lighting and color.",
  trocar_ceu:
    "Replace the sky in this photo with a dramatic warm sunset sky (orange and pink gradient). Keep the building, landscaping, and foreground exactly the same. Adjust lighting and reflections on the facade to match the new sky naturally.",
};

type Provedor = "fal-ai/nano-banana/edit" | "fal-ai/flux-pro/kontext";

// [primário, secundário] -- ordem definida pelo teste de pipeline real.
const PROVIDERES_POR_ACAO: Record<string, [Provedor, Provedor]> = {
  mobiliar: ["fal-ai/nano-banana/edit", "fal-ai/flux-pro/kontext"],
  esvaziar: ["fal-ai/flux-pro/kontext", "fal-ai/nano-banana/edit"], // nano banana falhou no teste
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
  const fator = Math.min(Math.max(fatorAlvo, 1), 4); // clarity-upscaler aceita até 4x
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
  if (!falKey) {
    return NextResponse.json(
      { error: "FAL_KEY não configurada. Veja web/.env.local.example." },
      { status: 500 }
    );
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

  return NextResponse.json({
    url: final.url,
    width: final.width,
    height: final.height,
    modelo: modeloUsado,
    upscaled,
    aviso: avisoFallback,
  });
}
