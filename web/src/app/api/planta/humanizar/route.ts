import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { caminhoEntrada, caminhoOriginal, guardarEAssinar } from "@/lib/armazenamento";
import { contaDe, creditar, debitar } from "@/lib/cobranca";
import { corpoRequisicao, despachar } from "@/lib/fal";
import { limparPlanta } from "@/lib/planta";
import { plantaParaSvg } from "@/lib/planta-svg";
import { ESTILOS } from "@/lib/acoes";

// Planta humanizada: a planta técnica que a pessoa desenhou vira uma vista de cima
// realista, com móveis, piso e sombra -- o desenho que vende, ao lado do que mede.
//
// Duas decisões que definem o resultado:
//
// 1. A IA recebe a planta SEM TEXTO. Modelo de imagem reescreve o que enxerga, e volta com
//    "l2,SO n²" no lugar de "12,50 m²". A planta técnica, com os números certos, continua
//    sendo a saída separada -- é ela que vale como medida, e por isso o humanizado sai
//    marcado como ilustrativo.
//
// 2. O prompt manda MANTER a geometria e proíbe mover parede, porta e janela. Sem isso o
//    modelo "melhora" a planta e devolve outro imóvel, que é pior que não ter a função.
//
// Custa 1 crédito, como qualquer imagem de IA (desenhar a planta continua de graça).
// Vira um job igual aos outros, então quem acompanha é o /api/job/[id] de sempre.

export const maxDuration = 60;

export const TIPO = "planta_humanizada";

// A regra que o modelo quebra sozinho se a gente deixar: ele "melhora" a planta. No
// primeiro teste um cômodo de 4x3 virou dois banheiros com uma parede inventada no meio.
const NAO_MEXER =
  ` ABSOLUTE CONSTRAINTS, more important than beauty:` +
  ` (a) The room layout is FIXED. Reproduce exactly the same rooms, in the same positions, with the same proportions.` +
  ` (b) Never add an interior wall, partition, divider or door that is not in the input image. Never subdivide a room into two.` +
  ` (c) Never merge two rooms into one, never move, resize or remove a wall, door or window.` +
  ` (d) The outer outline of the plan must match the input exactly.` +
  ` Count the rooms in the input and output exactly that many rooms.` +
  ` No text, no labels, no numbers, no dimensions, no watermark.`;

const VISTAS = {
  humanizada: {
    rotulo: "Planta humanizada",
    prompt: (estilo: string, comodos: string) =>
      `Transform this technical architectural floor plan into a photorealistic top-down furnished floor plan, seen strictly from directly above (orthographic top view, no perspective).` +
      ` Furnish each room in ${estilo} style, according to what each room is:${comodos}` +
      ` Add realistic floor materials (wood, tile, stone), rugs, plants and soft natural shadows. Warm natural daylight.` +
      ` Photorealistic architectural visualization, high quality, clean white background outside the plan.` +
      NAO_MEXER,
  },
  maquete: {
    rotulo: "Maquete 3D",
    prompt: (estilo: string, comodos: string) =>
      `Turn this technical architectural floor plan into a realistic 3D dollhouse model: an isometric cutaway view of the same apartment seen from above at an angle, with the roof removed so all rooms are visible.` +
      ` Raise the walls to realistic height and furnish each room in ${estilo} style, according to what each room is:${comodos}` +
      ` Realistic floor and wall materials, soft natural shadows, architectural scale model look, photorealistic render, neutral background, warm daylight.` +
      NAO_MEXER,
  },
} as const;

export type Vista = keyof typeof VISTAS;

/** Como cada cômodo se chama em inglês, pro modelo mobiliar a coisa certa em cada lugar. */
const FUNCAO: [RegExp, string][] = [
  [/su[íi]te/i, "master bedroom with a double bed"],
  [/quarto infantil|infantil/i, "child bedroom with a single bed"],
  [/quarto/i, "bedroom with a bed"],
  [/lavabo/i, "small powder room with toilet and basin, no shower"],
  [/banh/i, "bathroom with toilet, basin and shower"],
  [/cozinha e sala|sala e cozinha/i, "open plan living room and kitchen"],
  [/cozinha/i, "kitchen with counters, cabinets, sink and stove"],
  [/sala de jantar|jantar/i, "dining room with a dining table and chairs"],
  [/sala|estar|living/i, "living room with a sofa, coffee table and rug"],
  [/varanda|sacada|gourmet/i, "balcony with outdoor furniture and plants"],
  [/servi[çc]o|lavanderia/i, "laundry area with washing machine and sink"],
  [/garagem|vaga/i, "garage with a parked car"],
  [/escrit[óo]rio|home ?office/i, "home office with a desk and chair"],
  [/closet/i, "walk-in closet with wardrobes"],
  [/corredor|hall/i, "hallway, mostly empty with a runner rug"],
  [/despensa/i, "pantry with shelving"],
  [/quintal|jardim/i, "garden with grass and plants"],
];

/**
 * Descreve cada cômodo pela POSIÇÃO na imagem, em fração da largura e da altura.
 *
 * O nome não pode ir escrito na planta (modelo de imagem embaralha texto), mas sem saber o
 * que é cada cômodo o modelo chuta -- e foi assim que uma suíte virou dois banheiros. A
 * posição relativa amarra o nome ao lugar sem colocar uma letra na imagem.
 */
function descreverComodos(planta: { comodos: { nome: string; pontos: { x: number; y: number }[] }[] }) {
  const todos = planta.comodos.flatMap((c) => c.pontos);
  if (todos.length === 0) return "";
  const x0 = Math.min(...todos.map((p) => p.x));
  const x1 = Math.max(...todos.map((p) => p.x));
  const y0 = Math.min(...todos.map((p) => p.y));
  const y1 = Math.max(...todos.map((p) => p.y));
  const larg = Math.max(0.001, x1 - x0);
  const alt = Math.max(0.001, y1 - y0);
  const itens = planta.comodos.map((c) => {
    const cx = c.pontos.reduce((s, p) => s + p.x, 0) / c.pontos.length;
    const cy = c.pontos.reduce((s, p) => s + p.y, 0) / c.pontos.length;
    const funcao = FUNCAO.find(([re]) => re.test(c.nome))?.[1] ?? "living space with simple furniture";
    const fx = ((cx - x0) / larg).toFixed(2);
    const fy = ((cy - y0) / alt).toFixed(2);
    return ` the room centered at ${fx} of the width and ${fy} of the height (0,0 = top-left) is a ${funcao};`;
  });
  return `${itens.join("")} There are exactly ${planta.comodos.length} rooms.`;
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: "Serviço de imagem não configurado." }, { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const { planta, erro } = limparPlanta(corpo?.planta);
  if (erro || !planta) return NextResponse.json({ error: erro ?? "Planta inválida." }, { status: 400 });

  const vista: Vista = corpo?.vista === "maquete" ? "maquete" : "humanizada";
  const estiloOpcao = ESTILOS.find((e) => e.valor === corpo?.estilo) ?? ESTILOS[0];

  let imovelId: string | null = null;
  if (typeof corpo?.imovelId === "string" && corpo.imovelId) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", corpo.imovelId).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
  }

  // A planta limpa que a IA vai ler: só geometria, sem número nem nome.
  const { svg } = plantaParaSvg(planta, { escala: 90, grade: false, semTexto: true });
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(svg)).png().toBuffer();
  } catch (e) {
    return NextResponse.json({ error: `Não consegui desenhar a planta: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const conta = await contaDe(db, userId);
  const orgId = conta.tipo === "org" ? conta.id : null;

  const { data: job, error: erroJob } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      org_id: orgId,
      property_id: imovelId,
      tipo: TIPO,
      status: "gerando",
      parametros: { vista, estilo: estiloOpcao.valor, planta },
      selo: "Imagem ilustrativa · planta decorada por IA",
    })
    .select("id")
    .single();
  if (erroJob || !job) return NextResponse.json({ error: `Erro criando job: ${erroJob?.message}` }, { status: 500 });

  let saldo: number | null;
  try {
    saldo = await debitar(db, conta, userId, 1, "consumo", job.id);
  } catch (e) {
    return NextResponse.json({ error: `Erro debitando crédito: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (saldo === null) {
    await db.from("jobs").update({ status: "sem_credito" }).eq("id", job.id);
    return NextResponse.json({ error: conta.tipo === "org" ? "A equipe está sem créditos." : "Sem créditos." }, { status: 402 });
  }

  try {
    const caminhoIn = caminhoEntrada(userId, job.id, "foto");
    const urlPlanta = await guardarEAssinar(db, caminhoIn, png, "image/png");
    // guarda a planta técnica como "original" pra aparecer no antes/depois
    const { svg: svgCheio } = plantaParaSvg(planta, { escala: 90, grade: false });
    const caminhoOrig = caminhoOriginal(userId, job.id);
    await guardarEAssinar(db, caminhoOrig, await sharp(Buffer.from(svgCheio)).png().toBuffer(), "image/png");

    const modelo = "fal-ai/nano-banana/edit" as const;
    const prompt = VISTAS[vista].prompt(estiloOpcao.en, descreverComodos(planta));
    const despacho = await despachar(modelo, corpoRequisicao(modelo, { prompt, imagemUrl: urlPlanta }), falKey);

    await db
      .from("jobs")
      .update({
        input_path: caminhoOrig,
        pipeline: {
          etapa: "geracao",
          modelo,
          provedores: [modelo],
          tentouFallback: true, // sem fallback: outro modelo não respeita a planta
          semUpscale: true,
          statusUrl: despacho.status_url,
          responseUrl: despacho.response_url,
          entradas: [caminhoIn],
          urlFoto: urlPlanta,
          urlMascara: null,
          urlReferencia: null,
          prompt,
          saldoAntes: saldo + 1,
        },
      })
      .eq("id", job.id);

    if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);
    return NextResponse.json({ jobId: job.id, status: "gerando", creditosRestantes: saldo });
  } catch (e) {
    await creditar(db, conta, userId, 1, "estorno_erro", job.id).catch(() => null);
    await db.from("jobs").update({ status: "falhou" }).eq("id", job.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado." }, { status: 500 });
  }
}
