-- Migration 10 -- Imobiliárias (conta de equipe). Cole no SQL Editor e rode.
--
-- Uma imobiliária é uma organização: tem dono, membros (gestor ou corretor), saldo
-- próprio de créditos, plano próprio e marca própria. Quem é membro consome os créditos
-- da imobiliária, não os pessoais (que ficam congelados enquanto for membro). Cada
-- pessoa pertence a no máximo uma imobiliária.
--
-- Convite é por e-mail: quando alguém entra com o e-mail convidado, vira membro na hora
-- (sem SMTP próprio; o link mágico de login que já existe faz o papel do convite).
--
-- Liberações programadas: plano anual paga 10 meses e libera os créditos mês a mês
-- (evita pagar 12, gastar 960 em uma semana e pedir reembolso nos 7 dias do CDC).
-- Uma rotina diária (/api/cron/liberacoes) credita o que venceu.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono_id uuid not null references public.users(id) on delete restrict,
  creditos_saldo int not null default 0,
  plano text not null default 'gratis',       -- gratis | equipe | imobiliaria
  assinatura_status text,
  assinatura_renova_em timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  logo_path text,
  cor_marca text,
  whatsapp text,
  creci text,
  criado_em timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  papel text not null default 'corretor',     -- dono | gestor | corretor
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index if not exists org_members_um_por_usuario on public.org_members (user_id);

create table if not exists public.org_convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  papel text not null default 'corretor',
  convidado_por uuid references public.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  aceito_em timestamptz
);
create unique index if not exists org_convites_pendente_unico on public.org_convites (org_id, lower(email)) where aceito_em is null;
create index if not exists org_convites_email_idx on public.org_convites (lower(email)) where aceito_em is null;

alter table public.credit_ledger add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table public.jobs add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table public.videos add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table public.properties add column if not exists org_id uuid references public.organizations(id) on delete set null;
create index if not exists jobs_org_id_idx on public.jobs (org_id, criado_em desc);
create index if not exists videos_org_id_idx on public.videos (org_id, criado_em desc);

create table if not exists public.liberacoes_creditos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  creditos int not null,
  restantes int not null,
  proxima_em timestamptz not null,
  referencia text,
  stripe_customer_id text,
  criado_em timestamptz not null default now()
);
create index if not exists liberacoes_proxima_idx on public.liberacoes_creditos (proxima_em) where restantes > 0;

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_convites enable row level security;
alter table public.liberacoes_creditos enable row level security;
drop policy if exists "membro ve sua imobiliaria" on public.organizations;
create policy "membro ve sua imobiliaria" on public.organizations
  for select using (exists (select 1 from public.org_members m where m.org_id = id and m.user_id = auth.uid()));
drop policy if exists "membro ve colegas" on public.org_members;
create policy "membro ve colegas" on public.org_members
  for select using (exists (select 1 from public.org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid()));

-- Débito e crédito na conta da IMOBILIÁRIA. Mesmo desenho das funções de usuário
-- (migrations 02, 05 e 09): atômico, security definer, só service_role.
create or replace function public.debitar_creditos_org(p_org_id uuid, p_user_id uuid, p_quantidade int, p_motivo text default 'consumo', p_referencia text default null)
returns int language plpgsql security definer set search_path = public as $$
declare novo_saldo int;
begin
  if p_quantidade <= 0 then raise exception 'quantidade tem que ser positiva (recebi %)', p_quantidade; end if;
  update public.organizations set creditos_saldo = creditos_saldo - p_quantidade
    where id = p_org_id and creditos_saldo >= p_quantidade returning creditos_saldo into novo_saldo;
  if novo_saldo is null then return null; end if;
  insert into public.credit_ledger (user_id, org_id, delta, motivo)
    values (p_user_id, p_org_id, -p_quantidade, coalesce(p_motivo, 'consumo') || coalesce(':' || p_referencia, ''));
  return novo_saldo;
end; $$;

create or replace function public.adicionar_creditos_org(p_org_id uuid, p_user_id uuid, p_quantidade int, p_motivo text default 'compra', p_referencia text default null)
returns int language plpgsql security definer set search_path = public as $$
declare novo_saldo int; ator uuid;
begin
  if p_quantidade <= 0 then raise exception 'quantidade tem que ser positiva (recebi %)', p_quantidade; end if;
  update public.organizations set creditos_saldo = creditos_saldo + p_quantidade
    where id = p_org_id returning creditos_saldo, dono_id into novo_saldo, ator;
  if novo_saldo is null then return null; end if;
  insert into public.credit_ledger (user_id, org_id, delta, motivo)
    values (coalesce(p_user_id, ator), p_org_id, p_quantidade, coalesce(p_motivo, 'compra') || coalesce(':' || p_referencia, ''));
  return novo_saldo;
end; $$;

revoke execute on function public.debitar_creditos_org(uuid, uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.debitar_creditos_org(uuid, uuid, int, text, text) to service_role;
revoke execute on function public.adicionar_creditos_org(uuid, uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.adicionar_creditos_org(uuid, uuid, int, text, text) to service_role;

notify pgrst, 'reload schema';
