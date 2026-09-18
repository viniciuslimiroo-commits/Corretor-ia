-- Migração 17: CRM (clientes do corretor). Cole no SQL Editor do Supabase e rode.
--
-- Leads do corretor, com as travas do estudo jurídico (docs/planos/crm-whatsapp-regras.md):
-- origem obrigatória em lista fechada, declaração antes do 1º envio (com data, quem e
-- versão do texto), bloqueio "pediu para parar" / "número errado", contagem de mensagens
-- sem resposta e um histórico por conta.
--
-- Papéis (LGPD): o corretor -- ou a imobiliária, quando ele é membro -- é o CONTROLADOR
-- dos leads; o Encena é o OPERADOR. Por isso os leads ficam isolados por conta e nunca
-- são cruzados entre contas.
--
-- Acesso: só pelas rotas do servidor (chave de serviço). RLS ligada e SEM política: o
-- navegador não lê nem escreve lead direto no banco.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,           -- quem cadastrou
  org_id uuid references public.organizations(id) on delete cascade,             -- imobiliária, se ele é membro
  nome text not null,
  telefone text not null,                                                        -- 55 + DDD + número, só dígitos
  email text,
  origem text not null check (origem in ('portal','site','anuncio','indicacao','placa','atendimento','cliente_antigo','mensagem_recebida')),
  etapa text not null default 'novo' check (etapa in ('novo','em_contato','visita','proposta','fechado','perdido','sem_resposta')),
  property_id uuid references public.properties(id) on delete set null,
  observacoes text,
  frio boolean not null default false,                                           -- não procurou o corretor agora
  bloqueio text check (bloqueio in ('pediu_parar','numero_errado')),
  bloqueado_em timestamptz,
  declaracao_em timestamptz,
  declaracao_por uuid references public.users(id) on delete set null,
  declaracao_versao text,
  tentativas_sem_resposta int not null default 0,
  ultimo_envio_em timestamptz,
  proximo_contato_em date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists leads_user_idx on public.leads (user_id, atualizado_em desc);
create index if not exists leads_org_idx on public.leads (org_id, atualizado_em desc) where org_id is not null;
-- O mesmo número não entra duas vezes na mesma conta (a conta é a imobiliária, se houver).
create unique index if not exists leads_telefone_por_conta on public.leads ((coalesce(org_id, user_id)), telefone);

-- Histórico: quem fez o quê, quando. Serve de prova de que o Encena só seguiu as
-- instruções do corretor (LGPD arts. 42 e 43). SEM dado pessoal do lead no detalhe: quando
-- o lead é excluído, a linha fica e o `lead_id` vira nulo.
create table if not exists public.leads_log (
  id bigserial primary key,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  acao text not null,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists leads_log_lead_idx on public.leads_log (lead_id, criado_em desc);
create index if not exists leads_log_conta_idx on public.leads_log ((coalesce(org_id, user_id)), criado_em desc);

-- Números que pediram pra parar, guardados como HASH (sha256 do número + conta): se o lead
-- for excluído e cadastrado de novo, o bloqueio continua valendo. Continua sendo dado
-- pessoal (dá pra conferir um número contra ele) e está na Política de Privacidade.
create table if not exists public.leads_bloqueados (
  conta uuid not null,                     -- org_id ou user_id
  telefone_hash text not null,
  motivo text not null check (motivo in ('pediu_parar','numero_errado')),
  criado_em timestamptz not null default now(),
  primary key (conta, telefone_hash)
);

alter table public.leads enable row level security;
alter table public.leads_log enable row level security;
alter table public.leads_bloqueados enable row level security;
