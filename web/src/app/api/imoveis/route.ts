import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";

// Imóveis (Fase B): o projeto que agrupa as fotos de um anúncio. A tabela `properties`
// existia desde o schema inicial e ficou vazia até aqui. A capa é a foto escolhida
// (capa_job_id) ou, sem escolha, a última geração concluída.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const [{ data: imoveis }, { data: jobs }] = await Promise.all([
    db.from("properties").select("id, titulo, endereco, capa_job_id, share_token, criado_em, atualizado_em").eq("user_id", userId).order("atualizado_em", { ascending: false }),
    db.from("jobs").select("id, property_id, output_path, criado_em").eq("user_id", userId).eq("status", "concluido").not("property_id", "is", null).order("criado_em", { ascending: false }),
  ]);

  const porImovel = new Map<string, { id: string; output_path: string | null }[]>();
  for (const j of jobs ?? []) {
    const lista = porImovel.get(j.property_id) ?? [];
    lista.push({ id: j.id, output_path: j.output_path });
    porImovel.set(j.property_id, lista);
  }

  const itens = await Promise.all(
    (imoveis ?? []).map(async (i) => {
      const fotos = porImovel.get(i.id) ?? [];
      const capa = fotos.find((f) => f.id === i.capa_job_id) ?? fotos[0];
      return {
        id: i.id,
        titulo: i.titulo ?? "Imóvel",
        endereco: i.endereco,
        fotos: fotos.length,
        compartilhado: !!i.share_token,
        criadoEm: i.criado_em,
        atualizadoEm: i.atualizado_em,
        capa: capa?.output_path ? await assinar(db, capa.output_path).catch(() => null) : null,
      };
    })
  );

  return NextResponse.json({ imoveis: itens });
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const corpo = await req.json().catch(() => ({}));
  const titulo = typeof corpo.titulo === "string" ? corpo.titulo.trim().slice(0, 80) : "";
  const endereco = typeof corpo.endereco === "string" ? corpo.endereco.trim().slice(0, 160) : "";
  if (!titulo) return NextResponse.json({ error: "Dê um nome ao imóvel." }, { status: 400 });

  const { data, error } = await db
    .from("properties")
    .insert({ user_id: userId, titulo, endereco: endereco || null })
    .select("id, titulo, endereco, criado_em, atualizado_em")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Erro criando imóvel." }, { status: 500 });

  return NextResponse.json({ imovel: { id: data.id, titulo: data.titulo, endereco: data.endereco, fotos: 0, compartilhado: false, criadoEm: data.criado_em, atualizadoEm: data.atualizado_em, capa: null } });
}
