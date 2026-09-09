import { NextRequest, NextResponse } from "next/server";

// Walking skeleton (Sprint 1): recebe uma foto, chama a IA, devolve o resultado.
// Sem banco de dados, sem créditos, sem fila -- só o fio ponta a ponta funcionando.
// Cada "acao" mapeia pra um prompt e (por enquanto) um provedor fixo. A escolha de
// provedor por ação já reflete o achado do teste de pipeline: Nano Banana ganha em
// mobiliar/piso/céu/melhorar, Flux Kontext ganha em esvaziar.

const PROMPTS: Record<string, string> = {
  mobiliar:
    "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result.",
  esvaziar:
    "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same.",
  melhorar:
    "Fix the exposure and white balance of this underexposed, dark room photo. Brighten it naturally as if well-lit by daylight, correct the color balance, remove noise. Keep the composition, furniture, and all objects exactly the same -- only correct the lighting and color.",
};

const PROVIDER_POR_ACAO: Record<string, "fal-ai/nano-banana/edit" | "fal-ai/flux-pro/kontext"> = {
  mobiliar: "fal-ai/nano-banana/edit",
  esvaziar: "fal-ai/flux-pro/kontext",
  melhorar: "fal-ai/nano-banana/edit",
};

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

  if (!foto) {
    return NextResponse.json({ error: "Nenhuma foto enviada." }, { status: 400 });
  }
  const prompt = PROMPTS[acao];
  const modelo = PROVIDER_POR_ACAO[acao];
  if (!prompt || !modelo) {
    return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
  }

  const bytes = Buffer.from(await foto.arrayBuffer());
  const mime = foto.type || "image/jpeg";
  const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

  const body =
    modelo === "fal-ai/flux-pro/kontext"
      ? { prompt, image_url: dataUri, output_format: "jpeg" }
      : { prompt, image_urls: [dataUri], output_format: "jpeg" };

  const resp = await fetch(`https://fal.run/${modelo}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const texto = await resp.text();
    return NextResponse.json(
      { error: `fal.ai respondeu ${resp.status}: ${texto}` },
      { status: 502 }
    );
  }

  const data = await resp.json();
  const imagem = data.images?.[0];
  if (!imagem) {
    return NextResponse.json(
      { error: "Resposta da IA sem imagem.", raw: data },
      { status: 502 }
    );
  }

  return NextResponse.json({
    url: imagem.url,
    width: imagem.width,
    height: imagem.height,
    modelo,
  });
}
