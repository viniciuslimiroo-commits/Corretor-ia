import { NextRequest, NextResponse } from "next/server";
import { origemDoApp, usuarioDaRota } from "@/lib/auth-rota";
import { ehToken, gerarToken, urlPublica } from "@/lib/compartilhar";

// Liga e desliga o link público de uma foto (jobId) ou de um imóvel (imovelId).
// POST cria (ou devolve o que já existe); DELETE apaga o token e o link morre na hora.

type Alvo = { tabela: "jobs" | "properties" | "videos"; id: string };

function alvoDo(corpo: Record<string, unknown>): Alvo | null {
  if (typeof corpo.jobId === "string" && corpo.jobId) return { tabela: "jobs", id: corpo.jobId };
  if (typeof corpo.imovelId === "string" && corpo.imovelId) return { tabela: "properties", id: corpo.imovelId };
  if (typeof corpo.videoId === "string" && corpo.videoId) return { tabela: "videos", id: corpo.videoId };
  return null;
}

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const alvo = alvoDo(await req.json().catch(() => ({})));
  if (!alvo) return NextResponse.json({ error: "Informe jobId ou imovelId." }, { status: 400 });

  const { data: linha } = await db.from(alvo.tabela).select("id, share_token" + (alvo.tabela !== "properties" ? ", status" : "")).eq("id", alvo.id).eq("user_id", userId).maybeSingle();
  if (!linha) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (alvo.tabela !== "properties" && (linha as { status?: string }).status !== "concluido") {
    return NextResponse.json({ error: "Só dá pra compartilhar depois de concluído." }, { status: 409 });
  }

  let token = (linha as { share_token?: string | null }).share_token ?? null;
  if (!ehToken(token)) {
    token = gerarToken();
    const { error } = await db.from(alvo.tabela).update({ share_token: token }).eq("id", alvo.id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token, url: urlPublica(origemDoApp(req), token) });
}

export async function DELETE(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const alvo = alvoDo(await req.json().catch(() => ({})));
  if (!alvo) return NextResponse.json({ error: "Informe jobId ou imovelId." }, { status: 400 });

  const { error } = await db.from(alvo.tabela).update({ share_token: null }).eq("id", alvo.id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
