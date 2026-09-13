import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";
import { categoriaDoTipo } from "@/lib/materiais";

// Materiais: tudo que a pessoa já produziu num lugar só -- foto editada, planta, terreno
// e vídeo -- pra escolher e virar material. É a mesma fonte do Histórico e da galeria do
// imóvel, só que sem o recorte: aqui o critério é "serve pra montar alguma coisa".
//
// Não duplica arquivo: Materiais é uma LEITURA de jobs e videos, não um terceiro
// lugar onde a foto passa a morar.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const limite = Math.min(Number(req.nextUrl.searchParams.get("limite") ?? 200), 400);

  const [{ data: jobs, error: erroJobs }, { data: videos }, { data: imoveis }] = await Promise.all([
    db
      .from("jobs")
      // properties!jobs_property_id_fkey: há DUAS chaves entre jobs e properties
      // (jobs.property_id e properties.capa_job_id); sem nomear, o PostgREST recusa.
      .select("id, tipo, parametros, output_path, criado_em, property_id, properties!jobs_property_id_fkey(titulo)")
      .eq("user_id", userId)
      .eq("status", "concluido")
      .not("output_path", "is", null)
      .order("criado_em", { ascending: false })
      .limit(limite),
    db
      .from("videos")
      .select("id, titulo, status, thumb_path, duracao_segundos, criado_em, property_id, properties!videos_property_id_fkey(titulo)")
      .eq("user_id", userId)
      .eq("status", "concluido")
      .order("criado_em", { ascending: false })
      .limit(60),
    db.from("properties").select("id, titulo, endereco, share_token").eq("user_id", userId).order("atualizado_em", { ascending: false }),
  ]);

  // Falhar alto: consulta quebrada não pode virar "nada ainda" na tela.
  if (erroJobs) return NextResponse.json({ error: `Erro lendo seus materiais: ${erroJobs.message}` }, { status: 500 });

  const daFoto = await Promise.all(
    (jobs ?? []).map(async (j) => {
      const def = ACOES_POR_ID[j.tipo];
      const imovel = j.properties as unknown as { titulo: string | null } | null;
      return {
        id: j.id,
        categoria: categoriaDoTipo(j.tipo),
        rotulo: rotuloDoTipo(j.tipo),
        detalhe: def ? resumirParametros(def, (j.parametros ?? {}) as Record<string, string>) : "",
        criadoEm: j.criado_em,
        imovel: j.property_id ? { id: j.property_id, titulo: imovel?.titulo ?? "Imóvel" } : null,
        miniatura: await assinar(db, j.output_path!).catch(() => null),
      };
    })
  );

  const dosVideos = await Promise.all(
    (videos ?? []).map(async (v) => ({
      id: v.id,
      categoria: "video" as const,
      rotulo: v.titulo ?? "Vídeo",
      detalhe: v.duracao_segundos ? `${v.duracao_segundos}s` : "",
      criadoEm: v.criado_em,
      imovel: v.property_id ? { id: v.property_id, titulo: (v.properties as unknown as { titulo: string | null } | null)?.titulo ?? "Imóvel" } : null,
      miniatura: v.thumb_path ? await assinar(db, v.thumb_path).catch(() => null) : null,
    }))
  );

  const itens = [...daFoto, ...dosVideos].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

  return NextResponse.json({
    itens,
    // endereco e compartilhado servem ao montador de material: um preenche o subtítulo,
    // o outro diz se vai sair QR (sem link público não existe QR pra gerar).
    imoveis: (imoveis ?? []).map((i) => ({ id: i.id, titulo: i.titulo ?? "Imóvel", endereco: i.endereco, compartilhado: !!i.share_token })),
  });
}
