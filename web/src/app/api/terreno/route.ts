import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { usuarioDaRota } from "@/lib/auth-rota";
import { caminhoOriginal, caminhoResultado, guardarEAssinar } from "@/lib/armazenamento";
import { contaDe } from "@/lib/cobranca";

// Terreno com medidas: a pessoa marca os cantos do lote na foto e digita os metros de
// cada lado; aqui a gente desenha por cima -- polígono, medidas no meio de cada lado,
// área no centro. SEM IA, de propósito: pedir pra um modelo "desenhar as linhas do lote"
// dá borda torta e número inventado. Desenho é determinístico e sai certo sempre.
//
// Não gasta crédito (não custa nada de IA). Vira um job tipo "terreno", então aparece
// no histórico, na galeria do imóvel e no link compartilhado como qualquer foto.

type Ponto = { x: number; y: number };

function escapar(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function limparTexto(v: unknown, max: number) {
  return typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const form = await req.formData();
  const foto = form.get("foto") as File | null;
  if (!foto) return NextResponse.json({ error: "Envie a foto do terreno." }, { status: 400 });

  let pontos: Ponto[] = [];
  let medidas: string[] = [];
  try {
    pontos = JSON.parse((form.get("pontos") as string) || "[]");
    medidas = JSON.parse((form.get("medidas") as string) || "[]");
  } catch {
    return NextResponse.json({ error: "Pontos inválidos." }, { status: 400 });
  }
  pontos = pontos.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })).slice(0, 12);
  if (pontos.length < 3) return NextResponse.json({ error: "Marque pelo menos 3 cantos do terreno." }, { status: 400 });
  medidas = pontos.map((_, i) => limparTexto(medidas[i], 16));
  const area = limparTexto(form.get("area"), 24);
  const titulo = limparTexto(form.get("titulo"), 40);
  const frente = Number(form.get("frente"));
  const corBruta = limparTexto(form.get("cor"), 7);
  const cor = /^#[0-9a-fA-F]{6}$/.test(corBruta) ? corBruta : "#f06b4f";
  // Espessura da linha escolhida na tela (fina 1,2 · média 2 · grossa 3,2 · extra 5).
  // Multiplica a régua base; limitada pra ninguém mandar um número que cobre a foto.
  const espessuraBruta = Number(form.get("espessura"));
  const espessura = Number.isFinite(espessuraBruta) ? Math.min(6, Math.max(1, espessuraBruta)) : 2;
  const imovelIdBruto = limparTexto(form.get("imovelId"), 40) || null;

  let imovelId: string | null = null;
  if (imovelIdBruto) {
    const { data: imovel } = await db.from("properties").select("id").eq("id", imovelIdBruto).eq("user_id", userId).maybeSingle();
    if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 400 });
    imovelId = imovel.id;
  }

  const conta = await contaDe(db, userId);
  const bytesOriginais = Buffer.from(await foto.arrayBuffer());
  let base: Buffer;
  try {
    base = await sharp(bytesOriginais).rotate().resize(2560, 2560, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "Não consegui ler essa imagem." }, { status: 400 });
  }
  const meta = await sharp(base).metadata();
  const W = meta.width ?? 1600;
  const H = meta.height ?? 1200;
  const esc = Math.max(W, H) / 1600;

  // ---- o desenho ----
  const pts = pontos.map((p) => ({ x: p.x * W, y: p.y * H }));
  const caminho = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
  const fonte = Math.round(26 * esc);
  const traco = Math.max(3, Math.round(5 * esc * espessura));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  // halo escuro por baixo: é o que faz a linha aparecer sobre mato, terra e asfalto
  svg += `<path d="${caminho}" fill="none" stroke="#000000" stroke-width="${Math.round(traco * 1.7)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.4"/>`;
  svg += `<path d="${caminho}" fill="${cor}" fill-opacity="0.22" stroke="${cor}" stroke-width="${traco}" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<path d="${caminho}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1, Math.round(traco / 3))}" stroke-dasharray="${traco * 2} ${traco * 1.5}" stroke-linejoin="round" opacity="0.9"/>`;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    svg += `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${Math.round(traco * 1.5)}" fill="#ffffff" stroke="${cor}" stroke-width="${Math.max(2, Math.round(traco * 0.7))}"/>`;
    const m = medidas[i];
    if (!m) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const texto = /m/i.test(m) ? m : `${m} m`;
    const larguraCaixa = Math.round(texto.length * fonte * 0.62 + fonte * 1.2);
    const alturaCaixa = Math.round(fonte * 1.7);
    svg += `<rect x="${(mx - larguraCaixa / 2).toFixed(1)}" y="${(my - alturaCaixa / 2).toFixed(1)}" width="${larguraCaixa}" height="${alturaCaixa}" rx="${Math.round(alturaCaixa / 2)}" fill="${i === frente ? cor : "#0f2d5b"}" fill-opacity="0.92"/>`;
    svg += `<text x="${mx.toFixed(1)}" y="${(my + fonte * 0.36).toFixed(1)}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${fonte}" font-weight="600" fill="#ffffff" text-anchor="middle">${escapar(texto)}</text>`;
  }
  if (area) {
    const cx = pts.reduce((s2, p) => s2 + p.x, 0) / pts.length;
    const cy = pts.reduce((s2, p) => s2 + p.y, 0) / pts.length;
    const textoArea = /m/i.test(area) ? area : `${area} m²`;
    const fonteArea = Math.round(fonte * 1.35);
    const lc = Math.round(textoArea.length * fonteArea * 0.62 + fonteArea * 1.4);
    const ac = Math.round(fonteArea * 1.8);
    svg += `<rect x="${(cx - lc / 2).toFixed(1)}" y="${(cy - ac / 2).toFixed(1)}" width="${lc}" height="${ac}" rx="${Math.round(ac / 2)}" fill="#ffffff" fill-opacity="0.94"/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(cy + fonteArea * 0.36).toFixed(1)}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${fonteArea}" font-weight="700" fill="#0f2d5b" text-anchor="middle">${escapar(textoArea)}</text>`;
  }
  if (titulo) {
    const ft = Math.round(fonte * 1.1);
    const lt = Math.round(titulo.length * ft * 0.6 + ft * 1.4);
    const at = Math.round(ft * 1.8);
    const margem = Math.round(18 * esc);
    svg += `<rect x="${margem}" y="${margem}" width="${lt}" height="${at}" rx="${Math.round(at / 2)}" fill="#0f2d5b" fill-opacity="0.9"/>`;
    svg += `<text x="${margem + Math.round(ft * 0.7)}" y="${margem + ft * 1.22}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${ft}" font-weight="600" fill="#ffffff">${escapar(titulo)}</text>`;
  }
  // aviso: medidas são declaração do anunciante, não medição nossa
  const aviso = "Medidas aproximadas · informadas pelo anunciante";
  const fa = Math.round(fonte * 0.62);
  const la = Math.round(aviso.length * fa * 0.55 + fa * 1.4);
  const aa = Math.round(fa * 1.8);
  svg += `<rect x="${W - la - Math.round(14 * esc)}" y="${H - aa - Math.round(14 * esc)}" width="${la}" height="${aa}" rx="${Math.round(aa / 4)}" fill="#000000" fill-opacity="0.55"/>`;
  svg += `<text x="${W - la / 2 - Math.round(14 * esc)}" y="${H - Math.round(14 * esc) - aa / 2 + fa * 0.36}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${fa}" fill="#ffffff" text-anchor="middle">${aviso}</text>`;
  svg += `</svg>`;

  const final = await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 92 }).toBuffer();

  const { data: job, error } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      org_id: conta.tipo === "org" ? conta.id : null,
      property_id: imovelId,
      tipo: "terreno",
      status: "concluido",
      parametros: { pontos, medidas, area, titulo, cor, espessura, frente: Number.isFinite(frente) ? frente : null },
      creditos_cobrados: 0,
      selo: aviso,
    })
    .select("id")
    .single();
  if (error || !job) return NextResponse.json({ error: error?.message ?? "Erro guardando." }, { status: 500 });

  const caminhoOut = caminhoResultado(userId, job.id);
  const caminhoIn = caminhoOriginal(userId, job.id);
  const [url] = await Promise.all([guardarEAssinar(db, caminhoOut, final, "image/jpeg"), guardarEAssinar(db, caminhoIn, base, "image/jpeg")]);
  await db.from("jobs").update({ output_path: caminhoOut, input_path: caminhoIn }).eq("id", job.id);
  if (imovelId) await db.from("properties").update({ atualizado_em: new Date().toISOString() }).eq("id", imovelId);

  return NextResponse.json({ jobId: job.id, url, width: W, height: H });
}
