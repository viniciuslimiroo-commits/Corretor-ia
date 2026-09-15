-- Migração 15: refinar um resultado, e nunca cobrar duas vezes o mesmo clique.
--
-- 1. LINHAGEM. `origem_job_id` diz de qual job esta imagem foi refinada. Original → v1 →
--    v2 → v3 vira uma cadeia, e "ver versões" é andar por ela. Nada é substituído: cada
--    versão é um job inteiro, com a sua imagem no storage, o seu prompt e o seu selo.
--    Apagar a origem não apaga a versão (on delete set null): a v2 continua existindo
--    mesmo se a pessoa jogar a v1 fora.
--
-- 2. IDEMPOTÊNCIA. A rota de gerar cria o job e debita em seguida. Dois cliques no mesmo
--    botão, ou um retry do navegador, eram dois jobs e dois débitos. A chave vem do
--    cliente, uma por clique; o índice único faz o segundo insert falhar, e a rota devolve
--    o job que já existe em vez de cobrar de novo.

alter table public.jobs add column if not exists origem_job_id uuid references public.jobs(id) on delete set null;
alter table public.jobs add column if not exists chave_idempotencia text;

create index if not exists jobs_origem_job_id_idx on public.jobs(origem_job_id);
create unique index if not exists jobs_chave_idempotencia_idx on public.jobs(user_id, chave_idempotencia) where chave_idempotencia is not null;

comment on column public.jobs.origem_job_id is 'Job do qual este foi refinado. Null = gerado a partir da foto enviada.';
comment on column public.jobs.chave_idempotencia is 'Uma por clique, gerada no navegador. Impede que um retry vire segundo débito.';
