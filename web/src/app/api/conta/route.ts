import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { aceitarConvitePendente, contaDe, marcaEfetiva } from "@/lib/cobranca";
import { progressoDaMarca } from "@/lib/cores-da-logo";

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

  const { data: u } = await db.from("users").select("email, onboarding_marca").eq("id", userId).single();
  const entrouEm = await aceitarConvitePendente(db, userId, u?.email ?? "");
  const conta = await contaDe(db, userId);

  // A marca vai junto porque a tela inicial decide com ela duas coisas: se mostra a
  // boas-vindas e se mostra o "complete sua marca". Duas viagens pra isso deixariam a
  // boas-vindas piscar depois do painel já montado.
  const marca = await marcaEfetiva(db, userId);
  const progresso = progressoDaMarca({ nome: marca.nome, logo: marca.logo_path, cor: marca.cor_marca, whatsapp: marca.whatsapp, creci: marca.creci });

  return NextResponse.json({
    email: u?.email ?? "",
    tipo: conta.tipo,
    creditos: conta.creditos,
    plano: conta.plano,
    status: conta.status,
    renovaEm: conta.renovaEm,
    org: conta.org,
    entrouEm,
    marca: {
      onboarding: (u?.onboarding_marca as string | null) ?? null,
      progresso,
      nome: marca.nome,
      temLogo: !!marca.logo_path,
      /** Herdada da imobiliária: o corretor vê a marca da casa sem ter preenchido nada. */
      daImobiliaria: marca.deImobiliaria,
    },
  });
}
