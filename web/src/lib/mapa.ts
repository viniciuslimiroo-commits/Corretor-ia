import { guardarEAssinar, caminhoResultado } from "./armazenamento";
import type { ImovelMontagem } from "./book-montagem";

// O MAPA da página de localização.
//
// Vem do Mapbox: geocodifica o endereço cadastrado e busca uma imagem estática do lugar.
// Tudo no servidor -- a chave nunca chega ao navegador, e a imagem fica no mesmo bucket
// privado das fotos, com URL assinada por uma hora como todo o resto.
//
// O mapa vira um JOB de tipo 'mapa', com zero crédito cobrado. Parece rodeio e não é: o
// book guarda jobId, não URL, e o pipeline inteiro -- assinar, miniatura, gaveta de
// Materiais, exportar em PDF, página pública -- já sabe lidar com job. Inventar um segundo
// jeito de guardar imagem seria duplicar tudo isso pra uma imagem só.
//
// SEM MAPBOX_TOKEN nada disso roda, e está certo: a página de localização já se vira com o
// endereço e o QR. Mapa é melhoria, não requisito -- e a chave é decisão de quem paga.

const BASE_GEO = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const BASE_IMG = "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export function temMapa(): boolean {
  return !!process.env.MAPBOX_TOKEN;
}

/** Endereço em texto -> coordenadas. Sem casa nenhuma inventada: falhou, devolve null. */
export async function coordenadasDe(endereco: string): Promise<{ lon: number; lat: number } | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token || !endereco.trim()) return null;
  // "country=br" evita o clássico: "Rua T-55" existir em outro país e o mapa abrir na Ásia.
  const url = `${BASE_GEO}/${encodeURIComponent(endereco.slice(0, 180))}.json?country=br&limit=1&access_token=${token}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { features?: { center?: [number, number] }[] };
    const c = d.features?.[0]?.center;
    if (!c || c.length !== 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    return { lon: c[0], lat: c[1] };
  } catch {
    return null;
  }
}

/**
 * A imagem do mapa, com um alfinete na cor da marca.
 *
 * Zoom 14: mostra o bairro e as ruas em volta, que é o que o cliente quer ver. Zoom alto
 * demais mostra o telhado e não diz nada; baixo demais vira mapa do estado.
 */
async function imagemDoMapa(lon: number, lat: number, cor: string | undefined): Promise<Buffer | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const hex = (cor ?? "#0f2d5b").replace("#", "");
  const pin = `pin-l+${hex}(${lon},${lat})`;
  const url = `${BASE_IMG}/${pin}/${lon},${lat},14,0/1000x620@2x?access_token=${token}&logo=true&attribution=true`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Devolve o jobId de um mapa pronto para este imóvel, gerando na primeira vez.
 *
 * Reaproveita: o mesmo imóvel entra em vários books, e o endereço não muda de semana em
 * semana. Um job de tipo 'mapa' por imóvel, e pronto.
 */
export async function garantirMapa(db: Db, userId: string, imovel: ImovelMontagem, cor?: string): Promise<string | null> {
  if (!temMapa() || !imovel.id || !imovel.endereco) return null;

  const { data: jaTem } = await db
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("property_id", imovel.id)
    .eq("tipo", "mapa")
    .eq("status", "concluido")
    .limit(1)
    .maybeSingle();
  if (jaTem?.id) return String(jaTem.id);

  const onde = await coordenadasDe(imovel.endereco);
  if (!onde) return null;
  const png = await imagemDoMapa(onde.lon, onde.lat, cor);
  if (!png) return null;

  const { data: criado, error } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      property_id: imovel.id,
      tipo: "mapa",
      status: "concluido",
      // Zero: mapa não passa por IA nem por GPU, e cobrar por ele seria cobrar por um
      // endereço que o corretor já digitou.
      creditos_cobrados: 0,
      parametros: { endereco: imovel.endereco, lon: onde.lon, lat: onde.lat },
    })
    .select("id")
    .single();
  if (error || !criado) return null;

  const caminho = caminhoResultado(userId, String(criado.id)).replace(/\.jpg$/, ".png");
  try {
    await guardarEAssinar(db, caminho, png, "image/png");
  } catch {
    await db.from("jobs").delete().eq("id", criado.id).then(undefined, () => {});
    return null;
  }
  await db.from("jobs").update({ output_path: caminho }).eq("id", criado.id);
  return String(criado.id);
}
