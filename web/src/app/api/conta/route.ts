import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { aceitarConvitePendente, contaDe } from "@/lib/cobranca";

// Resumo da conta pra tela: saldo, plano, status e a imobiliária (se for membro). É o
// único lugar de onde o navegador lê créditos -- antes ele lia users.creditos_saldo
// direto pelo cliente anon; com conta de equipe, quem sabe de qual saldo é o servidor.
//
// Também é onde o convite vira membro: se o e-mail tem convite pendente e a pessoa não
// está em nenhuma imobiliária, entra aqui, na primeira leitura depois do login.

export async function GET(req: NextRequest) {
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  const { data: u } = await db.from("users").select("email").eq("id", userId).single();
  const entrouEm = await aceitarConvitePendente(db, userId, u?.email ?? "");
  const conta = await contaDe(db, userId);

  return NextResponse.json({
    email: u?.email ?? "",
    tipo: conta.tipo,
    creditos: conta.creditos,
    plano: conta.plano,
    status: conta.status,
    renovaEm: conta.renovaEm,
    org: conta.org,
    entrouEm,
  });
}
