-- Migration 09 -- Fase C: vídeo. Cole no SQL Editor do Supabase e rode.
--
-- 1. `videos`: um vídeo é várias fotos (ou clipes) mais música, narração e marca, então
--    não cabe em `jobs` (uma foto, uma ação). `espec` guarda o pedido, `pipeline` o
--    andamento (etapa, clipes já renderizados, urls da fila do fal), como em jobs.
--    `lock_ate` é a trava: cada consulta avança UMA etapa e a etapa pode levar dezenas de
--    segundos; a consulta seguinte, vendo a trava viva, só devolve o status.
-- 2. `debitar_creditos` / `creditar`: débito e estorno de N créditos de uma vez, com
--    referência livre (id do vídeo). As funções da migration 02 debitam 1 e exigem job.

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  titulo text,
  formato text not null default '9:16',
  status text not null default 'gerando', -- gerando | concluido | falhou
  espec jsonb not null,
  pipeline jsonb,
  lock_ate timestamptz,
  output_path text,
  thumb_path text,
  duracao_segundos numeric(6,2),
  creditos_cobrados int not null default 0,
  custo_real numeric(10,4),
  erro text,
  share_token text unique,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists videos_user_id_idx on public.videos (user_id, criado_em desc);
create index if not exists videos_property_id_idx on public.videos (property_id);

alter table public.videos enable row level security;
create policy "usuario ve proprios videos" on public.videos
  for select using (auth.uid() = user_id);

create or replace function public.debitar_creditos(
  p_user_id uuid,
  p_quantidade int,
  p_motivo text default 'consumo',
  p_referencia text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_saldo int;
begin
  if p_quantidade <= 0 then
    raise exception 'quantidade tem que ser positiva (recebi %)', p_quantidade;
  end if;
  update public.users
    set creditos_saldo = creditos_saldo - p_quantidade
    where id = p_user_id and creditos_saldo >= p_quantidade
    returning creditos_saldo into novo_saldo;
  if novo_saldo is null then
    return null; -- saldo insuficiente (ou usuário inexistente): nada debitado
  end if;
  insert into public.credit_ledger (user_id, delta, motivo)
  values (p_user_id, -p_quantidade, coalesce(p_motivo, 'consumo') || coalesce(':' || p_referencia, ''));
  return novo_saldo;
end;
$$;

revoke execute on function public.debitar_creditos(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.debitar_creditos(uuid, int, text, text) to service_role;
