import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { assinar } from "@/lib/armazenamento";
import { rotuloDoTipo } from "@/lib/acoes";

// As versões de uma imagem: a foto original, e cada refino em cima dela.
//
// Não existe tabela de versões. Cada refino é um job normal com `origem_job_id`
// apontando pro anterior, e "versões" é andar essa cadeia: primeiro até a raiz (quem não
// tem origem), depois pra frente. Uma tabela separada seria uma segunda verdade sobre a
// mesma imagem, e as duas iam divergir na primeira exclusão.
//
// Devolve na ordem em que a pessoa viu: original, v1, v2… O job pedido pode estar no
// meio -- quem abre a v2 quer ver a v3 que fez depois, não só o que veio antes.

type Linha = {
  id: string;
  tipo: string;
  status: string;
  output_path: string | null;
  input_path: string | null;
  origem_job_id: string | null;
  criado_em: string;
  parametros: Record<string, unknown> | null;
};

const CAMPOS = "id, tipo, status, output_path, input_path, origem_job_id, criado_em, parametros";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  // Pra trás, até a raiz. Teto de 30 pra um ciclo acidental não virar laço infinito.
  const cadeia: Linha[] = [];
  let atual: string | null = id;
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual) && cadeia.length < 30) {
    vistos.add(atual);
    const res = await db.from("jobs").select(CAMPOS).eq("id", atual).eq("user_id", userId).maybeSingle();
    const linha = (res.data ?? null) as Linha | null;
    if (!linha) break;
    cadeia.unshift(linha);
    atual = linha.origem_job_id;
  }
  if (cadeia.length === 0) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });

  // Pra frente: os refinos feitos DEPOIS do job pedido. Só a linha principal (o filho mais
  // recente de cada um); ramificações ficam pra uma tela de árvore, se um dia precisar.
  let ponta: string = cadeia[cadeia.length - 1].id;
  while (cadeia.length < 30) {
    const { data } = await db
      .from("jobs")
      .select(CAMPOS)
      .eq("origem_job_id", ponta)
      .eq("user_id", userId)
      .eq("status", "concluido")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || vistos.has((data as Linha).id)) break;
    vistos.add((data as Linha).id);
    cadeia.push(data as Linha);
    ponta = (data as Linha).id;
  }

  const raiz = cadeia[0];
  const versoes: { jobId: string | null; rotulo: string; url: string | null; instrucao: string | null; atual: boolean }[] = [];

  // A "original" é a foto que entrou na raiz -- não é um job, é o input_path dela.
  if (raiz.input_path) {
    versoes.push({ jobId: null, rotulo: "Original", url: await assinar(db, raiz.input_path).catch(() => null), instrucao: null, atual: false });
  }
  let n = 0;
  for (const j of cadeia) {
    if (j.status !== "concluido" || !j.output_path) continue;
    n++;
    const instrucao = typeof j.parametros?.instrucao === "string" ? (j.parametros.instrucao as string) : null;
    versoes.push({
      jobId: j.id,
      rotulo: n === 1 ? rotuloDoTipo(j.tipo) : `Versão ${n}`,
      url: await assinar(db, j.output_path).catch(() => null),
      instrucao,
      atual: j.id === id,
    });
  }

  return NextResponse.json({ versoes });
}
