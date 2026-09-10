-- Migration 02 -- corrige o BUG-1 do relatorio-qa-mvp-v2 (débito de crédito com brecha
-- de arquitetura). Cole no SQL Editor do Supabase e rode.
--
-- O que muda:
-- 1. `public.users.creditos_saldo` vira a fonte da verdade (já existia na tabela, mas
--    não era usada -- o saldo era calculado somando credit_ledger toda vez, sem trava
--    contra corrida).
-- 2. Duas funções SECURITY DEFINER (`debitar_credito` / `estornar_credito`) fazem o
--    UPDATE + INSERT no mesmo statement atômico -- resolve o "clicar Gerar duas vezes
--    rápido debita 2" que o QA pediu pra testar.
-- 3. EXECUTE nessas funções é só do `service_role` (o servidor) -- nem `authenticated`
--    nem `anon` conseguem chamar, então ninguém se dá crédito de graça direto do
--    navegador.
-- 4. `jobs` deixa de aceitar INSERT do cliente (o servidor que grava agora).

create or replace function public.debitar_credito(p_user_id uuid, p_job_id uuid, p_motivo text default 'consumo')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_saldo int;
begin
  update public.users
    set creditos_saldo = creditos_saldo - 1
    where id = p_user_id and creditos_saldo > 0
    returning creditos_saldo into novo_saldo;

  if novo_saldo is null then
    return null; -- sem credito -- nada foi debitado
  end if;

  insert into public.credit_ledger (user_id, delta, motivo, job_id)
  values (p_user_id, -1, p_motivo, p_job_id);

  return novo_saldo;
end;
$$;

create or replace function public.estornar_credito(p_user_id uuid, p_job_id uuid, p_motivo text default 'estorno')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_saldo int;
begin
  update public.users
    set creditos_saldo = creditos_saldo + 1
    where id = p_user_id
    returning creditos_saldo into novo_saldo;

  insert into public.credit_ledger (user_id, delta, motivo, job_id)
  values (p_user_id, 1, p_motivo, p_job_id);

  return novo_saldo;
end;
$$;

revoke execute on function public.debitar_credito(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.estornar_credito(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.debitar_credito(uuid, uuid, text) to service_role;
grant execute on function public.estornar_credito(uuid, uuid, text) to service_role;

-- jobs: cliente só lê o próprio histórico agora; quem grava é o servidor (service role,
-- que ignora RLS de qualquer forma -- isto é só documentação/defesa em profundidade).
drop policy if exists "usuario ve proprios jobs" on public.jobs;
create policy "usuario le proprios jobs" on public.jobs
  for select using (auth.uid() = user_id);
