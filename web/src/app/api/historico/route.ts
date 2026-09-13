import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assinar } from "@/lib/armazenamento";
import { ACOES_POR_ID, resumirParametros, rotuloDoTipo } from "@/lib/acoes";

// Histórico: cada geração da pessoa com miniatura, ação, parâmetros e o que aconteceu
// com o crédito. A Pedra tem isso em "Ver histórico de créditos" e foi como o teste
// confirmou os custos dela -- aqui é o mesmo papel: transparência de onde o crédito foi.
//
// As miniaturas são URLs assinadas curtas (1h): o bucket é privado e continua privado.

export async function GET(req: NextRequest) {
  const db = supabaseServer();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const userId = userData.user.id;

  const limite = Math.min(Number(req.nextUrl.searchParams.get("limite") ?? 60), 200);

  const [{ data: jobs, error: erroJobs }, { data: ledger }] = await Promise.all([
    db
      .from("jobs")
      // `properties!jobs_property_id_fkey`: existem DUAS chaves entre jobs e properties
      // (jobs.property_id e properties.capa_job_id), então "properties(...)" é ambíguo e o
      // PostgREST devolve erro em vez de linhas. Sem nomear a chave, esta consulta falhava
      // inteira e a tela ficava vazia em silêncio, porque o erro era engolido pelo `?? []`.
      .select("id, tipo, status, parametros, output_path, criado_em, reportado_em, custo_real, avaliacao, property_id, properties!jobs_property_id_fkey(titulo)")
      .eq("user_id", userId)
      .order("criado_em", { ascending: false })
      .limit(limite),
    db
      .from("credit_ledger")
      .select("delta, motivo, criado_em")
      .eq("user_id", userId)
      .order("criado_em", { ascending: false })
      .limit(limite * 2),
  ]);

  // Falhar alto: uma consulta quebrada não pode virar "nada ainda" na tela.
  if (erroJobs) return NextResponse.json({ error: `Erro lendo o histórico: ${erroJobs.message}` }, { status: 500 });

  const itens = await Promise.all(
    (jobs ?? []).map(async (j) => {
      const def = ACOES_POR_ID[j.tipo];
      const av = j.avaliacao as { veredito?: string; justificativa?: string; estornado?: boolean } | null;
      const imovel = j.properties as unknown as { titulo: string | null } | null;
      return {
        id: j.id,
        acao: rotuloDoTipo(j.tipo),
        detalhe: def ? resumirParametros(def, (j.parametros ?? {}) as Record<string, string>) : "",
        status: j.status,
        criadoEm: j.criado_em,
        reportado: !!j.reportado_em,
        // O que o avaliador escreveu quando a pessoa pediu o crédito de volta -- a
        // Pedra mostra isso no (i) do histórico; aqui vai direto no cartão.
        avaliacao: av ? { veredito: av.veredito ?? "indeterminado", justificativa: av.justificativa ?? "", estornado: !!av.estornado } : null,
        imovel: j.property_id ? { id: j.property_id, titulo: imovel?.titulo ?? "Imóvel" } : null,
        miniatura: j.output_path ? await assinar(db, j.output_path).catch(() => null) : null,
      };
    })
  );

  const movimentos = (ledger ?? []).map((l) => ({
    delta: l.delta,
    motivo: l.motivo,
    em: l.criado_em,
  }));

  return NextResponse.json({ geracoes: itens, creditos: movimentos });
}
