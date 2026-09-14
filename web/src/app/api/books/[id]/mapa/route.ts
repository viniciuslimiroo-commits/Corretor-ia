import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRota } from "@/lib/auth-rota";
import { marcaEfetiva } from "@/lib/cobranca";
import { limparDocumento } from "@/lib/book-documento";
import { faltaMigracao, imovelDeMontagem, RECADO_MIGRACAO } from "@/lib/book-servidor";
import { garantirMapa, temMapa } from "@/lib/mapa";
import { assinar } from "@/lib/armazenamento";

// Busca o mapa do endereço e devolve o jobId pra página de localização.
//
// Separado da criação automática porque o corretor também quer isto num book que já
// existe, sem refazer nada. O mapa fica gravado por imóvel: pedir duas vezes devolve o
// mesmo, sem buscar de novo.

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await usuarioDaRota(req);
  if (s.erro) return s.erro;
  const { db, userId } = s;

  if (!temMapa()) {
    return NextResponse.json(
      { error: "O mapa automático ainda não está ligado nesta conta. Enquanto isso, arraste um print do mapa de Materiais pra esta página." },
      { status: 501 }
    );
  }

  const { data: book, error: erroLeitura } = await db.from("books").select("id, property_id, documento").eq("id", id).eq("user_id", userId).maybeSingle();
  if (erroLeitura && faltaMigracao(erroLeitura)) return NextResponse.json({ error: RECADO_MIGRACAO, migracao: true }, { status: 503 });
  if (!book) return NextResponse.json({ error: "Book não encontrado." }, { status: 404 });
  if (!book.property_id) return NextResponse.json({ error: "Este book não está ligado a um imóvel." }, { status: 400 });
  if (!limparDocumento(book.documento)) return NextResponse.json({ error: "Book sem conteúdo." }, { status: 400 });

  const dados = await imovelDeMontagem(db, userId, book.property_id);
  if (!dados?.imovel.endereco) {
    return NextResponse.json({ error: "Preencha o endereço do imóvel primeiro — é de lá que sai o mapa." }, { status: 422 });
  }

  const marca = await marcaEfetiva(db, userId);
  const cor = /^#?[0-9a-f]{6}$/i.test(marca.cor_marca ?? "") ? (marca.cor_marca as string) : undefined;

  const jobId = await garantirMapa(db, userId, dados.imovel, cor);
  if (!jobId) {
    return NextResponse.json({ error: "Não achei este endereço no mapa. Confira o endereço do imóvel ou arraste um print de Materiais." }, { status: 502 });
  }

  const { data: job } = await db.from("jobs").select("output_path").eq("id", jobId).eq("user_id", userId).maybeSingle();
  const url = job?.output_path ? await assinar(db, job.output_path).catch(() => null) : null;

  return NextResponse.json({ jobId, url });
}
