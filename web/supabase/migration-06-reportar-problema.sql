-- Migration 06 -- Sprint 3: "geração ruim = crédito de volta". Cole no SQL Editor e rode.
--
-- Versão simples, como o plano pediu: um botão que devolve o crédito. O classificador
-- automático de "resultado ruim" (o que a Pedra faz) fica pra depois; primeiro manual.
--
-- `reportado_em` faz dois trabalhos: marca que o job já foi reportado (um estorno por
-- job, garantido por UPDATE ... WHERE reportado_em IS NULL, que é atômico) e permite
-- contar quantos reportes um usuário fez nas últimas 24h, que é o freio contra quem
-- descobrir que "reportar" é um botão de gerar de graça.
alter table public.jobs add column if not exists reportado_em timestamptz;
alter table public.jobs add column if not exists motivo_reporte text;

create index if not exists jobs_reportado_em_idx
  on public.jobs (user_id, reportado_em)
  where reportado_em is not null;
