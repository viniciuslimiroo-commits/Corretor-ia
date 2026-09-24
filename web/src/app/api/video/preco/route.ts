import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { animacoesGuardadas } from "@/lib/video-pipeline";
import { custoDoVideo, CREDITOS, type EspecVideo } from "@/lib/video";

// QUANTO ESTE VÍDEO VAI CUSTAR DE VERDADE.
//
// Achado em 24/09/2026, conferindo por que a tela disse "Animando 2 cenas" num vídeo de 4
// cenas animadas: o servidor tinha cobrado 4 créditos e o botão tinha prometido 8.
//
// Os dois estavam certos pelo que sabiam. Cena animada cujo clipe JÁ existe no armazenamento
// (mesma foto, mesma animação, mesma duração) não é gerada de novo e não cobra -- o servidor
// confere isso na criação do vídeo. A tela não tinha como saber: ela só descobria clipe
// guardado ao REABRIR um vídeo pronto, quando o servidor manda essa informação junto.
//
// O resultado prático é o pior tipo de erro de preço: cobra MENOS do que promete. Ninguém
// reclama, e por isso ninguém descobre -- mas o corretor que olha "20 créditos" e desiste de
// gerar desistiu de um vídeo que custaria 8.
//
// Esta rota existe pra tela poder perguntar. Não cobra nada, não gera nada, não muda nada.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { espec } = (await req.json().catch(() => ({}))) as { espec?: EspecVideo };
  if (!espec || !Array.isArray(espec.cenas)) return NextResponse.json({ error: "Espec inválido." }, { status: 400 });

  const guardadas = await animacoesGuardadas(db, userId, espec);
  const gratis = guardadas.map((tem, i) => (tem ? i : -1)).filter((i) => i >= 0);
  const custo = Math.max(0, custoDoVideo(espec) - gratis.length * CREDITOS.animada);
  return NextResponse.json({ gratis, custo });
}
