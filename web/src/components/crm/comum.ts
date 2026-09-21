import type { EtapaId, OrigemId } from "@/lib/crm";

// O que as peças do painel do cliente dividem: o formato do cliente como a API devolve,
// a cor de cada etapa e os jeitos de dizer tempo.

export type LeadPainel = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: OrigemId;
  etapa: EtapaId;
  observacoes: string | null;
  frio: boolean;
  bloqueio: "pediu_parar" | "numero_errado" | null;
  declaracao_em: string | null;
  tentativas_sem_resposta: number;
  ultimo_envio_em: string | null;
  proximo_contato_em: string | null;
  property_id: string | null;
  criado_em: string;
};

export type EnvioPainel = {
  pode: { ok: true; primeiroContato: boolean; reabertura: boolean; avisos: string[] } | { ok: false; motivo: string; texto: string };
  texto: string;
  primeirosHoje: number;
  limiteDia: number;
  imovel: string | null;
  /** Quem assina a mensagem. Já vinha do servidor; a tela precisa deles pra trocar
   *  as chaves {corretor} e {creci} dos modelos de mensagem. */
  corretor: string;
  creci: string | null;
};

export type Registro = { acao: string; detalhe: Record<string, unknown> | null; criado_em: string };

/** Cor de cada etapa: a pílula do cabeçote, o nó do caminho e a bolinha da lista. */
export const COR_ETAPA: Record<EtapaId, { fundo: string; texto: string; ponto: string }> = {
  novo: { fundo: "bg-slate-100", texto: "text-slate-700", ponto: "bg-slate-400" },
  em_contato: { fundo: "bg-sky-100", texto: "text-sky-800", ponto: "bg-sky-500" },
  visita: { fundo: "bg-teal-100", texto: "text-teal-800", ponto: "bg-teal-500" },
  proposta: { fundo: "bg-amber-100", texto: "text-amber-800", ponto: "bg-amber-500" },
  fechado: { fundo: "bg-emerald-100", texto: "text-emerald-800", ponto: "bg-emerald-500" },
  perdido: { fundo: "bg-neutral-200", texto: "text-neutral-600", ponto: "bg-neutral-400" },
  sem_resposta: { fundo: "bg-orange-100", texto: "text-orange-800", ponto: "bg-orange-500" },
};

/** "Maria da Silva" -> "MS"; um nome só -> as duas primeiras letras. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 1 || /[A-ZÀ-Ý]/.test(p));
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", "12 de set." */
export function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, (agora - Date.parse(iso)) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Data de calendário (YYYY-MM-DD, sem fuso) do jeito curto daqui. */
export function diaCurto(dia: string): string {
  return new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Hoje em Brasília, YYYY-MM-DD (o dia do corretor, não o do servidor). */
export const hojeEmBrasilia = (agora: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
