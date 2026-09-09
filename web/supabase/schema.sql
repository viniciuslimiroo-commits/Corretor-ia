-- Schema inicial do MVP (Sprint 0/2). Cole isto no SQL Editor do Supabase e rode.
-- Simplificado de docs/arquitetura-tecnica.md §5 -- sem organizations/org_members ainda
-- (isso é fase 2, painel de imobiliária multiusuário).

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  creci text,
  plano text not null default 'gratis',
  creditos_saldo int not null default 5, -- trial que GERA de verdade (diferencial vs Pedra)
  criado_em timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endereco text,
  criado_em timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  tipo text not null, -- 'mobiliar' | 'esvaziar' | 'melhorar' | ...
  status text not null default 'concluido',
  input_url text,
  output_url text,
  creditos_cobrados int not null default 1,
  custo_real numeric(10,4),
  criado_em timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta int not null, -- positivo = credito adicionado, negativo = consumido
  motivo text not null, -- 'trial' | 'compra' | 'consumo' | 'estorno' | 'plano'
  job_id uuid references public.jobs(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- RLS: cada usuário só vê/edita os próprios dados.
alter table public.users enable row level security;
alter table public.properties enable row level security;
alter table public.jobs enable row level security;
alter table public.credit_ledger enable row level security;

create policy "usuario le proprio perfil" on public.users
  for select using (auth.uid() = id);
create policy "usuario atualiza proprio perfil" on public.users
  for update using (auth.uid() = id);

create policy "usuario ve proprios imoveis" on public.properties
  for all using (auth.uid() = user_id);

create policy "usuario ve proprios jobs" on public.jobs
  for all using (auth.uid() = user_id);

create policy "usuario ve proprio historico de credito" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- Cria a linha em public.users automaticamente quando alguém se cadastra (Supabase Auth).
create or replace function public.criar_usuario_no_cadastro()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  insert into public.credit_ledger (user_id, delta, motivo)
  values (new.id, 5, 'trial');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_usuario_no_cadastro();
