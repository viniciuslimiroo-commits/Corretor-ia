-- Migração 18: modelos de mensagem do corretor (e da imobiliária). Cole no SQL Editor do
-- Supabase e rode.
--
-- Pedido do dono (21/09/2026): "quero opção de deixar mensagens personalizadas que a própria
-- corretora ou imobiliária queira deixar" e "deixa opção da pessoa personalizar tb e deixar
-- automático pra cada situação".
--
-- O que muda no produto: além da mensagem que a IA escreve, a casa pode guardar os SEUS
-- textos, um por situação (primeiro contato, retorno, visita, proposta, fechado). Marcando
-- um como automático, ele já vem preenchido quando o corretor abre aquele cliente naquela
-- situação -- sem chamar IA e sem gastar crédito.
--
-- De quem são: a conta é a imobiliária quando a pessoa é membro (mesma regra dos leads), e
-- a pessoa física quando não é. Assim o dono da imobiliária escreve o texto da casa uma vez
-- e todo corretor dela recebe pronto.
--
-- Acesso: só pelas rotas do servidor (chave de serviço). RLS ligada e SEM política, igual
-- aos leads -- o navegador não lê nem escreve modelo direto no banco.

create table if not exists public.modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,        -- quem escreveu
  org_id uuid references public.organizations(id) on delete cascade,          -- imobiliária, se ele é membro
  situacao text not null check (situacao in ('primeiro_contato','retorno','visita','proposta','fechado','qualquer')),
  titulo text not null,
  texto text not null,
  -- Automático: quando o corretor abrir um cliente NESTA situação, o texto já vem posto.
  automatico boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists modelos_conta_idx
  on public.modelos_mensagem ((coalesce(org_id, user_id)), situacao, atualizado_em desc);

-- Só UM automático por situação em cada conta: dois textos disputando o mesmo momento é
-- ambiguidade que aparece como "às vezes vem um, às vezes vem outro".
create unique index if not exists modelos_um_automatico_por_situacao
  on public.modelos_mensagem ((coalesce(org_id, user_id)), situacao)
  where automatico;

alter table public.modelos_mensagem enable row level security;

-- Carimbo de atualização, igual ao das outras tabelas.
create or replace function public.tocar_modelo_mensagem()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists modelos_mensagem_tocar on public.modelos_mensagem;
create trigger modelos_mensagem_tocar
  before update on public.modelos_mensagem
  for each row execute function public.tocar_modelo_mensagem();
