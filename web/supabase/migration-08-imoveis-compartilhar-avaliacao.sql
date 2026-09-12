-- Migration 08 -- Fase B do gap com a Pedra (docs/gap-pedra.md). Cole no SQL Editor e rode.
--
-- 1. Imóveis viram projeto de verdade: título, capa, "atualizado em" e um token de
--    compartilhamento. A tabela existia desde o schema inicial, mas nada gravava nela.
-- 2. jobs guarda a FOTO ORIGINAL (input_path). Até aqui a original era apagada no fim do
--    job; sem ela não existe "antes e depois" na galeria nem na página compartilhada, e
--    o classificador de estorno não tem com o que comparar o resultado.
-- 3. jobs.share_token: link público de uma foto. jobs.avaliacao: o veredito do modelo
--    de visão quando a pessoa pede o crédito de volta (o que a Pedra mostra no ⓘ do
--    histórico), guardado pra auditoria e pra calibrar a política.
-- 4. users.nome / users.whatsapp: o que aparece na página compartilhada, junto com o
--    logo e o CRECI que já existiam.
--
-- Os tokens são aleatórios (22 caracteres url-safe, gerados no servidor); a página
-- pública lê com service role, então nenhuma policy nova é aberta pro anon.

alter table public.properties add column if not exists titulo text;
alter table public.properties add column if not exists capa_job_id uuid references public.jobs(id) on delete set null;
alter table public.properties add column if not exists share_token text unique;
alter table public.properties add column if not exists atualizado_em timestamptz not null default now();

alter table public.jobs add column if not exists input_path text;
alter table public.jobs add column if not exists share_token text unique;
alter table public.jobs add column if not exists avaliacao jsonb;

create index if not exists jobs_property_id_idx on public.jobs (property_id);
create index if not exists jobs_share_token_idx on public.jobs (share_token);
create index if not exists properties_share_token_idx on public.properties (share_token);

alter table public.users add column if not exists nome text;
alter table public.users add column if not exists whatsapp text;
