-- Migration 05 -- Sprint 3: assinatura via Stripe. Cole no SQL Editor do Supabase e rode.
--
-- Três coisas:
--
-- 1. `adicionar_creditos`: a irmã da `debitar_credito` da migration 02. Mesmo desenho:
--    UPDATE + INSERT no ledger numa função SECURITY DEFINER que só o service_role pode
--    chamar. O navegador nunca consegue se dar crédito -- quem chama é o webhook da
--    Stripe, no servidor, depois de verificar a assinatura.
--
-- 2. Vínculo usuário <-> Stripe. `stripe_customer_id` é gravado ANTES de mandar a pessoa
--    pro checkout, de propósito: a Stripe não garante a ordem dos eventos, então
--    `invoice.paid` pode chegar antes de `checkout.session.completed`. Com o customer já
--    vinculado, qualquer evento consegue achar o usuário pelo customer.
--
-- 3. `stripe_eventos`: a Stripe pode entregar o mesmo evento mais de uma vez (ela mesma
--    avisa isso na doc). Se creditar duas vezes, o cliente ganha 160 créditos por 69
--    reais. A chave primária no id do evento faz o segundo INSERT falhar, e o webhook
--    usa essa falha como "já processei, ignora".

create or replace function public.adicionar_creditos(
  p_user_id uuid,
  p_quantidade int,
  p_motivo text default 'compra',
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
    set creditos_saldo = creditos_saldo + p_quantidade
    where id = p_user_id
    returning creditos_saldo into novo_saldo;

  if novo_saldo is null then
    return null; -- usuário não existe
  end if;

  insert into public.credit_ledger (user_id, delta, motivo)
  values (p_user_id, p_quantidade, coalesce(p_motivo, 'compra') || coalesce(':' || p_referencia, ''));

  return novo_saldo;
end;
$$;

revoke execute on function public.adicionar_creditos(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.adicionar_creditos(uuid, int, text, text) to service_role;

alter table public.users add column if not exists stripe_customer_id text unique;
alter table public.users add column if not exists stripe_subscription_id text;
alter table public.users add column if not exists assinatura_status text; -- 'active' | 'past_due' | 'canceled' | ...
alter table public.users add column if not exists assinatura_renova_em timestamptz;

create index if not exists users_stripe_customer_id_idx on public.users (stripe_customer_id);

create table if not exists public.stripe_eventos (
  id text primary key,          -- evt_... da Stripe
  tipo text not null,
  recebido_em timestamptz not null default now()
);

-- Ninguém do lado do cliente lê ou escreve isto; é bookkeeping do servidor.
alter table public.stripe_eventos enable row level security;
